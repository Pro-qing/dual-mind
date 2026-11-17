import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const statusCommand = vscode.commands.registerCommand('dualMind.showStatus', () => {
    void vscode.window.showInformationMessage(
      'DualMind scaffold is ready. UI design is pending review.',
    );
  });

  context.subscriptions.push(statusCommand);
}

// VS Code disposes the command through context.subscriptions during deactivation.
export function deactivate(): void {}
