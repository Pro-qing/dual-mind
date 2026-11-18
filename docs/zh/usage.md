# 使用说明

[English](../en/usage.md) · [文档索引](./README.md)

## 下载、校验和安装预览版

支持基线为 **Ubuntu 20.04+、x86_64/amd64、VS Code 1.100.0+**。其他平台和 ARM64 暂未验证。使用已构建的 VSIX 无需另行安装 Node.js，详见[环境说明](./environment.md)。

进入 [Preview 2 GitHub Release](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2)，阅读 [Preview 2 说明](./release-notes-preview-2.md)。新包使用 Publisher `Pro-qing`、标识 `Pro-qing.dual-mind`、版本 `0.0.1` 及 PNG 图标。Preview 2 已于 2026-11-18 发布，Release 页面提供已核验的 VSIX 和校验文件，Marketplace 尚待上传。

在 **Preview 2 的 Assets** 中下载 `dual-mind-0.0.1.vsix` 和 `SHA256SUMS.txt`，放到同一目录。两个预览版的文件名相同，但扩展身份及校验值不同，请使用同一 Release 的两个附件。自动生成的源码压缩包是源码快照，不是 VSIX 安装包。在下载目录执行：

```bash
sha256sum --check SHA256SUMS.txt
code --install-extension dual-mind-0.0.1.vsix --force
```

校验结果为 `OK`／成功后再安装。重载 VS Code，在命令面板运行 **DualMind: 打开工作台**（英文编辑器为 **DualMind: Open Workbench**）。该命令打开一个标签页，重复执行会定位到已有工作台；**DualMind: 显示状态**／**DualMind: Show Status** 保留为就绪检查。也可通过 **Extensions: Install from VSIX...** 选择已校验安装包。

## 从 Preview 1 切换

旧标识 `dual-mind-dev-placeholder.dual-mind` 和新标识 `Pro-qing.dual-mind` 是不同扩展。在扩展列表搜索 `@id:dual-mind-dev-placeholder.dual-mind`，通过齿轮菜单**停用**旧扩展，重载窗口后再打开新扩展，避免重复注册命令。可以保留已停用的旧扩展安装，旧数据不会被主动删除。

新身份拥有独立的草稿、连接元信息、API 密钥、模型默认值和自定义角色，需要按需重新配置；本轮不提供自动迁移。`dualMind.language` 用户设置保留相同键名，可以继续生效。`--force` 不会跨 publisher 搬移数据。如果需要历史构建，请保留 Preview 1 原附件。

## 上架后从 Marketplace 安装

**Marketplace 状态：待手动上传。** 所有者上传准备好的包并由服务端公开后，在扩展面板（`Ctrl+Shift+X`）搜索 `@id:Pro-qing.dual-mind`，确认发布者 **Pro-qing** 和图标后点击**安装**。上架后的命令行安装方式为 `code --install-extension Pro-qing.dual-mind`。

清单中的 `preview: true` 用于展示 Preview 标记，安装包仍为普通包，本次无需选择 Marketplace 预发布通道。该扩展 ID 后续公开更新需要递增扩展版本，用户可通过 VS Code 正常更新扩展；GitHub 同步保留对应版本的附件和校验文件。

从源码构建请按[开发指南](./development.md)和[打包指南](./releasing.md)操作。本地包位于 `release/dual-mind-0.0.1.vsix`，安装包及下载验证文件均不进入 Git 记录。

## 本地任务

首次打开显示空任务列表。创建任务前先打开文件夹或工作区。**新建任务**需要名称、需求和恰好一个 Reviewer 角色，保存该角色的指令快照，默认五轮，并允许为 Worker 与 Reviewer 分别选择连接和模型。API 未配齐也可以**创建草稿**。

选择已保存的草稿可查看需求和角色快照。**编辑草稿**更新文本、模型绑定及轮次上限，原有角色指令保持固定。删除需确认，仅移除任务记录，保留工作区文件、其他任务和角色预设。

草稿与选中任务按工作区保存，重新打开工作台或重载窗口后恢复。不同工作区拥有独立任务列表。未打开工作区时仍可使用设置和示例。

**查看示例**展示只读任务／对话及预期并行任务外观，**退出示例**返回真实草稿。示例不写入记录，也不发起模型请求。

## API 设置

设置 → **API 连接**管理 OpenAI 兼容接口的名称、完整 HTTP(S) Base URL 和默认模型 ID。保存连接后，通过**设置密钥／替换密钥**打开原生 VS Code 密码输入框。工作台只收到密钥保存状态，凭据由 VS Code 秘密存储管理。

Worker 与 Reviewer 的默认配置相互独立。保存默认绑定供新草稿继承，已有草稿保留各自选择。删除连接会移除其密钥并清除对应默认绑定；引用它的草稿会保留，显示连接失效提示，可通过编辑重新选择。

连接元信息、默认值和角色预设属于本机 VS Code 用户，可在其他工作区使用。本阶段**测试连接**禁用，保存配置不发送网络请求。

## 语言与 Reviewer 定义

使用**设置 → 界面语言**，或 VS Code 的 `dualMind.language` 设置：

| 值             | 行为                                              |
| -------------- | ------------------------------------------------- |
| `auto`（默认） | 中文 VS Code 显示简体中文，其他编辑器语言显示英文 |
| `zh-CN`        | 简体中文                                          |
| `en`           | English                                           |

手动选择按用户保存并立即生效。工作台标签、提示、校验、确认框和示例内容跟随切换。原生命令名称和设置说明跟随 VS Code 自身的显示语言。

设置 → **Reviewer 角色**提供 Bug、Feature、Review、Refactor。每类分别维护英文和简体中文的用途／指令，内置名称固定并本地化。编辑或恢复只影响当前显示语言，恢复默认需要确认。Worker 保持通用执行职责。

自定义角色的名称、用途和指令保持录入时的原文，支持新增、编辑和删除。创建任务时保存选定预设及语言的快照；之后切换语言、修改或删除预设，都不追改已有草稿。因此中文界面中可能保留英文任务快照，反之亦然。

通过语言选择器切换时，普通表单保留已输入内容。若角色指令有未保存修改，会先提供**保存**、**放弃修改**和**取消**；保存会先写入当前语言版本。离开页面或重载窗口前，请明确保存表单。

## 当前限制

模型执行、连接测试、流式输出、自动审查循环、提交反馈、暂停／停止、读取编辑器上下文及代码应用尚未接入，对应控件禁用，不会报告模拟成功。真实任务目前均为草稿，运行／暂停／完成状态仅存在于隔离的只读示例中。

五组[已审核设计稿](./design.md)继续保留，其中的执行状态描述后续预期行为。剩余工作见[路线图](./roadmap.md)。更新后找不到工作台命令时，请确认 VSIX 安装在当前 VS Code 实例中，并重载窗口。
