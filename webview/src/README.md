# UI source / 界面源码

`App.tsx` owns navigation and language changes. `Tasks.tsx` manages task home, detail, shared forms and the isolated example preview; `Settings.tsx` edits connection and Reviewer configuration. `bridge.ts` correlates host requests and acknowledgements. Styles follow VS Code theme variables. See [the Webview overview](../README.md).

`App.tsx` 管理导航和语言切换，`Tasks.tsx` 管理任务主页、详情、共用表单及隔离示例，`Settings.tsx` 编辑连接和 Reviewer 配置，`bridge.ts` 关联宿主请求与确认。样式使用 VS Code 主题变量，详见 [Webview 概述](../README.md)。

`RunDetail.tsx` renders plans, submissions, acceptance and command evidence; `Execution.tsx` provides execution controls and optional advanced custom commands.

`RunDetail.tsx` 展示方案、成果提交、验收与命令证据；`Execution.tsx` 提供执行控制及可选的高级自定义命令。
