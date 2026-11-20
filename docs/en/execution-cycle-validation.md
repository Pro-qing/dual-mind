# Dual-agent planning and acceptance: validation record

[简体中文](../zh/execution-cycle-validation.md) · [Design](./execution-cycle-proposal.md) · [Development](./development.md)

Date: 2026-11-20. Source version: 0.0.3, local development build, unpublished. Both new designs are approved; the execution loop, interface and documentation are implemented. Results below distinguish simulated execution, real UI and real commands; skips are not passes.

## Previous runner environment and results (historical)

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

## Scenarios not covered by the previous runner

The previous runner on this host could not validate real command execution, resource/time/output/cancellation enforcement, or the real UI's full command-based cycle and direct-branch execution. Simulated execution and Git regressions cover related logic but are not reported as passes for these real-environment scenarios.

The results above describe the previous runner. That prerequisite has now been removed; verification of the new runner is recorded below. Raw UI results are local at `.vscode-test/ui-validation/1.141.0/results.json`; screenshots and test editors are excluded from the VSIX.

Use the documented Node 24 environment and `npm run package` to generate `release/dual-mind-0.0.3.vsix`. This work does not publish or automatically install the extension.

## Local command runner verification (2026-11-20)

Verified again on the same Ubuntu 20.04.6 amd64, Node 24.22.3, Git 2.25.1 and VS Code 1.141.0, without changing system cgroup configuration. The product no longer probes systemd/cgroup or imposes memory/swap quotas. These results cover the command scenarios previously blocked by the old runner; earlier failures remain recorded above.

| Verification       | Actual result                                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`    | Passed: 22 environment tests and 117 local tests, zero failures or skips; types, lint, formatting and documentation checks passed                                                                                                         |
| Real command tests | All 8 default-enabled tests passed: arguments, directory, environment isolation, startup errors, nonzero exit, cancellation races, timeout, output limit, resistant children, cleanup after parent exit and termination failure reporting |
| `npm test`         | Both extension-host tests passed in the installed VS Code                                                                                                                                                                                 |
| `npm run test:ui`  | Exit code 0; 43 screenshots; command cycle, bilingual errors, stopping, all three Git strategies, two-round reading acceptance and reload restoration passed; `skipped: []`                                                               |
| `npm run package`  | Passed; generated `release/dual-mind-0.0.3.vsix` for manual installation                                                                                                                                                                  |

Real UI verification made 41 local mock inference requests across Chat Completions and Responses. Commands actually ran in temporary projects; the stop test read the PID written by the running command and confirmed that process exited. Runner tests placed failing systemd tools in PATH to verify that neither `systemd-run` nor `systemctl` was called. Tests also retain bilingual compatibility for historical systemd errors.

The first combined check was interrupted by the former 60-second outer budget and is not counted as a pass. With the real 10-second timeout and 3-second forced-cleanup tests enabled, the combined check budget was increased to 120 seconds and the full check passed. Other local batches retain 60 seconds, and Electron retains 180 seconds. Outer verification units still requested 1 GiB/2 GiB and no swap; on this hybrid cgroup system those attributes do not prove memory enforcement and no longer gate the product runner. UI verification also corrected window-bounds restoration races, asynchronous language-change waiting and the round-bearing stopped-status assertion.

Coverage is limited to this Linux desktop combination. Remote CI, minimum VS Code 1.100.0, other platforms and real external model services were not rerun. Commands use the current user's permissions; cleanup covers the same process group and does not claim to track services that deliberately leave it. The VSIX is not automatically installed or publicly released.
