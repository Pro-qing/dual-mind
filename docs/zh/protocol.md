# 宿主与 Webview 通信协议

[English](../en/protocol.md) · [文档索引](./README.md)

**当前源码版本：0.0.3 · 本地版本记录 · 尚未发布。** 本次记录日期为 2026-11-20；不表示已上传 Marketplace 或创建 GitHub Release。0.0.1 Preview 1／2 的历史发布记录保持原样。详见[0.0.3 版本说明](./release-notes-0.0.3.md)。

## 页面状态与错误兼容

Webview 本地导航为 `{view: "home"}`、`{view: "task", taskId}` 或 `{view: "api" | "defaults" | "execution" | "roles", returnTo}`；`returnTo` 只能指向主页或任务。它独立于任务存储的 `selectedTaskId`，不触发后台执行。旧页面状态和失效任务有主页回退。

任务保存成功的 `result` 另带 `savedTaskId`，桥接将其附到 `ActionReply`；创建后的导航使用该 ID，不受同时发生的任务选择影响。

共享 `AppError` 包含 `code`、可选 `params`（字符串或数字）和可选 `details`（脱敏原始文本）。`execution.result`、`result`、`fatal` 以及 `RunSummary`、`RunEvent` 支持可选 `fault` 字段。原有错误字段仍被兼容读取，持久化版本不变。前端优先使用 `fault`，再将旧文本作为原始详情显示；不会按英文文本猜测错误标识。

执行桥接保留 45 秒超时，超时消息要求先确认当前执行状态再重试，不表示任务已经取消。工作台关闭拒绝等待中的请求。角色协议历史继续使用原有工具结果结构；公开工具和检查事件另附错误信息供本地化显示。原始命令输出保持原文。错误参数与详情在写入日志及宿主发送前脱敏；若读取凭据失败，不发送可能包含凭据的详情。

当前内部协议支持本地工作台，不属于稳定公开 API。类型在 `src/shared/model.ts`，校验和持久化在 `src/core/store.ts`，传输在 `src/workbench.ts` 与 `webview/src/bridge.ts`。

## 入口

- `dualMind.openWorkbench`：打开或定位一个面板，React 渲染宿主快照后命令完成。
- `dualMind.showStatus`：本地化就绪提示。
- `dualMind.language`：应用／用户设置，可选 `auto`、`zh-CN`、`en`；自动模式依据 VS Code 显示语言解析。

## 消息

| 方向      | 消息结构                                             | 行为                                   |
| --------- | ---------------------------------------------------- | -------------------------------------- |
| UI → 宿主 | `ready`                                              | 请求初始状态                           |
| UI → 宿主 | `rendered`                                           | 确认 React 首次渲染                    |
| UI → 宿主 | `request`，含 `requestId` 和 `action`                | 提交需校验的操作                       |
| 宿主 → UI | `snapshot`                                           | 初始化或设置变化后刷新状态             |
| 宿主 → UI | `result`，含对应 `requestId`、`ok`，以及快照或错误码 | 确认持久化成功，或返回可本地化的错误键 |
| 宿主 → UI | `fatal`，含错误码                                    | 报告初始状态加载失败                   |

快照包含解析后的语言、语言选择、工作区可用性／名称、任务、选中任务 ID、连接摘要、智能体默认绑定，以及当前语言的 Reviewer 预设。连接摘要仅含 `hasKey` 布尔值，不含凭据。

## 已支持操作

| 范围          | 操作                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| 任务          | `task.save`（创建／编辑任务）、`task.select`、`task.delete`               |
| 连接          | `connection.save`、`connection.delete`、`connection.key`、`defaults.save` |
| Reviewer 角色 | `role.save`、`role.reset`、`role.delete`                                  |
| 环境          | `language.set`、`workspace.open`                                          |

编辑和删除携带对应项目 ID，破坏性操作要求请求中明确确认。宿主只提取支持的字段，校验文本、URL、正整数轮次和引用 ID，拒绝未知操作，并检查工作区可用性。界面收到宿主确认后才将保存视为成功。

## 数据与语言规则

任务保存角色快照，包括稳定 ID、内置／自定义标识、名称、用途、指令和语言（`en`、`zh-CN`、`original`）。编辑任务保留其快照，即使对应预设已修改或删除。任务数据保持版本 1 和 `status: draft`，实际执行状态由独立执行摘要提供。

内置角色的编辑和恢复明确指定语言，不能重命名或删除内置角色。自定义文本按录入内容保存。切换语言改变界面标签和默认定义，不改写任务内容。通过界面选择器切换前，未保存的角色编辑由“保存／放弃修改／取消”弹窗处理。

密钥录入请求由宿主打开原生密码输入框，宿主通过 `ExtensionContext.secrets` 保存密钥，只返回是否存在。Webview 操作不接受原始密钥；密钥不进入快照、日志或普通配置。

