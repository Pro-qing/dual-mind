# DualMind 0.0.1 Preview 2

[English](../en/release-notes-preview-2.md) · [文档索引](./README.md)

**Git 标签：** `v0.0.1-preview.2` · **扩展版本：** `0.0.1` · **Publisher：** `Pro-qing` · **扩展标识：** `Pro-qing.dual-mind` · **许可：** [MIT](../../LICENSE)

**实际公开时间：**2026-11-18 11:24:18 UTC+08:00（Asia/Hong_Kong）。[GitHub Release](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) 提供已核验的 VSIX 和校验文件，标签对应提交 `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`。**Marketplace 状态：待手动上传上架。** GitHub 发布不会自动让扩展出现在 VS Code 搜索结果中。

## 相对 Preview 1 的变化

- 将开发占位发布者改为所有者提供的已注册 ID `Pro-qing`。首次使用该 Marketplace 身份，扩展版本保持 `0.0.1`。
- 添加 [256 × 256 PNG 图标](../../resources/icon.png)。提供的 JPEG 原样归档到 Git；图标从中央裁取 768 × 768 后等比例缩小，VSIX 仅包含 PNG。
- 使用 `preview: true` 显示商店预览标记。本次生成**普通 VSIX**，不使用 Marketplace 预发布通道的 `--pre-release` 构建参数。独立的 GitHub Release 标记为预发布。
- 同步扩展宿主身份检查、双语安装／发布指南及当前文档导航。
- 保留五组已审核 SVG／PNG 界面设计、MIT 许可证及第三方声明。

[Preview 1 发布说明](./release-notes.md)、旧标签、公开 VSIX 和校验文件继续作为历史记录保留。Preview 2 使用新的标签与附件，不替换 Preview 1，即使两者扩展清单都使用 `0.0.1`。

## 从开发身份切换

`dual-mind-dev-placeholder.dual-mind` 与 `Pro-qing.dual-mind` 是两个不同扩展。使用新版本前，在扩展列表中找到旧标识并**停用**，重载 VS Code，避免重复命令。如果需要保留旧数据，可继续保留旧扩展安装。

本轮不提供自动迁移。请在 `Pro-qing.dual-mind` 下重新创建草稿，配置连接、密钥、模型默认值和自定义角色。新包不会删除或读取旧扩展数据。用户设置 `dualMind.language` 保持同一键名，可以继续生效。`--force` 不代表跨 publisher 数据迁移。

## 功能与限制

本地 React 工作台支持工作区草稿、连接元信息、通过 VS Code 秘密存储进行原生密钥录入、四类双语内置 Reviewer 定义、保留原文的自定义角色、任务快照、语言选择和隔离的只读示例。Worker 保持固定执行职责。

真实模型请求、连接测试、流式输出、并行执行、自动审查、反馈提交、暂停／停止、编辑器上下文读取及代码应用仍未实现。对应控件禁用，示例不执行智能体。

## 环境与安装

支持基线：**Ubuntu 20.04+、x86_64/amd64 和 VS Code 1.100.0+**。其他平台及 ARM64 暂未验证。使用 VSIX 无需独立安装 Node.js；源码开发使用 nvm 管理的 Node.js 24。

从 **Preview 2** 下载 `dual-mind-0.0.1.vsix` 和 `SHA256SUMS.txt`，放在同一目录后校验并安装：

```bash
sha256sum --check SHA256SUMS.txt
code --install-extension dual-mind-0.0.1.vsix --force
```

重载 VS Code，执行 **DualMind: 打开工作台**（英文界面为 **DualMind: Open Workbench**），确认安装标识为 `Pro-qing.dual-mind`。创建草稿前先打开文件夹，切换及后续商店安装见[使用说明](./usage.md)。

## Marketplace 上传

所有者可在 [Publisher 管理页](https://marketplace.visualstudio.com/manage)选择 **Pro-qing → New extension → Visual Studio Code**，上传本次同一份 VSIX。核对图标、publisher、版本和预览标记，等待服务端验证并公开。这一步手动完成，GitHub 发布不会自动上架 Marketplace。公开后可在 VS Code 搜索 `@id:Pro-qing.dual-mind`。详见[打包与发布](./releasing.md)。

## 验证与记录

发布准备已通过元信息与 256 × 256 PNG 检查、包内文件／排除检查、21 项环境测试、21 项本地存储／React 测试、类型、lint、格式和双语文档链接。扩展宿主测试在 VS Code 1.100.0 及 stable 1.146.0 上通过，发布提交的三组 CI 全部成功。准备包和独立下载的公开 VSIX 均在 VS Code 1.100.0 隔离安装中通过原生图标、发布者／版本、工作台、语言切换、草稿保存及重载持久化验证；公开附件哈希与准备文件一致。

VSIX SHA-256：`c219356f3e253102f3b779012e49dd0f4e586d02d00e22a95a7d3f50074ce848`。[发布提交的 CI](https://github.com/Pro-qing/dual-mind/actions/runs/44229630530) 及 GitHub 正文记录验证证据和实际公开时间。安全问题使用[安全说明](../../SECURITY.zh.md)中的私密渠道，普通反馈使用仓库 Issue。
