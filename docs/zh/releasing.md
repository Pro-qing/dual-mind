# 本地打包与发布准备

[English](../en/releasing.md) · [文档索引](./README.md)

## 本地 VSIX

遵循统一的[环境基线](./environment.md)：Ubuntu 20.04+、x86_64/amd64、VS Code 1.100.0+；构建和打包使用 nvm 管理的 Node.js 24。无桌面测试需安装文档所列的 Electron 运行库、Xvfb 和 xauth，并将下方的 `npm test` 替换为 `xvfb-run -a npm test`。

```bash
nvm use
npm ci
npm run check
npm test
npm run package
code --install-extension release/dual-mind-0.0.1.vsix
```

重载 VS Code 后运行 **DualMind: Show Status**。打包产物被 Git 忽略。打包通过 `vscode:prepublish` 重新构建，排除开发文件、依赖、测试编辑器、source map 和已有 VSIX；文档及 SVG 随包保留。

由于许可证待定，打包脚本暂时使用 `skipLicense: true`，只生成本地文件，不进行发布。npm 的 `private` 标记阻止 npm 发布，并不是 Marketplace 发布保护机制。

## 公开分发前

- 选定许可证，添加完整文本，同步双语文档和元信息，移除打包中的 `skipLicense`。
- 将 `dual-mind-dev-placeholder` 替换为已验证的 Marketplace publisher，同时更新冒烟测试中的扩展标识。
- 准备正式图标，检查包内容和依赖许可要求。
- 配置私密安全报告及联系渠道，替换仓库规范中待补充的内容。
- 核对 README 功能描述、发布版本、双语更新日志，并在支持的编辑器版本中验证安装包。
- 实现界面前取得设计认可，对外准确说明实际完成状态。

本骨架不配置发布工作流、Marketplace 令牌、GitHub Release 或仓库推送。CI 仅产生临时的本地验证产物。正式发布作为单独的所有者授权操作处理。
