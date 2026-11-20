import { OperationError, errorText } from './shared/errors';
import * as vscode from 'vscode';
import { randomUUID, randomBytes } from 'node:crypto';
import { LocalStore, StoreError } from './core/store';
import { ModelQueries } from './core/modelQueries';
import { TaskWorkspaces } from './git/taskWorkspaces';
import { ExecutionService } from './execution/service';
import { RunRecords } from './execution/records';
import { LocalCommands } from './execution/commands';
import type { ExecutionAction, ExecutionUpdate, RunEvent } from './shared/execution';
import { ModelQueryError } from './providers/models';
import { t } from './shared/i18n';
import {
  resolveLocale,
  type ErrorCode,
  type HostMessage,
  type LanguageSetting,
} from './shared/model';

export const viewType = 'dualMind.workbench';
export function getLanguage(): LanguageSetting {
  const value = vscode.workspace.getConfiguration('dualMind').get<string>('language', 'auto');
  return value === 'en' || value === 'zh-CN' ? value : 'auto';
}
export class Workbench implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private ready: Promise<void> = Promise.resolve();
  private resolveReady: (() => void) | undefined;
  private rejectReady: ((error: Error) => void) | undefined;
  private readyTimeout: ReturnType<typeof setTimeout> | undefined;
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
        deserializeWebviewPanel: async (panel) => {
          // VS Code renders the restored panel only after this callback completes.
          // Waiting for the React acknowledgement here would block restoration.
          this.attach(panel);
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
  async navigate(taskId?: string, newTask = false) {
    if (taskId) {
      await this.store.dispatch({ kind: 'task.select', id: taskId });
    }
    this.navigationRequest = { id: randomUUID(), taskId, newTask };
    await this.open();
    await this.sendSnapshot();
    this.navigationRequest = undefined;
    this.changes.fire();
  }
  /** Host-only Git preparation; execution owns when this is called. */
  async prepareTaskWorkspace(taskId: string) {
    const task = (await this.store.snapshot()).tasks.find((item) => item.id === taskId);
    return this.taskWorkspaces.prepare(taskId, task?.git);
  }
  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
    } else {
      this.attach(
        vscode.window.createWebviewPanel(viewType, 'DualMind', vscode.ViewColumn.Active, {
          retainContextWhenHidden: true,
        }),
      );
    }
    await this.ready;
  }
  private attach(panel: vscode.WebviewPanel): void {
    if (this.panel && this.panel !== panel) {
      this.panel.dispose();
    }
    this.panel = panel;
    const root = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    panel.webview.options = { enableScripts: true, localResourceRoots: [root] };
    const nonce = randomBytes(24).toString('base64');
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'main.js'));
    const styles = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'main.css'));
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.ready.catch(() => undefined);
    this.readyTimeout = setTimeout(() => {
      this.rejectReady?.(new OperationError('workbenchTimeout'));
    }, 20000);
    this.panelDisposables = [
      panel.onDidDispose(() => {
        if (this.panel === panel) {
          this.models.dispose();
          this.panel = undefined;
        }
        clearTimeout(this.readyTimeout);
        this.rejectReady?.(new OperationError('workbenchClosed'));
        this.resolveReady = undefined;
        this.rejectReady = undefined;
        this.panelDisposables.forEach((disposable) => disposable.dispose());
        this.panelDisposables = [];
      }),
      panel.webview.onDidReceiveMessage((message: unknown) => {
        void this.onMessage(message, panel);
      }),
    ];
    const locale = resolveLocale(getLanguage(), vscode.env.language);
    panel.webview.html = `<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource}; font-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}'; connect-src 'none';">
<link rel="stylesheet" href="${styles}"><title>DualMind</title></head>
<body><div id="root"><p class="boot-message">${t(locale, 'loading')}</p></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
  }
  private async post(message: HostMessage): Promise<void> {
    await this.panel?.webview.postMessage(message);
  }
  private async sendSnapshot(): Promise<void> {
    if (!this.panel) {
      return;
    }
    try {
      await this.post({ type: 'snapshot', snapshot: await this.snapshot() });
    } catch (error) {
      await this.post({
        type: 'fatal',
        error: error instanceof StoreError ? error.code : 'storageFailed',
        fault: await this.store.publicError(error),
      });
    }
  }
  private async onMessage(value: unknown, source: vscode.WebviewPanel): Promise<void> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    const message = value as Record<string, unknown>;
    if (this.panel !== source) {
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
        if (action.kind === 'openDirectory') {
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
        const result = ['openDirectory', 'preview'].includes(action.kind)
          ? { state: this.execution.snapshot() }
          : await this.execution.request(action);
        await this.post({ type: 'execution.result', requestId: message.requestId, result });
      } catch (error) {
        await this.post({
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
        if (this.panel === source) {
          await source.webview.postMessage({
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
        if (this.panel === source) {
          await source.webview.postMessage({
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
      await this.sendSnapshot();
      return;
    }
    if (message.type === 'rendered') {
      clearTimeout(this.readyTimeout);
      this.resolveReady?.();
      this.resolveReady = undefined;
      this.rejectReady = undefined;
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
      const action = message.action as
        { kind?: string; id?: string; confirmed?: boolean } | undefined;
      let savedTaskId: string | undefined;
      if (
        action?.kind === 'task.delete' &&
        action.confirmed === true &&
        typeof action.id === 'string'
      ) {
        await this.execution.deleteTask(action.id);
      } else {
        savedTaskId = await this.store.dispatch(message.action);
      }
      this.changes.fire();
      await this.post({
        type: 'result',
        requestId: message.requestId,
        ok: true,
        snapshot: await this.snapshot(),
        savedTaskId,
      });
    } catch (error) {
      const code: ErrorCode = error instanceof StoreError ? error.code : 'storageFailed';
      await this.post({
        type: 'result',
        requestId: message.requestId,
        ok: false,
        error: code,
        fault: await this.store.publicError(error),
      });
    }
  }
  dispose(): void {
    void this.execution.shutdown();
    this.changes.dispose();
    clearTimeout(this.updateTimer);
    this.models.dispose();
    this.panel?.dispose();
    clearTimeout(this.readyTimeout);
  }
}
