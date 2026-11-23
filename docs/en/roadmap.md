# Roadmap

[简体中文](../zh/roadmap.md) · [Documentation](./README.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Current uncommitted feature revision:** host support for [worktrees, context summaries, and artifacts](./task-lifecycle.md) is implemented. [Scenes 30–34](./task-lifecycle-proposal.md) are approved and connected; [scenes 35–37](./tool-errors-proposal.md) cover the new tool-result UI. Version 0.0.5 and existing tags are retained.

**Source version: 0.0.5 · Local source tag `v0.0.5` · Unpublished.** Recorded November 23, 2026. Includes the native sidebar workbench and versioned design archives. A local commit, tag and VSIX do not imply a remote push or Marketplace/GitHub publication. Earlier version records remain unchanged. See the [0.0.5 version notes](./release-notes-0.0.5.md).

| Version           | Status                                          | Delivered scope                                                                          |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0.0.1 Preview 1/2 | Historical public releases                      | Local workbench, settings, role presets, languages and read-only examples                |
| 0.0.2             | Local source version, unpublished               | Model discovery, separate defaults, role data isolation and Git preparation              |
| 0.0.3             | Previous local source version, unpublished      | Dual-protocol streamed execution, review loops, activity bar and three branch strategies |
| 0.0.4             | Earlier local source and VSIX, unpublished      | Universal shell, independent Reviewer verification, process display and recovery         |
| 0.0.5             | Current local source, VSIX and tag, unpublished | Native sidebar, legacy-tab migration, terminal separation and versioned designs          |

0.0.5 includes Reviewer planning, autonomous Worker implementation and verification, independent Reviewer verification, acceptance and revised plans, pause/continue/stop, reload interruption, diff preview and local branch selection. Task chat supports read-only questions, queued messages during execution and continued changes. One task runs per workspace. Direct modes modify the opened project; start/restart requires a clean directory, while chat continuation retains the bound directory and uncommitted artifacts and obtains fresh evidence.

Still planned: parallel tasks and automatic editor-context collection. Artifact host operations and UI are integrated. Approval never automatically commits, merges or pushes.

The design archive contains 37 approved SVG/PNG pairs, including [compact task-list scenes 28–29](./task-home-compact-proposal.md), lifecycle controls and tool-error handling, documenting current uncommitted changes. Artwork remains a design reference, not proof of implementation. Historical [Preview 2](./release-notes-preview-2.md)/[Preview 1](./release-notes.md) and published assets are preserved. Public distribution remains a separate [release workflow](./releasing.md).

[Native sidebar workbench](./sidebar-workbench-proposal.md) scenes 24–27 were **approved on November 22, 2026** and implemented on November 23. The complete workbench uses the Primary or Secondary Side Bar, compact navigation, collapsible task details and manual **Keep Terminal in Editor Area**. Old editor tabs are retained only for migration. All 27 design approvals and historical artwork are preserved.

- [Bundled command-line tools](./bundled-tools.md): offline CLI fallbacks, system priority and integrity checks.
