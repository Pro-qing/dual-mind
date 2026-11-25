# 界面设计：当前实现与历史设计参考

[English](../en/design.md) · [文档索引](./README.md)

**当前功能：**[工作树、上下文摘要与成果收尾](./task-lifecycle.md)及[工具错误处理](./tool-errors.md)的宿主与前端自 0.0.6 起提供。[场景 30–34](./task-lifecycle-proposal.md)与[场景 35–37](./tool-errors-proposal.md)保留原审核和实现记录。

**新增已审核设计：**[紧凑任务列表](./task-home-compact-proposal.md)提供场景 28–29，覆盖 240／320／480px 主页、长名称、键盘焦点、只读示例与删除确认。依据 2026-11-23 的工作区修改补充，现已归档于本地 `master`，归档于 0.0.5 开发目录，晚于原 `v0.0.5` 标签，并完整保留在 0.0.6 中。

[原生侧栏工作台](./sidebar-workbench-proposal.md)场景 24–27 已于 **2026-11-22 审核通过**，2026-11-23 接入源码。完整工作台由主侧栏或辅助侧栏承载，提供紧凑导航、可折叠任务详情和手动“终端仅占编辑器区域”操作。旧页签仅用于迁移；原有 27 组审核记录和历史设计保留。

**新增已审核修订：**[过程提示、紧凑聊天与最小化](./chat-progress-proposal.md)提供场景 18–20。2026-11-22 已审核通过，并要求缩放按钮仅显示图标；已实现。原 17 组审核记录保留，图中仍为静态示例。

**新增已审核提案：** [任务聊天与持续追问](./task-chat-proposal.md)提供场景 14–17，包含宽屏聊天、窄屏证据抽屉、消息排队和结束后追问。四组设计已审核通过，对应界面和消息流程已实现，实际覆盖见[任务聊天验证](./task-chat-validation.md)。

**新增已审核修订：** [双 AI 方案与验收循环](./execution-cycle-proposal.md)，2026-11-20 审核通过，已实现，实际覆盖范围见[验证记录](./execution-cycle-validation.md)。
**已审核并实现的修订：** [任务主页、详情与错误提示修订](./task-pages-proposal.md)提供场景 8–11，拆分主页和任务详情，创建后手动开始，并统一中英文错误展示。场景 8–11 已于 2026-11-20 审核通过并实现；下文场景 1–7 与历史说明保持原样。

**当前源码版本：0.0.7 · 本地版本准备，尚未公开发布。** 记录日期：2026-11-24。修复、验证及本地制品见[0.0.7 版本说明](./release-notes-0.0.7.md)。公开发布由维护者单独执行，历史版本记录保留原意。

**当前共有 40 组 SVG／PNG：37 组已审核，场景 38–40 待明确审核。** 场景 1–37 保留原审核及实现记录；新提案覆盖提供商／协议设置、标题紧凑且上下文／成果互斥的任务栏，以及先按用户请求再按角色折叠的日志。后端适配器和请求归属已实现，但对应 UI 控件和布局尚未接入。原图及历史审核标签保持原样，所有图稿均为示例。已发布的 0.0.1 保留历史行为，当前操作见[使用说明](./usage.md)。

每张画布均为 **1440 × 900**，采用贴近 VS Code 的深色配色，使用可编辑的 SVG 文字与矢量元素。早期场景使用英文标签，后续修订以简体中文为主，各组均有中英双语说明。SVG 没有内嵌图片、脚本、外部字体或外部资源，PNG 为渲染预览。

## 按版本查找

[设计归档总索引](../design/README.md)列出版本、场景和数量。0.0.1 对应场景 1–5，0.0.2 对应 6–7，0.0.3 对应 8–17，0.0.4 对应 18–23，0.0.5 对应 24–37，0.0.7 对应待审核场景 38–40；每个目录都有同名 SVG／PNG 和 README。目录按开发版本归属，不是每个初始标签的完整快照：场景 8–17 是初始 `v0.0.3` 标签之后的同版本修订；侧栏由此前 0.0.4 候选包的开发记录归入正式的 0.0.5 源码里程碑。历史图稿内容和标签不改写。

