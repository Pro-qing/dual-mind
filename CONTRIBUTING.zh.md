# 贡献指南

[English](./CONTRIBUTING.md) · [项目首页](./README.zh.md)

DualMind 当前处于骨架阶段，请先阅读[开发指南](./docs/zh/development.md)、[架构说明](./docs/zh/architecture.md)和[路线图](./docs/zh/roadmap.md)。

## 提交修改

1. 新功能或较大变更先通过 Issue 对齐范围，可使用双语模板。
2. 通过 nvm 和 `.nvmrc` 选择环境，使用 `npm ci` 安装依赖，让修改聚焦于约定任务。
3. 同步维护中英文文档，并明确标注规划中的功能。
4. 修改运行逻辑或构建行为时执行 `npm run check`、相关扩展宿主测试及 `npm run package`。纯文档修改执行检查即可。
5. PR 说明问题、修改后的行为及验证结果；提议界面调整时附上 SVG 修订。

界面需[明确审核通过](./docs/zh/design.md)后实现；接受仓库骨架不等于接受 React 界面。预留目录只在实际功能需要时加入代码。

请遵守[行为准则](./CODE_OF_CONDUCT.zh.md)，敏感问题按[安全说明](./SECURITY.zh.md)处理。不要在 Issue、提交、示例或截图中放入凭据。

## 许可和联系

项目许可尚未决定，贡献较大代码前请阅读[许可状态](./docs/zh/licensing.md)。当前不要求 CLA 或所有权转让。常规协作使用仓库 Issue 和 PR。私密维护者联系方式为 **TODO：由所有者配置**。
