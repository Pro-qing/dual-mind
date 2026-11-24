# DualMind 0.0.7 — Continued execution and acceptance diagnostics

[简体中文](../zh/release-notes-0.0.7.md) · [Documentation](./README.md)

**Status: local release preparation; not publicly released.** Recorded November 24, 2026. Extension identity remains `Pro-qing.dual-mind`. The maintainer handles pushing and publication separately.

## Changes

- Model exchanges and tool calls no longer stop at 20/200. Diagnostic counters persist across summaries and recovery. Review-round, timeout, context, history and repeated-failure controls remain effective.
- Latest runs stopped by the old call limits can be continued manually with valid recovery data. Existing work, plan and completed operations are retained; upgrading does not start a run automatically.
- Acceptance errors explain unresolved blockers and specific evidence problems. `unresolved` contains only blockers; scope notes and optional checks belong in summary/evidence. Real blockers remain enforced.
- Commands whose parent exits with tracked children still running are cleaned up and return `backgroundIncomplete`; the parent exit code remains available. Foreground verification must finish before acceptance.
- Fix Linux process-identity sampling when a short Python probe exits during `/proc` reads (`ESRCH`), while retaining process-group cleanup and permission-error handling.
- Old generic errors, call-limit errors and version 1 recovery records remain readable. Existing Debug components display the new bilingual diagnostics without a layout change.

## Validation and delivery

Focused repair tests and type checking passed before the version change. Final `npm run check` passed: 22 environment and 7 asset tests; 336 local tests with 335 passed and one Windows-only skip, plus type, lint, formatting and documentation checks. Build and VS Code 1.100.0 extension-host tests passed (3 tests). Full real Webview regression passed with 87 screenshots; native sidebar/migration passed 18 checks. The Linux short-process fix also passed 500 probes under the editor's Node.js 20.19.0 runtime. See the [development log](./development-log.md) for corrected failures and limits. Package/isolated-install verification and final hashes are recorded in the independent artifact build record after the source commit is fixed.

Local delivery comprises `release/dual-mind-0.0.7.vsix`, its `.vsix.sha256` and `dual-mind-0.0.7-build.json`. The final clean commit and local annotated `v0.0.7` tag identify the source; README links use that tag and require it to be pushed before they resolve remotely. Old packages and the debug task worktree/logs remain preserved. See [release instructions](./releasing.md).

## Boundaries

The support baseline remains Ubuntu 20.04+ x64, VS Code 1.100.0+ and Git 2.25+; development uses Node.js 24. Native Windows/macOS/ARM64, remote CI and paid model services are not validated by local Linux tests. Process tracking retains its documented limitations for escaped processes. Manual review and publication remain required.