## 设计稿导航

| 场景                               | 可编辑源文件                                                          | 预览                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. 并行任务工作台                  | [SVG](../design/v0.0.1/dual-mind-workbench.svg)                       | [PNG](../design/v0.0.1/dual-mind-workbench.png)                       |
| 2. API 连接设置                    | [SVG](../design/v0.0.1/dual-mind-api-settings.svg)                    | [PNG](../design/v0.0.1/dual-mind-api-settings.png)                    |
| 3. Reviewer 角色设置               | [SVG](../design/v0.0.1/dual-mind-reviewer-roles.svg)                  | [PNG](../design/v0.0.1/dual-mind-reviewer-roles.png)                  |
| 4. 新建任务                        | [SVG](../design/v0.0.1/dual-mind-new-task.svg)                        | [PNG](../design/v0.0.1/dual-mind-new-task.png)                        |
| 5. 删除任务                        | [SVG](../design/v0.0.1/dual-mind-delete-task.svg)                     | [PNG](../design/v0.0.1/dual-mind-delete-task.png)                     |
| 6. API 模型查询                    | [SVG](../design/v0.0.2/dual-mind-api-model-discovery.svg)             | [PNG](../design/v0.0.2/dual-mind-api-model-discovery.png)             |
| 7. 任务模型选择                    | [SVG](../design/v0.0.2/dual-mind-task-model-selection.svg)            | [PNG](../design/v0.0.2/dual-mind-task-model-selection.png)            |
| 8. 独立任务主页                    | [SVG](../design/v0.0.3/dual-mind-task-home-proposal.svg)              | [PNG](../design/v0.0.3/dual-mind-task-home-proposal.png)              |
| 9. 独立任务详情                    | [SVG](../design/v0.0.3/dual-mind-task-detail-proposal.svg)            | [PNG](../design/v0.0.3/dual-mind-task-detail-proposal.png)            |
| 10. 创建任务                       | [SVG](../design/v0.0.3/dual-mind-task-create-proposal.svg)            | [PNG](../design/v0.0.3/dual-mind-task-create-proposal.png)            |
| 11. 错误与窄窗口                   | [SVG](../design/v0.0.3/dual-mind-task-states-proposal.svg)            | [PNG](../design/v0.0.3/dual-mind-task-states-proposal.png)            |
| 12. 方案与验收循环                 | [SVG](../design/v0.0.3/dual-mind-execution-cycle-proposal.svg)        | [PNG](../design/v0.0.3/dual-mind-execution-cycle-proposal.png)        |
| 13. 附加命令设置                   | [SVG](../design/v0.0.3/dual-mind-execution-settings-proposal.svg)     | [PNG](../design/v0.0.3/dual-mind-execution-settings-proposal.png)     |
| 14. 聊天与证据面板                 | [SVG](../design/v0.0.3/dual-mind-task-chat-proposal.svg)              | [PNG](../design/v0.0.3/dual-mind-task-chat-proposal.png)              |
| 15. 窄窗口证据抽屉                 | [SVG](../design/v0.0.3/dual-mind-task-chat-narrow-proposal.svg)       | [PNG](../design/v0.0.3/dual-mind-task-chat-narrow-proposal.png)       |
| 16. 执行中消息排队                 | [SVG](../design/v0.0.3/dual-mind-task-chat-queued-proposal.svg)       | [PNG](../design/v0.0.3/dual-mind-task-chat-queued-proposal.png)       |
| 17. 追问与继续修改                 | [SVG](../design/v0.0.3/dual-mind-task-chat-followup-proposal.svg)     | [PNG](../design/v0.0.3/dual-mind-task-chat-followup-proposal.png)     |
| 18. 过程提示与聊天                 | [SVG](../design/v0.0.4/dual-mind-chat-progress-proposal.svg)          | [PNG](../design/v0.0.4/dual-mind-chat-progress-proposal.png)          |
| 19. 聊天与输出最小化               | [SVG](../design/v0.0.4/dual-mind-chat-minimized-proposal.svg)         | [PNG](../design/v0.0.4/dual-mind-chat-minimized-proposal.png)         |
| 20. 紧凑聊天与窄窗口               | [SVG](../design/v0.0.4/dual-mind-chat-compact-narrow-proposal.svg)    | [PNG](../design/v0.0.4/dual-mind-chat-compact-narrow-proposal.png)    |
| 21. 故障与继续执行                 | [SVG](../design/v0.0.4/dual-mind-recovery-failure-proposal.svg)       | [PNG](../design/v0.0.4/dual-mind-recovery-failure-proposal.png)       |
| 22. 恢复状态与重试                 | [SVG](../design/v0.0.4/dual-mind-recovery-running-proposal.svg)       | [PNG](../design/v0.0.4/dual-mind-recovery-running-proposal.png)       |
| 23. 窄窗口恢复                     | [SVG](../design/v0.0.4/dual-mind-recovery-narrow-proposal.svg)        | [PNG](../design/v0.0.4/dual-mind-recovery-narrow-proposal.png)        |
| 24. 原生主侧栏                     | [SVG](../design/v0.0.5/dual-mind-sidebar-left-proposal.svg)           | [PNG](../design/v0.0.5/dual-mind-sidebar-left-proposal.png)           |
| 25. 原生辅助侧栏                   | [SVG](../design/v0.0.5/dual-mind-sidebar-right-proposal.svg)          | [PNG](../design/v0.0.5/dual-mind-sidebar-right-proposal.png)          |
| 26. 侧栏宽度                       | [SVG](../design/v0.0.5/dual-mind-sidebar-widths-proposal.svg)         | [PNG](../design/v0.0.5/dual-mind-sidebar-widths-proposal.png)         |
| 27. 侧栏表单与证据                 | [SVG](../design/v0.0.5/dual-mind-sidebar-forms-proposal.svg)          | [PNG](../design/v0.0.5/dual-mind-sidebar-forms-proposal.png)          |
| 28. 紧凑任务主页（已审核）         | [SVG](../design/v0.0.5/dual-mind-task-home-compact-proposal.svg)      | [PNG](../design/v0.0.5/dual-mind-task-home-compact-proposal.png)      |
| 29. 任务列表交互（已审核）         | [SVG](../design/v0.0.5/dual-mind-task-home-interactions-proposal.svg) | [PNG](../design/v0.0.5/dual-mind-task-home-interactions-proposal.png) |
| 30. 工作树与基点选择（已审核）     | [SVG](../design/v0.0.5/dual-mind-workspace-base-proposal.svg)         | [PNG](../design/v0.0.5/dual-mind-workspace-base-proposal.png)         |
| 31. 上下文预算与自动整理（已审核） | [SVG](../design/v0.0.5/dual-mind-context-compaction-proposal.svg)     | [PNG](../design/v0.0.5/dual-mind-context-compaction-proposal.png)     |
| 32. 成果提交与合入（已审核）       | [SVG](../design/v0.0.5/dual-mind-artifact-integration-proposal.svg)   | [PNG](../design/v0.0.5/dual-mind-artifact-integration-proposal.png)   |
| 33. 合并冲突处理（已审核）         | [SVG](../design/v0.0.5/dual-mind-merge-conflicts-proposal.svg)        | [PNG](../design/v0.0.5/dual-mind-merge-conflicts-proposal.png)        |
| 34. 工作树清理与成果恢复（已审核） | [SVG](../design/v0.0.5/dual-mind-workspace-cleanup-proposal.svg)      | [PNG](../design/v0.0.5/dual-mind-workspace-cleanup-proposal.png)      |
| 35. 工具调用与命令结果             | [SVG](../design/v0.0.5/dual-mind-tool-results-proposal.svg)           | [PNG](../design/v0.0.5/dual-mind-tool-results-proposal.png)           |
| 36. 重复错误暂停与继续             | [SVG](../design/v0.0.5/dual-mind-tool-pause-proposal.svg)             | [PNG](../design/v0.0.5/dual-mind-tool-pause-proposal.png)             |
| 37. 历史失败与当前验收             | [SVG](../design/v0.0.5/dual-mind-acceptance-errors-proposal.svg)      | [PNG](../design/v0.0.5/dual-mind-acceptance-errors-proposal.png)      |
| 38. 提供商与协议设置（待审核）     | [SVG](../design/v0.0.7/dual-mind-model-provider-proposal.svg)         | [PNG](../design/v0.0.7/dual-mind-model-provider-proposal.png)         |
| 39. 紧凑任务栏（待审核）           | [SVG](../design/v0.0.7/dual-mind-compact-task-header-proposal.svg)    | [PNG](../design/v0.0.7/dual-mind-compact-task-header-proposal.png)    |
| 40. 按请求分组的日志（待审核）     | [SVG](../design/v0.0.7/dual-mind-request-grouped-logs-proposal.svg)   | [PNG](../design/v0.0.7/dual-mind-request-grouped-logs-proposal.png)   |

