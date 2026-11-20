# 打包与双端同步发布

[English](../en/releasing.md) · [文档索引](./README.md)

**当前源码版本：0.0.3 · 本地版本记录 · 尚未发布。** 本次记录日期为 2026-11-20；不表示已上传 Marketplace 或创建 GitHub Release。0.0.1 Preview 1／2 的历史发布记录保持原样。详见[0.0.3 版本说明](./release-notes-0.0.3.md)。

## 0.0.1 历史发布记录

| 项目                | 值                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Publisher／扩展标识 | `Pro-qing`／`Pro-qing.dual-mind`                                                               |
| 扩展版本            | `0.0.1`                                                                                        |
| Marketplace         | [已于 2026-11-18 公开](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) |
| 商店标记／通道      | `preview: true`／普通 VSIX，不使用 `--pre-release`                                             |
| 图标                | `resources/icon.png`，256 × 256 PNG                                                            |
| Git 标签／标题      | `v0.0.1-preview.2`／`DualMind 0.0.1 Preview 2`                                                 |
| GitHub 发布类型     | 预发布，已于 2026-11-18 公开                                                                   |
| 附件                | `dual-mind-0.0.1.vsix`、`SHA256SUMS.txt`                                                       |
| 许可                | MIT，版权署名 `2026 Pro-qing`                                                                  |

表中描述的是 0.0.1 的历史制品能力；当前源码能力见本页顶部链接。Preview 标记、Marketplace 预发布通道和 GitHub 预发布标记相互独立。`private: true` 继续用于防止 npm 发布。

## Preview 2 首次发布：历史记录

- GitHub 已于 **2026-11-18 11:24:18 UTC+08:00** 公开 [Preview 2](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2)，标签对应提交 `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`。验证结果及公开 VSIX 校验值保留在 [Preview 2 说明](./release-notes-preview-2.md)中。
- Marketplace 已于 **2026-11-18 11:31:39 UTC+08:00** 公开 `Pro-qing.dual-mind` 版本 `0.0.1`。**New extension → Visual Studio Code** 流程用于该发布者的首次上传，后续版本通过已有扩展条目更新。
- Preview 1 使用另一发布者身份。保持扩展版本 `0.0.1` 仅适用于新身份的首次发布。Preview 1 的[发布说明](./release-notes.md)、标签、附件和已有用户数据继续保留。[使用说明](./usage.md)介绍如何停用旧身份并重新配置新身份，当前不提供自动迁移。

两个预览版均已发布，保留其标签及附件。下述流程使用新的扩展版本和新标签。

## 图标与打包输入

原始 1408 × 768 JPEG 原样归档至 `resources/branding/dual-mind.jpeg`。随包 PNG 使用中央裁剪区域 `(320, 0, 1088, 768)`，以 Lanczos 缩小为 256 × 256，不拉伸图案。`.vscodeignore` 放行 `resources/icon.png`，排除源 JPEG 及其他资源维护文件。已审核 SVG／PNG 界面设计继续随包保留。

## 准备下一版本

1. 选择高于 `Pro-qing.dual-mind` 已上架版本的扩展版本，更新 `package.json`、`package-lock.json`、双语更新日志和发布说明，并确定与该版本对应的未使用发布标签。公开前保持“准备中”表述，发布日期和验证结果以实际记录为准。
2. 使用[环境基线](./environment.md)：Ubuntu 20.04+ amd64、VS Code 1.100.0+、nvm 管理的 Node.js 24，执行下方检查。运行逻辑／界面修改还需执行 `npm run test:ui`。
3. 检查差异，创建发布准备提交并推送 `master`，等待该精确提交的 CI 全部通过：Ubuntu 20.04 上 VS Code 1.100.0／stable，以及 Ubuntu 24.04 stable。Ubuntu 20.04 stable 还验证真实 Webview 和打包。
4. 创建并推送指向该已验证提交的新标签，从此标签的干净检出中生成分发包。若打包前源码或文档发生变化，先验证新提交并最终确定对应标签，再继续操作；已公开标签不移动。

```bash
nvm use
npm ci
npm run check
VSCODE_TEST_VERSION=1.100.0 npm test
VSCODE_TEST_VERSION=stable npm test
```

