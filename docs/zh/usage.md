# 使用说明

[English](../en/usage.md) · [文档索引](./README.md)

## 当前可用内容

DualMind 处于早期开发骨架阶段，尚未在 Marketplace 公开发布。当前构建提供状态命令，用于确认扩展已加载；双智能体对话界面和协作流程仍是规划功能。

安装本地 VSIX 的支持基线为 **Ubuntu 20.04+、x86_64/amd64、VS Code 1.100.0+**。其他平台和 ARM64 暂未验证。使用已经构建好的安装包，无需另行安装 Node.js 或 npm，详见[环境要求](./environment.md)。

## 获取本地安装包

本地构建产物为 `release/dual-mind-0.0.1.vsix`。该生成文件被 Git 忽略，克隆仓库时不会包含它。

如需生成安装包，请先按[开发指南](./development.md)准备环境，再按[打包指南](./releasing.md)完成构建和打包。

## 安装与验证

安装包生成后，在 `code` 命令可用的终端中，于仓库根目录执行：

```bash
code --install-extension release/dual-mind-0.0.1.vsix
```

1. 安装后重载 VS Code。
2. 打开命令面板，运行 **DualMind: Show Status**。
3. 确认出现以下通知：

> DualMind scaffold is ready. UI design is pending review.

该提示表示扩展已加载，状态命令执行成功。如果从源码运行，请在[调试说明](./development.md)所述的扩展开发宿主中执行该命令。

## 当前限制

- 状态命令仅显示通知，不会打开对话面板。
- 当前没有模型调用、Worker/Reviewer 会话、自动审查循环或工作区修改功能。
- [SVG 示意图](./design.md)是等待审核的静态设计提案，React 界面将在审核通过后开始实现。

若找不到命令，请检查 VSIX 是否安装在当前使用的 VS Code 实例中，以及编辑器是否满足最低版本要求。后续里程碑见[路线图](./roadmap.md)。
