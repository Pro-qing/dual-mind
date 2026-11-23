import { OperationError } from '../../src/shared/errors';
import type { RunSummary, RunEvent } from '../../src/shared/execution';
import { t, type MessageKey } from '../../src/shared/i18n';
import { ModelQueryError } from '../../src/providers/models';
import { modelServer } from './modelServer';
import { connect } from '../../webview/src/bridge';
import type { ClientMessage } from '../../src/shared/model';
import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { JSDOM } from 'jsdom';
import { App, type Navigation } from '../../webview/src/App';
import type { Action, Bridge } from '../../src/shared/model';
import { fixture, taskInput } from './fixtures';

let rtl: typeof import('@testing-library/react');
let dom: JSDOM;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });
  rtl = await import('@testing-library/react');
});
afterEach(() => rtl.cleanup());
after(() => dom.window.close());
async function mount(
  f = fixture(),
  initialNavigation?: unknown,
  onNavigation?: (value: Navigation) => void,
  bridgeOverrides: Partial<Bridge> = {},
) {
  const initial = await f.store.snapshot();
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    const [bridge] = useState<Bridge>(() => ({
      request: async (action: Action) => {
        const savedTaskId = await f.store.dispatch(action);
        const state = await f.store.snapshot();
        setSnapshot(state);
        return { ...state, savedTaskId };
      },
      queryModels: (id) => f.queries.query(id),
      onModelsInvalidated: f.onModelsInvalidated,
      ...bridgeOverrides,
    }));
    return (
      <App
        snapshot={snapshot}
        bridge={bridge}
        initialNavigation={initialNavigation}
        onNavigation={onNavigation}
      />
    );
  }
  rtl.render(<Harness />);
  return f;
}
function click(name: string | RegExp) {
  const selector = rtl.screen.queryByRole('combobox', { name: /Settings category|设置类别/ });
  const option = selector && rtl.within(selector as HTMLElement).queryByRole('option', { name });
  if (option) {
    rtl.fireEvent.change(selector, { target: { value: (option as HTMLOptionElement).value } });
    return;
  }
  let buttons = rtl.screen.queryAllByRole('button', { name });
  if (!buttons.length) {
    const details = document.querySelector<HTMLDetailsElement>('.task-details');
    if (details && !details.open) {
      rtl.fireEvent.click(details.querySelector('summary')!);
      buttons = rtl.screen.queryAllByRole('button', { name });
    }
  }
  assert.ok(buttons.length, `Visible button: ${String(name)}`);
  rtl.fireEvent.click(buttons[0]);
}
async function settings() {
  click('Settings');
  await rtl.screen.findByRole('combobox', { name: 'Settings category' });
}

function assertNameOnlyRows(count: number) {
  const rows = document.querySelectorAll<HTMLElement>('.task-home .task-item');
  assert.equal(rows.length, count);
  for (const row of rows) {
    const buttons = rtl.within(row).getAllByRole('button');
    assert.equal(buttons.length, 2);
    const name = buttons[0].getAttribute('aria-label');
    assert.ok(name);
    assert.equal(row.textContent, name);
    assert.equal(buttons[0].getAttribute('title'), name);
    assert.equal(buttons[0].tabIndex, 0);
    assert.equal(row.querySelector('.task-excerpt, .task-metadata, .task-state'), null);
  }
}

