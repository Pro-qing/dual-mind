import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('DualMind extension host', () => {
  test('discovers the status command and activates the extension through it', async () => {
    const extension = vscode.extensions.getExtension('dual-mind-dev-placeholder.dual-mind');
    assert.ok(extension, 'The development extension must be discoverable');

    // Execute the manifest command before calling activate() to verify lazy activation.
    await vscode.commands.executeCommand('dualMind.showStatus');
    assert.equal(extension.isActive, true, 'Executing the command must activate the extension');

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('dualMind.showStatus'), 'The activated command must be registered');
  });
});
