# 许可说明

[English](../en/licensing.md) · [文档索引](./README.md)

DualMind 采用 **MIT 许可证**，版权声明为 `Copyright (c) 2026 Pro-qing`。完整条款以根目录 [LICENSE](../../LICENSE) 为准，该文件随 VSIX 一同分发。

包清单使用 `"license": "MIT"`。保留的 `"private": true` 用于防止 npm 发布，不改变许可证，也不妨碍通过 GitHub Releases 分发 VSIX。打包现在正常检查许可证，不再跳过缺失许可证检查。

依赖保留各自的版权及许可条款。React、React DOM 和 Scheduler 随 Webview 构建分发，完整声明保留在 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)，生成的 JavaScript 也保留许可注释。开发工具不打入 VSIX。

贡献遵循仓库的 MIT 许可证，不要求额外 CLA 或版权转让。参见[贡献指南](../../CONTRIBUTING.zh.md)及[打包与发布](./releasing.md)。

## 内置常用命令

Linux x64 的 `rg`、`fd`、`jq` 随 VSIX 离线提供；系统优先，仅追加任务进程 PATH。构建前显式运行 `npm run tools:fetch`，缓存完整后构建可离线进行。版本、失败行为、许可与验证见 [内置常用命令](./bundled-tools.md)。