test('home shows only names, preserves long names and confirms deletion', async () => {
  const f = fixture();
  const name = 'Long task '.repeat(20).trim();
  for (const taskName of [name, 'Other task', 'Third task']) {
    await f.store.dispatch({
      kind: 'task.save',
      input: taskInput({ name: taskName, requirements: 'Detailed requirements stay in detail' }),
    });
  }
  await mount(f);
  assertNameOnlyRows(3);
  click(name);
  await rtl.screen.findByRole('heading', { name });
  assert.ok(rtl.screen.getAllByText('Detailed requirements stay in detail').length);
  rtl.cleanup();
  await mount(f, { view: 'home' });
  click(`Delete task: ${name}`);
  click('Cancel');
  assertNameOnlyRows(3);
  assert.equal((await f.store.snapshot()).tasks.length, 3);
  click(`Delete task: ${name}`);
  rtl.fireEvent.click(
    rtl.within(rtl.screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  await rtl.waitFor(() => assertNameOnlyRows(2));
  assert.equal(
    (await f.store.snapshot()).tasks.some((task) => task.name === name),
    false,
  );
});

test('starts empty; preview is read-only and never writes real tasks', async () => {
  const f = await mount();
  assert.ok(rtl.screen.getByRole('heading', { name: 'No tasks yet' }));
  click('View examples');
  assert.ok(rtl.screen.getByText('Read-only examples · no requests or saved task data'));
  const del = rtl.screen.getAllByRole('button', { name: /Delete task:/ });
  assert.equal(del.length, 4);
  assert.ok(del.every((button) => (button as HTMLButtonElement).disabled));
  assertNameOnlyRows(4);
  rtl.fireEvent.click(document.querySelector('.task-select')!);
  const example = document.querySelector<HTMLElement>('[data-message-id="requirements"]')!;
  rtl.fireEvent.click(rtl.within(example).getByRole('button', { name: 'Expand message' }));
  assert.equal(example.dataset.expanded, 'true');
  rtl.fireEvent.click(rtl.within(example).getByRole('button', { name: 'Compact message' }));
  assert.equal(example.dataset.expanded, 'false');
  click('Exit examples');
  assert.equal((await f.store.snapshot()).tasks.length, 0);
  assert.equal(f.workspace.values.size, 0);
});
test('creates and deletes a real draft through accessible dialogs', async () => {
  const f = await mount();
  click('New task');
  const dialog = rtl.screen.getByRole('dialog', { name: 'New task' });
  const ui = rtl.within(dialog);
  rtl.fireEvent.change(ui.getByLabelText(/Task name/), { target: { value: 'UI-created task' } });
  rtl.fireEvent.change(ui.getByLabelText(/Task requirements/), {
    target: { value: 'Review this behavior.' },
  });
  rtl.fireEvent.click(ui.getByRole('radio', { name: /^Bug/ }));
  assert.ok(ui.getByText(/API setup is incomplete/));
  rtl.fireEvent.click(ui.getByRole('button', { name: 'Create task' }));
  await rtl.waitFor(() => assert.ok(rtl.screen.queryByRole('dialog') === null));
  assert.equal((await f.store.snapshot()).tasks[0].name, 'UI-created task');
  assert.equal(
    (rtl.screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled,
    true,
  );
  click('Delete task: UI-created task');
  click('Cancel');
  assert.equal((await f.store.snapshot()).tasks.length, 1);
  click('Delete task: UI-created task');
  rtl.fireEvent.click(
    rtl.within(rtl.screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  await rtl.screen.findByRole('heading', { name: 'No tasks yet' });
  assert.equal((await f.store.snapshot()).tasks.length, 0);
});
test('ordinary connection form survives language switching and saves metadata', async () => {
  const f = await mount();
  await settings();
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Connection name/), {
    target: { value: 'My endpoint' },
  });
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Base URL/), {
    target: { value: 'https://example.test/v1' },
  });
  rtl.fireEvent.change(rtl.screen.getByRole('combobox', { name: /Default model ID/ }), {
    target: { value: 'my-model' },
  });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  await rtl.screen.findByRole('button', { name: '保存连接' });
  assert.equal((rtl.screen.getByLabelText(/连接名称/) as HTMLInputElement).value, 'My endpoint');
  click('保存连接');
  await rtl.waitFor(async () => assert.equal((await f.store.snapshot()).connections.length, 1));
  assert.equal((await f.store.snapshot()).language, 'zh-CN');
});
test('unsaved role edits can cancel, save or discard a language change', async () => {
  const f = await mount();
  await settings();
  click('Reviewer Roles');
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Review instructions/), {
    target: { value: 'My English instructions' },
  });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  assert.ok(rtl.screen.getByRole('dialog', { name: 'Unsaved role instructions' }));
  click('Cancel');
  assert.equal(
    (rtl.screen.getByLabelText(/Review instructions/) as HTMLTextAreaElement).value,
    'My English instructions',
  );
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  rtl.fireEvent.click(
    rtl.within(rtl.screen.getByRole('dialog')).getByRole('button', { name: 'Save' }),
  );
  await rtl.screen.findByRole('button', { name: '保存角色' });
  assert.notEqual(
    (rtl.screen.getByLabelText(/审查指令/) as HTMLTextAreaElement).value,
    'My English instructions',
  );
  rtl.fireEvent.change(rtl.screen.getByLabelText(/审查指令/), {
    target: { value: '未保存的中文' },
  });
  rtl.fireEvent.change(rtl.screen.getByLabelText('界面语言'), { target: { value: 'en' } });
  click('放弃修改');
  await rtl.screen.findByRole('button', { name: 'Save role' });
  assert.equal(
    (rtl.screen.getByLabelText(/Review instructions/) as HTMLTextAreaElement).value,
    'My English instructions',
  );
  await f.store.dispatch({ kind: 'language.set', value: 'zh-CN' });
  assert.notEqual((await f.store.snapshot()).roles[0].instructions, '未保存的中文');
});
test('custom roles preserve original text when UI language changes', async () => {
  const f = await mount();
  await settings();
  click('Reviewer Roles');
  click('New role');
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Role name/), { target: { value: '自定义审查' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Review instructions/), {
    target: { value: 'Keep this 原文.' },
  });
  click('Save role');
  await rtl.screen.findByRole('button', { name: 'Delete role' });
  await rtl.waitFor(() =>
    assert.ok(!(rtl.screen.getByLabelText('Language') as HTMLSelectElement).disabled),
  );
  assert.equal((await f.store.snapshot()).roles.filter((role) => !role.builtIn).length, 1);
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  await rtl.screen.findByRole('button', { name: '保存角色' });
  assert.equal((rtl.screen.getByLabelText(/角色名称/) as HTMLInputElement).value, '自定义审查');
  assert.equal(
    (rtl.screen.getByLabelText(/审查指令/) as HTMLTextAreaElement).value,
    'Keep this 原文.',
  );
});
test('displays the saved snapshot after its preset is edited and the UI language changes', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const original = (await f.store.snapshot()).tasks[0].role.instructions;
  await f.store.dispatch({
    kind: 'role.save',
    id: 'bug',
    locale: 'en',
    input: { name: 'Bug', purpose: '', instructions: 'A different future preset.' },
  });
  await f.store.dispatch({ kind: 'language.set', value: 'zh-CN' });
  await mount(f, { view: 'task', taskId: (await f.store.snapshot()).tasks[0].id });
  assert.equal((await f.store.snapshot()).tasks[0].role.instructions, original);
  assert.equal(document.querySelector('.instruction-snapshot'), null);
  assert.equal(document.querySelectorAll('.model-bar').length, 2);
  assert.ok(rtl.screen.queryByText('A different future preset.') === null);
});
test('validation errors are localized and a failed save keeps form values', async () => {
  const f = await mount(fixture({ editorLanguage: 'zh-cn' }));
  click('设置');
  rtl.fireEvent.change(rtl.screen.getByLabelText(/连接名称/), { target: { value: '保留输入' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText(/接口地址/), { target: { value: 'not-a-url' } });
  rtl.fireEvent.change(rtl.screen.getByRole('combobox', { name: /默认模型 ID/ }), {
    target: { value: 'model' },
  });
  click('保存连接');
  const alert = await rtl.screen.findByRole('alert');
  assert.match(alert.textContent || '', /请输入完整的/);
  assert.equal((rtl.screen.getByLabelText(/连接名称/) as HTMLInputElement).value, '保留输入');
  assert.equal((await f.store.snapshot()).connections.length, 0);
});
test('a modal supports Escape and restores focus', async () => {
  await mount();
  const button = rtl.screen.getAllByRole('button', { name: 'New task' })[0];
  button.focus();
  rtl.fireEvent.click(button);
  assert.ok(rtl.screen.getByRole('dialog'));
  rtl.fireEvent.keyDown(document, { key: 'Escape' });
  assert.ok(rtl.screen.queryByRole('dialog') === null);
  assert.ok(document.activeElement === button);
});

async function configured(
  f: ReturnType<typeof fixture>,
  name = 'Test endpoint',
  baseUrl = 'http://localhost:8000/v1',
) {
  await f.store.dispatch({ kind: 'connection.save', input: { name, baseUrl, defaultModel: '' } });
  const connection = (await f.store.snapshot()).connections.find((c) => c.name === name)!;
  await f.store.dispatch({ kind: 'connection.key', id: connection.id });
  return connection.id;
}
function modelInput(name: string | RegExp) {
  return rtl.screen.getByRole('combobox', { name }) as HTMLInputElement;
}
test('first connection can save without a model, query the server and select with the keyboard', async () => {
  let requests = 0;
  const server = await modelServer((req, res) => {
    requests++;
    assert.equal(req.headers.authorization, 'Bearer test-only-key');
    res.end(JSON.stringify({ data: [{ id: 'alpha' }, { id: 'beta' }] }));
  });
  try {
    const f = await mount();
    await settings();
    assert.equal(
      (rtl.screen.getByLabelText(/Base URL/) as HTMLInputElement).value,
      'https://api.openai.com/v1',
    );
    rtl.fireEvent.change(rtl.screen.getByLabelText(/Connection name/), {
      target: { value: 'First API' },
    });
    rtl.fireEvent.change(rtl.screen.getByLabelText(/Base URL/), {
      target: { value: `${server.url}/v1` },
    });
    click('Save connection');
    await rtl.screen.findByRole('button', { name: 'Set key' });
    assert.equal((await f.store.snapshot()).connections[0].defaultModel, '');
    click('Set key');
    await rtl.screen.findByRole('button', { name: 'Replace key' });
    assert.equal(requests, 0);
    click('Test & fetch models');
    await rtl.screen.findByText('Model list accessible', { exact: false });
    assert.equal(requests, 1);
    assert.equal(modelInput(/Default model ID/).value, '');
    const input = modelInput(/Default model ID/);
    rtl.fireEvent.change(input, { target: { value: 'alp' } });
    assert.equal(
      rtl.screen.getAllByRole('option').filter((e) => e.getAttribute('id')?.includes('-list-'))
        .length,
      1,
    );
    rtl.fireEvent.keyDown(input, { key: 'ArrowDown' });
    rtl.fireEvent.keyDown(input, { key: 'Enter' });
    assert.equal(input.value, 'alpha');
    assert.ok(document.activeElement === input, 'Selection should restore input focus');
    assert.ok(rtl.screen.queryByRole('listbox') === null, 'Model suggestions should be closed');
    click('Save connection');
    await rtl.waitFor(async () =>
      assert.equal((await f.store.snapshot()).connections[0].defaultModel, 'alpha'),
    );
    assert.equal(requests, 1);
    rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
    await rtl.screen.findByRole('button', { name: '测试并获取模型' });
    assert.equal(modelInput(/默认模型 ID/).value, 'alpha');
  } finally {
    await server.close();
  }
});
test('mouse selection restores focus, outside clicks close suggestions, and refresh preserves manual IDs', async () => {
  let calls = 0;
  const f = fixture({
    fetchModels: async () => {
      calls++;
      return { models: ['alpha', 'beta'], fetchedAt: new Date().toISOString() };
    },
  });
  await configured(f);
  await mount(f);
  await settings();
  const input = modelInput(/Default model ID/);
  rtl.fireEvent.focus(input);
  assert.equal(calls, 0, 'Opening a selector must not query the API');
  rtl.fireEvent.pointerDown(document.body);
  assert.ok(rtl.screen.queryByRole('listbox') === null);
  click('Test & fetch models');
  await rtl.screen.findByText(/Model list accessible/);
  rtl.fireEvent.click(input);
  rtl.fireEvent.click(rtl.screen.getByRole('option', { name: 'beta' }));
  assert.equal(input.value, 'beta');
  assert.ok(document.activeElement === input);
  assert.ok(rtl.screen.queryByRole('listbox') === null, 'Mouse selection must close suggestions');
  rtl.fireEvent.click(input);
  assert.equal(
    rtl.screen.getByRole('option', { name: 'beta' }).getAttribute('aria-selected'),
    'true',
  );
  rtl.fireEvent.pointerDown(document.body);
  assert.ok(rtl.screen.queryByRole('listbox') === null);
  rtl.fireEvent.change(input, { target: { value: 'private-model-id' } });
  click('Refresh models');
  await rtl.screen.findByText(/Model list accessible/);
  assert.equal(calls, 2);
  assert.equal(input.value, 'private-model-id');
  click('Save connection');
  await rtl.waitFor(async () =>
    assert.equal((await f.store.snapshot()).connections[0].defaultModel, 'private-model-id'),
  );
});
test('failed and empty queries preserve manual IDs and localize feedback', async () => {
  let fail = true;
  const f = fixture({
    fetchModels: async () => {
      if (fail) {
        throw new ModelQueryError('modelsUnsupported');
      }
      return { models: [], fetchedAt: new Date().toISOString() };
    },
  });
  await configured(f);
  await mount(f);
  await settings();
  rtl.fireEvent.change(modelInput(/Default model ID/), { target: { value: 'manual-model' } });
  click('Test & fetch models');
  await rtl.screen.findByRole('alert');
  assert.equal(modelInput(/Default model ID/).value, 'manual-model');
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  await rtl.waitFor(() =>
    assert.match(rtl.screen.getByRole('alert').textContent || '', /此端点不支持模型列表/),
  );
  fail = false;
  click('测试并获取模型');
  await rtl.waitFor(() =>
    assert.match(rtl.screen.getByRole('status').textContent || '', /未返回模型/),
  );
  assert.equal(modelInput(/默认模型 ID/).value, 'manual-model');
});
test('URL edits block queries until saved; key cancellation retains results and replacement clears them', async () => {
  let calls = 0;
  const f = fixture({
    fetchModels: async () => ({
      models: [`model-${++calls}`],
      fetchedAt: new Date().toISOString(),
    }),
  });
  await configured(f);
  await mount(f);
  await settings();
  click('Test & fetch models');
  await rtl.screen.findByText(/Model list accessible/);
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Connection name/), {
    target: { value: 'Renamed' },
  });
  click('Save connection');
  await rtl.waitFor(() => assert.ok(rtl.screen.getByText(/Model list accessible/)));
  f.setKey(undefined);
  click('Replace key');
  await rtl.waitFor(() =>
    assert.equal(
      (rtl.screen.getByRole('button', { name: 'Replace key' }) as HTMLButtonElement).disabled,
      false,
    ),
  );
  assert.ok(rtl.screen.getByText(/Model list accessible/));
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Base URL/), {
    target: { value: 'https://changed.test/prefix/v1' },
  });
  assert.equal(
    (rtl.screen.getByRole('button', { name: 'Test & fetch models' }) as HTMLButtonElement).disabled,
    true,
  );
  assert.ok(rtl.screen.getByText(/Save the changed Base URL/));
  click('Save connection');
  await rtl.waitFor(() =>
    assert.ok(
      rtl.screen.queryByText(/Model list accessible/) === null,
      'Old query feedback should be cleared',
    ),
  );
  await rtl.waitFor(() =>
    assert.equal(
      (rtl.screen.getByRole('button', { name: 'Test & fetch models' }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  click('Test & fetch models');
  await rtl.screen.findByText(/Model list accessible/);
  assert.equal(calls, 2);
  f.setKey('new-secret');
  click('Replace key');
  await rtl.waitFor(() =>
    assert.ok(
      rtl.screen.queryByText(/Model list accessible/) === null,
      'Old query feedback should be cleared',
    ),
  );
});
test('connection queries stay isolated when switching pages during a pending request', async () => {
  let finishA!: () => void;
  const f = fixture({
    fetchModels: async ({ baseUrl }) => {
      if (baseUrl.includes('/a')) {
        await new Promise<void>((resolve) => {
          finishA = resolve;
        });
      }
      return {
        models: [baseUrl.includes('/a') ? 'only-a' : 'only-b'],
        fetchedAt: new Date().toISOString(),
      };
    },
  });
  await configured(f, 'A', 'https://example.test/a');
  await configured(f, 'B', 'https://example.test/b');
  await mount(f);
  await settings();
  click('Test & fetch models');
  await rtl.waitFor(() => assert.ok(finishA));
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: /^B OpenAI compatible/ }));
  click('Test & fetch models');
  await rtl.screen.findByText(/Model list accessible/);
  await rtl.act(async () => {
    finishA();
  });
  rtl.fireEvent.focus(modelInput(/Default model ID/));
  assert.ok(rtl.screen.getByRole('option', { name: 'only-b' }));
  assert.ok(
    rtl.screen.queryByRole('option', { name: 'only-a' }) === null,
    'Another connection must not show these models',
  );
});
test('drafts inherit independent defaults, keep absent IDs, and Escape closes suggestions before the dialog', async () => {
  const f = fixture({
    fetchModels: async ({ baseUrl }) => ({
      models: [baseUrl.includes('/a') ? 'new-a' : 'new-b'],
      fetchedAt: new Date().toISOString(),
    }),
  });
  const a = await configured(f, 'A', 'https://example.test/a');
  const b = await configured(f, 'B', 'https://example.test/b');
  await f.store.dispatch({
    kind: 'defaults.save',
    input: {
      worker: { connectionId: a, model: 'legacy-a' },
      reviewer: { connectionId: b, model: 'manual-b' },
    },
  });
  await mount(f);
  click('New task');
  assert.equal(modelInput('Worker Model ID').value, 'legacy-a');
  assert.equal(modelInput('Reviewer Model ID').value, 'manual-b');
  click('Worker Model ID: Refresh models');
  await rtl.screen.findByText(/Model list accessible/);
  assert.equal(modelInput('Worker Model ID').value, 'legacy-a');
  const input = modelInput('Worker Model ID');
  rtl.fireEvent.focus(input);
  assert.ok(rtl.screen.getByRole('option', { name: 'new-a' }));
  rtl.fireEvent.keyDown(input, { key: 'Escape' });
  assert.ok(rtl.screen.queryByRole('listbox') === null, 'Model suggestions should be closed');
  assert.ok(rtl.screen.getByRole('dialog'));
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Task name/), { target: { value: 'Bound task' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Task requirements/), {
    target: { value: 'Keep saved models.' },
  });
  rtl.fireEvent.click(rtl.screen.getByRole('radio', { name: /^Bug/ }));
  click('Create task');
  await rtl.waitFor(() =>
    assert.ok(rtl.screen.queryByRole('dialog') === null, 'The dialog should be closed'),
  );
  click('Edit task');
  assert.equal(modelInput('Worker Model ID').value, 'legacy-a');
  rtl.fireEvent.keyDown(modelInput('Worker Model ID'), { key: 'Escape' });
  assert.ok(rtl.screen.queryByRole('dialog') === null, 'The dialog should be closed');
  assert.equal((await f.store.snapshot()).tasks[0].reviewer.model, 'manual-b');
});
test('defaults have a separate tab, share cached models, persist explicitly and restore navigation', async () => {
  let requests = 0;
  const f = fixture({
    fetchModels: async () => {
      requests++;
      return { models: ['cached-model'], fetchedAt: new Date().toISOString() };
    },
  });
  const a = await configured(f, 'A', 'https://example.test/a');
  const b = await configured(f, 'B', 'https://example.test/b');
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const originalTask = (await f.store.snapshot()).tasks[0];
  let navigation: Navigation = { view: 'home' };
  await mount(f, undefined, (value) => {
    navigation = value;
  });
  await settings();
  assert.ok(rtl.screen.queryByRole('button', { name: 'Save defaults' }) === null);
  assert.ok(modelInput(/Default model ID/));
  click('Test & fetch models');
  await rtl.screen.findByText(/Model list accessible/);
  click('Defaults for new tasks');
  assert.equal(navigation.view, 'defaults');
  assert.ok(rtl.screen.getByRole('heading', { name: 'Defaults for new tasks' }));
  assert.ok(rtl.screen.queryByRole('button', { name: 'Save connection' }) === null);
  rtl.fireEvent.change(rtl.screen.getByLabelText('Worker Connection'), { target: { value: a } });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Reviewer Connection'), { target: { value: b } });
  rtl.fireEvent.focus(modelInput('Worker Model ID'));
  assert.ok(rtl.screen.getByRole('option', { name: 'cached-model' }));
  rtl.fireEvent.click(rtl.screen.getByRole('option', { name: 'cached-model' }));
  rtl.fireEvent.change(modelInput('Reviewer Model ID'), { target: { value: 'manual-reviewer' } });
  assert.equal(requests, 1, 'Switching tabs and choosing bindings must not query automatically');
  click('Save defaults');
  await rtl.waitFor(async () =>
    assert.equal((await f.store.snapshot()).defaults.worker.model, 'cached-model'),
  );
  assert.deepEqual((await f.store.snapshot()).defaults, {
    worker: { connectionId: a, model: 'cached-model' },
    reviewer: { connectionId: b, model: 'manual-reviewer' },
  });
  assert.deepEqual((await f.store.snapshot()).tasks[0], originalTask);
  rtl.fireEvent.change(modelInput('Worker Model ID'), { target: { value: 'unsaved' } });
  click('API Connections');
  click('Defaults for new tasks');
  assert.equal(modelInput('Worker Model ID').value, 'cached-model');
  assert.equal(modelInput('Reviewer Model ID').value, 'manual-reviewer');
  assert.equal(requests, 1);
  rtl.cleanup();
  await mount(f, navigation);
  assert.ok(
    (rtl.screen.getByRole('combobox', { name: 'Settings category' }) as HTMLSelectElement).value ===
      'defaults',
  );
  assert.equal(modelInput('Worker Model ID').value, 'cached-model');
  assert.equal(requests, 1, 'Restoring navigation must not query automatically');
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  await rtl.screen.findByRole('heading', { name: '新任务的默认配置' });
  assert.ok(rtl.screen.getByRole('button', { name: '保存默认值' }));
  click('返回主页');
  click('新建任务');
  assert.equal(modelInput('Worker（执行者） 模型 ID').value, 'cached-model');
  assert.equal(modelInput('Reviewer（审查者） 模型 ID').value, 'manual-reviewer');
});
test('bridge correlates model results and invalidation rejects pending queries without updating snapshots', async () => {
  const sent: ClientMessage[] = [];
  let snapshots = 0;
  const invalidated: string[] = [];
  const bridge = connect(
    {
      postMessage: (message) => sent.push(message),
      getState: () => null,
      setState: () => undefined,
    },
    () => {
      snapshots++;
    },
    () => undefined,
  );
  bridge.onModelsInvalidated((id) => invalidated.push(id));
  const message = (data: unknown) =>
    window.dispatchEvent(new dom.window.MessageEvent('message', { data }));
  try {
    const query = bridge.queryModels('a');
    const req = sent[0] as { requestId: string };
    message({
      type: 'models.result',
      requestId: req.requestId,
      connectionId: 'b',
      ok: true,
      result: { models: ['wrong'], fetchedAt: '' },
    });
    message({
      type: 'models.result',
      requestId: req.requestId,
      connectionId: 'a',
      ok: true,
      result: { models: ['right'], fetchedAt: '2026-01-01T00:00:00Z' },
    });
    assert.deepEqual((await query).models, ['right']);
    assert.equal(snapshots, 0);
    const pending = bridge.queryModels('a');
    message({ type: 'models.invalidated', connectionId: 'a' });
    await assert.rejects(pending, { code: 'modelsChanged' });
    assert.deepEqual(invalidated, ['a']);
    const closed = bridge.queryModels('a');
    bridge.dispose();
    await assert.rejects(closed, { code: 'modelsChanged' });
  } finally {
    bridge.dispose();
  }
});

