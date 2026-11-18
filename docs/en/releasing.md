# Packaging and GitHub preview releases

[简体中文](../zh/releasing.md) · [Documentation](./README.md)

## Preview identity

| Item              | Value                                    |
| ----------------- | ---------------------------------------- |
| Extension version | `0.0.1`                                  |
| Git tag           | `v0.0.1-preview.1`                       |
| Release title     | `DualMind 0.0.1 Preview 1`               |
| Release type      | GitHub pre-release                       |
| Assets            | `dual-mind-0.0.1.vsix`, `SHA256SUMS.txt` |
| License           | MIT, copyright `2026 Pro-qing`           |

The existing extension ID remains `dual-mind-dev-placeholder.dual-mind` for this preview. `private: true` protects against npm publication; it does not prohibit GitHub VSIX distribution. The [release notes](./release-notes.md) describe available features and limits. A draft or local package is not a public release; use GitHub's actual publication timestamp once published.

## Prepare and validate locally

Use the shared [environment baseline](./environment.md): Ubuntu 20.04+ amd64, VS Code 1.100.0+, and nvm-managed Node.js 24 for development. Use Xvfb/xauth and the documented Electron libraries for headless tests. At the repository root:

```bash
nvm use
npm ci
npm run check
VSCODE_TEST_VERSION=1.100.0 npm test
VSCODE_TEST_VERSION=stable npm test
DUAL_MIND_RELEASE_REF=v0.0.1-preview.1 npm run package
(cd release && sha256sum dual-mind-0.0.1.vsix > SHA256SUMS.txt)
(cd release && sha256sum --check SHA256SUMS.txt)
```

On a headless machine, prefix each editor test with `xvfb-run -a`. For runtime or UI changes, also run `npm run test:ui` (or `xvfb-run -a npm run test:ui`).

`npm run package` rebuilds the extension and React bundle, then creates the VSIX. `DUAL_MIND_RELEASE_REF` pins rewritten README/changelog links and images to the release tag instead of the moving default branch. Ordinary local packaging can omit it. The license bypass has been removed. Inspect the package for `LICENSE.txt`, third-party notices, both localization files, the host and Webview bundles, bilingual docs, and all five SVG/PNG pairs; development sources, secrets, test profiles, maps, and previous VSIX files must be absent.

Install the prepared package in a separate VS Code profile/extension directory and check opening the workbench, language switching, draft saving, and reload persistence. This checks packaged resources independently of development paths. The install command for normal local use is:

```bash
code --install-extension release/dual-mind-0.0.1.vsix --force
```

Reload the window and run **DualMind: Open Workbench**. The same-version force update is appropriate for this initial local preview; later published builds should increment the extension version rather than silently replace an existing release artifact.

## Commit, CI, and release draft

1. Review the bilingual documentation, feature claims, security reporting channel, license metadata, and changelog. Preserve the approved design assets. Do not invent contact details or claim publication before it happens.
2. Commit the preparation as `chore: prepare v0.0.1 preview release`, then push `master`. `release/`, dependencies, generated bundles, and verification screenshots stay ignored.
3. Wait for all CI jobs on that exact commit to succeed: Ubuntu 20.04 with VS Code 1.100.0 and stable, plus Ubuntu 24.04 stable. The Ubuntu 20.04 stable job also exercises the real Webview and packaging.
4. Open the repository's **Releases → Draft a new release**. Set tag `v0.0.1-preview.1` to the tested preparation commit, enter the title above, and mark the release as a pre-release rather than latest.
5. Add the English and Chinese release notes, including the baseline, installation command, current limits, commit SHA, tested editor versions, and VSIX SHA-256. Upload the two prepared assets. Use absolute repository/tag links in the GitHub body, since its relative-link context differs from the documentation files.
6. Save the draft and check the target/tag, title, release flags, full body, asset names/sizes, hashes, and verified private vulnerability-reporting link before publishing.

The GitHub API may be used for the same draft/upload/publish flow with an authorized account. Do not put credentials in repository files or command arguments. A draft must not be published if the required CI or asset checks fail.

## Publish and verify the downloaded files

Publish the reviewed draft. Record the returned Release URL, `published_at` timestamp, preparation commit, tag, and VSIX digest in the release record; the timestamp is recorded only after GitHub confirms publication.

Download both assets from the published Release into a fresh directory. Run `sha256sum --check SHA256SUMS.txt`, compare the digest with the prepared artifact, and verify the downloaded VSIX in an isolated installation. Check workbench opening, language changes, and saved drafts. Keep the resulting verification record locally under the ignored release directory. If verification fails, report the actual release state and fix it through an explicit follow-up release; do not report a completed verification.

The [GitHub documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) describes the web flow. Assets and checksums belong in the Release, not in the source tree.

## Later Marketplace publication

Marketplace distribution is a separate milestone: register a final publisher, replace the development publisher consistently (including tests and migration considerations), prepare the final icon and listing, and validate that release. The current MIT license and GitHub preview do not register a Marketplace publisher. Real model features must be described only after implementation. This repository has no automatic Marketplace publishing workflow or embedded publication token.
