# Worker role / Worker 角色

Runtime implementation lives in `src/execution/service.ts` and `src/execution/contracts.ts`; this directory documents the role and does not contain a separate executor. Reviewer plans and accepts; Worker implements the current plan and submits evidence. See [Architecture](../../../docs/en/architecture.md).

运行实现位于 `src/execution/service.ts` 和 `src/execution/contracts.ts`，本目录说明角色职责，不包含独立执行器。Reviewer 制定方案与验收，Worker 按当前方案实施并提交证据。见[架构说明](../../../docs/zh/architecture.md)。

Worker implements source changes; Reviewer may explore in planning/answering and independently build/test during acceptance. Both use the per-run shell environment; initialization and work belong in the same command. See [shell execution](../../../docs/en/shell-execution.md).

Worker 实施源码修改，Reviewer 可在规划／答疑时探查，在验收时独立构建和测试。两个角色共用本次运行的 shell 环境，初始化和操作放在同一命令。见[通用 shell 执行](../../../docs/zh/shell-execution.md)。

Recovery / 恢复：宿主支持保存阶段与操作的手动接续、当前模型绑定、有限自动重试及旧代次隔离。完整公开记录由只读 `read_operation` 获取，私有协议推理不持久化。新增按钮和提示布局待 SVG 审核后接入；既有暂停交互保持。See / 详见 `docs/en/execution-recovery.md` and `docs/zh/execution-recovery.md`.
