# 调用本机 Python

[English](../en/local-python.md) · [使用说明](./usage.md) · [命令执行](./shell-execution.md)

DualMind 使用本机已有的 Python 2.7／3 和项目依赖环境，不随包携带、下载或安装 Python。Worker、Reviewer 继续通过 `run_command` 执行脚本、读取文件和处理信息；解释器选择没有新增设置页面。

## 准备时自动发现

任务准备及恢复时，宿主先捕获登录环境，再按顺序检查：

1. 实际任务目录中的 `.venv`、`venv`。
2. 环境变量 `VIRTUAL_ENV`、`CONDA_PREFIX` 指向的现有环境。
3. PATH 中的 `python3`、`python2`、`python`、`python2.7`。

每个环境使用第一个已有的标准解释器入口；Unix 检查 `bin/python`、`bin/python3`、`bin/python2`、`bin/python2.7`，Windows 检查 `Scripts/python.exe`、`python.exe`、`Scripts/python3.exe`、`Scripts/python2.exe`。PATH 候选保留实际调用路径，不通过真实路径合并指向同一系统二进制的不同虚拟环境。显式空 PATH 条目按任务当前目录解析，未设置 PATH 时不假定系统搜索目录。

仅检查上述位置，不遍历全盘、不列出全部 Conda／pyenv 环境。隔离工作树不自动搜索原项目目录的虚拟环境；已激活环境仍可从变量或 PATH 发现。用户明确指定的其他解释器可由 AI 通过普通命令核查。

每次发现最多检查八个候选，串行执行；每项运行最多两秒，总发现预算八秒，预算用尽后剩余候选标为跳过。输出上限为 stdout／stderr 合计 4 KiB。进程清理仍须确认退出，清理时间遵循现有进程树规则，可能超过探测运行预算。

身份探测采用 `-E -s -S -B`，不载入 site 初始化、用户包路径或 Python 环境变量配置，不写入字节码；导入 JSON 前移除当前目录搜索项，避免执行项目中的同名模块。只读取版本、解释器实现和可执行路径，不枚举或导入第三方依赖。真实业务脚本仍按原有命令及项目环境运行，不自动附加探测参数。

## AI 如何使用

环境信息向两个角色提供每个候选的路径、来源、版本、实现及可用状态。一般信息处理优先 Python 3；Python 2 只用于明确要求它的脚本。不根据 `python` 名字猜测主版本。

选择满足项目版本要求的项目环境，其次是已激活环境，最后是 PATH 解释器。使用完整的调用路径，并按实际 shell 正确引用；同一个解释器同时用于依赖检查和 `-m pip`，例如 Bash：

```bash
'/path/to/project/.venv/bin/python' scripts/inspect_data.py
'/path/to/project/.venv/bin/python' -c 'import json; print(json.load(open("data.json")))'
'/path/to/project/.venv/bin/python' -m pip --version
```

`available` 表示身份探测成功，不保证项目所需的包、原生扩展或工具链已安装。缺少依赖时沿用项目依赖规则，不安装系统解释器、不修改全局环境；不要因为脚本失败就自动切换主版本重跑。失败退出码、批次跳过和重复错误计数保留原有语义。

发现结果是准备时的快照，同一次运行复用。新建或更改虚拟环境后，AI 可以通过 `run_command` 重新核查；列表不是全部可用解释器的保证。恢复会重新发现当前环境，并继续原阶段，保留预算和已完成操作。

## 故障与记录

缺失、无执行权限、启动失败、超时、输出超限、异常响应或不支持的版本仅使对应候选不可用；完全没有 Python 不阻止无需 Python 的任务。候选来源顺序仍保留，AI 只能把验证成功的条目作为可用解释器。

每个已进入探测的候选都有独立 `environment` 操作记录，在启动前保存意图并登记进程身份。取消会清理进程；信任或绑定变化、持久化失败、进程停止无法确认会中断推进。探测不计业务工具／模型轮次预算，不构成命令验收证据。只持久化经过脱敏的规范化身份和状态，不记录原始探测输出、环境变量值或包清单。

协议类型见[通信协议](./protocol.md)，实际平台和验证结果见[开发日志](./development-log.md)。首轮本地验证以 Ubuntu x64 为准，不扩大其他平台的已验证结论。