## 模型查询契约

当前开发分支已实现；已发布的 0.0.1 制品保持原样。

| 方向      | 消息                                               | 含义                                                           |
| --------- | -------------------------------------------------- | -------------------------------------------------------------- |
| UI → 宿主 | `models.query`、`requestId`、`connectionId`        | 明确查询已保存的连接                                           |
| 宿主 → UI | `models.result`、`requestId`、`connectionId`、`ok` | 成功返回 `result.models`、`result.fetchedAt`；失败返回 `error` |
| 宿主 → UI | `models.invalidated`、`connectionId`               | 取消并清除该连接的缓存结果                                     |

宿主读取已保存的地址和密钥；查询消息不含凭据或任务内容。请求使用 Bearer 认证，在已保存路径后追加 `/models`，校验 `data[].id` 并返回去重 ID。每个连接最多一个在途请求，超时 20 秒、响应上限 2 MiB，消息桥兜底超时 30 秒。重定向和无效正文返回经过过滤的错误码。

成功修改地址／密钥或删除连接使结果失效。请求及连接 ID 防止迟到响应恢复旧数据。修改名称／默认模型保留结果。列表只临时缓存，不进入快照；存储版本和历史任务保持兼容。刷新不选择模型或改写已保存 ID。空列表与错误保留手动输入。成功只验证列表访问，不验证推理。

## 剩余协议工作

将专用 worktree 成果应用到原工作区，以及多任务并行执行，仍属于后续工作。[保留的设计参考](./design.md)说明目标界面。已实现的异步执行消息关联任务及执行实例；活动任务删除等待停止确认，失败时保留记录。只读示例使用界面内数据，不发出任务修改请求。

## 角色交接边界

执行服务现已实现下列交接约定。原任务存储仍为版本 1，执行记录独立保存，不迁移任务。

- 每个工作区、任务及执行实例分别维护 Worker／Reviewer 历史。共享连接、模型或缓存的模型列表不能合并历史。
- 两者收到同一份固定的任务需求和验收条件，各自使用执行开始时固定的角色指令及配置。之后编辑预设或默认值不影响当前执行。
- Worker → Reviewer 只交接当前成果和测试证据；Reviewer → Worker 交接结论、问题及修改要求。交接关联任务、执行实例、轮次、发送方和接收方，由宿主核对工作区归属。
- 交接排除完整会话、内部分析、无关工具记录和凭据。交接文本是需要评估的内容，不能替换接收方角色指令。
- 按执行实例和角色分发结果及取消事件。已取消或被替代的执行不能将迟到输出追加到任一历史。重试必须能够区分尝试身份，避免旧尝试的迟到结果覆盖当前尝试或进入另一个角色。

模拟服务执行测试现已捕获两种协议，验证角色历史隔离、只读审查以及检查通过后的完成条件。验收不读取个人 API 凭据或发起付费请求。

## 内部 Git 工作目录服务

开发分支新增仅宿主调用的 `prepare(taskId)` 和 `files(taskId, role)`，它们仍由执行服务在宿主内部调用，增加可选任务 Git 策略字段。宿主解析已保存任务、源仓库及存储目录，仅接受指定模式的已有本地分支名称，不接受任意路径或 Git 命令。返回的文件接口在生命周期内固定宿主选定的角色；Reviewer 只有列表、读取、状态和差异接口，Worker 额外具有写入能力。审查通过不能修改文件或触发合并。

准备返回登记的基准、分支、目录和阶段。错误区分 Git 缺失／版本不足、工作区信任或形态、任务／仓库／提交缺失、分离 HEAD、子模块、源目录有修改、冲突、归属变化、存储失败、非法路径、输出上限和超时。失败时保留意图记录及部分资源，错误指出关联位置，不直接返回 Git 原始 stderr。删除任务或变更工作区／绑定后撤销文件访问。

删除任务保留 Git 记录、worktree 和分支，没有自动清理接口。仅专用 worktree 可按此流程人工清理（不可删除直接模式的当前项目）：先检查并保存任务成果（包括未跟踪及忽略文件），再运行不带强制参数的 `git -C <源仓库> worktree remove <任务目录>`；只有 Git 确认已安全合并时，才使用 `git -C <源仓库> branch -d <任务分支>` 删除分支。如果命令拒绝，则保留资源并先处理剩余成果。历史登记记录保留作为恢复信息；服务不会接管未知分支／目录，也不会自动重建缺失的就绪目录。

## 执行消息与持久化

`execution.request` 将请求 ID 与配置保存、开始／重新执行、暂停／继续／停止、暂停时反馈、历史分页、差异预览或打开任务目录操作关联。`execution.result` 返回执行快照及可选历史页，或经过过滤的错误。`execution.update` 批量推送摘要和公开事件；事件关联任务 ID、执行 ID、序号，以及适用时的角色／请求 ID。界面去重并只展示选中执行。模型请求和命令运行不占用设置存储队列。

