import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type {
  PythonCandidate,
  PythonDiscoverySummary,
  PythonInterpreter,
} from '../shared/environment';
import { OperationError } from '../shared/errors';
import { CommandShutdownError, runProcess } from './commands';
import type { ProcessIdentity } from './processTree';

export interface PythonProbeOperation {
  onProcess(identity: ProcessIdentity): Promise<void>;
  finish(result: PythonInterpreter, fatal?: unknown): Promise<void>;
}
export interface PythonProbeObserver {
  check(): Promise<void>;
  start(candidate: PythonCandidate): Promise<PythonProbeOperation>;
}
const names = ['python3', 'python2', 'python', 'python2.7'];
const maximumCandidates = 8;

/** Candidate paths are invocation paths: realpath would collapse distinct virtual environments. */
export class PythonDiscovery {
  constructor(
    private readonly runner = runProcess,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly now = () => performance.now(),
  ) {}
  async discover(
    directory: string,
    env: Record<string, string>,
    signal: AbortSignal,
    observer?: PythonProbeObserver,
  ): Promise<PythonDiscoverySummary> {
    const started = this.now();
    const result: PythonDiscoverySummary = { complete: true, interpreters: [] };
    const windows = this.platform === 'win32';
    const paths = windows ? path.win32 : path.posix;
    const value = (name: string) =>
      Object.entries(env).find(([key]) =>
        windows ? key.toUpperCase() === name : key === name,
      )?.[1];
    const candidates: PythonCandidate[] = [];
    const seen = new Set<string>();
    const stopped = () => {
      if (signal.aborted) {
        throw new OperationError('executionStopped');
      }
    };
    const exhausted = () => this.now() - started >= 8000;
    const add = (candidate: PythonCandidate) => {
      const key = windows ? candidate.path.toLowerCase() : candidate.path;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(candidate);
      }
    };
    const exists = async (candidate: string) => {
      stopped();
      if (exhausted()) {
        result.complete = false;
        return false;
      }
      try {
        const info = await lstat(candidate);
        return info.isFile() || info.isSymbolicLink();
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code === 'EACCES' || code === 'EPERM';
      }
    };
    const environment = async (
      root: string | undefined,
      source: PythonCandidate['source'],
      label: string,
    ) => {
      if (!root || root.includes('\0') || !paths.isAbsolute(root)) {
        return;
      }
      const entries = windows
        ? ['Scripts/python.exe', 'python.exe', 'Scripts/python3.exe', 'Scripts/python2.exe']
        : ['bin/python', 'bin/python3', 'bin/python2', 'bin/python2.7'];
      for (const entry of entries) {
        const executable = paths.join(root, entry);
        if (await exists(executable)) {
          add({ path: executable, source, label });
          break;
        }
      }
    };
    await observer?.check();
    await environment(paths.join(directory, '.venv'), 'project', '.venv');
    await environment(paths.join(directory, 'venv'), 'project', 'venv');
    await environment(value('VIRTUAL_ENV'), 'virtualenv', 'VIRTUAL_ENV');
    await environment(value('CONDA_PREFIX'), 'conda', 'CONDA_PREFIX');
    const directories = (value('PATH') ?? '').split(paths.delimiter);
    // Missing PATH has no advertised interpreter; an explicit empty entry follows shell cwd semantics.
    if (value('PATH') !== undefined) {
      for (const name of names) {
        for (const entry of directories) {
          if (entry.includes('\0')) {
            continue;
          }
          const executable = paths.resolve(directory, entry, name + (windows ? '.exe' : ''));
          if (await exists(executable)) {
            add({ path: executable, source: 'path', label: name });
            break;
          }
          if (exhausted()) {
            break;
          }
        }
      }
    }
    for (const candidate of candidates.slice(0, maximumCandidates)) {
      stopped();
      await observer?.check();
      let remaining = 8000 - (this.now() - started);
      if (remaining <= 0) {
        result.complete = false;
        result.interpreters.push({ ...candidate, status: 'skipped', reason: 'budget' });
        continue;
      }
      const operation = await observer?.start(candidate);
      const interpreter: PythonInterpreter = { ...candidate, status: 'unavailable' };
      let fatal: unknown;
      try {
        stopped();
        remaining = 8000 - (this.now() - started);
        if (remaining <= 0) {
          interpreter.status = 'skipped';
          interpreter.reason = 'budget';
          result.complete = false;
        } else {
          const token = randomUUID();
          const script = `import sys\nsys.path = [p for p in sys.path if p]\nimport json\nsys.stdout.write('${token}' + json.dumps({'version': list(sys.version_info[:3]), 'executable': sys.executable, 'implementation': getattr(getattr(sys, 'implementation', None), 'name', 'pypy' if hasattr(sys, 'pypy_version_info') else 'cpython')}, ensure_ascii=True) + '${token}')`;
          const reply = await this.runner(
            {
              id: token,
              name: 'Discover local Python',
              program: candidate.path,
              args: ['-E', '-s', '-S', '-B', '-c', script],
              timeoutSeconds: Math.min(2000, remaining) / 1000,
            },
            directory,
            signal,
            { env, maxOutputBytes: 4096, onProcess: operation?.onProcess },
          );
          stopped();
          if (reply.reason === 'persistence') {
            throw new OperationError('persistenceFailed');
          }
          if (!reply.ok) {
            interpreter.reason =
              reply.reason === 'timeout'
                ? 'timeout'
                : reply.reason === 'outputLimit'
                  ? 'outputLimit'
                  : 'probeFailed';
          } else {
            const output = reply.stdout ?? reply.output;
            const parts = output.split(token);
            const parsed: unknown = parts.length === 3 ? JSON.parse(parts[1]) : undefined;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new InvalidPythonReply();
            }
            const { version, executable, implementation } = parsed as Record<string, unknown>;
            if (
              !Array.isArray(version) ||
              version.length !== 3 ||
              !version.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000) ||
              typeof executable !== 'string' ||
              executable.length > 4096 ||
              executable.includes('\0') ||
              !paths.isAbsolute(executable) ||
              typeof implementation !== 'string' ||
              !/^[a-zA-Z0-9_.-]{1,64}$/.test(implementation)
            ) {
              throw new InvalidPythonReply();
            }
            if (!(version[0] === 3 || (version[0] === 2 && version[1] >= 7))) {
              interpreter.reason = 'unsupportedVersion';
            } else {
              Object.assign(interpreter, {
                status: 'available',
                major: version[0],
                version: version.join('.'),
                implementation,
                executable,
              });
            }
          }
        }
      } catch (error) {
        if (signal.aborted || error instanceof CommandShutdownError) {
          fatal =
            error instanceof CommandShutdownError ? error : new OperationError('executionStopped');
        } else if (error instanceof InvalidPythonReply || error instanceof SyntaxError) {
          interpreter.reason = 'invalidResponse';
        } else if (
          error instanceof OperationError &&
          ['commandNotFound', 'commandPermissionDenied', 'commandStartFailed'].includes(error.code)
        ) {
          interpreter.reason =
            error.code === 'commandNotFound'
              ? 'missing'
              : error.code === 'commandPermissionDenied'
                ? 'permission'
                : 'startFailed';
        } else {
          fatal = error;
        }
      }
      await operation?.finish(interpreter, fatal);
      if (fatal) {
        throw fatal;
      }
      await observer?.check();
      stopped();
      result.interpreters.push(interpreter);
    }
    stopped();
    await observer?.check();
    if (candidates.length > maximumCandidates || exhausted()) {
      result.complete = false;
    }
    return result;
  }
}
class InvalidPythonReply extends Error {}

export const pythonGuidance = `Local Python discovery is a preparation-time snapshot, not a guarantee of current dependencies. No Python runtime is bundled or installed by DualMind. Choose a verified invocation path compatible with the project: prefer the task's project environment, then an activated environment, then PATH. For general information-processing scripts prefer Python 3; use Python 2 only when the script/project explicitly requires it. Never infer the major version from the name python. Preserve the listed invocation path (including virtualenv symlinks) and quote it for the current shell. Use that same interpreter for dependency checks and -m pip; availability does not imply third-party packages are installed. Keep any dependency installation within an appropriate project environment; never change the global environment or install a system interpreter. Do not automatically switch interpreters or Python major versions and rerun a failed command. A new/changed environment or explicitly supplied interpreter may be checked through run_command; the snapshot is not exhaustive and does not automatically refresh during the run. Worktree discovery does not search the original checkout's virtualenv. If Python is unavailable, report it when needed or use other existing tools; tasks without Python can continue.`;
