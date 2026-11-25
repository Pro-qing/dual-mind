import { toAppError, redactError, redactText, type AppError } from '../shared/errors';
import { randomUUID, createHash } from 'node:crypto';
import {
  type Action,
  type AgentBindings,
  type AppSnapshot,
  type ConnectionRecord,
  type ErrorCode,
  type GlobalData,
  type LanguageSetting,
  type Locale,
  type ModelBinding,
  type RoleText,
  type TaskInput,
  type TaskDraft,
  type WorkspaceData,
  emptyBinding,
  isBuiltIn,
  resolveLocale,
} from '../shared/model';
import { reviewerPresets } from '../shared/roles';

export const globalStorageKey = 'dualMind.local.global.v1';
export const workspaceStorageKey = 'dualMind.local.workspace.v1';
export const secretKey = (id: string): string => `dualMind.connection.${id}`;
export interface StateStorage {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}
export interface StorePorts {
  global: StateStorage;
  workspace: StateStorage;
  secrets: {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
    delete(key: string): PromiseLike<void>;
  };
  hasWorkspace(): boolean;
  workspaceName(): string;
  editorLanguage(): string;
  getLanguage(): LanguageSetting;
  setLanguage(value: LanguageSetting): PromiseLike<void>;
  askKey(name: string, locale: Locale): PromiseLike<string | undefined>;
  openWorkspace(): PromiseLike<unknown>;
  onConnectionChanged?(connectionId: string): void;
  assertMutable?(action: Action): void;
}
export class StoreError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StoreError('invalidMessage');
  }
  return value as Record<string, unknown>;
};
function string(value: unknown, required = true, limit = 50000, trim = false): string {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw new StoreError('required');
  }
  return trim ? value.trim() : value;
}
function id(value: unknown): string {
  return string(value, true, 200, true);
}
function optionalId(value: unknown): string | undefined {
  return value === undefined ? undefined : id(value);
}
function locale(value: unknown): Locale {
  if (value !== 'en' && value !== 'zh-CN') {
    throw new StoreError('invalidMessage');
  }
  return value;
}
function language(value: unknown): LanguageSetting {
  return value === 'auto' ? 'auto' : locale(value);
}
function binding(value: unknown): ModelBinding {
  const v = object(value);
  return {
    connectionId: string(v.connectionId, false, 200, true),
    model: string(v.model, false, 500, true),
  };
}
function bindings(value: unknown): AgentBindings {
  const v = object(value);
  return { worker: binding(v.worker), reviewer: binding(v.reviewer) };
}
function roleText(value: unknown): RoleText {
  const v = object(value);
  return {
    name: string(v.name, true, 200, true),
    purpose: string(v.purpose, false, 2000),
    instructions: string(v.instructions),
  };
}
function taskInput(value: unknown): TaskInput {
  const v = object(value);
  if (typeof v.maxRounds !== 'number' || !Number.isSafeInteger(v.maxRounds) || v.maxRounds <= 0) {
    throw new StoreError('invalidRounds');
  }
  const git = v.git === undefined ? undefined : object(v.git);
  const branch = (value: unknown) => {
    const name = string(value, true, 1000);
    if (
      name.startsWith('-') ||
      [...name].some(
        (char) =>
          char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || '~^:?*[\\'.includes(char),
      ) ||
      name.includes('..') ||
      name.includes('@{')
    ) {
      throw new StoreError('invalidMessage');
    }
    return name;
  };
  if (git && !['managed', 'current', 'branch'].includes(String(git.mode))) {
    throw new StoreError('invalidMessage');
  }
  return {
    ...(git
      ? {
          git:
            git.mode === 'branch'
              ? { mode: 'branch' as const, branch: branch(git.branch) }
              : git.mode === 'managed'
                ? {
                    mode: 'managed' as const,
                    ...(git.baseBranch === undefined ? {} : { baseBranch: branch(git.baseBranch) }),
                  }
                : { mode: 'current' as const },
        }
      : {}),
    ...bindings(v),
    name: string(v.name, true, 200, true),
    requirements: string(v.requirements),
    roleId: id(v.roleId),
    maxRounds: v.maxRounds,
  };
}
function connectionInput(value: unknown): Omit<ConnectionRecord, 'id'> {
  const v = object(value);
  const baseUrl = string(v.baseUrl, true, 2048, true);
  try {
    const parsed = new URL(baseUrl);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname
    ) {
      throw new Error('invalid');
    }
  } catch {
    throw new StoreError('invalidUrl');
  }
  if (
    v.protocol !== undefined &&
    !['chatCompletions', 'responses', 'anthropic'].includes(String(v.protocol))
  ) {
    throw new StoreError('invalidMessage');
  }
  if (
    v.provider !== undefined &&
    v.provider !== 'openaiCompatible' &&
    v.provider !== 'commandCode'
  ) {
    throw new StoreError('invalidMessage');
  }
  let contextWindows: Record<string, number> | undefined;
  if (v.contextWindows !== undefined) {
    const entries = Object.entries(object(v.contextWindows));
    if (entries.length > 200) {
      throw new StoreError('invalidMessage');
    }
    contextWindows = Object.fromEntries(
      entries.map(([model, window]) => {
        if (
          !model.trim() ||
          model.length > 500 ||
          model !== model.trim() ||
          [...model].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
          !Number.isSafeInteger(window) ||
          (window as number) < 8192 ||
          (window as number) > 4 * 1024 * 1024
        ) {
          throw new StoreError('invalidMessage');
        }
        return [model, window as number];
      }),
    );
  }
  return {
    ...(contextWindows === undefined ? {} : { contextWindows }),
    ...(v.provider === undefined ? {} : { provider: v.provider }),
    ...(v.protocol === undefined
      ? {}
      : { protocol: v.protocol as 'chatCompletions' | 'responses' | 'anthropic' }),
    name: string(v.name, true, 200, true),
    baseUrl,
    defaultModel: string(v.defaultModel, false, 500, true),
  };
}
function confirmed(v: Record<string, unknown>): true {
  if (v.confirmed !== true) {
    throw new StoreError('invalidMessage');
  }
  return true;
}
/** Treat the Webview as an input boundary; return only supported, validated fields. */
export function parseAction(value: unknown): Action {
  const v = object(value);
  switch (v.kind) {
    case 'task.save':
      return { kind: v.kind, id: optionalId(v.id), input: taskInput(v.input) };
    case 'task.select':
      return { kind: v.kind, id: id(v.id) };
    case 'task.delete': {
      const cleanup = v.cleanup === undefined ? undefined : object(v.cleanup);
      return {
        kind: v.kind,
        id: id(v.id),
        confirmed: confirmed(v),
        ...(cleanup
          ? { cleanup: { operationId: id(cleanup.operationId), token: id(cleanup.token) } }
          : {}),
      };
    }
    case 'connection.save':
      return { kind: v.kind, id: optionalId(v.id), input: connectionInput(v.input) };
    case 'connection.key':
      return { kind: v.kind, id: id(v.id) };
    case 'connection.delete':
      return { kind: v.kind, id: id(v.id), confirmed: confirmed(v) };
    case 'defaults.save':
      return { kind: v.kind, input: bindings(v.input) };
    case 'role.save':
      return {
        kind: v.kind,
        id: optionalId(v.id),
        locale: locale(v.locale),
        input: roleText(v.input),
      };
    case 'role.reset':
      return { kind: v.kind, id: id(v.id), locale: locale(v.locale), confirmed: confirmed(v) };
    case 'role.delete':
      return { kind: v.kind, id: id(v.id), confirmed: confirmed(v) };
    case 'language.set':
      return { kind: v.kind, value: language(v.value) };
    case 'workspace.open':
      return { kind: v.kind };
    default:
      throw new StoreError('invalidMessage');
  }
}
export function emptyGlobal(): GlobalData {
  return {
    version: 1,
    connections: [],
    defaults: { worker: emptyBinding(), reviewer: emptyBinding() },
    customRoles: [],
    overrides: {},
  };
}
export function emptyWorkspace(): WorkspaceData {
  return { version: 1, tasks: [], selectedTaskId: null };
}
function assertStored(global: GlobalData, workspace: WorkspaceData): void {
  if (
    global?.version !== 1 ||
    workspace?.version !== 1 ||
    !Array.isArray(global.connections) ||
    !Array.isArray(global.customRoles) ||
    !Array.isArray(workspace.tasks) ||
    !global.defaults ||
    !global.overrides
  ) {
    throw new StoreError('invalidStoredData');
  }
  // Validate persisted input fields too, without normalizing or rewriting user content.
  try {
    for (const c of global.connections) {
      id(c.id);
      connectionInput(c);
    }
    bindings(global.defaults);
    for (const r of global.customRoles) {
      if (r.builtIn || !r.id.startsWith('custom:')) {
        throw new Error('invalid');
      }
      id(r.id);
      roleText(r);
    }
    for (const [roleId, versions] of Object.entries(global.overrides)) {
      if (!isBuiltIn(roleId)) {
        throw new Error('invalid');
      }
      for (const [lang, text] of Object.entries(object(versions))) {
        locale(lang);
        const v = object(text);
        string(v.purpose, false, 2000);
        string(v.instructions);
      }
    }
    for (const task of workspace.tasks) {
      id(task.id);
      taskInput({ ...task, roleId: task.role.id });
      roleText(task.role);
      if (task.status !== 'draft' || !['en', 'zh-CN', 'original'].includes(task.role.locale)) {
        throw new Error('invalid');
      }
      string(task.createdAt);
      string(task.updatedAt);
    }
    if (workspace.selectedTaskId !== null) {
      id(workspace.selectedTaskId);
    }
  } catch {
    throw new StoreError('invalidStoredData');
  }
}

