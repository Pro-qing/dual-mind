# 打包与双端同步发布

[English](../en/releasing.md) · [文档索引](./README.md)

**当前源码版本：0.0.7 · 本地版本准备，尚未公开发布。** 记录日期：2026-11-24。修复、验证及本地制品见[0.0.7 版本说明](./release-notes-0.0.7.md)。公开发布由维护者单独执行，历史版本记录保留原意。

## 0.0.7 本地交付

修复功能验证后将源码升级到 0.0.7，再验证最终文件。创建双语本地提交及附注标签 `v0.0.7`，从该干净提交执行 `DUAL_MIND_RELEASE_REF=v0.0.7 npm run package`。交付 `release/dual-mind-0.0.7.vsix`、对应 `.vsix.sha256` 与 `dual-mind-0.0.7-build.json`。构建记录保存精确提交、源码／安装包摘要、工具链、检查和限制。在隔离编辑器用户／扩展目录中安装验证，保留旧包及任务工作树。

推送和公开发布由维护者操作，包内固定到 `v0.0.7` 的链接在推送该标签后可访问。本地制品准备不代表已经公开发布。实际检查见[开发日志](./development-log.md)及[0.0.7 说明](./release-notes-0.0.7.md)。

## 0.0.6 历史本地交付

本轮将已有产品介绍、本机 Python 支持和完整功能整理为三个双语提交，更新项目版本为 0.0.6。由最终干净提交构建独立包，文档链接固定到 `v0.0.6`；包检查成功后在同一提交创建本地附注标签。现有版本、图稿、任务工作树及旧包保留。

交付 `release/dual-mind-0.0.6.vsix`、`release/dual-mind-0.0.6.vsix.sha256` 和 `release/dual-mind-0.0.6-build.json`。构建记录保存精确提交、源码／包摘要、执行环境、实际检查及未运行项；它与制品均由 Git 忽略，避免将最终包摘要回写到已打标签源码。双语[版本说明](./release-notes-0.0.6.md)可作为发布文案。

本轮仅本地提交、打标签和打包，不推送、安装或公开发布。维护者后续先推送 `master` 并核对该精确提交的 CI，再推送 `v0.0.6`；远端可访问标签后，包内文档链接才可解析。确认标签、构建记录与 CI 指向同一提交后，两端上传同一个已校验 VSIX。若需修改源码，应重新验证并准备对应制品，不把旧包冒称为新提交的构建。

在项目根目录核对交付包：

```bash
(cd release && sha256sum --check dual-mind-0.0.6.vsix.sha256)
```

本机验证与此前界面证据的复用范围见[版本说明](./release-notes-0.0.6.md)；远端 CI、隔离安装及公开发布仍须分别记录结果。以下通用发布流程与历史记录保留。

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

原始 1408 × 768 JPEG 原样归档至 `resources/branding/dual-mind.jpeg`。随包 PNG 使用中央裁剪区域 `(320, 0, 1088, 768)`，以 Lanczos 缩小为 256 × 256，不拉伸图案。`.vscodeignore` 放行图标、活动栏 SVG、内置工具清单及 `resources/screenshots/dualmind-workbench.png`，排除源 JPEG 及资源维护文件。37 组已审核 SVG／PNG 界面设计继续随包保留，原始界面截图来源见[资源说明](../../resources/README.md)。

## 准备下一版本

1. 选择高于 `Pro-qing.dual-mind` 已上架版本的扩展版本，更新 `package.json`、`package-lock.json`、双语更新日志和发布说明，并确定与该版本对应的未使用发布标签。公开前保持“准备中”表述，发布日期和验证结果以实际记录为准。
2. 使用[环境基线](./environment.md)：Ubuntu 20.04+ amd64、VS Code 1.100.0+、nvm 管理的 Node.js 24，执行下方检查。运行逻辑／界面修改还需执行 `npm run test:ui`。
3. 检查差异，创建发布准备提交并推送 `master`，等待该精确提交的 CI 全部通过：Ubuntu 20.04 上 VS Code 1.100.0／stable，以及 Ubuntu 24.04 stable。Ubuntu 20.04 stable 还验证真实 Webview 和打包。
4. 创建并推送指向该已验证提交的新标签，从此标签的干净检出中生成分发包。若打包前源码或文档发生变化，先验证新提交并最终确定对应标签，再继续操作；已公开标签不移动。

