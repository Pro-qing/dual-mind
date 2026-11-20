# 开发指南

[English](../en/development.md) · [文档索引](./README.md)

**当前源码版本：0.0.3 · 本地版本记录 · 尚未发布。** 本次记录日期为 2026-11-20；不表示已上传 Marketplace 或创建 GitHub Release。0.0.1 Preview 1／2 的历史发布记录保持原样。详见[0.0.3 版本说明](./release-notes-0.0.3.md)。

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

选择 **Run DualMind** 并按 F5。Linux/macOS 的启动前构建任务会先加载 nvm，再运行 npm，不会修改 nvm 默认版本。Windows 用户应在启动 VS Code 前准备好 Node.js 24 环境。在扩展开发宿主中执行 **DualMind: 打开工作台**／**DualMind: Open Workbench**，状态命令仍保留为就绪检查。React 和 CSS 在本地构建，无需开发 Web 服务。

持续开发时，在两个终端分别运行 `npm run watch` 和 `npm run watch:types`；前者监听宿主与前端构建，后者检查宿主、Webview 和本地测试三个 TypeScript 项目，重新构建后重载开发宿主。断点通过 `dist/extension.js.map` 定位源码；安装包会排除 source map。

## 开发命令

| 命令                  | 用途                                                   |
| --------------------- | ------------------------------------------------------ |
| `npm run check:env`   | 报告环境并检查 Ubuntu/Node 基线                        |
| `npm run check:node`  | 仅检查 Node.js 24，保留兼容命令                        |
| `npm run test:env`    | 测试版本拒绝和未验证平台提示                           |
| `npm run test:local`  | 无需启动 VS Code，执行存储与 React 交互测试            |
| `npm run test:ui`     | 在隔离配置中操作真实 VS Code Webview 并截图            |
| `npm run check`       | 环境与本地存储／React 测试、类型、lint、格式和文档链接 |
| `npm run build`       | 检查类型并将扩展宿主和 Webview 构建到 `dist/`          |
| `npm run watch`       | 源码变化时重新构建扩展宿主和 Webview                   |
| `npm run watch:types` | 持续检查宿主、Webview 和本地测试的 TypeScript 类型     |
| `npm run format`      | 格式化支持的源码和文档                                 |
| `npm test`            | 在下载的 VS Code 稳定版中执行冒烟测试                  |
| `npm run package`     | 构建本地 `release/dual-mind-<version>.vsix`            |

## 验证

```bash
npm run check
npm test
VSCODE_TEST_VERSION=1.100.0 npm test
npm run package
```

`npm test` 构建宿主与前端，在独立 VS Code 实例中验证命令激活、React 实际渲染、单例标签和关闭后重开。`npm run check` 也执行本地存储及 React 交互测试。`npm run test:ui` 通过 Playwright 操作下载编辑器的 Electron 程序（无需另下浏览器），使用隔离的临时用户配置和工作区，验证真实设置／任务操作、重载恢复及工作区隔离，并在 `.vscode-test/ui-validation/<VS Code version>/` 保存中英文宽／窄截图。它需要桌面，或使用 `xvfb-run -a npm run test:ui`。编辑器下载缓存在 `.vscode-test/`，首次执行需要联网。`npm test` 配置允许下载最多 120 秒未收到数据才判定超时；`test:ui` 使用下载工具的默认超时。测试需要图形显示环境；无桌面的 Ubuntu 需要按[环境说明](./environment.md)安装 Electron 运行库、`xvfb` 和 `xauth`，然后执行 `xvfb-run -a npm test`，最低版本测试执行 `VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test`。

CI 各组合运行环境及本地存储／React 测试、格式、类型、lint、文档链接、设计资源检查和扩展宿主测试。验证组合包括 Ubuntu 20.04 容器中的 VS Code 1.100.0 和 stable，以及原生 Ubuntu 24.04 上的 stable；Ubuntu 20.04 stable 组合额外验证真实 Webview 和打包，详见[环境验证组合](./environment.md)。修改支持的文本文件后可执行 `npm run format`。手写 SVG 的几何排版不交由 Prettier 修改。

