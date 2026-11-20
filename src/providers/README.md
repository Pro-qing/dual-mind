# Host model adapters / 宿主模型适配

`models.ts` handles explicit model-list discovery. `inference.ts` adapts streaming Chat Completions and Responses, validates complete tool calls, and preserves role-local protocol history without automatic retries or fallback.

`models.ts` 实现显式模型列表查询；`inference.ts` 适配流式 Chat Completions 和 Responses，校验完整工具调用并维护角色独立协议历史，不自动重试或回退。
