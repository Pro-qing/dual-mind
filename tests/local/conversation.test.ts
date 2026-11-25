import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunRecords } from '../../src/execution/records';
import { fixture } from './fixtures';
import { agentTools, validateTool } from '../../src/execution/contracts';
import { OperationError } from '../../src/shared/errors';

test('conversation pagination spans runs, preserves stable IDs and recovers processing messages', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-conversation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(),
    taskId = randomUUID();
  const records = new RunRecords(f.workspace, () => root);
  await records.initialize();
  const runId = randomUUID();
  records.runs.push({
    id: runId,
    taskId,
    status: 'worker',
    round: 1,
    maxRounds: 5,
    createdAt: '',
    updatedAt: '',
    sequence: 3,
  });
  for (let i = 0; i < 85; i++) {
    await records.putMessage({
      id: randomUUID(),
      taskId,
      time: new Date(1700000000000 + i).toISOString(),
      role: 'user',
      kind: 'message',
      text: `Question ${i}`,
      status: i === 84 ? 'processing' : 'handled',
    });
  }
  await records.event({
    runId,
    taskId,
    sequence: 1,
    time: '2026-11-20T00:00:00.000Z',
    kind: 'review',
    text: 'Legacy result without role',
  });
  await records.event({
    runId,
    taskId,
    sequence: 2,
    time: '2026-11-20T00:00:01.000Z',
    kind: 'text',
    agent: 'worker',
    requestId: 'request',
    text: 'First chunk ',
  });
  await records.event({
    runId,
    taskId,
    sequence: 3,
    time: '2026-11-20T00:00:01.100Z',
    kind: 'text',
    agent: 'worker',
    requestId: 'request',
    text: 'last chunk',
  });
  await records.save();
  const all = [];
  let before: string | undefined;
  do {
    const page = await records.conversation(taskId, before);
    all.push(...page.messages);
    before = page.before;
  } while (before);
  assert.equal(all.length, 86);
  assert.equal(new Set(all.map((m) => m.id)).size, 86);
  assert.equal(all.find((m) => m.kind === 'legacy')?.role, 'system');
  const evidence = await records.evidence(taskId);
  assert.equal(evidence.events.length, 1);
  assert.equal(evidence.events[0].text, 'First chunk last chunk');
  const recovered = new RunRecords(f.workspace, () => root);
  await recovered.initialize();
  assert.equal(recovered.runs[0].status, 'interrupted');
  assert.equal((await recovered.pending(taskId))[0].status, 'pending');
  assert.equal((await recovered.pending(taskId))[0].fault?.code, 'executionInterrupted');
});

test('answering and reviewer are read-only while Worker retains source tools', () => {
  const tools = agentTools('answering');
  assert.ok(tools.some((t) => t.name === 'submit_answer'));
  const reviewerTools = agentTools('reviewer');
  assert.ok(reviewerTools.some((tool) => tool.name === 'submit_review'));
  for (const name of [
    'run_command',
    'write_file',
    'delete_file',
    'run_check',
    'finish_work',
    'submit_review',
  ]) {
    assert.throws(
      () => validateTool({ id: 'call', name, arguments: '{}' }, tools),
      (e: unknown) => e instanceof OperationError && e.code === 'toolNotAllowed',
    );
  }
  for (const name of ['run_command', 'write_file', 'delete_file', 'run_check', 'finish_work']) {
    assert.throws(
      () => validateTool({ id: 'call', name, arguments: '{}' }, reviewerTools),
      (e: unknown) => e instanceof OperationError && e.code === 'toolNotAllowed',
    );
  }
  assert.ok(agentTools('worker').some((tool) => tool.name === 'write_file'));
  assert.throws(() =>
    validateTool(
      { id: 'call', name: 'submit_answer', arguments: '{"answer":"done"}' },
      agentTools('reviewer'),
    ),
  );
});

test('message redaction preserves text beyond the error-detail limit', async () => {
  const f = fixture();
  await f.store.dispatch({
    kind: 'connection.save',
    input: { name: 'test', baseUrl: 'http://localhost:12345', defaultModel: '' },
  });
  const connection = (await f.store.snapshot()).connections[0];
  f.setKey('test-secret-message');
  await f.store.dispatch({ kind: 'connection.key', id: connection.id });
  const text = 'x'.repeat(30000) + 'test-secret-message' + 'END';
  const clean = await f.store.publicText(text);
  assert.ok(clean.startsWith('x'.repeat(30000)));
  assert.ok(clean.endsWith('[redacted]END'));
  f.ports.secrets.get = async () => {
    throw new Error('secret storage unavailable');
  };
  await assert.rejects(f.store.publicText(text));
});

