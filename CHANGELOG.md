# Changelog

[简体中文](./CHANGELOG.zh.md) · [Project home](./README.md)

## 0.0.6 — Complete task workflow and local Python (locally prepared, unpublished, 2026-11-24)

- Include changes after the original `v0.0.5` tag: compact task home, worktree bases, automatic context summaries and user-controlled artifact commits, merges, preservation, cleanup and restoration, with frontend integration.
- Separate tool execution and command outcomes; reject invalid batches, skip tails after failure, pause after three failures without progress, and retain evidence, budgets and recovery boundaries.
- Bundle offline Linux x64 rg/fd/jq fallbacks with system priority. Discover existing Python 2.7/3 and project environments for both roles without bundling or installing Python.
- Refocus README and extension descriptions on the product, adding an actual read-only example screenshot while preserving 37 design pairs and historical approvals.
- Update version metadata, current bilingual documentation and release navigation; organize local commits, annotated `v0.0.6` and a separate VSIX. See [0.0.6 notes](./docs/en/release-notes-0.0.6.md) for actual checks, artifacts and omissions. No push, installation or publication in this round.

## 0.0.5 — Native sidebar and versioned designs (local, unpublished, 2026-11-23)

- Host the full workbench in the native VS Code Primary/Secondary Side Bar, with compact layouts, manual terminal centering, view recreation and legacy-tab migration. Execution remains independent of the page.
- Retain universal shell execution, independent Reviewer verification, public process, compact chat, task branch names and failure recovery.
- Move 27 design pairs into development-version folders `docs/design/v0.0.1/` through `v0.0.5/`, add indexes and update all links and recursive validation without changing artwork.
- Set the extension and lockfile root versions to 0.0.5, commit the current implementation and create local annotated tag `v0.0.5`. No push, installation or public release. See the [0.0.5 version notes](./docs/en/release-notes-0.0.5.md).

## 0.0.4 — Local package (unpublished, 2026-11-21)

- Package the current source as 0.0.4, including the still-publicly-unreleased task chat, follow-up and documentation conventions recorded below. This packaging action adds no runtime features.
- Synchronize extension/lockfile versions, bilingual current-version notes and navigation, retaining historical versions and validation records.
- Document explicit nvm selection of Node.js 24, preservation of the machine default and return to the system version.
- See the [0.0.4 version notes](./docs/en/release-notes-0.0.4.md) and [development log](./docs/en/development-log.md) for local scope, actual checks and limitations; installed-version registration is recorded separately from behavior validation, with no public distribution.

## Unreleased — Development rules and documentation synchronization (2026-11-21)

- Require repository-wide documentation review after code changes, synchronized English/Chinese updates in the same change, and bilingual development-log entries even when no text update is needed.
- Require English and Simplified Chinese in new commit subjects and corresponding bilingual bodies when present; add message examples and a PR check.
- Update PR checks and current descriptions of command execution, the 17 designs and approval status, chat layout, follow-up and release operations.
- Preserve historical releases, designs and validation records. This change updates documentation and the template only; see the [development log](./docs/en/development-log.md) for actual review and checks.

## Unreleased — Task chat and follow-up (2026-11-20)

- Replaced large role cards with compact model bars, labelled chat, independent evidence and a persistent composer.
- Added Reviewer read-only answers, continued modifications, active-message queues, durable messages and idempotent processing.
- Preserved manual start, all Git strategies, real evidence, round budgets and pause/stop/reload boundaries; commands retain the direct process runner.
- Updated bilingual documentation and the [development log](./docs/en/development-log.md); see [actual chat validation](./docs/en/task-chat-validation.md).

## 0.0.3 — Local source version (unpublished)

Recorded 2026-11-20; local annotated tag `v0.0.3`. This does not indicate a Marketplace update or a GitHub Release. The entries below preserve the initial tag’s historical capabilities; subsequent source revisions are described in the unreleased entries above and the [0.0.3 version notes](./docs/en/release-notes-0.0.3.md).

