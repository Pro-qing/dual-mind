# DualMind 0.0.1 Preview 1

[English](../en/release-notes.md) · [文档索引](./README.md)

**发布标签：** `v0.0.1-preview.1` · **扩展版本：** `0.0.1` · **许可：** [MIT](../../LICENSE)

**实际公开时间：**2026-11-18 10:41:36 UTC+08:00（Asia/Hong_Kong）。版本附件见 [GitHub Release](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.1)，标签指向准备提交 `af9ff3d91e5a31eb313c32563e9c633e26f68515`；本文的公开记录在确认发布后补充。

## 包含内容

- 单个 React 工作台标签、自适应 Worker／Reviewer 双栏，以及工作区草稿创建、选择、编辑和确认删除。
- 本地 OpenAI 兼容连接元信息，以及两个智能体各自的模型默认值；API 密钥通过原生密码框录入，由 VS Code 保存。
- Bug、Feature、Review、Refactor 四类 Reviewer 预设，独立的中英文指令、自定义角色及任务级指令快照；Worker 保持固定职责。
- 持久化语言选择（`auto`、`zh-CN`、`en`）、界面与错误本地化，以及保留原文的自定义内容。
- 隔离的只读示例视图；本地数据在重开／重载后保留，任务列表按工作区隔离。
- 五组已审核 SVG／PNG、双语指南、MIT 许可证及随包第三方声明。

## 当前限制

这是早期本地工作台预览版。真实模型请求、连接测试、流式对话、并行执行、审查循环、反馈提交、暂停／停止、编辑器上下文读取及代码应用尚未实现，对应执行控件禁用。示例中的运行状态只用于展示，不执行智能体。

扩展标识仍为 `dual-mind-dev-placeholder.dual-mind`。本预览版通过 GitHub 分发，Marketplace 发布身份配置留待后续阶段。

## 环境与安装

支持基线为 **Ubuntu 20.04+、x86_64/amd64 和 VS Code 1.100.0+**。其他平台和 ARM64 暂未验证。安装 VSIX 无需另行安装 Node.js；源码开发使用 nvm 管理的 Node.js 24。

从 Release 附件下载 `dual-mind-0.0.1.vsix` 和 `SHA256SUMS.txt`，放在同一目录后执行：

```bash
sha256sum --check SHA256SUMS.txt
code --install-extension dual-mind-0.0.1.vsix --force
```

重载 VS Code，运行 **DualMind: 打开工作台**（英文编辑器为 **DualMind: Open Workbench**）。保存草稿前先打开文件夹，设置页可切换语言。配置和更新细节见[使用说明](./usage.md)。

## 验证

本地工作台基线已通过 21 项环境测试、21 项存储／React 交互测试、类型／lint／格式检查、双语文档链接及五组设计文件检查。扩展宿主测试在 VS Code 1.100.0 和 stable 上验证实际 React 渲染、单例标签及关闭后重开。真实 Webview 测试覆盖语言切换、角色快照、重载持久化、工作区隔离和宽／窄窗口截图。

发布准备已重跑检查，标签对应提交的三组 CI 全部通过。本地扩展宿主测试在 VS Code 1.100.0 和 stable 1.146.0 上通过。MIT 许可 VSIX 在公开前已独立安装验证；公开后，无需登录重新下载两个附件，SHA-256 均与原文件一致，下载的 VSIX 在 VS Code 1.100.0 上通过工作台打开、语言切换、任务保存和重载持久化验证。

VSIX SHA-256：`a28641501de5f54dbd4dc19f5d6670525191c105a83d87986b0fd8f13800bdd0`。[对应提交的 CI](https://github.com/Pro-qing/dual-mind/actions/runs/44224284575) 和 GitHub 发布正文记录了验证结果。

## 反馈与许可

普通问题和功能建议使用仓库 Issue，安全漏洞按[安全说明](../../SECURITY.zh.md)私密报告。预览版本不承诺支持期限或响应时限。

DualMind 采用 MIT 许可证，版权署名 `2026 Pro-qing`。随包 React 相关许可保留在 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)。
