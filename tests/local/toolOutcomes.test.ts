import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureCount, fatalToolFault } from '../../src/execution/toolOutcomes';
import { acceptanceBlockers } from '../../src/shared/acceptance';
import type { ToolBudget, ToolOutcome } from '../../src/shared/toolOutcome';
const failed: ToolOutcome = {
  operationId: 'op',
  callId: 'call',
  requestId: 'req',
  tool: 'run_command',
  execution: 'executed',
  status: 'failed',
  fault: { code: 'commandFailed', params: { name: 'First label', exitCode: 7 } },
};
test('repeat tracking ignores display labels and readonly diagnostics, but honors real state changes', () => {
  const budget: ToolBudget = { turn: 1, corrections: 0 };
  const args = {
    name: 'First label',
    command: 'test program',
    purpose: 'explore',
    criterionIds: [],
  };
  assert.equal(failureCount(budget, 'run_command', args, failed, 'revision'), 1);
  failureCount(
    budget,
    'list_files',
    {},
    { ...failed, tool: 'list_files', status: 'succeeded' },
    'revision',
  );
  assert.equal(
    failureCount(
      budget,
      'run_command',
      { ...args, name: 'Changed label', cwd: '.', timeoutSeconds: 180 },
      { ...failed, fault: { code: 'commandFailed', params: { name: 'Other label', exitCode: 7 } } },
      'revision',
    ),
    2,
  );
  assert.equal(failureCount(budget, 'run_command', args, failed, 'revision'), 3);
  assert.equal(failureCount(budget, 'run_command', args, failed, 'changed'), 1);
  failureCount(budget, 'run_command', args, { ...failed, status: 'succeeded' }, 'changed');
  assert.equal(failureCount(budget, 'run_command', args, failed, 'changed'), 1);
});
test('ordinary tool faults remain correctable while lost ownership and unknown cleanup stop the loop', () => {
  for (const code of [
    'toolFileMissing',
    'toolPermission',
    'invalidPath',
    'commandFailed',
    'commandTimeout',
  ] as const) {
    assert.equal(fatalToolFault({ code }), false);
  }
  for (const code of [
    'workspaceChanged',
    'workspaceUntrusted',
    'accessDenied',
    'persistenceFailed',
    'commandShutdown',
  ] as const) {
    assert.equal(fatalToolFault({ code }), true);
  }
  assert.deepEqual(acceptanceBlockers(), []);
});

test('implicit read defaults and explicit equivalent arguments share a failure identity', () => {
  const budget: ToolBudget = { turn: 1, corrections: 0 };
  const fault: ToolOutcome = { ...failed, tool: 'read_file', fault: { code: 'toolFileMissing' } };
  assert.equal(failureCount(budget, 'read_file', { path: 'missing' }, fault, 'revision'), 1);
  assert.equal(
    failureCount(
      budget,
      'read_file',
      { path: 'missing', startLine: 1, lineCount: 200 },
      fault,
      'revision',
    ),
    2,
  );
  assert.equal(
    failureCount(budget, 'read_file', { path: 'missing', startLine: 2 }, fault, 'revision'),
    1,
  );
});