- Add Chat Completions/Responses streaming inference and tool adapters, independent Worker/Reviewer histories and frozen execution snapshots.
- Connect preparation commands, Worker edits, all preset checks, Reviewer review and revisions; add round limits, pause/continue/stop, feedback and reload interruption.
- Add the activity-bar icon, native task sidebar, public streamed output, check evidence, paged records, diff preview and directory access.
- Tasks choose dedicated, current or a specified existing local branch. Direct runs require cleanliness each time and freeze branch/HEAD; viewing records never switches branches.
- Reviewer has no writing or command tools. In this initial version, commands required user-systemd resource limits, with no unrestricted fallback. This is a historical record: the runner was subsequently replaced with direct processes. See [runner revision validation](./docs/en/execution-cycle-validation.md#local-command-runner-verification-2026-11-20) and the current [security boundaries](./SECURITY.md).

See the [0.0.3 version notes](./docs/en/release-notes-0.0.3.md) for scope, limitations and verification.

## 0.0.2 — Local source version (unpublished)

Recorded 2026-11-20; local annotated tag `v0.0.2`. This does not indicate a Marketplace update or a GitHub Release.

- Explicit model-list queries preserve endpoint prefixes and enforce cancellation, timeout and response limits; IDs support search, selection and manual input.
- Move Worker/Reviewer defaults to a separate settings tab; preserve independent drafts/role instruction snapshots and clarify missing-connection/model-list states.
- Add Git 2.25+ detection, lazy per-task dedicated branch/worktree preparation and role-bound file interfaces; Reviewer is read-only.
- Repair the local toolchain while retaining project Node.js 24; serialize bounded tests and support reuse of installed VS Code.

See the [0.0.2 version notes](./docs/en/release-notes-0.0.2.md) for scope, limitations and verification.

## 0.0.1 — Preview 2

GitHub published 2026-11-18 (11:24:18, UTC+08:00). [Pre-release `v0.0.1-preview.2`](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) targets commit `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`. [Marketplace](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) published `Pro-qing.dual-mind` version `0.0.1` on 2026-11-18 (11:31:39, UTC+08:00); its public Preview listing has been verified separately.

- Set Publisher to `Pro-qing`, with extension ID `Pro-qing.dual-mind`; retain version `0.0.1` and add `preview: true`.
- Add the 256 × 256 PNG icon from the owner's centered JPEG artwork, archive the unchanged source, and package only the icon.
- Update extension-host identity checks and bilingual switching/upload instructions. New-identity data is configured afresh; no migration or deletion of old data is performed.
- Distribute the regular VSIX through GitHub Preview 2 and publish `Pro-qing.dual-mind` on Marketplace. Preserve Preview 1's tag/assets and all approved interface designs.
- Local-workbench features and execution limitations are unchanged; see [Preview 2 release notes](./docs/en/release-notes-preview-2.md).

## 0.0.1 — Preview 1

Published 2026-11-18 (10:41:36, UTC+08:00). [GitHub pre-release `v0.0.1-preview.1`](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.1) targets commit `af9ff3d91e5a31eb313c32563e9c633e26f68515`.

- Implement a React workbench with workspace-scoped task drafts, connection settings, native API-key entry, Reviewer presets, and captured role instructions.
- Add persistent English / Simplified Chinese selection, independently editable built-in definitions, and original-language custom content.
- Add an isolated read-only example preview. Real model execution, connection tests, streaming, review loops, and code application remain unavailable.
- Provide the extension entry, F5 debugging, esbuild host/frontend bundles, nvm-managed Node.js 24, and Ubuntu 20.04+ amd64 validation with VS Code 1.100.0 as the minimum editor.
- Add environment tests, local store/React tests, real extension-host/UI checks, bilingual documents, contribution templates, and GitHub Actions validation.
- Preserve all five approved SVG/PNG designs; clearly distinguish illustrated execution states from local-workbench functionality.
- Adopt MIT with copyright `2026 Pro-qing`, include bundled third-party notices, remove the missing-license packaging bypass, and prepare VSIX/checksum Release assets.
- Update security documentation for the implemented Webview and credential storage; enable and verify GitHub private vulnerability reporting.

Full scope, installation, limitations, and verification are described in the [release notes](./docs/en/release-notes.md). At the time of Preview 1, Marketplace registration and real model collaboration were future milestones.
