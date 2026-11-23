import type { TaskDraft, TaskInput } from './model';

export interface ArtifactFile {
  path: string;
  mode: number;
  hash: string;
  bytes: number;
  kind: 'file' | 'link' | 'missing';
}
export interface SavedArtifact {
  id: string;
  taskId: string;
  taskName: string;
  createdAt: string;
  repository: string;
  commonDir: string;
  baseCommit: string;
  sourceBranch: string;
  branch: string;
  head: string;
  headRef: string;
  stash?: string;
  stashRef?: string;
  files: ArtifactFile[];
  excluded: string[];
  missingDirectory?: boolean;
  ready: boolean;
  task?: TaskDraft;
}
export interface ArtifactMerge {
  operationId: string;
  sourceHead: string;
  targetBranch: string;
  targetHead: string;
  directory: string;
  temporary: boolean;
  state: 'preparing' | 'merging' | 'conflicted' | 'integrated' | 'aborted';
  resultHead?: string;
  hadConflicts?: boolean;
  verificationRequired?: boolean;
  directoryRetained?: boolean;
}
export interface TaskArtifactStatus {
  changedFiles?: { path: string; status: string; previousPath?: string }[];
  pendingCommitMessage?: string;
  restore?: { operationId: string; snapshotId: string; complete: boolean };
  taskId: string;
  managed: boolean;
  directory: string;
  branch: string;
  sourceBranch: string;
  baseCommit: string;
  head: string;
  token: string;
  changes: string;
  files: string[];
  excluded: string[];
  accepted: boolean;
  acceptedRunId?: string;
  state: 'ready' | 'committed' | 'conflicted' | 'integrated' | 'cleaned';
  missingDirectory?: boolean;
  snapshotId?: string;
  commitOperationId?: string;
  cleanupOperationId?: string;
  merge?: ArtifactMerge;
  conflicts?: string[];
}
export type ArtifactAction =
  | { kind: 'git.artifacts'; taskId: string }
  | { kind: 'git.commit'; taskId: string; operationId: string; token: string; message: string }
  | {
      kind: 'git.merge';
      taskId: string;
      operationId: string;
      token: string;
      targetBranch: string;
      expectedTargetHead?: string;
    }
  | {
      kind: 'git.merge.check' | 'git.merge.complete' | 'git.merge.abort';
      taskId: string;
      operationId: string;
    }
  | { kind: 'git.cleanup'; taskId: string; operationId: string; token: string }
  | { kind: 'git.saved' }
  | { kind: 'git.openMerge'; taskId: string; operationId: string }
  | { kind: 'task.followup'; taskId: string; operationId: string; input: TaskInput }
  | { kind: 'git.restore'; snapshotId: string; operationId: string; input: TaskInput };
