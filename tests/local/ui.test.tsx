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
  initialNavigation?: Partial<Navigation>,
  onNavigation?: (value: Navigation) => void,
) {
  const initial = await f.store.snapshot();
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    const [bridge] = useState<Bridge>(() => ({
      request: async (action: Action) => {
        await f.store.dispatch(action);
        const state = await f.store.snapshot();
        setSnapshot(state);
        return state;
      },
      queryModels: (id) => f.queries.query(id),
      onModelsInvalidated: f.onModelsInvalidated,
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
  rtl.fireEvent.click(rtl.screen.getAllByRole('button', { name })[0]);
}
async function settings() {
  click('Settings');
  await rtl.screen.findByRole('button', { name: 'API Connections' });
}

test('starts empty; preview is read-only and never writes real tasks', async () => {
  const f = await mount();
  assert.ok(rtl.screen.getByRole('heading', { name: 'No tasks yet' }));
  click('View examples');
  assert.ok(rtl.screen.getByText('Read-only examples · no requests or saved task data'));
  const del = rtl.screen.getAllByRole('button', { name: /Delete task:/ });
  assert.equal(del.length, 4);
  assert.ok(del.every((button) => (button as HTMLButtonElement).disabled));
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
  rtl.fireEvent.click(ui.getByRole('button', { name: 'Create draft' }));
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
  await mount(f);
  assert.equal(document.querySelector('.instruction-snapshot')?.textContent, original);
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
  click('Create draft');
  await rtl.waitFor(() =>
    assert.ok(rtl.screen.queryByRole('dialog') === null, 'The dialog should be closed'),
  );
  click('Edit draft');
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
  let navigation: Navigation = { view: 'workbench' };
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
    rtl.screen
      .getByRole('button', { name: 'Defaults for new tasks' })
      .getAttribute('aria-current') === 'page',
  );
  assert.equal(modelInput('Worker Model ID').value, 'cached-model');
  assert.equal(requests, 1, 'Restoring navigation must not query automatically');
  rtl.fireEvent.change(rtl.screen.getByLabelText('Language'), { target: { value: 'zh-CN' } });
  await rtl.screen.findByRole('heading', { name: '新任务的默认配置' });
  assert.ok(rtl.screen.getByRole('button', { name: '保存默认值' }));
  click('返回任务');
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
    await mount(f);
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
  click('Back to tasks');
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
  click('Create draft');
  await rtl.waitFor(() => assert.ok(rtl.screen.queryByRole('dialog') === null));
  const snapshot = await f.store.snapshot();
  assert.equal(snapshot.tasks[0].worker.model, 'draft-worker');
  assert.equal(snapshot.tasks[0].reviewer.model, 'reviewer-only');
  assert.equal(snapshot.defaults.worker.model, 'worker-only');
});
