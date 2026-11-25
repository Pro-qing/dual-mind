import type { ToolOutcome } from '../shared/toolOutcome';
import {
  OperationError,
  toAppError,
  redactError,
  redactText,
  type AppError,
} from '../shared/errors';
import { randomUUID } from 'node:crypto';
import {
  type ExecutionActivity,
  type RunEvent,
  type Agent,
  type ExecutionDetail,
} from '../shared/execution';
import type { ExecutionRuntime } from './runtime';
import type { Active } from './runtimeTypes';
export function projection(this: ExecutionRuntime, detail: ExecutionDetail, round: number) {
  return detail.type === 'plan'
    ? `plan:${detail.plan.version}`
    : detail.type === 'submission'
      ? `submission:${round}:${detail.submission.planVersion}`
      : detail.type === 'review'
        ? `review:${round}:${detail.review.planVersion}`
        : `command:${detail.command.id}`;
}
export function cleanError(this: ExecutionRuntime, a: Active, error: unknown): AppError {
  return redactError(toAppError(error), [
    a.input.worker.key,
    a.input.reviewer.key,
    ...a.environment.redactionValues(),
  ]);
}
export function clean(this: ExecutionRuntime, a: Active, text: string) {
  return redactText(text, [
    a.input.worker.key,
    a.input.reviewer.key,
    ...a.environment.redactionValues(),
  ]);
}
export function redact(this: ExecutionRuntime, a: Active, value: unknown): unknown {
  if (typeof value === 'string') {
    return this.clean(a, value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => this.redact(a, item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, this.redact(a, item)]),
    );
  }
  return value;
}
export function emit(
  this: ExecutionRuntime,
  a: Active,
  kind: RunEvent['kind'],
  raw: string,
  agent?: Agent,
  requestId?: string,
  fault?: AppError,
  detail?: ExecutionDetail,
  round = a.summary.round,
  tool?: ToolOutcome,
): Promise<void> {
  if (this.active !== a || a.generation !== a.recovery.generation) {
    throw new OperationError('inactiveExecution');
  }
  if (detail) {
    const key = this.projection(detail, round);
    if (a.projected.has(key)) {
      return Promise.resolve();
    }
    a.projected.add(key);
  }
  const text = this.clean(a, raw);
  const cleanFault = fault ? this.cleanError(a, fault) : undefined;
  const cleanDetail = detail ? (this.redact(a, detail) as ExecutionDetail) : undefined;
  a.bytes +=
    (cleanDetail ? Buffer.byteLength(JSON.stringify(cleanDetail)) : 0) +
    Buffer.byteLength(text) +
    (cleanFault
      ? Buffer.byteLength(JSON.stringify(cleanFault)) * Math.max(1, Math.ceil(text.length / 12000))
      : 0);
  if (a.bytes > 64 * 1024 * 1024) {
    throw new OperationError('historyLimit');
  }
  for (let at = 0; at < text.length || at === 0; at += 12000) {
    const event: RunEvent = {
      runId: a.summary.id,
      taskId: a.summary.taskId,
      sequence: ++a.summary.sequence,
      round,
      kind,
      text: text.slice(at, at + 12000),
      agent,
      requestId,
      ...(a.userRequestId ? { userRequestId: a.userRequestId } : {}),
      time: new Date().toISOString(),
      ...(cleanFault ? { fault: cleanFault } : {}),
      ...(tool ? { tool } : {}),
      ...(at === 0 && cleanDetail ? { detail: cleanDetail } : {}),
      ...(cleanDetail?.type === 'command' ? { commandId: cleanDetail.command.id } : {}),
    };
    a.pending = a.pending.then(() => this.records.event(event));
    this.notify([event]);
  }
  void a.pending.catch(() => {
    a.persistenceFailed = true;
    a.controller.abort();
  });
  return a.pending;
}
export function beginActivity(
  this: ExecutionRuntime,
  a: Active,
  value: Omit<ExecutionActivity, 'id' | 'taskId' | 'runId' | 'startedAt'>,
) {
  if (this.active !== a || a.controller.signal.aborted) {
    return undefined;
  }
  const activity: ExecutionActivity = {
    ...value,
    id: randomUUID(),
    taskId: a.summary.taskId,
    runId: a.summary.id,
    startedAt: new Date().toISOString(),
    ...(value.label ? { label: this.clean(a, value.label) } : {}),
    ...(a.userRequestId ? { userRequestId: a.userRequestId } : {}),
  };
  a.activity = activity;
  this.notify();
  return activity;
}
export function endActivity(
  this: ExecutionRuntime,
  a: Active,
  activity: ExecutionActivity | undefined,
) {
  if (activity && a.activity === activity) {
    a.activity = undefined;
    this.notify();
  }
}
