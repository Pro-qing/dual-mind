import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRequests, recordRole, mergeRequests } from '../../webview/src/requestGrouping';
import { restoreChatViews } from '../../src/shared/viewState';
import type { TaskMessage } from '../../src/shared/execution';

test('request grouping uses stable IDs, separates legacy records and orders each role by time', () => {
  const message = (
    id: string,
    request: string | undefined,
    role: TaskMessage['role'],
    time: string,
  ): TaskMessage => ({
    id,
    taskId: 'task',
    userRequestId: request,
    role,
    kind: 'process',
    time,
    text: 'Same text',
  });
  const items = [
    message('b', 'second', 'worker', '03'),
    message('a', 'first', 'reviewer', '02'),
    message('legacy', undefined, 'system', '00'),
    message('c', 'second', 'worker', '01'),
  ];
  const requests = [
    { id: 'first', text: 'Repeated request', time: '00' },
    { id: 'second', text: 'Repeated request', time: '01' },
  ];
  const groups = groupRequests(items, requests);
  assert.deepEqual(
    groups.map((group) => group.id),
    ['legacy', 'first', 'second'],
  );
  assert.deepEqual(
    groups[2].items.map((item) => item.id),
    ['c', 'b'],
  );
  assert.equal(recordRole(groups[0].items[0]), 'system');
  assert.equal(
    mergeRequests(requests, [{ ...requests[0], status: 'answered' }])[0].status,
    'answered',
  );
});

test('new panel and group preferences restore safely without persisting request text', () => {
  const restored = restoreChatViews(
    {
      task: {
        taskPanel: 'artifacts',
        conversationGroups: {
          requests: { one: true, two: false, text: 'private text' },
          roles: { '["one","worker"]': false },
          text: 'not display state',
        },
        evidenceGroups: { requests: { one: false } },
      },
    },
    [{ id: 'task' }],
  );
  assert.equal(restored.task.taskPanel, 'artifacts');
  assert.deepEqual(restored.task.conversationGroups?.requests, { one: true, two: false });
  assert.equal(restored.task.evidenceGroups?.requests?.one, false);
  assert.ok(!JSON.stringify(restored).includes('private text'));
  assert.deepEqual(
    restoreChatViews({ task: { taskPanel: 'invalid', conversationGroups: null } }, [
      { id: 'task' },
    ]),
    { task: {} },
  );
});
