# 环境与支持基线

[English](../en/environment.md) · [文档索引](./README.md)

## 支持基线

DualMind 的正式验证范围为 **Ubuntu 20.04 及以上、x86_64/amd64**。其他操作系统、Linux 发行版和 ARM64 暂未验证。开发环境检查会对此提示“尚未验证”，不新增平台或架构安装限制。

| 场景                    | 环境要求                                             |
| ----------------------- | ---------------------------------------------------- |
| 安装并使用已构建的 VSIX | Ubuntu 20.04+、x86_64/amd64、桌面版 VS Code 1.100.0+ |
| 从源码开发              | 上述基线，加 Git、nvm 管理的 Node.js 24 和 npm       |
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

检查会报告发行版及版本、CPU 架构、glibc、Node.js 版本和可执行文件路径，无需先安装 npm 依赖。若旧 npm 在执行检查前就报错，可以直接运行脚本：

```bash
node scripts/check-environment.cjs
```

脚本使用兼容 Node.js 10 的语法，误用系统 Node 时仍能显示清晰的配置提示。

| 检测结果                                       | 行为                                       |
| ---------------------------------------------- | ------------------------------------------ |
| Ubuntu 低于 20.04                              | 检查失败，并说明最低系统版本               |
| 开发 Node.js 主版本不是 24                     | 检查失败，并提示 `nvm install` / `nvm use` |
| Ubuntu 20.04+ amd64，且 Node.js 为 24          | 通过已配置的基线检查                       |
| 其他平台、发行版、架构，或无法识别 Ubuntu 版本 | 提示“尚未验证”；仍需满足 Node.js 24 要求   |

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
