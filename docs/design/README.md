# Versioned designs / 按版本归档的设计稿

[English design guide](../en/design.md) · [中文设计说明](../zh/design.md)

**37 approved SVG/PNG pairs.** Scenes 28–34 were approved for integration on November 23, 2026; scenes 35–37 implement the tool-error UI confirmed in the same round. / **37 组 SVG／PNG 均已确认。** 场景 28–34 于本轮审核通过，35–37 按同轮确认方案实施。

| Development version / 开发版本 | Scenes / 场景 | Pairs / 组数 | Scope / 内容                                                       |
| ------------------------------ | ------------- | ------------ | ------------------------------------------------------------------ |
| [v0.0.1](./v0.0.1/README.md)   | 1–5           | 5            | Basic workbench and forms / 基础工作台与表单                       |
| [v0.0.2](./v0.0.2/README.md)   | 6–7           | 2            | Model discovery and selection / 模型查询与选择                     |
| [v0.0.3](./v0.0.3/README.md)   | 8–17          | 10           | Task pages, acceptance and chat / 任务页面、验收与聊天             |
| [v0.0.4](./v0.0.4/README.md)   | 18–23         | 6            | Process, compact chat and recovery / 过程提示、紧凑聊天与恢复      |
| [v0.0.5](./v0.0.5/README.md)   | 24–37         | 14           | Sidebar, compact home and lifecycle / 侧栏、紧凑主页与任务生命周期 |

The 37 approved pairs are grouped by their development version, with commit provenance in each folder. A folder describes that version's design changes, not a copy of all earlier designs or a guarantee that every scene existed in its initial tag. In particular, scenes 8–17 followed the original `v0.0.3` tag. Existing tags and artwork are not rewritten. The sidebar is assigned to 0.0.5 by the November 23, 2026 version decision; its earlier 0.0.4 validation record remains historical.

37 组已审核设计按所属开发版本归档，各目录记录来源提交。目录收录该版本新增的设计，不重复复制前版，也不表示全部场景已包含在初始标签中；其中场景 8–17 晚于初始 `v0.0.3` 标签。已有标签和原图不改写。侧栏按 2026-11-23 的版本决定归入 0.0.5，早先的 0.0.4 验证记录保留为历史。

New or revised designs belong in `docs/design/v<major>.<minor>.<patch>/`, with a same-name SVG/PNG pair and an entry in that folder's README. Add a version row here and update both language guides and proposal links. Keep older approved designs in place. `npm run docs:check` validates version directories, local links and all SVG/PNG pairs, including original scenes 1–7.

后续新增或修订稿放入 `docs/design/v<主版本>.<次版本>.<修订号>/`，同名 SVG／PNG 配对，并登记到该目录 README。本索引新增版本行，同步中英文设计说明和提案链接；旧版本已审核原稿继续保留。`npm run docs:check` 检查版本目录、本地链接和全部图稿配对，并确保基础场景 1–7 未缺失。

Local commits after the original version tags are listed in the [0.0.5 provenance](./v0.0.5/README.md) and [development log](../en/development-log.md). / 原版本标签之后的本地提交见 [0.0.5 归属记录](./v0.0.5/README.md)和[开发日志](../zh/development-log.md)。

The 0.0.6 package includes all 37 existing pairs in their original development directories; this version adds no new artwork. / 0.0.6 安装包包含全部 37 组图稿，沿用原开发目录；本次版本准备不新增图稿。
