import { failureCount, toolFault, fatalToolFault } from './toolOutcomes';
import type { ToolOutcome } from '../shared/toolOutcome';
import type { ToolCall } from '../providers/inference';
import { inferenceBytes } from '../providers/inference';
import { type RecoveryOperation } from './recovery';
import { OperationError, errorText, type AppError } from '../shared/errors';
import {
  agentTools,
  validateTool,
  toolArgumentError,
  validatePlan,
  validateSubmission,
  validateReview,
  type AgentPhase,
} from './contracts';
import { randomUUID } from 'node:crypto';
import {
  type Agent,
  type PlanInput,
  type WorkSubmission,
  type ReviewResult,
  type CommandEvidence,
} from '../shared/execution';
import {
  InferenceError,
  toolResult as protocolToolResult,
  type Endpoint,
  type History,
} from '../providers/inference';
import { CommandShutdownError } from './commands';
import type { ExecutionRuntime } from './runtime';
import type { Active } from './runtimeTypes';
export async function compactContext(
  this: ExecutionRuntime,
  a: Active,
  agent: Agent,
  phase: AgentPhase,
  tools: import('../providers/inference').ToolDefinition[],
  forced = false,
) {
  const activity = this.beginActivity(a, { agent, phase, stage: 'compacting', label: 'context' });
  const operation = this.newOperation(a, 'model', 'compact_context');
  await this.operation(a, operation);
  try {
    const messages = (await this.records.messages(a.summary.taskId)).filter((m) =>
      ['pending', 'processing'].includes(m.status ?? ''),
    );
    const changed = await a.contexts![agent].compact({
      history: a.histories[agent],
      tools,
      forced,
      signal: a.controller.signal,
      inference: this.inference,
      throughOperation:
        [...a.operations.values()].filter((op) => op.id !== operation.id).at(-1)?.id ?? null,
      facts: {
        task: a.input.task.name,
        role: agent,
        cursor: a.recovery.cursor,
        round: a.summary.round,
        plan: a.summary.plan,
        submission: a.summary.submission,
        review: a.summary.review,
        pendingMessages: messages.map((m) => ({ id: m.id, text: m.text })),
        feedback: a.feedback,
        operations: [...a.operations.values()]
          .filter((op) => op.kind !== 'environment')
          .slice(-60)
          .map((op) => ({ id: op.id, name: op.name, status: op.status })),
        instruction:
          'Completed operations already happened. Unknown operations may have effects. Read recorded operations and current files; do not replay them blindly. This state, not the summary, controls acceptance.',
      },
      clean: (text) => this.clean(a, text),
      persist: async (summary, checkpoint) => {
        await a.recoveryStore.saveContext(checkpoint.id, summary);
        (a.recovery.contexts ??= {})[agent] = checkpoint;
        await this.persist(a);
      },
    });
    await this.operation(a, {
      ...operation,
      status: 'succeeded',
      result: { changed, checkpoint: a.recovery.contexts?.[agent]?.id },
    });
    await this.persist(a);
  } catch (error) {
    if (!a.persistenceFailed) {
      await this.operation(a, {
        ...operation,
        status: 'failed',
        result: { fault: this.cleanError(a, error) },
      });
    }
    throw error;
  } finally {
    this.endActivity(a, activity);
  }
}
export function clearToolPause(this: ExecutionRuntime, a: Active) {
  const pause = a.summary.toolPause;
  if (!pause) {
    return;
  }
  const budget = a.recovery.budgets[pause.budgetKey];
  if (budget) {
    budget.corrections = 0;
    budget.failures = {};
  }
  a.recovery.corrections = 0;
  delete a.summary.toolPause;
  if (
    ['repeatedToolFailure', 'toolBatchRejected', 'reviewCorrectionExhausted'].includes(
      a.summary.fault?.code ?? '',
    )
  ) {
    delete a.summary.fault;
    delete a.summary.error;
  }
}
export async function pauseForTools(
  this: ExecutionRuntime,
  a: Active,
  phase: AgentPhase,
  budgetKey: string,
  operation: RecoveryOperation,
  reason: 'repeatedToolFailure' | 'toolBatchRejected' | 'reviewCorrectionExhausted',
) {
  a.summary.toolPause = {
    reason,
    budgetKey,
    tool: operation.name,
    operationId: operation.id,
    count: reason === 'reviewCorrectionExhausted' ? 2 : 3,
  };
  a.summary.fault = { code: reason };
  a.summary.error = errorText('en', a.summary.fault);
  a.pause = true;
  await this.persist(a);
  await this.emit(a, 'error', a.summary.error, a.recovery.agent, undefined, a.summary.fault);
  await this.boundary(a, phase);
}
export async function toolResult(
  this: ExecutionRuntime,
  a: Active,
  endpoint: Endpoint,
  history: History,
  operation: RecoveryOperation,
  call: ToolCall,
  outcome: ToolOutcome,
  raw: unknown,
) {
  const clean = this.redact(a, raw) as Record<string, unknown>;
  const cleanOutcome = this.redact(a, outcome) as ToolOutcome;
  await this.operation(a, {
    ...operation,
    status: outcome.status,
    outcome: cleanOutcome,
    result: clean,
  });
  const encoded = JSON.stringify(clean);
  const result =
    Buffer.byteLength(encoded) > 12000
      ? {
          ...Object.fromEntries(
            Object.entries(clean ?? {}).filter(([key]) =>
              [
                'ok',
                'exitCode',
                'actualExitCode',
                'reason',
                'termination',
                'fault',
                'code',
                'accepted',
                'executed',
                'diagnostic',
                'id',
              ].includes(key),
            ),
          ),
          truncated: true,
          operationId: operation.id,
          preview: encoded.slice(0, 6000),
          totalCharacters: encoded.length,
          instruction:
            'Read the complete saved result with read_operation using operationId and offset.',
        }
      : clean;
  history.push(protocolToolResult(endpoint.protocol, call, { ...result, outcome: cleanOutcome }));
  await this.emit(
    a,
    'tool',
    JSON.stringify({ tool: call.name, callId: call.id, result: clean }),
    a.recovery.agent,
    operation.requestId,
    outcome.fault,
    undefined,
    a.summary.round,
    cleanOutcome,
  );
}
export async function agent(
  this: ExecutionRuntime,
  a: Active,
  phase: AgentPhase,
): Promise<Record<string, unknown>> {
  const agent: Agent = phase === 'planning' || phase === 'answering' ? 'reviewer' : phase;
  const endpoint: Endpoint = a.input[agent];
  const history = a.histories[agent];
  const definitions = agentTools(phase);
  if (a.recovery.accepted?.phase === phase) {
    return a.recovery.accepted.value;
  }
  const budgetKey = `${a.summary.round}:${a.summary.plan?.version ?? 0}:${phase}:${phase === 'answering' ? a.handling.join(',') : ''}`;
  const budget: import('../shared/toolOutcome').ToolBudget = (a.recovery.budgets[budgetKey] ??= {
    turn: 0,
    corrections: 0,
  });
  a.recovery.phase = phase;
  a.recovery.agent = agent;
  await this.persist(a);
  let workerFeedback = '';
  while (true) {
    if (agent === 'worker' && a.feedback.length && workerFeedback !== JSON.stringify(a.feedback)) {
      workerFeedback = JSON.stringify(a.feedback);
      history.push({
        role: 'user',
        content: `Human feedback; do not bypass acceptance:\n${a.feedback.join('\n')}`,
      });
    }
    await this.boundary(a, phase);
    if (agent === 'reviewer' && a.feedback.length) {
      a.reviewFeedback = phase !== 'planning';
      history.push({
        role: 'user',
        content: `Human feedback:\n${a.feedback.splice(0).join('\n')}`,
      });
    }
    const context = a.contexts![agent];
    if (context.needsCompaction(history, definitions)) {
      await this.compactContext(a, agent, phase, definitions);
    }
    (a.summary.context ??= {})[agent] = context.usage(history, definitions);
    const requestId = randomUUID();
    a.summary.recovery = { ...this.recoverySummary(a.recovery), operation: 'model' };
    a.recovery.requestId = requestId;
    const requestOperation: RecoveryOperation = {
      ...this.newOperation(a, 'model', endpoint.model),
      requestId,
    };
    await this.operation(a, requestOperation);
    await this.persist(a);
    let pendingText = '';
    let writeError: unknown;
    const flush = (final = false) => {
      // Retain a secret-length tail across deltas so split credentials cannot leak.
      const retain = final
        ? 0
        : Math.max(
            1,
            ...[a.input.worker.key, a.input.reviewer.key, ...a.environment.redactionValues()].map(
              (value) => Math.max(value.length, encodeURIComponent(value).length),
            ),
          );
      if (pendingText.length <= retain) {
        return;
      }
      const clean = this.clean(a, pendingText);
      const count = final ? clean.length : Math.max(0, clean.length - retain);
      const text = clean.slice(0, count);
      pendingText = clean.slice(count);
      if (text) {
        try {
          void this.emit(a, 'text', text, agent, requestId).catch((error) => {
            writeError = error;
          });
        } catch (error) {
          writeError = error;
          a.controller.abort();
        }
      }
    };
    const timer = setInterval(() => flush(), 100);
    let turn;
    const activity = this.beginActivity(a, { agent, phase, requestId, stage: 'waiting' });
    try {
      for (let compactions = 0; ; compactions++) {
        try {
          const requestBytes = inferenceBytes(endpoint, history, definitions);
          turn = await this.inference.turn(
            endpoint,
            history,
            definitions,
            a.controller.signal,
            (text) => {
              if (a.controller.signal.aborted || this.active !== a) {
                return;
              }
              pendingText += text;
              if (pendingText.length > 16000) {
                flush();
              }
            },
            () => {
              if (
                activity &&
                a.activity === activity &&
                this.active === a &&
                !a.controller.signal.aborted
              ) {
                activity.stage = 'receiving';
                activity.retry = undefined;
                this.notify();
              }
            },
            async (attempt, delayMs) => {
              requestOperation.nextAttempt = attempt;
              await this.operation(a, requestOperation);
              if (
                activity &&
                a.activity === activity &&
                this.active === a &&
                !a.controller.signal.aborted
              ) {
                activity.retry = {
                  attempt,
                  delayMs,
                  retryAt: new Date(Date.now() + delayMs).toISOString(),
                };
                activity.stage = 'waiting';
                this.notify();
              }
            },
            (attempt) => {
              if (
                activity &&
                a.activity === activity &&
                this.active === a &&
                !a.controller.signal.aborted
              ) {
                activity.retry = { attempt, delayMs: 0, requesting: true };
                this.notify();
              }
            },
          );
          context.observe(turn, requestBytes);
          (a.summary.context ??= {})[agent] = context.usage(history, definitions);
          break;
        } catch (error) {
          if (
            !(error instanceof InferenceError) ||
            error.code !== 'inferenceContext' ||
            compactions >= 2 ||
            a.controller.signal.aborted
          ) {
            throw error;
          }
          await this.compactContext(a, agent, phase, definitions, true);
        }
      }
    } catch (error) {
      if (!a.persistenceFailed) {
        await this.operation(a, {
          ...requestOperation,
          status: 'failed',
          result: {
            fault: this.cleanError(a, error),
            attempts:
              error instanceof InferenceError
                ? error.attempts
                : Math.max(1, (requestOperation.nextAttempt ?? 2) - 1),
          },
        });
      }
      throw error;
    } finally {
      this.endActivity(a, activity);
      clearInterval(timer);
      flush(true);
      await a.pending;
    }
    if (writeError) {
      throw writeError;
    }
    if (a.controller.signal.aborted) {
      throw new OperationError('executionStopped');
    }
    await this.operation(a, {
      ...requestOperation,
      status: 'succeeded',
      result: {
        text: turn.text,
        calls: turn.calls.map((call) => ({ id: call.id, name: call.name })),
        attempts: turn.attempts ?? 1,
      },
    });
    budget.turn++;
    a.recovery.turn = budget.turn;
    await this.persist(a);
    history.push(...turn.output);
    if (!turn.calls.length) {
      if (phase !== 'reviewer') {
        throw new OperationError('completionMissing');
      }
      budget.corrections = Math.min(2, budget.corrections + 1);
      a.recovery.corrections = budget.corrections;
      history.push({
        role: 'user',
        content:
          'Your structured review was not submitted. Return submit_review with the required fields. If and only if the whole task is complete, use pass + finish with confidence at least 0.8, then emit TASK_COMPLETE on its own line.',
      });
      if (budget.corrections >= 2) {
        const invalidReview = this.newOperation(a, 'tool', 'submit_review');
        await this.operation(a, {
          ...invalidReview,
          status: 'failed',
          result: { fault: { code: 'reviewCorrectionExhausted' } },
        });
        await this.pauseForTools(a, phase, budgetKey, invalidReview, 'reviewCorrectionExhausted');
      }
      continue;
    }
    const finalName =
      phase === 'answering'
        ? turn.calls.some((c) => c.name === 'submit_answer')
          ? 'submit_answer'
          : 'submit_plan'
        : phase === 'planning'
          ? 'submit_plan'
          : agent === 'worker'
            ? 'finish_work'
            : 'submit_review';
    budget.calls = (budget.calls ?? 0) + turn.calls.length;
    const finals = turn.calls.filter((call) =>
      ['submit_plan', 'submit_answer', 'finish_work', 'submit_review'].includes(call.name),
    );
    const finalIndex = turn.calls.findIndex((call) => call.name === finalName);
    const invalidOrder =
      finals.length > 1 || (finalIndex >= 0 && finalIndex !== turn.calls.length - 1);
    const batch = turn.calls.map((call) => {
      let args: Record<string, unknown> | undefined, fault: AppError | undefined;
      try {
        args = validateTool(call, definitions);
        if (
          agent === 'reviewer' &&
          ['run_command', 'run_check', 'write_file', 'delete_file'].includes(call.name)
        ) {
          throw new OperationError('reviewerReadOnly');
        }
        if (invalidOrder && finals.includes(call)) {
          throw new OperationError('completionOrder');
        }
        if (call.name === 'run_command') {
          const ids = args.criterionIds as string[];
          if (args.purpose === 'verify' && !ids.length) {
            throw toolArgumentError(
              call,
              '$.criterionIds',
              'at least one command criterion ID',
              ids,
            );
          }
          if (
            ids.some(
              (id) =>
                !a.summary.plan?.criteria.some((c) => c.id === id && c.verification === 'command'),
            )
          ) {
            throw toolArgumentError(
              call,
              '$.criterionIds',
              'command criterion IDs from the current plan',
              ids,
            );
          }
        }
      } catch (error) {
        fault = this.cleanError(a, error);
      }
      const operation: RecoveryOperation = {
        ...this.newOperation(a, 'tool', call.name, args),
        requestId,
        callId: call.id,
        status: 'pending',
      };
      return { call, args, fault, operation };
    });
    await this.persist(a);
    for (const item of batch) {
      await this.operation(a, item.operation);
    }
    const rejected = batch.find((item) => item.fault);
    if (rejected) {
      budget.corrections = Math.min(3, budget.corrections + 1);
      for (const { call, fault, operation } of batch) {
        await this.toolResult(
          a,
          endpoint,
          history,
          operation,
          call,
          {
            operationId: operation.id,
            callId: call.id,
            requestId,
            tool: call.name,
            execution: 'notStarted',
            status: fault ? 'rejected' : 'skipped',
            fault: fault ?? { code: 'toolSkipped' },
            causedBy: rejected.operation.id,
          },
          {
            accepted: false,
            executed: false,
            code: fault?.code ?? 'toolSkipped',
            error: errorText('en', fault ?? { code: 'toolSkipped' }),
            diagnostic: fault?.params,
            allowedTools: definitions.map((definition) => definition.name),
            attempt: budget.corrections,
          },
        );
      }
      a.recovery.corrections = budget.corrections;
      await this.persist(a);
      const reviewCorrection =
        phase === 'reviewer' && batch.some((item) => item.call.name === 'submit_review');
      if (budget.corrections >= (reviewCorrection ? 2 : 3)) {
        await this.pauseForTools(
          a,
          phase,
          budgetKey,
          rejected.operation,
          reviewCorrection ? 'reviewCorrectionExhausted' : 'toolBatchRejected',
        );
      }
      continue;
    }
    budget.corrections = 0;
    a.recovery.corrections = 0;
    await this.persist(a);
    let failedOperation: string | undefined;
    let pauseOperation: RecoveryOperation | undefined;
    try {
      for (const { call, args, operation } of batch) {
        if (failedOperation) {
          await this.toolResult(
            a,
            endpoint,
            history,
            operation,
            call,
            {
              operationId: operation.id,
              callId: call.id,
              requestId,
              tool: call.name,
              execution: 'notStarted',
              status: 'skipped',
              fault: { code: 'toolSkipped' },
              causedBy: failedOperation,
            },
            { accepted: false, executed: false, error: errorText('en', { code: 'toolSkipped' }) },
          );
          continue;
        }
        await this.boundary(a, phase);
        await this.operation(a, { ...operation, status: 'started' });
        a.summary.recovery = { ...this.recoverySummary(a.recovery), operation: call.name };
        await this.persist(a);
        const toolActivity = this.beginActivity(a, {
          agent,
          phase,
          requestId,
          stage: 'tool',
          tool: call.name,
        });
        let result: unknown,
          fault: AppError | undefined,
          accepted: Record<string, unknown> | undefined;
        a.toolOperationId = operation.id;
        try {
          if (call.name === finalName) {
            if (a.feedback.length && agent === 'reviewer') {
              throw new OperationError('feedbackPending');
            }
            const revision = await a.reader!.fingerprint();
            if (a.controller.signal.aborted) {
              throw new OperationError('executionStopped');
            }
            let value: unknown;
            if (phase === 'answering') {
              if (call.name === 'submit_plan') {
                validatePlan(args as unknown as PlanInput, a.summary.plan);
              }
              value = args;
            } else if (phase === 'planning') {
              validatePlan(args as unknown as PlanInput);
              value = args;
            } else if (agent === 'worker') {
              const submission = {
                ...args,
                planVersion: a.summary.plan!.version,
                revision,
              } as unknown as WorkSubmission;
              validateSubmission(submission, a.summary.plan!, a.evidence);
              value = submission;
            } else {
              const review = {
                ...args,
                acceptance: [],
                planVersion: a.summary.plan!.version,
                completionMarker: /(?:^|\r?\n)TASK_COMPLETE(?:\r?\n|$)/.test(turn.text),
              } as unknown as ReviewResult;
              validateReview(
                review,
                a.summary.plan!,
                a.reviewFeedback || Boolean(a.feedback.length),
              );
              value = review;
            }
            accepted = this.redact(a, value) as Record<string, unknown>;
            a.recovery.accepted = { phase, value: accepted, id: operation.id };
            await this.persist(a);
            result = { accepted: true, value: accepted };
          } else {
            result = await this.tool(a, agent, call.name, args!, phase);
            if (
              (call.name === 'run_command' || call.name === 'run_check') &&
              !(result as CommandEvidence).ok
            ) {
              fault = (result as CommandEvidence).fault ?? { code: 'commandFailed' };
            }
          }
        } catch (error) {
          const clean = this.cleanError(a, toolFault(error));
          if (
            a.controller.signal.aborted ||
            a.persistenceFailed ||
            error instanceof CommandShutdownError ||
            fatalToolFault(clean)
          ) {
            throw error;
          }
          fault = clean;
          result = {
            accepted: false,
            error: errorText('en', fault),
            code: fault.code,
            diagnostic: fault.params,
          };
        } finally {
          a.toolOperationId = undefined;
          this.endActivity(a, toolActivity);
        }
        const command =
          (call.name === 'run_command' || call.name === 'run_check') &&
          result &&
          typeof result === 'object' &&
          'id' in result
            ? (result as CommandEvidence)
            : undefined;
        const outcome: ToolOutcome = {
          operationId: operation.id,
          callId: call.id,
          requestId,
          tool: call.name,
          execution: command?.termination === 'notStarted' ? 'notStarted' : 'executed',
          status: fault ? 'failed' : 'succeeded',
          ...(command ? { commandId: command.id } : {}),
          ...(fault ? { fault } : {}),
        };
        await this.toolResult(a, endpoint, history, operation, call, outcome, result);
        const revision = await a.reader!.fingerprint();
        const failures = failureCount(budget, call.name, args!, outcome, revision, command?.reason);
        if (fault) {
          failedOperation = operation.id;
          if (failures >= 3) {
            pauseOperation = operation;
          }
          if (phase === 'reviewer' && call.name === 'submit_review') {
            budget.corrections = Math.min(2, budget.corrections + 1);
            a.recovery.corrections = budget.corrections;
            if (budget.corrections >= 2) {
              pauseOperation = operation;
            }
          }
        }
        await this.persist(a);
        if (accepted) {
          return accepted;
        }
      }
    } catch (error) {
      if (!a.persistenceFailed) {
        for (const { call, operation } of batch) {
          const status = a.operations.get(operation.id)?.status;
          if (status !== 'pending' && status !== 'started') {
            continue;
          }
          const linkedCommand = [...a.operations.values()].find(
            (op) => op.kind === 'command' && op.parentOperationId === operation.id,
          );
          const outcome: ToolOutcome = {
            ...(linkedCommand ? { commandId: linkedCommand.id } : {}),
            operationId: operation.id,
            callId: call.id,
            requestId,
            tool: call.name,
            execution: status === 'pending' ? 'notStarted' : 'unknown',
            status: status === 'pending' ? 'cancelled' : 'unknown',
            fault: this.cleanError(a, error),
          };
          await this.toolResult(a, endpoint, history, operation, call, outcome, {
            executed: status === 'pending' ? false : 'unknown',
            error: errorText('en', outcome.fault!),
            instruction:
              'No automatic replay. Inspect saved results and current files before deciding what to do.',
          });
        }
      }
      throw error;
    }
    if (pauseOperation) {
      await this.pauseForTools(a, phase, budgetKey, pauseOperation, 'repeatedToolFailure');
    }
  }
}
