# Native sidebar workbench validation

[简体中文](../zh/sidebar-workbench-validation.md) · [Design approval](./sidebar-workbench-proposal.md) · [Development log](./development-log.md)

**Version assignment (November 23, 2026):** this document retains the initial sidebar implementation/validation with a 0.0.4 candidate. Current source is **0.0.5**; scenes 24–27 now live in `docs/design/v0.0.5/`, corresponding to local tag `v0.0.5`. See the [0.0.5 notes](./release-notes-0.0.5.md) for this version operation.

Date: November 23, 2026. Scenes 24–27 were approved on November 22. Version remains 0.0.4; this record covers the unpublished local sidebar implementation and preserves historical release/validation records.

## Environment and coverage

Local environment: Ubuntu 24.04.5 x64, Node.js 24.22.3, real desktop VS Code 1.141.0 and downloaded minimum version 1.100.0. Tests use isolated profiles, temporary workspaces, simulated local models and test credentials. No paid endpoint is contacted.

`verify-ui.mjs` retains both protocol execution chains, independent Reviewer acceptance, command failures, stop, reload recovery, chat and minimization regression. `verify-sidebar.mjs` uses a temporary old-version extension to create a real serialized editor tab before loading production code. A temporarily broken frontend tests retention on migration failure, retry after repair and precedence of existing sidebar state. Tests do not change the user's installation.

Sidebar scenarios cover English/Chinese 240/320/480/800px layouts, drafts and reading position, Primary/Secondary Side Bars, position swaps, hiding/reveal, centered/justified terminals and window reload. Width is measured at the native sidebar boundary; VS Code borders reduce Webview width. Short windows and form actions are checked against actual visible bounds.

## Results

| Check                      | Actual result                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`            | Passed: 22 environment tests; 216 local cases, 215 passes and one Windows-only skip; types, lint, formatting and docs passed                                     |
| Extension host             | Two passing cases each on VS Code 1.141.0 and 1.100.0                                                                                                            |
| Real execution/chat UI     | 68 screenshots per version; both protocols, commands, acceptance, continuation, hide/reveal during execution, localization and narrow/wide layouts passed        |
| Native sidebar/migration   | 18 passing scenarios per version: failure retry, state precedence, four widths, low height, terminal sizing, secondary placement, position swap, hide and reload |
| Minimum-version full entry | `VSCODE_TEST_VERSION=1.100.0 npm run test:ui` passed, running both UI scripts in sequence                                                                        |
| Packaging                  | `npm run package` produces the local 0.0.4 VSIX; delivered copy: `release/dual-mind-0.0.4-sidebar.vsix`, with ZIP integrity and manifest checks                  |

On installed VS Code 1.141.0, the execution/chat script and final native sidebar script passed separately. Iteration exposed obsolete selectors, delayed native-menu mouse handlers and stale Frame references after moving the page; corrected tests verified actual placement. Product fixes cover provider readiness during migration, ordered display-state writes, the legacy-tab closure boundary and late handshakes. Static designs are not substituted for runtime screenshots.

Final documentation validation covers 77 Markdown files, 796 local links, 33 language pairs and 27 approved design pairs. VSIX version stays 0.0.4; its checksum is stored separately in `release/dual-mind-0.0.4-sidebar.vsix.sha256`.

## Artifacts and limits

Actual screenshots and machine-readable results live in `.vscode-test/ui-validation/<version>/sidebar/` and `sidebar-native/`, separate from approved static drawings in `docs/design/`. Extension-host tests check registration, repeat opens, hide/reveal and absence of new editor tabs.

Native macOS, Windows, ARM64 and Ubuntu 20.04 were not run locally. Existing native CI and the minimum-platform baseline remain; unrun cases are not passes. No automatic installation, commit, push or publication.
