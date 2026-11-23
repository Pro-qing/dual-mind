import { t } from './i18n';
import { modelErrorCodes, type ErrorCode, type Locale, type ModelErrorCode } from './model';

export const errorMessages = {
  toolFileMissing: [
    'The requested file does not exist. Inspect the available paths and correct this call.',
    '请求的文件不存在，请检查可用路径并修正调用。',
  ],
  toolPermission: [
    'The file operation was denied. Inspect permissions or choose an accessible path.',
    '文件操作权限不足，请检查权限或选择可访问路径。',
  ],
  repeatedToolFailure: [
    'The same tool operation failed three times without progress. Inspect the result, add feedback, then continue.',
    '同一工具操作三次失败且没有进展。请检查结果、补充反馈后继续。',
  ],
  toolBatchRejected: [
    'Three consecutive tool batches were rejected. No tools in those batches ran. Add feedback or adjust the model before continuing.',
    '连续三批工具调用被拒绝，这些批次均未执行。请补充反馈或调整模型后继续。',
  ],
  toolCallLimit: [
    'This phase reached its 200 tool-call budget. Saved work and evidence were retained.',
    '此阶段达到 200 次工具调用预算，已有修改与证据已保留。',
  ],
  toolSkipped: [
    'This call was not executed because an earlier call or batch validation failed.',
    '前面的调用或整批校验失败，此调用未执行。',
  ],

  artifactStorage: [
    'Saved artifact metadata is unavailable or inconsistent. Existing files and Git references were kept.',
    '成果保存记录不可用或不一致，已有文件和 Git 引用已保留。',
  ],
  artifactChanged: [
    'Files, branches or operation state changed after preview. Refresh and review the current state.',
    '预览后的文件、分支或操作状态已变化，请刷新并核对当前状态。',
  ],
  artifactUnsafe: [
    'This workspace contains files or repositories that cannot be preserved safely within the supported limits. Nothing will be cleaned up.',
    '工作树含无法在支持范围内安全保存的文件或仓库，清理已阻止。',
  ],
  artifactManagedOnly: [
    'This operation is only available for DualMind-managed worktrees. Use Git tools for the original project.',
    '此操作仅适用于 DualMind 管理的工作树，请使用 Git 工具处理原项目。',
  ],
  artifactBusy: [
    'Finish or inspect the pending Git operation before starting another one.',
    '请先完成或检查待处理的 Git 操作，再开始其他操作。',
  ],
  artifactNeedsCommit: [
    'Commit the task changes and choose another local target branch before merging.',
    '合入前请提交任务修改，并选择不同的本地目标分支。',
  ],
  artifactNotAccepted: [
    'The current task content has no matching acceptance. Verify this version before merging.',
    '当前任务内容没有对应的验收结论，请先验收此版本再合入。',
  ],
  artifactBranchOccupied: [
    'The target branch is checked out in another worktree. Its location is shown in the details.',
    '目标分支已在其他工作树检出，位置见详情。',
  ],
  artifactGitFailed: [
    'The Git operation did not complete. Inspect its saved state before retrying.',
    'Git 操作未完成，请先检查已保存的状态再重试。',
  ],
  artifactConflicts: [
    'Resolve and stage all merge conflicts before completing this merge.',
    '完成合并前，请解决并暂存全部冲突。',
  ],
  artifactPreservation: [
    'The saved snapshot does not contain every required file. Cleanup was blocked; the worktree and saved references remain.',
    '保存的快照未包含全部必要文件。清理已阻止，工作树和已保存引用仍保留。',
  ],
  artifactRestorePartial: [
    'Snapshot restoration is incomplete or files changed. Inspect the new worktree; the saved snapshot remains available.',
    '快照恢复未完成或文件发生变化，请检查新工作树；已保存快照仍然可用。',
  ],

  workspaceArchived: [
    'This task workspace was cleaned up. Create a follow-up task or restore its saved snapshot.',
    '任务工作树已清理，请创建后续任务或恢复已保存的成果。',
  ],
  contextCompaction: [
    'Context could not be reduced safely. Adjust the model window or model, then continue this run.',
    '无法安全缩减上下文。请调整模型窗口或模型后继续此运行。',
  ],
  contextMinimum: [
    'The task instructions and current state exceed the available context budget. Select a larger model window or reduce the task.',
    '任务指令和当前状态超过可用上下文预算，请选择更大模型窗口或缩小任务。',
  ],
  contextSnapshot: [
    'The saved context summary is unavailable or inconsistent. Original execution records were preserved.',
    '保存的上下文摘要不可用或不一致，原执行记录已保留。',
  ],

  toolArgumentsInvalid: [
    'Tool {tool}, call {callId}: {path} expects {expected}; received {actual}.',
    '工具 {tool}，调用 {callId}：{path} 应为 {expected}，实际为 {actual}。',
  ],
  toolCorrectionLimit: [
    'Tool arguments remained invalid after two correction attempts.',
    '工具参数经两次纠正后仍然无效。',
  ],
  messageInvalid: [
    'Enter 1–50,000 characters and a valid message ID.',
    '请输入 1–50,000 个字符，并使用有效消息 ID。',
  ],
  messageConflict: [
    'This message ID already has different content. Reload the conversation.',
    '该消息 ID 已用于其他内容，请重新加载会话。',
  ],
  continuationUnavailable: [
    'The previous task directory is unavailable. The message is saved; inspect the binding before continuing.',
    '上次任务目录不可用。消息已保存，请检查目录绑定后继续处理。',
  ],
  conversationUnavailable: [
    'Conversation history could not be read. Your saved messages are retained.',
    '无法读取会话历史，已保存的消息仍予以保留。',
  ],
  planInvalid: [
    'The plan must include executable steps and unique acceptance criteria. Reading review needs a reason.',
    '方案须包含可执行步骤和唯一验收项；阅读审查须说明无需命令的原因。',
  ],
  planRevisionInvalid: [
    'A revised plan must retain existing acceptance IDs and verification methods, and explain the revision.',
    '修订方案须保留已有验收项 ID 和验证方式，并说明修订原因。',
  ],
  evidenceInvalid: [
    'Evidence is missing, failed, stale or does not belong to the current plan and artifacts.',
    '验收证据缺失、失败、已过期，或不属于当前方案及成果版本。',
  ],
  reviewIncomplete: [
    'Review must cover every criterion. Rejection requires the next executable plan; approval requires all criteria to pass.',
    '验收须覆盖全部验收项；未通过须给出下一轮执行方案，通过须满足全部条件。',
  ],
  feedbackPending: [
    'New user feedback requires an updated Reviewer plan before approval.',
    '收到新的用户反馈，Reviewer 须更新方案后才能验收通过。',
  ],
  commandDirectoryInvalid: [
    'Command working directory must be an existing ordinary directory within the task, without traversal or links.',
    '命令工作目录须为任务内已存在的普通目录，不能包含越界路径或符号链接。',
  ],
  commandUnavailable: [
    'The command could not start. Inspect the original details.',
    '命令无法启动，请查看原始详情。',
  ],

  operationFailed: [
    'The operation failed. See the original details.',
    '操作失败，请查看原始详情。',
  ],
  legacyExecution: [
    'This execution failed. Original error details are available below.',
    '该次运行失败。以下为原始错误信息。',
  ],
  hostUnavailable: [
    'Execution host is unavailable. Reopen the workbench.',
    '执行宿主不可用，请重新打开工作台。',
  ],
  operationTimeout: [
    'Execution operation timed out; check its current status before retrying.',
    '执行操作超时；请先确认当前任务状态，再决定是否重试。',
  ],
  workbenchClosed: ['Workbench closed.', '工作台已关闭。'],
  workbenchTimeout: [
    'The workbench did not finish loading. Reopen it and retry.',
    '工作台加载超时，请重新打开后重试。',
  ],
  invalidExecution: ['Invalid execution request.', '执行请求无效，请重新打开工作台后重试。'],
  unsupportedExecution: ['Unsupported execution operation.', '不支持该执行操作。'],
  inactiveExecution: ['This execution is no longer active.', '该次执行已结束或已停止。'],
  recoveryInvalid: [
    'Recovery records are missing, damaged or inconsistent. Original records were preserved.',
    '恢复记录缺失、损坏或不一致，原始记录已保留。',
  ],
  recoveryUnavailable: [
    'This run has no usable recovery point or has been superseded.',
    '此运行没有可用恢复点，或已被后续运行取代。',
  ],
  recoveryProcessUnknown: [
    'The previous command may still be running. Its termination could not be verified.',
    '上次命令可能仍在运行，无法确认进程已经停止。',
  ],
  inferenceQuota: [
    'The model account has no available quota. Fix the account or select another model before continuing.',
    '模型账号额度不足，请处理账号额度或更换模型后继续执行。',
  ],
  resumeRequiresPause: ['Pause the task before continuing.', '请先暂停任务，再继续执行。'],
  feedbackRequiresPause: [
    'Pause the task before adding feedback; enter 1–50,000 characters.',
    '请先暂停任务，再输入反馈，内容长度须为 1–50,000 个字符。',
  ],
  historyLimit: [
    'Execution history exceeds 64 MiB; start a smaller task.',
    '执行历史超过 64 MiB，请缩小任务范围后重新开始。',
  ],
  executionStopped: ['Execution stopped.', '执行已停止。'],
  singleExecution: [
    'Only one task can execute in this workspace, including paused tasks.',
    '同一工作区只能执行一个任务，包括已暂停的任务；请先停止当前任务。',
  ],
  checksRequiredError: [
    'Configure at least one check command before starting.',
    '开始前请至少配置一条检查命令。',
  ],
  shutdownUnconfirmed: [
    'Execution shutdown could not be confirmed.',
    '无法确认执行已停止，请检查任务和命令状态。',
  ],
  preparationStarting: ['Task preparation is still starting.', '任务准备仍在启动，请稍后重试。'],
  preparationFailed: ['Preparation failed: {name}', '准备命令执行失败：{name}'],
  checksChanged: [
    'Files changed during checks. Check evidence is invalid. Continue to inspect and recheck the current artifacts.',
    '检查期间文件发生变化，检查证据已失效。请继续执行以检查当前文件并重新验证。',
  ],
  reviewChanged: [
    'Files changed during review. Previous check and review evidence is invalid. Continue to rework and recheck.',
    '审查期间文件发生变化，之前的检查和审查证据已失效。请继续修改并重新检查。',
  ],
  persistenceFailed: [
    'Execution persistence failed; inspect the task directory before restarting.',
    '执行记录保存失败，请先检查任务目录，再重新执行。',
  ],
  completionMissing: [
    'Model did not use the required completion tool. Select a model with tool calling support.',
    '模型未使用必需的完成工具，请选择支持工具调用的模型。',
  ],
  completionOrder: [
    'A completion tool must follow all other tools in the response.',
    '完成工具必须位于本次响应的所有其他工具调用之后。',
  ],
  toolTurnLimit: [
    'Role reached 20 model turns in this round; execution stopped without guessing a result.',
    '该角色在本轮已达到 20 次模型调用上限，执行已停止。',
  ],
  toolNotAllowed: ['Tool is not allowed for this role.', '当前角色无权使用该工具。'],
  reviewerReadOnly: [
    'Reviewer cannot write or delete source files.',
    'Reviewer 不能写入或删除源代码文件。',
  ],
  unknownCheck: ['Unknown saved check ID.', '指定的检查命令不存在，请检查命令配置。'],
  invalidToolArguments: ['Invalid tool arguments.', '工具参数无效，请检查参数名称、类型和取值。'],
  directoryUnavailable: ['Task workspace is not available.', '任务工作目录尚不可用。'],
  diffLimit: [
    'Diff exceeds 8 MiB; open the task directory to inspect all changes.',
    '差异内容超过 8 MiB，请打开任务目录查看完整修改。',
  ],
  executionStorageInvalid: [
    'Invalid execution storage; records were preserved.',
    '执行记录的存储格式无效，原始记录已保留。',
  ],
  executionRecordInvalid: ['Invalid execution record.', '执行记录格式无效。'],
  executionInterrupted: [
    'Execution was interrupted by host shutdown; saved records were preserved.',
    '宿主关闭导致执行中断，已保存的记录和文件保持原样。',
  ],
  executionStorageUnavailable: [
    'Execution storage is unavailable.',
    '执行记录存储不可用，请检查工作区和存储目录。',
  ],
  historyWorkspaceRequired: [
    'Open a workspace to store execution history.',
    '请先打开工作区，再保存执行历史。',
  ],
  historyUnavailable: ['Execution history is unavailable.', '执行历史不可用，请确认记录仍存在。'],
  commandConfigInvalid: ['Invalid command configuration.', '命令配置无效。'],
  commandGroupLimit: ['Use at most 20 commands per group.', '每组最多配置 20 条命令。'],
  commandInvalid: [
    'Commands need a unique ID, name, executable, argument list and a 10–900 second timeout.',
    '命令须包含唯一 ID、名称、可执行程序、参数列表，以及 10–900 秒的超时时间。',
  ],
  commandPlatformUnsupported: [
    'Local task commands require Linux, macOS or Windows.',
    '本地任务命令需要 Linux、macOS 或 Windows。',
  ],
  commandNotFound: [
    'Cannot start command {name}: executable {program} was not found.',
    '无法启动命令“{name}”：未找到可执行程序 {program}。',
  ],
  commandPermissionDenied: [
    'Cannot start command {name}: permission denied for {program}.',
    '无法启动命令“{name}”：没有执行 {program} 的权限。',
  ],
  commandStartFailed: [
    'Could not start command {name} ({program}).',
    '无法启动命令“{name}”（{program}）。',
  ],
  // Retained for execution history created by the previous runner.
  systemdRequired: [
    'Task execution requires Linux user systemd resource limits.',
    '任务执行需要 Linux 用户级 systemd 资源限制支持。',
  ],
  systemdLimits: [
    'User systemd with cgroup v2, MemoryMax=1 GiB and MemorySwapMax=0 is required. No unrestricted fallback is used.',
    '需要支持 cgroup v2 的用户级 systemd，并设置内存上限 1 GiB、禁用交换空间；无法满足时停止执行。',
  ],
  systemdUnavailable: [
    'User systemd command runner is unavailable.',
    '用户级 systemd 命令运行器不可用。',
  ],
  commandShutdown: ['Could not confirm command shutdown.', '无法确认命令已停止，请检查任务进程。'],
  commandFailed: [
    'Command {name} failed (exit {exitCode}).',
    '命令“{name}”执行失败（退出码 {exitCode}）。',
  ],
  commandTimeout: ['Command {name} timed out.', '命令“{name}”执行超时。'],
  commandOutputLimit: [
    'Command {name} exceeded the 2 MiB output limit.',
    '命令“{name}”的输出超过 2 MiB 上限。',
  ],
  commandStopped: ['Command {name} was stopped.', '命令“{name}”已停止。'],
  inferenceInvalid: [
    'Invalid or unsupported model response.',
    '模型响应格式无效或不受支持，请检查协议与工具调用兼容性。',
  ],
  inferenceContext: [
    'The request exceeds the context budget or the 512 KiB request-size guard. Context reduction is required.',
    '请求超过上下文预算或 512 KiB 请求大小保护上限，需要整理上下文。',
  ],
  inferenceHttp: [
    'Model request failed (HTTP {status}); verify the selected protocol, model and tool support.',
    '模型请求失败（HTTP {status}），请检查所选协议、模型和工具调用支持。',
  ],
  inferenceAuth: [
    'The model service rejected the request. Check the connection key (HTTP {status}).',
    '模型服务拒绝了请求，请检查连接密钥（HTTP {status}）。',
  ],
  inferenceIncomplete: [
    'The model could not complete this turn; no automatic retry was made.',
    '模型未能完成本轮响应，未自动重试。',
  ],
  inferencePartial: [
    'Model output was incomplete; no partial tool call was executed.',
    '模型输出不完整，未执行不完整的工具调用。',
  ],
  inferenceLimit: ['Model response exceeds the size limit.', '模型响应超过大小限制。'],
  inferenceEnded: ['Model stream ended without completion.', '模型流式响应在完成前结束。'],
  inferenceTimeout: ['Model request timed out.', '模型请求超时，请检查服务状态。'],
  inferenceNetwork: ['Model network request failed.', '模型网络请求失败，请检查地址、网络和证书。'],
  gitUnavailable: [
    'Git is unavailable. Install Git 2.25+ on PATH and retry.',
    'Git 不可用，请安装 Git 2.25 或更高版本并加入 PATH 后重试。',
  ],
  gitVersion: [
    'Cannot verify a supported Git version. Git 2.25+ is required.',
    '无法确认受支持的 Git 版本，需要 Git 2.25 或更高版本。',
  ],
  gitFailed: [
    'Git operation failed. Inspect repository state and the original details.',
    'Git 操作失败，请检查仓库状态和原始详情。',
  ],
  gitTimeout: [
    'Git operation timed out; inspect the task workspace before retrying.',
    'Git 操作超时，请先检查任务工作目录，再重试。',
  ],
  outputTooLarge: [
    'The file or Git output exceeds the size limit.',
    '文件或 Git 输出超过大小限制。',
  ],
  workspaceUntrusted: [
    'Trust this workspace before preparing development files.',
    '请先信任此工作区，再准备开发文件。',
  ],
  workspaceUnsupported: [
    'Open a single local workspace folder for task execution.',
    '任务执行需要单个本地工作区文件夹。',
  ],
  taskNotFound: [
    'The task no longer exists. Create or select another task.',
    '任务已不存在，请创建或选择其他任务。',
  ],
  notRepository: ['The workspace must be a Git repository.', '工作区必须是 Git 仓库。'],
  noCommit: [
    'Create an initial Git commit before starting.',
    '请先创建初始 Git 提交，再开始执行。',
  ],
  detachedHead: ['Check out a local branch before starting.', '请先检出本地分支，再开始执行。'],
  submodulesUnsupported: [
    'Repositories with submodules are not supported for this operation.',
    '该操作暂不支持包含子模块的仓库。',
  ],
  dirtyRepository: [
    'The workspace has uncommitted changes. Handle them before starting.',
    '工作区存在未提交的修改，请先处理这些修改，再开始执行。',
  ],
  workspaceConflict: [
    'The task workspace or branch conflicts with existing state. Inspect the original details.',
    '任务目录或分支与现有状态冲突，请查看原始详情。',
  ],
  workspaceChanged: [
    'The task workspace or branch changed. Inspect it before continuing.',
    '任务工作目录或分支已变化，请先检查，再继续执行。',
  ],
  invalidPath: [
    'The task path is invalid. Use ordinary files inside the task directory.',
    '任务路径无效，请使用任务目录内的普通文件，不能访问越界路径或链接。',
  ],
  accessDenied: [
    'Access to this task file is denied. Check its type, permissions and role.',
    '无法访问该任务文件，请检查文件类型、权限和当前角色。',
  ],
} as const;

