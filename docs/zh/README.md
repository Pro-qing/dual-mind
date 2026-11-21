# 文档索引

[English](../en/README.md) · [项目首页](../../README.zh.md)

**当前源码版本：0.0.3 · 本地版本记录 · 尚未发布。** 本次记录日期为 2026-11-20；不表示已上传 Marketplace 或创建 GitHub Release。0.0.1 Preview 1／2 的历史发布记录保持原样。详见[0.0.3 版本说明](./release-notes-0.0.3.md)。

| 指南                                               | 内容                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| [环境说明](./environment.md)                       | Ubuntu 20.04+ amd64 基线、nvm、系统依赖与验证       |
| [Preview 2 发布说明](./release-notes-preview-2.md) | GitHub／Marketplace 已发布版本、身份切换与验证记录  |
| [使用说明](./usage.md)                             | Marketplace／VSIX 安装、本地工作台、设置及限制      |
| [开发指南](./development.md)                       | nvm、构建命令、调试与测试                           |
| [架构说明](./architecture.md)                      | 已实现工作台、存储边界、品牌资源及模块职责          |
| [宿主／界面协议](./protocol.md)                    | 设置／模型查询、执行消息、角色交接及 Git 绑定       |
| [界面设计](./design.md)                            | 17 组已审核 SVG／PNG，含任务页面、执行循环与聊天    |
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

- [0.0.3](./release-notes-0.0.3.md)：当前源码版本，尚未发布。
- [0.0.2](./release-notes-0.0.2.md)：模型查询、设置和 Git 准备基础。
