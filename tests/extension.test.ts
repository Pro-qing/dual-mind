import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('DualMind extension host', () => {
  test('discovers the status command and activates the extension through it', async () => {
    const extension = vscode.extensions.getExtension('Pro-qing.dual-mind');
    assert.ok(extension, 'The development extension must be discoverable');
    await vscode.commands.executeCommand('dualMind.showStatus');
    assert.equal(extension.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('dualMind.showStatus'));
    assert.ok(commands.includes('dualMind.openWorkbench'));
  });
  test('renders the React Webview, reuses its tab, and opens again after closing', async () => {
    const tabs = () =>
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof vscode.TabInputWebview && tab.label === 'DualMind');
    // The command resolves only after the real Webview renders its host snapshot.
    await vscode.commands.executeCommand('dualMind.openWorkbench');
    assert.equal(tabs().length, 1);
    const original = tabs()[0];
    await vscode.commands.executeCommand('dualMind.openWorkbench');
    assert.equal(tabs().length, 1);
    assert.equal(tabs()[0], original);
    await vscode.window.tabGroups.close(tabs());
    await vscode.commands.executeCommand('dualMind.openWorkbench');
    assert.equal(tabs().length, 1);
    await vscode.window.tabGroups.close(tabs());
  });
});
