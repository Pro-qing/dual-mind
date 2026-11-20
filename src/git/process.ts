import { OperationError } from '../shared/errors';
import { spawn } from 'node:child_process';
import { getGitVersionError } from '../../scripts/check-git.cjs';

export type GitErrorCode =
  | 'gitUnavailable'
  | 'gitVersion'
  | 'gitFailed'
  | 'gitTimeout'
  | 'outputTooLarge'
  | 'workspaceUntrusted'
  | 'workspaceUnsupported'
  | 'taskNotFound'
  | 'notRepository'
  | 'noCommit'
  | 'detachedHead'
  | 'submodulesUnsupported'
  | 'dirtyRepository'
  | 'workspaceConflict'
  | 'workspaceChanged'
  | 'invalidPath'
  | 'accessDenied'
  | 'storageFailed';
export class GitTaskError extends OperationError {
  constructor(
    public readonly code: GitErrorCode,
    message: string,
  ) {
    super(code, undefined, message);
  }
}
export interface GitResult {
  code: number;
  stdout: string;
}

/** Host-only process adapter. Never expose arbitrary commands to role tools or the Webview. */
export class GitProcess {
  constructor(
    private readonly options: {
      executable?: string;
      timeoutMs?: number;
      maxBytes?: number;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) {}
  async version(): Promise<string> {
    const result = await this.run(['--version']);
    const error = getGitVersionError(result.stdout.trim());
    if (result.code || error) {
      throw new GitTaskError('gitVersion', error || 'Cannot verify Git version.');
    }
    return result.stdout.trim();
  }
  async run(args: readonly string[], cwd?: string): Promise<GitResult> {
    const overrides: string[] = [];
    if (cwd && args[0] !== 'config') {
      // Checkout, status and diff can invoke clean/smudge/process filters too.
      // Discover names without running repository code, then override every configured filter.
      const config = await this.execute(
        [
          'config',
          '--null',
          '--name-only',
          '--get-regexp',
          '^filter\\..*\\.(clean|smudge|process|required)$',
        ],
        cwd,
      );
      if (config.code !== 0 && config.code !== 1) {
        throw new GitTaskError('gitFailed', 'Cannot inspect Git content filters.');
      }
      for (const key of new Set(config.stdout.split('\0').filter(Boolean))) {
        if (!/^filter\..*\.(clean|smudge|process|required)$/.test(key) || key.includes('=')) {
          throw new GitTaskError('gitFailed', 'Cannot safely disable a Git content filter.');
        }
        overrides.push('-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`);
      }
    }
    return this.execute([...overrides, ...args], cwd);
  }
  private execute(args: readonly string[], cwd?: string): Promise<GitResult> {
    const env = { ...process.env, ...this.options.env };
    // A terminal's Git environment must not redirect commands to another repository/index.
    for (const key of Object.keys(env)) {
      if (
        key.startsWith('GIT_') &&
        !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'].includes(key)
      ) {
        delete env[key];
      }
    }
    Object.assign(env, {
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_PAGER: 'cat',
      LC_ALL: 'C',
    });
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.options.executable || 'git',
        [
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'core.fsmonitor=false',
          '-c',
          'diff.external=',
          '-c',
          'submodule.recurse=false',
          ...args,
        ],
        {
          cwd,
          env,
          shell: false,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const buffers: Buffer[] = [];
      let bytes = 0;
      let failure: GitTaskError | undefined;
      const kill = () => {
        try {
          if (process.platform !== 'win32' && child.pid) {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          /* The process may have exited before its pipes closed. */
        }
      };
      const timer = setTimeout(() => {
        failure = new GitTaskError(
          'gitTimeout',
          'Git operation timed out; inspect the task workspace before retrying.',
        );
        kill();
      }, this.options.timeoutMs ?? 20_000);
      const collect = (data: Buffer, stdout: boolean) => {
        bytes += data.length;
        if (bytes > (this.options.maxBytes ?? 2 * 1024 * 1024)) {
          failure ||= new GitTaskError(
            'outputTooLarge',
            'Git output exceeds the size limit; no partial result was returned.',
          );
          kill();
        } else if (stdout && !failure) {
          buffers.push(data);
        }
      };
      child.stdout.on('data', (data: Buffer) => collect(data, true));
      child.stderr.on('data', (data: Buffer) => collect(data, false));
      child.on('error', () => {
        clearTimeout(timer);
        reject(
          new GitTaskError(
            'gitUnavailable',
            'Git is unavailable. Install Git 2.25+ on PATH and retry.',
          ),
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failure) {
          reject(failure);
        } else {
          resolve({ code: code ?? -1, stdout: Buffer.concat(buffers).toString('utf8') });
        }
      });
    });
  }
  async checked(args: readonly string[], cwd: string): Promise<string> {
    const result = await this.run(args, cwd);
    if (result.code) {
      throw new GitTaskError(
        'gitFailed',
        `Git ${args[0]} failed in ${cwd}; inspect repository state and retry.`,
      );
    }
    return result.stdout;
  }
}
