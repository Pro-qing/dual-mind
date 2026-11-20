import type { AppError } from './errors';
import type {
  Protocol,
  ExecutionAction,
  ExecutionReply,
  ExecutionUpdate,
  ExecutionSnapshot,
} from './execution';
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
  protocol?: Protocol;
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
}
export interface ConnectionSummary extends ConnectionRecord {
  hasKey: boolean;
}
export type GitStrategy = { mode: 'managed' | 'current' } | { mode: 'branch'; branch: string };
export interface RepositoryInfo {
  currentBranch: string;
  branches: string[];
}
export interface TaskInput extends AgentBindings {
  git?: GitStrategy;
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
  preparedTaskIds?: string[];
  execution?: ExecutionSnapshot;
  navigationRequest?: { id: string; taskId?: string; newTask?: boolean };
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
export interface ActionReply extends AppSnapshot {
  savedTaskId?: string;
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
  | 'unavailable'
  | 'executionLocked'
  | 'gitLocked';
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
  | { type: 'execution.request'; requestId: string; action: ExecutionAction }
  | { type: 'models.query'; requestId: string; connectionId: string }
  | { type: 'ready' | 'rendered' }
  | { type: 'request'; requestId: string; action: Action };
export type HostMessage =
  | { type: 'execution.update'; update: ExecutionUpdate }
  | {
      type: 'execution.result';
      requestId: string;
      result?: ExecutionReply;
      error?: string;
      fault?: AppError;
    }
  | ModelQueryResult
  | { type: 'models.invalidated'; connectionId: string }
  | { type: 'snapshot'; snapshot: AppSnapshot }
  | {
      type: 'result';
      requestId: string;
      ok: boolean;
      error?: ErrorCode;
      fault?: AppError;
      snapshot?: AppSnapshot;
      savedTaskId?: string;
    }
  | { type: 'fatal'; error: ErrorCode; fault?: AppError };
export interface Bridge {
  execute?(action: ExecutionAction): Promise<ExecutionReply>;
  onExecution?(listener: (update: ExecutionUpdate) => void): () => void;
  request(action: Action): Promise<ActionReply>;
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
