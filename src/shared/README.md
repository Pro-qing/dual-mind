# Shared local contracts / 共享本地契约

`model.ts` defines local task/configuration types and host/UI messages; `roles.ts` provides bilingual built-in Reviewer instructions; `i18n.ts` provides typed English/Chinese UI messages. No secrets are included in UI snapshots. See [Protocol](../../docs/en/protocol.md).

`model.ts` 定义本地任务／配置类型及宿主消息，`roles.ts` 提供双语内置 Reviewer 指令，`i18n.ts` 提供有类型的中英文文案。界面快照不包含密钥，详见[通信协议](../../docs/zh/protocol.md)。

`execution.ts` defines versioned plans, submissions, reviews and host command evidence. `execution.ts` 同时定义方案版本、成果提交、验收结论和宿主命令证据。

TaskMessage and conversation/evidence pages support durable follow-up across executions. TaskMessage 与独立聊天／证据分页支持跨执行持续追问。

`artifacts.ts` defines explicit Git lifecycle actions and saved results; `context.ts` defines role usage and durable summary checkpoints.

`artifacts.ts` 定义显式 Git 生命周期操作和保存成果；`context.ts` 定义角色预算及持久化摘要检查点。

Tool outcomes now distinguish execution, failure, rejection, skipped calls and unknown effects; repeated failures pause without resetting total budgets. / 工具结果区分执行、失败、拒绝、跳过及未知副作用；重复失败暂停不重置总预算。
