# DualMind 0.0.5 — Native sidebar and versioned design archives

[简体中文](../zh/release-notes-0.0.5.md) · [Documentation](./README.md)

**Local Git archive update (November 23, 2026):** the implementation is committed by feature on local `master`, after the original `v0.0.5` tag. Scenes 28–37 are approved and implemented. Earlier review, uncommitted-state and tag statements below retain their historical context; see the [development log](./development-log.md) for current provenance.

**Status: local source and VSIX, unpublished.** Recorded November 23, 2026; extension ID `Pro-qing.dual-mind`, version `0.0.5`, local annotated tag `v0.0.5`. The tag targets the commit containing the sidebar implementation, archive changes and version update, rather than a preceding commit. This operation does not push the tag, install the extension or publish to Marketplace/GitHub Releases.

## Included changes

- Move the full workbench into the native sidebar, preserving Open/New/Select Task commands, Primary/Secondary Side Bar placement and the user's saved position. Add manual **Keep Terminal in Editor Area**.
- Host execution continues when views are hidden or moved; reveal refreshes records and callbacks target their originating page. Legacy tabs migrate display state, existing sidebar state wins, and failed initialization can retry.
- Compact navigation, single-column settings, collapsible task details and chat filling the remaining height with its composer at the bottom. Minimized output, errors and Continue execution remain available.
- Include the previously implemented universal shell, independent Reviewer verification, task naming and reliable recovery. Toolchain requirements, role permissions, execution protocols, data versions and dependency versions are unchanged.
- Archive 27 design pairs by development version, mapped in the [design index](../design/README.md). The 0.0.3 folder includes later revisions after its initial tag; historical tags are not moved. File-by-file SHA-256 checks preserve SVG/PNG contents unchanged.

## Validation and artifacts

- `npm run check` passed under Node.js 24.22.3: 22 environment tests; 219 local cases, 218 passes and one Windows-only skip; types, lint, formatting and documentation checks passed.
- Extension-host tests passed two cases each on VS Code 1.100.0 and installed 1.141.0, covering sidebar registration, repeat opening, hide/reveal and no added editor tabs.
- `npm run package` passed. Candidate ZIP integrity, extension version 0.0.5, versioned paths for 27 design pairs and six design indexes were verified. All 54 packaged assets match their original SHA-256 values. The final package is built from the clean `v0.0.5` checkout with README links pinned to that tag.
- Final documentation checks passed: 85 Markdown files, 894 local links, 34 language pairs and 27 design pairs; `git diff --check` passed.
- This step changes version metadata, design archives and documentation checks without further product UI changes. Full real UI regression was not repeated. The preceding phase's 68 execution/chat screenshots and 18 native sidebar scenarios per editor version remain in [sidebar validation](./sidebar-workbench-validation.md), explicitly recorded against its 0.0.4 candidate.

Local artifact: `release/dual-mind-0.0.5.vsix`; checksum: `release/dual-mind-0.0.5.vsix.sha256`. Git ignores packages/screenshots; the source tag records reproducible build inputs. Installation and publication are separate operations.

## Coverage limits

Local validation uses Ubuntu 24.04.5 x64 / Node.js 24.22.3. Minimum VS Code remains 1.100.0. Native macOS, Windows, ARM64, Ubuntu 20.04 and remote CI were not run for this operation; existing baselines/CI remain, and unrun checks are not passes. One task runs per workspace; parallel execution and automatic merging of dedicated-worktree results remain unimplemented.
