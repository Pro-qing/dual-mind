# Packaging and synchronized releases

[简体中文](../zh/releasing.md) · [Documentation](./README.md)

**Source version: 0.0.7 · Local release preparation; not publicly released.** Recorded November 24, 2026. See the [0.0.7 version notes](./release-notes-0.0.7.md) for changes, validation and the local artifact. Publication is handled separately by the maintainer; historical version records retain their original meaning.

## 0.0.7 local delivery

After repair validation, update the source version to 0.0.7 and validate the final files. Archive a bilingual local commit and annotated `v0.0.7` tag, then build from that clean commit with `DUAL_MIND_RELEASE_REF=v0.0.7 npm run package`. Deliver `release/dual-mind-0.0.7.vsix`, its `.vsix.sha256` and `dual-mind-0.0.7-build.json`. The build record identifies the exact commit, source/package hashes, toolchain, checks and limitations. Verify the package in isolated editor user/extension directories. Old packages and task worktrees remain intact.

The maintainer handles pushing and publication. Packaged links pinned to `v0.0.7` become available after that tag is pushed. Do not treat local package preparation as public release. Actual checks are recorded in the [development log](./development-log.md) and [0.0.7 notes](./release-notes-0.0.7.md).

## Historical local 0.0.6 delivery

This round organizes the existing product introduction, local Python support and complete feature set into three bilingual commits, setting the project version to 0.0.6. Build a separate package from the final clean commit with documentation links pinned to `v0.0.6`, then create the local annotated tag on that same commit after package verification. Preserve earlier versions, artwork, task worktrees and packages.

Deliver `release/dual-mind-0.0.6.vsix`, `release/dual-mind-0.0.6.vsix.sha256` and `release/dual-mind-0.0.6-build.json`. The build record captures the exact commit, source/package hashes, environment, executed checks and omissions. Like the artifact, it is ignored by Git so final package hashes do not require editing tagged source. The bilingual [version notes](./release-notes-0.0.6.md) can supply publication text.

This delivery commits, tags and packages locally, without pushing, installing or publishing. The maintainer later pushes `master`, checks CI for that exact commit, then pushes `v0.0.6`; packaged documentation links resolve once the tag is available remotely. Confirm that the tag, build record and CI identify one commit before uploading the same verified VSIX to both services. If source changes are needed, validate and prepare the corresponding artifact again; do not describe an earlier package as built from a later commit.

Verify the delivered package from the project root:

```bash
(cd release && sha256sum --check dual-mind-0.0.6.vsix.sha256)
```

See the [version notes](./release-notes-0.0.6.md) for local checks and reused UI evidence. Remote CI, isolated installation and publication require their own recorded outcomes. The general workflow and historical records follow.

## Historical 0.0.1 publication

| Item                        | Value                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Publisher / extension ID    | `Pro-qing` / `Pro-qing.dual-mind`                                                                 |
| Extension version           | `0.0.1`                                                                                           |
| Marketplace                 | [Public since 2026-11-18](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) |
| Marketplace label / channel | `preview: true` / regular VSIX, no `--pre-release`                                                |
| Icon                        | `resources/icon.png`, 256 × 256 PNG                                                               |
| Git tag / title             | `v0.0.1-preview.2` / `DualMind 0.0.1 Preview 2`                                                   |
| GitHub release type         | Pre-release, published 2026-11-18                                                                 |
| Assets                      | `dual-mind-0.0.1.vsix`, `SHA256SUMS.txt`                                                          |
| License                     | MIT, copyright `2026 Pro-qing`                                                                    |

The table describes the historical 0.0.1 artifact. Current source capabilities are documented in the version notes above. The Preview label, Marketplace pre-release channel, and GitHub pre-release flag are separate concepts. `private: true` remains an npm publishing safeguard.

## Preview 2 first publication — historical record

- GitHub published [Preview 2](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) on **2026-11-18 at 11:24:18 UTC+08:00**, targeting commit `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`. Validation results and the public VSIX checksum remain in the [Preview 2 notes](./release-notes-preview-2.md).
- Marketplace published `Pro-qing.dual-mind` version `0.0.1` on **2026-11-18 at 11:31:39 UTC+08:00**. The **New extension → Visual Studio Code** flow was for this publisher's first upload. Future releases update the existing listing.
- Preview 1 used a different publisher. Retaining extension version `0.0.1` was specific to the new identity's first publication. Preview 1's [release notes](./release-notes.md), tag, assets, and stored user data are preserved. The [usage guide](./usage.md) explains disabling the old identity and configuring the new one without automatic migration.

Both previews are already published. Keep their tags and attachments intact; the following procedure uses a new extension version and a new tag.

## Icon and package inputs

The original 1408 × 768 JPEG is archived unchanged at `resources/branding/dual-mind.jpeg`. The packaged PNG uses its centered crop `(320, 0, 1088, 768)`, reduced to 256 × 256 with Lanczos. The image is not stretched. `.vscodeignore` allows the icon, activity-bar SVG, bundled-tool manifest and `resources/screenshots/dualmind-workbench.png`, while excluding the source JPEG and resource-maintenance files. All 37 approved interface SVG/PNG pairs remain in the package. See [asset provenance](../../resources/README.md) for the actual interface screenshot.

## Prepare the next version

