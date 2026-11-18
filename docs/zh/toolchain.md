# 骨架来源

[English](../en/toolchain.md) · [文档索引](./README.md)

初始骨架于 **2026-11-17** 使用以下环境生成：

| 工具                                   | 版本                 |
| -------------------------------------- | -------------------- |
| 通过 nvm 安装的 Node.js                | 24.22.3              |
| 该 Node 环境自带的 npm                 | 11.19.1              |
| Yeoman（`yo`）                         | 7.0.1                |
| VS Code 扩展生成器（`generator-code`） | 1.12.0               |
| 生成器模板                             | TypeScript + esbuild |

生成器在临时目录运行，关闭自动安装依赖、打开编辑器及 Git 初始化。其插件入口、清单、构建约定、测试运行器和编辑器配置经过调整后合入现有仓库，保留原 Git 历史和双语 README 入口。

```bash
nvm use 24
dualmind_template_dir=$(mktemp -d /tmp/dual-mind-template.XXXXXX)
npm exec --yes --package=yo@7.0.1 --package=generator-code@1.12.0 --   yo code "$dualmind_template_dir" --extensionType=ts   --extensionDisplayName=DualMind --extensionId=dual-mind   --pkgManager=npm --bundler=esbuild --gitInit=false   --skip-install --skipOpen --skip-cache --quick
```

该命令用于记录来源，不要在现有工作目录上重新生成。日常开发使用 `npm ci`，无需运行 Yeoman。

生成器默认要求的较新 VS Code 版本调整为 `^1.100.0`，`@types/vscode` 固定为 `1.100.0`，并通过最低版本集成测试验证。TypeScript 使用生成器兼容的 6.0 版本线，避免选用超出 lint 解析器支持范围的大版本。实际依赖版本由锁文件记录。设计通过后，本地工作台引入 React 和 React DOM 19.3.1。锁文件同时记录类型、Testing Library、jsdom 26.1.0 和 Playwright Core；后者使用 VS Code 自身的 Electron 验证界面。
