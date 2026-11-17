# 架构说明

[English](../en/architecture.md) · [文档索引](./README.md)

## 当前已实现

执行 `dualMind.showStatus` 时，VS Code 调用 `activate`。扩展注册状态命令，并将其 disposable 加入 `context.subscriptions`，由 VS Code 在卸载扩展时释放。命令只显示通知，当前没有模型流量、后台智能体进程、Webview 或工作区修改。

## 仓库结构

```text
src/              插件入口，以及调度、模型适配、编辑器操作、共享协议占位
webview/          后续 React 界面，等待设计审核通过
resources/        扩展资源占位
scripts/          构建、环境检查、文档检查和打包工具
tests/            环境检查测试与扩展宿主冒烟测试
docs/en/          English guides
docs/zh/          中文指南
docs/design/      共用 SVG 设计提案
.github/          CI 与双语协作模板
.vscode/          启动与构建任务
```

## 规划中的模块边界

| 区域             | 预定职责                                     |
| ---------------- | -------------------------------------------- |
| `src/core/`      | Worker/Reviewer 调度、轮次、取消与审查状态   |
| `src/providers/` | 模型适配接口及流式调用实现                   |
| `src/editor/`    | 读取选中上下文，预览并应用用户明确接受的修改 |
| `src/shared/`    | 宿主与 Webview 消息契约及共享类型            |
| `webview/src/`   | 使用 React 展示任务、双栏对话与会话状态      |
| `resources/`     | 后续扩展图标和随包分发的静态资源             |

这些区域目前是占位目录。未来的模型调用和编辑器访问放在扩展宿主，Webview 负责界面呈现与用户意图输入。

## 预期流程

```text
任务输入 → 扩展宿主 → Worker → Reviewer
                        ↑        │
                        └─ 修复 ─┘
                                 ↓
                           审查通过 → 用户确认 → 应用
```

宿主维护会话状态，并将更新流式传到双栏界面。暂停、停止、错误处理、最大轮次和人工介入功能在设计通过后逐步实现。Reviewer 审查通过与用户决定应用代码是两个不同步骤。

首版界面采用一个编辑器标签页内左右分栏，窗口较窄时上下排列。下一阶段参考[界面设计](./design.md)和[通信协议草案](./protocol.md)。
