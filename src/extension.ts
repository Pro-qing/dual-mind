import * as vscode from 'vscode';
import { getLanguage, Workbench } from './workbench';
import { resolveLocale } from './shared/model';
import { t } from './shared/i18n';

export function activate(context: vscode.ExtensionContext): void {
  const workbench = new Workbench(context);
  context.subscriptions.push(
    workbench,
    vscode.commands.registerCommand('dualMind.openWorkbench', () => workbench.open()),
    vscode.commands.registerCommand('dualMind.showStatus', () => {
      void vscode.window.showInformationMessage(
        t(resolveLocale(getLanguage(), vscode.env.language), 'statusReady'),
      );
    }),
  );
}

// VS Code releases the command, panel and configuration subscriptions.
export function deactivate(): void {}
