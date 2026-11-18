import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore, globalStorageKey, workspaceStorageKey, secretKey } from '../../src/core/store';
import { resolveLocale } from '../../src/shared/model';
import { builtInRole } from '../../src/shared/roles';
import { messageKeys, t } from '../../src/shared/i18n';
import { fixture, taskInput, Memory } from './fixtures';

test('auto language resolves Chinese variants; explicit settings override editor language', () => {
  for (const value of ['zh', 'zh-cn', 'zh-TW', 'zh-Hans']) {
    assert.equal(resolveLocale('auto', value), 'zh-CN');
  }
  assert.equal(resolveLocale('auto', 'de'), 'en');
  assert.equal(resolveLocale('en', 'zh-cn'), 'en');
  assert.equal(resolveLocale('zh-CN', 'en'), 'zh-CN');
  for (const key of messageKeys) {
    assert.ok(t('en', key));
    assert.ok(t('zh-CN', key));
  }
});
test('saves drafts without APIs and persists across reopening', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const reopened = await new LocalStore(f.ports).snapshot();
  assert.equal(reopened.tasks.length, 1);
  assert.equal(reopened.tasks[0].status, 'draft');
  assert.equal(reopened.tasks[0].maxRounds, 5);
  assert.equal(reopened.selectedTaskId, reopened.tasks[0].id);
});
test('workspace records are isolated while connections and roles are user-scoped', async () => {
  const shared = new Memory(),
    a = fixture({ global: shared }),
    b = fixture({ global: shared });
  await a.store.dispatch({ kind: 'task.save', input: taskInput() });
  await a.store.dispatch({
    kind: 'role.save',
    locale: 'en',
    input: { name: 'Audit', purpose: '', instructions: 'Check boundaries.' },
  });
  assert.equal((await b.store.snapshot()).tasks.length, 0);
  assert.ok((await b.store.snapshot()).roles.some((role) => role.name === 'Audit'));
});
test('task creation captures a locale-specific role that survives edits, reset and language changes', async () => {
  const f = fixture({ editorLanguage: 'zh-cn' });
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const original = (await f.store.snapshot()).tasks[0];
  await f.store.dispatch({
    kind: 'role.save',
    id: 'bug',
    locale: 'zh-CN',
    input: { name: 'ignored', purpose: '自定义说明', instructions: '只修改中文版。' },
  });
  assert.equal((await f.store.snapshot()).roles[0].name, builtInRole('bug', 'zh-CN').name);
  await f.store.dispatch({ kind: 'language.set', value: 'en' });
  assert.deepEqual((await f.store.snapshot()).tasks[0].role, original.role);
  assert.equal(
    (await f.store.snapshot()).roles[0].instructions,
    builtInRole('bug', 'en').instructions,
  );
  await f.store.dispatch({
    kind: 'role.save',
    id: 'bug',
    locale: 'en',
    input: { name: 'Bug', purpose: 'EN override', instructions: 'Edited English only.' },
  });
  await f.store.dispatch({ kind: 'role.reset', id: 'bug', locale: 'en', confirmed: true });
  await f.store.dispatch({ kind: 'language.set', value: 'zh-CN' });
  assert.equal((await f.store.snapshot()).roles[0].instructions, '只修改中文版。');
  assert.deepEqual((await f.store.snapshot()).tasks[0].role, original.role);
});
test('custom role text is never translated and deleted presets leave existing snapshots editable', async () => {
  const f = fixture();
  const text = {
    name: '安全检查',
    purpose: '原文 purpose',
    instructions: '  Keep user formatting.\n检查安全边界。',
  };
  await f.store.dispatch({ kind: 'role.save', locale: 'en', input: text });
  const role = (await f.store.snapshot()).roles.find((r) => !r.builtIn)!;
  await f.store.dispatch({ kind: 'task.save', input: taskInput({ roleId: role.id }) });
  const task = (await f.store.snapshot()).tasks[0];
  await f.store.dispatch({ kind: 'language.set', value: 'zh-CN' });
  assert.equal(
    (await f.store.snapshot()).roles.find((r) => r.id === role.id)!.instructions,
    text.instructions,
  );
  await f.store.dispatch({ kind: 'role.delete', id: role.id, confirmed: true });
  await f.store.dispatch({
    kind: 'task.save',
    id: task.id,
    input: taskInput({ roleId: role.id, maxRounds: 9 }),
  });
  const next = (await f.store.snapshot()).tasks[0];
  assert.equal(next.maxRounds, 9);
  assert.deepEqual(next.role, task.role);
  assert.equal(next.role.locale, 'original');
});
test('API keys never enter snapshots or ordinary state; cancellation preserves the stored key', async () => {
  const f = fixture();
  await f.store.dispatch({
    kind: 'connection.save',
    input: {
      name: 'Local',
      baseUrl: 'http://localhost:8000/v1',
      defaultModel: 'test-model',
      apiKey: 'must-not-be-stored',
    },
  });
  const c = (await f.store.snapshot()).connections[0];
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  assert.equal(f.secrets.get(secretKey(c.id)), 'test-only-key');
  const snapshot = await f.store.snapshot();
  assert.equal(snapshot.connections[0].hasKey, true);
  const serialized = JSON.stringify([snapshot, [...f.global.values], [...f.workspace.values]]);
  assert.ok(!serialized.includes('test-only-key'));
  assert.ok(!serialized.includes('must-not-be-stored'));
  f.setKey(undefined);
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  assert.equal(f.secrets.get(secretKey(c.id)), 'test-only-key');
});
test('deleting a connection clears defaults and secret, but keeps referencing drafts', async () => {
  const f = fixture();
  await f.store.dispatch({
    kind: 'connection.save',
    input: { name: 'Endpoint', baseUrl: 'https://example.test/v1', defaultModel: 'model' },
  });
  const c = (await f.store.snapshot()).connections[0];
  const binding = { connectionId: c.id, model: 'model' };
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  await f.store.dispatch({ kind: 'defaults.save', input: { worker: binding, reviewer: binding } });
  await f.store.dispatch({
    kind: 'task.save',
    input: taskInput({ worker: binding, reviewer: binding }),
  });
  await f.store.dispatch({ kind: 'connection.delete', id: c.id, confirmed: true });
  const s = await f.store.snapshot();
  assert.equal(s.connections.length, 0);
  assert.equal(s.defaults.worker.connectionId, '');
  assert.equal(s.tasks[0].worker.connectionId, c.id);
  assert.equal(f.secrets.size, 0);
});
test('failed metadata deletion restores the key and retains the connection', async () => {
  const f = fixture();
  await f.store.dispatch({
    kind: 'connection.save',
    input: { name: 'Endpoint', baseUrl: 'https://example.test/v1', defaultModel: 'model' },
  });
  const c = (await f.store.snapshot()).connections[0];
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  f.global.fail = true;
  await assert.rejects(f.store.dispatch({ kind: 'connection.delete', id: c.id, confirmed: true }));
  assert.equal((await f.store.snapshot()).connections.length, 1);
  assert.equal(f.secrets.get(secretKey(c.id)), 'test-only-key');
});
test('deletion requires confirmation and leaves other tasks intact', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  await f.store.dispatch({ kind: 'task.save', input: taskInput({ name: 'Second' }) });
  const before = await f.store.snapshot();
  const id = before.tasks[0].id;
  await assert.rejects(f.store.dispatch({ kind: 'task.delete', id }), { code: 'invalidMessage' });
  await f.store.dispatch({ kind: 'task.delete', id, confirmed: true });
  const after = await f.store.snapshot();
  assert.deepEqual(after.tasks, [before.tasks[1]]);
  assert.equal(after.selectedTaskId, before.tasks[1].id);
});
test('validates requests, URLs, roles and round limits at the host boundary', async () => {
  const f = fixture();
  for (const action of [null, { kind: 'run-model' }, { kind: 'language.set', value: 'xx' }]) {
    await assert.rejects(f.store.dispatch(action), { code: 'invalidMessage' });
  }
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(
      f.store.dispatch({ kind: 'task.save', input: taskInput({ maxRounds: value }) }),
      { code: 'invalidRounds' },
    );
  }
  for (const baseUrl of ['relative/path', 'file:///etc/passwd', 'https://name:key@example.test']) {
    await assert.rejects(
      f.store.dispatch({
        kind: 'connection.save',
        input: { name: 'x', baseUrl, defaultModel: 'm' },
      }),
      { code: 'invalidUrl' },
    );
  }
  await assert.rejects(f.store.dispatch({ kind: 'role.delete', id: 'bug', confirmed: true }), {
    code: 'builtInProtected',
  });
  await assert.rejects(
    f.store.dispatch({ kind: 'task.save', input: taskInput({ roleId: 'unknown' }) }),
    { code: 'notFound' },
  );
});
test('serializes rapid mutations without losing tasks', async () => {
  const f = fixture();
  await Promise.all(
    Array.from({ length: 8 }, (_, n) =>
      f.store.dispatch({ kind: 'task.save', input: taskInput({ name: `Task ${n}` }) }),
    ),
  );
  assert.equal((await f.store.snapshot()).tasks.length, 8);
});
test('without a workspace settings remain usable but task mutations are rejected', async () => {
  const f = fixture({ hasWorkspace: false });
  await f.store.dispatch({ kind: 'language.set', value: 'zh-CN' });
  assert.equal((await f.store.snapshot()).locale, 'zh-CN');
  await assert.rejects(f.store.dispatch({ kind: 'task.save', input: taskInput() }), {
    code: 'workspaceRequired',
  });
  await f.store.dispatch({ kind: 'workspace.open' });
  assert.equal(f.wasOpened(), true);
});
test('unsupported saved data is reported and never overwritten', async () => {
  const f = fixture();
  await f.global.update(globalStorageKey, { version: 99 });
  await assert.rejects(f.store.snapshot(), { code: 'invalidStoredData' });
  await assert.rejects(f.store.dispatch({ kind: 'task.save', input: taskInput() }), {
    code: 'invalidStoredData',
  });
  assert.deepEqual(f.global.get(globalStorageKey, null), { version: 99 });
  assert.equal(f.workspace.values.has(workspaceStorageKey), false);
});
