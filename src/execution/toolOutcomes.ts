import { createHash } from 'node:crypto';
import { OperationError, type AppError } from '../shared/errors';
import type { ToolBudget, ToolOutcome } from '../shared/toolOutcome';

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export function failureCount(
  budget: ToolBudget,
  tool: string,
  args: Record<string, unknown>,
  outcome: ToolOutcome,
  revision: string,
  reason?: string,
): number {
  const identity = { ...args };
  if (tool === 'run_command') {
    delete identity.name;
    identity.cwd ??= '.';
    identity.timeoutSeconds ??= 180;
  } else if (tool === 'read_file') {
    identity.startLine ??= 1;
    identity.lineCount ??= 200;
  } else if (tool === 'list_files') {
    identity.offset ??= 0;
    identity.limit ??= 100;
  } else if (tool === 'read_operation' || tool === 'read_command_output') {
    identity.offset ??= 0;
    identity.limit ??= 12000;
  }
  const key = createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          identity,
          code: outcome.fault?.code,
          params:
            outcome.fault?.params &&
            Object.fromEntries(Object.entries(outcome.fault.params).filter(([k]) => k !== 'name')),
          reason,
          revision,
        }),
      ),
    )
    .digest('hex');
  const failures = (budget.failures ??= {});
  if (outcome.status === 'succeeded') {
    // A successful diagnostic must not reset a different failing command.
    const argumentKey = createHash('sha256')
      .update(JSON.stringify(canonical(identity)))
      .digest('hex');
    delete failures[`${tool}:${argumentKey}`];
    return 0;
  }
  if (!['failed', 'rejected'].includes(outcome.status)) {
    return 0;
  }
  const argumentKey = createHash('sha256')
    .update(JSON.stringify(canonical(identity)))
    .digest('hex');
  const slot = `${tool}:${argumentKey}`;
  const previous = failures[slot];
  const count = previous?.key === key ? previous.count + 1 : 1;
  failures[slot] = { key, count, operationId: outcome.operationId };
  return count;
}
export function toolFault(error: unknown): unknown {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') {
    return new OperationError('toolFileMissing');
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new OperationError('toolPermission');
  }
  return error;
}
export function fatalToolFault(fault: AppError): boolean {
  return [
    'workspaceChanged',
    'workspaceUntrusted',
    'accessDenied',
    'taskNotFound',
    'inactiveExecution',
    'persistenceFailed',
    'storageFailed',
    'commandPlatformUnsupported',
    'recoveryProcessUnknown',
    'shutdownUnconfirmed',
    'commandShutdown',
  ].includes(fault.code);
}
export const failedOutcome = (outcome: ToolOutcome) =>
  ['failed', 'rejected', 'unknown'].includes(outcome.status);
