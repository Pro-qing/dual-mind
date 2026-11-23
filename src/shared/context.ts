import type { Agent } from './execution';

export interface ContextCheckpoint {
  endpoint?: string;
  id: string;
  hash: string;
  throughOperation: string | null;
  epoch: number;
  inputBudget: number;
  tokenRatio: number;
}
export interface ContextSummary {
  version: 1;
  agent: Agent;
  runId: string;
  epoch: number;
  throughOperation: string | null;
  text: string;
}
export interface ContextUsage {
  windowTokens: number;
  windowEstimated: boolean;
  inputBudget: number;
  estimatedInputTokens: number;
  requestBytes: number;
  summaries: number;
}