## 场景 1–7 的历史设计说明

以下保留原工作台与模型选择的设计语境，包括当时的双栏、草稿和目标并行交互；这些描述不表示当前全部功能。任务页面和执行循环的中间修订分别见场景 8–11、12–13，当前聊天布局以场景 14–20 和使用说明为准。

### 1. 并行任务工作台

![并行任务列表与当前任务的 Worker／Reviewer 对话](../design/v0.0.1/dual-mind-workbench.png)

在已认可的双栏布局旁增加可折叠的工作区任务列表，每项显示名称、Reviewer 角色、状态、轮次和删除入口。示例包含两个运行中任务、一个暂停任务和一个已完成任务。选择任务只切换当前显示的对话，不会停止其他任务。

开始、暂停、停止、人工反馈、轮次上限和应用结果均属于当前选中任务。Worker 保持通用执行职责；Reviewer 展示该任务选择的审查侧重点。两个智能体各有独立的连接和模型，锁图标表示当前执行的配置已固定。草稿在开始前可以调整模型绑定和轮次上限，初始上限为五轮。

结果区明确区分审查通过与用户决定应用修改。多个任务可并行产出草稿，每份结果仍需单独预览并明确应用。设计稿不会回写代码。

### 2. API 连接设置

![API 连接编辑、独立模型默认值、占用提示与连接反馈状态](../design/v0.0.1/dual-mind-api-settings.png)

