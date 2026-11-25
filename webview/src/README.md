# UI source / 界面源码

`App.tsx` owns navigation and language changes. `Tasks.tsx` manages task home, detail, shared forms and the isolated example preview; `Settings.tsx` edits connection and Reviewer configuration. `bridge.ts` correlates host requests and acknowledgements. Styles follow VS Code theme variables. See [the Webview overview](../README.md).

`App.tsx` 管理导航和语言切换，`Tasks.tsx` 管理任务主页、详情、共用表单及隔离示例，`Settings.tsx` 编辑连接和 Reviewer 配置，`bridge.ts` 关联宿主请求与确认。样式使用 VS Code 主题变量，详见 [Webview 概述](../README.md)。

`TaskChat.tsx` manages task conversation, message sending, independent evidence pages, history scrolling and the narrow evidence drawer. `RunDetail.tsx` renders plans, submissions, acceptance and command evidence; `Execution.tsx` provides execution controls and optional advanced custom commands.

`TaskChat.tsx` 管理任务聊天、消息发送、独立证据分页、历史滚动和窄窗口证据抽屉。`RunDetail.tsx` 展示方案、成果提交、验收与命令证据；`Execution.tsx` 提供执行控制及可选的高级自定义命令。

`ChatCard.tsx` owns icon-only sizing/minimization, `ChatActivity.tsx` shows live host activity, and `chatViewState.ts` validates per-task display preferences plus legacy navigation. Raw evidence remains in the host; Webview persistence contains display metadata only.

`ChatCard.tsx` 提供图标缩放／最小化，`ChatActivity.tsx` 显示宿主当前活动，`chatViewState.ts` 校验各任务显示偏好并兼容旧导航。原始证据保留在宿主，Webview 仅持久化显示元数据。

`Recovery.tsx` renders the saved role/phase and recovery blockers outside the collapsible records. `Execution.tsx` gates Continue execution to the latest recoverable run and suppresses duplicate clicks. `ChatActivity.tsx` displays host retry deadlines and actual request attempts; countdowns never write logs. Recovery preserves `chatViewState` preferences. See the bilingual recovery documents under `docs/`.

`Recovery.tsx` 在可最小化的记录外显示保存的角色／阶段和恢复阻塞原因。`Execution.tsx` 仅允许继续最新有效运行，并拦截重复点击。`ChatActivity.tsx` 使用宿主重试截止时间与实际请求次数，本地倒计时不写日志。恢复保留 `chatViewState` 显示偏好。机制与限制见 `docs/` 下的双语恢复说明。

Scenes 38–40 were approved November 25, 2026 and integrated with live VS Code theme colors. Provider/protocol settings preserve older saves. Request summaries accompany both page types, and shared request/role grouping keeps separate chat/evidence display preferences. Context and artifacts share one expansion state while remaining mounted.

场景 38–40 于 2026-11-25 审核通过并接入，颜色实时跟随 VS Code 主题。提供商／协议设置兼容旧保存。两类分页携带请求摘要，共用请求／角色分组逻辑并分别保存显示偏好。上下文与成果共享展开状态，切换保留挂载状态。

`RequestGroups.tsx` renders the shared request/role accordion, backed by pure grouping in `requestGrouping.ts`. `RunDetail.tsx` supports current pass/fail and legacy review records. `TaskLifecyclePanels` owns exclusive context/artifact visibility without unmounting either panel.

`RequestGroups.tsx` 渲染共用的请求／角色折叠组，`requestGrouping.ts` 提供纯数据归组。`RunDetail.tsx` 同时支持当前 pass／fail 与旧审查记录。`TaskLifecyclePanels` 控制上下文／成果互斥显示，切换不卸载内部面板。
