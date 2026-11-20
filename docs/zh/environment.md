# 环境与支持基线

[English](../en/environment.md) · [文档索引](./README.md)

**当前源码版本：0.0.3 · 本地版本记录 · 尚未发布。** 本次记录日期为 2026-11-20；不表示已上传 Marketplace 或创建 GitHub Release。0.0.1 Preview 1／2 的历史发布记录保持原样。详见[0.0.3 版本说明](./release-notes-0.0.3.md)。

## 支持基线

DualMind 配置的支持基线为 **Ubuntu 20.04 及以上、x86_64/amd64**。其他操作系统、Linux 发行版和 ARM64 暂未验证。开发环境检查会对此提示“尚未验证”，不新增平台或架构安装限制。

| 场景                    | 环境要求                                             |
| ----------------------- | ---------------------------------------------------- |
| 安装并使用已构建的 VSIX | Ubuntu 20.04+、x86_64/amd64、桌面版 VS Code 1.100.0+ |
| 从源码开发              | 上述基线，加 Git 2.25+、nvm 管理的 Node.js 24 和 npm |
| 无桌面运行扩展宿主测试  | 开发基线，加 Electron 运行库、Xvfb 和 xauth          |

已安装的 VSIX 使用 VS Code 的扩展宿主，用户无需另行安装 Node.js 或 npm。Node.js 24 是开发、检查和打包工具链的要求；扩展构建目标为 Node.js 20，以兼容最低支持的编辑器。

