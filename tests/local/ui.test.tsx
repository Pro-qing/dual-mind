import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { JSDOM } from 'jsdom';
import { App } from '../../webview/src/App';
import type { Action } from '../../src/shared/model';
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
async function mount(f = fixture()) {
  const initial = await f.store.snapshot();
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    return (
      <App
        snapshot={snapshot}
        bridge={{
          request: async (action: Action) => {
            await f.store.dispatch(action);
            const state = await f.store.snapshot();
            setSnapshot(state);
            return state;
          },
        }}
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
  rtl.fireEvent.change(rtl.screen.getByLabelText(/Default model ID/), {
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
  rtl.fireEvent.change(rtl.screen.getByLabelText(/默认模型 ID/), { target: { value: 'model' } });
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
