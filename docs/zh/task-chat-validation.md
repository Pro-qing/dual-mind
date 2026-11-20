# 任务聊天验证记录

[English](../en/task-chat-validation.md) · [开发日志](./development-log.md)

日期：2026-11-20。四组设计已审核，当前功能已接入，完整检查、扩展宿主与真实 UI 验证通过。本记录追加本次结果，不覆盖[此前执行循环验证](./execution-cycle-validation.md)中的失败、限制或跳过项。

验证使用本地模拟模型、测试凭据、临时 Git 仓库和真实命令。覆盖两种模型协议、三种 Git 策略的未提交成果续接、只读答复、独立证据、消息排队与持久化。未访问付费模型，不把本地模拟等同于第三方服务验证；本轮不扩大 Ubuntu/Linux 支持边界。

## 环境与已执行结果

- Ubuntu 20.04.6 amd64，Node.js 24.22.3，Git 2.25.1，本机 VS Code 1.141.0，现有桌面显示。
- 两种协议的 14 项新增执行测试通过：三种 Git 策略续接、问答不运行 Worker、消息幂等、队列、暂停、停止与重载、绑定变化、轮次上限、最终验收前处理消息及凭据脱敏。
- 其中两项续接测试实际运行 Node 命令，确认新运行引用新生成的成功记录，不混用上次证据。产品命令不要求 systemd，不跳过真实命令验证。
- 界面与会话专项共 35 项通过，包括原有界面回归、独立分页、流式记录合并、消息恢复、长文本脱敏、IME、失败重试、语言切换、展开状态、焦点与历史滚动。
- `npm run test:ui` 在 VS Code 1.141.0 通过，生成 49 张宽／窄中英文截图；真实本地模拟模型与命令覆盖原来的修订验收、自定义命令、只读流程、三种 Git 策略，以及新增追问、继续修改、执行中排队、停止、重载与消息保留。
- 首轮截图发现输入框被顶部内容挤出视口，调整为剩余视口高度布局后重跑通过；脚本加入输入框底部不超过视口的断言。分页测试中沿用了错误的旧按钮名称，修正测试选择器后通过。
- `npm run check` 通过：137 项本地测试、22 项环境测试，零失败、零跳过；类型、lint、格式和文档检查通过。文档检查覆盖 63 个 Markdown、490 个本地链接、26 组语言配对和 17 组 SVG／PNG。
- `VSCODE_TEST_EXECUTABLE=/usr/share/code/code npm test` 通过：2 项扩展宿主测试，退出码 0。
- `npm run package` 通过，生成 `release/dual-mind-0.0.3.vsix`（98 个文件，约 2.7 MB）；只生成本地安装包，没有安装、推送或公开发布。

## 覆盖边界

本次未重跑 VS Code 1.100.0、其他操作系统／CPU 架构或第三方在线模型。继续使用此前 Ubuntu/Linux 基线，不将未运行项目计为通过。外层开发验证保留 512 MiB JS 堆、CPU 和超时预算；本机混合 cgroup 的内存限制能力沿用[此前验证记录](./execution-cycle-validation.md)说明，不将它写成产品命令前置要求。

截图位于 `.vscode-test/ui-validation/1.141.0/`，包含 `en-chat-followup-answer.png`、`en-chat-followup-modification.png`、`en-chat-queued-message.png`、`en-chat-current-continuation.png`、`en-chat-branch-continuation.png` 和 `en-execution-evidence-drawer.png`。这些是真实 UI 截图，与审核用静态 SVG／PNG 分开。
