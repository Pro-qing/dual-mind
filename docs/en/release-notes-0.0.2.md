# DualMind 0.0.2 — Configuration and Git foundations

[简体中文](../zh/release-notes-0.0.2.md) · [Documentation](./README.md)

**Status: local source version, unpublished.** Recorded 2026-11-20; local annotated tag: `v0.0.2`; extension identity remains `Pro-qing.dual-mind`. This is the source-record date, not a backdated publication. No new VSIX, Marketplace upload or GitHub Release is produced.

## Changes

- Explicit model-list queries preserve endpoint prefixes and enforce cancellation, timeout and response limits; IDs support search, selection and manual input.
- Move Worker/Reviewer defaults to a separate settings tab; preserve independent drafts/role instruction snapshots and clarify missing-connection/model-list states.
- Add Git 2.25+ detection, lazy per-task dedicated branch/worktree preparation and role-bound file interfaces; Reviewer is read-only.
- Repair the local toolchain while retaining project Node.js 24; serialize bounded tests and support reuse of installed VS Code.

Does not include inference, streamed conversations, task execution, an activity-bar entry or task-level branch selection. Start stays disabled and saving a draft creates no branch. Future context-isolation contracts are not evidence of implemented runtime isolation.

## Compatibility and environment

Draft/configuration storage stays at version 1 with no migration. Extension and storage versions are separate; dependency versions are unchanged.

## Verification for this record

Verified in this independent candidate source directory on 2026-11-20:

- Environment: Ubuntu 24.04.5 amd64, Node.js 24.22.3, Git 2.43.0 and local VS Code 1.141.0.
- Combined checks: all 22 environment and 60 local tests passed, along with types, lint, formatting and documentation checks.
- Build passed; both extension-host tests passed.
- Real Webview validation passed with 20 English/Chinese wide/narrow screenshots, using local mock endpoints, test credentials and temporary repositories.
- Each local batch was limited to 1 GiB/60 seconds and each Electron batch to 2 GiB/180 seconds; local tests were serial with a 512 MiB JavaScript heap, and validation services had swap disabled.

Remote CI, new-version regression on the minimum editor/Ubuntu 20.04, packaging, installation and public distribution were not performed. These results prove only the listed local combination; older cross-environment results are not reused.
