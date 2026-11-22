# UI source / 界面源码

`App.tsx` owns navigation and language changes. `Tasks.tsx` manages task home, detail, shared forms and the isolated example preview; `Settings.tsx` edits connection and Reviewer configuration. `bridge.ts` correlates host requests and acknowledgements. Styles follow VS Code theme variables. See [the Webview overview](../README.md).

`App.tsx` 管理导航和语言切换，`Tasks.tsx` 管理任务主页、详情、共用表单及隔离示例，`Settings.tsx` 编辑连接和 Reviewer 配置，`bridge.ts` 关联宿主请求与确认。样式使用 VS Code 主题变量，详见 [Webview 概述](../README.md)。

`TaskChat.tsx` manages task conversation, message sending, independent evidence pages, history scrolling and the narrow evidence drawer. `RunDetail.tsx` renders plans, submissions, acceptance and command evidence; `Execution.tsx` provides execution controls and optional advanced custom commands.

`TaskChat.tsx` 管理任务聊天、消息发送、独立证据分页、历史滚动和窄窗口证据抽屉。`RunDetail.tsx` 展示方案、成果提交、验收与命令证据；`Execution.tsx` 提供执行控制及可选的高级自定义命令。

`ChatCard.tsx` owns icon-only sizing/minimization, `ChatActivity.tsx` shows live host activity, and `chatViewState.ts` validates per-task display preferences plus legacy navigation. Raw evidence remains in the host; Webview persistence contains display metadata only.

`ChatCard.tsx` 提供图标缩放／最小化，`ChatActivity.tsx` 显示宿主当前活动，`chatViewState.ts` 校验各任务显示偏好并兼容旧导航。原始证据保留在宿主，Webview 仅持久化显示元数据。

`Recovery.tsx` renders the saved role/phase and recovery blockers outside the collapsible records. `Execution.tsx` gates Continue execution to the latest recoverable run and suppresses duplicate clicks. `ChatActivity.tsx` displays host retry deadlines and actual request attempts; countdowns never write logs. Recovery preserves `chatViewState` preferences. See the bilingual recovery documents under `docs/`.

`Recovery.tsx` 在可最小化的记录外显示保存的角色／阶段和恢复阻塞原因。`Execution.tsx` 仅允许继续最新有效运行，并拦截重复点击。`ChatActivity.tsx` 使用宿主重试截止时间与实际请求次数，本地倒计时不写日志。恢复保留 `chatViewState` 显示偏好。机制与限制见 `docs/` 下的双语恢复说明。
