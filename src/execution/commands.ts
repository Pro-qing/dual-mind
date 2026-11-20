import { OperationError } from '../shared/errors';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import type { PresetCommand } from '../shared/execution';
export class CommandShutdownError extends OperationError {
  constructor() {
    super('commandShutdown');
  }
}
export interface CheckResult {
  id: string;
  name: string;
  ok: boolean;
  exitCode: number;
  output: string;
  reason?: string;
}
export interface CommandRunner {
  run(
    command: PresetCommand,
    directory: string,
    signal: AbortSignal,
    output?: (text: string) => void,
  ): Promise<CheckResult>;
}

function signalGroup(pid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    throw new CommandShutdownError();
  }
}

async function groupAlive(pid: number): Promise<boolean> {
  if (!signalGroup(pid, 0)) {
    return false;
  }
  // Orphaned zombies may await reaping by PID 1. They cannot execute or change artifacts.
  // Check the entire group, including descendants that closed their inherited output pipes.
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    try {
      const stat = await readFile(`/proc/${entry}/stat`, 'utf8');
      const [state, , group] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(group) === pid && state !== 'Z' && state !== 'X') {
        return true;
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code || '')) {
        throw new CommandShutdownError();
      }
    }
  }
  return false;
}

function launchError(error: unknown, command: PresetCommand) {
  const code = (error as NodeJS.ErrnoException).code;
  return new OperationError(
    code === 'ENOENT'
      ? 'commandNotFound'
      : code === 'EACCES' || code === 'EPERM'
        ? 'commandPermissionDenied'
        : 'commandStartFailed',
    { name: command.name, program: command.program },
    error instanceof Error ? error.message : String(error),
  );
}

export class LocalCommands implements CommandRunner {
  async run(
    command: PresetCommand,
    directory: string,
    signal: AbortSignal,
    output?: (text: string) => void,
  ): Promise<CheckResult> {
    if (signal.aborted) {
      throw new OperationError('executionStopped');
    }
    if (process.platform !== 'linux') {
      throw new OperationError('commandPlatformUnsupported');
    }
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'XDG_CACHE_HOME', 'NVM_DIR'].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]]] : [],
      ),
    );
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(command.program, command.args, {
          cwd: directory,
          env,
          shell: false,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(launchError(error, command));
        return;
      }
      let text = '',
        bytes = 0,
        reason: string | undefined;
      let closed = false,
        settled = false;
      let exitCode: number | null = null;
      let started!: (value: boolean) => void;
      const spawned = new Promise<boolean>((resolve) => {
        started = resolve;
      });
      let stopping: Promise<void> | undefined;
      const finish = (error?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) {
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          reject(error);
        } else {
          resolve({
            id: command.id,
            name: command.name,
            ok: exitCode === 0 && !reason,
            exitCode: exitCode ?? -1,
            output: text,
            ...(reason ? { reason } : {}),
          });
        }
      };
      const stop = () => {
        if (settled || stopping) {
          return;
        }
        stopping = (async () => {
          if (!(await spawned) || !child.pid) {
            return;
          }
          const start = Date.now();
          signalGroup(child.pid, 'SIGTERM');
          let forced = false;
          while (Date.now() - start < 10000) {
            if (Date.now() - start >= 3000 && !forced) {
              signalGroup(child.pid, 'SIGKILL');
              forced = true;
            }
            if (!(await groupAlive(child.pid)) && closed) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          throw new CommandShutdownError();
        })();
        void stopping.then(
          () => finish(),
          () => finish(new CommandShutdownError()),
        );
      };
      const abort = () => {
        reason ||= 'stopped';
        stop();
      };
      const timer = setTimeout(() => {
        reason ||= 'timeout';
        stop();
      }, command.timeoutSeconds * 1000);
      child.once('spawn', () => started(true));
      child.once('error', (error) => {
        started(false);
        finish(launchError(error, command));
      });
      child.once('exit', (code) => {
        exitCode = code;
        // A successful parent can leave children running with closed or inherited pipes.
        stop();
      });
      child.once('close', (code) => {
        exitCode = code;
        closed = true;
        stop();
      });
      const collect = (chunk: Buffer) => {
        if (settled || reason === 'outputLimit') {
          return;
        }
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) {
          reason ||= 'outputLimit';
          stop();
          return;
        }
        const next = chunk.toString('utf8');
        text += next;
        output?.(next);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
      }
    });
  }
}
