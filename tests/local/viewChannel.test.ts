import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ViewChannel } from '../../src/core/viewChannel';
import { chooseWorkbenchView } from '../../src/shared/viewState';
import type { TaskDraft } from '../../src/shared/model';

const task = { id: 'task-1' } as TaskDraft;

test('a replaced page cannot acknowledge or send replies to the new page', async () => {
  let current: ViewChannel<string>;
  const sent: string[] = [];
  const old: ViewChannel<string> = new ViewChannel<string>(
    () => current === old,
    async (value) => sent.push(value),
  );
  current = old;
  const waiting = assert.rejects(old.ready, { code: 'workbenchClosed' });
  const next: ViewChannel<string> = new ViewChannel<string>(
    () => current === next,
    async (value) => sent.push(value),
  );
  current = next;
  old.acknowledge();
  await old.send('late reply');
  old.dispose();
  await waiting;
  next.acknowledge();
  await next.ready;
  await next.send('current reply');
  assert.deepEqual(sent, ['current reply']);
  next.dispose();
});

test('render timeout is recoverable with a fresh handshake', async () => {
  const channel = new ViewChannel<string>(
    () => true,
    async () => undefined,
    10,
  );
  await assert.rejects(channel.ready, { code: 'workbenchTimeout' });
  assert.equal(channel.needsReload, true);
  channel.reset();
  channel.acknowledge();
  await channel.ready;
  assert.equal(channel.needsReload, false);
  channel.dispose();
});

test('closing during initialization rejects waiters and discards subsequent callbacks', async () => {
  let sent = 0;
  const channel = new ViewChannel<string>(
    () => true,
    async () => sent++,
  );
  const waiting = assert.rejects(channel.ready, { code: 'workbenchClosed' });
  channel.dispose();
  channel.dispose();
  channel.acknowledge();
  channel.reset();
  await channel.send('closed');
  await waiting;
  assert.equal(sent, 0);
});

test('migration uses sidebar state before legacy navigation and imports display fields only', () => {
  const legacy = {
    version: 1,
    navigation: { view: 'task', taskId: task.id },
    chats: { [task.id]: { panel: 'minimized', detailsExpanded: true, secret: 'do-not-copy' } },
    secret: 'do-not-copy',
  };
  assert.deepEqual(chooseWorkbenchView(undefined, undefined, legacy, [task]), {
    version: 1,
    navigation: { view: 'task', taskId: task.id },
    chats: { [task.id]: { detailsExpanded: true, panel: 'minimized' } },
  });
  const saved = { version: 1, navigation: { view: 'home' }, chats: {} };
  assert.deepEqual(chooseWorkbenchView(undefined, saved, legacy, [task]), saved);
  const local = { view: 'roles', returnTo: { view: 'home' } };
  assert.deepEqual(chooseWorkbenchView(local, saved, legacy, [task])?.navigation, local);
});

test('legacy state drops removed tasks, invalid details and unrecognized content', () => {
  assert.equal(chooseWorkbenchView(null, {}, { password: 'never retain' }, [task]), undefined);
  const old = {
    version: 1,
    navigation: { view: 'task', taskId: 'deleted' },
    chats: {
      deleted: { panel: 'open' },
      [task.id]: { detailsExpanded: 'yes', expandedMessages: ['m1', 'm1', 7] },
    },
  };
  assert.deepEqual(chooseWorkbenchView(undefined, undefined, old, [task]), {
    version: 1,
    navigation: { view: 'home' },
    chats: { [task.id]: { expandedMessages: ['m1'] } },
  });
});

test('a late successful render replaces the rejected handshake for future opens', async () => {
  const channel = new ViewChannel<string>(
    () => true,
    async () => undefined,
    10,
  );
  const timedOut = channel.ready;
  await assert.rejects(timedOut, { code: 'workbenchTimeout' });
  channel.acknowledge();
  assert.notEqual(channel.ready, timedOut);
  await channel.ready;
  assert.equal(channel.needsReload, false);
  channel.dispose();
});
