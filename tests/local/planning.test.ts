import {
  OperationError,
  redactError,
  toAppError,
  formatError,
  errorMessages,
} from '../../src/shared/errors';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExecutionEvidenceItem } from '../../webview/src/Execution';
import { UIContext, type UIContextValue } from '../../webview/src/context';
import type { RunEvent } from '../../src/shared/execution';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentTools,
  validateTool,
  validatePlan,
  validateReview,
  validateSubmission,
} from '../../src/execution/contracts';
import { validateConfig } from '../../src/execution/records';
import type {
  PlanInput,
  WorkSubmission,
  ReviewResult,
  CommandEvidence,
} from '../../src/shared/execution';
const input: PlanInput = {
  objective: 'Fix cancellation',
  requirements: 'Cancelling creates no output',
  steps: ['Inspect cancellation', 'Fix and verify'],
  revisionReason: '',
  criteria: [
    {
      id: 'cancel',
      description: 'No file on cancellation',
      verification: 'command',
      evidence: 'Run regression coverage',
      reason: '',
    },
  ],
};
const plan = validatePlan(input);
const command: CommandEvidence = {
  id: 'host-evidence',
  name: 'Regression',
  program: 'npm',
  args: ['test'],
  cwd: '.',
  purpose: 'verify',
  criterionIds: ['cancel'],
  timeoutSeconds: 180,
  planVersion: 1,
  round: 1,
  before: 'current',
  after: 'current',
  ok: true,
  exitCode: 0,
};
const submission: WorkSubmission = {
  summary: 'Fixed',
  completedSteps: ['Fix and verify'],
  unresolved: [],
  planVersion: 1,
  revision: 'current',
  evidence: [{ criterionId: 'cancel', evidence: 'Regression result', commandIds: [command.id] }],
};
const review: ReviewResult = {
  verdict: 'approve',
  summary: 'Verified actual artifacts',
  acceptance: [{ ...submission.evidence[0], passed: true }],
  planVersion: 1,
};
test('planning and rejection require actionable plans and stable acceptance criteria', () => {
  assert.throws(() => validatePlan({ ...input, steps: [] }), { code: 'planInvalid' });
  assert.throws(
    () => validatePlan({ ...input, criteria: [input.criteria[0], input.criteria[0]] }),
    { code: 'planInvalid' },
  );
  assert.throws(
    () => validatePlan({ ...input, criteria: [{ ...input.criteria[0], verification: 'reading' }] }),
    { code: 'planInvalid' },
  );
  assert.throws(() => validatePlan(input, plan), { code: 'planRevisionInvalid' });
  assert.throws(
    () =>
      validatePlan(
        { ...input, revisionReason: 'Weaken', criteria: [{ ...input.criteria[0], id: 'other' }] },
        plan,
      ),
    { code: 'planRevisionInvalid' },
  );
  assert.equal(
    validatePlan({ ...input, revisionReason: 'Repair failing cancellation test' }, plan).version,
    2,
  );
  assert.throws(
    () =>
      validateReview(
        { ...review, verdict: 'changes_requested' },
        plan,
        submission,
        new Map(),
        'current',
        [],
        false,
      ),
    { code: 'reviewIncomplete' },
  );
  validateReview(
    {
      ...review,
      verdict: 'changes_requested',
      acceptance: [{ ...review.acceptance[0], passed: false }],
      nextPlan: { ...input, revisionReason: 'Fix failed check' },
    },
    plan,
    submission,
    new Map(),
    'current',
    [],
    false,
  );
});
test('only genuine current successful command evidence can approve artifacts', () => {
  const commands = new Map([[command.id, command]]);
  assert.throws(
    () =>
      validateReview(
        {
          ...review,
          verdict: 'changes_requested',
          nextPlan: { ...input, revisionReason: 'Fix other work' },
        },
        plan,
        submission,
        new Map(),
        'current',
        [],
        false,
      ),
    { code: 'evidenceInvalid' },
  );
  validateReview(review, plan, submission, commands, 'current', [], false);
  for (const patch of [
    { ok: false },
    { before: 'old' },
    { after: 'changed' },
    { planVersion: 2 },
    { purpose: 'prepare' as const },
    { criterionIds: [] },
  ]) {
    assert.throws(
      () =>
        validateReview(
          review,
          plan,
          submission,
          new Map([[command.id, { ...command, ...patch }]]),
          'current',
          [],
          false,
        ),
      { code: 'evidenceInvalid' },
    );
  }
  assert.throws(() => validateSubmission(submission, plan, new Map()), { code: 'evidenceInvalid' });
  assert.throws(() => validateReview(review, plan, submission, commands, 'new', [], false), {
    code: 'evidenceInvalid',
  });
  assert.throws(
    () =>
      validateReview(
        review,
        plan,
        { ...submission, unresolved: ['Still broken'] },
        commands,
        'current',
        [],
        false,
      ),
    { code: 'evidenceInvalid' },
  );
  assert.throws(
    () =>
      validateReview(
        review,
        plan,
        submission,
        commands,
        'current',
        [{ ...command, ok: false }],
        false,
      ),
    { code: 'evidenceInvalid' },
  );
  assert.throws(() => validateReview(review, plan, submission, commands, 'current', [], true), {
    code: 'feedbackPending',
  });
  const failed = { ...command, id: 'failed', ok: false };
  validateReview(
    review,
    plan,
    submission,
    new Map([
      [failed.id, failed],
      [command.id, command],
    ]),
    'current',
    [],
    false,
  );
  assert.throws(
    () =>
      validateReview(
        review,
        plan,
        submission,
        new Map([
          [command.id, command],
          [failed.id, failed],
        ]),
        'current',
        [],
        false,
      ),
    { code: 'evidenceInvalid' },
  );
});
test('tool validation enforces nested arrays, roles, paths as literal values and bounded command parameters', () => {
  const call = (name: string, args: unknown) => ({
    id: 'tool',
    name,
    arguments: JSON.stringify(args),
  });
  const tools = agentTools('worker');
  const args = {
    name: 'Check',
    command: 'node --version | cat',
    purpose: 'verify',
    criterionIds: ['cancel'],
  };
  assert.deepEqual(validateTool(call('run_command', args), tools), args);
  for (const patch of [
    { command: ['wrong type'] },
    { timeoutSeconds: 901 },
    { criterionIds: [12] },
    { arbitrary: true },
    { command: 'x\0y' },
  ]) {
    assert.throws(() => validateTool(call('run_command', { ...args, ...patch }), tools), {
      code: 'toolArgumentsInvalid',
    });
  }
  assert.deepEqual(validateTool(call('run_command', args), agentTools('reviewer')), args);
  assert.throws(
    () =>
      validateTool(
        call('submit_plan', { ...input, criteria: [{ ...input.criteria[0], injected: true }] }),
        agentTools('planning'),
      ),
    { code: 'toolArgumentsInvalid' },
  );
});
test('empty command settings are automatic; legacy custom commands and explicit disabled values survive', () => {
  assert.equal(validateConfig({ prepare: [], checks: [] }).customCommandsEnabled, false);
  const config = {
    prepare: [
      { id: 'prepare', name: 'Install', program: 'npm', args: ['ci'], timeoutSeconds: 180 },
    ],
    checks: [],
  };
  assert.equal(validateConfig(config).customCommandsEnabled, true);
  const disabled = validateConfig({ ...config, customCommandsEnabled: false });
  assert.equal(disabled.customCommandsEnabled, false);
  assert.deepEqual(disabled.prepare, config.prepare);
  assert.throws(() => validateConfig({ ...config, customCommandsEnabled: 'false' }), {
    code: 'commandConfigInvalid',
  });
});

