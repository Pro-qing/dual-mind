import { OperationError } from '../shared/errors';
import { validatePlan } from './contracts';
import { StoreError } from '../core/store';
import {
  type RunStatus,
  type TaskPlan,
  type PlanInput,
  type TaskMessage,
} from '../shared/execution';
import type { ExecutionRuntime } from './runtime';
import type { Active } from './runtimeTypes';
export async function requireTask(this: ExecutionRuntime, taskId: string) {
  if (!(await this.store.snapshot()).tasks.some((t) => t.id === taskId)) {
    throw new StoreError('notFound');
  }
}
export async function sendMessage(
  this: ExecutionRuntime,
  taskId: string,
  id: string,
  text: string,
) {
  await this.requireTask(taskId);
  if (this.workspaces.artifacts.states().some((item) => item.taskId === taskId && item.cleaned)) {
    throw new OperationError('workspaceArchived');
  }
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(id) ||
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 50000
  ) {
    throw new OperationError('messageInvalid');
  }
  const clean = await this.store.publicText(text.trim());
  const message: TaskMessage = {
    id,
    taskId,
    time: new Date().toISOString(),
    role: 'user',
    kind: 'message',
    text: clean,
    userRequestId: id,
    status: 'pending',
  };
  const saved = await this.serializeMessage(() => this.records.putMessage(message, true));
  this.notify();
  // A retry acknowledges the durable message without launching a second execution.
  if (saved !== message) {
    return;
  }
  const active = this.active;
  if (active?.summary.taskId === taskId && active.finalizing) {
    void active.done
      .then(async () => {
        if (
          !this.disposed &&
          ['completed', 'answered', 'roundLimit'].includes(active.summary.status)
        ) {
          await this.launchMessages(taskId);
        }
      })
      .catch(() => undefined);
  } else if (!active && !this.starting) {
    const latest = this.records.runs.find((r) => r.taskId === taskId);
    if (latest && ['completed', 'answered', 'roundLimit'].includes(latest.status)) {
      await this.launchMessages(taskId);
    }
  }
}
export function serializeMessage<T>(
  this: ExecutionRuntime,
  operation: () => Promise<T>,
): Promise<T> {
  const result = this.messageAdmission.then(operation);
  this.messageAdmission = result.catch(() => undefined);
  return result;
}
export function finishMessages(
  this: ExecutionRuntime,
  a: Active,
  status: RunStatus,
  verify?: () => Promise<void>,
) {
  return this.serializeMessage(async () => {
    if ((await this.records.pending(a.summary.taskId)).length) {
      return false;
    }
    await verify?.();
    if (a.controller.signal.aborted || this.disposed) {
      throw new OperationError('executionStopped');
    }
    if (a.pause) {
      return false;
    }
    a.finalizing = true;
    await this.state(a, status);
    return true;
  });
}
export async function launchMessages(this: ExecutionRuntime, taskId: string) {
  try {
    await this.start(taskId, true);
  } catch (error) {
    const ids = (await this.records.pending(taskId)).map((m) => m.id);
    await this.records.updateMessages(
      taskId,
      ids,
      'pending',
      undefined,
      await this.store.publicError(error),
    );
    this.notify();
  }
}
export async function processMessages(this: ExecutionRuntime, a: Active): Promise<boolean> {
  let changed = false;
  while (true) {
    const pending = await this.records.pending(a.summary.taskId);
    const messages = (
      a.handling.length
        ? (await this.records.messages(a.summary.taskId)).filter((m) => a.handling.includes(m.id))
        : pending
    ).slice(0, 1);
    if (!messages.length) {
      return changed;
    }
    if (!a.recovery.returning && a.recovery.cursor.stage !== 'answering') {
      a.recovery.returning = { ...a.recovery.cursor };
      a.recovery.returningUserRequestId = a.userRequestId;
    }
    a.recovery.cursor = { stage: 'answering', index: 0 };
    a.handling = messages.map((m) => m.id);
    a.userRequestId = messages[0].userRequestId ?? messages[0].id;
    a.recovery.userRequestId = a.userRequestId;
    a.summary.sourceMessageIds = [
      ...new Set([...(a.summary.sourceMessageIds ?? []), ...a.handling]),
    ];
    await this.persist(a);
    await this.records.updateMessages(a.summary.taskId, a.handling, 'processing', a.summary.id);
    this.notify();
    a.histories.reviewer.push({
      role: 'user',
      content: JSON.stringify({
        handoff: 'user_messages',
        messages: messages.map((m) => ({ id: m.id, text: m.text })),
        currentPlan: a.summary.plan,
        submission: a.summary.submission,
        review: a.summary.review,
        instruction:
          'Handle these messages. Answer questions with submit_answer after relevant read-only inspection. For modifications inspect current files and issue submit_plan with executable steps and acceptance. Retain existing acceptance IDs. Never silently ignore a requested change.',
      }),
    });
    const result = await this.agent(a, 'answering');
    await this.boundary(a, 'answering');
    const returning = a.recovery.returning;
    if (typeof result.answer === 'string') {
      a.recovery.answer ??= {
        id: a.recovery.accepted!.id,
        taskId: a.summary.taskId,
        time: new Date().toISOString(),
        role: 'reviewer',
        kind: 'answer',
        text: result.answer,
        userRequestId: a.userRequestId,
        runId: a.summary.id,
        sequence: a.summary.sequence,
        round: a.summary.round,
      };
      await this.persist(a);
      await this.records.putMessage(a.recovery.answer, true);
    } else {
      a.summary.kind = 'execution';
      // A newly accepted plan and its applied marker are persisted together.
      if (!a.recovery.planApplied) {
        if (a.summary.submission && a.recovery.submissionRound === a.summary.round) {
          if (a.summary.round >= a.summary.maxRounds) {
            a.recovery.roundExhausted = true;
          } else {
            a.summary.round++;
          }
        }
        a.summary.plan = this.redact(
          a,
          validatePlan(result as unknown as PlanInput, a.summary.plan),
        ) as TaskPlan;
        a.summary.submission = undefined;
        a.summary.review = undefined;
        a.additional = [];
        a.reviewFeedback = false;
        a.recovery.planApplied = true;
        (a.recovery.projections ??= []).push({
          detail: { type: 'plan', plan: a.summary.plan! },
          round: a.summary.round,
          agent: 'reviewer',
          text: a.summary.plan!.objective,
        });
        await this.persist(a);
      }
      await this.emit(a, 'plan', a.summary.plan!.objective, 'reviewer', undefined, undefined, {
        type: 'plan',
        plan: a.summary.plan!,
      });
      a.histories.worker.push({
        role: 'user',
        content: JSON.stringify({ handoff: 'reviewer_plan', plan: a.summary.plan }),
      });
      changed = true;
    }
    await this.records.updateMessages(a.summary.taskId, a.handling, 'handled', a.summary.id);
    a.handling = [];
    a.recovery.returning = undefined;
    a.recovery.answer = undefined;
    a.recovery.planApplied = undefined;
    const returningUserRequestId = a.recovery.returningUserRequestId;
    a.recovery.returningUserRequestId = undefined;
    if (!changed) {
      a.userRequestId = returningUserRequestId;
      a.recovery.userRequestId = a.userRequestId;
    }
    const next = changed
      ? {
          stage: a.recovery.roundExhausted
            ? ('roundLimit' as const)
            : a.summary.round
              ? ('worker' as const)
              : ('preparing' as const),
          index: 0,
        }
      : (returning ?? { stage: 'answering' as const, index: 0 });
    await this.move(a, next.stage, next.index);
    this.notify();
    if (changed) {
      return true;
    }
  }
}