1. Choose an extension version higher than the version already published under `Pro-qing.dual-mind`. Update `package.json`, `package-lock.json`, bilingual changelogs and release notes. Choose an unused release tag matching that version. Describe a release as being prepared until its publication is confirmed; do not invent a publication date or validation result.
2. Use the [environment baseline](./environment.md): Ubuntu 20.04+ amd64, VS Code 1.100.0+, and nvm-managed Node.js 24. Run the checks below. For runtime/UI changes, also run `npm run test:ui`.
3. Review the diff, create the release preparation commit, push `master`, and wait for CI on that exact commit: Ubuntu 20.04 with VS Code 1.100.0/stable and Ubuntu 24.04 stable. The Ubuntu 20.04 stable job also validates the real Webview and packaging.
4. Create and push the unused release tag pointing to that validated commit. Use a clean checkout at that tag for the distributable package. If source or documentation changes before packaging, validate the new commit and finalize the tag against it before proceeding. Never move an already published tag.

```bash
nvm use
npm ci
npm run tools:fetch
npm run check
VSCODE_TEST_VERSION=1.100.0 npm test
VSCODE_TEST_VERSION=stable npm test
```

Headless editor tests need the documented Electron libraries, Xvfb and xauth. Use `VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test`, `VSCODE_TEST_VERSION=stable xvfb-run -a npm test`, and `xvfb-run -a npm run test:ui` where applicable.

## Build and verify the release artifact

From the clean checkout of the new tag, load nvm and install locked dependencies as above. Build the distributable VSIX once, then use those same bytes for both services. This Bash block requires a clean tracked working tree and a tag at `HEAD`; the subshell stops on failure without changing the parent shell's options:

```bash
(
  set -eu
  test -z "$(git status --porcelain)"
  release_version="$(node -p 'require("./package.json").version')"
  release_tag="$(git describe --tags --exact-match HEAD)"
  DUAL_MIND_RELEASE_REF="$release_tag" npm run package
  cd release
  sha256sum "dual-mind-${release_version}.vsix" > SHA256SUMS.txt
  sha256sum --check SHA256SUMS.txt
)
```

`npm run package` rebuilds the extension host and Webview. `DUAL_MIND_RELEASE_REF` fixes packaged README/changelog links to the new tag. The output is `release/dual-mind-<version>.vsix`; running packaging again for that version overwrites the local file. Keep release candidates and downloaded verification copies in separate locations. Generated bundles, validation screenshots, VSIX files and checksum files remain ignored by Git; the product image `resources/screenshots/dualmind-workbench.png` is tracked and included in the package.

Inspect the VSIX manifest for Publisher `Pro-qing`, ID `dual-mind`, the chosen new version, the Preview flag, and the PNG icon. For the current distribution policy, it remains a regular Marketplace-channel package. Verify inclusion of the MIT license, third-party notices, bilingual metadata/docs, host/frontend bundles, and all 37 approved SVG/PNG pairs in their version directories, the product screenshot, and rg/fd/jq executables with upstream licenses. The source JPEG, development sources, tests, credentials and source maps must be absent.

Install the package in an isolated user profile/extensions directory. Verify the icon, identity/version, workbench, both languages, task creation/saving and reload recovery. Keep only the intended extension identity enabled in that profile.

## Publish the same artifact to both services

1. Prepare a GitHub Release draft using the already validated new tag, a title matching the new version, bilingual notes, and the VSIX/checksum from the same build. During the current preview stage, select **Pre-release** and do not mark it as latest. Review the commit, links, features/limitations, and asset hashes before publication.
2. Sign in to the [publisher management page](https://marketplace.visualstudio.com/manage) as the owner of **Pro-qing**. Open the existing **DualMind** extension and upload the new version's VSIX. Confirm the extension ID, version, icon, Preview label and README; wait for validation and public availability.
3. Publish the reviewed GitHub Release draft. Record each service's public URL and actual publication time independently. If only one service has completed publication, describe only that service as updated.
4. Download the GitHub VSIX and checksum into a fresh directory, run `sha256sum --check SHA256SUMS.txt`, and compare the digest with the prepared artifact. Install the download in isolation. Separately install/update `Pro-qing.dual-mind` through Marketplace, confirm the new version, and verify workbench opening, language switching and task persistence.
5. Record the release commit, tag, VSIX SHA-256, both publication times, and the actual installation results. Update bilingual status documents after confirmation. Preserve all historical tags and public assets.

## Refreshing the Marketplace description

Marketplace displays the README from the uploaded extension package. Committing or pushing GitHub documentation does not automatically update that description. As checked on **2026-11-18**, the public `0.0.1` listing still contains the package's older publication-preparation wording. Include the corrected README in the next version's package and verify the displayed description after uploading it. The repository documentation update alone does not complete this step.

Official references: [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [Extension manifest](https://code.visualstudio.com/api/references/extension-manifest), and [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository). API credentials must not be stored in source files or exposed in command arguments.

**Historical record (November 23, 2026):** `v0.0.5` is the local annotated source tag created then, containing sidebar implementation, design reorganization and version metadata. That operation did not push tags, install the extension or publish a release. Historical `v0.0.2`/`v0.0.3` tags and older VSIX files are retained. Public distribution still requires the exact-commit and target-platform CI checks above. See the [0.0.5 version notes](./release-notes-0.0.5.md) for that local operation and its actual validation.

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).

## Local Python

0.0.6 discovers existing Python 2.7/3 and project environments for both roles to invoke through commands. Python is neither shipped in the VSIX nor downloaded at installation or runtime; see [Local Python](./local-python.md).
