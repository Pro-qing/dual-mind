import type { ProcessIdentity } from './processTree';
import { randomUUID } from 'node:crypto';
import { OperationError } from '../shared/errors';
import type { ResolvedExecutionEnvironment } from '../shared/environment';
import { baseEnvironment, CommandShutdownError, runProcess } from './commands';
import { selectShell, shellInvocation } from './shell';

/** One environment snapshot per run; no language-specific discovery or activation. */
export class ProjectEnvironment {
  private readonly host: Record<string, string>;
  private readonly secrets = new Set<string>();
  private cached?: Promise<ResolvedExecutionEnvironment>;
  constructor(
    host: NodeJS.ProcessEnv = process.env,
    private readonly probeTimeoutSeconds = 5,
    private readonly probe = runProcess,
    private readonly chooseShell = selectShell,
    private readonly onProcess?: (identity: ProcessIdentity) => Promise<void>,
  ) {
    this.host = baseEnvironment(host);
    this.rememberSecrets(this.host);
  }
  private rememberSecrets(env: Record<string, string>) {
    for (const [key, value] of Object.entries(env)) {
      if (value && /key|token|secret|password|passwd|credential|auth|cookie/i.test(key)) {
        this.secrets.add(value);
      }
    }
  }
  redactionValues() {
    return [...this.secrets];
  }
  resolve(directory: string, signal: AbortSignal): Promise<ResolvedExecutionEnvironment> {
    if (signal.aborted) {
      return Promise.reject(new OperationError('executionStopped'));
    }
    this.cached ??= this.capture(directory, signal);
    return this.cached;
  }
  private async capture(
    directory: string,
    signal: AbortSignal,
  ): Promise<ResolvedExecutionEnvironment> {
    const shell = await this.chooseShell(this.host);
    const summary: ResolvedExecutionEnvironment['summary'] = {
      platform: process.platform,
      shell,
      source: 'host',
    };
    let env = { ...this.host };
    if (shell.kind !== 'cmd') {
      const begin = `__dualmind_${randomUUID()}_begin__`,
        end = `__dualmind_${randomUUID()}_end__`;
      const command =
        shell.kind === 'powershell'
          ? `[Console]::Write('${begin}'); [Console]::Write(([Environment]::GetEnvironmentVariables('Process') | ConvertTo-Json -Compress)); [Console]::Write('${end}')`
          : `printf '${begin}'; /usr/bin/env -0; printf '${end}'`;
      try {
        const result = await this.probe(
          {
            id: 'environment',
            name: 'Login environment',
            ...shellInvocation(shell, command, true),
            timeoutSeconds: this.probeTimeoutSeconds,
          },
          directory,
          signal,
          { env, onProcess: this.onProcess },
        );
        if (signal.aborted) {
          throw new OperationError('executionStopped');
        }
        const start = result.output.indexOf(begin),
          finish = result.output.indexOf(end, start + begin.length);
        if (!result.ok || start < 0 || finish < 0) {
          throw new Error(result.reason || 'profile failed');
        }
        const data = result.output.slice(start + begin.length, finish);
        const parsed: unknown =
          shell.kind === 'powershell'
            ? JSON.parse(data)
            : Object.fromEntries(
                data
                  .split('\0')
                  .filter((item) => item.includes('='))
                  .map((item) => [
                    item.slice(0, item.indexOf('=')),
                    item.slice(item.indexOf('=') + 1),
                  ]),
              );
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed) ||
          Object.entries(parsed).some(
            ([key, value]) =>
              !key ||
              key.includes('=') ||
              key.includes('\0') ||
              typeof value !== 'string' ||
              value.includes('\0'),
          )
        ) {
          throw new Error('invalid profile output');
        }
        env = parsed as Record<string, string>;
        // Windows environment names are case-insensitive; the captured block is authoritative.
        this.rememberSecrets(env);
        summary.source = 'login';
      } catch (error) {
        if (error instanceof CommandShutdownError) {
          throw error;
        }
        if (signal.aborted) {
          throw new OperationError('executionStopped');
        }
        // Never persist profile output or errors: either can contain raw credentials.
        summary.warning =
          'Login environment unavailable or timed out; using the extension host environment. Initialize required tools in the command itself.';
      }
    }
    // Avoid re-running startup hooks in every fresh command shell.
    for (const key of Object.keys(env)) {
      if (/^(BASH_ENV|ENV|SHELLOPTS|BASHOPTS|BASH_FUNC_.*)$/i.test(key)) {
        delete env[key];
      }
    }
    return { env, summary };
  }
}
