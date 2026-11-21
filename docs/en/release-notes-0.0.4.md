# DualMind 0.0.4 — Local package of the current source

[简体中文](../zh/release-notes-0.0.4.md) · [Documentation](./README.md)

**Status: local VSIX, unpublished.** Recorded 2026-11-21; extension identity: `Pro-qing.dual-mind`, version: `0.0.4`, retaining the Preview flag. This package starts from the existing implementation at `c9c4358` and updates version metadata and documentation. It adds no runtime features, creates no release tag and does not upload to Marketplace/GitHub Releases.

## Package scope

- Includes existing Reviewer planning, Worker implementation and command verification, read-only Reviewer acceptance, both streaming model protocols and all three Git directory strategies.
- Includes implemented task chat, independent evidence, narrow-screen drawers, read-only Reviewer answers, messages queued during execution, and continued changes in the bound directory with uncommitted artifacts; subsequent execution obtains fresh evidence.
- Commands use the existing direct process runner with timeouts, output limits and process-group cleanup; see the [security boundaries](../../SECURITY.md).
- Includes the 17 approved designs and synchronized bilingual documentation, plus documentation review, development-log and bilingual Git commit conventions.
- Documents using nvm to preserve the system Node.js default, select Node.js 24 through `.nvmrc` and return to the system version; see [Environment](./environment.md).

These features were implemented before this version bump. Earlier implementation and validation history remain in the [0.0.3 notes](./release-notes-0.0.3.md), [execution-cycle validation](./execution-cycle-validation.md) and [task-chat validation](./task-chat-validation.md).

## Compatibility and limitations

Dependency versions, storage versions and runtime protocols are unchanged; no data migration runs. The development toolchain requires nvm-managed Node.js 24; installing a built VSIX needs no separate Node.js. Only one task runs per workspace. Parallel tasks, automatic editor context and automatic application of dedicated-directory results remain unimplemented.

The local artifact is `release/dual-mind-0.0.4.vsix`; no separate SHA-256 file currently exists. This package predates the documentation cleanup for this commit, so its bundled documentation does not contain these record corrections. This commit does not rebuild the package.

## Validation for this package (2026-11-21)

- The machine has nvm 0.41.0, Node.js 24.22.3 and npm 11.19.1. Project selection through `.nvmrc` and restoration of system Node.js 26.13.1/npm 11.20.0 with `nvm use system` were verified; system executable checksums were unchanged.
- Before committing, checked the local VSIX ZIP integrity and manifest: 100 files, extension identity `Pro-qing.dual-mind`, version 0.0.4 and the correct Preview flag. VS Code CLI lists `pro-qing.dual-mind@0.0.4` as installed; this confirms registration only, not passing workbench behavior tests.
- See the [development log](./development-log.md) for checks on this version-metadata and documentation commit. The user chose to build, package and install manually; these operations were not rerun for this commit. Full engineering checks, extension-host tests and real UI tests were not run; remote CI, other editor/OS combinations and public distribution were not validated. Historical results retain their original scope.
