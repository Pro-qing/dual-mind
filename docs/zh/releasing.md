# 打包与 GitHub 预览版发布

[English](../en/releasing.md) · [文档索引](./README.md)

## 预览版标识

| 项目         | 值                                       |
| ------------ | ---------------------------------------- |
| 扩展版本     | `0.0.1`                                  |
| Git 标签     | `v0.0.1-preview.1`                       |
| Release 标题 | `DualMind 0.0.1 Preview 1`               |
| 发布类型     | GitHub 预发布                            |
| 附件         | `dual-mind-0.0.1.vsix`、`SHA256SUMS.txt` |
| 许可         | MIT，版权署名 `2026 Pro-qing`            |

本预览版沿用扩展标识 `dual-mind-dev-placeholder.dual-mind`。`private: true` 防止 npm 发布，不禁止通过 GitHub 分发 VSIX。可用功能和限制见[发布说明](./release-notes.md)。草稿或本地包不代表公开发布，发布后以 GitHub 返回的实际公开时间为准。

## 本地准备与验证

遵循统一[环境基线](./environment.md)：Ubuntu 20.04+ amd64、VS Code 1.100.0+，开发使用 nvm 管理的 Node.js 24。无桌面测试需要 Xvfb／xauth 及文档列出的 Electron 运行库。在仓库根目录执行：

```bash
nvm use
npm ci
npm run check
VSCODE_TEST_VERSION=1.100.0 npm test
VSCODE_TEST_VERSION=stable npm test
DUAL_MIND_RELEASE_REF=v0.0.1-preview.1 npm run package
(cd release && sha256sum dual-mind-0.0.1.vsix > SHA256SUMS.txt)
(cd release && sha256sum --check SHA256SUMS.txt)
```

无桌面环境为每次编辑器测试加上 `xvfb-run -a` 前缀。运行逻辑或界面变更还需执行 `npm run test:ui`，无桌面时使用 `xvfb-run -a npm run test:ui`。

`npm run package` 重新构建扩展及 React 前端后生成 VSIX。`DUAL_MIND_RELEASE_REF` 将打包后 README／更新日志的链接和图片固定到发布标签，避免随默认分支移动；普通本地打包可省略该变量。打包已移除许可证跳过设置。检查包内包含 `LICENSE.txt`、第三方声明、两份原生本地化文件、宿主和前端构建、双语文档及五组 SVG／PNG，并排除开发源码、秘密信息、测试配置、source map 和旧 VSIX。

在独立的 VS Code 用户配置／扩展目录中安装准备好的包，验证工作台打开、语言切换、草稿保存和重载持久化，确认打包资源能脱离开发路径工作。普通本地安装命令为：

```bash
code --install-extension release/dual-mind-0.0.1.vsix --force
```

重载窗口后运行 **DualMind: 打开工作台**。首个本地预览可使用同版本强制更新；后续公开构建应递增扩展版本，不应静默覆盖既有发布附件。

## 提交、CI 和 Release 草稿

1. 核对双语文档、功能描述、安全报告渠道、许可元信息及更新日志，保留已审核设计文件。不虚构联系方式，也不在实际发布前写成已发布。
2. 创建 `chore: prepare v0.0.1 preview release` 提交并推送 `master`。`release/`、依赖、构建产物和验证截图继续被忽略。
3. 等待该精确提交的 CI 全部通过：Ubuntu 20.04 上的 VS Code 1.100.0 和 stable，以及 Ubuntu 24.04 stable。Ubuntu 20.04 stable 还验证真实 Webview 与打包。
4. 在仓库 **Releases → Draft a new release** 中，将 `v0.0.1-preview.1` 指向已验证的准备提交，填写上述标题，勾选预发布，不标为 latest。
5. 填入中英文发布说明，包括环境基线、安装命令、当前限制、提交 SHA、测试编辑器版本和 VSIX SHA-256，上传两个准备好的附件。GitHub 正文使用仓库／标签的绝对链接，因为其相对链接上下文与文档文件不同。
6. 保存草稿，发布前核对目标／标签、标题、发布标记、完整正文、附件名称／大小／哈希，以及已验证的私密漏洞报告入口。

也可由已授权账号通过 GitHub API 完成同样的草稿、上传和发布流程。凭据不得写入仓库文件或命令参数。必要 CI 或附件检查未通过时，不公开草稿。

## 公开与下载核验

公开已核对的草稿。将 GitHub 返回的 Release 地址、`published_at` 时间、准备提交、标签及 VSIX 哈希记入发布记录；只有 GitHub 确认发布后才记录正式公开时间。

从已发布 Release 将两个附件重新下载到全新目录，执行 `sha256sum --check SHA256SUMS.txt`，与准备时的摘要比较，再在隔离安装中验证下载的 VSIX。检查工作台打开、语言切换和草稿保存，验证记录保存在被忽略的发布目录中。若验证失败，如实报告发布状态并通过明确的后续版本修复，不报告为验证完成。

网页流程参考 [GitHub 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。安装包和校验文件作为 Release 附件，不进入源码记录。

## 后续 Marketplace 上架

Marketplace 分发是后续独立里程碑：注册正式 publisher，统一替换开发身份（包括测试及迁移考虑），准备正式图标和商店介绍，并验证对应版本。当前 MIT 许可和 GitHub 预览不会代为注册 Marketplace publisher。真实模型能力应在实现后再描述。本仓库不包含自动 Marketplace 发布工作流或发布令牌。
