import * as vscode from 'vscode';
import { getLanguage, Workbench } from './workbench';
import { resolveLocale } from './shared/model';
import { t } from './shared/i18n';
import { TaskSidebar } from './sidebar';
let current: Workbench | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workbench = new Workbench(context);
  current = workbench;
  const sidebar = new TaskSidebar(workbench);
  const handle = (action: () => Promise<unknown>) =>
    action().catch((error: unknown) => workbench.reportError(error));
  context.subscriptions.push(
    workbench,
    sidebar,
    vscode.window.createTreeView('dualMind.tasks', {
      treeDataProvider: sidebar,
      showCollapseAll: false,
    }),
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

// VS Code releases the command, panel and configuration subscriptions.
export async function deactivate(): Promise<void> {
  await current?.execution.shutdown();
  current = undefined;
}
