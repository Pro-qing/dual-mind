import type { GitStrategy, RepositoryInfo } from './model';
export interface TaskGitWorkspace {
  strategy?: GitStrategy;
  headCommit?: string;
  taskId: string;
  repository: string;
  commonDir: string;
  sourceBranch: string;
  baseCommit: string;
  branch: string;
  directory: string;
  phase: 'preparing' | 'ready';
}

export type Protocol = 'chatCompletions' | 'responses';
export type Agent = 'worker' | 'reviewer';
export type RunStatus =
  | 'preparing'
  | 'worker'
  | 'checking'
  | 'reviewer'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'roundLimit'
  | 'failed'
  | 'interrupted';
export const terminalStatuses: readonly RunStatus[] = [
  'stopped',
  'completed',
  'roundLimit',
  'failed',
  'interrupted',
];
export interface PresetCommand {
  id: string;
  name: string;
  program: string;
  args: string[];
  timeoutSeconds: number;
}
export interface ExecutionConfig {
  prepare: PresetCommand[];
  checks: PresetCommand[];
}
export const emptyExecutionConfig = (): ExecutionConfig => ({ prepare: [], checks: [] });
export interface RunSummary {
  id: string;
  taskId: string;
  status: RunStatus;
  round: number;
  maxRounds: number;
  createdAt: string;
  updatedAt: string;
  git?: TaskGitWorkspace;
  directory?: string;
  branch?: string;
  models?: Record<Agent, { connectionName: string; model: string; protocol: Protocol }>;
  error?: string;
  sequence: number;
}
export interface RunEvent {
  runId: string;
  taskId: string;
  agent?: Agent;
  requestId?: string;
  sequence: number;
  kind: 'text' | 'tool' | 'check' | 'review' | 'feedback' | 'state' | 'error';
  text: string;
  time: string;
}
export interface ExecutionSnapshot {
  preparedTaskIds?: string[];
  config: ExecutionConfig;
  runs: RunSummary[];
}
export type ExecutionAction =
  | { kind: 'git.branches' }
  | { kind: 'config.save'; config: ExecutionConfig }
  | { kind: 'start' | 'restart'; taskId: string }
  | { kind: 'pause' | 'resume' | 'stop'; runId: string }
  | { kind: 'feedback'; runId: string; text: string }
  | { kind: 'history'; runId: string; before?: number }
  | { kind: 'openDirectory' | 'preview'; runId: string };
export interface ExecutionReply {
  repository?: RepositoryInfo;
  state: ExecutionSnapshot;
  events?: RunEvent[];
}
export interface ExecutionUpdate extends ExecutionReply {
  events: RunEvent[];
}
