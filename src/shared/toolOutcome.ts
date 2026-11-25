import type { AppError } from './errors';
export type ToolStatus = 'succeeded' | 'failed' | 'rejected' | 'skipped' | 'cancelled' | 'unknown';
export interface ToolOutcome {
  operationId: string;
  callId: string;
  requestId: string;
  tool: string;
  execution: 'notStarted' | 'executed' | 'unknown';
  status: ToolStatus;
  commandId?: string;
  fault?: AppError;
  causedBy?: string;
}
export interface ToolBudget {
  turn: number;
  corrections: number;
  calls?: number;
  failures?: Record<string, { key: string; count: number; operationId: string }>;
}
export interface ToolPause {
  reason: 'repeatedToolFailure' | 'toolBatchRejected' | 'reviewCorrectionExhausted';
  budgetKey: string;
  tool: string;
  operationId: string;
  count: number;
}
