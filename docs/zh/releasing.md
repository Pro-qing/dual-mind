# 打包、Marketplace 上传与 GitHub 预览发布

[English](../en/releasing.md) · [文档索引](./README.md)

## Preview 2 标识

| 项目                | 值                                                 |
| ------------------- | -------------------------------------------------- |
| Publisher／扩展标识 | `Pro-qing`／`Pro-qing.dual-mind`                   |
| 扩展版本            | `0.0.1`                                            |
| 商店标记／通道      | `preview: true`／普通 VSIX，不使用 `--pre-release` |
| 图标                | `resources/icon.png`，256 × 256 PNG                |
| Git 标签／标题      | `v0.0.1-preview.2`／`DualMind 0.0.1 Preview 2`     |
| GitHub 发布类型     | 预发布                                             |
| 附件                | `dual-mind-0.0.1.vsix`、`SHA256SUMS.txt`           |
| 许可                | MIT，版权署名 `2026 Pro-qing`                      |

所有者提供的已注册 Publisher ID 为 `Pro-qing`。本包用于首次 Marketplace 上传；**所有者完成上传且 Marketplace 确认公开前，商店状态仍为待上架**。VSIX 的 Preview 标记和 GitHub 预发布标记，都独立于 Marketplace 的预发布通道。

本次扩展版本按约定保持 `0.0.1`，publisher 变更会产生新扩展身份。Preview 1 的开发身份、标签、附件及[发布说明](./release-notes.md)作为历史保留。[Preview 2 说明](./release-notes-preview-2.md)和[使用指南](./usage.md)描述切换方式：先停用旧扩展，保留旧数据，在新身份下重新配置，不自动迁移。`private: true` 继续用于防止 npm 发布。

## 图标与打包输入

原始 1408 × 768 JPEG 原样归档至 `resources/branding/dual-mind.jpeg`。随包 PNG 使用中央裁剪区域 `(320, 0, 1088, 768)`，以 Lanczos 缩小为 256 × 256，不拉伸图案。`.vscodeignore` 放行 `resources/icon.png`，排除源 JPEG 及其他资源维护文件。已审核 SVG／PNG 界面设计继续随包保留。

## 准备与验证

使用[环境基线](./environment.md)：Ubuntu 20.04+ amd64、VS Code 1.100.0+、nvm 管理的 Node.js 24。在仓库根目录执行：

```bash
nvm use
npm ci
npm run check
VSCODE_TEST_VERSION=1.100.0 npm test
VSCODE_TEST_VERSION=stable npm test
DUAL_MIND_RELEASE_REF=v0.0.1-preview.2 npm run package
(cd release && sha256sum dual-mind-0.0.1.vsix > SHA256SUMS.txt)
(cd release && sha256sum --check SHA256SUMS.txt)
```

无桌面测试需要文档列明的 Electron 运行库、Xvfb 和 xauth，并给编辑器测试加 `xvfb-run -a` 前缀。运行逻辑／界面修改还需执行 `npm run test:ui`。打包会重建宿主及前端，`DUAL_MIND_RELEASE_REF` 将包内 README／更新日志链接固定到新标签，不要把新包指向 Preview 1 标签。

检查 VSIX 清单中的 Publisher `Pro-qing`、ID `dual-mind`、版本 `0.0.1`、Preview 标记和 PNG 图标资源，确认没有 Marketplace 预发布通道标记。检查 MIT 许可、第三方声明、双语元信息／文档、宿主／前端及五组 SVG／PNG；源 JPEG、开发源码、测试、凭据和 source map 不应出现。

在隔离用户配置／扩展目录中安装包，验证原生扩展图标、身份、工作台、两种语言、草稿保存及重载恢复。测试时不要在同一配置中同时启用旧／新两个身份。

## GitHub Preview 2 发布

1. 核对后创建 `chore: prepare Pro-qing marketplace package` 提交并推送 `master`。构建产物、截图、VSIX 和校验文件继续由 Git 忽略。
2. 等待该精确提交的 CI 全部通过：Ubuntu 20.04 上 VS Code 1.100.0／stable，以及 Ubuntu 24.04 stable。Ubuntu 20.04 stable 还验证真实 Webview 和打包。
3. 新建 Release 草稿，`v0.0.1-preview.2` 指向该提交，标题为 `DualMind 0.0.1 Preview 2`，设置 `prerelease: true`，不设为 latest。不移动或替换 `v0.0.1-preview.1` 及附件。
4. 填入双语说明，包含 publisher 切换、图标、保持 `0.0.1`、重新配置、功能／限制、验证及 SHA-256，上传同次构建的 VSIX 与 `SHA256SUMS.txt`。
5. 核对草稿目标、标记、正文及附件哈希，再公开发布；确认成功后记录返回的 URL 和实际 `published_at`。
6. 将两个公开附件重新下载到新目录，核对与本地文件相同，再隔离安装验证下载包。提交、摘要和安装结果保存在被忽略的发布目录。

网页流程见 [GitHub 发布文档](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。API 凭据不得写入源码或暴露在命令参数中。

## 所有者首次上传 Marketplace

使用已验证的同一份 Preview 2 VSIX，避免不必要的重新构建导致附件不同。

1. 用拥有 **Pro-qing** 的账号登录 [Publisher 管理页](https://marketplace.visualstudio.com/manage)。
2. 在 **Pro-qing** 下选择 **New extension → Visual Studio Code**，上传 `dual-mind-0.0.1.vsix`。
3. 核对 publisher、名称、`0.0.1`、图标、Preview 标记、MIT 许可及商店介绍，明确保留当前模型执行限制。
4. 等待 Marketplace 验证及公开完成，只有 listing 已公开后才把仓库状态改为已上架。确认标识为 `Pro-qing.dual-mind`。
5. 在 VS Code 停用旧开发身份，扩展面板搜索 `@id:Pro-qing.dual-mind`，安装并验证工作台和语言选择。

官方参考：[扩展发布](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)和[扩展清单](https://code.visualstudio.com/api/references/extension-manifest)。GitHub Release 和 `preview: true` 不会执行 Marketplace 上传，本轮不添加 Marketplace 令牌或自动发布任务。

## 后续同步更新

`Pro-qing.dual-mind` 的 `0.0.1` 在 Marketplace 发布后，同一 ID 后续更新需要更高版本。本次版本不变仅适用于新身份的首次发布。更新包清单／锁文件版本及双语日志，完成检查和 CI 后只构建一次，将同一产物分发到 GitHub 和 Marketplace。保留历史标签和附件，分别记录两端实际公开状态，不因一端成功就声称另一端已同步。
