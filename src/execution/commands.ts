import { OperationError } from '../shared/errors';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
  available(signal: AbortSignal): Promise<void>;
  run(
    command: PresetCommand,
    directory: string,
    signal: AbortSignal,
    output?: (text: string) => void,
  ): Promise<CheckResult>;
}
export class SystemdCommands implements CommandRunner {
  async available(signal: AbortSignal): Promise<void> {
    if (process.platform !== 'linux') {
      throw new OperationError('systemdRequired');
    }
    const probe = `const fs=require('node:fs');const c=fs.readFileSync('/proc/self/cgroup','utf8').split('\\n').find(x=>x.startsWith('0::'));if(!c)process.exit(1);const p='/sys/fs/cgroup'+c.slice(3);if(fs.readFileSync(p+'/memory.max','utf8').trim()!=='1073741824'||fs.readFileSync(p+'/memory.swap.max','utf8').trim()!=='0')process.exit(1);`;
    const check = await this.run(
      {
        id: 'probe',
        name: 'Resource limits',
        program: '/usr/bin/env',
        args: ['ELECTRON_RUN_AS_NODE=1', process.execPath, '-e', probe],
        timeoutSeconds: 10,
      },
      process.cwd(),
      signal,
    );
    if (!check.ok) {
      throw new OperationError('systemdLimits');
    }
  }
  async run(
    command: PresetCommand,
    directory: string,
    signal: AbortSignal,
    output?: (text: string) => void,
  ): Promise<CheckResult> {
    if (signal.aborted) {
      throw new OperationError('executionStopped');
    }
    const unit = `dualmind-run-${randomUUID()}`;
    // Keep test commands inside their enclosing bounded slice; production inherits app.slice.
    const cgroup = await readFile('/proc/self/cgroup', 'utf8');
    const slice = cgroup
      .split('/')
      .filter((part) => part.endsWith('.slice'))
      .at(-1);
    const environment = [
      'PATH',
      'HOME',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'XDG_CACHE_HOME',
      'NVM_DIR',
    ].flatMap((key) => (process.env[key] ? [`${key}=${process.env[key]}`] : []));
    if (signal.aborted) {
      throw new OperationError('executionStopped');
    }
    return new Promise((resolve, reject) => {
      const child = spawn(
        'systemd-run',
        [
          '--user',
          '--quiet',
          '--pipe',
          '--wait',
          '--collect',
          '--service-type=exec',
          `--unit=${unit}`,
          ...(slice ? [`--slice=${slice}`] : []),
          `--working-directory=${directory}`,
          '-p',
          'MemoryMax=1G',
          '-p',
          'MemorySwapMax=0',
          '-p',
          `RuntimeMaxSec=${command.timeoutSeconds}s`,
          '-p',
          'TimeoutStopSec=3s',
          '-p',
          'KillMode=control-group',
          '-p',
          'TasksMax=128',
          '-p',
          'LimitCORE=0',
          '--',
          '/usr/bin/env',
          '-i',
          ...environment,
          command.program,
          ...command.args,
        ],
        { shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let text = '',
        bytes = 0,
        reason: string | undefined;
      let stopping: Promise<void> | undefined;
      const stop = () => {
        stopping ||= (async () => {
          const deadline = Date.now() + 10000;
          // An abort can arrive before systemd-run has registered its service.
          // Retry until the unit exists or the launcher has confirmed exit.
          do {
            const code = await new Promise<number>((resolve) => {
              const control = spawn('systemctl', ['--user', 'stop', `${unit}.service`], {
                stdio: 'ignore',
                shell: false,
              });
              const killTimer = setTimeout(() => {
                control.kill('SIGKILL');
              }, 2000);
              control.on('error', () => {
                clearTimeout(killTimer);
                resolve(-1);
              });
              control.on('close', (status) => {
                clearTimeout(killTimer);
                resolve(status ?? -1);
              });
            });
            if (code === 0 || child.exitCode !== null) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          } while (Date.now() < deadline);
          throw new CommandShutdownError();
        })();
        void stopping.catch(() => undefined);
      };
      const abort = () => {
        reason = 'stopped';
        stop();
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
      }
      const timer = setTimeout(
        () => {
          reason = 'timeout';
          stop();
        },
        command.timeoutSeconds * 1000 + 500,
      );
      const collect = (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) {
          reason = 'outputLimit';
          stop();
          return;
        }
        const next = chunk.toString('utf8');
        text += next;
        output?.(next);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new OperationError('systemdUnavailable'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        void (async () => {
          if (stopping) {
            await stopping;
          }
          resolve({
            id: command.id,
            name: command.name,
            ok: code === 0 && !reason,
            exitCode: code ?? -1,
            output: text,
            ...(reason ? { reason } : {}),
          });
        })().catch(reject);
      });
    });
  }
}
