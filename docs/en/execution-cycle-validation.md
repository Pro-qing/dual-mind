# Dual-agent planning and acceptance: validation record

[简体中文](../zh/execution-cycle-validation.md) · [Design](./execution-cycle-proposal.md) · [Development](./development.md)

Date: 2026-11-20. Source version: 0.0.3, local development build, unpublished. Both new designs are approved; the execution loop, interface and documentation are implemented. Results below distinguish simulated execution, real UI and real commands; skips are not passes.

## Environment and results

Ubuntu 20.04.6 amd64, Node 24.22.3, Git 2.25.1 and VS Code 1.141.0, using an existing desktop session. Validation units request 1 GiB / 60 seconds for local checks and 2 GiB / 180 seconds for Electron, with no swap. This machine's hybrid cgroup mount does not satisfy the production runner's cgroup v2 memory/swap probe; configured unit properties do not prove actual enforcement.

| Verification                                         | Actual result                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                      | Passed: 22 environment tests; 107 of 108 local tests passed, with the real systemd test disabled; types, lint, formatting and documentation checks passed |
| `npm test`, installed VS Code                        | 2 extension-host tests passed: commands/activity-bar activation and real React rendering, singleton tab reuse and reopen                                  |
| `npm run test:ui`, installed VS Code                 | Interface, two-round reading acceptance and reload interruption passed, producing 32 screenshots; overall exit code 2 indicates partial coverage          |
| Command test with explicit `DUALMIND_TEST_SYSTEMD=1` | 1 actual failure, 0 skips: initial enforcement probe returned `systemdLimits`; command limit/cancellation scenarios did not proceed                       |

Tests use temporary repositories, isolated editor profiles, local model fixtures and test keys. They do not read personal API credentials or make paid inference requests.

## Covered behavior

- Both inference protocols: Reviewer-first plan, autonomous Worker implementation/verification, rejection with a new plan, then acceptance.
- No-preset starts, autonomous preparation, command-free reading acceptance, legacy custom commands and retained disabled values.
- Nested tool validation, rejected role violations, stable criterion IDs, failed/forged/stale evidence rejection and newer failures superseding older success. A rejected round still cannot mark an individual criterion passed without valid evidence.
- Paused feedback through Reviewer planning, frozen configuration/roles, late Worker calls after stop, changed artifacts, round limits, restart planning and Git directory/branch binding.
- Real task navigation, bilingual states/errors, restored plans, rejection followed by a new plan and second-round acceptance, reload interruption without replay, additional-command switching and single-column plans in an actual narrow Webview. Screenshot tooling unmaximizes windows, respects VS Code's minimum size and waits for actual Webview resizing/layout.

## Unverified real-environment scenarios

This host cannot validate real command execution, resource/time/output/cancellation enforcement, or the real UI's full command-based cycle and direct-branch execution. Simulated execution and Git regressions cover related logic but are not reported as passes for these real-environment scenarios.

Explicitly enable command tests and rerun the full UI execution paths on a host with working user systemd and cgroup v2 limits. Raw UI results are local at `.vscode-test/ui-validation/1.141.0/results.json`; screenshots and test editors are excluded from the VSIX.

Use the documented Node 24 environment and `npm run package` to generate `release/dual-mind-0.0.3.vsix`. This work does not publish or automatically install the extension.
