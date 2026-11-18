# 更新日志

[English](./CHANGELOG.md) · [项目首页](./README.zh.md)

## 0.0.1 — Preview 2

GitHub 已于 2026-11-18（11:24:18，UTC+08:00）公开发布。[预览版 `v0.0.1-preview.2`](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) 对应提交 `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`。[Marketplace](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) 已于 2026-11-18（11:31:39，UTC+08:00）公开 `Pro-qing.dual-mind` 版本 `0.0.1`，其带有 Preview 标记的公开页面已单独核验。

- Publisher 改为 `Pro-qing`，扩展标识为 `Pro-qing.dual-mind`；保留 `0.0.1`，添加 `preview: true`。
- 从所有者提供的 JPEG 中央图案生成 256 × 256 PNG 图标，原图原样归档，VSIX 仅打包图标。
- 更新扩展宿主身份检查及双语切换／上传说明；新身份下重新配置，不迁移或删除旧数据。
- 通过 GitHub Preview 2 分发普通 VSIX，并在 Marketplace 上架 `Pro-qing.dual-mind`；保留 Preview 1 标签／附件和全部已审核设计稿。
- 本地工作台功能及执行能力限制保持原状，详见 [Preview 2 发布说明](./docs/zh/release-notes-preview-2.md)。

## 0.0.1 — Preview 1

已于 2026-11-18（10:41:36，UTC+08:00）公开发布。[GitHub 预览版 `v0.0.1-preview.1`](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.1) 对应提交 `af9ff3d91e5a31eb313c32563e9c633e26f68515`。

- 实现 React 工作台，提供工作区级草稿、连接设置、原生 API 密钥录入、Reviewer 预设及角色指令快照。
- 添加持久化中英文选择、可独立编辑的内置双语定义，以及保留原文的自定义内容。
- 添加隔离的只读示例，真实模型执行、连接测试、流式输出、审查循环及代码应用仍不可用。
- 提供插件入口、F5 调试、esbuild 宿主／前端构建、nvm 管理的 Node.js 24，以及 Ubuntu 20.04+ amd64 验证；最低编辑器版本为 VS Code 1.100.0。
- 添加环境测试、本地存储／React 测试、真实扩展宿主／界面检查、双语文档、贡献模板及 GitHub Actions 验证。
- 完整保留五组已审核 SVG／PNG，明确区分图中的执行状态与当前本地工作台能力。
- 采用 MIT，版权署名 `2026 Pro-qing`，保留随包第三方声明，移除缺失许可证跳过设置，并准备 VSIX／校验附件。
- 根据已实现的 Webview 及凭据存储更新安全说明，启用并验证 GitHub 私密漏洞报告。

完整范围、安装、限制与验证见[发布说明](./docs/zh/release-notes.md)。在 Preview 1 发布时，Marketplace 注册及真实模型协作仍属于后续里程碑。