for (const locale of ['en', 'zh-CN'] as const) {
  test(`${locale}: model menus distinguish missing configuration, pending, empty, failed and unmatched results`, async () => {
    const tr = (key: MessageKey) => t(locale, key);
    let calls = 0;
    let settle: ((failed?: boolean, models?: string[]) => void) | undefined;
    const f = fixture({
      editorLanguage: locale,
      fetchModels: async () => {
        calls++;
        return new Promise((resolve, reject) => {
          settle = (failed = false, models = []) =>
            failed
              ? reject(new ModelQueryError('modelsServer'))
              : resolve({ models, fetchedAt: new Date().toISOString() });
        });
      },
    });
    const connectionId = await configured(f);
    await mount(f);
    click(tr('settings'));
    click(tr('newConnection'));
    rtl.fireEvent.focus(modelInput(new RegExp(tr('defaultModel'))));
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('modelsSaveFirst'));
    click(tr('defaults'));
    const workerLabel = `${tr('worker')} ${tr('modelId')}`;
    const input = modelInput(workerLabel);
    rtl.fireEvent.focus(input);
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('selectConnection'));
    rtl.fireEvent.change(rtl.screen.getByLabelText(`${tr('worker')} ${tr('connection')}`), {
      target: { value: connectionId },
    });
    rtl.fireEvent.focus(input);
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('modelsNotFetched'));
    rtl.fireEvent.change(input, { target: { value: 'manual-private-model' } });
    assert.equal(calls, 0);
    const query = async () => {
      settle = undefined;
      click(`${workerLabel}: ${tr('refreshModels')}`);
      rtl.fireEvent.focus(input);
      assert.equal(rtl.screen.getByRole('listbox').textContent, tr('modelsLoading'));
      await rtl.waitFor(() => assert.ok(settle));
    };
    await query();
    await rtl.act(async () => {
      settle!();
    });
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('modelsEmpty'));
    assert.equal(input.value, 'manual-private-model');
    await query();
    await rtl.act(async () => {
      settle!(true);
    });
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('modelsServer'));
    assert.equal(input.value, 'manual-private-model');
    await query();
    await rtl.act(async () => {
      settle!(false, ['remote-model']);
    });
    rtl.fireEvent.change(input, { target: { value: 'manual-private-model-unmatched' } });
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('modelNoMatch'));
    assert.equal(calls, 3);
    await f.store.dispatch({
      kind: 'task.save',
      input: taskInput({
        worker: { connectionId, model: 'saved-private-model' },
        reviewer: { connectionId, model: 'saved-private-model' },
      }),
    });
    await rtl.act(async () => {
      await f.store.dispatch({ kind: 'connection.delete', id: connectionId, confirmed: true });
    });
    rtl.cleanup();
    await mount(f, { view: 'task', taskId: (await f.store.snapshot()).tasks[0].id });
    click(tr('editTask'));
    const saved = modelInput(workerLabel);
    rtl.fireEvent.focus(saved);
    assert.equal(rtl.screen.getByRole('listbox').textContent, tr('missingConnection'));
    assert.equal(saved.value, 'saved-private-model');
    assert.equal(calls, 3, 'Restoring an unavailable connection must not query automatically');
  });
}

