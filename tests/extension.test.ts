import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  test('installed extension resources run offline commands without system PATH', async function () {
    if (process.platform !== 'linux' || process.arch !== 'x64') {
      this.skip();
    }
    const extension = vscode.extensions.getExtension('Pro-qing.dual-mind');
    assert.ok(extension);
    const cwd = await mkdtemp(join(tmpdir(), 'dualmind-host-tools-'));
    try {
      await writeFile(join(cwd, 'sample.txt'), 'search 中文\n');
      await writeFile(join(cwd, 'sample.json'), '{"value":"中文"}');
      const command = async (name: string, args: string[]) =>
        (
          await promisify(execFile)(
            join(extension.extensionPath, 'dist', 'tools', 'linux-x64', name, name),
            args,
            {
              cwd,
              env: { PATH: '', LC_ALL: 'C.UTF-8' },
              timeout: 5000,
              maxBuffer: 65536,
            },
          )
        ).stdout;
      assert.match(await command('rg', ['--threads', '2', '--', 'search', 'sample.txt']), /中文/);
      assert.match(
        await command('fd', ['--threads', '2', '--type', 'f', 'sample', '.']),
        /sample.txt/,
      );
      assert.equal((await command('jq', ['-r', '.value', 'sample.json'])).trim(), '中文');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
