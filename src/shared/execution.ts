import type { ExecutionEnvironmentSummary } from './environment';
import type { AppError } from './errors';
import type { GitStrategy, RepositoryInfo } from './model';
export interface TaskGitWorkspace {
  lifecycle?: 'cleaned';
  snapshotId?: string;
  branchNaming?: { version: 2; slug: string; suffixLength: 8 | 12 | 32 };
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

export type Protocol = 'chatCompletions' | 'responses' | 'anthropic';
export type ProviderPreset = 'openaiCompatible' | 'commandCode';
export type Agent = 'worker' | 'reviewer';
export type RunStatus =
  | 'recovering'
  | 'answering'
  | 'answered'
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
  'answered',
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
export interface ShellCommand {
  id: string;
  name: string;
  command: string;
  shell: import('./environment').ExecutionShell;
  timeoutSeconds: number;
}
export type ExecutableCommand = PresetCommand | ShellCommand;
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
  verdict: 'pass' | 'fail' | 'approve' | 'changes_requested';
  risk?: 'low' | 'medium' | 'high';
  confidence?: number;
  issues?: string[];
  evidence?: string[];
  reasoning?: string;
  summary: string;
  acceptance: (CriterionEvidence & { passed: boolean })[];
  nextStep?: { action: 'continue' | 'finish'; instructions: string };
  nextPlan?: PlanInput;
  planVersion: number;
  completionMarker?: boolean;
}
export interface CommandEvidence {
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  termination?: string;
  actualExitCode?: number | null;
  toolOperationId?: string;
  command?: string;
  agent?: Agent;
  phase?: Agent | 'planning' | 'answering' | 'preparing' | 'checking';
  shell?: import('./environment').ExecutionShell;
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
  environmentId?: string;
}
export type ExecutionDetail =
  | { type: 'plan'; plan: TaskPlan }
  | { type: 'submission'; submission: WorkSubmission }
  | { type: 'review'; review: ReviewResult }
  | { type: 'command'; command: CommandEvidence };
export interface RunRecovery {
  generation: number;
  attempts: number;
  available: boolean;
  agent?: Agent;
  phase?: string;
  operation?: string;
  step?: 'processes' | 'workspace' | 'environment' | 'artifacts';
  blocked?: import('./errors').AppError;
}
export interface RunSummary {
  toolPause?: import('./toolOutcome').ToolPause;
  context?: Partial<Record<Agent, import('./context').ContextUsage>>;
  recovery?: RunRecovery;
  kind?: 'conversation' | 'execution';
  previousRunId?: string;
  sourceMessageIds?: string[];
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
  environment?: ExecutionEnvironmentSummary;
  models?: Record<Agent, { connectionName: string; model: string; protocol: Protocol }>;
  error?: string;
  fault?: AppError;
  sequence: number;
  plan?: TaskPlan;
  submission?: WorkSubmission;
  review?: ReviewResult;
}
export interface RunEvent {
  tool?: import('./toolOutcome').ToolOutcome;
  round?: number;
  runId: string;
  taskId: string;
  agent?: Agent;
  requestId?: string;
  userRequestId?: string;
  sequence: number;
  kind:
    'text' | 'tool' | 'check' | 'review' | 'feedback' | 'state' | 'error' | 'plan' | 'submission';
  detail?: ExecutionDetail;
  commandId?: string;
  text: string;
  fault?: AppError;
  time: string;
}
export interface TaskMessage {
  requestId?: string;
  userRequestId?: string;
  round?: number;
  id: string;
  taskId: string;
  time: string;
  role: 'user' | Agent | 'system';
  kind: 'message' | 'answer' | 'plan' | 'submission' | 'review' | 'error' | 'legacy' | 'process';
  text: string;
  status?: 'pending' | 'processing' | 'handled';
  runId?: string;
  sequence?: number;
  detail?: ExecutionDetail;
  fault?: AppError;
}
export interface ConversationPage {
  messages: TaskMessage[];
  before?: string;
}
export interface EvidencePage {
  summary?: { records: number; errors: number; blockers?: number };
  events: RunEvent[];
  before?: string;
}
export interface ExecutionActivity {
  id: string;
  taskId: string;
  runId: string;
  agent: Agent;
  phase: Agent | 'planning' | 'answering' | 'preparing' | 'checking';
  stage: 'waiting' | 'receiving' | 'tool' | 'command' | 'compacting';
  retry?: { attempt: number; delayMs: number; retryAt?: string; requesting?: boolean };
  startedAt: string;
  requestId?: string;
  userRequestId?: string;
  tool?: string;
  commandId?: string;
  label?: string;
}
export interface ExecutionSnapshot {
  artifacts?: {
    taskId: string;
    cleaned: boolean;
    pending: boolean;
    snapshotId?: string;
    merge?: import('./artifacts').ArtifactMerge;
  }[];
  gitOperationTaskId?: string;
  /** Ephemeral operation metadata; absent after pause, stop or host restart. */
  activity?: ExecutionActivity;
  conversationVersion?: number;
  preparedTaskIds?: string[];
  config: ExecutionConfig;
  runs: RunSummary[];
}
export type ExecutionAction =
  | import('./artifacts').ArtifactAction
  | { kind: 'message.send'; taskId: string; messageId: string; text: string }
  | { kind: 'messages.resume'; taskId: string }
  | { kind: 'conversation'; taskId: string; before?: string; includeProcess?: boolean }
  | { kind: 'evidence'; taskId: string; runId?: string; through?: number; before?: string }
  | { kind: 'git.branches' }
  | { kind: 'config.save'; config: ExecutionConfig }
  | { kind: 'start' | 'restart'; taskId: string }
  | { kind: 'pause' | 'resume' | 'stop'; runId: string }
  | { kind: 'feedback'; runId: string; text: string }
  | { kind: 'history'; runId: string; before?: number }
  | { kind: 'openDirectory' | 'preview'; runId: string };
export interface ExecutionReply {
  artifact?: import('./artifacts').TaskArtifactStatus;
  savedArtifacts?: import('./artifacts').SavedArtifact[];
  createdTaskId?: string;
  conversation?: ConversationPage;
  evidence?: EvidencePage;
  repository?: RepositoryInfo;
  state: ExecutionSnapshot;
  events?: RunEvent[];
}
export interface ExecutionUpdate extends ExecutionReply {
  events: RunEvent[];
}