test('same-connection same-model defaults and drafts remain independently editable per agent', async () => {
  const f = fixture();
  const connectionId = await configured(f);
  const binding = { connectionId, model: 'same-model' };
  await f.store.dispatch({ kind: 'defaults.save', input: { worker: binding, reviewer: binding } });
  await mount(f);
  await settings();
  click('Defaults for new tasks');
  rtl.fireEvent.change(modelInput('Worker Model ID'), { target: { value: 'worker-only' } });
  assert.equal(modelInput('Reviewer Model ID').value, 'same-model');
  rtl.fireEvent.change(modelInput('Reviewer Model ID'), { target: { value: 'reviewer-only' } });
  assert.equal(modelInput('Worker Model ID').value, 'worker-only');
  click('Save defaults');
  await rtl.waitFor(async () =>
    assert.equal((await f.store.snapshot()).defaults.reviewer.model, 'reviewer-only'),
  );
  click('Back to home');
  click('New task');
  assert.equal(modelInput('Worker Model ID').value, 'worker-only');
  assert.equal(modelInput('Reviewer Model ID').value, 'reviewer-only');
  rtl.fireEvent.change(modelInput('Worker Model ID'), { target: { value: 'draft-worker' } });
  assert.equal(modelInput('Reviewer Model ID').value, 'reviewer-only');
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Task name/), {
    target: { value: 'Isolated draft' },
  });
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Task requirements/), {
    target: { value: 'Keep both bindings independent.' },
  });
  rtl.fireEvent.click(rtl.screen.getByRole('radio', { name: /^Bug/ }));
  click('Create task');
  await rtl.waitFor(() => assert.ok(rtl.screen.queryByRole('dialog') === null));
  const snapshot = await f.store.snapshot();
  assert.equal(snapshot.tasks[0].worker.model, 'draft-worker');
  assert.equal(snapshot.tasks[0].reviewer.model, 'reviewer-only');
  assert.equal(snapshot.defaults.worker.model, 'worker-only');
});

for (const locale of ['en', 'zh-CN'] as const) {
  test(`task branch choice saves and reloads without preparation (${locale})`, async () => {
    const f = fixture({ editorLanguage: locale });
    let queries = 0;
    await mount(f, undefined, undefined, {
      execute: async (action) => {
        assert.equal(action.kind, 'git.branches');
        queries++;
        return {
          state: { config: { prepare: [], checks: [] }, runs: [] },
          repository: { currentBranch: 'main', branches: ['main', 'feature'] },
        };
      },
    });
    const tr = (key: MessageKey) => t(locale, key);
    click(tr('newTask'));
    const ui = rtl.within(rtl.screen.getByRole('dialog'));
    const strategy = ui.getByRole('combobox', { name: tr('gitStrategy') }) as HTMLSelectElement;
    assert.equal(strategy.value, 'managed');
    assert.equal(queries, 0);
    rtl.fireEvent.change(strategy, { target: { value: 'current' } });
    assert.ok(ui.getByText(tr('gitDirectHint')));
    assert.equal(queries, 0);
    rtl.fireEvent.change(strategy, { target: { value: 'branch' } });
    await rtl.waitFor(() => assert.ok(ui.queryByRole('option', { name: 'feature' })));
    rtl.fireEvent.change(ui.getByRole('combobox', { name: tr('localBranch') }), {
      target: { value: 'feature' },
    });
    rtl.fireEvent.click(ui.getByRole('button', { name: tr('refreshBranches') }));
    await rtl.waitFor(() => assert.equal(queries, 2));
    rtl.fireEvent.change(ui.getByLabelText(new RegExp(tr('taskName'))), {
      target: { value: 'Branch draft' },
    });
    rtl.fireEvent.change(ui.getByLabelText(new RegExp(tr('requirements'))), {
      target: { value: 'Branch requirements' },
    });
    rtl.fireEvent.click(ui.getAllByRole('radio')[0]);
    rtl.fireEvent.click(ui.getByRole('button', { name: tr('createTask') }));
    await rtl.waitFor(() => assert.ok(!rtl.screen.queryByRole('dialog')));
    assert.deepEqual((await f.store.snapshot()).tasks[0].git, {
      mode: 'branch',
      branch: 'feature',
    });
    rtl.cleanup();
    await mount(f, { view: 'task', taskId: (await f.store.snapshot()).tasks[0].id }, undefined, {
      execute: async () => ({
        state: { config: { prepare: [], checks: [] }, runs: [] },
        repository: { currentBranch: 'main', branches: ['main', 'feature'] },
      }),
    });
    click(tr('editTask'));
    assert.equal(
      (rtl.screen.getByRole('combobox', { name: tr('localBranch') }) as HTMLSelectElement).value,
      'feature',
    );
    await rtl.waitFor(() =>
      assert.ok(
        !rtl.screen.getByRole('button', { name: tr('refreshBranches') }).hasAttribute('disabled'),
      ),
    );
  });
}

test('home and task detail are separate, settings return to their origin, and navigation restores safely', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput({ name: 'First task' }) });
  await f.store.dispatch({ kind: 'task.save', input: taskInput({ name: 'Second task' }) });
  const first = (await f.store.snapshot()).tasks.find((task) => task.name === 'First task')!;
  let navigation: Navigation = { view: 'home' };
  await mount(f, { view: 'workbench' }, (next) => {
    navigation = next;
  });
  assert.ok(rtl.screen.getByRole('main', { name: 'Home' }));
  assert.equal(document.querySelector('.agent-grid'), null);
  click('First task');
  await rtl.screen.findByRole('heading', { name: 'First task' });
  assert.deepEqual(navigation, { view: 'task', taskId: first.id });
  assert.equal(document.querySelector('.task-list'), null);
  await settings();
  assert.deepEqual(navigation, { view: 'api', returnTo: { view: 'task', taskId: first.id } });
  rtl.cleanup();
  await mount(f, navigation, (next) => {
    navigation = next;
  });
  click('Back to task');
  await rtl.screen.findByRole('heading', { name: 'First task' });
  rtl.cleanup();
  await mount(f, navigation);
  assert.ok(rtl.screen.getByRole('heading', { name: 'First task' }));
  click('Delete task: First task');
  rtl.fireEvent.click(
    rtl.within(rtl.screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  await rtl.screen.findByRole('main', { name: 'Home' });
  assert.ok(rtl.screen.getByRole('button', { name: 'Second task' }));
  rtl.cleanup();
  await mount(f, { view: 'task', taskId: first.id });
  assert.ok(rtl.screen.getByRole('main', { name: 'Home' }));
});

test('creating a task navigates using its saved ID without executing; a failed creation keeps input', async () => {
  const f = fixture();
  const operations: string[] = [];
  let navigation: Navigation = { view: 'home' };
  await mount(
    f,
    undefined,
    (next) => {
      navigation = next;
    },
    {
      execute: async (action) => {
        operations.push(action.kind);
        return { state: { config: { prepare: [], checks: [] }, runs: [] } };
      },
    },
  );
  click('New task');
  const form = rtl.within(rtl.screen.getByRole('dialog'));
  rtl.fireEvent.change(form.getByLabelText(/Task name/), {
    target: { value: 'Keep this new task' },
  });
  rtl.fireEvent.change(form.getByLabelText(/Task requirements/), {
    target: { value: 'Keep the requirements.' },
  });
  rtl.fireEvent.click(form.getByRole('radio', { name: /^Bug/ }));
  f.workspace.fail = true;
  rtl.fireEvent.click(form.getByRole('button', { name: 'Create task' }));
  await form.findByRole('alert');
  assert.equal((form.getByLabelText(/Task name/) as HTMLInputElement).value, 'Keep this new task');
  assert.equal(navigation.view, 'home');
  assert.equal((await f.store.snapshot()).tasks.length, 0);
  f.workspace.fail = false;
  rtl.fireEvent.click(form.getByRole('button', { name: 'Create task' }));
  await rtl.screen.findByRole('heading', { name: 'Keep this new task' });
  const task = (await f.store.snapshot()).tasks[0];
  await rtl.waitFor(() => assert.deepEqual(navigation, { view: 'task', taskId: task.id }));
  assert.deepEqual(operations, []);
  assert.equal(task.status, 'draft', 'Old storage format stays compatible');
  assert.ok(!document.body.textContent?.includes('draft'));
  assert.ok(rtl.screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled'));
});

test('native task selection and creation requests respect task routes and cancellation', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const snapshot = await f.store.snapshot();
  const task = snapshot.tasks[0];
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
  };
  const handled: string[] = [];
  const acknowledge = (id: string) => handled.push(id);
  const result = rtl.render(
    <App
      snapshot={{ ...snapshot, navigationRequest: { id: 'select', taskId: task.id } }}
      bridge={bridge}
      onNavigationHandled={acknowledge}
    />,
  );
  assert.ok(rtl.screen.getByRole('heading', { name: task.name }));
  await settings();
  result.rerender(
    <App
      snapshot={{ ...snapshot, navigationRequest: { id: 'new', newTask: true } }}
      bridge={bridge}
      onNavigationHandled={acknowledge}
    />,
  );
  assert.ok(rtl.screen.getByRole('dialog', { name: 'New task' }));
  click('Cancel');
  result.rerender(
    <App
      snapshot={{ ...snapshot, navigationRequest: { id: 'new', newTask: true } }}
      bridge={bridge}
      onNavigationHandled={acknowledge}
    />,
  );
  assert.equal(rtl.screen.queryByRole('dialog'), null);
  assert.deepEqual(handled, ['select', 'new']);
  assert.equal(
    (rtl.screen.getByRole('combobox', { name: 'Settings category' }) as HTMLSelectElement).value,
    'api',
  );
  click('Back to task');
  assert.ok(rtl.screen.getByRole('heading', { name: task.name }));
  result.rerender(
    <App
      snapshot={{ ...snapshot, navigationRequest: { id: 'missing', taskId: 'removed' } }}
      bridge={bridge}
      onNavigationHandled={acknowledge}
    />,
  );
  assert.ok(rtl.screen.getByRole('main', { name: 'Home' }));
});

