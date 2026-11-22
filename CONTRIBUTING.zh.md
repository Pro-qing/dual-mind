# 贡献指南

[English](./CONTRIBUTING.md) · [项目首页](./README.zh.md)

DualMind 的本地 React 工作台现已提供 GitHub 预览版，请先阅读[开发指南](./docs/zh/development.md)、[架构说明](./docs/zh/architecture.md)和[路线图](./docs/zh/roadmap.md)。

## 提交修改

1. 新功能或较大变更先通过 Issue 对齐范围，可使用双语模板。
2. 通过 nvm 和 `.nvmrc` 选择环境，使用 `npm ci` 安装依赖，让修改聚焦于约定任务。
3. 修改代码后必须检索并核对全仓库相关文档，在同一变更中同步受影响的中英文说明；文档核对是完成条件。按[文档同步流程](./docs/zh/development.md#代码与文档同步)检查描述、示例、限制、状态及交叉引用，并明确标注规划中的功能。
4. 每次代码修改都必须追加中英文开发日志，记录变更内容、文档检索与核对范围、实际更新以及验证结果和未运行项。即使正文无需更新，也必须记录核对结果及原因，不能以“无文档影响”跳过检索或日志。
5. 修改运行逻辑或构建行为时执行 `npm run check`、相关扩展宿主测试及 `npm run package`。纯文档修改执行 `npm run docs:check`、`npm run format:check` 和 `git diff --check`，并人工核对文档含义与当前实现。
6. 新的 Git commit 必须使用英文和简体中文双语说明；标题采用 `type(scope): English summary / 中文摘要`（scope 可省略），正文如有也须双语对应，涵盖变更原因、行为及实际验证。具体格式见[Git 提交信息](./docs/zh/development.md#git-提交信息)。
7. PR 说明问题、修改后的行为、文档核对结果、双语开发日志链接及验证结果；提议界面调整时附上 SVG 修订。

现有 27 组[界面设计](./docs/zh/design.md)已审核通过并保留。后续界面变更应提供更新后的 SVG 提案，明确审核通过后再实现。预留目录只在实际功能需要时加入代码。

请遵守[行为准则](./CODE_OF_CONDUCT.zh.md)，敏感问题按[安全说明](./SECURITY.zh.md)处理。不要在 Issue、提交、示例或截图中放入凭据。

## 许可和联系

项目采用 [MIT 许可证](./LICENSE)，详见[许可说明](./docs/zh/licensing.md)。当前不要求 CLA 或所有权转让。常规协作使用仓库 Issue 和 PR。安全报告使用[安全说明](./SECURITY.zh.md)中已验证的 GitHub 私密渠道；独立维护者私密联系方式仍为**尚未配置**。

恢复界面新增场景 21–23 已于 2026-11-22 [审核通过](./docs/zh/recovery-proposal.md)并接入开发源码。

[原生侧栏工作台](./docs/zh/sidebar-workbench-proposal.md)场景 24–27 已于 **2026-11-22 审核通过**，2026-11-23 接入源码。完整工作台由主侧栏或辅助侧栏承载，提供紧凑导航、可折叠任务详情和手动“终端仅占编辑器区域”操作。旧页签仅用于迁移；现有 27 组审核记录和历史设计保留。

设计稿放入 `docs/design/v<主版本>.<次版本>.<修订号>/`，保留 SVG／PNG 配对及每版 README，并同步[版本索引](./docs/design/README.md)和中英文提案链接。目录迁移不改变已批准图稿或旧标签；视觉修订仍按上述审核规则执行。
