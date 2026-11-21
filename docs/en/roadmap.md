# Roadmap

[简体中文](../zh/roadmap.md) · [Documentation](./README.md)

**Source version: 0.0.3 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.3 version notes](./release-notes-0.0.3.md).

| Version           | Status                                    | Delivered scope                                                                          |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0.0.1 Preview 1/2 | Historical public releases                | Local workbench, settings, role presets, languages and read-only examples                |
| 0.0.2             | Local source version, unpublished         | Model discovery, separate defaults, role data isolation and Git preparation              |
| 0.0.3             | Current local source version, unpublished | Dual-protocol streamed execution, review loops, activity bar and three branch strategies |

0.0.3 implements Reviewer planning, autonomous Worker implementation and verification, read-only Reviewer acceptance and revised plans, pause/continue/stop, reload interruption, diff preview and local branch selection. Task chat supports read-only questions, queued messages during execution and continued changes. One task runs per workspace. Direct modes modify the opened project; start/restart requires a clean directory, while chat continuation retains the bound directory and uncommitted artifacts and obtains fresh evidence.

Still planned: parallel tasks, automatic editor-context collection and explicit application of dedicated-worktree results to the original workspace. Approval never automatically commits, merges or pushes.

The 17 approved SVG/PNG scenes remain design references, not proof of implementation. Historical [Preview 2](./release-notes-preview-2.md)/[Preview 1](./release-notes.md) and published assets are preserved. Public distribution remains a separate [release workflow](./releasing.md).