export type FaultCode = keyof typeof errorMessages | ErrorCode | ModelErrorCode;
export interface AppError {
  code: FaultCode;
  params?: Record<string, string | number>;
  details?: string;
}
const existingCodes: readonly (ErrorCode | ModelErrorCode)[] = [
  ...modelErrorCodes,
  'required',
  'invalidRounds',
  'workspaceRequired',
  'builtInProtected',
  'invalidStoredData',
  'unavailable',
  'executionLocked',
  'gitLocked',
];
export const faultCodes: readonly FaultCode[] = [
  ...existingCodes,
  ...(Object.keys(errorMessages) as (keyof typeof errorMessages)[]),
];
const knownCodes = new Set<string>(faultCodes);
export function formatError(locale: Locale, fault: AppError): string {
  if (!knownCodes.has(fault.code)) {
    return t(locale, 'executionError');
  }
  const template = Object.hasOwn(errorMessages, fault.code)
    ? errorMessages[fault.code as keyof typeof errorMessages][locale === 'zh-CN' ? 1 : 0]
    : t(locale, fault.code as ErrorCode | ModelErrorCode);
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    String(fault.params?.[key] ?? match),
  );
}
export class OperationError extends Error {
  constructor(
    public readonly code: FaultCode,
    public readonly params?: AppError['params'],
    public readonly details?: string,
  ) {
    super(formatError('en', { code, params }));
  }
}
/** Accept only supported wire fields; old string errors remain original details. */
export function toAppError(error: unknown, fallback: FaultCode = 'operationFailed'): AppError {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    knownCodes.has(error.code)
  ) {
    const source = error as AppError;
    const params =
      source.params && typeof source.params === 'object' && !Array.isArray(source.params)
        ? Object.fromEntries(
            Object.entries(source.params).filter(
              ([, v]) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)),
            ),
          )
        : undefined;
    return {
      code: source.code,
      ...(params ? { params } : {}),
      ...(typeof source.details === 'string' ? { details: source.details } : {}),
    };
  }
  const details =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return { code: fallback, ...(details ? { details } : {}) };
}
export function redactText(text: string, secrets: readonly string[] = []): string {
  text = text
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/(bearer\s+)[^\s"',;]+/gi, '$1[redacted]')
    .replace(/([?&](?:api[_-]?key|token|access_token)=)[^&#\s]+/gi, '$1[redacted]');
  for (const key of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const value of new Set([key, encodeURIComponent(key)])) {
      text = text.split(value).join('[redacted]');
    }
  }
  return text;
}

export function redactError(fault: AppError, secrets: readonly string[] = []): AppError {
  const clean = (text: string) => redactText(text, secrets).slice(0, 12000);
  return {
    code: fault.code,
    ...(fault.params
      ? {
          params: Object.fromEntries(
            Object.entries(fault.params).map(([k, v]) => [k, typeof v === 'string' ? clean(v) : v]),
          ),
        }
      : {}),
    ...(fault.details ? { details: clean(fault.details) } : {}),
  };
}
export function errorText(locale: Locale, fault: AppError): string {
  return [formatError(locale, fault), fault.details].filter(Boolean).join('\n');
}