test('operation failures and historical errors reformat when the user changes language', async () => {
  const f = fixture();
  await f.store.dispatch({
    kind: 'task.save',
    input: taskInput({ git: { mode: 'branch', branch: 'main' } }),
  });
  const task = (await f.store.snapshot()).tasks[0];
  await mount(f, { view: 'task', taskId: task.id }, undefined, {
    execute: async () => {
      throw new OperationError('gitUnavailable');
    },
  });
  click('Edit task');
  await rtl.within(rtl.screen.getByRole('dialog')).findByText(/Git is unavailable/);
  click('Cancel');
  click('Settings');
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  await rtl.screen.findByText(/Git 不可用/);
  rtl.cleanup();
  const snapshot = await f.store.snapshot();
  const run: RunSummary = {
    id: 'run',
    taskId: task.id,
    status: 'failed',
    round: 1,
    maxRounds: 5,
    sequence: 1,
    createdAt: '',
    updatedAt: '',
    error: 'Model request timed out.',
    fault: { code: 'inferenceTimeout' },
  };
  const events: RunEvent[] = [
    {
      runId: run.id,
      taskId: task.id,
      sequence: 1,
      kind: 'error',
      text: 'Legacy external failure.',
      time: '',
    },
    {
      runId: run.id,
      taskId: task.id,
      sequence: 2,
      kind: 'check',
      text: 'check FAIL\nORIGINAL COMMAND OUTPUT',
      fault: { code: 'commandTimeout', params: { name: 'Check build' } },
      time: '',
    },
    {
      runId: run.id,
      taskId: task.id,
      sequence: 3,
      kind: 'tool',
      text: JSON.stringify({ tool: 'read_file', result: { error: 'Legacy tool error' } }),
      time: '',
    },
  ];
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
    execute: async () => ({
      state: { config: { prepare: [], checks: [] }, runs: [run] },
      events,
      evidence: { events },
    }),
  };
  const result = rtl.render(
    <App
      snapshot={{ ...snapshot, execution: { config: { prepare: [], checks: [] }, runs: [run] } }}
      bridge={bridge}
      initialNavigation={{ view: 'task', taskId: task.id }}
    />,
  );
  await rtl.screen.findByText(/模型请求超时/);
  click('工具、检查与审查证据');
  await rtl.waitFor(() => assert.equal(rtl.screen.getAllByText(/该次运行失败/).length, 2));
  assert.ok(rtl.screen.getByText(/命令“Check build”执行超时/));
  assert.ok(rtl.screen.getByText(/ORIGINAL COMMAND OUTPUT/));
  assert.ok(rtl.screen.getByText('Legacy external failure.'));
  result.rerender(<App snapshot={{ ...snapshot, locale: 'en', language: 'en' }} bridge={bridge} />);
  await rtl.screen.findByText('Model request timed out.');
  assert.ok(rtl.screen.getByText('Command Check build timed out.'));
});

test('execution bridge preserves structured errors, times out safely and rejects requests on close', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: ClientMessage[] = [];
  const bridge = connect(
    {
      postMessage: (message) => sent.push(message),
      getState: () => null,
      setState: () => undefined,
    },
    () => undefined,
    () => undefined,
  );
  const pending = bridge.execute!({ kind: 'start', taskId: 'task' });
  const failure = assert.rejects(pending, { code: 'dirtyRepository' });
  const request = sent.at(-1)!;
  assert.equal(request.type, 'execution.request');
  window.dispatchEvent(
    new dom.window.MessageEvent('message', {
      data: {
        type: 'execution.result',
        requestId: request.requestId,
        fault: { code: 'dirtyRepository' },
      },
    }),
  );
  await failure;
  const timed = assert.rejects(bridge.execute!({ kind: 'stop', runId: 'run' }), {
    code: 'operationTimeout',
  });
  context.mock.timers.tick(45000);
  await timed;
  const closed = assert.rejects(bridge.execute!({ kind: 'history', runId: 'run' }), {
    code: 'workbenchClosed',
  });
  const localClosed = assert.rejects(bridge.request({ kind: 'workspace.open' }), {
    code: 'workbenchClosed',
  });
  bridge.dispose();
  await closed;
  await localClosed;
  context.mock.timers.reset();
});

test('saving the current task preserves loaded conversation history', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const task = (await f.store.snapshot()).tasks[0];
  const run: RunSummary = {
    id: 'run',
    taskId: task.id,
    status: 'completed',
    round: 1,
    maxRounds: 5,
    createdAt: '',
    updatedAt: '',
    sequence: 1,
  };
  const execution = { config: { prepare: [], checks: [] }, runs: [run] };
  const initial = { ...(await f.store.snapshot()), execution };
  let navigationRequests = 0;
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    const [bridge] = useState<Bridge>(() => ({
      queryModels: async () => ({ models: [], fetchedAt: '' }),
      onModelsInvalidated: () => () => undefined,
      request: async (action) => {
        await f.store.dispatch(action);
        const next = { ...(await f.store.snapshot()), execution };
        setSnapshot(next);
        return next;
      },
      execute: async (action) => {
        if (action.kind === 'conversation') {
          navigationRequests++;
        }
        return {
          state: execution,
          conversation: {
            messages: [
              {
                id: 'saved-message',
                taskId: task.id,
                role: 'worker',
                kind: 'submission',
                text: 'Preserved worker conversation',
                time: '2026-11-20T00:00:00.000Z',
              },
            ],
          },
          events: [
            {
              runId: run.id,
              taskId: task.id,
              sequence: 1,
              kind: 'text',
              agent: 'worker',
              text: 'Preserved worker conversation',
              time: '',
            },
          ],
        };
      },
    }));
    return (
      <App
        snapshot={snapshot}
        bridge={bridge}
        initialNavigation={{ view: 'task', taskId: task.id }}
      />
    );
  }
  rtl.render(<Harness />);
  await rtl.screen.findByText('Preserved worker conversation');
  const requestsBeforeSave = navigationRequests;
  click('Edit task');
  click('Save task');
  await rtl.waitFor(() => assert.ok(rtl.screen.queryByRole('dialog') === null));
  assert.ok(rtl.screen.getByText('Preserved worker conversation'));
  assert.equal(navigationRequests, requestsBeforeSave);
});

test('automatic execution starts without presets; advanced commands retain disabled values', async () => {
  const f = fixture();
  const connectionId = await configured(f);
  await f.store.dispatch({
    kind: 'task.save',
    input: taskInput({
      worker: { connectionId, model: 'worker' },
      reviewer: { connectionId, model: 'reviewer' },
    }),
  });
  const task = (await f.store.snapshot()).tasks[0];
  let config: import('../../src/shared/execution').ExecutionConfig = { prepare: [], checks: [] };
  const actions: string[] = [];
  await mount(f, { view: 'task', taskId: task.id }, undefined, {
    execute: async (action) => {
      if (!['conversation', 'evidence'].includes(action.kind)) {
        actions.push(action.kind);
      }
      if (action.kind === 'config.save') {
        config = action.config;
      }
      return { state: { config, runs: [] } };
    },
  });
  assert.equal(
    (rtl.screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled,
    false,
  );
  assert.deepEqual(actions, []);
  click('Start');
  await rtl.waitFor(() => assert.deepEqual(actions, ['start']));
  click('Settings');
  click('Task execution');
  assert.ok(rtl.screen.getByText('Automatic collaboration'));
  rtl.fireEvent.click(rtl.screen.getByText('Advanced settings'));
  const toggle = rtl.screen.getByLabelText('Enable additional custom commands');
  assert.equal((toggle as HTMLInputElement).checked, false);
  rtl.fireEvent.click(toggle);
  click('Add check command');
  rtl.fireEvent.change(rtl.screen.getByLabelText('Command name'), {
    target: { value: 'Extra validation' },
  });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Executable'), { target: { value: 'npm' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Arguments — one per line'), {
    target: { value: 'run\ncheck' },
  });
  rtl.fireEvent.click(toggle);
  assert.equal(rtl.screen.queryByLabelText('Executable'), null);
  click('Save execution settings');
  await rtl.waitFor(() => assert.equal(config.checks.length, 1));
  assert.equal(config.customCommandsEnabled, false);
  assert.deepEqual(config.checks[0].args, ['run', 'check']);
  rtl.fireEvent.click(toggle);
  assert.equal((rtl.screen.getByLabelText('Executable') as HTMLInputElement).value, 'npm');
});

