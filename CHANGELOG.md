# Changelog

[简体中文](./CHANGELOG.zh.md) · [Project home](./README.md)

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
