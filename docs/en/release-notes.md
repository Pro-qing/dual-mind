# DualMind 0.0.1 Preview 1

[简体中文](../zh/release-notes.md) · [Documentation](./README.md)

**Release tag:** `v0.0.1-preview.1` · **Extension version:** `0.0.1` · **License:** [MIT](../../LICENSE)

**Published:** 2026-11-18 10:41:36 UTC+08:00 (Asia/Hong_Kong). Download the versioned assets from the [GitHub Release](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.1). The release tag points to preparation commit `af9ff3d91e5a31eb313c32563e9c633e26f68515`; these publication notes were updated after the release was confirmed.

## Included

- One React workbench tab with responsive Worker / Reviewer columns, workspace task drafts, selection, editing, and confirmed deletion.
- Local OpenAI-compatible connection metadata and separate default models for each agent; API keys are entered through a native password prompt and stored by VS Code.
- Bug, Feature, Review, and Refactor Reviewer presets, independent English/Chinese instructions, custom roles, and per-task instruction snapshots. Worker keeps its fixed role.
- Persistent language selection (`auto`, `zh-CN`, `en`), localized UI and errors, and original-language custom content.
- An isolated read-only example view; local data survives reopening/reloading and task lists remain workspace-scoped.
- Five approved SVG/PNG references, bilingual guides, MIT licensing, and bundled third-party notices.

## Limitations

This is an early local-workbench preview. Real model requests, connection tests, streamed conversations, concurrent execution, review loops, feedback submission, pause/stop, editor context collection, and applying code are not implemented. Corresponding execution controls are disabled. Running states in examples are illustrative and do not execute agents.

The extension identifier is still `dual-mind-dev-placeholder.dual-mind`. This preview is distributed through GitHub, with Marketplace publisher setup reserved for a later milestone.

## Requirements and installation

The supported baseline is **Ubuntu 20.04+ on x86_64/amd64 and VS Code 1.100.0+**. Other platforms and ARM64 are not yet validated. Installing the VSIX does not require a separate Node.js installation. Source development uses nvm-managed Node.js 24.

Download both `dual-mind-0.0.1.vsix` and `SHA256SUMS.txt` from the Release assets into the same directory, then run:

```bash
sha256sum --check SHA256SUMS.txt
code --install-extension dual-mind-0.0.1.vsix --force
```

Reload VS Code and run **DualMind: Open Workbench** (Chinese editor: **DualMind: 打开工作台**). Open a folder before saving drafts. Settings contains the language selector. See [Usage](./usage.md) for configuration and update details.

## Validation

The local-workbench baseline passed 21 environment tests and 21 store/React interaction tests, type/lint/format checks, bilingual documentation links, and all five design-pair checks. Extension-host tests cover actual React rendering, singleton tabs, and reopening on VS Code 1.100.0 and stable. Real Webview validation covers language changes, role snapshots, reload persistence, workspace isolation, and wide/narrow screenshots.

The release preparation reran the checks and passed all three CI jobs on the tagged commit. Local extension-host tests passed on VS Code 1.100.0 and stable 1.146.0. The MIT-licensed VSIX was installed independently before publication. After publication, both public assets were downloaded without authentication and their SHA-256 values matched; the downloaded VSIX passed workbench opening, language switching, task saving, and reload persistence on VS Code 1.100.0.

VSIX SHA-256: `a28641501de5f54dbd4dc19f5d6670525191c105a83d87986b0fd8f13800bdd0`. The [exact-commit CI run](https://github.com/Pro-qing/dual-mind/actions/runs/44224284575) and GitHub release body record the validation results.

## Feedback and license

Use repository issues for ordinary bugs and feature requests. Report vulnerabilities privately as described in [SECURITY](../../SECURITY.md). Preview releases have no guaranteed support duration or response SLA.

DualMind is licensed under MIT, copyright `2026 Pro-qing`. Bundled React-related licenses are retained in [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md).
