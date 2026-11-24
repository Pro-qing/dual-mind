# Branding and screenshots / 品牌资源与截图

[icon.png](./icon.png) is the 256 × 256 PNG used by the extension and Marketplace. The user-provided [JPEG source](./branding/dual-mind.jpeg) is archived unchanged at 1408 × 768. The icon uses the centered 768 × 768 crop `(320, 0, 1088, 768)`, downsampled with Lanczos; the artwork and lettering are not stretched or redrawn.

[icon.png](./icon.png) 是扩展及 Marketplace 使用的 256 × 256 PNG。用户提供的 [JPEG 源图](./branding/dual-mind.jpeg)以原始 1408 × 768 尺寸完整归档。图标从中央裁取 768 × 768 区域 `(320, 0, 1088, 768)`，采用 Lanczos 缩小，主体和文字没有拉伸或重绘。

`icon.png` and the code-authored `activity-icon.svg` are included in the VSIX. The source JPEG and this note remain in Git for later maintenance. This conversion uses local image tools and adds no extension runtime dependency.

VSIX 包含 `icon.png` 和代码编写的活动栏图标 `activity-icon.svg`，原始 JPEG 和本文保留在 Git 中便于后续维护。转换使用本地图像工具，不新增扩展运行时依赖。

## Product screenshot / 产品截图

[dualmind-workbench.png](./screenshots/dualmind-workbench.png) is shared by the English and Chinese project READMEs. It shows the current native task view in VS Code 1.100.0, captured on November 24, 2026 from an isolated profile using the built-in read-only **Fix retry cancellation** example. The visible requirement and Worker/Reviewer messages are illustrative; the example makes no model requests and edits no project files.

中英文项目 README 共用该截图，展示当前原生任务界面。2026-11-24 使用 VS Code 1.100.0 的隔离配置打开内置只读“修复重试取消问题”英文示例，画面中的需求和 Worker／Reviewer 消息均为演示内容，不发送模型请求、不修改项目文件。

The 1008 × 948 PNG captures the sidebar and activity bar, cropping the surrounding editor space. UI text, controls and styling are unmodified. The existing host/Webview bundles matched the previously validated bundled-tools candidate; no product rebuild was required. This image is a screenshot, separate from the numbered design archive. The package file list includes it alongside the existing icons; no VSIX was rebuilt for this documentation change.

PNG 尺寸为 1008 × 948，保留侧栏与活动栏，裁去外围编辑器区域；未替换界面文字、控件或样式。使用的宿主／前端构建与先前已验证的内置工具候选包摘要一致，无需重新构建产品。这是真实界面截图，不计入编号设计稿；打包文件清单包含该截图与原有图标，本次文档修改未重建 VSIX。
