# Packaging, Marketplace upload, and GitHub previews

[简体中文](../zh/releasing.md) · [Documentation](./README.md)

## Preview 2 identity

| Item                        | Value                                              |
| --------------------------- | -------------------------------------------------- |
| Publisher / extension ID    | `Pro-qing` / `Pro-qing.dual-mind`                  |
| Extension version           | `0.0.1`                                            |
| Marketplace label / channel | `preview: true` / regular VSIX, no `--pre-release` |
| Icon                        | `resources/icon.png`, 256 × 256 PNG                |
| Git tag / title             | `v0.0.1-preview.2` / `DualMind 0.0.1 Preview 2`    |
| GitHub release type         | Pre-release                                        |
| Assets                      | `dual-mind-0.0.1.vsix`, `SHA256SUMS.txt`           |
| License                     | MIT, copyright `2026 Pro-qing`                     |

The owner supplied the registered Publisher ID `Pro-qing`. This package is prepared for its first Marketplace upload; **the listing remains pending until the owner uploads it and Marketplace confirms publication**. The VSIX's Preview label and the GitHub pre-release flag are independent of the Marketplace pre-release channel.

The extension version intentionally remains `0.0.1`: the publisher change creates a new extension identity. Preview 1's development identity, tag, attachments, and [release notes](./release-notes.md) are preserved. See [Preview 2 notes](./release-notes-preview-2.md) and [Usage](./usage.md) for switching: disable the old extension, keep its stored data, and configure the new identity afresh. There is no automatic migration. `private: true` remains an npm publishing safeguard.

## Icon and package inputs

The original 1408 × 768 JPEG is archived unchanged at `resources/branding/dual-mind.jpeg`. The packaged PNG uses its centered crop `(320, 0, 1088, 768)`, reduced to 256 × 256 with Lanczos. The image is not stretched. `.vscodeignore` allows `resources/icon.png` while excluding the source JPEG and other resource-maintenance files. Approved interface SVG/PNG designs remain in the package.

## Prepare and verify

Use the [environment baseline](./environment.md): Ubuntu 20.04+ amd64, VS Code 1.100.0+, and nvm-managed Node.js 24. At the repository root:

```bash
nvm use
npm ci
npm run check
VSCODE_TEST_VERSION=1.100.0 npm test
VSCODE_TEST_VERSION=stable npm test
DUAL_MIND_RELEASE_REF=v0.0.1-preview.2 npm run package
(cd release && sha256sum dual-mind-0.0.1.vsix > SHA256SUMS.txt)
(cd release && sha256sum --check SHA256SUMS.txt)
```

Headless editor tests need the documented Electron libraries, Xvfb and xauth; prefix their commands with `xvfb-run -a`. Run `npm run test:ui` for runtime/UI changes. Packaging rebuilds the host and frontend. `DUAL_MIND_RELEASE_REF` pins packaged README/changelog links to the new tag. Do not point the new package at the Preview 1 tag.

Inspect the VSIX manifest for Publisher `Pro-qing`, ID `dual-mind`, version `0.0.1`, the Preview flag and the PNG icon asset. Confirm that it is not marked as a Marketplace pre-release-channel package. Check the MIT license, third-party notices, bilingual metadata/docs, host/frontend bundles, and all five SVG/PNG pairs. The source JPEG, development sources, tests, credentials and source maps must be absent.

Install the package in an isolated profile/extensions directory and verify the native extension icon, identity, workbench, both languages, draft saving and reload recovery. Do not test by leaving both the old and new identities enabled in one user profile.

## GitHub Preview 2 publication

1. Review and commit the changes as `chore: prepare Pro-qing marketplace package`, then push `master`. Keep generated bundles, screenshots, VSIX files and checksum files ignored by Git.
2. Wait for all CI jobs on that exact commit: Ubuntu 20.04 with VS Code 1.100.0/stable and Ubuntu 24.04 stable. The Ubuntu 20.04 stable job also validates the real Webview and packaging.
3. Create a new Release draft with tag `v0.0.1-preview.2` targeting that commit, title `DualMind 0.0.1 Preview 2`, `prerelease: true`, and not latest. Do not move or replace `v0.0.1-preview.1` or its assets.
4. Add bilingual notes describing the publisher switch, icon, fixed `0.0.1` version, fresh configuration, features/limitations, verification and SHA-256. Upload the VSIX and `SHA256SUMS.txt` from the same build.
5. Review the draft target, flags, body and asset hashes, then publish. Record the returned URL and actual `published_at` timestamp only after confirmation.
6. Download both public attachments into a fresh directory, verify hashes against the prepared files, and test the downloaded VSIX in isolation. Record the commit, digest and installation results under the ignored release directory.

The [GitHub release documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) describes the web workflow. API credentials must not be stored in source files or exposed in command arguments.

## First Marketplace upload by the owner

Use the exact verified Preview 2 VSIX; rebuilding it unnecessarily would create a different artifact.

1. Sign in to the [publisher management page](https://marketplace.visualstudio.com/manage) with the account that owns **Pro-qing**.
2. Under **Pro-qing**, choose **New extension → Visual Studio Code**, then upload `dual-mind-0.0.1.vsix`.
3. Check the publisher, name, `0.0.1` version, icon, Preview label, MIT license and listing descriptions. Keep the current model-execution limitations explicit.
4. Wait for Marketplace validation/publication to complete. Only after the listing is public should the repository describe it as available there. Confirm the listing ID is `Pro-qing.dual-mind`.
5. In VS Code, disable the old development identity, search `@id:Pro-qing.dual-mind` in Extensions, install, and verify workbench opening and language selection.

Official references: [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [Extension manifest](https://code.visualstudio.com/api/references/extension-manifest). A GitHub Release and `preview: true` do not perform the Marketplace upload. No Marketplace token or automatic publishing job is added by this preparation.

## Subsequent synchronized updates

Once `Pro-qing.dual-mind` version `0.0.1` has been published to Marketplace, future updates under that same ID need a higher version. This initial unchanged-version exception is for the new identity only. Update the package/lockfile version and bilingual changelog, run checks and CI, package once, and publish that same artifact to both GitHub and Marketplace. Keep historical tags and assets intact. Record each actual publication state independently; do not report one service as updated merely because the other succeeded.