export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly ports: StorePorts) {}
  private read(): { global: GlobalData; workspace: WorkspaceData } {
    const global = this.ports.global.get(globalStorageKey, emptyGlobal());
    const workspace = this.ports.hasWorkspace()
      ? this.ports.workspace.get(workspaceStorageKey, emptyWorkspace())
      : emptyWorkspace();
    assertStored(global, workspace);
    return structuredClone({ global, workspace });
  }
  private serialize<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async snapshot(): Promise<AppSnapshot> {
    return this.serialize(async () => {
      const { global, workspace } = this.read();
      const setting = this.ports.getLanguage();
      const activeLocale = resolveLocale(setting, this.ports.editorLanguage());
      return {
        locale: activeLocale,
        language: setting,
        hasWorkspace: this.ports.hasWorkspace(),
        workspaceName: this.ports.workspaceName(),
        connections: await Promise.all(
          global.connections.map(async (c) => ({
            ...c,
            hasKey: Boolean(await this.ports.secrets.get(secretKey(c.id))),
          })),
        ),
        defaults: global.defaults,
        roles: reviewerPresets(global, activeLocale),
        tasks: workspace.tasks,
        selectedTaskId: workspace.tasks.some((task) => task.id === workspace.selectedTaskId)
          ? workspace.selectedTaskId
          : workspace.tasks[0]?.id || null,
      };
    });
  }
  /** Preserve the full user message while applying the same credential redaction rules. */
  async publicText(text: string): Promise<string> {
    return this.serialize(async () => {
      const { global } = this.read();
      const keys = await Promise.all(
        global.connections.map((c) => this.ports.secrets.get(secretKey(c.id))),
      );
      return redactText(
        text,
        keys.filter((key): key is string => Boolean(key)),
      );
    });
  }
  /** Sanitize errors in the host without exposing credential values to callers. */
  async publicError(error: unknown): Promise<AppError> {
    const fault = toAppError(error);
    try {
      const { global } = this.read();
      const keys = await Promise.all(
        global.connections.map((c) => this.ports.secrets.get(secretKey(c.id))),
      );
      return redactError(
        fault,
        keys.filter((key): key is string => Boolean(key)),
      );
    } catch {
      // If secrets cannot be read, avoid returning potentially sensitive details or parameters.
      return { code: fault.params ? 'operationFailed' : fault.code };
    }
  }
  /** Read credentials briefly under the store lock; network work runs outside it. */
  async connectionForQuery(connectionId: string): Promise<{
    baseUrl: string;
    key?: string;
    protocol?: ConnectionRecord['protocol'];
    provider?: ConnectionRecord['provider'];
  }> {
    return this.serialize(async () => {
      const { global } = this.read();
      const connection = global.connections.find((c) => c.id === connectionId);
      if (!connection) {
        throw new StoreError('notFound');
      }
      return {
        baseUrl: connection.baseUrl,
        key: await this.ports.secrets.get(secretKey(connectionId)),
        protocol: connection.protocol,
        provider: connection.provider,
      };
    });
  }
  executionInput(taskId: string) {
    return this.serialize(async () => {
      const { global, workspace } = this.read();
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task || !this.ports.hasWorkspace()) {
        throw new StoreError('notFound');
      }
      const endpoint = async (binding: { connectionId: string; model: string }) => {
        const c = global.connections.find((item) => item.id === binding.connectionId);
        const key = c && (await this.ports.secrets.get(secretKey(c.id)));
        if (!c || !key || !binding.model) {
          throw new StoreError('required');
        }
        return {
          ...c,
          model: binding.model,
          contextWindowTokens:
            c.contextWindows && Object.hasOwn(c.contextWindows, binding.model)
              ? c.contextWindows[binding.model]
              : undefined,
          key,
          provider: c.provider || 'openaiCompatible',
          protocol: c.protocol || ('chatCompletions' as const),
        };
      };
      return { task, worker: await endpoint(task.worker), reviewer: await endpoint(task.reviewer) };
    });
  }
  /** Host-only creation with an idempotent operation ID; no model request is started. */
  createDerivedTask(
    taskId: string,
    value: TaskInput,
    origin: { taskId?: string; snapshotId?: string },
    seed?: TaskDraft,
  ): Promise<string> {
    if (!/^[0-9a-f-]{36}$/.test(taskId)) {
      throw new StoreError('invalidMessage');
    }
    const input = taskInput(value);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ input, origin }))
      .digest('hex');
    return this.serialize(async () => {
      if (!this.ports.hasWorkspace()) {
        throw new StoreError('workspaceRequired');
      }
      const { global, workspace } = this.read();
      const existing = workspace.tasks.find((t) => t.id === taskId);
      if (existing) {
        if (existing.origin?.requestHash !== requestHash) {
          throw new StoreError('invalidMessage');
        }
        return taskId;
      }
      const activeLocale = resolveLocale(this.ports.getLanguage(), this.ports.editorLanguage());
      const preset = reviewerPresets(global, activeLocale).find((r) => r.id === input.roleId);
      const role =
        seed?.role.id === input.roleId
          ? seed.role
          : preset
            ? { ...preset, locale: preset.builtIn ? activeLocale : ('original' as const) }
            : undefined;
      if (!role) {
        throw new StoreError('notFound');
      }
      for (const agent of ['worker', 'reviewer'] as const) {
        const id = input[agent].connectionId;
        if (
          id &&
          !global.connections.some((c) => c.id === id) &&
          id !== seed?.[agent].connectionId
        ) {
          throw new StoreError('notFound');
        }
      }
      const fields = {
        name: input.name,
        requirements: input.requirements,
        worker: input.worker,
        reviewer: input.reviewer,
        maxRounds: input.maxRounds,
        git: input.git,
      };
      const now = new Date().toISOString();
      workspace.tasks.unshift({
        ...fields,
        id: taskId,
        status: 'draft',
        role: structuredClone(role),
        origin: { ...origin, requestHash },
        createdAt: now,
        updatedAt: now,
      });
      workspace.selectedTaskId = taskId;
      await this.ports.workspace.update(workspaceStorageKey, workspace);
      return taskId;
    });
  }
  async dispatch(value: unknown): Promise<string | undefined> {
    const action = parseAction(value);
    return this.serialize(async () => {
      this.ports.assertMutable?.(action);
      const { global, workspace } = this.read();
      const findConnection = (connectionId: string): ConnectionRecord => {
        const c = global.connections.find((item) => item.id === connectionId);
        if (!c) {
          throw new StoreError('notFound');
        }
        return c;
      };
      const validateBindings = (input: AgentBindings, previous?: AgentBindings): void => {
        for (const agent of ['worker', 'reviewer'] as const) {
          const selected = input[agent].connectionId;
          // A removed binding may remain on its existing draft until the user replaces it.
          if (selected && selected !== previous?.[agent].connectionId) {
            findConnection(selected);
          }
        }
      };
      if (action.kind.startsWith('task.') && !this.ports.hasWorkspace()) {
        throw new StoreError('workspaceRequired');
      }
      switch (action.kind) {
        case 'task.save': {
          const existing = action.id
            ? workspace.tasks.find((task) => task.id === action.id)
            : undefined;
          if (action.id && !existing) {
            throw new StoreError('notFound');
          }
          const currentLocale = resolveLocale(
            this.ports.getLanguage(),
            this.ports.editorLanguage(),
          );
          const preset = reviewerPresets(global, currentLocale).find(
            (role) => role.id === action.input.roleId,
          );
          if (!existing && !preset) {
            throw new StoreError('notFound');
          }
          validateBindings(action.input, existing);
          const { name, requirements, worker, reviewer, maxRounds } = action.input;
          const git = action.input.git ?? existing?.git;
          const input = {
            name,
            requirements,
            worker,
            reviewer,
            maxRounds,
            ...(git ? { git } : {}),
          };
          const now = new Date().toISOString();
          const task = {
            ...input,
            ...(existing?.origin ? { origin: existing.origin } : {}),
            id: existing?.id || randomUUID(),
            status: 'draft' as const,
            role: existing?.role || {
              ...preset!,
              locale: preset!.builtIn ? currentLocale : ('original' as const),
            },
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };
          workspace.tasks = existing
            ? workspace.tasks.map((item) => (item.id === existing.id ? task : item))
            : [task, ...workspace.tasks];
          workspace.selectedTaskId = task.id;
          await this.ports.workspace.update(workspaceStorageKey, workspace);
          return task.id;
        }
        case 'task.select':
          if (!workspace.tasks.some((task) => task.id === action.id)) {
            throw new StoreError('notFound');
          }
          workspace.selectedTaskId = action.id;
          await this.ports.workspace.update(workspaceStorageKey, workspace);
          break;
        case 'task.delete':
          if (!workspace.tasks.some((task) => task.id === action.id)) {
            throw new StoreError('notFound');
          }
          workspace.tasks = workspace.tasks.filter((task) => task.id !== action.id);
          if (workspace.selectedTaskId === action.id) {
            workspace.selectedTaskId = workspace.tasks[0]?.id || null;
          }
          await this.ports.workspace.update(workspaceStorageKey, workspace);
          break;
        case 'connection.save': {
          const previous = action.id ? findConnection(action.id) : undefined;
          const item = {
            ...action.input,
            ...(action.input.provider === undefined && previous?.provider
              ? { provider: previous.provider }
              : {}),
            ...(action.input.protocol === undefined && previous?.protocol
              ? { protocol: previous.protocol }
              : {}),
            ...(action.input.contextWindows === undefined && previous?.contextWindows
              ? { contextWindows: previous.contextWindows }
              : {}),
            id: action.id || randomUUID(),
          };
          global.connections = action.id
            ? global.connections.map((c) => (c.id === action.id ? item : c))
            : [...global.connections, item];
          await this.ports.global.update(globalStorageKey, global);
          if (
            previous &&
            (previous.baseUrl !== item.baseUrl ||
              (previous.protocol ?? 'chatCompletions') !== (item.protocol ?? 'chatCompletions') ||
              (previous.provider ?? 'openaiCompatible') !== (item.provider ?? 'openaiCompatible'))
          ) {
            this.ports.onConnectionChanged?.(item.id);
          }
          break;
        }
        case 'connection.delete': {
          findConnection(action.id);
          const key = secretKey(action.id);
          const previousSecret = await this.ports.secrets.get(key);
          await this.ports.secrets.delete(key);
          global.connections = global.connections.filter((c) => c.id !== action.id);
          for (const agent of ['worker', 'reviewer'] as const) {
            if (global.defaults[agent].connectionId === action.id) {
              global.defaults[agent] = emptyBinding();
            }
          }
          try {
            await this.ports.global.update(globalStorageKey, global);
          } catch (error) {
            if (previousSecret !== undefined) {
              await this.ports.secrets.store(key, previousSecret);
            }
            throw error;
          }
          this.ports.onConnectionChanged?.(action.id);
          break;
        }
        case 'connection.key': {
          const c = findConnection(action.id);
          const entered = await this.ports.askKey(
            c.name,
            resolveLocale(this.ports.getLanguage(), this.ports.editorLanguage()),
          );
          this.ports.assertMutable?.(action);
          if (entered !== undefined) {
            const key = string(entered, true, 10000, true);
            if (key !== (await this.ports.secrets.get(secretKey(c.id)))) {
              await this.ports.secrets.store(secretKey(c.id), key);
              this.ports.onConnectionChanged?.(c.id);
            }
          }
          break;
        }
        case 'defaults.save':
          validateBindings(action.input);
          global.defaults = action.input;
          await this.ports.global.update(globalStorageKey, global);
          break;
        case 'role.save': {
          if (action.id && isBuiltIn(action.id)) {
            global.overrides[action.id] = {
              ...global.overrides[action.id],
              [action.locale]: {
                purpose: action.input.purpose,
                instructions: action.input.instructions,
              },
            };
          } else {
            if (action.id && !global.customRoles.some((r) => r.id === action.id)) {
              throw new StoreError('notFound');
            }
            const item = {
              ...action.input,
              id: action.id || `custom:${randomUUID()}`,
              builtIn: false,
            };
            global.customRoles = action.id
              ? global.customRoles.map((r) => (r.id === action.id ? item : r))
              : [...global.customRoles, item];
          }
          await this.ports.global.update(globalStorageKey, global);
          break;
        }
        case 'role.reset':
          if (!isBuiltIn(action.id)) {
            throw new StoreError('builtInProtected');
          }
          delete global.overrides[action.id]?.[action.locale];
          await this.ports.global.update(globalStorageKey, global);
          break;
        case 'role.delete':
          if (isBuiltIn(action.id)) {
            throw new StoreError('builtInProtected');
          }
          if (!global.customRoles.some((r) => r.id === action.id)) {
            throw new StoreError('notFound');
          }
          global.customRoles = global.customRoles.filter((r) => r.id !== action.id);
          await this.ports.global.update(globalStorageKey, global);
          break;
        case 'language.set':
          await this.ports.setLanguage(action.value);
          break;
        case 'workspace.open':
          await this.ports.openWorkspace();
          break;
      }
      return undefined;
    });
  }
}
