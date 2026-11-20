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
    program: 'node',
    args: ['literal;$(text)', 'a b'],
    purpose: 'verify',
    criterionIds: ['cancel'],
  };
  assert.deepEqual(validateTool(call('run_command', args), tools), args);
  for (const patch of [
    { args: 'shell string' },
    { timeoutSeconds: 901 },
    { criterionIds: [12] },
    { arbitrary: true },
    { program: 'x\0y' },
  ]) {
    assert.throws(() => validateTool(call('run_command', { ...args, ...patch }), tools), {
      code: 'invalidToolArguments',
    });
  }
  assert.throws(() => validateTool(call('run_command', args), agentTools('reviewer')), {
    code: 'toolNotAllowed',
  });
  assert.throws(
    () =>
      validateTool(
        call('submit_plan', { ...input, criteria: [{ ...input.criteria[0], injected: true }] }),
        agentTools('planning'),
      ),
    { code: 'invalidToolArguments' },
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