[Node.js 24 平台要求](https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list)列明 Linux x64 需要内核 4.18+、glibc 2.28+，并包含 Ubuntu 20.04。Ubuntu 20.04 的标准内核和 glibc 满足其官方二进制要求。另可参考 [VS Code 系统要求](https://code.visualstudio.com/docs/supporting/requirements)。

## 准备开发工具链

按需在 Ubuntu 上安装基础工具：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
```

按照 [nvm 官方安装说明](https://github.com/nvm-sh/nvm#installing-and-updating)安装 nvm。重新打开终端，或加载已有安装：

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
```

在仓库根目录执行：

```bash
nvm install
nvm use
node --version          # 应为 v24.x
npm --version
command -v node        # 应指向 nvm 安装目录
npm run check:env
npm ci
```

两条 nvm 命令均读取内容为 `24` 的 `.nvmrc`。每次打开新终端后重新执行 `nvm use`。避免使用 Ubuntu 20.04 自带的 Node.js 10.19.0；其他软件如有需要，可以继续保留系统版本，通过 nvm 选择开发版本即可。不要替换 `/usr/bin/node`，也不要用 `--force` 绕过 `.npmrc` 的引擎检查。

CI 通过 `actions/setup-node` 读取同一份 `.nvmrc`，无需单独安装 nvm。

## Electron 与无桌面测试依赖

对于 **Ubuntu 20.04**，仓库提供运行库和显示工具安装脚本：

```bash
sudo bash scripts/install-ubuntu20-test-deps.sh
```

完整包清单见[安装脚本](../../scripts/install-ubuntu20-test-deps.sh)，包含 GTK、NSS/NSPR、ALSA、GBM/DRM、X11、拉丁／中日韩字体、Xvfb 和 xauth。中日韩字体用于在干净的 CI 容器中显示中文 Webview 截图。脚本会先确认系统为 Ubuntu 20.04，再安装依赖；后续 Ubuntu 版本的部分包名不同。在以 root 运行的 CI 容器中省略 `sudo`。

对于已经安装 VS Code 及其依赖的较新 Ubuntu 桌面，按需补齐无桌面显示工具：

```bash
sudo apt-get update
sudo apt-get install -y xvfb xauth
```

具有可用桌面会话时可直接运行 `npm test`。无显示环境时执行：

```bash
npm run check
VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test
VSCODE_TEST_VERSION=stable xvfb-run -a npm test
npm run package
```

首次测试会将各版本编辑器下载到 `.vscode-test/`，需要能够访问 npm 和 VS Code 下载服务。无桌面环境同时需要 Electron 动态库和 Xvfb/xauth；Xvfb 只提供显示环境，不会补齐动态库。

## 验证当前环境

```bash
npm run check:env
```

检查会报告发行版及版本、CPU 架构、glibc、Node.js 版本、可执行文件路径及 Git 版本，无需先安装 npm 依赖。若旧 npm 在执行检查前就报错，可以直接运行脚本：

```bash
node scripts/check-environment.cjs
```

脚本使用兼容 Node.js 10 的语法，误用系统 Node 时仍能显示清晰的配置提示。

| 检测结果                                       | 行为                                                  |
| ---------------------------------------------- | ----------------------------------------------------- |
| Ubuntu 低于 20.04                              | 检查失败，并说明最低系统版本                          |
| 开发 Node.js 主版本不是 24                     | 检查失败，并提示 `nvm install` / `nvm use`            |
| PATH 中缺少 Git 或版本低于 2.25                | 检查失败并提供安装提示                                |
| Ubuntu 20.04+ amd64，Node.js 24 且 Git 2.25+   | 通过已配置的基线检查                                  |
| 其他平台、发行版、架构，或无法识别 Ubuntu 版本 | 提示“尚未验证”；仍需满足 Node.js 24 和 Git 2.25+ 要求 |

此检查确认已配置的环境要求，会报告 glibc，但不证明所有 Electron 动态库均已安装。能否实际启动编辑器并激活扩展，由扩展宿主测试验证。

依赖安装、综合检查、构建、监听构建、监听类型检查和打包前都会执行环境检查。`npm run check:node` 保留为仅检查 Node 的兼容命令。`npm run test:env` 覆盖版本接受、拒绝及未验证平台提示。

## CI 验证组合

| 执行环境                                       | VS Code   | 验证内容                                                |
| ---------------------------------------------- | --------- | ------------------------------------------------------- |
| `ubuntu-24.04` runner 中的 `ubuntu:20.04` 容器 | `1.100.0` | 依赖安装、工程检查、扩展宿主冒烟测试                    |
| `ubuntu-24.04` runner 中的 `ubuntu:20.04` 容器 | `stable`  | 同上，并验证真实双语 Webview 交互／截图和本地 VSIX 打包 |
| 原生 `ubuntu-24.04` runner                     | `stable`  | 依赖安装、工程检查、扩展宿主冒烟测试                    |

[工作流](../../.github/workflows/ci.yml)在 Ubuntu 20.04 容器中显式使用 Bash，并在配置前断言实际发行版、版本和 amd64 架构。GitHub 的 Ubuntu 20.04 托管 runner 已于 [2025 年 4 月 15 日退役](https://github.com/actions/runner-images/issues/11101)，因此使用容器保留最低用户态基线。容器共享宿主内核，此组合不验证 Ubuntu 20.04 内核或完整桌面会话。

容器用于兼容性回归。普通用户仍按[使用说明](./usage.md)在桌面 VS Code 中安装 VSIX。F5 与开发命令见[开发指南](./development.md)，本地安装包生成见[打包与发布](./releasing.md)。

## Git 任务工作目录依赖

环境检查要求 PATH 中有 Git 2.25+ 并输出版本，preinstall 阶段同样检查。按需调用的运行时任务工作目录服务会在准备时再次检测 Git。缺少 Git 不影响已安装扩展管理本地任务、连接及模型列表。点击开始执行将调用 Git 宿主基础；保存任务仍不创建分支。准备条件见[架构说明](./architecture.md#git-任务工作目录基础开发分支)，资源保留与人工清理见[通信协议](./protocol.md#内部-git-工作目录服务)。

## 执行资源限制

任务命令目前按 Ubuntu/Linux 基线直接启动，不依赖用户级 systemd、cgroup v2 或用户 D-Bus 会话，不探测或强制设置内存／交换空间配额。命令超时默认为 180 秒、允许 10–900 秒，输出上限 2 MiB；取消时终止进程组。环境中仍须存在任务实际使用的程序。程序不存在、无执行权限或启动失败时记录结构化错误，供 Worker／Reviewer 修订处理。命令以当前操作系统用户身份运行，不构成文件系统或网络沙箱。其他平台的命令执行尚未支持。

初次候选版本复核使用 Ubuntu 24.04.5 amd64、Node.js 24.22.3、Git 2.43.0 和本机 VS Code 1.141.0。上表为现有工作流配置，不是 0.0.2／0.0.3 的远端 CI 成功记录；Ubuntu 20.04 的后续本地复验见[验证记录](./execution-cycle-validation.md)，最低 VS Code 1.100.0 及其他组合未在此次运行器修订中重新验证。

完整执行回归不再需要用户级 systemd 会话。真实命令测试默认执行，不需要额外环境变量；真实 UI 仍需要可用的桌面或 Xvfb、Electron 动态库和 Git。修改运行器不等于已经重新验证远端 CI，具体环境覆盖见[验证记录](./execution-cycle-validation.md)。

## 自动执行与无命令任务

Reviewer 先规划，Worker 再按需准备项目依赖与运行命令，无命令任务仍可通过有依据的阅读审查完成。命令失败、未执行或停止未确认均保留真实记录，不能作为通过证据。开发验证进程可以由外部工具施加总资源预算，该预算不属于产品任务的运行前置条件。