test('public process projection merges full history by run, role and request with stable pagination', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-process-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(),
    taskId = randomUUID();
  const records = new RunRecords(f.workspace, () => root);
  await records.initialize();
  const runId = randomUUID();
  records.runs.push({
    id: runId,
    taskId,
    status: 'worker',
    round: 1,
    maxRounds: 2,
    createdAt: '',
    updatedAt: '',
    sequence: 0,
  });
  let sequence = 0;
  const event = async (
    text: string,
    agent: 'worker' | 'reviewer' | null = 'worker',
    requestId = 'same-request',
  ) => {
    sequence++;
    await records.event({
      runId,
      taskId,
      agent: agent ?? undefined,
      requestId,
      kind: 'text',
      text,
      sequence,
      time: new Date(1700000000000 + sequence).toISOString(),
    });
    records.runs[0].sequence = sequence;
  };
  for (let n = 0; n < 100; n++) {
    await event(`chunk-${n} `);
  }
  const before = (await records.conversation(taskId, undefined, true)).messages[0];
  assert.equal(before.kind, 'process');
  assert.equal(before.requestId, 'same-request');
  assert.ok(before.text.startsWith('chunk-0 '));
  assert.ok(before.text.endsWith('chunk-99 '));
  assert.equal((await records.conversation(taskId)).messages.length, 0);
  await event('tail');
  const after = (await records.conversation(taskId, undefined, true)).messages[0];
  assert.equal(after.id, before.id);
  assert.equal(after.time, before.time);
  assert.equal(after.sequence, 101);
  assert.ok(after.text.endsWith('tail'));
  await event('Reviewer-only', 'reviewer');
  await event('Unattributed legacy text', null);
  // A different role and subsequent requests cannot be merged into Worker text.
  for (let n = 0; n < 45; n++) {
    await event(`request-${n}`, 'worker', `request-${n}`);
  }
  await records.save();
  const recovered = new RunRecords(f.workspace, () => root);
  await recovered.initialize();
  const messages = [];
  let cursor: string | undefined;
  do {
    const page = await recovered.conversation(taskId, cursor, true);
    messages.push(...page.messages);
    cursor = page.before;
  } while (cursor);
  assert.equal(messages.length, 47);
  assert.equal(new Set(messages.map((m) => m.id)).size, 47);
  assert.equal(messages.find((m) => m.id === before.id)!.text, after.text);
  assert.equal(messages.find((m) => m.role === 'reviewer')!.text, 'Reviewer-only');
  assert.ok(!messages.some((m) => m.text.includes('Unattributed')));
  const otherRun = randomUUID();
  records.runs.push({ ...records.runs[0], id: otherRun });
  await records.event({
    runId: otherRun,
    taskId,
    sequence: 1,
    agent: 'worker',
    requestId: 'same-request',
    kind: 'text',
    text: 'New run',
    time: '2026-11-22T00:00:00Z',
  });
  const latest = (await records.conversation(taskId, undefined, true)).messages;
  assert.ok(latest.some((m) => m.runId === otherRun && m.text === 'New run'));
  await assert.rejects(records.conversation(taskId, undefined, 'yes' as unknown as boolean), {
    code: 'conversationUnavailable',
  });
});

test('evidence totals count grouped records beyond pagination and do not count streaming chunks twice', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-evidence-counts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(),
    taskId = randomUUID(),
    runId = randomUUID();
  const records = new RunRecords(f.workspace, () => root);
  await records.initialize();
  records.runs.push({
    id: runId,
    taskId,
    status: 'completed',
    round: 1,
    maxRounds: 1,
    createdAt: '',
    updatedAt: '',
    sequence: 102,
  });
  for (let sequence = 1; sequence <= 100; sequence++) {
    await records.event({
      runId,
      taskId,
      sequence,
      kind: 'tool',
      text: 'record',
      time: new Date(1700000000000 + sequence).toISOString(),
      ...(sequence % 2 === 0 ? { fault: { code: 'commandFailed' as const } } : {}),
    });
  }
  for (const sequence of [101, 102]) {
    await records.event({
      runId,
      taskId,
      sequence,
      kind: 'text',
      agent: 'reviewer',
      requestId: 'same',
      text: 'chunk',
      time: new Date(1700000000000 + sequence).toISOString(),
    });
  }
  const page = await records.evidence(taskId);
  assert.equal(page.events.length, 80);
  assert.deepEqual(page.summary, { records: 101, errors: 50, blockers: 0 });
  assert.deepEqual(
    (await records.evidence(taskId, undefined, undefined, page.before)).summary,
    page.summary,
  );
  assert.deepEqual((await records.evidence(taskId, runId, 10)).summary, {
    records: 10,
    errors: 5,
    blockers: 0,
  });
});

test('command failures remain review evidence rather than acceptance blockers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-blockers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(),
    taskId = randomUUID(),
    records = new RunRecords(f.workspace, () => root);
  await records.initialize();
  const base: import('../../src/shared/execution').RunSummary = {
    id: randomUUID(),
    taskId,
    status: 'completed',
    round: 1,
    maxRounds: 1,
    createdAt: '',
    updatedAt: '',
    sequence: 1,
    plan: {
      version: 1,
      objective: 'Verify',
      requirements: 'Verify',
      steps: ['Test'],
      revisionReason: '',
      criteria: [
        { id: 'test', description: 'Pass', verification: 'command', evidence: 'Test', reason: '' },
      ],
    },
    submission: {
      summary: 'Done',
      completedSteps: ['Test'],
      evidence: [{ criterionId: 'test', commandIds: [], evidence: 'Test' }],
      unresolved: [],
      planVersion: 1,
      revision: 'current',
    },
  };
  const old = { ...base, id: randomUUID() };
  records.runs = [base, old];
  for (const [run, ok] of [
    [base, true],
    [old, false],
  ] as const) {
    await records.event({
      runId: run.id,
      taskId,
      sequence: 1,
      time: '',
      kind: 'check',
      text: 'output',
      detail: {
        type: 'command',
        command: {
          id: randomUUID(),
          name: 'Test',
          program: 'test',
          args: [],
          cwd: '.',
          timeoutSeconds: 10,
          purpose: 'verify',
          criterionIds: ['test'],
          planVersion: 1,
          round: 1,
          before: 'current',
          after: 'current',
          ok,
          exitCode: ok ? 0 : 1,
        },
      },
    });
  }
  assert.equal((await records.evidence(taskId)).summary?.errors, 1);
  assert.equal((await records.evidence(taskId)).summary?.blockers, 0);
  assert.equal((await records.evidence(taskId, old.id)).summary?.blockers, 0);
});
