import type { TaskDraft } from '../../src/shared/model';
export interface DerivedTask {
  kind: 'restore' | 'followup';
  source?: TaskDraft;
  taskId?: string;
  snapshotId?: string;
  baseBranch?: string;
  operationId?: string;
}
