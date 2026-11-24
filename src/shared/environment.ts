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
export interface PythonCandidate {
  /** Preserve the invocation path; resolving its symlink can select a different environment. */
  path: string;
  source: 'project' | 'virtualenv' | 'conda' | 'path';
  label: string;
}
export interface PythonInterpreter extends PythonCandidate {
  status: 'available' | 'unavailable' | 'skipped';
  major?: 2 | 3;
  version?: string;
  implementation?: string;
  executable?: string;
  reason?:
    | 'missing'
    | 'permission'
    | 'startFailed'
    | 'timeout'
    | 'outputLimit'
    | 'probeFailed'
    | 'invalidResponse'
    | 'unsupportedVersion'
    | 'budget';
}
export interface PythonDiscoverySummary {
  complete: boolean;
  interpreters: PythonInterpreter[];
}
/** Safe metadata only. Environment values stay in the task's in-memory snapshot. */
export interface ExecutionEnvironmentSummary {
  platform: string;
  shell: ExecutionShell;
  source: 'login' | 'host';
  warning?: string;
  bundledTools?: BundledToolStatus[];
  python?: PythonDiscoverySummary;
}
export interface ResolvedExecutionEnvironment {
  env: Record<string, string>;
  summary: ExecutionEnvironmentSummary;
}
