# 开发指南

[English](../en/development.md) · [文档索引](./README.md)

## 开发环境

使用 **Ubuntu 20.04+、x86_64/amd64**、VS Code 1.100.0+ 和 nvm 管理的 Node.js 24。其他平台和 ARM64 暂未验证。[环境说明](./environment.md)集中记录系统要求、nvm 配置、Electron 运行库、Xvfb 和 xauth。扩展构建目标为 Node.js 20，以兼容最低支持编辑器的扩展宿主。

如果已安装 nvm 但终端未加载，可执行：

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
```

如果尚未安装 nvm，请按 [nvm 官方安装说明](https://github.com/nvm-sh/nvm#installing-and-updating)完成安装并重新打开终端。日常开发无需全局安装 Yeoman。

```bash
nvm install
nvm use
node --version        # 应为 v24.x
npm --version
command -v node      # 应指向 nvm 安装目录
npm run check:env
npm ci
```

`.npmrc` 启用了严格引擎检查；安装、综合检查、构建和监听命令前还会运行环境检查。遇到 `EBADENGINE` 时，请加载 nvm 并切换版本，不要用 `--force` 绕过检查或替换系统 Node.js。nvm 的选择对当前终端生效；新终端需要再次执行 `nvm use`。

## 构建和调试

```bash
npm run check
npm run build
code .
```

选择 **Run DualMind** 并按 F5。Linux/macOS 的启动前构建任务会先加载 nvm，再运行 npm，不会修改 nvm 默认版本。Windows 用户应在启动 VS Code 前准备好 Node.js 24 环境。在扩展开发宿主中执行 **DualMind: Show Status**，确认就绪通知出现。

持续开发时，在两个终端分别运行 `npm run watch` 和 `npm run watch:types`，重新构建后重载开发宿主。断点通过 `dist/extension.js.map` 定位源码；安装包会排除 source map。

## 开发命令

| 命令                  | 用途                                         |
| --------------------- | -------------------------------------------- |
| `npm run check:env`   | 报告环境并检查 Ubuntu/Node 基线              |
| `npm run check:node`  | 仅检查 Node.js 24，保留兼容命令              |
| `npm run test:env`    | 测试版本拒绝和未验证平台提示                 |
| `npm run check`       | 环境检查及其测试、类型、lint、格式和文档链接 |
| `npm run build`       | 检查类型并将扩展构建到 `dist/`               |
| `npm run watch`       | 源码变化时重新构建扩展                       |
| `npm run watch:types` | 在另一个终端持续检查 TypeScript 类型         |
| `npm run format`      | 格式化支持的源码和文档                       |
| `npm test`            | 在下载的 VS Code 稳定版中执行冒烟测试        |
| `npm run package`     | 构建本地 `release/dual-mind-0.0.1.vsix`      |

## 验证

```bash
npm run check
npm test
VSCODE_TEST_VERSION=1.100.0 npm test
npm run package
```

`npm test` 先构建，再在独立 VS Code 实例内验证扩展发现及命令触发激活。编辑器下载缓存在 `.vscode-test/`，首次执行需要联网。下载允许最多 120 秒未收到数据，超过后才判定超时。测试需要图形显示环境；无桌面的 Ubuntu 需要按[环境说明](./environment.md)安装 Electron 运行库、`xvfb` 和 `xauth`，然后执行 `xvfb-run -a npm test`，最低版本测试执行 `VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test`。

CI 检查格式、类型、lint、文档相对链接、SVG 约束、编辑器激活及本地打包。验证组合包括 Ubuntu 20.04 容器中的 VS Code 1.100.0 和 stable，以及原生 Ubuntu 24.04 上的 stable，详见[环境验证组合](./environment.md)。修改支持的文本文件后可执行 `npm run format`。手写 SVG 的几何排版不交由 Prettier 修改。

## 常见问题

| 现象                            | 处理方式                                                      |
| ------------------------------- | ------------------------------------------------------------- |
| `EBADENGINE` 或显示 Node 10     | 加载 nvm，执行 `nvm install` 和 `nvm use` 后重试              |
| F5 提示缺少 nvm 或 Node 24      | 先在终端通过 nvm 安装 Node，确认 `NVM_DIR` 指向实际 nvm 目录  |
| Electron 无法启动或打开显示设备 | 安装[测试依赖](./environment.md)，再使用桌面会话或 `xvfb-run` |
| 下载失败                        | 检查 npm 与 VS Code 下载服务的网络访问后重试                  |
| 未出现聊天面板                  | 此阶段仅实现状态命令，属于预期行为                            |

构建产物、测试编辑器、依赖和 VSIX 均被 Git 忽略。本地安装和当前功能见[使用说明](./usage.md)，VSIX 生成及发布准备见[打包指南](./releasing.md)。
