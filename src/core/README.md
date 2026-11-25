# Local state and future orchestration / 本地状态与后续调度

`store.ts` validates and serializes local task/configuration operations, preserves Reviewer snapshots, and delegates credentials to host secret storage. The Reviewer planning / Worker implementation / Reviewer acceptance loop lives in `src/execution/`. See [Architecture](../../docs/en/architecture.md).

`store.ts` 校验并串行处理本地任务／配置操作，保留 Reviewer 快照，由宿主秘密存储管理凭据。Reviewer 规划／Worker 实施／Reviewer 验收循环位于 `src/execution/`，详见[架构说明](../../docs/zh/architecture.md)。

Task follow-up uses durable messages and Reviewer-only answering in `src/execution/conversationCoordinator.ts`; each message's `userRequestId` is propagated through its answer and execution events. `publicText` redacts complete user messages without the shorter error-detail limit. / 持续追问由 `src/execution/conversationCoordinator.ts` 持久化并由 Reviewer 只读答复；每条消息的 `userRequestId` 传递到对应答复和执行事件。`publicText` 对完整消息脱敏，不套用错误详情的较短长度限制。

Host-only derived-task creation uses an operation UUID and input digest; connection model-window overrides remain compatible with older saves.

宿主派生任务创建使用操作 UUID 和输入哈希；连接模型窗口配置兼容旧客户端保存。
