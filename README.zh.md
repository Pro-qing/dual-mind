[English](./README.md) | **简体中文**

# 🧠 DualMind

**双脑协同，胜过单兵作战。**

DualMind 是一个面向 VS Code 的 AI 结对编程插件项目，将任务准备、代码实现和独立审查带入同一个工作区，让需求到已审查修改的过程清晰可见。

## 项目状态

**当前源码 0.0.5 · 本地版本记录 · 尚未发布**

React 工作台支持本地任务、连接设置、Reviewer 预设和中英文切换。0.0.5 已提供独立角色历史、Worker 执行、Reviewer 独立探查与验证和活动栏入口；任务可使用专用 worktree 或直接修改选定本地分支，将专用目录成果应用回原工作区仍待实现，可选示例继续保持只读。

历史发布记录：0.0.1 已于 2026-11-18 上架 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind)，扩展标识为 **Pro-qing.dual-mind**，版本为 **0.0.1**，带有 Preview 标记。[GitHub Preview 2](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) 同日发布。[发布说明](./docs/zh/release-notes-preview-2.md)。

[0.0.5 版本说明](./docs/zh/release-notes-0.0.5.md)记录本次源码能力与验证；[更新日志](./CHANGELOG.zh.md)区分本地版本和历史公开制品。

## 两种互补角色

- **Worker（执行者）：** 保持通用执行职责，按 Reviewer 下发的方案准备环境、实施和验证，提交成果验收。
- **Reviewer（审查者）：** 根据需求与相关项目内容制定执行方案，验收 Worker 成果；未通过时下发下一轮方案。可选择 Bug、Feature、Review、Refactor 或自定义审查侧重点。每个任务保留角色指令快照。

任务执行流程为 **需求 → Reviewer 方案 → Worker 实施 → Reviewer 验收 → 通过或下一轮方案**。开发者可以介入引导，并决定是否应用经过审查的结果。

## 当前本地能力

- **任务工作台：** 主页管理工作区任务，创建后进入独立详情并手动开始；详情使用用户右侧、AI 左侧的聊天布局和独立证据面板。
- **连接设置：** 保存 OpenAI 兼容接口与两个智能体的独立模型默认值，由 VS Code 保存 API 密钥。
- **模型查询：** 显式查询候选模型，支持搜索、选择与手动输入；查询只验证列表访问。
- **任务执行：** 在专用 worktree 或选定本地分支中执行 Reviewer 规划、Worker 自主实施与验证、Reviewer 验收和下一轮方案交接，支持流式输出、暂停／继续／停止及差异预览。可从活动栏图标进入。
- **持续追问：** 直接询问结果或继续修改；Reviewer 探查后答复或制定新方案，执行中补充在交接处理，沿用已有目录和未提交成果。
- **Reviewer 预设：** 编辑内置角色的双语指令，或管理保留原文的自定义角色。
- **语言选择：** 跟随 VS Code，或手动选择简体中文／English，不改写已保存的任务内容。
- **示例预览：** 查看预期对话及并行任务外观，不创建记录，也不发送请求。

命令直接在任务目录中运行，无需用户级 systemd/cgroup v2，扩展不设置内存或交换空间配额；保留超时、输出上限、停止和真实证据验收。

## 规划能力

独立并行会话、编辑器上下文自动收集及将专用 worktree 中已审核的成果明确应用回原工作区，仍待后续开发。

## 界面设计

![已审核的 DualMind 并行任务设计参考](./docs/design/v0.0.1/dual-mind-workbench.png)

现有 27 组已审核 SVG／PNG 保留为设计参考：场景 1–7 为原工作台与模型选择，8–11 为任务页面，12–13 为方案与验收循环，14–17 为[任务聊天与持续追问](./docs/zh/task-chat-proposal.md)，18–20 为过程提示和紧凑聊天，21–23 为故障恢复，24–27 为原生侧栏。当前源码已实现单任务执行和聊天；上图保留原工作台设计，图中的并行执行仍待实现。已发布的 0.0.1 制品保持原有行为。[原工作台 SVG](./docs/design/v0.0.1/dual-mind-workbench.svg) · [完整设计稿](./docs/zh/design.md)。

[原生侧栏工作台](./docs/zh/sidebar-workbench-proposal.md)场景 24–27 已于 **2026-11-22 审核通过**，2026-11-23 接入源码。完整工作台由主侧栏或辅助侧栏承载，提供紧凑导航、可折叠任务详情和手动“终端仅占编辑器区域”操作。旧页签仅用于迁移；现有 27 组审核记录和历史设计保留。

## 文档与参与贡献

- [使用说明](./docs/zh/usage.md) — Marketplace／VSIX 安装、工作台、语言设置及限制。
- [开发指南](./docs/zh/development.md) — 环境准备、构建、调试与测试。
- [架构说明](./docs/zh/architecture.md) — 状态归属与模块职责。
- [路线图](./docs/zh/roadmap.md) — 已交付与后续里程碑。
- [贡献指南](./CONTRIBUTING.zh.md) — 参与方式及仓库约定。
- [完整文档索引](./docs/zh/README.md) — 全部指南和仓库规范入口。

## 许可

[MIT 许可证](./LICENSE)。[许可及第三方声明](./docs/zh/licensing.md)。

自动环境继承、shell 选择、证据规则和平台验证状态见[通用 shell 执行与独立验证](./docs/zh/shell-execution.md)。

已审核聊天控件显示当前活动和公开过程，消息缩放仅使用图标，并按任务保留证据最小化偏好。见[聊天修订说明](./docs/zh/chat-progress-proposal.md)。

故障恢复已实现，包括逐操作日志、原角色接续和有限重试；[已审核恢复界面](./docs/zh/recovery-proposal.md)已接入继续执行、角色／阶段提示和重试状态。行为和限制见[恢复说明](./docs/zh/execution-recovery.md)。

[紧凑任务列表](./docs/zh/task-home-compact-proposal.md)：主页仅显示名称与删除，场景 28–29 已审核并实现，设计归档共 29 组。
