# DualMind 0.0.8 — Model access and a theme-aware workbench

[简体中文](../zh/release-notes-0.0.8.md) · [Documentation](./README.md)

**Status: locally prepared; awaiting manual publication by the maintainer.** Recorded November 25, 2026. Extension identity remains `Pro-qing.dual-mind`, retaining the Preview flag and ordinary Marketplace channel. Local preparation does not mean uploaded or publicly released.

## Changes

- **Model access:** independently select OpenAI-compatible / Command Code providers and Chat Completions, Responses or Anthropic Messages. Save address/provider/protocol changes before fetching models. Keys remain in the VS Code host; manual model IDs and older client saves retain existing configuration and context windows.
- **Two-role review:** Reviewer plans, answers and reviews read-only, returning pass/fail, risk, confidence, issues and evidence; Worker changes files and runs commands. The host enforces completion protocol and artifact consistency, while command failures remain evidence for Reviewer judgment.
- **Compact interface:** titles and primary controls share a compact area; context/artifacts sit side by side with exclusive expansion. Chat/evidence group by user request and then Reviewer, Worker or System; untagged historical records remain readable.
- **Themes and narrow views:** backgrounds, controls, selection, roles and errors follow the active VS Code theme, including light, dark and both high-contrast themes. Expanded details at 240px preserve room for the composer; light high-contrast selected text remains readable.
- **Continued reading:** paginated records carry original request labels/status; identical text never merges distinct IDs. Fold, scroll and panel preferences stay separate, handled messages do not imply accepted tasks, and recovery, artifact operations and private-history separation remain intact.

Scenes 38–40 were approved November 25, 2026 with the requirement that backgrounds match the theme. Artwork remains in the original `docs/design/v0.0.7/` development archive. Version 0.0.8 includes all 40 approved SVG/PNG pairs without moving artwork or historical tags.

## Validation evidence

This round changes only manifest/lockfile project versions and documentation, checking runtime source, tests, scripts and design resources against the pre-version snapshot. Reuse the earlier `0.0.7-review-ui` evidence for the same implementation: 22 environment and seven asset checks, 346 local passes and one Windows-only skip; three VS Code 1.100.0 extension-host tests, 18 native sidebar/migration checks, 87 full real-Webview screenshots and 70 theme-matrix screenshots. The earlier complete `npm run check` hit an external 420-second limit; remaining tests passed in separate batches, so that overall invocation is not recorded as passing.

Actual 0.0.8 build, type, documentation/format, extension-host and packaging results are recorded in the [development log](./development-log.md) and independent build record. Full model/Git/UI regressions are not rerun for this metadata-only preparation; earlier results are not represented as new runs.

## Manual-publication artifacts

- `release/dual-mind-0.0.8.vsix`
- `release/dual-mind-0.0.8.vsix.sha256`
- `release/dual-mind-0.0.8-build.json`

At the maintainer’s subsequent request, archive the current work in a bilingual commit and local annotated tag `v0.0.8`, then rebuild the package from that clean commit. Its record identifies the exact commit, tag object and source/package hashes. Documentation links are pinned to `v0.0.8`; the maintainer manually pushes the commit/tag and follows [release instructions](./releasing.md) to verify and upload the same artifact. This round does not install, push or publish. Older artifacts and a copy of the previous uncommitted-workspace build remain intact.

The baseline remains Ubuntu 20.04+ x64, VS Code 1.100.0+ and Git 2.25+, with Node.js 24 for development. One task runs per workspace. Native Windows/macOS/ARM64, other editor versions, remote CI and paid model services are not validated by this round.
