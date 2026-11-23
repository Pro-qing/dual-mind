# v0.0.5 designs / v0.0.5 设计稿

[Version index / 版本索引](../README.md) · [English guide](../../en/design.md) · [中文说明](../../zh/design.md)

Scenes 24–27 were approved November 22, 2026. The sidebar was first validated in a local 0.0.4 candidate; the November 23 version decision assigns this change to 0.0.5 and tag `v0.0.5`. / 场景 24–27 于 2026-11-22 审核通过，侧栏首次验证使用本地 0.0.4 候选包；2026-11-23 按版本决定归入 0.0.5 及标签 `v0.0.5`。

Scenes 24–27 remain approved static references with their original filenames, artwork and historical labels. SVG and PNG stay together. / 场景 24–27 仍为已审核静态参考，保留文件名、原图及历史标签，SVG 与 PNG 同目录配对。

**Fourteen pairs: all approved for implementation.** Scenes 28–29 document the compact-list changes recorded November 23, 2026 and now committed locally; they follow and are not included in the existing `v0.0.5` tag. See the [English proposal](../../en/task-home-compact-proposal.md) / [中文提案](../../zh/task-home-compact-proposal.md).

**共 14 组：均已确认实施。** 场景 28–29 对应 2026-11-23 记录并已在本地提交的紧凑列表修改，晚于现有 `v0.0.5` 标签，未包含在该标签中。

| Scene / 场景                                        | Editable source / 源文件                               | Preview / 预览                                         |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| 24. Primary sidebar / 主侧栏                        | [SVG](./dual-mind-sidebar-left-proposal.svg)           | [PNG](./dual-mind-sidebar-left-proposal.png)           |
| 25. Secondary sidebar / 辅助侧栏                    | [SVG](./dual-mind-sidebar-right-proposal.svg)          | [PNG](./dual-mind-sidebar-right-proposal.png)          |
| 26. Sidebar widths / 侧栏宽度                       | [SVG](./dual-mind-sidebar-widths-proposal.svg)         | [PNG](./dual-mind-sidebar-widths-proposal.png)         |
| 27. Forms and evidence / 表单与证据                 | [SVG](./dual-mind-sidebar-forms-proposal.svg)          | [PNG](./dual-mind-sidebar-forms-proposal.png)          |
| 28. Compact task home / 紧凑任务主页（已审核）      | [SVG](./dual-mind-task-home-compact-proposal.svg)      | [PNG](./dual-mind-task-home-compact-proposal.png)      |
| 29. Task-list interactions / 任务列表交互（已审核） | [SVG](./dual-mind-task-home-interactions-proposal.svg) | [PNG](./dual-mind-task-home-interactions-proposal.png) |

Scenes 28–34 were approved and integrated on November 23, 2026; host and UI behavior: [English](../../en/task-lifecycle.md) / [中文](../../zh/task-lifecycle.md). / 场景 28–34 本轮已审核并接入，新增 35–37 按确认方案一并实施。

| Scene / 场景                                                          | Source / 源文件                                      | Preview / 预览                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| 30. Worktree base selection / 工作树与基点选择（已审核）              | [SVG](./dual-mind-workspace-base-proposal.svg)       | [PNG](./dual-mind-workspace-base-proposal.png)       |
| 31. Context budgeting and compaction / 上下文预算与自动整理（已审核） | [SVG](./dual-mind-context-compaction-proposal.svg)   | [PNG](./dual-mind-context-compaction-proposal.png)   |
| 32. Commit and merge artifacts / 成果提交与合入（已审核）             | [SVG](./dual-mind-artifact-integration-proposal.svg) | [PNG](./dual-mind-artifact-integration-proposal.png) |
| 33. Merge conflicts / 合并冲突处理（已审核）                          | [SVG](./dual-mind-merge-conflicts-proposal.svg)      | [PNG](./dual-mind-merge-conflicts-proposal.png)      |
| 34. Cleanup and artifact restoration / 工作树清理与成果恢复（已审核） | [SVG](./dual-mind-workspace-cleanup-proposal.svg)    | [PNG](./dual-mind-workspace-cleanup-proposal.png)    |

| Scene / 场景                                                   | Source / 源文件                                   | Preview / 预览                                    |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| 35. Tool and command outcomes / 工具调用与命令结果             | [SVG](./dual-mind-tool-results-proposal.svg)      | [PNG](./dual-mind-tool-results-proposal.png)      |
| 36. Repeated-error pause and continuation / 重复错误暂停与继续 | [SVG](./dual-mind-tool-pause-proposal.svg)        | [PNG](./dual-mind-tool-pause-proposal.png)        |
| 37. Historical failures and acceptance / 历史失败与当前验收    | [SVG](./dual-mind-acceptance-errors-proposal.svg) | [PNG](./dual-mind-acceptance-errors-proposal.png) |

## Local commit provenance / 本地提交归属

| Scenes / 场景 | Local source / 本地源码                                    |
| ------------- | ---------------------------------------------------------- |
| 24–27         | Original `v0.0.5` tag at `e4ae328` / 原标签                |
| 28–29         | `6cdcd94` compact task home / 紧凑任务主页                 |
| 30–37         | `2ee08bc` lifecycle and tool recovery / 生命周期与工具恢复 |

These later commits do not move the original tag or change historical artwork. Existing VSIX candidates were built before this Git archive; their original hashes and validation records remain unchanged. / 后续提交不移动原标签或改写历史图稿。既有 VSIX 候选来自本次 Git 归档之前，原哈希与验证记录保持不变。
