export interface ExecutionShell {
  program: string;
  kind: 'bash' | 'zsh' | 'sh' | 'powershell' | 'cmd';
}
export interface BundledToolStatus {
  name: 'rg' | 'fd' | 'jq';
  /** Version of the bundled fallback, not the version selected from PATH. */
  version: string;
  status: 'available' | 'unavailable';
  reason?:
    | 'unsupportedPlatform'
    | 'unconfigured'
    | 'missing'
    | 'integrity'
    | 'architecture'
    | 'permission'
    | 'unreadable';
}
/** Safe metadata only. Environment values stay in the task's in-memory snapshot. */
export interface ExecutionEnvironmentSummary {
  platform: string;
  shell: ExecutionShell;
  source: 'login' | 'host';
  warning?: string;
  bundledTools?: BundledToolStatus[];
}
export interface ResolvedExecutionEnvironment {
  env: Record<string, string>;
  summary: ExecutionEnvironmentSummary;
}