```bash
nvm use
npm ci
npm run tools:fetch
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

`npm run package` 会重建扩展宿主与 Webview，`DUAL_MIND_RELEASE_REF` 将包内 README／更新日志链接固定到新标签。产物路径为 `release/dual-mind-<version>.vsix`，再次打包同一版本会覆盖本地文件；候选包和重新下载的验证副本应分别存放。构建产物、验证截图、VSIX 和校验文件继续由 Git 忽略；用于产品介绍的 `resources/screenshots/dualmind-workbench.png` 已提交并随包提供。

检查 VSIX 清单中的 Publisher `Pro-qing`、ID `dual-mind`、所选新版本、Preview 标记和 PNG 图标。按当前分发约定继续使用 Marketplace 普通通道。检查 MIT 许可、第三方声明、双语元信息／文档、宿主／前端及按版本目录组织的全部 37 组已审核 SVG／PNG、产品截图及 rg／fd／jq 可执行文件与上游许可证；源 JPEG、开发源码、测试、凭据和 source map 不应出现。

在隔离用户配置／扩展目录中安装包，验证图标、身份／版本、工作台、两种语言、任务创建／保存及重载恢复。该配置只启用目标扩展身份。

## 将同一产物发布到两端

1. 使用已验证的新标签准备 GitHub Release 草稿，标题匹配新版本，填入双语说明，并上传同次构建的 VSIX 和校验文件。当前预览阶段勾选 **Pre-release**，不设为 latest。公开前核对提交、链接、功能／限制及附件哈希。
2. 用拥有 **Pro-qing** 的账号登录 [Publisher 管理页](https://marketplace.visualstudio.com/manage)，打开已有的 **DualMind** 扩展条目，上传新版本 VSIX。确认扩展标识、版本、图标、Preview 标记和 README，等待验证及公开完成。
3. 公开已核对的 GitHub Release 草稿，分别记录两端公开地址和实际发布时间。若只有一端完成发布，仅将该端标为已更新。
4. 将 GitHub VSIX 和校验文件重新下载到新目录，执行 `sha256sum --check SHA256SUMS.txt` 并与准备产物的摘要比较，然后隔离安装下载包。另从 Marketplace 安装／更新 `Pro-qing.dual-mind`，确认新版本，验证工作台打开、语言切换与任务持久化。
5. 记录发布提交、标签、VSIX SHA-256、两端发布时间和实际安装验证结果；确认后同步双语状态文档，保留全部历史标签和公开附件。

## 同步 Marketplace 介绍

Marketplace 展示上传扩展包中的 README，提交或推送 GitHub 文档不会自动更新商店介绍。**2026-11-18** 核对时，公开的 `0.0.1` 页面仍显示旧包中的发布准备文案。下一版本打包时纳入修正后的 README，并在上传后核对商店实际显示内容；仅完成本次仓库文档更新尚未完成该步骤。

官方参考：[扩展发布](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)、[扩展清单](https://code.visualstudio.com/api/references/extension-manifest)和 [GitHub 发布文档](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。API 凭据不得写入源码或暴露在命令参数中。

**历史记录（2026-11-23）：** `v0.0.5` 是当时创建的本地源码附注标签，包含侧栏实现、设计目录整理和版本更新；当时未推送标签、安装扩展或创建公开发布。历史 `v0.0.2`／`v0.0.3` 标签和旧 VSIX 保留。公开发布仍需验证精确提交及目标平台 CI，再执行上文分发流程。当时的本地范围与实际验证见[0.0.5 版本说明](./release-notes-0.0.5.md)。

## 内置常用命令

Linux x64 的 `rg`、`fd`、`jq` 随 VSIX 离线提供；系统优先，仅追加任务进程 PATH。构建前显式运行 `npm run tools:fetch`，缓存完整后构建可离线进行。版本、失败行为、许可与验证见 [内置常用命令](./bundled-tools.md)。

## 本机 Python

0.0.6 自动发现本机已有 Python 2.7／3 和项目环境，供两个角色通过命令调用。Python 不随 VSIX 分发，也不会在安装或运行时下载；详见[本机 Python](./local-python.md)。
