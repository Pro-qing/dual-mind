export interface ExecutionShell {
  program: string;
  kind: 'bash' | 'zsh' | 'sh' | 'powershell' | 'cmd';
}
/** Safe metadata only. Environment values stay in the task's in-memory snapshot. */
export interface ExecutionEnvironmentSummary {
  platform: string;
  shell: ExecutionShell;
  source: 'login' | 'host';
  warning?: string;
}
export interface ResolvedExecutionEnvironment {
  env: Record<string, string>;
  summary: ExecutionEnvironmentSummary;
}
