import { RoleContext } from '../providers/context';
import { type RecoveryState, type RecoveryOperation, type RecoveryStore } from './recovery';
import type { LocalStore } from '../core/store';
import type { TaskReader, TaskWriter } from '../git/taskWorkspaces';
import {
  type RunSummary,
  type ExecutionActivity,
  type Agent,
  type ExecutionConfig,
  type CommandEvidence,
} from '../shared/execution';
import { type History } from '../providers/inference';
import { ProjectEnvironment } from './environment';
export type Input = Awaited<ReturnType<LocalStore['executionInput']>>;
export interface Active {
  toolOperationId?: string;
  userRequestId?: string;
  contexts?: Record<Agent, RoleContext>;
  recovery: RecoveryState;
  recoveryStore: RecoveryStore;
  operations: Map<string, RecoveryOperation>;
  generation: number;
  recovering: boolean;
  persistenceFailed: boolean;
  stoppedByUser: boolean;
  projected: Set<string>;
  activity?: ExecutionActivity;
  summary: RunSummary;
  input: Input;
  config: ExecutionConfig;
  environment: ProjectEnvironment;
  controller: AbortController;
  histories: Record<Agent, History>;
  pause: boolean;
  wake?: () => void;
  feedback: string[];
  writer?: TaskWriter;
  reader?: TaskReader;
  done: Promise<void>;
  pending: Promise<void>;
  bytes: number;
  evidence: Map<string, CommandEvidence>;
  outputs: Map<string, string>;
  additional: CommandEvidence[];
  reviewFeedback: boolean;
  continuation?: RunSummary;
  handling: string[];
  finalizing: boolean;
}
