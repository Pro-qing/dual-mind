import { type PythonProbeObserver } from './python';
import { fatalToolFault } from './toolOutcomes';
import { type RecoveryOperation } from './recovery';
import { OperationError, type AppError } from '../shared/errors';
import { type AgentPhase } from './contracts';
import { randomUUID } from 'node:crypto';
import type { TaskReader } from '../git/taskWorkspaces';
import { type Agent, type CommandEvidence } from '../shared/execution';
import { CommandShutdownError } from './commands';
import type { ExecutableCommand } from '../shared/execution';
import type { ExecutionRuntime } from './runtime';
import type { Active } from './runtimeTypes';
export async function check(
  this: ExecutionRuntime,
  a: Active,
  command: ExecutableCommand,
  phase: AgentPhase | 'preparing' | 'checking',
  options: {
    cwd?: string;
    purpose?: CommandEvidence['purpose'];
    criterionIds?: string[];
    presetId?: string;
  } = {},
): Promise<CommandEvidence & { output: string }> {
  a.recovery.phase = phase;
  a.recovery.agent = ['planning', 'answering', 'reviewer'].includes(phase)
    ? 'reviewer'
    : phase === 'worker'
      ? 'worker'
      : undefined;
  a.summary.recovery = { ...this.recoverySummary(a.recovery), operation: 'run_command' };
  await this.boundary(a, phase);
  const cwd = options.cwd ?? '.';
  await a.reader!.commandDirectory(cwd);
  let before = await a.reader!.fingerprint();
  // A completed preset at this cursor is reused; an uncertain one is returned as failed evidence.
  const previous = options.presetId
    ? [...a.operations.values()].reverse().find((op) => {
        const args = op.args as
          { presetId?: string; round?: number; index?: number; planVersion?: number } | undefined;
        return (
          op.kind === 'command' &&
          op.phase === phase &&
          args?.presetId === options.presetId &&
          args?.round === a.summary.round &&
          args?.index === a.recovery.cursor.index &&
          args?.planVersion === a.summary.plan?.version
        );
      })
    : undefined;
  if (
    previous &&
    (previous.status === 'succeeded' || previous.status === 'failed') &&
    previous.generation < a.generation
  ) {
    const saved = previous.result as { evidence: CommandEvidence; output: string };
    if (saved?.evidence && (saved.evidence.ok || phase === 'checking')) {
      return { ...saved.evidence, output: saved.output.slice(0, 12000) };
    }
  }
  const id = randomUUID();
  const operation: RecoveryOperation = {
    ...(a.toolOperationId ? { parentOperationId: a.toolOperationId } : {}),
    ...this.newOperation(a, 'command', command.name, {
      command,
      ...options,
      before,
      round: a.summary.round,
      index: a.recovery.cursor.index,
      planVersion: a.summary.plan?.version,
    }),
    id,
  };
  await this.operation(a, operation);
  await this.persist(a);
  await this.emit(
    a,
    'check',
    `▶ ${command.name}`,
    ['planning', 'answering', 'reviewer'].includes(phase) ? 'reviewer' : 'worker',
  );
  let result: Pick<
    import('./commands').CheckResult,
    | 'ok'
    | 'exitCode'
    | 'output'
    | 'reason'
    | 'stdout'
    | 'stderr'
    | 'durationMs'
    | 'termination'
    | 'actualExitCode'
  >;
  let fault: AppError | undefined;
  const commandStarted = Date.now();
  let fatal: unknown;
  const agent: Agent = ['planning', 'answering', 'reviewer'].includes(phase)
    ? 'reviewer'
    : 'worker';
  try {
    await this.boundary(a, phase);
    const directory = await a.reader!.commandDirectory(cwd);
    before = await a.reader!.fingerprint();
    const environment = await a.environment.resolve(a.summary.directory!, a.controller.signal);
    await this.boundary(a, phase);
    await a.reader!.commandDirectory(cwd);
    const activity = this.beginActivity(a, {
      agent,
      phase,
      stage: 'command',
      commandId: id,
      label: command.name,
      requestId: a.activity?.requestId,
    });
    try {
      if (previous?.status === 'unknown' && previous.generation < a.generation) {
        result = {
          ok: false,
          exitCode: -1,
          output:
            'Previous command outcome is unknown. Inspect existing results before issuing a new command.',
          reason: 'interrupted',
        };
      } else {
        result = await this.commands.run(
          command,
          directory,
          a.controller.signal,
          undefined,
          {
            ...environment.env,
            PWD: directory,
          },
          async (identity) => {
            operation.process = identity;
            await this.operation(a, operation);
          },
        );
      }
    } finally {
      this.endActivity(a, activity);
    }
  } catch (error) {
    fault = this.cleanError(a, error);
    result = {
      ok: false,
      exitCode: -1,
      actualExitCode: null,
      output: '',
      stdout: '',
      stderr: '',
      durationMs: Date.now() - commandStarted,
      termination: operation.process ? 'unknown' : 'notStarted',
      reason: fault.code,
    };
    if (fatalToolFault(fault)) {
      fatal = error;
    }
    if (error instanceof CommandShutdownError) {
      this.shutdownUnconfirmed = true;
      fatal = error;
    }
  }
  if (!result.ok && !fault) {
    fault = this.cleanError(a, {
      code:
        result.reason === 'timeout'
          ? 'commandTimeout'
          : result.reason === 'outputLimit'
            ? 'commandOutputLimit'
            : result.reason === 'stopped'
              ? 'commandStopped'
              : result.reason === 'backgroundIncomplete'
                ? 'commandBackgroundIncomplete'
                : 'commandFailed',
      params: { name: command.name, exitCode: result.exitCode },
    });
  }
  let after = '';
  try {
    after = await a.reader!.fingerprint();
  } catch (error) {
    fatal = error;
  }
  // A credential split between stdout/stderr must not reappear when channels are viewed separately.
  // When merged output is sensitive, channel views are withheld; the redacted merged view remains.
  const sensitiveOutput = this.clean(a, result.output) !== result.output;
  const evidence = this.redact(a, {
    id,
    name: command.name,
    ...('command' in command
      ? {
          command: command.command,
          shell: command.shell,
          program: command.shell.program,
          args: [],
        }
      : { program: command.program, args: command.args }),
    agent,
    phase,
    cwd,
    timeoutSeconds: command.timeoutSeconds,
    purpose: options.purpose ?? 'verify',
    criterionIds: options.criterionIds ?? [],
    planVersion: a.summary.plan?.version ?? 0,
    round: a.summary.round,
    before,
    after,
    ok: result.ok && !fatal,
    exitCode: result.exitCode,
    ...(result.stdout === undefined
      ? {}
      : {
          stdout: sensitiveOutput
            ? '[redacted; see combined output]'
            : this.clean(a, result.stdout),
          stderr: sensitiveOutput
            ? '[redacted; see combined output]'
            : this.clean(a, result.stderr ?? ''),
        }),
    ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
    ...(result.termination === undefined
      ? {}
      : { termination: result.termination, actualExitCode: result.actualExitCode }),
    ...(a.toolOperationId ? { toolOperationId: a.toolOperationId } : {}),
    ...(options.presetId ? { presetId: options.presetId } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    ...(fault ? { fault } : {}),
  }) as CommandEvidence;
  const output = this.clean(a, result.output);
  a.evidence.set(id, evidence);
  a.outputs.set(id, output);
  if (!a.persistenceFailed) {
    await this.operation(a, {
      ...operation,
      status:
        fatal instanceof CommandShutdownError
          ? 'unknown'
          : result.reason === 'stopped'
            ? 'unknown'
            : evidence.ok
              ? 'succeeded'
              : 'failed',
      cleanup: fatal instanceof CommandShutdownError ? 'unconfirmed' : 'confirmed',
      result: { evidence, output },
    });
  }
  await this.emit(
    a,
    'check',
    `${command.name}: ${evidence.ok ? 'PASS' : 'FAIL'} (${result.exitCode})\n${result.reason || ''}\n${output}`,
    agent,
    undefined,
    fault,
    { type: 'command', command: evidence },
  );
  if (fatal) {
    throw fatal;
  }
  if (a.controller.signal.aborted) {
    throw new OperationError('executionStopped');
  }
  return {
    ...evidence,
    stdout: evidence.stdout?.slice(0, 6000),
    stderr: evidence.stderr?.slice(0, 6000),
    output: output.slice(0, 12000),
  };
}
export function fingerprint(this: ExecutionRuntime, reader: TaskReader): Promise<string> {
  return reader.fingerprint();
}
export function pythonObserver(this: ExecutionRuntime, a: Active): PythonProbeObserver {
  return {
    check: () => this.boundary(a, a.recovering ? 'recovering' : 'preparing'),
    start: async (candidate) => {
      await this.boundary(a, a.recovering ? 'recovering' : 'preparing');
      const operation = this.newOperation(a, 'environment', 'Discover local Python', candidate);
      await this.operation(a, operation);
      return {
        onProcess: async (identity) => {
          operation.process = identity;
          await this.operation(a, operation);
        },
        finish: async (result, fatal) => {
          const unknown = fatal instanceof CommandShutdownError;
          if (unknown) {
            // Retain the process lock even when a later journal write also fails.
            this.shutdownUnconfirmed = true;
            this.unconfirmedRuns.add(a.summary.id);
          }
          if (a.persistenceFailed) {
            throw new OperationError('persistenceFailed');
          }
          await this.operation(a, {
            ...operation,
            status: unknown
              ? 'unknown'
              : fatal
                ? a.controller.signal.aborted
                  ? 'cancelled'
                  : 'failed'
                : result.status === 'available'
                  ? 'succeeded'
                  : result.status === 'skipped'
                    ? 'skipped'
                    : 'failed',
            cleanup: unknown ? 'unconfirmed' : 'confirmed',
            // Retain only normalized identity/status. Never persist probe stdout/stderr.
            result: fatal
              ? {
                  ...(operation.args as object),
                  status: unknown
                    ? 'unknown'
                    : a.controller.signal.aborted
                      ? 'cancelled'
                      : 'unavailable',
                }
              : result,
          });
        },
      };
    },
  };
}
export async function tool(
  this: ExecutionRuntime,
  a: Active,
  agent: Agent,
  name: string,
  args: Record<string, unknown>,
  phase: AgentPhase,
): Promise<unknown> {
  const reader = a.reader!;
  if (
    agent !== 'worker' &&
    ['run_command', 'run_check', 'write_file', 'delete_file'].includes(name)
  ) {
    throw new OperationError('reviewerReadOnly');
  }
  switch (name) {
    case 'list_files': {
      const files = await reader.listFiles();
      const offset = (args.offset as number) || 0;
      return {
        files: files.slice(offset, offset + ((args.limit as number) || 100)),
        total: files.length,
      };
    }
    case 'read_file': {
      const lines = (await reader.readFile(args.path as string)).split('\n');
      const start = (args.startLine as number) || 1;
      return {
        path: args.path,
        startLine: start,
        totalLines: lines.length,
        content: lines.slice(start - 1, start - 1 + ((args.lineCount as number) || 200)).join('\n'),
      };
    }
    case 'task_status':
      return { status: await reader.status() };
    case 'task_diff':
      return { diff: await reader.diff() };
    case 'write_file':
      if (agent !== 'worker') {
        throw new OperationError('reviewerReadOnly');
      }
      await a.writer!.writeFile(args.path as string, args.content as string);
      return { written: args.path };
    case 'delete_file':
      if (agent !== 'worker') {
        throw new OperationError('reviewerReadOnly');
      }
      await a.writer!.deleteFile(args.path as string);
      return { deleted: args.path };
    case 'read_operation': {
      const operation = a.operations.get(args.id as string);
      if (!operation) {
        throw new OperationError('evidenceInvalid');
      }
      const content = JSON.stringify(operation);
      const offset = (args.offset as number) || 0;
      return {
        id: operation.id,
        status: operation.status,
        offset,
        total: content.length,
        content: content.slice(offset, offset + ((args.limit as number) || 12000)),
      };
    }
    case 'read_command_output': {
      const output = a.outputs.get(args.id as string);
      if (output === undefined) {
        throw new OperationError('evidenceInvalid');
      }
      const offset = (args.offset as number) || 0;
      return {
        id: args.id,
        offset,
        total: output.length,
        output: output.slice(offset, offset + ((args.limit as number) || 12000)),
      };
    }
    case 'run_command': {
      const criterionIds = args.criterionIds as string[];
      return this.check(
        a,
        {
          id: randomUUID(),
          name: args.name as string,
          command: args.command as string,
          shell: a.summary.environment!.shell,
          timeoutSeconds: (args.timeoutSeconds as number) ?? 180,
        },
        phase,
        {
          cwd: args.cwd as string | undefined,
          purpose: args.purpose as CommandEvidence['purpose'],
          criterionIds,
        },
      );
    }
    case 'run_check': {
      if (agent !== 'worker') {
        throw new OperationError('reviewerReadOnly');
      }
      const command =
        a.config.customCommandsEnabled && a.config.checks.find((item) => item.id === args.id);
      if (!command) {
        throw new OperationError('unknownCheck');
      }
      return this.check(a, command, 'worker', { presetId: command.id });
    }
    default:
      throw new OperationError('toolNotAllowed');
  }
}
