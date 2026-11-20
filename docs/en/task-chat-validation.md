# Task chat validation record

[简体中文](../zh/task-chat-validation.md) · [Development log](./development-log.md)

Date: 2026-11-20. Four designs are approved, functionality is integrated and full checks, extension-host and real UI validation passed. This record appends new results without replacing failures, limits or skipped cases in the [earlier execution-cycle validation](./execution-cycle-validation.md).

Validation uses local model simulators, test credentials, disposable Git repositories and real commands. Coverage includes both model protocols, uncommitted continuation under all three Git strategies, read-only answers, independent evidence and durable queued messages. No paid model was contacted; local simulation is not third-party service verification. This change does not expand the Ubuntu/Linux support baseline.

## Environment and executed results

- Ubuntu 20.04.6 amd64, Node.js 24.22.3, Git 2.25.1, installed VS Code 1.141.0 and the existing desktop display.
- Fourteen new execution cases passed across both protocols: all Git continuation modes, answers without Worker, idempotency, queues, pause, stop/reload, binding changes, round limits, messages during final acceptance and redaction.
- Two continuation cases ran actual Node commands and verified that the new run references fresh successful records rather than prior evidence. Product commands require no systemd and real command cases are not skipped.
- All 35 targeted UI/conversation cases passed, including existing UI regressions, independent pagination, stream grouping, recovery, long-message redaction, IME, retry, localization, expansion, focus and history scrolling.
- `npm run test:ui` passed on VS Code 1.141.0 with 49 English/Chinese wide/narrow screenshots. Local model simulators and real commands cover existing revision/acceptance, custom commands, reading-only tasks and Git modes, plus questions, continued changes, queued messages, stop, reload and saved messages.
- The first screenshot pass showed the composer falling below the viewport. Layout now uses the remaining viewport height; the rerun passed with a composer-bounds assertion. A pagination test used an obsolete button name; correcting its selector made it pass.
- `npm run check` passed: 137 local tests and 22 environment tests, zero failures/skips; type, lint, format and documentation checks passed. Documentation validation covered 63 Markdown files, 490 local links, 26 language pairs and 17 SVG/PNG pairs.
- `VSCODE_TEST_EXECUTABLE=/usr/share/code/code npm test` passed: 2 extension-host tests, exit code 0.
- `npm run package` passed, producing `release/dual-mind-0.0.3.vsix` (98 files, about 2.7 MB). This creates a local package only; it was not installed, pushed or published.

## Coverage boundaries

VS Code 1.100.0, other operating systems/CPU architectures and third-party online models were not rerun. The Ubuntu/Linux baseline is unchanged and unrun cases are not passes. Outer development validation retains a 512 MiB JS heap plus CPU/time budgets; memory-controller limits of this hybrid-cgroup machine remain as described in [earlier validation](./execution-cycle-validation.md), not a product command prerequisite.

Screenshots are under `.vscode-test/ui-validation/1.141.0/`, including `en-chat-followup-answer.png`, `en-chat-followup-modification.png`, `en-chat-queued-message.png`, `en-chat-current-continuation.png`, `en-chat-branch-continuation.png`, and `en-execution-evidence-drawer.png`. Actual UI screenshots are separate from the approved static SVG/PNG artifacts.
