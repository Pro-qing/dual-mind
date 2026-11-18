# Local state and future orchestration / 本地状态与后续调度

`store.ts` validates and serializes local task/configuration operations, preserves Reviewer snapshots, and delegates credentials to host secret storage. The Worker/Reviewer execution loop remains reserved in its subdirectories. See [Architecture](../../docs/en/architecture.md).

`store.ts` 校验并串行处理本地任务／配置操作，保留 Reviewer 快照，由宿主秘密存储管理凭据。Worker／Reviewer 执行循环仍在子目录中占位，详见[架构说明](../../docs/zh/architecture.md)。
