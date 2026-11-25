# Tool errors, pauses, and acceptance

[简体中文](../zh/tool-errors.md) · [UI record](./tool-errors-proposal.md) · [Task lifecycle](./task-lifecycle.md)

**Current version: 0.0.8.** Implemented and archived during 0.0.5 development on November 23, 2026; available since [0.0.6](./release-notes-0.0.6.md). That round approved the existing frontend designs and authorized tool-error handling and frontend integration together. Scenes 28–34 are connected; scenes 35–37 are drawn and implemented under the confirmed plan without another visual approval stop. Historical tags and publication records remain intact.

## Three result layers

Ordinary failures return to the current Worker/Reviewer without immediately changing roles or automatically rerunning commands. Tool status distinguishes `succeeded`, `failed`, `rejected`, `skipped`, `cancelled`, and `unknown`; `execution` separately indicates not started, executed, or uncertain effects. Command `ok` still means command success, distinct from a tool returning normally or a task passing acceptance.

Results carry call, host operation and request IDs, structured faults, linked commands, and skip causes. Large-result excerpts preserve status, exit information and operation references; `read_operation` retains full access. Commands record stdout, stderr, duration, exit code and termination while preserving combined output. Missing historical fields are not invented. Channels share the existing 2 MiB capture budget. Redaction happens in the host; if combined output contains sensitive data, separate channels are conservatively withheld in favor of redacted combined output, preventing cross-channel credential fragments from resurfacing.

## Acceptance diagnostics

`evidenceInvalid` and criterion/command-specific reasons remain readable for historical records. Current Pair-style review does not make criterion coverage, command-ID references or successful command status automatic acceptance gates. Structured tool faults still include a typed reason and relevant operation identifiers; feedback, recovery records and Debug use the same redacted diagnostic.

Worker may use `unresolved` to report blockers for Reviewer consideration; scope notes and omitted optional checks belong in `summary` or `evidence`. The host does not convert this list into automatic acceptance blockers. A failed `submit_review` marked “executed” means the host processed and refused that malformed or protocol-invalid submission, not that acceptance passed.

## Batches and permissions

Invalid arguments, unknown/unavailable tools, or invalid final-tool order reject the entire batch before execution, returning diagnostics and available tools. Transport still rejects incomplete streams and missing/duplicate call IDs. After the first ordinary runtime or command failure, remaining calls, including final tools, are marked not executed with the failed operation as cause. Completed operations and file changes are not rolled back. Reviewer receives only read-only inspection and recorded-output tools; Worker alone receives command and mutation tools. Independent host checks still collect every configured check result.

Missing files, invalid paths, ordinary permission errors, launch failures, nonzero exits, and timeouts/output limits with confirmed termination remain correctable. Revoked trust, changed bindings, persistence failure, unconfirmed process shutdown, and explicit stopping interrupt advancement. Started operations without reliable results remain unknown, never falsely described as having no effects. Cancelled and stale-generation responses cannot advance a new run.

## Repetition and budgets

Failure identity includes role/phase, tool, effective arguments, fault/exit reason and workspace fingerprint, excluding command display names. The third matching failure without progress pauses the run; unrelated read-only diagnostics do not reset counts. A successful identical call or changed arguments/relevant state starts a new failure count. Three consecutive rejected batches also pause.

Pause reasons, counts and batch results persist in recovery. Users can inspect failures, add feedback and explicitly continue; continuation opens a correction window while retaining diagnostic counts. There is no cumulative limit on model exchanges or tool calls. Rejected/skipped calls remain counted. Summarization and reload/recovery retain counts and never replay completed tools. Task review-round, timeout, context and history limits remain independent.

Compound commands retain native shell semantics: no injected `set -e` or pipefail, automatic splitting, or invented subcommand exit codes. Default timeout remains 180 seconds, accepting 10–900. The model decides how to adjust tools, arguments or the plan from explicit results.

## Acceptance and UI

Reviewer judges current artifacts together with the plan, command/check outcomes and Worker evidence. The host validates review structure and finish protocol, prevents acceptance while feedback is pending or artifacts change during review, and otherwise does not impose criterion-coverage or successful-command gates. Failed, skipped, unknown or stale results remain visible for the Reviewer to assess. Worker may report failures and outstanding work for Reviewer to plan repairs.

Evidence associates tool wrappers and command results by host operation, counting a failure once. Skipped calls show their cause without posing as executed failures. Historical failures and current acceptance blockers are separate; zero errors or a finished tool call do not imply acceptance. Pause reasons remain visible in narrow views and with evidence minimized.

Model context, worktree bases, explicit commits/ordinary merges, conflict handling, cleanup and saved artifacts are integrated together; see [task lifecycle](./task-lifecycle.md). Confirmation uses preview tokens and stable operation IDs. Timeouts require rechecking, reload exposes pending operations, and derived tasks open after the host snapshot contains them.

Validation uses one CPU, low priority and serial batches with process-tree RSS, swap, available host memory and wall-time monitoring. Actual outcomes appear in the [development log](./development-log.md); static designs are not runtime verification.