test('Reviewer can supply independent verification while stale, failed and unsubmitted Worker records remain invalid', () => {
  const independent: CommandEvidence = {
    ...command,
    id: 'reviewer-test',
    agent: 'reviewer',
    phase: 'reviewer',
    command: 'npm test',
  };
  const accepted = {
    ...review,
    acceptance: [{ ...review.acceptance[0], commandIds: [independent.id] }],
  };
  const submitted = { ...submission, evidence: [{ ...submission.evidence[0], commandIds: [] }] };
  validateReview(
    accepted,
    plan,
    submitted,
    new Map([[independent.id, independent]]),
    'current',
    [],
    false,
  );
  for (const patch of [
    { agent: 'worker' as const },
    { phase: 'planning' as const },
    { planVersion: 0 },
    { exitCode: 1 },
    { ok: false },
    { after: 'changed' },
    { purpose: 'explore' as const },
  ]) {
    assert.throws(
      () =>
        validateReview(
          accepted,
          plan,
          submitted,
          new Map([[independent.id, { ...independent, ...patch }]]),
          'current',
          [],
          false,
        ),
      { code: 'evidenceInvalid' },
    );
  }
  assert.throws(
    () =>
      validateReview(
        accepted,
        plan,
        submitted,
        new Map([
          [independent.id, independent],
          ['later', { ...independent, id: 'later', ok: false, exitCode: 1 }],
        ]),
        'current',
        [],
        false,
      ),
    { code: 'evidenceInvalid' },
  );
  for (const phase of ['planning', 'answering'] as const) {
    const definitions = agentTools(phase);
    const call = {
      id: 'probe',
      name: 'run_command',
      arguments: JSON.stringify({
        name: 'Inspect',
        command: 'git status',
        purpose: 'explore',
        criterionIds: [],
      }),
    };
    assert.equal(validateTool(call, definitions).purpose, 'explore');
    assert.throws(
      () =>
        validateTool(
          {
            ...call,
            arguments: JSON.stringify({
              name: 'Test',
              command: 'npm test',
              purpose: 'verify',
              criterionIds: ['cancel'],
            }),
          },
          definitions,
        ),
      { code: 'toolArgumentsInvalid' },
    );
    assert.ok(!definitions.some((d) => ['write_file', 'delete_file'].includes(d.name)));
  }
});

