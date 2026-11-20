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

test('answering tools are read-only and answers cannot substitute for task acceptance', () => {
  const tools = agentTools('answering');
  assert.ok(tools.some((t) => t.name === 'submit_answer'));
  for (const name of [
    'write_file',
    'delete_file',
    'run_command',
    'run_check',
    'finish_work',
    'submit_review',
  ]) {
    assert.throws(
      () => validateTool({ id: 'call', name, arguments: '{}' }, tools),
      (e: unknown) => e instanceof OperationError && e.code === 'toolNotAllowed',
    );
  }
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