统一 Settings 入口包含 **API Connections** 和 **Reviewer Roles** 两个页签。连接是本机用户级的 OpenAI 兼容接口配置，包含名称、Base URL、默认模型 ID 和密钥保存状态，提供新增、保存、删除和测试操作。Worker 与 Reviewer 分别设置默认连接和模型 ID，新建任务继承这些默认值。

**Set key／Replace key** 通过扩展宿主打开 VS Code 密码输入框。设置页只显示是否已保存密钥，不展示或接收已存储的密钥值。独立的密码输入示例使用占位圆点，不含真实凭据。连接反馈展示未配置、测试中、成功和失败状态，均不代表实际请求结果。

连接被运行或暂停中的任务引用时，删除按钮禁用，并列出需要先停止的关联任务。修改默认值影响后续任务；已开始执行的任务保持其选定配置。保存的草稿若引用了不可用连接，需重新选择有效配置后才能开始。

### 3. Reviewer 角色设置

![四个内置 Reviewer 角色、可编辑指令、自定义角色与固定 Worker](../design/v0.0.1/dual-mind-reviewer-roles.png)

四类内置预设**只改变 Reviewer**：

| 角色     | 默认审查侧重点                       |
| -------- | ------------------------------------ |
| Bug      | 问题复现、根因、修复有效性和回归风险 |
| Feature  | 需求覆盖、验收条件、边界行为和兼容性 |
| Review   | 正确性、安全性、可维护性和测试覆盖   |
| Refactor | 行为保持、结构改善和回归验证         |

