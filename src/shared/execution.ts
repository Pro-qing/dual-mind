import type { AppError } from './errors';
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
  | 'planning'
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
  customCommandsEnabled?: boolean;
  prepare: PresetCommand[];
  checks: PresetCommand[];
}
export const emptyExecutionConfig = (): ExecutionConfig => ({ prepare: [], checks: [] });
export interface AcceptanceCriterion {
  id: string;
  description: string;
  verification: 'command' | 'reading';
  evidence: string;
  reason: string;
}
export interface PlanInput {
  objective: string;
  requirements: string;
  steps: string[];
  criteria: AcceptanceCriterion[];
  revisionReason: string;
}
export interface TaskPlan extends PlanInput {
  version: number;
}
export interface CriterionEvidence {
  criterionId: string;
  commandIds: string[];
  evidence: string;
}
export interface WorkSubmission {
  summary: string;
  completedSteps: string[];
  evidence: CriterionEvidence[];
  unresolved: string[];
  planVersion: number;
  revision: string;
}
export interface ReviewResult {
  verdict: 'approve' | 'changes_requested';
  summary: string;
  acceptance: (CriterionEvidence & { passed: boolean })[];
  nextPlan?: PlanInput;
  planVersion: number;
}
export interface CommandEvidence {
  id: string;
  name: string;
  program: string;
  args: string[];
  cwd: string;
  purpose: 'prepare' | 'verify' | 'explore';
  criterionIds: string[];
  timeoutSeconds: number;
  planVersion: number;
  round: number;
  before: string;
  after: string;
  ok: boolean;
  exitCode: number;
  reason?: string;
  fault?: AppError;
  presetId?: string;
}
export type ExecutionDetail =
  | { type: 'plan'; plan: TaskPlan }
  | { type: 'submission'; submission: WorkSubmission }
  | { type: 'review'; review: ReviewResult }
  | { type: 'command'; command: CommandEvidence };
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
  fault?: AppError;
  sequence: number;
  plan?: TaskPlan;
  submission?: WorkSubmission;
  review?: ReviewResult;
}
export interface RunEvent {
  runId: string;
  taskId: string;
  agent?: Agent;
  requestId?: string;
  sequence: number;
  kind:
    'text' | 'tool' | 'check' | 'review' | 'feedback' | 'state' | 'error' | 'plan' | 'submission';
  detail?: ExecutionDetail;
  commandId?: string;
  text: string;
  fault?: AppError;
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
