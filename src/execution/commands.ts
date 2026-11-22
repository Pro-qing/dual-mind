import { processIdentity, type ProcessIdentity } from './processTree';
import { OperationError } from '../shared/errors';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { ExecutableCommand, PresetCommand } from '../shared/execution';
import { ProcessTree, CommandShutdownError } from './processTree';
import { shellInvocation } from './shell';
export { CommandShutdownError } from './processTree';
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
    command: ExecutableCommand,
    directory: string,
    signal: AbortSignal,
    output?: (text: string) => void,
    environment?: Record<string, string>,
    onProcess?: (identity: ProcessIdentity) => Promise<void>,
  ): Promise<CheckResult>;
}
export function baseEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
export class LocalCommands implements CommandRunner {
  async run(
    command: ExecutableCommand,
    directory: string,
    signal: AbortSignal,
    output?: (text: string) => void,
    environment?: Record<string, string>,
    onProcess?: (identity: ProcessIdentity) => Promise<void>,
  ): Promise<CheckResult> {
    if ('command' in command && command.shell.kind === 'cmd') {
      const temporary = await mkdtemp(join(tmpdir(), 'dualmind-command-'));
      try {
        const file = join(temporary, 'run.cmd');
        await writeFile(
          file,
          `@echo off\r\nchcp 65001 >nul\r\n${command.command}\r\nexit /b %errorlevel%\r\n`,
          { mode: 0o600 },
        );
        return await runProcess(
          { ...command, program: command.shell.program, args: ['/d', '/s', '/c', `""${file}""`] },
          directory,
          signal,
          {
            env: environment ?? baseEnvironment(),
            output,
            windowsVerbatimArguments: true,
            onProcess,
          },
        );
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
    return runProcess(
      'command' in command
        ? { ...command, ...shellInvocation(command.shell, command.command) }
        : command,
      directory,
      signal,
      { env: environment ?? baseEnvironment(), output, onProcess },
    );
  }
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
/** Presets use literal argv; only shellInvocation interprets a model command. */
export async function runProcess(
  command: PresetCommand,
  directory: string,
  signal: AbortSignal,
  options: {
    env: Record<string, string>;
    output?: (text: string) => void;
    windowsVerbatimArguments?: boolean;
    onProcess?: (identity: ProcessIdentity) => Promise<void>;
  },
): Promise<CheckResult> {
  if (signal.aborted) {
    throw new OperationError('executionStopped');
  }
  if (!['linux', 'darwin', 'win32'].includes(process.platform)) {
    throw new OperationError('commandPlatformUnsupported');
  }
  const since = Date.now();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command.program, command.args, {
        cwd: directory,
        env: options.env,
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
        windowsVerbatimArguments: options.windowsVerbatimArguments,
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
      settled = false,
      exitCode: number | null = null;
    let tree: ProcessTree | undefined;
    let started!: (value: boolean) => void;
    const spawned = new Promise<boolean>((resolve) => {
      started = resolve;
    });
    let stopping: Promise<void> | undefined;
    let identitySaved: Promise<void> = Promise.resolve();
    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      tree?.dispose();
      signal.removeEventListener('abort', abort);
      if (error) {
        child.stdout!.destroy();
        child.stderr!.destroy();
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
        if (await spawned) {
          await tree!.stop(() => closed);
          await identitySaved;
        }
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
    child.once('spawn', () => {
      tree = new ProcessTree(child.pid!, since);
      if (options.onProcess) {
        identitySaved = processIdentity(child.pid!).then(async (identity) => {
          if (identity) {
            await options.onProcess!(identity);
          }
        });
        void identitySaved.catch(() => {
          reason ||= 'persistence';
          stop();
        });
      }
      started(true);
    });
    child.once('error', (error) => {
      started(false);
      finish(launchError(error, command));
    });
    child.once('exit', (code) => {
      exitCode = code;
      stop();
    });
    child.once('close', (code) => {
      exitCode = code;
      closed = true;
      stop();
    });
    const collect = (next: string) => {
      text += next;
      options.output?.(next);
    };
    // Independent decoders preserve UTF-8 characters split across pipe chunks.
    for (const stream of [child.stdout!, child.stderr!]) {
      const decoder = new StringDecoder('utf8');
      stream.on('data', (chunk: Buffer) => {
        if (settled || reason === 'outputLimit') {
          return;
        }
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) {
          reason ||= 'outputLimit';
          stop();
          return;
        }
        collect(decoder.write(chunk));
      });
      stream.on('end', () => {
        if (!settled && reason !== 'outputLimit') {
          collect(decoder.end());
        }
      });
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}
