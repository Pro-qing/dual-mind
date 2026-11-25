import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { errorMessages, formatError, redactError, toAppError } from '../../src/shared/errors';
import {
  agentTools,
  validatePlan,
  validateReview,
  validateSubmission,
  validateTool,
} from '../../src/execution/contracts';
import { validateConfig } from '../../src/execution/records';
import { acceptanceBlockers } from '../../src/shared/acceptance';
import type { PlanInput, ReviewResult, RunEvent, WorkSubmission } from '../../src/shared/execution';
import { ExecutionEvidenceItem } from '../../webview/src/Execution';
import { UIContext, type UIContextValue } from '../../webview/src/context';

const input: PlanInput = {
  objective: 'Improve task safety',
  requirements: 'Inspect the actual result and preserve user work.',
  steps: ['Inspect the files', 'Implement and verify'],
  criteria: [
    {
      id: 'safety',
      description: 'The implementation preserves user work.',
      verification: 'reading',
      evidence: 'Inspect changed files and outcomes.',
      reason: 'Artifact inspection is sufficient.',
    },
  ],
  revisionReason: '',
};
const plan = validatePlan(input);
const submission: WorkSubmission = {
  summary: 'Implemented the requested behavior.',
  completedSteps: ['Implemented'],
  evidence: [],
  unresolved: [],
  planVersion: plan.version,
  revision: 'host-owned-artifact-fingerprint',
};
const review: ReviewResult = {
  verdict: 'pass',
  risk: 'low',
  confidence: 0.92,
  issues: [],
  evidence: ['The current diff matches the request.'],
  reasoning: 'The artifacts satisfy the requested behavior.',
  summary: 'The task is complete.',
  acceptance: [],
  nextStep: { action: 'finish', instructions: '' },
  planVersion: plan.version,
  completionMarker: true,
};

test('plans remain actionable and revisions preserve stable acceptance IDs', () => {
  assert.throws(() => validatePlan({ ...input, steps: [] }), { code: 'planInvalid' });
  assert.throws(
    () => validatePlan({ ...input, criteria: [input.criteria[0], input.criteria[0]] }),
    { code: 'planInvalid' },
  );
  assert.throws(() => validatePlan(input, plan), { code: 'planRevisionInvalid' });
  assert.equal(
    validatePlan({ ...input, revisionReason: 'Address the observed issue.' }, plan).version,
    2,
  );
  assert.throws(
    () =>
      validatePlan(
        {
          ...input,
          revisionReason: 'Change direction',
          criteria: [{ ...input.criteria[0], id: 'new' }],
        },
        plan,
      ),
    { code: 'planRevisionInvalid' },
  );
});

test('Worker submissions may omit per-criterion command citations', () => {
  validateSubmission(submission, plan, new Map());
  validateSubmission(
    {
      ...submission,
      evidence: [
        { criterionId: 'not-in-plan', commandIds: ['unverified'], evidence: 'Observed output.' },
      ],
    },
    plan,
    new Map(),
  );
});

test('Pair-style finish requires pass, confidence threshold and the independent marker', () => {
  validateReview(review, plan, false);
  assert.throws(() => validateReview({ ...review, confidence: 0.79 }, plan, false), {
    code: 'reviewFinishInvalid',
  });
  assert.throws(() => validateReview({ ...review, completionMarker: false }, plan, false), {
    code: 'reviewFinishInvalid',
  });
  assert.throws(() => validateReview({ ...review, verdict: 'fail' }, plan, false), {
    code: 'reviewIncomplete',
  });
  assert.throws(() => validateReview(review, plan, true), { code: 'feedbackPending' });
});

test('pass/fail continue both require a revision plan and do not require successful commands', () => {
  const nextPlan = { ...input, revisionReason: 'Continue with the remaining request.' };
  for (const verdict of ['pass', 'fail'] as const) {
    validateReview(
      {
        ...review,
        verdict,
        confidence: verdict === 'pass' ? 0.95 : 0.4,
        acceptance: [],
        nextStep: { action: 'continue', instructions: 'Continue the work.' },
        nextPlan,
        completionMarker: false,
      },
      plan,
      false,
    );
  }
  assert.throws(
    () =>
      validateReview(
        {
          ...review,
          nextStep: { action: 'continue', instructions: 'Continue the work.' },
          completionMarker: false,
        },
        plan,
        false,
      ),
    { code: 'reviewIncomplete' },
  );
  assert.deepEqual(acceptanceBlockers(), []);
});

test('review tool contract exposes no command or mutation tools to Reviewer or planning', () => {
  for (const phase of ['planning', 'answering', 'reviewer'] as const) {
    const tools = agentTools(phase);
    const names = tools.map((tool) => tool.name);
    for (const denied of ['run_command', 'run_check', 'write_file', 'delete_file']) {
      assert.equal(names.includes(denied), false, `${phase} must not expose ${denied}`);
    }
    assert.ok(names.includes('read_file'));
    assert.ok(names.includes('task_diff'));
    assert.throws(
      () =>
        validateTool(
          {
            id: 'forbidden',
            name: 'run_command',
            arguments: JSON.stringify({
              name: 'test',
              command: 'npm test',
              purpose: 'verify',
              criterionIds: ['safety'],
            }),
          },
          tools,
        ),
      { code: 'toolNotAllowed' },
    );
  }
  const worker = agentTools('worker').map((tool) => tool.name);
  for (const allowed of ['run_command', 'run_check', 'write_file', 'delete_file']) {
    assert.ok(worker.includes(allowed));
  }
});

test('nested tool schemas and execution configuration remain bounded', () => {
  const worker = agentTools('worker');
  assert.throws(
    () =>
      validateTool(
        {
          id: 'bad',
          name: 'write_file',
          arguments: JSON.stringify({ path: 'a', content: 'b', extra: true }),
        },
        worker,
      ),
    { code: 'toolArgumentsInvalid' },
  );
  const commands = validateConfig({
    customCommandsEnabled: false,
    prepare: [],
    checks: [],
  });
  assert.equal(commands.customCommandsEnabled, false);
  assert.deepEqual(commands.checks, []);
});

test('review completion messages remain bilingual and describe the independent marker', () => {
  assert.equal(
    formatError('en', { code: 'reviewFinishInvalid' }),
    errorMessages.reviewFinishInvalid[0],
  );
  assert.equal(
    formatError('zh-CN', { code: 'reviewFinishInvalid' }),
    errorMessages.reviewFinishInvalid[1],
  );
  assert.match(errorMessages.reviewCorrectionExhausted[0], /one correction/i);
});

test('invalid finish faults stay redacted and visible in both locales', () => {
  let fault;
  try {
    validateReview({ ...review, completionMarker: false }, plan, false);
    assert.fail('A finish review without the marker must be rejected.');
  } catch (error) {
    fault = redactError({
      ...toAppError(error),
      details: 'Review note: Bearer private-token',
    });
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
    assert.match(html, locale === 'en' ? /standalone TASK_COMPLETE/ : /TASK_COMPLETE 行/);
    assert.match(html, /redacted/);
    assert.doesNotMatch(html, /private-token/);
    assert.match(html, /data-outcome="failed"/);
  }
});
