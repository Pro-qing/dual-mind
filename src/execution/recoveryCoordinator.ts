import { type RecoveryState, type RecoveryOperation, type RecoveryCursor } from './recovery';
import { OperationError, errorText } from '../shared/errors';
import { randomUUID } from 'node:crypto';
import { type RunSummary, terminalStatuses, type CommandEvidence } from '../shared/execution';
import { validateConfig } from './records';
import { ProjectEnvironment } from './environment';
import type { ExecutionRuntime } from './runtime';
import type { Active } from './runtimeTypes';
export async function initialize(this: ExecutionRuntime) {
  await this.records.initialize();
  for (const original of this.records.runs) {
    try {
      const saved = await this.records.recovery(original.id).load();
      if (!saved) {
        continue;
      }
      if (
        saved.operations.some(
          (op) =>
            ['command', 'environment'].includes(op.kind) &&
            ['started', 'unknown'].includes(op.status) &&
            op.cleanup !== 'confirmed',
        )
      ) {
        this.unconfirmedRuns.add(original.id);
        this.shutdownUnconfirmed = true;
      }
      const status = terminalStatuses.includes(saved.state.summary.status)
        ? saved.state.summary.status
        : 'interrupted';
      Object.assign(original, saved.state.summary, {
        status,
        sequence: Math.max(original.sequence, saved.state.summary.sequence),
      });
      original.recovery = this.recoverySummary(saved.state, status);
      if (status === 'interrupted') {
        original.fault = { code: 'executionInterrupted' };
        original.error = errorText('en', original.fault);
      }
      const latest = this.records.runs.find((run) => run.taskId === original.taskId);
      if (latest !== original) {
        original.recovery.available = false;
      }
    } catch (error) {
      original.recovery = {
        generation: original.recovery?.generation ?? 0,
        attempts: original.recovery?.attempts ?? 0,
        available: false,
        blocked: await this.store.publicError(error),
      };
    }
  }
  await this.records.save();
}
export function recoverySummary(
  this: ExecutionRuntime,
  state: RecoveryState,
  status = state.summary.status,
) {
  const prohibited = ['toolCorrectionLimit', 'historyLimit'];
  return {
    generation: state.generation,
    attempts: state.summary.recovery?.attempts ?? 0,
    available:
      ['failed', 'interrupted', 'paused'].includes(status) &&
      !prohibited.includes(state.summary.fault?.code ?? ''),
    agent: state.agent,
    phase: state.phase ?? state.cursor.stage,
    operation: state.summary.recovery?.operation,
    ...(prohibited.includes(state.summary.fault?.code ?? '')
      ? { blocked: state.summary.fault }
      : {}),
  };
}
export async function persist(this: ExecutionRuntime, a: Active, summary = a.summary) {
  if (this.active !== a || a.recovery.generation !== a.generation) {
    throw new OperationError('inactiveExecution');
  }
  a.recovery.summary = summary;
  a.recovery.handling = [...a.handling];
  a.recovery.userRequestId = a.userRequestId;
  a.recovery.feedback = [...a.feedback];
  a.recovery.reviewFeedback = a.reviewFeedback;
  try {
    await a.recoveryStore.state(this.redact(a, a.recovery) as RecoveryState);
  } catch (error) {
    a.persistenceFailed = true;
    a.controller.abort();
    throw error;
  }
}
export async function operation(this: ExecutionRuntime, a: Active, operation: RecoveryOperation) {
  if (this.active !== a || a.generation !== a.recovery.generation) {
    throw new OperationError('inactiveExecution');
  }
  const clean = this.redact(a, operation) as RecoveryOperation;
  try {
    await a.recoveryStore.operation(clean);
  } catch (error) {
    a.persistenceFailed = true;
    a.controller.abort();
    throw error;
  }
  a.operations.set(clean.id, clean);
}
export function newOperation(
  this: ExecutionRuntime,
  a: Active,
  kind: RecoveryOperation['kind'],
  name: string,
  args?: unknown,
): RecoveryOperation {
  return {
    id: randomUUID(),
    generation: a.generation,
    kind,
    name,
    status: 'started',
    phase: a.recovery.phase,
    agent: a.recovery.agent,
    ...(a.userRequestId ? { userRequestId: a.userRequestId } : {}),
    time: new Date().toISOString(),
    ...(args === undefined ? {} : { args }),
  };
}
export async function move(
  this: ExecutionRuntime,
  a: Active,
  stage: RecoveryCursor['stage'],
  index = 0,
) {
  a.recovery.cursor = { stage, index };
  a.recovery.accepted = undefined;
  await this.persist(a);
}
export async function restore(this: ExecutionRuntime, runId: string) {
  if (this.gitOperationTaskId) {
    throw new OperationError('artifactBusy');
  }
  if (this.disposed || this.active || this.starting) {
    throw new OperationError('singleExecution');
  }
  const summary = this.records.runs.find((run) => run.id === runId);
  if (
    !summary ||
    !['failed', 'interrupted'].includes(summary.status) ||
    this.records.runs.find((run) => run.taskId === summary.taskId) !== summary
  ) {
    throw new OperationError('recoveryUnavailable');
  }
  if (this.workspaces.artifacts.states().some((item) => item.pending)) {
    throw new OperationError('artifactBusy');
  }
  this.starting = summary.taskId;
  try {
    const recoveryStore = this.records.recovery(runId);
    const saved = await recoveryStore.load();
    if (!saved || !this.recoverySummary(saved.state, summary.status).available) {
      throw new OperationError('recoveryUnavailable');
    }
    const input = await this.store.executionInput(summary.taskId);
    if (saved.state.summary.git) {
      await this.workspaces.binding(summary.taskId, saved.state.summary.git);
    }
    const events = await this.records.history(
      runId,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
    Object.assign(summary, saved.state.summary, {
      sequence: events.reduce(
        (latest, event) => Math.max(latest, event.sequence),
        summary.sequence,
      ),
      status: 'recovering',
    });
    const recovery = saved.state;
    recovery.config = validateConfig(recovery.config);
    const oldReview = recovery.summary.review;
    if (
      oldReview &&
      (!oldReview.nextStep || !['pass', 'fail'].includes(oldReview.verdict)) &&
      ['reviewer', 'reviewResult', 'completed'].includes(recovery.cursor.stage)
    ) {
      recovery.cursor = { stage: 'reviewer', index: 0 };
      recovery.accepted = undefined;
      recovery.summary.review = undefined;
    }
    recovery.generation++;
    summary.recovery = {
      ...this.recoverySummary(recovery),
      attempts: (summary.recovery?.attempts ?? 0) + 1,
      available: false,
    };
    delete summary.fault;
    delete summary.error;
    input.task = recovery.task;
    summary.models = Object.fromEntries(
      (['worker', 'reviewer'] as const).map((agent) => [
        agent,
        {
          connectionName: input[agent].name,
          model: input[agent].model,
          protocol: input[agent].protocol,
        },
      ]),
    ) as RunSummary['models'];
    const a: Active = {
      recovery,
      userRequestId: recovery.userRequestId,
      recoveryStore,
      operations: new Map(saved.operations.map((op) => [op.id, op])),
      generation: recovery.generation,
      recovering: true,
      persistenceFailed: false,
      stoppedByUser: false,
      projected: new Set(
        events.flatMap((event) =>
          event.detail ? [this.projection(event.detail, event.round ?? 0)] : [],
        ),
      ),
      summary,
      input,
      config: recovery.config,
      environment: new ProjectEnvironment(),
      controller: new AbortController(),
      histories: { worker: [], reviewer: [] },
      pause: false,
      feedback: recovery.feedback,
      done: Promise.resolve(),
      pending: Promise.resolve(),
      bytes: events.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event)), 0),
      evidence: new Map(),
      outputs: new Map(),
      additional: [],
      reviewFeedback: recovery.reviewFeedback,
      continuation: recovery.continuation,
      handling: recovery.handling,
      finalizing: false,
    };
    for (const event of events) {
      if (event.commandId) {
        a.outputs.set(event.commandId, (a.outputs.get(event.commandId) ?? '') + event.text);
      }
    }
    for (const event of events) {
      if (event.detail?.type === 'command') {
        a.evidence.set(event.detail.command.id, event.detail.command);
      }
    }
    for (const op of saved.operations) {
      const result = op.result as { evidence?: CommandEvidence; output?: string } | undefined;
      if (op.kind === 'command' && result?.evidence) {
        a.evidence.set(result.evidence.id, result.evidence);
        a.outputs.set(result.evidence.id, result.output ?? '');
      }
    }
    a.additional = [...a.evidence.values()].filter(
      (c) =>
        c.phase === 'checking' &&
        c.round === summary.round &&
        c.planVersion === summary.plan?.version,
    );
    this.clearToolPause(a);
    this.active = a;
    const initialization = this.persist(a)
      .then(() => this.records.save())
      .then(() => this.notify());
    a.done = initialization.then(() => this.execute(a)).catch(() => undefined);
    await initialization;
  } catch (error) {
    if (this.active?.summary.id === runId) {
      this.active = undefined;
    }
    summary.status = 'failed';
    summary.fault = await this.store.publicError(error);
    summary.error = errorText('en', summary.fault);
    summary.recovery = {
      ...summary.recovery,
      generation: summary.recovery?.generation ?? 0,
      attempts: summary.recovery?.attempts ?? 0,
      available: !['recoveryInvalid', 'recoveryUnavailable', 'historyLimit'].includes(
        summary.fault.code,
      ),
      blocked: summary.fault,
    };
    await this.records.save().catch(() => undefined);
    this.notify();
    throw error;
  } finally {
    this.starting = undefined;
  }
}
export async function recoveryStep(
  this: ExecutionRuntime,
  a: Active,
  step: NonNullable<RunSummary['recovery']>['step'],
) {
  if (!a.recovering || !a.summary.recovery) {
    return;
  }
  a.summary.recovery.step = step;
  await this.persist(a);
  this.notify();
}
