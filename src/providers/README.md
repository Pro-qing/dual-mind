# Host model adapters / 宿主模型适配

`models.ts` discovers model IDs. `inference.ts` adapts streaming Chat Completions and Responses, validates tool framing, classifies bounded HTTP/stream errors, and returns optional usage. `retry.ts` permits bounded transient retries before the first valid stream event; it never switches protocol. `context.ts` manages independent role budgets, complete tool exchanges and bounded semantic summaries. Only public summary facts are persisted. See [Task lifecycle](../../docs/en/task-lifecycle.md).

`models.ts` 查询模型 ID；`inference.ts` 适配双协议流式响应、工具格式、有限错误正文分类及可选用量。`retry.ts` 仅在首个有效流事件前进行有限临时故障重试，不切换协议。`context.ts` 管理独立角色预算、完整工具交互与有限语义摘要，只持久化公开摘要事实。详见[任务生命周期](../../docs/zh/task-lifecycle.md)。

Tool outcomes now distinguish execution, failure, rejection, skipped calls and unknown effects; repeated failures pause without resetting total budgets. / 工具结果区分执行、失败、拒绝、跳过及未知副作用；重复失败暂停不重置总预算。
