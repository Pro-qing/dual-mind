# 文档索引

[English](../en/README.md) · [项目首页](../../README.zh.md)

[工具错误处理与前端统一接入](./tool-errors.md)已实现：结果分层、批次失败跳过、三次重复暂停及完整生命周期页面。

**当前功能：**[工作树、上下文摘要与成果收尾](./task-lifecycle.md)及[工具错误处理](./tool-errors.md)的宿主与前端自 0.0.6 起提供。[场景 30–34](./task-lifecycle-proposal.md)与[场景 35–37](./tool-errors-proposal.md)保留原审核和实现记录。

[紧凑任务列表设计稿](./task-home-compact-proposal.md)：场景 28–29 已审核并实现，记录现已归档于本地 `master` 的主页布局与交互修改。

**当前源码版本：0.0.7 · 本地版本准备，尚未公开发布。** 记录日期：2026-11-24。修复、验证及本地制品见[0.0.7 版本说明](./release-notes-0.0.7.md)。公开发布由维护者单独执行，历史版本记录保留原意。

| 指南                                               | 内容                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| [环境说明](./environment.md)                       | Ubuntu 20.04+ amd64 基线、nvm、系统依赖与验证       |
| [Preview 2 发布说明](./release-notes-preview-2.md) | GitHub／Marketplace 已发布版本、身份切换与验证记录  |
| [使用说明](./usage.md)                             | Marketplace／VSIX 安装、本地工作台、设置及限制      |
| [开发指南](./development.md)                       | nvm、构建命令、调试与测试                           |
| [架构说明](./architecture.md)                      | 已实现工作台、存储边界、品牌资源及模块职责          |
| [宿主／界面协议](./protocol.md)                    | 设置／模型查询、执行消息、角色交接及 Git 绑定       |
| [界面设计](./design.md)                            | 40 组 SVG／PNG：37 已审核、3 待审核                 |
| [路线图](./roadmap.md)                             | 按版本记录进度、已实现执行及剩余能力                |
| [打包与发布](./releasing.md)                       | 历史发布记录及后续 GitHub／Marketplace 版本更新流程 |
| [许可说明](./licensing.md)                         | MIT 许可证及随包第三方声明                          |
| [工具链来源](./toolchain.md)                       | 生成器与初始开发环境版本                            |

仓库规范：[贡献指南](../../CONTRIBUTING.zh.md)、[行为准则](../../CODE_OF_CONDUCT.zh.md)、[安全说明](../../SECURITY.zh.md)和[更新日志](../../CHANGELOG.zh.md)。

历史版本：[Preview 1](./release-notes.md)。

## 设计修订与验证

以下修订均已于 2026-11-20 审核通过并实现；静态设计与实际验证分别记录，旧场景保留为历史参考。

- [任务主页、详情与错误提示](./task-pages-proposal.md)：场景 8–11，独立页面、手动开始与双语错误。
- [双 AI 方案与验收循环](./execution-cycle-proposal.md)：场景 12–13；实际覆盖见[执行循环验证](./execution-cycle-validation.md)。
- [任务聊天与持续追问](./task-chat-proposal.md)：场景 14–17；实际覆盖见[任务聊天验证](./task-chat-validation.md)。

[开发日志](./development-log.md)记录代码与文档核对、设计审核、实现和实际验证。

## 本地源码版本

- [0.0.6](./release-notes-0.0.6.md)：当前完整功能、本机 Python 支持、产品介绍及本地交付记录。
- [0.0.5](./release-notes-0.0.5.md)：此前原生侧栏工作台、版本化设计归档及本地标签。
- [0.0.4](./release-notes-0.0.4.md)：此前本地源码与 VSIX，尚未发布。
- [0.0.3](./release-notes-0.0.3.md)：此前本地源码版本，尚未发布。
- [0.0.2](./release-notes-0.0.2.md)：模型查询、设置和 Git 准备基础。

- [过程提示与紧凑聊天提案](./chat-progress-proposal.md)：已审核并实现：活动状态、公开过程、图标缩放、最小化和任务名分支。

- [故障恢复](./execution-recovery.md)：宿主实现、公开上下文、进程与证据限制。
- [恢复界面提案](./recovery-proposal.md)：场景 21–23，2026-11-22 已审核并接入界面。

- [原生侧栏工作台](./sidebar-workbench-proposal.md)场景 24–27 已于 **2026-11-22 审核通过**，2026-11-23 接入源码。完整工作台由主侧栏或辅助侧栏承载，提供紧凑导航、可折叠任务详情和手动“终端仅占编辑器区域”操作。旧页签仅用于迁移；原有 27 组审核记录和历史设计保留。
- [侧栏验证记录](./sidebar-workbench-validation.md)：真实 VS Code、旧页签迁移、宽度与终端布局验证。

- [工具错误处理](./tool-errors.md)：结果、重复暂停、批次跳过与验收边界。
- [工具错误界面](./tool-errors-proposal.md)：场景 35–37，按本轮确认实施。

- [内置常用命令](./bundled-tools.md): 随包离线命令、系统优先与完整性校验。

- [本机 Python](./local-python.md)：自动发现已有 Python 2.7／3 与项目环境，沿用命令工具执行脚本。
