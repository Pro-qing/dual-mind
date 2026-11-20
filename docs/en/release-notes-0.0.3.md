# DualMind 0.0.3 — Execution and branch selection

[简体中文](../zh/release-notes-0.0.3.md) · [Documentation](./README.md)

**Status: local source version, unpublished.** Recorded 2026-11-20; local annotated tag: `v0.0.3`; extension identity remains `Pro-qing.dual-mind`. This is the source-record date, not a backdated publication. A local VSIX can be built using the development guide; no Marketplace upload or GitHub Release has been made.

## Changes

- Add Chat Completions/Responses streaming inference and tool adapters, independent Worker/Reviewer histories and frozen execution snapshots.
- Connect Reviewer planning, autonomous Worker implementation and command verification, Reviewer acceptance and revised plans; add round limits, pause/continue/stop, feedback and reload interruption.
- Add the activity-bar icon, native task sidebar, public streamed output, check evidence, paged records, diff preview and directory access.
- Tasks choose dedicated, current or a specified existing local branch. Direct runs require cleanliness each time and freeze branch/HEAD; viewing records never switches branches.
- Reviewer has no writing or command tools. Commands launch directly in the task directory without systemd/cgroup or fixed memory/swap quotas; timeouts, output limits and process-group shutdown remain.

- Stabilize Webview screenshot cleanup so expiring toasts cannot leave a wait for a vanished close button.

Includes the [0.0.2 foundations](./release-notes-0.0.2.md). Only one active task is allowed per workspace. No automatic commit, stash, fetch, merge or push occurs. Worker may prepare project dependencies under the plan, but does not automatically install system toolchains. Dedicated-worktree results remain for the user; direct modes do not undo files or switch back on stop/delete. Parallel tasks, automatic editor context and application of dedicated results remain unimplemented.

## Compatibility and environment

Draft/configuration storage stays at version 1 with no migration. Extension and storage versions are separate; dependency versions are unchanged. Older connections default to Chat Completions and older tasks to dedicated branches. Task commands follow the Linux execution baseline; directories and commands are not OS sandboxes.

## Initial candidate verification (historical)

Verified in this independent candidate source directory on 2026-11-20:

- Environment: Ubuntu 24.04.5 amd64, Node.js 24.22.3, Git 2.43.0 and local VS Code 1.141.0.
- Combined checks: all 22 environment and 87 local tests passed, along with types, lint, formatting and documentation checks.
- Build passed; both extension-host tests passed.
- Real Webview validation passed with 33 English/Chinese wide/narrow screenshots, using local mock endpoints, test credentials and temporary repositories.
- Each local batch was limited to 1 GiB/60 seconds and each Electron batch to 2 GiB/180 seconds; local tests were serial with a 512 MiB JavaScript heap, and validation services had swap disabled.

At that candidate stage, remote CI, new-version regression on the minimum editor/Ubuntu 20.04, packaging, installation and public distribution were not performed. These results prove only the listed local combination; older cross-environment results are not reused.

Subsequent changes implement separate task detail pages, structured bilingual errors, Reviewer-first plans with real-evidence acceptance, and the local command runner. See the [execution validation record](./execution-cycle-validation.md) for verification and packaging after removing systemd and fixed memory/swap requirements.
