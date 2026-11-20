# Local state and future orchestration / 本地状态与后续调度

`store.ts` validates and serializes local task/configuration operations, preserves Reviewer snapshots, and delegates credentials to host secret storage. The Reviewer planning / Worker implementation / Reviewer acceptance loop lives in `src/execution/`. See [Architecture](../../docs/en/architecture.md).

`store.ts` 校验并串行处理本地任务／配置操作，保留 Reviewer 快照，由宿主秘密存储管理凭据。Reviewer 规划／Worker 实施／Reviewer 验收循环位于 `src/execution/`，详见[架构说明](../../docs/zh/architecture.md)。
