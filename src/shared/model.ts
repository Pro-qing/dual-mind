export type Locale = 'en' | 'zh-CN';
export type LanguageSetting = 'auto' | Locale;
export const builtInIds = ['bug', 'feature', 'review', 'refactor'] as const;
export type BuiltInRoleId = (typeof builtInIds)[number];

export interface RoleText {
  name: string;
  purpose: string;
  instructions: string;
}
export interface ReviewerPreset extends RoleText {
  id: string;
  builtIn: boolean;
}
export interface RoleSnapshot extends RoleText {
  id: string;
  locale: Locale | 'original';
  builtIn: boolean;
}
export interface ModelBinding {
  connectionId: string;
  model: string;
}
export interface AgentBindings {
  worker: ModelBinding;
  reviewer: ModelBinding;
}
export interface ConnectionRecord {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
}
export interface ConnectionSummary extends ConnectionRecord {
  hasKey: boolean;
}
export interface TaskInput extends AgentBindings {
  name: string;
  requirements: string;
  roleId: string;
  maxRounds: number;
}
export interface TaskDraft extends Omit<TaskInput, 'roleId'> {
  id: string;
  role: RoleSnapshot;
  status: 'draft';
  createdAt: string;
  updatedAt: string;
}
export interface GlobalData {
  version: 1;
  connections: ConnectionRecord[];
  defaults: AgentBindings;
  customRoles: ReviewerPreset[];
  overrides: Partial<
    Record<BuiltInRoleId, Partial<Record<Locale, Pick<RoleText, 'purpose' | 'instructions'>>>>
  >;
}
export interface WorkspaceData {
  version: 1;
  tasks: TaskDraft[];
  selectedTaskId: string | null;
}
export interface AppSnapshot {
  locale: Locale;
  language: LanguageSetting;
  hasWorkspace: boolean;
  workspaceName: string;
  connections: ConnectionSummary[];
  defaults: AgentBindings;
  roles: ReviewerPreset[];
  tasks: TaskDraft[];
  selectedTaskId: string | null;
}
export type Action =
  | { kind: 'task.save'; id?: string; input: TaskInput }
  | { kind: 'task.select'; id: string }
  | { kind: 'task.delete'; id: string; confirmed: true }
  | { kind: 'connection.save'; id?: string; input: Omit<ConnectionRecord, 'id'> }
  | { kind: 'connection.delete'; id: string; confirmed: true }
  | { kind: 'connection.key'; id: string }
  | { kind: 'defaults.save'; input: AgentBindings }
  | { kind: 'role.save'; id?: string; locale: Locale; input: RoleText }
  | { kind: 'role.reset'; id: string; locale: Locale; confirmed: true }
  | { kind: 'role.delete'; id: string; confirmed: true }
  | { kind: 'language.set'; value: LanguageSetting }
  | { kind: 'workspace.open' };
export type ErrorCode =
  | 'invalidMessage'
  | 'required'
  | 'invalidUrl'
  | 'invalidRounds'
  | 'notFound'
  | 'workspaceRequired'
  | 'builtInProtected'
  | 'storageFailed'
  | 'invalidStoredData'
  | 'unavailable';
export const modelErrorCodes = [
  'invalidMessage',
  'notFound',
  'storageFailed',
  'invalidUrl',
  'keyRequired',
  'modelsAuth',
  'modelsForbidden',
  'modelsUnsupported',
  'modelsRateLimited',
  'modelsServer',
  'modelsTimeout',
  'modelsNetwork',
  'modelsInvalidResponse',
  'modelsTooLarge',
  'modelsRedirect',
  'modelsBusy',
  'modelsChanged',
  'modelsFailed',
] as const;
export type ModelErrorCode = (typeof modelErrorCodes)[number];
export interface ModelList {
  models: string[];
  fetchedAt: string;
}
export interface ModelQueryState {
  status: 'loading' | 'success' | 'error';
  models: string[];
  fetchedAt?: string;
  error?: ModelErrorCode;
}
export type ModelQueryResult =
  | { type: 'models.result'; requestId: string; connectionId: string; ok: true; result: ModelList }
  | {
      type: 'models.result';
      requestId: string;
      connectionId: string;
      ok: false;
      error: ModelErrorCode;
    };
export type ClientMessage =
  | { type: 'models.query'; requestId: string; connectionId: string }
  | { type: 'ready' | 'rendered' }
  | { type: 'request'; requestId: string; action: Action };
export type HostMessage =
  | ModelQueryResult
  | { type: 'models.invalidated'; connectionId: string }
  | { type: 'snapshot'; snapshot: AppSnapshot }
  | { type: 'result'; requestId: string; ok: boolean; error?: ErrorCode; snapshot?: AppSnapshot }
  | { type: 'fatal'; error: ErrorCode };
export interface Bridge {
  request(action: Action): Promise<AppSnapshot>;
  queryModels(connectionId: string): Promise<ModelList>;
  onModelsInvalidated(listener: (connectionId: string) => void): () => void;
}
export function emptyBinding(): ModelBinding {
  return { connectionId: '', model: '' };
}
export function isBuiltIn(id: string): id is BuiltInRoleId {
  return (builtInIds as readonly string[]).includes(id);
}
export function resolveLocale(setting: LanguageSetting, editorLanguage: string): Locale {
  return setting === 'auto'
    ? editorLanguage.toLowerCase().startsWith('zh')
      ? 'zh-CN'
      : 'en'
    : setting;
}
