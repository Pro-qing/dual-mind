# React workbench / React 工作台

The native sidebar React/TypeScript Webview has separate task home and detail pages, shared task forms, settings, a typed bridge, and responsive styles. Creation opens a pending task; execution starts manually. Detail uses compact model bars, task chat, independent evidence and a persistent composer. Below 1100 CSS pixels, evidence appears in a drawer. Questions and continued changes reuse the task conversation. The host owns persistence, credentials, model requests, and the execution loop. Structured errors are formatted in the current language; original details and command output remain available. Read-only examples are isolated from saved tasks. See [Usage](../docs/en/usage.md), [Architecture](../docs/en/architecture.md), and [Designs](../docs/en/design.md).

原生侧栏 React／TypeScript Webview 包含独立任务主页、任务详情、共用表单、设置、类型化通信和自适应样式。创建后进入待执行任务，由用户手动开始。详情采用紧凑模型栏、任务聊天、独立证据和常驻输入框；低于 1100 CSS 像素时证据使用抽屉。追问与继续修改沿用任务会话。宿主负责持久化、凭据、模型请求和执行循环。结构化错误按当前语言显示，原始详情和命令输出仍可查看。只读示例与任务存储隔离。参见[使用说明](../docs/zh/usage.md)、[架构说明](../docs/zh/architecture.md)和[设计稿](../docs/zh/design.md)。

Settings uses a single column and category/language selectors. Task details collapse independently of run controls. The host mirrors sanitized display preferences and imports legacy editor-tab state only when sidebar state is absent. Hiding/moving the view preserves execution; callbacks target their originating page.

设置使用单列及类别／语言选择器。任务详情折叠不隐藏主要运行控制。宿主镜像经过筛选的显示偏好，仅在缺少侧栏状态时迁移旧页签状态。隐藏或移动视图不停止执行；异步回复绑定来源页面。

The current home shows only task names and delete icons in compact, nonwrapping rows; full names remain available on hover and to assistive technology. Counts stay above the list. See [approved scenes 28–29](../docs/en/task-home-compact-proposal.md).

当前主页采用紧凑且不换行的任务行，仅显示名称和删除图标；悬停与辅助技术仍可读取完整名称，列表上方保留统计。参见[已审核场景 28–29](../docs/zh/task-home-compact-proposal.md)。

Scenes 28–34 are approved and base/window/artifact/cleanup controls are connected; the existing activity indicator can display automatic context compaction.

场景 28–34 已审核，基点／窗口／成果／清理控件已接入；已有活动条可以显示自动上下文整理状态。

Tool outcomes now distinguish execution, failure, rejection, skipped calls and unknown effects; repeated failures pause without resetting total budgets. / 工具结果区分执行、失败、拒绝、跳过及未知副作用；重复失败暂停不重置总预算。

Scenes 38–40 were approved November 25, 2026 and integrated with live VS Code theme colors. Provider/protocol settings preserve older saves. Request summaries accompany both page types, and shared request/role grouping keeps separate chat/evidence display preferences. Context and artifacts share one expansion state while remaining mounted.

场景 38–40 于 2026-11-25 审核通过并接入，颜色实时跟随 VS Code 主题。提供商／协议设置兼容旧保存。两类分页携带请求摘要，共用请求／角色分组逻辑并分别保存显示偏好。上下文与成果共享展开状态，切换保留挂载状态。
