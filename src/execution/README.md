# Execution modules / 执行模块

## English

`service.ts` is the stable host-facing facade. It delegates to `runtime.ts`, which composes the execution modules around shared dependencies and run state.

| Module                       | Responsibility                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `runController.ts`           | Public execution requests, run lifecycle/state transitions, workspace setup, Worker/Reviewer phases, pause/stop and artifact access. |
| `agentTurn.ts`               | Model turns, context compaction, tool-call validation, structured plan/review acceptance and bounded correction pauses.              |
| `toolExecutor.ts`            | Worker tools, host commands, read-only file access, command evidence and workspace-boundary checks.                                  |
| `conversationCoordinator.ts` | Durable user messages, one-at-a-time request handling, question answers, modification plans and request-group attribution.           |
| `recoveryCoordinator.ts`     | Recovery initialization, state/operation persistence, restoration and execution checkpoints.                                         |
| `recovery.ts`                | Recovery record types, append-only journal validation and public recovery-store operations.                                          |
| `recordProjection.ts`        | Redaction, event projection, activity snapshots and persistence-safe public records.                                                 |
| `runtimeTypes.ts`            | Shared runtime state and dependency types used across the execution modules.                                                         |

`ExecutionService` remains the integration boundary for the workbench. Cross-module changes should preserve its public request/recovery contracts and keep the facade free of orchestration logic.

## 简体中文

`service.ts` 是面向宿主的稳定门面；它委托给 `runtime.ts`，由运行时围绕共享依赖与执行状态组合各执行模块。

| 模块                         | 职责                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `runController.ts`           | 对外执行请求、运行生命周期与状态转换、工作区准备、Worker／Reviewer 阶段、暂停／停止及成果访问。 |
| `agentTurn.ts`               | 模型轮次、上下文压缩、工具调用校验、结构化方案／审查结论及有限纠错暂停。                        |
| `toolExecutor.ts`            | Worker 工具、宿主命令、只读文件访问、命令证据及工作区边界校验。                                 |
| `conversationCoordinator.ts` | 持久化用户消息、逐条处理请求、答疑、修改方案及请求归组标识。                                    |
| `recoveryCoordinator.ts`     | 恢复初始化、状态／操作持久化、运行恢复及执行检查点。                                            |
| `recovery.ts`                | 恢复记录类型、追加日志校验和公开恢复存储操作。                                                  |
| `recordProjection.ts`        | 脱敏、事件投影、活动快照及可安全持久化的公开记录。                                              |
| `runtimeTypes.ts`            | 执行模块间共享的运行时状态和依赖类型。                                                          |

`ExecutionService` 仍是工作台的集成边界。跨模块修改应保持其公开请求／恢复契约，并让门面专注委托，不承载编排逻辑。
