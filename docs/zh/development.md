# 开发指南

[English](../en/development.md) · [文档索引](./README.md)

**当前源码版本：0.0.5 · 本地源码标签 `v0.0.5` · 尚未发布。** 记录日期：2026-11-23。包含原生侧栏工作台，设计稿按版本归档；本地提交、标签和 VSIX 不表示已推送远端或发布 Marketplace／GitHub Release。旧版本记录保持原样。详见[0.0.5 版本说明](./release-notes-0.0.5.md)。

## 开发环境

使用 **Ubuntu 20.04+、x86_64/amd64**、VS Code 1.100.0+ 和 nvm 管理的 Node.js 24。其他平台和 ARM64 暂未验证。[环境说明](./environment.md)集中记录系统要求、nvm 配置、Electron 运行库、Xvfb 和 xauth。扩展构建目标为 Node.js 20，以兼容最低支持编辑器的扩展宿主。

如果已安装 nvm 但终端未加载，可执行：

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" --no-use
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

`.npmrc` 启用了严格引擎检查；安装、综合检查、构建和监听命令前还会运行环境检查。遇到 `EBADENGINE` 时，请加载 nvm 并切换版本，不要用 `--force` 绕过检查或替换系统 Node.js。nvm 的选择对当前终端生效；新终端需要再次执行 `nvm use`。保留本机默认版本的初始化方式见[环境说明](./environment.md#准备开发工具链)；完成项目工作后执行 `nvm use system` 可切回系统 Node.js，切换目录本身不会自动切换版本。

## 代码与文档同步

代码修改与对应文档必须在同一变更中完成；文档检索、核对和记录是交付条件，不能只检查链接或翻译文件是否存在。

1. 从代码差异列出受影响的功能、模块、接口、消息／配置字段、用户操作和行为限制，同时准备中英文名称、旧术语和新术语。
2. 使用 `rg` 搜索全仓库相关文档，包括根目录说明和规范、`docs/en/`、`docs/zh/`、模块 README 及 `.github/` 模板。以下命令是起点；替换示例词，并根据引用和新发现继续扩展检索，不只查看一个已知页面：

   ```bash
   rg -n --hidden -g '*.md' -g '!.git/**' -g '!node_modules/**' -g '!dist/**' -g '!out/**' -g '!release/**' -g '!.vscode-test/**' -g '!.test-workspace/**' -g '!coverage/**' 'TaskChat|message.send|任务聊天|task chat' .
   ```

3. 阅读命中位置的上下文及关联章节，对照代码逐项检查功能描述、使用示例、默认值、边界／限制、实现／审核／发布状态和交叉引用。同步受影响的中英文内容及重复说明；若新增行为缺少说明，在对应指南补充。
4. 区分现行说明、历史设计、历史发布和验证记录。现行说明跟随代码；历史日期、结果、失败及未覆盖项保留，需要澄清时添加修订说明和当前文档链接。设计稿、CI 配置或旧测试通过不能作为本次验证证据。
5. 每次代码修改都在[中文开发日志](./development-log.md)与[英文开发日志](../en/development-log.md)追加对应条目，记录实际日期、变更内容、检索关键词与核对文件／章节、文档更新情况、已执行检查及结果、未运行项与限制。正文无需更新时，也必须记录核对范围和无需更新的具体原因。纯文档同步同样记录实际核对与检查结果。
6. 按改动范围运行检查，完成后再次检索旧术语和相互矛盾的描述，并逐项确认剩余命中有明确的历史语境。PR 中分别确认检索核对、双语同步和开发日志记录。

纯文档修改执行 `npm run docs:check`、`npm run format:check` 和 `git diff --check`。前两项验证链接／资源／语言配对及格式，不能代替内容核对。代码修改仍需运行[贡献指南](../../CONTRIBUTING.zh.md)要求的相关工程检查与测试；日志只记录实际运行结果，不沿用历史结论。

## Git 提交信息

每个新 Git commit 都必须包含英文和简体中文，文档修改同样适用。标题沿用现有类型前缀，使用 `type(scope): English summary / 中文摘要`，scope 可省略。两种语言必须描述同一项变更，不能只在 PR 或开发日志中补充翻译。此约定适用于新提交，不为补译而重写既有提交历史。

需要正文时，分别使用 `English:` 和 `中文：` 段落，按相同顺序说明修改原因、最终行为、实际验证及必要限制。文件名、命令和接口标识保持原样。简短提交可仅使用双语标题；以下为格式示例，验证项必须替换为本次实际结果：

```text
docs: synchronize documentation / 同步文档

English:
Update current behavior descriptions and document the required review workflow.
Validation: <checks actually run and their results; unrun checks and limitations>.

中文：
同步现行行为说明，并记录必须执行的文档核对流程。
验证：<实际执行的检查及结果；未运行项与限制>。
```

提交前核对暂存差异、双语含义和验证记录。多行提交信息使用 UTF-8 文件与 `git commit --file <message-file>`，保留真实换行，避免将正文直接拼接进 shell 命令。

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

本地测试串行执行，JavaScript 堆上限为 512 MiB，保留单项 30 秒超时（Windows 原生测试为 90 秒）。每次独立运行验证命令：本地检查总内存 1 GiB、独立批次超时 60 秒，包含真实命令超时测试的综合 `npm run check` 总超时 180 秒；Electron 总内存 2 GiB、整体超时 300 秒，均禁止使用交换空间。Linux 可通过用户级 systemd 服务的 `MemoryMax`、`MemorySwapMax=0` 和 `RuntimeMaxSec` 强制限制。

设置 `VSCODE_TEST_EXECUTABLE=/usr/share/code/code` 后，`npm test` 与 `npm run test:ui` 复用已安装 VS Code；未设置时保留自动下载。无显示环境使用 `xvfb-run -a`。测试使用隔离用户配置；真实 Webview 测试启动本地模拟服务，在原生密码框输入测试密钥，验证查询、选择、保存重载、中英文及窄窗口布局，不读取个人凭据；模型请求只发往本地模拟端点，不调用付费服务。

## 执行能力验证

执行测试使用临时仓库、本地 SSE 服务和测试凭据。真实命令测试已纳入常规 `npm run test:local`，无需 `DUALMIND_TEST_SYSTEMD` 或任何用户级 systemd 会话。覆盖原样参数、工作目录、环境继承、启动错误、非零退出、取消、超时、输出上限及遗留子进程清理；测试将 systemd 工具替换为失败桩，确认运行器不调用它们。

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

## 任务聊天开发记录

参见[开发日志](./development-log.md)与[任务聊天验证记录](./task-chat-validation.md)。新增测试覆盖跨运行分页、消息幂等与脱敏、只读答复、三种 Git 策略的未提交成果续接、交接排队、暂停／停止／重载、轮次上限、新证据、IME 和证据抽屉状态。

## 原生 shell 命令

两个角色现共用[通用 shell 执行层](./shell-execution.md)，自动继承环境，并允许 Reviewer 独立验证，无需语言专用设置。已配置 macOS 和 Windows 原生 CI，须观察到实际通过后才能标记为已验证。历史验证报告保留当时范围。

恢复测试包含模拟端点、独立子进程强制退出及重新创建执行服务；只修改临时仓库。恢复界面审核前，真实 UI 回归仅验证原有布局与交互，不能计为新按钮已通过验证。见[恢复机制](./execution-recovery.md)。

## 侧栏回归

`npm run test:ui` 先运行双协议执行及聊天回归，再运行原生侧栏和旧页签迁移场景；也可使用 `node scripts/verify-sidebar.mjs` 单独验证后者。通过 `VSCODE_TEST_EXECUTABLE` 选择本机版本，或用 `VSCODE_TEST_VERSION=1.100.0` 验证最低版本。测试使用临时用户目录和工作区；真实结果见[侧栏验证](./sidebar-workbench-validation.md)。
