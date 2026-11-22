import * as vscode from 'vscode';
import { getLanguage, Workbench, viewId } from './workbench';
import { resolveLocale } from './shared/model';
import { t } from './shared/i18n';
let current: Workbench | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workbench = new Workbench(context);
  current = workbench;
  const handle = (action: () => Promise<unknown>) =>
    action().catch((error: unknown) => workbench.reportError(error));
  context.subscriptions.push(
    workbench,
    vscode.window.registerWebviewViewProvider(viewId, workbench, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('dualMind.alignPanelCenter', () =>
      handle(async () => vscode.commands.executeCommand('workbench.action.alignPanelCenter')),
    ),
    vscode.commands.registerCommand('dualMind.newTask', () =>
      handle(() => workbench.navigate(undefined, true)),
    ),
    vscode.commands.registerCommand('dualMind.selectTask', (id: string) =>
      handle(() => workbench.navigate(id)),
    ),
    vscode.commands.registerCommand('dualMind.openWorkbench', () => handle(() => workbench.open())),
    vscode.commands.registerCommand('dualMind.showStatus', () => {
      void vscode.window.showInformationMessage(
        t(resolveLocale(getLanguage(), vscode.env.language), 'statusReady'),
      );
    }),
  );
}

// VS Code releases the command, view and configuration subscriptions.
export async function deactivate(): Promise<void> {
  await current?.execution.shutdown();
  current = undefined;
}
