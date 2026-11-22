import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreChatViews, restoreWorkbenchView, toggleId } from '../../webview/src/chatViewState';
import { fixture, taskInput } from './fixtures';

test('Webview restoration accepts legacy navigation and preserves only per-task display data', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const tasks = (await f.store.snapshot()).tasks,
    id = tasks[0].id;
  const legacy = { view: 'task', taskId: id };
  assert.deepEqual(restoreWorkbenchView(legacy, tasks), {
    version: 1,
    navigation: legacy,
    chats: {},
  });
  const state = restoreWorkbenchView(
    {
      version: 1,
      navigation: legacy,
      chats: {
        [id]: {
          panel: 'minimized',
          expandedMessages: ['first', 'first', 123],
          minimizedMessages: ['error'],
          expandedEvidence: ['run:1'],
          minimizedEvidence: ['run:2'],
          scope: { runId: 'run', through: 10 },
          evidenceTop: 120,
          seenRecords: 100,
          seenErrors: 2,
          text: 'not persisted',
        },
        deleted: { panel: 'open' },
      },
    },
    tasks,
  );
  assert.equal(state.chats[id].panel, 'minimized');
  assert.deepEqual(state.chats[id].expandedMessages, ['first']);
  assert.equal(state.chats[id].scope?.through, 10);
  assert.equal(state.chats[id].evidenceTop, 120);
  assert.ok(!JSON.stringify(state).includes('not persisted'));
  assert.equal(state.chats.deleted, undefined);
  assert.deepEqual(restoreWorkbenchView(state, tasks), state);
  assert.deepEqual(
    restoreChatViews(
      {
        [id]: {
          panel: 'unexpected',
          expandedMessages: false,
          evidenceTop: -1,
          seenRecords: Infinity,
          scope: { through: 'x' },
        },
      },
      tasks,
    ),
    { [id]: {} },
  );
  assert.deepEqual(toggleId(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(toggleId(['a'], 'a', true), ['a']);
});
