# Roadmap

[简体中文](../zh/roadmap.md) · [Documentation](./README.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Current capabilities:** [worktrees, context summaries and artifact operations](./task-lifecycle.md), together with [tool-error handling](./tool-errors.md), were introduced in 0.0.6 with host and frontend support. [Scenes 30–34](./task-lifecycle-proposal.md) and [scenes 35–37](./tool-errors-proposal.md) retain their original approval and implementation records.

**Source version: 0.0.7 · Local release preparation; not publicly released.** Recorded November 24, 2026. See the [0.0.7 version notes](./release-notes-0.0.7.md) for changes, validation and the local artifact. Publication is handled separately by the maintainer; historical version records retain their original meaning.

| Version           | Status                                          | Delivered scope                                                                                            |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0.0.1 Preview 1/2 | Historical public releases                      | Local workbench, settings, role presets, languages and read-only examples                                  |
| 0.0.2             | Local source version, unpublished               | Model discovery, separate defaults, role data isolation and Git preparation                                |
| 0.0.3             | Previous local source version, unpublished      | Dual-protocol streamed execution, review loops, activity bar and three branch strategies                   |
| 0.0.4             | Earlier local source and VSIX, unpublished      | Universal shell, independent Reviewer verification, process display and recovery                           |
| 0.0.5             | Earlier local source, VSIX and tag, unpublished | Native sidebar, legacy-tab migration, terminal separation and versioned designs                            |
| 0.0.6             | Previous local version, unpublished             | Compact home, worktree artifacts, context summaries, tool recovery, bundled CLI and local Python           |
| 0.0.7             | Current local preparation, unpublished          | Uncapped model/tool calls, legacy-limit recovery, acceptance diagnostics and background-command completion |

0.0.6 includes Reviewer planning, autonomous Worker implementation and verification, independent Reviewer verification, acceptance and revised plans, pause/continue/stop, reload interruption, diff preview and local branch selection. Task chat supports read-only questions, queued messages during execution and continued changes. One task runs per workspace. Direct modes modify the opened project; start/restart requires a clean directory, while chat continuation retains the bound directory and uncommitted artifacts and obtains fresh evidence.

Still planned: parallel tasks and automatic editor-context collection. Artifact host operations and UI are integrated. Approval never automatically commits, merges or pushes.

The design archive contains 40 SVG/PNG pairs: 37 approved and three pending review. Scenes 38–40 propose provider controls and compact task/log layouts; their UI implementation awaits explicit approval. Artwork remains a design reference, not proof of implementation. Historical [Preview 2](./release-notes-preview-2.md)/[Preview 1](./release-notes.md) and published assets are preserved. Public distribution remains a separate [release workflow](./releasing.md).

[Native sidebar workbench](./sidebar-workbench-proposal.md) scenes 24–27 were **approved on November 22, 2026** and implemented on November 23. The complete workbench uses the Primary or Secondary Side Bar, compact navigation, collapsible task details and manual **Keep Terminal in Editor Area**. Old editor tabs are retained only for migration. The original 27 design approvals and historical artwork are preserved.

- [Bundled command-line tools](./bundled-tools.md): offline CLI fallbacks, system priority and integrity checks.

- [Local Python](./local-python.md): discover existing Python 2.7/3 and project environments without bundling or installing an interpreter.