内置名称固定，用途说明和审查指令可编辑并恢复默认。**New role** 打开同一编辑区，允许填写自定义名称、用途和指令；自定义角色还提供编辑和删除操作。选择自定义角色会替代内置选择，每个任务始终只有一个 Reviewer 预设。

新建任务时保存所选角色名称和指令的快照。之后编辑、恢复默认或删除该预设，都不追改已有任务及其历史，包括已经保存的草稿。删除自定义预设只影响后续选择。固定 Worker 以说明卡片展示，不提供角色编辑入口。

### 4. 新建任务

![新建任务弹窗：选择 Reviewer 角色，API 未配齐时仍可保存草稿](../design/v0.0.1/dual-mind-new-task.png)

名称、需求和一个 Reviewer 角色为必填项；弹窗同时确认两个连接及模型选择，以及当前任务的轮次上限。示例特意留空 Reviewer 连接：**Create draft** 仍可用，之后开始执行前需要配齐两个智能体的 API 配置。此时禁用的“开始”操作应明确指出缺少的配置，并提供 Settings 入口。

创建草稿后在工作台选中该任务，不立即发起模型请求。取消不创建任务。弹窗打开期间，其他任务可继续运行。

### 5. 删除任务

![删除确认、停止中与停止失败状态，以及空任务列表示例](../design/v0.0.1/dual-mind-delete-task.png)

确认框显示任务名称，并说明仅移除其记录及双方对话历史，保留工作区文件和其他任务。草稿、已停止、已完成或完全失败的任务可以直接 **Delete task**。运行或暂停中的任务使用 **Stop and delete**：请求停止、等待确认、再删除记录。停止期间禁用重复的破坏性操作；停止失败时保留任务和历史并允许重试。取消确认框不执行任何动作。

删除后选择其他剩余任务；删除最后一个任务后显示 **No tasks yet** 和 **New task**。本稿左右侧面板和底部说明明确标注为供审核的状态示例，不表示实际界面同时打开这些弹窗。

## 已实现的模型查询增补设计

场景 6–7 沿用已采用布局，定义开发分支已实现的连接验证与模型选择，这两组设计本身不定义任务执行、审查循环或代码应用；整体执行能力见当前版本说明。

### 6. API 连接与模型查询

![API 连接表单、可搜索模型 ID 及查询状态示例](../design/v0.0.2/dual-mind-api-model-discovery.png)

中间展示已保存的连接和展开的模型选择器，右侧卡片是供审核的独立状态示例，不代表产品会同时显示这些面板。`example-model-*`、连接名称、数量和时间均为示例，不推荐具体模型，也不假定某个账号拥有这些模型。

新增连接预填 `https://api.openai.com/v1`，Base URL 可修改为 OpenAI 兼容服务的地址。开发分支将**默认模型改为可选**，首次配置流程为：保存名称和 Base URL → 通过 VS Code 密码框设置密钥 → **测试并获取模型** → 按需选择默认模型 → 保存。当前 `0.0.1` 保存连接仍要求填写默认模型，开发分支现已允许默认模型为空。**设置密钥／替换密钥**继续只在页面显示保存状态。

**测试并获取模型**验证模型列表接口的访问并返回模型 ID，**刷新模型**重复该查询。两者均要求已保存连接和密钥；修改 Base URL 后需要先保存再查询。打开页面或选择器不自动发出请求。结果显示模型数量和查询时间，成功文案为**模型列表可访问**，不表示完成了推理测试；列表中的模型也不一定适合聊天或代码任务。