test('plan, acceptance, planning controls and history restore in both languages', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const snapshot = await f.store.snapshot(),
    task = snapshot.tasks[0];
  const plan = {
    version: 2,
    objective: 'Fix cancellation',
    requirements: 'No output on cancel',
    steps: ['Repair and verify'],
    criteria: [
      {
        id: 'doc',
        description: 'Document behavior',
        verification: 'reading' as const,
        evidence: 'Read the updated guide',
        reason: 'Documentation only',
      },
    ],
    revisionReason: 'Address first-round findings',
  };
  const run: RunSummary = {
    id: 'run-plan',
    taskId: task.id,
    status: 'planning',
    round: 0,
    maxRounds: 5,
    createdAt: '',
    updatedAt: '',
    sequence: 1,
    plan,
  };
  const execution = { config: { prepare: [], checks: [] }, runs: [run] };
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
    execute: async () => ({
      state: execution,
      conversation: {
        messages: [
          {
            id: 'plan-message',
            taskId: task.id,
            time: '2026-11-20T00:00:00.000Z',
            role: 'reviewer',
            kind: 'plan',
            text: plan.objective,
            detail: { type: 'plan', plan },
          },
        ],
      },
      events: [
        {
          runId: run.id,
          taskId: task.id,
          sequence: 1,
          kind: 'plan',
          time: '',
          text: 'Fix cancellation',
          detail: { type: 'plan', plan },
        },
      ],
    }),
  };
  const ui = rtl.render(
    <App
      snapshot={{ ...snapshot, execution }}
      bridge={bridge}
      initialNavigation={{ view: 'task', taskId: task.id }}
    />,
  );
  await rtl.screen.findByRole('status');
  assert.match(rtl.screen.getByRole('status').textContent!, /Planning/);
  assert.equal(document.querySelector('.agent-panel'), null);
  assert.equal(
    (rtl.screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled,
    false,
  );
  await rtl.waitFor(() => assert.equal(rtl.screen.getAllByText('Reading review').length, 1));
  ui.rerender(
    <App
      snapshot={{ ...snapshot, execution, locale: 'zh-CN', language: 'zh-CN' }}
      bridge={bridge}
    />,
  );
  assert.match(rtl.screen.getByRole('status').textContent!, /制定方案中/);
  assert.equal(rtl.screen.getAllByText('阅读审查').length, 1);
  assert.ok(rtl.screen.getAllByText('Documentation only').length > 0);
});

test('chat keeps failed input, reuses message IDs, respects IME and clears only after persistence', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const task = (await f.store.snapshot()).tasks[0];
  const state = { config: { prepare: [], checks: [] }, runs: [] };
  const messages: import('../../src/shared/execution').TaskMessage[] = [];
  const sent: string[] = [];
  let fail = true;
  await mount(f, { view: 'task', taskId: task.id }, undefined, {
    execute: async (action) => {
      if (action.kind === 'message.send') {
        sent.push(action.messageId);
        if (fail) {
          fail = false;
          throw new OperationError('operationTimeout');
        }
        messages.push({
          id: action.messageId,
          taskId: task.id,
          time: new Date().toISOString(),
          role: 'user',
          kind: 'message',
          text: action.text,
          status: 'pending',
        });
      }
      return { state, conversation: { messages }, evidence: { events: [] } };
    },
  });
  const input = rtl.screen.getByLabelText('Follow up or request changes') as HTMLTextAreaElement;
  rtl.fireEvent.change(input, { target: { value: '保留这条追问' } });
  rtl.fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  assert.equal(sent.length, 0);
  rtl.fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  assert.equal(sent.length, 0);
  rtl.fireEvent.keyDown(input, { key: 'Enter' });
  await rtl.waitFor(() => assert.equal(sent.length, 1));
  await rtl.waitFor(() => assert.equal(input.disabled, false));
  assert.equal(input.value, '保留这条追问');
  click('Send');
  await rtl.waitFor(() => assert.equal(input.value, ''));
  assert.equal(sent[0], sent[1]);
  assert.equal(messages.length, 1);
  assert.ok(document.querySelector('.chat-message.user[data-message-id]'));
  assert.equal(document.querySelector('.agent-panel'), null);
});

test('evidence stays expanded through localization and refresh; narrow drawer restores focus', async () => {
  const width = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true });
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const snapshot = await f.store.snapshot(),
    task = snapshot.tasks[0];
  const state = { config: { prepare: [], checks: [] }, runs: [] };
  let update: ((value: import('../../src/shared/execution').ExecutionUpdate) => void) | undefined;
  const events: RunEvent[] = [
    {
      runId: 'run',
      taskId: task.id,
      sequence: 1,
      kind: 'tool',
      text: 'actual read_file result',
      agent: 'reviewer',
      time: '2026-11-20T00:00:00.000Z',
    },
  ];
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
    onExecution: (listener) => {
      update = listener;
      return () => undefined;
    },
    execute: async () => ({
      state,
      conversation: {
        messages: [
          {
            id: 'answer',
            taskId: task.id,
            role: 'reviewer',
            kind: 'answer',
            text: 'Explained result',
            runId: 'run',
            sequence: 1,
            time: '2026-11-20T00:00:00.000Z',
          },
        ],
      },
      evidence: { events },
    }),
  };
  const ui = rtl.render(
    <App
      snapshot={{ ...snapshot, execution: state }}
      bridge={bridge}
      initialNavigation={{ view: 'task', taskId: task.id }}
    />,
  );
  await rtl.screen.findByText('Explained result');
  await rtl.waitFor(() => assert.equal(document.querySelectorAll('.evidence-record').length, 1));
  const detail = document.querySelector<HTMLDetailsElement>('.evidence-record')!;
  rtl.fireEvent.click(detail.querySelector('summary')!);
  await rtl.waitFor(() => assert.equal(detail.open, true));
  click('View execution details');
  await rtl.waitFor(() =>
    assert.equal(document.querySelector<HTMLDetailsElement>('.evidence-record')!.open, true),
  );
  click('View execution details');
  assert.equal(document.querySelector<HTMLElement>('.evidence-panel')!.hidden, false);
  ui.rerender(
    <App
      snapshot={{ ...snapshot, execution: state, locale: 'zh-CN', language: 'zh-CN' }}
      bridge={bridge}
    />,
  );
  assert.equal(document.querySelector<HTMLDetailsElement>('.evidence-record')!.open, true);
  await rtl.act(async () => update?.({ state: { ...state, conversationVersion: 1 }, events }));
  await rtl.waitFor(() =>
    assert.equal(document.querySelector<HTMLDetailsElement>('.evidence-record')!.open, true),
  );
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  rtl.fireEvent(window, new Event('resize'));
  const trigger = rtl.screen.getByRole('button', { name: '查看执行详情' });
  trigger.focus();
  rtl.fireEvent.click(trigger);
  assert.ok(rtl.screen.getByRole('dialog', { name: '工具、检查与审查证据' }));
  rtl.fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(document.querySelector<HTMLElement>('.evidence-panel')!.hidden, true);
  assert.equal(document.activeElement, trigger);
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
});

test('conversation pagination preserves the reading position and new messages do not force scrolling', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const snapshot = await f.store.snapshot(),
    task = snapshot.tasks[0];
  const state = { config: { prepare: [], checks: [] }, runs: [] };
  let update: ((value: import('../../src/shared/execution').ExecutionUpdate) => void) | undefined;
  const messages: import('../../src/shared/execution').TaskMessage[] = Array.from(
    { length: 20 },
    (_, index) => ({
      id: `m-${index}`,
      taskId: task.id,
      role: index % 2 ? 'reviewer' : 'user',
      kind: index % 2 ? 'answer' : 'message',
      text: `Message ${index}`,
      time: new Date(1700000000000 + index * 1000).toISOString(),
      status: 'handled',
    }),
  );
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
    onExecution: (listener) => {
      update = listener;
      return () => undefined;
    },
    execute: async (action) => ({
      state,
      conversation: {
        messages:
          action.kind === 'conversation' && action.before
            ? messages.slice(0, 10)
            : messages.slice(10),
        before: action.kind === 'conversation' && action.before ? undefined : 'older',
      },
      evidence: { events: [] },
    }),
  };
  rtl.render(
    <App
      snapshot={{ ...snapshot, execution: state }}
      bridge={bridge}
      initialNavigation={{ view: 'task', taskId: task.id }}
    />,
  );
  await rtl.screen.findByText('Message 19');
  const scroller = document.querySelector<HTMLElement>('.chat-messages')!;
  Object.defineProperty(scroller, 'scrollHeight', {
    get: () => scroller.querySelectorAll('.chat-message').length * 100,
  });
  Object.defineProperty(scroller, 'clientHeight', { value: 400 });
  scroller.scrollTop = 100;
  rtl.fireEvent.scroll(scroller);
  const oldHeight = scroller.scrollHeight;
  click('Older records');
  await rtl.screen.findByText('Message 0');
  assert.equal(scroller.scrollTop, 100 + scroller.scrollHeight - oldHeight);
  const preserved = scroller.scrollTop;
  messages.push({
    id: 'new-message',
    taskId: task.id,
    role: 'reviewer',
    kind: 'answer',
    text: 'New reply',
    time: '2026-11-20T00:00:00.000Z',
  });
  await rtl.act(async () => update?.({ state: { ...state, conversationVersion: 1 }, events: [] }));
  await rtl.screen.findByText('New reply');
  assert.equal(scroller.scrollTop, preserved);
  assert.equal(rtl.screen.queryByRole('button', { name: 'Older records' }), null);
  click('New messages');
  assert.equal(scroller.scrollTop, scroller.scrollHeight);
});

