# DualMind 0.0.1 Preview 2

[简体中文](../zh/release-notes-preview-2.md) · [Documentation](./README.md)

**Git tag:** `v0.0.1-preview.2` · **Extension version:** `0.0.1` · **Publisher:** `Pro-qing` · **Extension ID:** `Pro-qing.dual-mind` · **License:** [MIT](../../LICENSE)

**GitHub published:** 2026-11-18 11:24:18 UTC+08:00 (Asia/Hong_Kong). The [GitHub Release](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) provides the verified VSIX and checksum, targeting commit `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`.

**Marketplace published:** 2026-11-18 11:31:39 UTC+08:00. The [public listing](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) identifies `Pro-qing.dual-mind` version `0.0.1` and carries the Preview label. The two services' publication states were verified independently.

## Changes from Preview 1

- Replace the development publisher with the registered publisher ID supplied by the owner, `Pro-qing`. Keep the extension version at `0.0.1` for this first Marketplace identity.
- Add the [256 × 256 PNG icon](../../resources/icon.png). The supplied JPEG is archived unchanged in Git; the icon is a centered 768 × 768 crop reduced without distortion. Only the PNG is packaged.
- Set `preview: true` for the Marketplace preview label. The VSIX is a **regular package**, not a Marketplace pre-release-channel package; no `--pre-release` build flag is used. The separate GitHub Release is marked as a pre-release.
- Update the extension-host identity check, bilingual installation instructions, publishing instructions, and current documentation links.
- Retain all five approved SVG/PNG interface designs, MIT licensing, and third-party notices.

The [Preview 1 release notes](./release-notes.md), its tag, public VSIX and checksum remain available as historical artifacts. Preview 2 gets a new tag and assets; it does not replace Preview 1, even though both extension manifests use version `0.0.1`.

## Switching from the development identity

`dual-mind-dev-placeholder.dual-mind` and `Pro-qing.dual-mind` are different extensions. Before opening the new one, locate the old identity in Extensions and **Disable** it, then reload VS Code to avoid duplicate commands. Keep the old installation if you want to retain its stored records.

No automatic migration is provided. Create new drafts and reconfigure connections, credentials, model defaults, and custom roles under `Pro-qing.dual-mind`. The new package does not delete or read the old extension's data. The user setting `dualMind.language` keeps the same key and can remain effective. Do not interpret `--force` as a cross-publisher migration.

## Included functionality and limits

The local React workbench supports workspace drafts, connection metadata, native key entry via VS Code secret storage, four bilingual built-in Reviewer definitions, original-language custom roles, task snapshots, language selection, and isolated read-only examples. Worker keeps its fixed implementation role.

Real model requests, connection tests, streaming, parallel execution, automated review, feedback submission, pause/stop, editor context collection, and code application remain unimplemented. Their controls are disabled; examples do not execute agents.

## Requirements and installation

Supported baseline: **Ubuntu 20.04+ on x86_64/amd64 and VS Code 1.100.0+**. Other platforms and ARM64 are not yet validated. The VSIX does not require a separate Node.js installation. Source development uses nvm-managed Node.js 24.

In VS Code Extensions, search `@id:Pro-qing.dual-mind`, verify Publisher **Pro-qing**, and select **Install**, or run:

```bash
code --install-extension Pro-qing.dual-mind
```

For a VSIX installation, download `dual-mind-0.0.1.vsix` and `SHA256SUMS.txt` from **GitHub Preview 2** into the same directory. Install only if verification succeeds:

```bash
sha256sum --check SHA256SUMS.txt && code --install-extension dual-mind-0.0.1.vsix --force
```

Reload VS Code and run **DualMind: Open Workbench** (Chinese UI: **DualMind: 打开工作台**). Confirm the installed extension ID is `Pro-qing.dual-mind`. Open a folder before creating drafts. See [Usage](./usage.md) for switching, installation, and workbench settings.

## Distribution and later updates

The first Marketplace publication is complete. Future releases update the existing `Pro-qing.dual-mind` listing with a higher extension version. The `preview: true` label is independent of both the Marketplace pre-release channel and GitHub's pre-release flag.

Marketplace renders the README from the uploaded package. Editing GitHub documents does not update that listing automatically; its older publication wording still needs to be refreshed with the next version's package. Keep the published Preview 1/2 tags and assets as historical records. See [Packaging and releases](./releasing.md) for the update workflow.

## Verification and history

The following records cover release preparation and the downloaded GitHub VSIX. Marketplace publication was verified separately from its public listing; this documentation update does not add a new Marketplace installation test result.

Release preparation passed metadata and 256 × 256 PNG checks, package asset/exclusion checks, 21 environment tests, 21 local store/React tests, types, lint, format and bilingual documentation links. Extension-host tests passed on VS Code 1.100.0 and stable 1.146.0. All three CI jobs on the release commit passed. Both the prepared package and the independently downloaded public VSIX passed isolated installation on VS Code 1.100.0, including native icon display, publisher/version, workbench, language switching, draft saving and reload persistence. Public asset hashes match the prepared files.

VSIX SHA-256: `c219356f3e253102f3b779012e49dd0f4e586d02d00e22a95a7d3f50074ce848`. The [release-commit CI run](https://github.com/Pro-qing/dual-mind/actions/runs/44229630530) and GitHub body record the validation evidence and actual publication time. Vulnerabilities use the private channel in [SECURITY](../../SECURITY.md); ordinary feedback uses repository issues.
