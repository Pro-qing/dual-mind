# 架构说明

[English](../en/architecture.md) · [文档索引](./README.md)

## 已实现的本地工作台

`dualMind.openWorkbench` 创建或定位一个 React Webview 面板，面板渲染宿主快照后命令才完成；序列化恢复逻辑在窗口重载后重新打开面板。`dualMind.showStatus` 保留为本地化的就绪提示。命令、监听和面板随扩展生命周期释放。

宿主拥有本地状态并校验所有输入操作；React 管理页面导航、表单缓冲、弹窗和独立的只读示例预览。界面不发起模型请求，保存任务会创建草稿，不创建运行中的智能体会话。

## 仓库结构

```text
src/extension.ts   命令注册与扩展生命周期
src/workbench.ts   Webview 资源、CSP、消息传输与宿主输入框
src/core/         带校验的本地任务／配置存储
src/shared/       消息类型、双语界面文案和 Reviewer 定义
src/providers/    真实模型适配占位
src/editor/       上下文读取和结果应用占位
webview/src/      React 工作台、设置、表单、通信与自适应样式
resources/        随包 PNG 图标及归档品牌原图
scripts/          构建、检查、本地测试和真实 Webview 验证
tests/local/     存储与 React 交互测试
tests/            VS Code 扩展宿主测试
docs/design/     五个已审核 SVG 场景及 PNG 预览
docs/en/          English documentation
docs/zh/          中文文档
.github/          兼容性 CI 和协作模板
.vscode/          共享调试与构建任务
```

`resources/icon.png` 为扩展及 Marketplace 图标；`resources/branding/` 中的 JPEG 原图保留在 Git 中供维护，打包时排除。详见[品牌资源说明](../../resources/README.md)。

## 状态归属

| 状态                                               | 存储与行为                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 草稿与选中任务                                     | `ExtensionContext.workspaceState`，键为 `dualMind.local.workspace.v1`，要求已打开工作区 |
| 连接、模型默认值、自定义角色和内置角色分语言覆盖值 | `ExtensionContext.globalState`，键为 `dualMind.local.global.v1`                         |
| API 密钥                                           | `ExtensionContext.secrets`，以连接 ID 关联，不进入界面快照                              |
| 语言选择                                           | 用户设置 `dualMind.language`：`auto`、`zh-CN`、`en`                                     |
| 选中页面                                           | Webview 状态，重载后可恢复                                                              |
| 未保存表单、弹窗和示例预览                         | React 内存；示例不会进入任务存储                                                        |

存储层在同一宿主内串行处理写入，避免快速操作丢失状态；检查已存数据的版本和结构，发现不受支持的数据时报告错误，不覆盖原数据。持久化成功后宿主确认操作，并返回新快照；保存失败时保留表单供重试。

创建任务会保存一个 Reviewer 角色的名称、用途、指令和语言快照，编辑已有草稿仍保留该快照。内置角色覆盖值按语言独立保存，自定义内容标记为 `original`，不会自动翻译。Worker 始终是固定通用执行角色。删除角色不影响快照；删除连接会移除其密钥、清除对应默认值，并保留引用它的草稿供重新绑定。

## 界面与构建边界

宿主构建目标是 Node.js 20，以兼容 VS Code 1.100.0；开发工具链使用 nvm 管理的 Node.js 24。esbuild 分别输出 `dist/extension.js`、`dist/webview/main.js` 和 `dist/webview/main.css`。React 随包构建，安装用户无需 npm 依赖或外部 Web 服务。

Webview 只允许读取其构建目录，脚本使用 nonce CSP，禁止直接网络连接。API 密钥在宿主管理的密码框内录入，Webview 仅接收元信息与密钥存在状态。详见[已实现的消息边界](./protocol.md)。

宽度低于 1200 CSS 像素时折叠任务侧栏，低于 900 像素时对话上下排列。窄窗口设置和弹窗可以滚动，操作入口保持可见。颜色来自 VS Code 主题变量，两种语言共用组件及稳定角色 ID。

## 后续执行能力

[已审核设计](./design.md)也展示了并行任务执行与审查结果。真实模型适配、独立取消的会话、流式输出、暂停／停止、反馈和编辑器修改尚未实现。后续执行事件必须关联任务及执行实例，避免输出串入其他对话。Reviewer 审查通过必须与用户明确应用结果保持区分。
