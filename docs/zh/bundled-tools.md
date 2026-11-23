# 内置常用命令

[English](../en/bundled-tools.md) · [文档索引](./README.md)

DualMind 0.0.5 随 VSIX 离线携带 Linux x64 的 `rg` 16.0.0、`fd` 10.5.2 和 `jq` 1.8.2，用于文本搜索、文件查找和 JSON 处理。支持基线为 Ubuntu 20.04+ amd64；其他平台继续使用系统命令。实际验证结果见[开发日志](./development-log.md)。

## 任务中的使用

Worker 和 Reviewer 沿用 `run_command`。宿主在捕获登录环境后，将校验通过的工具目录追加到该次运行的 PATH，系统命令优先。登录环境探测失败时，对宿主环境快照执行相同处理。不会修改用户终端、shell 配置或全局进程环境；运行期间不下载或安装工具。

显式空 PATH 保留原空条目的当前目录语义；缺少 PATH 时，以标准 Linux 系统目录为前缀。系统已有命令即使版本较旧或执行失败，也不会自动改用内置版本重跑。每条命令仍从运行快照启动新 shell，模型在命令内显式修改 PATH 的行为仍遵循该 shell。

环境摘要中的 `bundledTools` 仅表示备用工具的名称、内置版本、可用性和不可用原因，不表示最终选中的系统版本，不包含环境原始值。损坏、缺失、无执行权限的工具逐项禁用，其他工具继续可用。重新开始或恢复时重新检查当前扩展资源，已经完成的命令不重放，预算及纠错计数保持原规则。

优先限定搜索范围，例如：

```bash
rg --threads 2 --glob '*.ts' -- 'pattern' src
fd --threads 2 --type f --extension ts . src
jq '.scripts' package.json
```

`rg` 退出码 1 表示没有匹配；原始 `run_command` 仍按命令退出码记录成功／失败。只有业务明确允许没有匹配的探查，才在同一次 shell 调用中显式处理该退出码。例如 Bash/Zsh/sh：

```bash
rg --threads 2 -- 'pattern' src
search_status=$?
if [ "$search_status" -eq 1 ]; then
  printf 'No matches\n'
elif [ "$search_status" -ne 0 ]; then
  exit "$search_status"
fi
```

不要无条件使用 `|| true`；实际搜索错误及验证命令失败必须保留。该示例不适用于要求存在匹配的验收，也不应套用到 `jq -e` 或其他程序。PowerShell／cmd 使用对应的 shell 语法。宿主不会自动重写命令、解析复合命令以修改退出码，或增加模型工具与设置页面。

## 开发、缓存与打包

[资产清单](../../resources/tools/manifest.json)锁定官方下载地址、版本、大小、SHA-256 和许可文件。获取工具是显式的开发步骤：

```bash
npm run tools:fetch
npm run tools:prepare
npm run check
npm run package
```

`tools:fetch` 串行下载到忽略的 `out/bundled-tools/cache/`，验证完整内容后才替换对应缓存。有效缓存可离线复用；网络错误、摘要变化、超限和不安全归档使该次获取失败，旧有效版本继续保留。地址和重定向只允许清单支持的上游 HTTPS 主机。

构建与监听构建会离线准备 `dist/tools/`；缺少有效缓存时明确要求运行获取命令，不隐式联网。解包只取清单指定文件，拒绝越界、链接、重复和截断条目。准备阶段检查静态 x64 ELF、摘要、权限及许可文件；包内检查再次验证实际 VSIX 内容。Linux 发布候选在 Linux 构建并验证执行权限；其他平台上的检查不代表已经验证 Linux 文件权限。

运行时只校验并使用扩展内资源，不依赖开发缓存。保持原有 Git、shell、项目语言工具链与依赖要求。随包授权声明见[第三方说明](../../THIRD_PARTY_NOTICES.md)；工具升级需要显式修改资产清单和摘要。

## 验证资源

验证采用小型临时仓库、受控 PATH 和本地模拟模型，不卸载或修改主机已有命令。综合检查、宿主测试和打包串行进行，沿用单 CPU、低优先级、256 MiB 测试堆及进程树资源监控；测试限制不构成产品命令的操作系统沙箱或固定内存配额。