## 常见问题

| 现象                            | 处理方式                                                                |
| ------------------------------- | ----------------------------------------------------------------------- |
| `EBADENGINE` 或显示 Node 10     | 加载 nvm，执行 `nvm install` 和 `nvm use` 后重试                        |
| F5 提示缺少 nvm 或 Node 24      | 先在终端通过 nvm 安装 Node，确认 `NVM_DIR` 指向实际 nvm 目录            |
| Electron 无法启动或打开显示设备 | 安装[测试依赖](./environment.md)，再使用桌面会话或 `xvfb-run`           |
| 下载失败                        | 检查 npm 与 VS Code 下载服务的网络访问后重试                            |
| 未出现工作台                    | 执行 **DualMind: 打开工作台**；同版本 VSIX 更新后需要强制安装并重载窗口 |

构建产物、测试编辑器、依赖和 VSIX 均被 Git 忽略。本地安装和当前功能见[使用说明](./usage.md)，VSIX 生成及发布准备见[打包指南](./releasing.md)。

## 限制资源的模型验证

本地测试串行执行，JavaScript 堆上限为 512 MiB，保留单项 30 秒超时。每次独立运行验证命令：本地检查总内存 1 GiB、独立批次超时 60 秒，包含真实命令超时测试的综合 `npm run check` 总超时 120 秒；Electron 总内存 2 GiB、整体超时 180 秒，均禁止使用交换空间。Linux 可通过用户级 systemd 服务的 `MemoryMax`、`MemorySwapMax=0` 和 `RuntimeMaxSec` 强制限制。

设置 `VSCODE_TEST_EXECUTABLE=/usr/share/code/code` 后，`npm test` 与 `npm run test:ui` 复用已安装 VS Code；未设置时保留自动下载。无显示环境使用 `xvfb-run -a`。测试使用隔离用户配置；真实 Webview 测试启动本地模拟服务，在原生密码框输入测试密钥，验证查询、选择、保存重载、中英文及窄窗口布局，不读取个人凭据；模型请求只发往本地模拟端点，不调用付费服务。

## 执行能力验证

执行测试使用临时仓库、本地 SSE 服务和测试凭据。真实命令测试已纳入常规 `npm run test:local`，无需 `DUALMIND_TEST_SYSTEMD` 或任何用户级 systemd 会话。覆盖原样参数、工作目录、环境隔离、启动错误、非零退出、取消、超时、输出上限及遗留子进程清理；测试将 systemd 工具替换为失败桩，确认运行器不调用它们。

```bash
nvm use
npm run check
VSCODE_TEST_EXECUTABLE=/usr/share/code/code npm test
VSCODE_TEST_EXECUTABLE=/usr/share/code/code npm run test:ui
```

上述测试中的产品命令不设置内存／交换空间配额。前节的开发验证总资源预算可由调用者在外层施加；直接启动的子进程继承外层 cgroup，不创建新的 systemd 单元。无桌面时为 Electron 命令加 `xvfb-run -a`，并取消 `ELECTRON_RUN_AS_NODE`。测试不生成或安装扩展包。

真实 UI 配置两种模型协议及真实附加命令，验证检查失败／修订／验收通过、双语命令错误、运行中停止、专用模式源目录保持原样，以及当前／指定模式直接写入和分支选择重载。缺少 systemd/cgroup 不再触发跳过分支；命令闭环失败就是测试失败，不能只以界面通过代替。

## 双 AI 循环验证

本地模拟服务覆盖 Reviewer 首先规划、Worker 自主命令、未通过后的下一轮方案、纯阅读验收和旧自定义配置。契约测试覆盖嵌套工具参数、验收项 ID、伪造／过期／失败证据、反馈及最新失败覆盖旧成功。真实命令运行器默认接受同一套测试，阅读验收保持独立覆盖。

实际环境、通过项与未覆盖项见[验证记录](./execution-cycle-validation.md)。
