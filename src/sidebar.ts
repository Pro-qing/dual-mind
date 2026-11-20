import * as vscode from 'vscode';
import type { Workbench } from './workbench';
import { t } from './shared/i18n';
import { terminalStatuses } from './shared/execution';
export class TaskSidebar implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly subscription: vscode.Disposable;
  constructor(private readonly workbench: Workbench) {
    this.subscription = workbench.onChanged(() => this.changed.fire());
  }
  getTreeItem(item: vscode.TreeItem) {
    return item;
  }
  async getChildren(): Promise<vscode.TreeItem[]> {
    let snapshot: Awaited<ReturnType<Workbench['snapshot']>>;
    try {
      snapshot = await this.workbench.snapshot();
    } catch (error) {
      await this.workbench.reportError(error);
      return [];
    }
    return snapshot.tasks.map((task) => {
      const run = snapshot.execution.runs.find((item) => item.taskId === task.id);
      const item = new vscode.TreeItem(task.name);
      item.id = task.id;
      item.tooltip = task.requirements;
      item.description = run
        ? `${t(snapshot.locale, `run_${run.status}`)} · ${run.round}/${run.maxRounds}`
        : t(snapshot.locale, 'pendingTask');
      item.iconPath = new vscode.ThemeIcon(
        run
          ? terminalStatuses.includes(run.status)
            ? run.status === 'completed'
              ? 'pass'
              : 'circle-outline'
            : 'sync~spin'
          : 'edit',
      );
      item.command = { command: 'dualMind.selectTask', title: task.name, arguments: [task.id] };
      return item;
    });
  }
  dispose() {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