`dualMind.execution.v1` 保存工作区命令预设和执行摘要。每次执行的 JSONL 历史保存在工作区扩展存储中，位于任务文件之外，每页最多 80 条事件。API 密钥和 Responses 私有推理内容不写入日志。兼容连接新增可选 `protocol: chatCompletions | responses`，缺省使用 Chat Completions，不重写旧记录。请求保留网关前缀，不自动回退到另一协议。

状态包括 preparing、planning、worker、checking、reviewer、pausing、paused、stopping，以及终态 stopped／completed／roundLimit／failed／interrupted。暂停仍占用工作区名额；停止须在取消请求和命令结束后确认。宿主重载将未完成执行标记中断，手动重新执行创建新执行 ID，不重放旧调用。宿主拒绝编辑活动任务及修改关联连接的地址／协议／密钥。删除活动任务先停止执行，再移除可见执行历史，保留 Git 成果。

初始规划通过 `submit_plan` 下发方案，`finish_work` 提交成果，`submit_review` 给出验收结论；普通文本不能替代这些工具。每次 Worker 提交后，宿主执行已启用的附加检查，接受验收前核验成果指纹和各项真实证据。双方历史从不合并；手动应用／提交／合并不属于此协议。

## 任务分支选择

`TaskInput.git`／`TaskDraft.git` 为可选字段：`{mode: "managed"}`、`{mode: "current"}` 或 `{mode: "branch", branch: "已有本地分支名"}`。旧任务缺省按专用模式解释；编辑时省略字段保留已有选择。宿主拒绝准备后的策略变更，不接受任意路径、版本表达式或 Git 命令参数。

执行操作 `git.branches` 只读返回 `repository: {currentBranch, branches}` 及执行状态，不要求先保存任务，仅列出本地分支。执行状态通过 `preparedTaskIds` 让准备中断后的表单也保持锁定。`RunSummary.git` 保存实际执行绑定，含 `baseCommit`、`headCommit`。旧执行记录缺省使用专用目录登记。`binding(taskId, expected?)` 只验证、不准备；预览／打开目录不能切换分支或重置基准。直接模式每次开始／重新执行检查目录干净并记录新基准，旧记录在分支或 HEAD 不符时拒绝访问。

删除任务保留登记及成果。上文 worktree 人工清理步骤只适用于专用模式，不可对用户当前项目执行；直接模式不会自动还原文件或切回原分支。

## 方案、成果和命令证据

ExecutionConfig 新增可选 customCommandsEnabled；缺省按原命令数组是否非空归一化，不改变存储键。关闭只停止使用附加命令，不清空内容。默认执行不要求检查数组非空。

TaskPlan 包含宿主分配的 version、objective、requirements、steps、criteria 和 revisionReason。每个验收项包含稳定 id、description、verification（command／reading）、evidence 及 reason；reading 必须说明原因。方案最多 40 个步骤和 40 个验收项。修订必须说明原因并保留已有验收 ID 与验证方式。

Worker 的 finish_work 包含 summary、completedSteps、逐验收项 evidence（criterionId、commandIds、evidence）及 unresolved；宿主补充 planVersion 和 revision。Reviewer 的 submit_review 包含 verdict、summary、逐项 acceptance（带 passed），拒绝必须有 nextPlan。审批须覆盖全部验收项，实际证据和附加检查必须有效；不能以模型提供的成功字符串替代真实命令记录。

run_command 接受 name、program、args、可选 cwd（默认 .）、purpose（prepare／verify／explore）、criterionIds 和可选 timeoutSeconds（默认 180）。verify 必须关联当前命令验收项。命令 ID 由宿主生成，与模型工具调用 ID 不同。CommandEvidence 保存实际命令、目录、超时、用途、验收项、方案版本、轮次、前后指纹、结果及可选结构化错误。输出通过同一命令事件的连续文本块保留，read_command_output 支持按字符分页。参数、结果、交接和事件在传输／持久化前脱敏。

RunSummary 可选 plan、submission、review 保存当前展示所需内容。RunEvent 新增 plan／submission 种类及可选 detail 判别联合（plan、submission、review、command），完整历史保留各版本。旧字段及旧记录继续可读；planning 是新增可暂停阶段。各角色仅收到阶段允许的工具，完整工具批次的嵌套类型与限制先校验后执行。

命令启动新增 commandNotFound、commandPermissionDenied、commandStartFailed 和 commandPlatformUnsupported 结构化错误，参数包含适用的命令名称和程序路径；详情沿用脱敏规则。非零退出、超时、输出超限和停止仍使用既有错误标识。旧 systemd 错误表仅用于读取历史记录，不再由新运行器生成。运行响应、方案及证据的存储字段均保持兼容，不迁移数据。