选择器可编辑并按模型 ID 搜索，允许直接输入列表之外的 ID。展开时显示候选项，输入文字后过滤。返回的 ID 原样展示和保存，不翻译或编造友好名称。查询成功不自动选择第一个模型，也不覆盖当前选择。图中保留历史 Worker／Reviewer 默认区域；实际界面现已迁入独立默认配置标签，继续复用同一选择器。

状态示例覆盖未保存连接、缺少密钥、查询中、中间主面板的成功状态、空列表、查询失败和地址已修改。查询期间禁用重复请求。空列表、端点不支持或其他失败均保留手动输入和当前 ID，配置允许时提供重试。地址或密钥变化后旧结果失效，需要重新查询。成功返回空列表与查询失败分别展示。

### 7. 任务模型选择

![Worker／Reviewer 独立模型选择、旧 ID 保留及窄窗口排列](../design/v0.0.2/dual-mind-task-model-selection.png)

主面板为新建任务弹窗，两个智能体使用独立连接和模型：Worker 使用示例 OpenAI 选择，Reviewer 使用手动填写的网关 ID 且尚未配置密钥，**创建草稿**仍可用。侧边分别展示编辑草稿、切换连接和窄窗口排列，属于弹窗之外的审核参考。

新草稿继承已保存的 Worker／Reviewer 默认值。每个选择器只使用所选连接的候选列表，提供获取／刷新与手动输入。用户主动切换连接时，当前表单使用该连接的默认模型，默认值可以为空；刷新列表不会改变已选择的 ID。打开已有草稿时，即使模型不在最新列表中也保留绑定，仅在用户明确编辑并保存后修改。编辑草稿继续保留 Reviewer 角色快照；主图中的内置角色选项仅用于新建草稿。

缺少密钥时禁用该连接的查询操作，但仍可填写 ID 和保存草稿。列表查询失败也保留已输入或已保存的值。两个智能体使用不同连接时，候选项和查询结果不能串用。工作台原有任务侧栏及对话布局沿用已审核设计。

### 语言、键盘与窄窗口行为

| 英文标签                 | 简体中文标签       |
| ------------------------ | ------------------ |
| Test & fetch models      | 测试并获取模型     |
| Fetch / Refresh          | 获取模型／刷新模型 |
| Default model — Optional | 默认模型（可选）   |
| Search or type an ID     | 搜索或输入模型 ID  |
| Model list accessible    | 模型列表可访问     |
| Fetching models…         | 正在获取模型…      |
| No models returned       | 未返回模型         |
| Query failed             | 查询失败           |
| Save draft               | 保存草稿           |

说明、状态、校验和错误均提供中英文，模型 ID 与用户填写的连接名称保留原文。切换界面语言时保留表单值和当前选择。

可编辑组合框应具有可访问标签、键盘焦点和可滚动候选列表。Tab 切换控件，方向键上下选择展开列表中的候选项，Enter 选中高亮项，Escape 优先关闭列表，再用于关闭弹窗。未匹配候选项的文本保留为手动 ID；仅关闭列表不会提交表单或清空 ID。长 ID 保留完整值，输入框内可横向滚动，焦点／悬停时可查看全文，候选行允许换行，避免丢失用于区分模型的后缀。

低于 900 CSS 像素时，Worker 在上、Reviewer 在下。连接设置改为可滚动单栏，查询按钮和状态文本允许换行。候选菜单保持在弹窗可见区域内、独立滚动，下方空间不足时向上展开；保存／取消操作保持可达。图中的状态参考卡片属于设计说明，不是新增运行面板。

## 场景 1–7 的历史布局与状态约定

