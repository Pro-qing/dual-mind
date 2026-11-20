import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { LocalStore, StoreError } from './core/store';
import { ModelQueries } from './core/modelQueries';
import { TaskWorkspaces } from './git/taskWorkspaces';
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
    this.models = new ModelQueries(
      (id) => this.store.connectionForQuery(id),
      (connectionId) => {
        void this.post({ type: 'models.invalidated', connectionId });
      },
    );
    context.subscriptions.push(
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
  /** Host-only future execution hook. No command or Webview action invokes this yet. */
  prepareTaskWorkspace(taskId: string) {
    return this.taskWorkspaces.prepare(taskId);
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
      this.rejectReady?.(new Error(t(resolveLocale(getLanguage(), vscode.env.language), 'fatal')));
    }, 20000);
    this.panelDisposables = [
      panel.onDidDispose(() => {
        if (this.panel === panel) {
          this.models.dispose();
          this.panel = undefined;
        }
        clearTimeout(this.readyTimeout);
        this.rejectReady?.(new Error('Workbench closed'));
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
      await this.post({ type: 'snapshot', snapshot: await this.store.snapshot() });
    } catch (error) {
      await this.post({
        type: 'fatal',
        error: error instanceof StoreError ? error.code : 'storageFailed',
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
      await this.store.dispatch(message.action);
      await this.post({
        type: 'result',
        requestId: message.requestId,
        ok: true,
        snapshot: await this.store.snapshot(),
      });
    } catch (error) {
      const code: ErrorCode = error instanceof StoreError ? error.code : 'storageFailed';
      await this.post({ type: 'result', requestId: message.requestId, ok: false, error: code });
    }
  }
  dispose(): void {
    this.models.dispose();
    this.panel?.dispose();
    clearTimeout(this.readyTimeout);
  }
}
