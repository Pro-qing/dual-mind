# 贡献指南

[English](./CONTRIBUTING.md) · [项目首页](./README.zh.md)

DualMind 当前正在准备可用本地 React 工作台的 GitHub 预览版，请先阅读[开发指南](./docs/zh/development.md)、[架构说明](./docs/zh/architecture.md)和[路线图](./docs/zh/roadmap.md)。

## 提交修改

1. 新功能或较大变更先通过 Issue 对齐范围，可使用双语模板。
2. 通过 nvm 和 `.nvmrc` 选择环境，使用 `npm ci` 安装依赖，让修改聚焦于约定任务。
3. 同步维护中英文文档，并明确标注规划中的功能。
4. 修改运行逻辑或构建行为时执行 `npm run check`、相关扩展宿主测试及 `npm run package`。纯文档修改执行检查即可。
5. PR 说明问题、修改后的行为及验证结果；提议界面调整时附上 SVG 修订。

现有五组[界面设计](./docs/zh/design.md)已审核通过并保留。后续界面变更应提供更新后的 SVG 提案，明确审核通过后再实现。预留目录只在实际功能需要时加入代码。

请遵守[行为准则](./CODE_OF_CONDUCT.zh.md)，敏感问题按[安全说明](./SECURITY.zh.md)处理。不要在 Issue、提交、示例或截图中放入凭据。

## 许可和联系

项目采用 [MIT 许可证](./LICENSE)，详见[许可说明](./docs/zh/licensing.md)。当前不要求 CLA 或所有权转让。常规协作使用仓库 Issue 和 PR。安全报告使用[安全说明](./SECURITY.zh.md)中已验证的 GitHub 私密渠道；独立维护者私密联系方式仍为**尚未配置**。