test('icon-only message sizing, minimized errors and evidence preferences survive locale, task changes and reload', async () => {
  const previousWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true });
  try {
    const f = fixture();
    await f.store.dispatch({ kind: 'task.save', input: taskInput() });
    const snapshot = await f.store.snapshot(),
      task = snapshot.tasks[0];
    const state = { config: { prepare: [], checks: [] }, runs: [] };
    const messages: import('../../src/shared/execution').TaskMessage[] = [
      {
        id: 'process',
        taskId: task.id,
        role: 'reviewer',
        kind: 'process',
        text: 'Public text '.repeat(200),
        requestId: 'request',
        time: '2026-11-22T00:00:00Z',
        sequence: 2,
      },
      {
        id: 'error',
        taskId: task.id,
        role: 'system',
        kind: 'error',
        text: 'Failure',
        fault: { code: 'commandFailed', params: { name: 'Test', exitCode: 1 } },
        time: '2026-11-22T00:01:00Z',
      },
    ];
    const events: RunEvent[] = [
      {
        taskId: task.id,
        runId: 'run',
        sequence: 1,
        kind: 'tool',
        text: 'Recorded output',
        time: '2026-11-22T00:00:00Z',
      },
    ];
    let push: ((update: import('../../src/shared/execution').ExecutionUpdate) => void) | undefined;
    let saved: import('../../webview/src/chatViewState').WorkbenchViewState | undefined;
    const actions: import('../../src/shared/execution').ExecutionAction[] = [];
    const bridge: Bridge = {
      request: async () => snapshot,
      queryModels: async () => ({ models: [], fetchedAt: '' }),
      onModelsInvalidated: () => () => undefined,
      onExecution: (listener) => {
        push = listener;
        return () => undefined;
      },
      execute: async (action) => {
        actions.push(action);
        return {
          state,
          conversation: { messages: structuredClone(messages) },
          evidence: {
            events: structuredClone(events),
            summary: { records: events.length, errors: events.filter((e) => e.fault).length },
          },
        };
      },
    };
    const save = (value: import('../../webview/src/chatViewState').WorkbenchViewState) => {
      saved = value;
    };
    const ui = rtl.render(
      <App
        snapshot={{ ...snapshot, execution: state }}
        bridge={bridge}
        initialNavigation={{ view: 'task', taskId: task.id }}
        onViewState={save}
      />,
    );
    await rtl.screen.findByText(/Public text Public text/);
    const process = document.querySelector<HTMLElement>('[data-message-id="process"]')!;
    const expand = rtl.within(process).getByRole('button', { name: 'Expand message' });
    assert.equal(expand.textContent, '');
    assert.ok(expand.querySelector('svg'));
    assert.equal(expand.title, 'Expand message');
    rtl.fireEvent.click(expand);
    assert.equal(process.dataset.expanded, 'true');
    const error = document.querySelector<HTMLElement>('[data-message-id="error"]')!;
    rtl.fireEvent.click(rtl.within(error).getByRole('button', { name: 'Minimize record' }));
    assert.equal(error.dataset.minimized, 'true');
    assert.ok(rtl.within(error).getByText('Error'));
    assert.equal(rtl.within(error).queryByRole('alert'), null);
    await rtl.waitFor(() => assert.equal(document.querySelectorAll('.evidence-record').length, 1));
    const record = document.querySelector<HTMLDetailsElement>('.evidence-record')!;
    rtl.fireEvent.click(record.querySelector('summary')!);
    await rtl.waitFor(() => assert.equal(record.open, true));
    rtl.fireEvent.click(
      rtl.within(record.parentElement!).getByRole('button', { name: 'Minimize record' }),
    );
    assert.equal(record.parentElement!.dataset.minimized, 'true');
    click('Minimize evidence panel');
    assert.ok(document.querySelector('.evidence-rail'));
    assert.equal(document.querySelector<HTMLElement>('.evidence-panel')!.hidden, true);
    events.push({
      ...events[0],
      sequence: 2,
      kind: 'error',
      fault: { code: 'commandFailed' },
      text: 'New error',
    });
    await rtl.act(async () =>
      push?.({ state: { ...state, conversationVersion: 1 }, events: [events[1]] }),
    );
    await rtl.waitFor(() =>
      assert.equal(document.querySelector('.evidence-rail .chat-count')?.textContent, '1'),
    );
    assert.ok(document.querySelector('.evidence-rail .chat-error-badge'));
    assert.equal(document.querySelector<HTMLElement>('.evidence-panel')!.hidden, true);
    ui.rerender(
      <App
        snapshot={{ ...snapshot, execution: state, locale: 'zh-CN', language: 'zh-CN' }}
        bridge={bridge}
        onViewState={save}
      />,
    );
    assert.equal(process.dataset.expanded, 'true');
    assert.equal(error.dataset.minimized, 'true');
    click('恢复证据面板');
    await rtl.waitFor(() =>
      assert.equal(document.querySelector<HTMLElement>('.evidence-panel')!.hidden, false),
    );
    const restoredRecord = document.querySelector<HTMLDetailsElement>('.evidence-record')!;
    assert.equal(restoredRecord.open, true);
    assert.equal(restoredRecord.parentElement!.dataset.minimized, 'true');
    rtl.fireEvent.click(
      rtl.within(restoredRecord.parentElement!).getByRole('button', { name: '恢复记录' }),
    );
    assert.equal(restoredRecord.parentElement!.dataset.minimized, 'false');
    assert.equal(restoredRecord.open, true);
    click('最小化证据面板');
    await rtl.waitFor(() => assert.equal(saved?.chats[task.id].panel, 'minimized'));
    const persisted = structuredClone(saved!);
    ui.unmount();
    rtl.render(
      <App
        snapshot={{ ...snapshot, execution: state }}
        bridge={bridge}
        initialNavigation={persisted.navigation}
        initialChatViews={persisted.chats}
        onViewState={save}
      />,
    );
    await rtl.screen.findByText(/Public text Public text/);
    assert.equal(
      document.querySelector<HTMLElement>('[data-message-id="process"]')!.dataset.expanded,
      'true',
    );
    assert.equal(
      document.querySelector<HTMLElement>('[data-message-id="error"]')!.dataset.minimized,
      'true',
    );
    assert.ok(document.querySelector('.evidence-rail'));
    assert.ok(
      actions
        .filter((a) => a.kind === 'conversation')
        .every((a) => a.kind === 'conversation' && a.includeProcess),
    );
    assert.ok(!JSON.stringify(persisted).includes('Public text'));
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: previousWidth, configurable: true });
  }
});

test('activity shows silent waiting and command state, then removes animation on pause, stop and interruption', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const snapshot = await f.store.snapshot(),
    task = snapshot.tasks[0];
  const run: RunSummary = {
    id: 'run',
    taskId: task.id,
    status: 'planning',
    round: 0,
    maxRounds: 2,
    createdAt: '',
    updatedAt: '',
    sequence: 1,
  };
  const state: import('../../src/shared/execution').ExecutionSnapshot = {
    config: { prepare: [], checks: [] },
    runs: [run],
    activity: {
      id: 'request',
      taskId: task.id,
      runId: run.id,
      agent: 'reviewer',
      phase: 'planning',
      stage: 'waiting',
      startedAt: new Date(Date.now() - 5000).toISOString(),
    },
  };
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
    execute: async () => ({ state, conversation: { messages: [] }, evidence: { events: [] } }),
  };
  const ui = rtl.render(
    <App
      snapshot={{ ...snapshot, execution: state }}
      bridge={bridge}
      initialNavigation={{ view: 'task', taskId: task.id }}
    />,
  );
  await rtl.screen.findByText(/Waiting for model response/);
  assert.match(document.querySelector('.activity-time')!.textContent!, /^00:0[5-9]$/);
  assert.ok(document.querySelector('.activity-spinner'));
  ui.rerender(
    <App
      snapshot={{
        ...snapshot,
        execution: {
          ...state,
          activity: { ...state.activity!, stage: 'command', label: 'Regression' },
        },
      }}
      bridge={bridge}
    />,
  );
  await rtl.screen.findByText(/Running command: Regression/);
  for (const status of ['paused', 'stopped', 'failed', 'interrupted'] as const) {
    ui.rerender(
      <App
        snapshot={{ ...snapshot, execution: { ...state, runs: [{ ...run, status }] } }}
        bridge={bridge}
      />,
    );
    await rtl.waitFor(() => assert.equal(document.querySelector('.activity-spinner'), null));
    assert.equal(document.querySelector('.activity-time'), null);
    assert.ok(
      document.querySelector('.chat-activity')!.textContent!.includes(t('en', `run_${status}`)),
    );
  }
});

test('streamed process updates keep card identity and reader position; narrow minimization restores focus', async () => {
  const width = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  try {
    const f = fixture();
    await f.store.dispatch({ kind: 'task.save', input: taskInput() });
    const snapshot = await f.store.snapshot(),
      task = snapshot.tasks[0];
    const state = { config: { prepare: [], checks: [] }, runs: [] };
    let push: ((value: import('../../src/shared/execution').ExecutionUpdate) => void) | undefined;
    const message: import('../../src/shared/execution').TaskMessage = {
      id: 'stream',
      taskId: task.id,
      role: 'worker',
      kind: 'process',
      time: '2026-11-22T00:00:00Z',
      text: 'First chunk',
      sequence: 1,
    };
    const bridge: Bridge = {
      request: async () => snapshot,
      queryModels: async () => ({ models: [], fetchedAt: '' }),
      onModelsInvalidated: () => () => undefined,
      onExecution: (listener) => {
        push = listener;
        return () => undefined;
      },
      execute: async () => ({
        state,
        conversation: { messages: [structuredClone(message)] },
        evidence: { events: [] },
      }),
    };
    rtl.render(
      <App
        snapshot={{ ...snapshot, execution: state }}
        bridge={bridge}
        initialNavigation={{ view: 'task', taskId: task.id }}
      />,
    );
    await rtl.screen.findByText('First chunk');
    const card = document.querySelector<HTMLElement>('[data-message-id="stream"]')!;
    rtl.fireEvent.click(rtl.within(card).getByRole('button', { name: 'Expand message' }));
    const scroller = document.querySelector<HTMLElement>('.chat-messages')!;
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { value: 300 });
    scroller.scrollTop = 90;
    rtl.fireEvent.scroll(scroller);
    message.text += ' and next chunk';
    message.sequence = 2;
    await rtl.act(async () => push?.({ state: { ...state, conversationVersion: 1 }, events: [] }));
    await rtl.screen.findByText('First chunk and next chunk');
    assert.equal(document.querySelector('[data-message-id="stream"]'), card);
    assert.equal(card.dataset.expanded, 'true');
    assert.equal(scroller.scrollTop, 90);
    assert.ok(rtl.screen.getByRole('button', { name: 'New messages' }));
    // An older pagination/refresh response must not overwrite a newer streamed projection.
    message.text = 'old';
    message.sequence = 1;
    await rtl.act(async () => push?.({ state: { ...state, conversationVersion: 2 }, events: [] }));
    await rtl.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 140));
    });
    assert.ok(rtl.screen.getByText('First chunk and next chunk'));
    const trigger = rtl.screen.getByRole('button', { name: 'Tools, checks and review evidence' });
    trigger.focus();
    rtl.fireEvent.click(trigger);
    assert.ok(rtl.screen.getByRole('dialog'));
    click('Minimize evidence panel');
    assert.equal(rtl.screen.queryByRole('dialog'), null);
    assert.equal(document.activeElement, trigger);
    const restore = rtl.screen.getByRole('button', { name: 'Restore evidence panel' });
    assert.equal(restore, trigger);
    rtl.fireEvent.click(restore);
    assert.ok(rtl.screen.getByRole('dialog'));
    rtl.fireEvent.keyDown(document, { key: 'Escape' });
    assert.equal(rtl.screen.queryByRole('dialog'), null);
    assert.equal(document.activeElement, trigger);
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  }
});

