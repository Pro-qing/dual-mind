import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, appendFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import {
  RecoveryStore,
  type RecoveryState,
  type RecoveryOperation,
} from '../../src/execution/recovery';
import { fixture, taskInput } from './fixtures';
import { recoverProcess } from '../../src/execution/processTree';

async function data() {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const task = (await f.store.snapshot()).tasks[0];
  const id = randomUUID();
  const state: RecoveryState = {
    version: 1,
    task,
    config: { prepare: [], checks: [] },
    summary: {
      id,
      taskId: task.id,
      status: 'worker',
      round: 1,
      maxRounds: 5,
      createdAt: '',
      updatedAt: '',
      sequence: 0,
    },
    generation: 1,
    cursor: { stage: 'worker', index: 0 },
    budgets: {},
    turn: 0,
    corrections: 0,
    handling: [],
    feedback: [],
    reviewFeedback: false,
  };
  return { id, state };
}
test('recovery journal validates order, snapshots, completed results and a torn tail', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'dualmind-journal-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { id, state } = await data();
  const records = new RecoveryStore(folder, id);
  await records.state(state);
  const op: RecoveryOperation = {
    id: randomUUID(),
    generation: 1,
    kind: 'tool',
    name: 'write_file',
    status: 'started',
    time: '',
  };
  await records.operation(op);
  await records.operation({ ...op, status: 'succeeded', result: { written: 'a.txt' } });
  state.cursor = { stage: 'checking', index: 2 };
  await records.state(state);
  await appendFile(join(folder, `${id}.journal`), '{"partial":');
  const reopened = new RecoveryStore(folder, id);
  const loaded = await reopened.load();
  assert.equal(loaded?.torn, true);
  assert.equal(loaded?.state.cursor.index, 2);
  assert.equal(loaded?.operations[0].status, 'succeeded');
  await reopened.state(state);
  assert.equal((await new RecoveryStore(folder, id).load())?.torn, false);
  assert.ok((await readdir(folder)).every((file) => !file.endsWith('.tmp')));
  const path = join(folder, `${id}.journal`);
  const original = await readFile(path, 'utf8');
  await writeFile(path, original.replace('write_file', 'delete_file'));
  await assert.rejects(new RecoveryStore(folder, id).load(), { code: 'recoveryInvalid' });
  assert.equal(
    await readFile(path, 'utf8'),
    original.replace('write_file', 'delete_file'),
    'damage must not be silently rewritten',
  );
});
test('damaged snapshot falls back to validated journal but a conflicting checkpoint blocks recovery', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'dualmind-snapshot-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { id, state } = await data();
  const records = new RecoveryStore(folder, id);
  await records.state(state);
  state.turn = 1;
  await records.state(state);
  await writeFile(join(folder, `${id}.checkpoint`), '{broken');
  assert.equal((await new RecoveryStore(folder, id).load())?.state.turn, 1);
  await writeFile(
    join(folder, `${id}.checkpoint`),
    JSON.stringify({ sequence: 9, hash: 'invalid', state }),
  );
  await assert.rejects(new RecoveryStore(folder, id).load(), { code: 'recoveryInvalid' });
});
test('storage failure poisons the writer so later actions cannot advance the journal', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'dualmind-persist-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { id, state } = await data();
  const unavailable = join(folder, 'not-a-directory');
  await writeFile(unavailable, 'preserved');
  const records = new RecoveryStore(unavailable, id);
  await assert.rejects(records.state(state), { code: 'persistenceFailed' });
  await assert.rejects(records.state(state), { code: 'persistenceFailed' });
  assert.equal(await readFile(unavailable, 'utf8'), 'preserved');
});
for (const mode of ['started', 'completed', 'torn']) {
  test(`process crash preserves the distinction between written artifacts and recorded results (${mode})`, async (t) => {
    const folder = await mkdtemp(join(tmpdir(), 'dualmind-crash-'));
    t.after(() => rm(folder, { recursive: true, force: true }));
    const { id, state } = await data();
    await new RecoveryStore(folder, id).state(state);
    const executable = join(folder, 'child.cjs');
    await build({
      entryPoints: [resolve('tests/local/fixtures/recovery-crash.ts')],
      outfile: executable,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      logLevel: 'silent',
    });
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, [executable, folder, id, randomUUID(), mode], {
          stdio: 'ignore',
        });
        const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          clearTimeout(timeout);
          resolve({ code, signal });
        });
      },
    );
    assert.notEqual(exit.code, 0);
    assert.equal(await readFile(join(folder, 'artifact.txt'), 'utf8'), 'written before crash');
    const saved = await new RecoveryStore(folder, id).load();
    assert.equal(saved?.operations[0].status, mode === 'completed' ? 'succeeded' : 'started');
    assert.equal(saved?.torn, mode === 'torn');
    if (mode !== 'completed') {
      assert.equal(
        saved?.operations[0].result,
        undefined,
        'a changed artifact is not proof of tool completion',
      );
    }
  });
}
test('missing or invalid process identity cannot authorize a resumed command', async () => {
  await assert.rejects(recoverProcess(), { code: 'recoveryProcessUnknown' });
  await assert.rejects(recoverProcess({ platform: process.platform, pid: -1, created: '' }), {
    code: 'recoveryProcessUnknown',
  });
});

test(
  'saved process creation identity prevents killing a reused PID and cleans up the original group',
  { skip: process.platform === 'win32' },
  async (t) => {
    const { processIdentity, groupAlive } = await import('../../src/execution/processTree');
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      detached: true,
      stdio: 'ignore',
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const identity = await processIdentity(child.pid!);
    assert.ok(identity);
    t.after(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        /* Already stopped. */
      }
    });
    await assert.rejects(recoverProcess({ ...identity, created: 'different-creation-time' }), {
      code: 'recoveryProcessUnknown',
    });
    assert.equal(await groupAlive(child.pid!), true, 'mismatched PID must not be killed');
    await recoverProcess(identity);
    assert.equal(await groupAlive(child.pid!), false);
  },
);
