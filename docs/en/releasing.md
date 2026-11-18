# Packaging and synchronized releases

[简体中文](../zh/releasing.md) · [Documentation](./README.md)

## Current published version

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

The local workbench is available from both services. Real model requests, connection tests, review loops, and code application remain planned. The Preview label, Marketplace pre-release channel, and GitHub pre-release flag are separate concepts. `private: true` remains an npm publishing safeguard.

## Preview 2 first publication — historical record

- GitHub published [Preview 2](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) on **2026-11-18 at 11:24:18 UTC+08:00**, targeting commit `7fda78008f19c9c30e2a1342de8b03f5ff0f22d4`. Validation results and the public VSIX checksum remain in the [Preview 2 notes](./release-notes-preview-2.md).
- Marketplace published `Pro-qing.dual-mind` version `0.0.1` on **2026-11-18 at 11:31:39 UTC+08:00**. The **New extension → Visual Studio Code** flow was for this publisher's first upload. Future releases update the existing listing.
- Preview 1 used a different publisher. Retaining extension version `0.0.1` was specific to the new identity's first publication. Preview 1's [release notes](./release-notes.md), tag, assets, and stored user data are preserved. The [usage guide](./usage.md) explains disabling the old identity and configuring the new one without automatic migration.

Both previews are already published. Keep their tags and attachments intact; the following procedure uses a new extension version and a new tag.

## Icon and package inputs

The original 1408 × 768 JPEG is archived unchanged at `resources/branding/dual-mind.jpeg`. The packaged PNG uses its centered crop `(320, 0, 1088, 768)`, reduced to 256 × 256 with Lanczos. The image is not stretched. `.vscodeignore` allows `resources/icon.png` while excluding the source JPEG and other resource-maintenance files. Approved interface SVG/PNG designs remain in the package.

## Prepare the next version

1. Choose an extension version higher than the version already published under `Pro-qing.dual-mind`. Update `package.json`, `package-lock.json`, bilingual changelogs and release notes. Choose an unused release tag matching that version. Describe a release as being prepared until its publication is confirmed; do not invent a publication date or validation result.
2. Use the [environment baseline](./environment.md): Ubuntu 20.04+ amd64, VS Code 1.100.0+, and nvm-managed Node.js 24. Run the checks below. For runtime/UI changes, also run `npm run test:ui`.
3. Review the diff, create the release preparation commit, push `master`, and wait for CI on that exact commit: Ubuntu 20.04 with VS Code 1.100.0/stable and Ubuntu 24.04 stable. The Ubuntu 20.04 stable job also validates the real Webview and packaging.
4. Create and push the unused release tag pointing to that validated commit. Use a clean checkout at that tag for the distributable package. If source or documentation changes before packaging, validate the new commit and finalize the tag against it before proceeding. Never move an already published tag.

```bash
nvm use
npm ci
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

`npm run package` rebuilds the extension host and Webview. `DUAL_MIND_RELEASE_REF` fixes packaged README/changelog links to the new tag. The output is `release/dual-mind-<version>.vsix`; running packaging again for that version overwrites the local file. Keep release candidates and downloaded verification copies in separate locations. Generated bundles, screenshots, VSIX files and checksum files remain ignored by Git.

Inspect the VSIX manifest for Publisher `Pro-qing`, ID `dual-mind`, the chosen new version, the Preview flag, and the PNG icon. For the current distribution policy, it remains a regular Marketplace-channel package. Verify inclusion of the MIT license, third-party notices, bilingual metadata/docs, host/frontend bundles, and all five approved SVG/PNG pairs. The source JPEG, development sources, tests, credentials and source maps must be absent.

Install the package in an isolated user profile/extensions directory. Verify the icon, identity/version, workbench, both languages, draft saving and reload recovery. Keep only the intended extension identity enabled in that profile.

## Publish the same artifact to both services

1. Prepare a GitHub Release draft using the already validated new tag, a title matching the new version, bilingual notes, and the VSIX/checksum from the same build. During the current preview stage, select **Pre-release** and do not mark it as latest. Review the commit, links, features/limitations, and asset hashes before publication.
2. Sign in to the [publisher management page](https://marketplace.visualstudio.com/manage) as the owner of **Pro-qing**. Open the existing **DualMind** extension and upload the new version's VSIX. Confirm the extension ID, version, icon, Preview label and README; wait for validation and public availability.
3. Publish the reviewed GitHub Release draft. Record each service's public URL and actual publication time independently. If only one service has completed publication, describe only that service as updated.
4. Download the GitHub VSIX and checksum into a fresh directory, run `sha256sum --check SHA256SUMS.txt`, and compare the digest with the prepared artifact. Install the download in isolation. Separately install/update `Pro-qing.dual-mind` through Marketplace, confirm the new version, and verify workbench opening, language switching and draft persistence.
5. Record the release commit, tag, VSIX SHA-256, both publication times, and the actual installation results. Update bilingual status documents after confirmation. Preserve all historical tags and public assets.

## Refreshing the Marketplace description

Marketplace displays the README from the uploaded extension package. Committing or pushing GitHub documentation does not automatically update that description. As checked on **2026-11-18**, the public `0.0.1` listing still contains the package's older publication-preparation wording. Include the corrected README in the next version's package and verify the displayed description after uploading it. The repository documentation update alone does not complete this step.

Official references: [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [Extension manifest](https://code.visualstudio.com/api/references/extension-manifest), and [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository). API credentials must not be stored in source files or exposed in command arguments.