无桌面测试需要文档列明的 Electron 运行库、Xvfb 和 xauth。相应执行 `VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test`、`VSCODE_TEST_VERSION=stable xvfb-run -a npm test`，以及需要时执行 `xvfb-run -a npm run test:ui`。

## 构建与验证发布产物

在新标签的干净检出中，按上文加载 nvm 并安装锁定依赖。分发用 VSIX 构建一次，两端使用同一文件。下方 Bash 命令要求工作区无待提交修改，且 `HEAD` 已绑定标签；子 shell 在失败时停止，不改变当前终端的选项：

```bash
(
  set -eu
  test -z "$(git status --porcelain)"
  release_version="$(node -p 'require("./package.json").version')"
  release_tag="$(git describe --tags --exact-match HEAD)"
  DUAL_MIND_RELEASE_REF="$release_tag" npm run package
  cd release
  sha256sum "dual-mind-${release_version}.vsix" > SHA256SUMS.txt
  sha256sum --check SHA256SUMS.txt
)
```

`npm run package` 会重建扩展宿主与 Webview，`DUAL_MIND_RELEASE_REF` 将包内 README／更新日志链接固定到新标签。产物路径为 `release/dual-mind-<version>.vsix`，再次打包同一版本会覆盖本地文件；候选包和重新下载的验证副本应分别存放。构建产物、截图、VSIX 和校验文件继续由 Git 忽略。

检查 VSIX 清单中的 Publisher `Pro-qing`、ID `dual-mind`、所选新版本、Preview 标记和 PNG 图标。按当前分发约定继续使用 Marketplace 普通通道。检查 MIT 许可、第三方声明、双语元信息／文档、宿主／前端及七组已采用 SVG／PNG；源 JPEG、开发源码、测试、凭据和 source map 不应出现。

在隔离用户配置／扩展目录中安装包，验证图标、身份／版本、工作台、两种语言、草稿保存及重载恢复。该配置只启用目标扩展身份。

## 将同一产物发布到两端

1. 使用已验证的新标签准备 GitHub Release 草稿，标题匹配新版本，填入双语说明，并上传同次构建的 VSIX 和校验文件。当前预览阶段勾选 **Pre-release**，不设为 latest。公开前核对提交、链接、功能／限制及附件哈希。
2. 用拥有 **Pro-qing** 的账号登录 [Publisher 管理页](https://marketplace.visualstudio.com/manage)，打开已有的 **DualMind** 扩展条目，上传新版本 VSIX。确认扩展标识、版本、图标、Preview 标记和 README，等待验证及公开完成。
3. 公开已核对的 GitHub Release 草稿，分别记录两端公开地址和实际发布时间。若只有一端完成发布，仅将该端标为已更新。
4. 将 GitHub VSIX 和校验文件重新下载到新目录，执行 `sha256sum --check SHA256SUMS.txt` 并与准备产物的摘要比较，然后隔离安装下载包。另从 Marketplace 安装／更新 `Pro-qing.dual-mind`，确认新版本，验证工作台打开、语言切换与草稿持久化。
5. 记录发布提交、标签、VSIX SHA-256、两端发布时间和实际安装验证结果；确认后同步双语状态文档，保留全部历史标签和公开附件。

## 同步 Marketplace 介绍

Marketplace 展示上传扩展包中的 README，提交或推送 GitHub 文档不会自动更新商店介绍。**2026-11-18** 核对时，公开的 `0.0.1` 页面仍显示旧包中的发布准备文案。下一版本打包时纳入修正后的 README，并在上传后核对商店实际显示内容；仅完成本次仓库文档更新尚未完成该步骤。

官方参考：[扩展发布](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)、[扩展清单](https://code.visualstudio.com/api/references/extension-manifest)和 [GitHub 发布文档](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。API 凭据不得写入源码或暴露在命令参数中。

本地源码标签 `v0.0.3` 不代表已公开发布。发布前需验证待发布的精确提交及目标编辑器／系统组合，并单独完成打包、安装、推送和双端发布流程。本次不执行这些发布步骤。
