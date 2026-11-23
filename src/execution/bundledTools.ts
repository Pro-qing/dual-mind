import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import manifest from '../../resources/tools/manifest.json';
import type { BundledToolStatus } from '../shared/environment';
import { OperationError } from '../shared/errors';

/** Only task subprocesses receive these fallback directories. No runtime downloads. */
export class BundledTools {
  constructor(
    private readonly directory?: string,
    private readonly platform: string = process.platform,
    private readonly arch: string = process.arch,
  ) {}
  async apply(environment: Record<string, string>, signal: AbortSignal) {
    const env = { ...environment };
    const tools: BundledToolStatus[] = [];
    const directories: string[] = [];
    for (const tool of manifest.tools) {
      if (signal.aborted) {
        throw new OperationError('executionStopped');
      }
      const status: BundledToolStatus = {
        name: tool.name as BundledToolStatus['name'],
        version: tool.version,
        status: 'unavailable',
      };
      tools.push(status);
      if (this.platform !== 'linux' || this.arch !== 'x64') {
        status.reason = 'unsupportedPlatform';
        continue;
      }
      if (!this.directory) {
        status.reason = 'unconfigured';
        continue;
      }
      const file = tool.files.find((entry) => entry.executable)!;
      const target = path.join(this.directory, file.path);
      try {
        const info = await lstat(target),
          root = await realpath(this.directory);
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          info.size !== file.bytes ||
          !(await realpath(target)).startsWith(root + path.sep)
        ) {
          status.reason = 'integrity';
          continue;
        }
        const bytes = await readFile(target);
        if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
          status.reason = 'integrity';
          continue;
        }
        if (
          bytes.length < 64 ||
          bytes.subarray(0, 6).toString('hex') !== '7f454c460201' ||
          bytes.readUInt16LE(18) !== 62
        ) {
          status.reason = 'architecture';
          continue;
        }
        if (!(info.mode & 0o111)) {
          status.reason = 'permission';
          continue;
        }
        await access(target, constants.X_OK);
        status.status = 'available';
        directories.push(path.dirname(target));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        status.reason =
          code === 'ENOENT'
            ? 'missing'
            : code === 'EACCES' || code === 'EPERM'
              ? 'permission'
              : 'unreadable';
      }
    }
    if (signal.aborted) {
      throw new OperationError('executionStopped');
    }
    if (directories.length) {
      // Keep an explicitly empty entry (cwd). For an absent PATH retain standard Linux tools.
      const original = env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
      const existing = original.split(':');
      env.PATH = [
        ...existing,
        ...directories.filter((directory) => !existing.includes(directory)),
      ].join(':');
    }
    return { env, tools };
  }
}

export const bundledToolGuidance = `Bundled tool metadata describes fallback availability and bundled versions, not the version selected from the system PATH. System commands have priority. Use available rg for scoped text search, fd for file discovery, and jq for JSON; prefer rg --threads 2 and fd --threads 2 and narrow directories/globs. Do not install these tools or retry a failed system command with another version automatically. rg exit 1 means no matches, while other nonzero exits are errors. When an exploratory search explicitly permits no matches, use a standalone bash/zsh/sh command such as (use equivalent syntax for other shells): rg --threads 2 -- 'pattern' src; search_status=$?; if [ "$search_status" -eq 1 ]; then printf 'No matches\\n'; elif [ "$search_status" -ne 0 ]; then exit "$search_status"; fi. Do not use unconditional || true or apply this normalization to verification, jq -e, or other commands. Raw command exit codes retain their existing failure semantics.`;
