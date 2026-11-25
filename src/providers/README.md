# Host model adapters / 宿主模型适配

`models.ts` discovers model IDs. `adapters/protocol.ts` owns protocol URLs, authentication, request bodies, tool-result framing and provider capability filtering. `inference.ts` handles streaming Chat Completions, Responses and Anthropic Messages, validates tool framing, classifies bounded HTTP/stream errors, and returns optional usage. Command Code uses its compatibility API rather than the native CLI protocol. `retry.ts` permits bounded transient retries before the first valid stream event; it never switches provider or protocol. `context.ts` manages independent role budgets, complete tool exchanges and bounded semantic summaries. Only public summary facts are persisted. See [Task lifecycle](../../docs/en/task-lifecycle.md).

`models.ts` 查询模型 ID；`adapters/protocol.ts` 统一协议 URL、认证、请求体、工具结果格式及 Provider 能力筛选。`inference.ts` 处理 Chat Completions、Responses 和 Anthropic Messages 流式响应、工具格式、有限错误正文分类及可选用量。Command Code 使用兼容 API，不采用原生 CLI 协议。`retry.ts` 仅在首个有效流事件前进行有限临时故障重试，不切换 Provider 或协议。`context.ts` 管理独立角色预算、完整工具交互与有限语义摘要，只持久化公开摘要事实。详见[任务生命周期](../../docs/zh/task-lifecycle.md)。

Tool outcomes now distinguish execution, failure, rejection, skipped calls and unknown effects; repeated failures pause while retaining diagnostic counts, without cumulative model/tool call limits. / 工具结果区分执行、失败、拒绝、跳过及未知副作用；重复失败暂停时保留诊断计数，模型／工具调用不设累计次数上限。