- 任务和对话历史按工作区组织；连接、默认模型绑定及角色预设属于本机 VS Code 用户配置；凭据值由宿主秘密存储管理。
- 后台进度更新任务列表，双栏只展示选中任务。某个任务出错、暂停或完成，不会停止其他任务。
- 宽度低于 1200 CSS 像素时，任务侧栏收为 Tasks 按钮并通过抽屉展开；低于 900 CSS 像素时，Worker 在上、Reviewer 在下。设置表单与弹窗改为可滚动单栏，控制区允许换行，任务身份和操作入口保持可见。
- 实现阶段使用 VS Code 主题变量、可访问的控件标签、明确的焦点标识和键盘导航。这些静态稿不实现交互。

## 审核与实现门槛

场景 1–37 已审核，38–40 待审核；对应视觉修改须按[贡献指南](../../CONTRIBUTING.zh.md)经明确审核后实现。原图中的历史标签予以保留，不代表当前审核状态。内置 Reviewer 定义和已有任务快照保持兼容，图中运行状态和查询结果仍为示例。

已实现模块职责见[架构说明](./architecture.md)，任务关联和配置边界见[通信协议](./protocol.md)。其中记录已实现的设置／执行消息、角色交接与文件访问边界。

## 更新与验证预览

SVG 是可编辑源文件，每张 SVG 旁保留同名 PNG。保留已有审核资源；需要修订时先完成设计审核。以下是场景 6–7 的预览维护命令，仅重新生成这两组模型查询稿；其他修订的命令和范围见对应提案。使用单独安装 CairoSVG 2.7.1 的 Python 环境，于仓库根目录执行：

```bash
for scene in dual-mind-api-model-discovery dual-mind-task-model-selection; do
  python3 -m cairosvg "docs/design/v0.0.2/${scene}.svg" -o "docs/design/v0.0.2/${scene}.png"
done
npm run docs:check
npm run format:check
```

逐张按原尺寸检查裁切、缺字、遮挡和对齐。文档检查脚本扫描全部 SVG／PNG 配对（当前为 40 组），要求原始基础场景 1–7 齐全，并检查画布尺寸、可访问的标题／描述、可编辑文字、静态矢量约束及 PNG 尺寸。更新设计或文档不代表已重建或替换公开 VSIX。布局仍需渲染和目视检查。CairoSVG 是可选设计工具，不属于扩展运行时或标准构建依赖。

## 开发分支的执行界面

实际设置类别为 API 连接、新任务的默认配置、任务执行、Reviewer 角色、模型上下文和保存的成果。当前连接界面提供 OpenAI 兼容 Chat Completions／Responses；Anthropic 和 Command Code 后端适配尚未通过设置界面开放。场景 38–40 是待审核的提供商控件、紧凑任务栏和请求／角色日志折叠提案，尚无对应 UI 源码。其余工作台保留已实现布局：任务次要详情默认折叠，当前详情采用场景 14–20 的紧凑模型栏、用户右侧／AI 左侧聊天、常驻输入框和独立证据面板；宽屏证据栏约 360 CSS 像素，低于 1100 CSS 像素时转为宽度不超过 430 CSS 像素及视口的抽屉。每工作区同时一个任务；当前行为见[使用说明](./usage.md)。

## 新增已审核设计：2026-11-22

| 场景                           | 源文件                                                             | 预览                                                               |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 18. Public process / 公开过程  | [SVG](../design/v0.0.4/dual-mind-chat-progress-proposal.svg)       | [PNG](../design/v0.0.4/dual-mind-chat-progress-proposal.png)       |
| 19. Minimized panel / 最小化   | [SVG](../design/v0.0.4/dual-mind-chat-minimized-proposal.svg)      | [PNG](../design/v0.0.4/dual-mind-chat-minimized-proposal.png)      |
| 20. Narrow messages / 窄屏消息 | [SVG](../design/v0.0.4/dual-mind-chat-compact-narrow-proposal.svg) | [PNG](../design/v0.0.4/dual-mind-chat-compact-narrow-proposal.png) |

## 已审核：恢复执行

原 20 组设计保留。新增[场景 21–23](./recovery-proposal.md)已审核并接入故障、恢复检查、有限重试及窄屏提示；设计稿中的任务和计数保持静态示例。
