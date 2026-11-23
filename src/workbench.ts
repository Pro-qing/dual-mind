import { OperationError, errorText } from './shared/errors';
import * as vscode from 'vscode';
import { randomUUID, randomBytes } from 'node:crypto';
import { LocalStore, StoreError, parseAction } from './core/store';
import { ModelQueries } from './core/modelQueries';
import { TaskWorkspaces } from './git/taskWorkspaces';
import { ExecutionService } from './execution/service';
import { RunRecords } from './execution/records';
import { LocalCommands } from './execution/commands';
import type { ExecutionAction, ExecutionUpdate, RunEvent } from './shared/execution';
import { ModelQueryError } from './providers/models';
import { t } from './shared/i18n';
import { ViewChannel } from './core/viewChannel';
import { chooseWorkbenchView } from './shared/viewState';
import {
  resolveLocale,
  type ErrorCode,
  type HostMessage,
  type LanguageSetting,
} from './shared/model';

export const viewType = 'dualMind.workbench'; // Legacy editor restoration only.
export const viewId = 'dualMind.tasks';
const viewStateKey = 'dualMind.sidebarViewState';
export function getLanguage(): LanguageSetting {
  const value = vscode.workspace.getConfiguration('dualMind').get<string>('language', 'auto');
  return value === 'en' || value === 'zh-CN' ? value : 'auto';
}
export class Workbench implements vscode.Disposable, vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private channel?: ViewChannel<HostMessage>;
  private readonly viewWaiters = new Set<(error?: Error) => void>();
  private viewDisposables: vscode.Disposable[] = [];
  private savedViewState: unknown;
  private localViewState: unknown;
  private legacyViewState: unknown;
  private stateWrite: Promise<void> = Promise.resolve();
  private navigationTail: Promise<unknown> = Promise.resolve();
  private readonly legacyPanels = new Set<vscode.WebviewPanel>();
  private readonly store: LocalStore;
  private readonly models: ModelQueries;
  private readonly taskWorkspaces: TaskWorkspaces;
  readonly execution: ExecutionService;
  private readonly changes = new vscode.EventEmitter<void>();
  readonly onChanged = this.changes.event;
  private updateTimer?: ReturnType<typeof setTimeout>;
  private pendingEvents: RunEvent[] = [];
  private navigationRequest?: { id: string; taskId?: string; newTask?: boolean };
  constructor(private readonly context: vscode.ExtensionContext) {
    this.savedViewState = context.workspaceState.get(viewStateKey);
    this.store = new LocalStore({
      global: context.globalState,
      workspace: context.workspaceState,
      secrets: context.secrets,
      hasWorkspace: () => Boolean(vscode.workspace.workspaceFolders?.length),
      workspaceName: () => vscode.workspace.name || '',
      editorLanguage: () => vscode.env.language,
      getLanguage,
      setLanguage: (value) =>
        vscode.workspace
          .getConfiguration('dualMind')
          .update('language', value, vscode.ConfigurationTarget.Global),
      askKey: (name, locale) =>
        vscode.window.showInputBox({
          title: `${t(locale, 'keyPrompt')} ${name}`,
          password: true,
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim() ? null : t(locale, 'keyRequired')),
        }),
      openWorkspace: () => vscode.commands.executeCommand('vscode.openFolder'),
      onConnectionChanged: (id) => this.models.invalidate(id),
      assertMutable: (action) => this.execution?.assertMutable(action),
    });
    this.taskWorkspaces = new TaskWorkspaces({
      state: context.workspaceState,
      trusted: () => vscode.workspace.isTrusted,
      folders: () =>
        (vscode.workspace.workspaceFolders || []).map((folder) =>
          folder.uri.scheme === 'file' ? folder.uri.fsPath : '',
        ),
      storageRoot: () =>
        context.storageUri?.scheme === 'file' ? context.storageUri.fsPath : undefined,
      taskExists: async (id) => (await this.store.snapshot()).tasks.some((task) => task.id === id),
    });
    this.execution = new ExecutionService(
      this.store,
      this.taskWorkspaces,
      new RunRecords(context.workspaceState, () => context.storageUri?.fsPath),
      new LocalCommands(),
    );
    this.execution.subscribe((update) => this.executionUpdate(update));
    void this.execution.ready.then(() => this.changes.fire()).catch(() => undefined);
    this.models = new ModelQueries(
      (id) => this.store.connectionForQuery(id),
      (connectionId) => {
        void this.post({ type: 'models.invalidated', connectionId });
      },
    );
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider('dualmind-diff', {
        provideTextDocumentContent: async (uri) => {
          try {
            return await this.execution.preview(uri.authority);
          } catch (error) {
            return errorText(
              resolveLocale(getLanguage(), vscode.env.language),
              await this.store.publicError(error),
            );
          }
        },
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('dualMind.language')) {
          void this.sendSnapshot();
        }
      }),
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.sendSnapshot();
      }),
    );
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(viewType, {
        deserializeWebviewPanel: async (panel, state: unknown) => {
          // Return without waiting for a rendered page; VS Code waits for this callback.
          this.migrateLegacyPanel(panel, state);
        },
      }),
    );
  }
  private executionUpdate(update: ExecutionUpdate) {
    this.pendingEvents.push(...update.events);
    this.pendingEvents = this.pendingEvents.slice(-80);
    if (this.updateTimer) {
      return;
    }
    this.updateTimer = setTimeout(() => {
      this.updateTimer = undefined;
      const events = this.pendingEvents.splice(0);
      void this.post({
        type: 'execution.update',
        update: { state: this.execution.snapshot(), events },
      });
      this.changes.fire();
    }, 100);
  }
  async snapshot() {
    const snapshot = await this.store.snapshot();
    await this.execution.ready;
    return {
      ...snapshot,
      initialViewState: chooseWorkbenchView(
        this.localViewState,
        this.savedViewState,
        this.legacyViewState,
        snapshot.tasks,
      ),
      execution: this.execution.snapshot(),
      preparedTaskIds: this.taskWorkspaces.preparedTaskIds(),
      navigationRequest: this.navigationRequest,
    };
  }
  async reportError(error: unknown): Promise<void> {
    const locale = resolveLocale(getLanguage(), vscode.env.language);
    const fault = await this.store.publicError(error);
    void vscode.window.showErrorMessage(errorText(locale, fault));
  }
  navigate(taskId?: string, newTask = false): Promise<void> {
    const navigate = async () => {
      if (taskId) {
        await this.store.dispatch({ kind: 'task.select', id: taskId });
      }
      this.navigationRequest = { id: randomUUID(), taskId, newTask };
      await this.open();
      await this.sendSnapshot();
      this.changes.fire();
    };
    const pending = this.navigationTail.then(navigate, navigate);
    this.navigationTail = pending.catch(() => undefined);
    return pending;
  }
  /** Host-only Git preparation; execution owns when this is called. */
  async prepareTaskWorkspace(taskId: string) {
    const task = (await this.store.snapshot()).tasks.find((item) => item.id === taskId);
    return this.taskWorkspaces.prepare(taskId, task?.git, task?.name);
  }
  async open(): Promise<void> {
    await vscode.commands.executeCommand(`${viewId}.focus`);
    if (!this.channel) {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer);
          this.viewWaiters.delete(finish);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const timer = setTimeout(() => finish(new OperationError('workbenchTimeout')), 20000);
        this.viewWaiters.add(finish);
      });
    }
    let channel = this.channel;
    if (!channel || !this.view) {
      throw new OperationError('workbenchClosed');
    }
    this.view.show(false);
    if (channel.needsReload) {
      this.resolveWebviewView(this.view, { state: this.localViewState });
      channel = this.channel!;
    }
    await channel.ready;
  }
  resolveWebviewView(view: vscode.WebviewView, context: vscode.WebviewViewResolveContext): void {
    this.releaseView();
    this.view = view;
    this.localViewState = context.state;
    const channel: ViewChannel<HostMessage> = new ViewChannel<HostMessage>(
      () => this.channel === channel,
      (message) => view.webview.postMessage(message),
    );
    this.channel = channel;
    this.configureWebview(view.webview);
    this.viewDisposables = [
      view.onDidDispose(() => {
        if (this.channel === channel) {
          this.releaseView();
        }
      }),
      view.onDidChangeVisibility(() => {
        if (view.visible && channel.active) {
          void this.sendSnapshot(channel);
        }
      }),
      view.webview.onDidReceiveMessage((message: unknown) => {
        void this.onMessage(message, channel).catch((error: unknown) => this.reportError(error));
      }),
    ];
    view.webview.html = this.pageHtml(view.webview);
    for (const finish of this.viewWaiters) {
      finish();
    }
  }
  private releaseView(): void {
    this.channel?.dispose();
    this.channel = undefined;
    this.view = undefined;
    for (const subscription of this.viewDisposables.splice(0)) {
      subscription.dispose();
    }
  }
  private configureWebview(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
    };
  }
  private pageHtml(webview: vscode.Webview, migration = false): string {
    const root = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const nonce = randomBytes(24).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'main.js'));
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(root, 'main.css'));
    const locale = resolveLocale(getLanguage(), vscode.env.language);
    const body = migration
      ? `<main class="boot-message"><h1>DualMind</h1><p>${t(locale, 'sidebarMigration')}</p><button id="retry">${t(locale, 'sidebarMigrationOpen')}</button></main><script nonce="${nonce}">const api=acquireVsCodeApi();document.getElementById('retry').addEventListener('click',()=>api.postMessage({type:'migration.retry'}));</script>`
      : `<div id="root"><p class="boot-message">${t(locale, 'loading')}</p></div><script nonce="${nonce}" src="${script}"></script>`;
    return `<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src 'none';">
<link rel="stylesheet" href="${styles}"><title>DualMind</title></head><body>${body}</body></html>`;
  }
  private migrateLegacyPanel(panel: vscode.WebviewPanel, state: unknown): void {
    this.legacyViewState ??= state;
    this.legacyPanels.add(panel);
    this.configureWebview(panel.webview);
    panel.webview.html = this.pageHtml(panel.webview, true);
    let busy = false;
    const migrate = async () => {
      if (busy || !this.legacyPanels.has(panel)) {
        return;
      }
      busy = true;
      try {
        await this.open();
        await this.stateWrite;
        if (this.legacyPanels.has(panel)) {
          panel.dispose();
        }
      } catch (error) {
        if (this.legacyPanels.has(panel)) {
          await this.reportError(error);
        }
      } finally {
        busy = false;
      }
    };
    const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'migration.retry'
      ) {
        void migrate();
      }
    });
    const disposed = panel.onDidDispose(() => {
      this.legacyPanels.delete(panel);
      listener.dispose();
      disposed.dispose();
    });
    void migrate();
  }
  private async post(message: HostMessage, target = this.channel): Promise<void> {
    await target?.send(message);
  }
  private async sendSnapshot(target = this.channel): Promise<void> {
    if (!target?.active) {
      return;
    }
    try {
      await this.post({ type: 'snapshot', snapshot: await this.snapshot() }, target);
    } catch (error) {
      await this.post(
        {
          type: 'fatal',
          error: error instanceof StoreError ? error.code : 'storageFailed',
          fault: await this.store.publicError(error),
        },
        target,
      );
    }
  }
  private async persistViewState(value: unknown, source: ViewChannel<HostMessage>): Promise<void> {
    if (!source.active || JSON.stringify(value ?? null).length > 2 * 1024 * 1024) {
      return;
    }
    // Enqueue before reading storage: slower old snapshots must not overwrite a
    // newer navigation or preference message.
    this.stateWrite = this.stateWrite
      .catch(() => undefined)
      .then(async () => {
        if (!source.active) {
          return;
        }
        const snapshot = await this.store.snapshot();
        if (!source.active) {
          return;
        }
        const state = chooseWorkbenchView(value, undefined, undefined, snapshot.tasks);
        if (state) {
          await this.context.workspaceState.update(viewStateKey, state);
          if (source.active) {
            this.localViewState = state;
            this.savedViewState = state;
          }
        }
      });
    await this.stateWrite;
  }
  private async onMessage(value: unknown, source: ViewChannel<HostMessage>): Promise<void> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    const message = value as Record<string, unknown>;
    const post = (reply: HostMessage) => source.send(reply);
    if (!source.active) {
      return;
    }
    if (message.type === 'navigation.ack') {
      if (message.id === this.navigationRequest?.id) {
        this.navigationRequest = undefined;
      }
      return;
    }
    if (message.type === 'view.state') {
      await this.persistViewState(message.state, source);
      return;
    }
    if (message.type === 'execution.request') {
      if (
        typeof message.requestId !== 'string' ||
        message.requestId.length > 100 ||
        !message.action ||
        typeof message.action !== 'object'
      ) {
        return;
      }
      try {
        const action = message.action as ExecutionAction;
        if (action.kind === 'git.openMerge') {
          const directory = await this.taskWorkspaces.artifacts.mergeDirectory(
            action.taskId,
            action.operationId,
          );
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(directory), {
            forceNewWindow: true,
          });
        } else if (action.kind === 'openDirectory') {
          const directory = await this.execution.directory(action.runId);
          const run = this.execution.snapshot().runs.find((item) => item.id === action.runId);
          if (run?.git?.strategy && run.git.strategy.mode !== 'managed') {
            await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
          } else {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(directory), {
              forceNewWindow: true,
            });
          }
        } else if (action.kind === 'preview') {
          await this.execution.directory(action.runId);
          const uri = vscode.Uri.from({
            scheme: 'dualmind-diff',
            authority: action.runId,
            path: '/Task Changes.diff',
            query: Date.now().toString(),
          });
          const document = await vscode.workspace.openTextDocument(uri);
          await vscode.languages.setTextDocumentLanguage(document, 'diff');
          await vscode.window.showTextDocument(document, { preview: true });
        }
        const result = ['openDirectory', 'preview', 'git.openMerge'].includes(action.kind)
          ? { state: this.execution.snapshot() }
          : await this.execution.request(action);
        if ('createdTaskId' in result && typeof result.createdTaskId === 'string') {
          this.navigationRequest = { id: randomUUID(), taskId: result.createdTaskId };
          this.changes.fire();
          await post({ type: 'snapshot', snapshot: await this.snapshot() });
        }
        await post({ type: 'execution.result', requestId: message.requestId, result });
      } catch (error) {
        await post({
          type: 'execution.result',
          requestId: message.requestId,
          fault: await this.store.publicError(error),
        });
      }
      return;
    }
    if (message.type === 'models.query') {
      if (
        typeof message.requestId !== 'string' ||
        !message.requestId ||
        message.requestId.length > 100 ||
        typeof message.connectionId !== 'string'
      ) {
        return;
      }
      const { requestId, connectionId } = message;
      try {
        const result = await this.models.query(connectionId);
        if (source.active) {
          await source.send({
            type: 'models.result',
            requestId,
            connectionId,
            ok: true,
            result,
          } satisfies HostMessage);
        }
      } catch (error) {
        const code =
          error instanceof ModelQueryError
            ? error.code
            : error instanceof StoreError && error.code === 'notFound'
              ? 'notFound'
              : 'storageFailed';
        if (source.active) {
          await source.send({
            type: 'models.result',
            requestId,
            connectionId,
            ok: false,
            error: code,
          } satisfies HostMessage);
        }
      }
      return;
    }
    if (message.type === 'ready') {
      if (source.needsReload) {
        source.reset();
      }
      await this.sendSnapshot(source);
      return;
    }
    if (message.type === 'rendered') {
      // Durable display state precedes closing a legacy tab after migration.
      await this.persistViewState(message.state, source);
      await this.stateWrite;
      source.acknowledge();
      if (source.active) {
        // Restoration can resolve the sidebar independently of the focus command.
        // Its durable render acknowledgement is the migration completion boundary.
        for (const panel of this.legacyPanels) {
          panel.dispose();
        }
      }
      return;
    }

    if (
      message.type !== 'request' ||
      typeof message.requestId !== 'string' ||
      message.requestId.length > 100
    ) {
      return;
    }
    try {
      const action = parseAction(message.action);
      let savedTaskId: string | undefined;
      if (
        action?.kind === 'task.delete' &&
        action.confirmed === true &&
        typeof action.id === 'string'
      ) {
        await this.execution.deleteTask(action.id, action.cleanup);
      } else {
        savedTaskId = await this.store.dispatch(message.action);
      }
      this.changes.fire();
      await post({
        type: 'result',
        requestId: message.requestId,
        ok: true,
        snapshot: await this.snapshot(),
        savedTaskId,
      });
    } catch (error) {
      const code: ErrorCode = error instanceof StoreError ? error.code : 'storageFailed';
      await post({
        type: 'result',
        requestId: message.requestId,
        ok: false,
        error: code,
        fault: await this.store.publicError(error),
      });
    }
  }
  dispose(): void {
    for (const finish of this.viewWaiters) {
      finish(new OperationError('workbenchClosed'));
    }
    void this.execution.shutdown();
    this.changes.dispose();
    clearTimeout(this.updateTimer);
    this.models.dispose();
    this.releaseView();
  }
}