async function recoveryUI(overrides: Partial<RunSummary> = {}, locale: 'en' | 'zh-CN' = 'en') {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const snapshot = await f.store.snapshot();
  snapshot.locale = locale;
  snapshot.connections = [
    {
      id: 'endpoint',
      name: 'Local fixture',
      baseUrl: 'http://localhost',
      defaultModel: 'fixture',
      hasKey: true,
    },
  ];
  const task = snapshot.tasks[0];
  task.worker = task.reviewer = { connectionId: 'endpoint', model: 'fixture' };
  const run: RunSummary = {
    id: 'recovery-run',
    taskId: task.id,
    status: 'failed',
    round: 2,
    maxRounds: 5,
    createdAt: '',
    updatedAt: '',
    sequence: 2,
    fault: { code: 'inferenceTimeout' },
    recovery: {
      generation: 1,
      attempts: 0,
      available: true,
      agent: 'worker',
      phase: 'worker',
      operation: 'model',
    },
    ...overrides,
  };
  const state: import('../../src/shared/execution').ExecutionSnapshot = {
    config: { prepare: [], checks: [] },
    runs: [run],
  };
  const calls: import('../../src/shared/execution').ExecutionAction[] = [];
  let push!: (update: import('../../src/shared/execution').ExecutionUpdate) => void;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const bridge: Bridge = {
    request: async () => snapshot,
    queryModels: async () => ({ models: [], fetchedAt: '' }),
    onModelsInvalidated: () => () => undefined,
    onExecution: (listener) => {
      push = listener;
      return () => undefined;
    },
    execute: async (action) => {
      calls.push(action);
      if (action.kind === 'resume') {
        await pending;
      }
      return {
        state,
        conversation: {
          messages: [
            {
              id: 'pending',
              role: 'user',
              kind: 'message',
              status: 'pending',
              taskId: task.id,
              text: 'Please explain',
              time: '',
            },
          ],
        },
        evidence: { events: [] },
      };
    },
  };
  const ui = rtl.render(
    <App
      snapshot={{ ...snapshot, execution: structuredClone(state) }}
      bridge={bridge}
      initialNavigation={{ view: 'task', taskId: task.id }}
    />,
  );
  await rtl.screen.findByRole('region', { name: t(locale, 'recoveryTitle') });
  return {
    snapshot,
    state,
    run,
    ui,
    calls,
    finish,
    update: async () => rtl.act(async () => push({ state: structuredClone(state), events: [] })),
  };
}

for (const locale of ['en', 'zh-CN'] as const) {
  test(`${locale}: recovery keeps the run, role, pending messages and minimized preferences; duplicate resume is suppressed`, async () => {
    const h = await recoveryUI(
      {
        kind: 'conversation',
        recovery: {
          generation: 1,
          attempts: 0,
          available: true,
          agent: 'reviewer',
          phase: 'answering',
          operation: 'model',
        },
      },
      locale,
    );
    await rtl.screen.findByText('Please explain');
    assert.ok(rtl.screen.getByText(t(locale, 'recoveryQueued'), { exact: false }));
    assert.equal(rtl.screen.queryByRole('button', { name: t(locale, 'chatResume') }), null);
    assert.match(document.querySelector('.recovery-position')!.textContent!, /Reviewer/);
    assert.ok(
      document
        .querySelector('.recovery-position')!
        .textContent!.includes(t(locale, 'recoveryPhaseAnswering')),
    );
    click(t(locale, 'executionEvidence'));
    click(t(locale, 'chatMinimizePanel'));
    const resume = rtl.screen.getByRole('button', {
      name: t(locale, 'resumeRun'),
    }) as HTMLButtonElement;
    assert.equal(resume.disabled, false);
    assert.ok(resume.querySelector('svg'));
    rtl.fireEvent.click(resume);
    rtl.fireEvent.click(resume);
    assert.deepEqual(
      h.calls.filter((a) => a.kind === 'resume'),
      [{ kind: 'resume', runId: h.run.id }],
    );
    h.run.status = 'recovering';
    h.run.recovery = { ...h.run.recovery!, attempts: 1, available: false, step: 'processes' };
    await h.update();
    assert.equal(resume.disabled, true);
    assert.equal(
      (rtl.screen.getByRole('button', { name: t(locale, 'stop') }) as HTMLButtonElement).disabled,
      false,
    );
    assert.ok(
      document
        .querySelector('.recovery-notice')!
        .textContent!.includes(t(locale, 'recoveryProcesses')),
    );
    assert.equal(document.querySelector('.recovery-notice .error-notice'), null);
    assert.equal(document.querySelector('.activity-spinner'), null);
    assert.equal(
      document.querySelector<HTMLElement>(
        '[aria-label="' + t(locale, 'executionEvidence') + '"].evidence-panel',
      )!.hidden,
      true,
    );
    await rtl.act(async () => h.finish());
    h.run.status = 'reviewer';
    delete h.run.fault;
    await h.update();
    assert.equal(document.querySelector('.recovery-notice'), null);
    assert.equal(document.querySelector<HTMLElement>('.evidence-panel')!.hidden, true);
    assert.equal(h.run.round, 2);
  });
}

test('legacy, exhausted, unconfirmed-process, missing-configuration and other-task recovery controls explain their restrictions', async () => {
  const h = await recoveryUI({ recovery: undefined });
  const resume = () =>
    rtl.screen.getByRole('button', { name: 'Continue execution' }) as HTMLButtonElement;
  assert.equal(resume().disabled, true);
  assert.ok(rtl.screen.getByText('No recovery point is available for this record.'));
  h.run.recovery = {
    generation: 1,
    attempts: 0,
    available: false,
    blocked: { code: 'toolCorrectionLimit' },
  };
  await h.update();
  assert.equal(resume().disabled, true);
  assert.ok(document.querySelector('.recovery-notice [data-error-code="toolCorrectionLimit"]'));
  h.run.recovery = {
    generation: 1,
    attempts: 1,
    available: true,
    agent: 'worker',
    phase: 'worker',
  };
  h.run.fault = { code: 'recoveryProcessUnknown' };
  await h.update();
  assert.equal(
    resume().disabled,
    false,
    'Continue rechecks uncertain processes; the host still blocks execution',
  );
  assert.ok(rtl.screen.getByText(/No command will run until cleanup is confirmed/));
  h.state.runs.unshift({ ...h.run, id: 'other', taskId: 'other-task', status: 'worker' });
  await h.update();
  assert.equal(resume().disabled, true);
  assert.ok(rtl.screen.getAllByText(t('en', 'otherTaskActive')).length);
  h.state.runs.shift();
  h.snapshot.connections[0].hasKey = false;
  h.ui.rerender(
    <App
      snapshot={{ ...h.snapshot, execution: structuredClone(h.state) }}
      bridge={{
        request: async () => h.snapshot,
        queryModels: async () => ({ models: [], fetchedAt: '' }),
        onModelsInvalidated: () => () => undefined,
      }}
    />,
  );
  await rtl.waitFor(() => assert.equal(resume().disabled, true));
  assert.ok(rtl.screen.getByRole('button', { name: t('en', 'openSettings') }));
  h.finish();
});

test('retry countdown follows the host deadline, distinguishes the next request and disappears on interruption', async () => {
  const h = await recoveryUI();
  const clock = Date.now();
  h.run.status = 'worker';
  h.state.activity = {
    id: 'request',
    taskId: h.run.taskId,
    runId: h.run.id,
    agent: 'worker',
    phase: 'worker',
    stage: 'waiting',
    startedAt: new Date(clock - 5000).toISOString(),
    retry: { attempt: 2, delayMs: 2000, retryAt: new Date(clock + 2000).toISOString() },
  };
  await h.update();
  assert.match(
    document.querySelector('.chat-activity')!.textContent!,
    /Waiting to retry · Request attempt 2\/3/,
  );
  assert.equal(rtl.screen.getByLabelText('Seconds until retry').textContent, '2s');
  await rtl.waitFor(
    () => assert.equal(rtl.screen.getByLabelText('Seconds until retry').textContent, '1s'),
    { timeout: 2500 },
  );
  assert.equal(rtl.screen.getByLabelText('Seconds until retry').textContent, '1s');
  h.state.activity.retry = { attempt: 2, delayMs: 0, requesting: true };
  await h.update();
  assert.match(
    document.querySelector('.chat-activity')!.textContent!,
    /Waiting for model response · Request attempt 2\/3/,
  );
  assert.equal(rtl.screen.queryByLabelText('Seconds until retry'), null);
  h.run.status = 'interrupted';
  await h.update();
  assert.equal(document.querySelector('.activity-spinner'), null);
  assert.equal(document.querySelector('.activity-time'), null);
  assert.doesNotMatch(document.querySelector('.chat-activity')!.textContent!, /Request attempt/);
  h.finish();
});

test('sidebar Settings visits retain the same composer, draft and reading position', async () => {
  const f = fixture();
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  const task = (await f.store.snapshot()).tasks[0];
  await mount(f, { view: 'task', taskId: task.id });
  const composer = document.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!;
  const conversation = document.querySelector<HTMLElement>('.chat-messages')!;
  rtl.fireEvent.change(composer, { target: { value: 'Keep my unsent draft' } });
  assert.ok(conversation);
  Object.defineProperties(conversation, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 300, configurable: true },
  });
  conversation.scrollTop = 125;
  rtl.fireEvent.scroll(conversation);
  click('Settings');
  assert.ok(document.querySelector('.task-surface[hidden]'));
  assert.equal(document.querySelector('.chat-composer textarea'), composer);
  click('Task execution');
  click('Back to task');
  assert.equal(document.querySelector('.chat-composer textarea'), composer);
  assert.equal(composer.value, 'Keep my unsent draft');
  assert.equal(conversation.scrollTop, 125);
});
