# DualMind 0.0.6 — Complete task workflow and local Python

[简体中文](../zh/release-notes-0.0.6.md) · [Documentation](./README.md)

**Status: local version prepared; not publicly released.** Recorded November 24, 2026; extension ID `Pro-qing.dual-mind`, version `0.0.6`, local annotated tag `v0.0.6`. The maintainer handles pushing, installation, Marketplace and GitHub publication separately. This date is not a public release date.

## Included capabilities

Relative to the original `v0.0.5` tag, 0.0.6 includes subsequent feature commits and the product README/local Python changes archived in this round:

- **Compact task home:** name and delete controls, full-name hints, keyboard focus, read-only examples and deletion confirmation; detailed state lives in task detail.
- **Worktrees and artifacts:** choose a local base for isolated tasks without copying dirty source changes. Explicitly commit, merge normally, handle conflicts, preserve/clean worktrees and restore saved artifacts. Approval retains the workspace; merged results still require verification.
- **Role contexts:** connection/model window settings, independent Worker/Reviewer budgets, automatic semantic summaries and overflow recovery. Retain chat, public operations and acceptance evidence without replaying tools or resetting business budgets.
- **Tool recovery:** reject invalid batches in preflight, skip later calls after the first execution failure, and return errors to the current role. Pause after three failures without progress. Structured command output and termination reasons separate historical failures from current acceptance blockers.
- **Offline common commands:** pinned rg/fd/jq for Linux x64, with system commands taking priority and only task PATH extended. A failed command is not automatically rerun under another version.
- **Local Python:** discover Python 2.7/3 from the actual task environment, activated environments and PATH during preparation/recovery, preserving verified invocation paths and versions. Both roles retain `run_command`; Python is not bundled, downloaded or installed.
- **Product introduction:** bilingual README, extension descriptions and an actual read-only example screenshot focus on capabilities and getting started. All 37 approved design pairs retain their original archive paths.

See [Usage](./usage.md), [Lifecycle](./task-lifecycle.md), [Tool errors](./tool-errors.md), [Bundled commands](./bundled-tools.md) and [Local Python](./local-python.md) for behavior and limits.

## Version, history and compatibility

- Update the project version in the extension manifest and lockfile, retaining the name, ID, dependency versions and Preview flag. Release preparation adds no new API, message or data format.
- Local Python environment metadata is optional; older execution records without it remain readable. Existing command, recovery and artifact-storage protocols are retained.
- Original `v0.0.5` remains at `e4ae328`. Subsequent compact-home `6cdcd94`, lifecycle/tool-recovery `2ee08bc` and bundled-command `9c8dcf0` commits are included in 0.0.6. Product introduction and local Python are archived as `b2b315e` and `781cda3`; the tag and build record identify the final version commit.
- Historical logs, approval dates, tags and packages remain unchanged. Earlier candidates retain their original uncommitted-source provenance rather than being described as builds of these new commits.

## Validation and artifacts

- `npm run check` passed this round: 22 environment tests, seven asset tests, and 316 local tests with 315 passes/one Windows-only skip; types, lint, formatting and documentation passed.
- Three VS Code 1.100.0 development-mode extension-host tests passed. Dependencies and runtime source are retained, with serial checks under resource monitoring.
- File hashes support reuse of the focused real UI and README previews completed on November 24, 2026. No full UI rerun this round, and earlier candidates are not relabeled as builds of new commits.

See the [development log](./development-log.md) for checks executed this round. Final package/build verification is recorded in the accompanying independent build record, with the tagged commit, toolchain, source hashes and VSIX SHA-256.

Deliver `release/dual-mind-0.0.6.vsix`, its `.vsix.sha256`, and `release/dual-mind-0.0.6-build.json`. Build from the final clean commit with README/changelog relative links pinned to `v0.0.6`; the tag must be pushed before those remote links resolve. Earlier versions and candidates are preserved. Installation and publication are separate steps; see [Packaging and releasing](./releasing.md).

## Support boundaries

The baseline remains Ubuntu 20.04+ x64, VS Code 1.100.0+ and Git 2.25+, with Node.js 24 for development/packaging. One task runs per workspace; automatic editor-context collection and parallel execution remain planned. Models use the configured compatible API; this does not imply offline inference or guaranteed correctness.

Remote CI, other editor versions, native Windows/macOS/ARM64, paid models and installation/publication checks are not run or claimed as passing in this round. Follow the release guide to verify the target commit and CI before public distribution, recording publication times and outcomes separately.
