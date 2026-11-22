import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('DualMind extension host', () => {
  const tabs = () =>
    vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.input instanceof vscode.TabInputWebview && tab.label === 'DualMind');
  test('registers the native webview and existing commands', async () => {
    const extension = vscode.extensions.getExtension('Pro-qing.dual-mind');
    assert.ok(extension);
    await vscode.commands.executeCommand('dualMind.showStatus');
    assert.equal(extension.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'dualMind.openWorkbench',
      'dualMind.newTask',
      'dualMind.selectTask',
      'dualMind.alignPanelCenter',
    ]) {
      assert.ok(commands.includes(command));
    }
    const views = extension.packageJSON.contributes.views.dualMind as {
      id: string;
      type: string;
    }[];
    assert.deepEqual(
      views.map(({ id, type }) => ({ id, type })),
      [{ id: 'dualMind.tasks', type: 'webview' }],
    );
  });
  test('renders and reuses the sidebar without creating editor tabs, including after hiding', async () => {
    const count = tabs().length;
    await Promise.all([
      vscode.commands.executeCommand('dualMind.openWorkbench'),
      vscode.commands.executeCommand('dualMind.openWorkbench'),
    ]);
    assert.equal(tabs().length, count);
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('dualMind.openWorkbench');
    assert.equal(tabs().length, count);
    await vscode.commands.executeCommand('dualMind.alignPanelCenter');
  });
});
