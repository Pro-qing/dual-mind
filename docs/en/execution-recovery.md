# Failure recovery and continued execution

[简体中文](../zh/execution-recovery.md) · [Usage](./usage.md) · [Approved UI design](./recovery-proposal.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Current capabilities:** [worktrees, context summaries and artifact operations](./task-lifecycle.md), together with [tool-error handling](./tool-errors.md), were introduced in 0.0.6 with host and frontend support. [Scenes 30–34](./task-lifecycle-proposal.md) and [scenes 35–37](./tool-errors-proposal.md) retain their original approval and implementation records.

**Status: host recovery and approved recovery controls are implemented.** This describes development source, not an installed or published release. Use the play icon with **Continue execution** after resolving a failure, including after reloading VS Code. The notice identifies Worker, Reviewer or System, phase, operation and recovery attempts. Disabled controls include an explanation; uncertain processes can be checked again without bypassing cleanup.

## Recovery scope

Model and system failures retain the responsible role, phase and operation. Recovery keeps the run ID, directory, plan and work round while reading current task endpoint, credential and model bindings. Requirements, role instructions, command presets and round limits remain frozen to the run. Reviewer independently verifies; Worker changes source. Host preparation failures are identified separately from model failures.

Closing or reloading the extension marks unfinished runs `interrupted`; neither models nor commands restart automatically. Only the latest, unsuperseded run of a task is eligible. Explicit stops, exhausted review rounds, history/correction limits and legacy runs without recovery data cannot bypass these rules. Runs stopped by the old `toolTurnLimit` or `toolCallLimit` can be continued manually after upgrading, provided the latest run has valid recovery data. Historical counters above 20/200 remain readable; counters are retained without a storage-format migration. Restart creates a new run; task deletion removes its recovery files. Messages sent during failures remain queued: Reviewer answers or revises the plan before returning to the saved position.

Recovery resumes role phases and recorded operation boundaries, not operating-system process internals. Existing file changes remain. Arbitrary shell commands have neither transactions nor an exactly-once guarantee. The executor does not replay a completed operation ID; a new model call can still cause a similar side effect.

## Persistence and context

`src/execution/recovery.ts` maintains a version 1 sequential journal, current checkpoint and previous checkpoint under the extension workspace storage's `recovery/` directory. Entries have increasing sequence numbers and a hash chain. Intent is flushed before execution; results are flushed before advancing. Checkpoints use flushed temporary files and atomic replacement, with directory synchronization on Unix. The complete journal is authoritative; a checkpoint cannot hide later operations. The journal limit is 64 MiB. A damaged snapshot can be rebuilt from a verified complete journal; damaged interior records, conflicting indexes and unsupported shapes block recovery. An incomplete final line is removed only when an explicitly resumed writer appends; started operations without results remain uncertain.

Operations distinguish pending, started, succeeded, failed and unknown. A crash after a file changes but before its result is durable still leaves an uncertainty window; it does not prove the operation never ran. Accepted plans, submissions, reviews and answers persist their application position with state. Public conversation projections can be repaired with stable deduplication identities, independently of the latest 80 events.

Normal pauses retain in-memory history. Failure recovery rebuilds public context from the plan, artifacts, evidence, unresolved operations and recent operation summaries. The read-only `read_operation` tool paginates older records; `read_command_output` retains full command output access. Protocol switches do not concatenate raw protocol histories. Credentials, raw environment values, private reasoning and encrypted reasoning are excluded from recovery files and the UI. The separate 512 KiB serialized-request guard still applies. Role summaries are synced and referenced by recovery checkpoints before memory replacement. Reload validates role and hash and combines the summary with public operations; recognized model context errors allow bounded compaction before continuing. See [task lifecycle](./task-lifecycle.md).

## Errors and retries

Nonzero commands, missing executables and ordinary file-tool failures still return tool results for the model to address. Command timeouts and output limits require confirmed process cleanup; uncertain cleanup blocks further execution.

Only requests with no valid stream event may retry transient network failures and HTTP 408, 425, ordinary 429, 500, 502, 503 and 504, for at most three requests. Default delays are one and two seconds; valid `Retry-After` values are respected. Requests and waits share the 120-second budget; a delay beyond the remaining budget never causes an early retry. Authentication, quota, certificate, parameter and protocol errors do not retry automatically. At most 8 KiB of error-body data is used for classification without forwarding the raw body. Waiting is cancellable and attempts are recorded. Retries do not replay tools or switch models. Once a valid stream event arrives, an interruption preserves public progress and waits for manual recovery; partial tool calls never execute.

## Processes, generations and evidence

Recovery rechecks workspace trust and binding, model settings, the environment, files and artifact fingerprints. Commands retain process creation identities. Unix uses process groups; Windows uses the existing tree query and cleanup. Missing identity or unconfirmed shutdown blocks recovery and new task commands. Windows orphan ancestry remains conservatively handled; successful `taskkill` output alone is not proof of cleanup.

Each recovery starts a new generation. Old model output, callbacks and handoffs cannot advance the new state. Cancellation persists operations that already happened; new execution waits for confirmed cleanup. Explicit user stops and persistence failures remain distinct causes.

Recorded command outcomes remain in history when artifacts change. Reviewer judges the current artifacts and may request fresh Worker verification, but the host does not require criterion-linked fresh command evidence as an automatic acceptance gate. A change during review invalidates that reviewed snapshot and pauses completion. Recovery neither consumes another normal work round nor resets completed role calls or argument-correction counts.

Actual local and CI coverage is reported in the [development log](./development-log.md). Unrun platforms are not claimed as verified.

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).

## Local Python

Preparation and recovery identify local Python 2.7/3 and common project environments for model context. Worker alone can invoke `run_command`; Reviewer can inspect recorded outcomes but cannot run commands. Python is not bundled or installed, and global environments are unchanged. See [local Python](./local-python.md) for discovery order, budgets and failure behavior.