test('acceptance diagnostics identify blockers without weakening approval', () => {
  const commands = new Map([[command.id, command]]);
  const reject = (work: WorkSubmission, reason: string) =>
    assert.throws(
      () => validateReview(review, plan, work, commands, 'current', [], false),
      (error: unknown) => error instanceof OperationError && error.params?.reason === reason,
    );
  reject({ ...submission, unresolved: ['Optional browser tests were not run'] }, 'unresolved');
  validateReview(
    review,
    plan,
    { ...submission, summary: 'Optional browser tests were not run' },
    commands,
    'current',
    [],
    false,
  );
  reject({ ...submission, revision: 'old' }, 'submissionRevision');
  for (const [reason, patch] of [
    ['commandFailed', { ok: false, exitCode: 1 }],
    ['commandPlan', { planVersion: 0 }],
    ['commandRevision', { after: 'old' }],
    ['commandPurpose', { purpose: 'explore' }],
    ['commandCriterion', { criterionIds: [] }],
  ] as [string, Partial<CommandEvidence>][]) {
    assert.throws(
      () =>
        validateReview(
          review,
          plan,
          submission,
          new Map([[command.id, { ...command, ...patch }]]),
          'current',
          [],
          false,
        ),
      (error: unknown) =>
        error instanceof OperationError &&
        error.params?.reason === reason &&
        error.params.commandId === command.id &&
        error.params.criterionId === 'cancel',
    );
  }
  assert.throws(
    () => validateReview(review, plan, submission, new Map(), 'current', [], false),
    (error: unknown) =>
      error instanceof OperationError && error.params?.reason === 'commandMissing',
  );
  assert.throws(
    () =>
      validateReview(
        review,
        plan,
        submission,
        new Map([...commands, ['new', { ...command, id: 'new', ok: false }]]),
        'current',
        [],
        false,
      ),
    (error: unknown) =>
      error instanceof OperationError &&
      error.params?.reason === 'latestVerification' &&
      error.params.commandId === 'new',
  );
});

test('validation fault survives persisted outcome and actual Debug rendering in both languages', () => {
  let fault;
  try {
    validateReview(
      review,
      plan,
      { ...submission, unresolved: ['Optional browser tests not run; Bearer private-token'] },
      new Map([[command.id, command]]),
      'current',
      [],
      false,
    );
    assert.fail('must reject');
  } catch (error) {
    fault = redactError(toAppError(error));
  }
  const event = JSON.parse(
    JSON.stringify({
      kind: 'tool',
      text: 'submit_review',
      tool: {
        tool: 'submit_review',
        operationId: 'op',
        callId: 'call',
        requestId: 'req',
        execution: 'executed',
        status: 'failed',
        fault,
      },
    }),
  ) as RunEvent;
  for (const locale of ['en', 'zh-CN'] as const) {
    const html = renderToStaticMarkup(
      createElement(
        UIContext.Provider,
        {
          value: { snapshot: { locale } } as UIContextValue,
        },
        createElement(ExecutionEvidenceItem, { event }),
      ),
    );
    assert.match(html, /Optional browser tests not run/);
    assert.match(html, /redacted/);
    assert.doesNotMatch(html, /private-token/);
    assert.match(html, locale === 'en' ? /blocked by unresolved/ : /未解决事项阻止验收通过/);
    assert.match(html, /data-outcome="failed"/);
  }
  assert.equal(formatError('en', { code: 'evidenceInvalid' }), errorMessages.evidenceInvalid[0]);
  assert.ok(
    String(
      redactError({ code: 'evidenceInvalid', params: { blockers: 'x'.repeat(13000) } }).params
        ?.blockers,
    ).length <= 12000,
  );
});

test('remaining acceptance diagnostics distinguish coverage, sources, latest citations and reading evidence', () => {
  const commands = new Map([[command.id, command]]);
  const rejects = (action: () => unknown, reason: string) =>
    assert.throws(
      action,
      (error: unknown) =>
        error instanceof OperationError &&
        error.code === 'evidenceInvalid' &&
        error.params?.reason === reason,
    );
  rejects(() => validateSubmission({ ...submission, evidence: [] }, plan, commands), 'coverage');
  rejects(() => validateSubmission(submission, plan, new Map()), 'commandMissing');
  rejects(
    () =>
      validateSubmission(submission, plan, new Map([[command.id, { ...command, planVersion: 0 }]])),
    'commandPlan',
  );
  rejects(
    () =>
      validateReview(
        review,
        plan,
        submission,
        commands,
        'current',
        [{ ...command, id: 'additional', ok: false }],
        false,
      ),
    'additionalCheck',
  );
  rejects(
    () =>
      validateReview(
        { ...review, acceptance: [{ ...review.acceptance[0], commandIds: [] }] },
        plan,
        submission,
        commands,
        'current',
        [],
        false,
      ),
    'commandRequired',
  );
  rejects(
    () =>
      validateReview(
        review,
        plan,
        { ...submission, evidence: [{ ...submission.evidence[0], commandIds: [] }] },
        commands,
        'current',
        [],
        false,
      ),
    'commandSource',
  );
  rejects(
    () =>
      validateReview(
        review,
        plan,
        submission,
        new Map([...commands, ['new', { ...command, id: 'new' }]]),
        'current',
        [],
        false,
      ),
    'latestVerification',
  );
  const reading = validatePlan({
    ...input,
    criteria: [{ ...input.criteria[0], verification: 'reading', reason: 'Read artifact' }],
  });
  rejects(
    () =>
      validateReview(
        { ...review, acceptance: [{ ...review.acceptance[0], evidence: ' ' }] },
        reading,
        submission,
        commands,
        'current',
        [],
        false,
      ),
    'readingRequired',
  );
  validateReview(
    {
      ...review,
      verdict: 'changes_requested',
      acceptance: [{ ...review.acceptance[0], passed: false }],
      nextPlan: { ...input, revisionReason: 'Fix blockers' },
    },
    plan,
    { ...submission, unresolved: ['Real blocker'] },
    commands,
    'current',
    [],
    false,
  );
});
