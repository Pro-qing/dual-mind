# Host / Webview protocol

[简体中文](../zh/protocol.md) · [Documentation](./README.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Locally committed feature revision:** host support for [worktrees, context summaries, and artifacts](./task-lifecycle.md) is implemented. [Scenes 30–34](./task-lifecycle-proposal.md) are approved and connected; [scenes 35–37](./tool-errors-proposal.md) cover the new tool-result UI. Version 0.0.5 and existing tags are retained.

**Source version: 0.0.5 · Baseline tag `v0.0.5` (before these later commits) · Unpublished.** Recorded November 23, 2026. Includes the native sidebar workbench and versioned design archives. A local commit, tag and VSIX do not imply a remote push or Marketplace/GitHub publication. Earlier version records remain unchanged. See the [0.0.5 version notes](./release-notes-0.0.5.md).

## Page state and error compatibility

Local Webview navigation is `{view: "home"}`, `{view: "task", taskId}`, or `{view: "api" | "defaults" | "execution" | "roles", returnTo}`. The return target is home or a task. Navigation is independent of persisted `selectedTaskId` and never starts execution. Old navigation and missing tasks fall back to home.

A successful task-save `result` also includes `savedTaskId`, exposed by the bridge in `ActionReply`. Creation navigates using this ID independently of concurrent task selections.

Shared `AppError` contains `code`, optional `params` (strings or numbers), and optional `details` (redacted original text). `execution.result`, `result`, `fatal`, `RunSummary`, and `RunEvent` accept an optional `fault` field. Existing error fields remain readable and storage versions stay unchanged. The UI prefers `fault`, then treats legacy text as original details without guessing error identifiers from English messages.

The execution bridge retains its 45-second timeout. Its message asks users to check the current execution state before retrying; a timeout does not imply cancellation. Closing the workbench rejects pending requests. Role protocol histories keep the existing tool-result shape; public tool and check events carry additional errors for localized display. Original command output remains verbatim. Parameters and details are redacted before logging and host delivery; if credentials cannot be read, potentially sensitive details are withheld.

The current internal protocol supports the local workbench. It is not a stable public API. Types are defined in `src/shared/model.ts`, request validation and persistence in `src/core/store.ts`, and transport in `src/workbench.ts` and `webview/src/bridge.ts`.

## Entry points

- `dualMind.openWorkbench`: opens or reveals one panel and completes when React renders the host snapshot.
- `dualMind.showStatus`: localized readiness notification.
- `dualMind.language`: application/user setting with values `auto`, `zh-CN`, and `en`; automatic resolution uses VS Code's display language.

## Messages

| Direction | Envelope                                                             | Behavior                                                     |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| UI → host | `ready`                                                              | Request initial state                                        |
| UI → host | `rendered`                                                           | Acknowledge initial React render                             |
| UI → host | `request` with `requestId` and `action`                              | Submit a validated operation                                 |
| Host → UI | `snapshot`                                                           | Refresh local state after initialization or settings changes |
| Host → UI | `result` with matching `requestId`, `ok`, and snapshot or error code | Confirm persisted success or return a localized error key    |
| Host → UI | `fatal` with error code                                              | Report initial state loading failure                         |

Snapshots contain resolved locale, language choice, workspace availability/name, tasks, selected task ID, connection summaries, default agent bindings, and localized Reviewer presets. Connection summaries have a boolean `hasKey`, never a credential value.

## Supported operations

| Area           | Actions                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| Tasks          | `task.save` (create/edit task), `task.select`, `task.delete`              |
| Connections    | `connection.save`, `connection.delete`, `connection.key`, `defaults.save` |
| Reviewer roles | `role.save`, `role.reset`, `role.delete`                                  |
| Environment    | `language.set`, `workspace.open`                                          |

Edits and deletions carry their item's ID. Destructive operations require explicit confirmation in the request. The host reconstructs supported fields, validates text/URLs/positive round limits and referenced IDs, rejects unknown actions, and verifies workspace availability. The UI treats a saved operation as successful only after the host responds.

## Data and language rules

Each task stores a role snapshot with stable ID, built-in/custom flag, name, purpose, instructions, and locale (`en`, `zh-CN`, or `original`). Editing a task preserves its snapshot even if the preset was changed or deleted. Task data stays at version 1 with `status: draft`; independent run summaries provide actual execution state.

Built-in edits and resets address an explicit language and cannot rename/delete a built-in role. Custom text is stored as entered. Language switching changes UI labels and default definitions, not saved task content. Unsaved role edits are resolved by a Save / Discard / Cancel dialog before the in-app selector changes language.

A key-entry request opens the host's native password input. The host stores the key through `ExtensionContext.secrets` and returns only presence status. No raw key is accepted through a Webview action, included in a snapshot, logged, or written to ordinary configuration.

## Model-query contract

Available in the development branch; the published 0.0.1 artifact is unchanged.

| Direction | Message                                            | Meaning                                                           |
| --------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| UI → host | `models.query`, `requestId`, `connectionId`        | Explicit query of a saved connection                              |
| Host → UI | `models.result`, `requestId`, `connectionId`, `ok` | Success: `result.models` and `result.fetchedAt`; failure: `error` |
| Host → UI | `models.invalidated`, `connectionId`               | Cancel and clear this connection's cached result                  |

The host reads the saved URL and secret; query messages contain neither credentials nor task content. It sends Bearer authentication to the saved path plus `/models`, validates `data[].id`, and returns deduplicated IDs. There is one in-flight request per connection, a 20-second timeout, a 2 MiB response limit, and a 30-second bridge fallback. Redirects and invalid bodies return sanitized error codes.

Successful address/key changes and deletion invalidate results. Request and connection IDs prevent late responses from restoring stale data. Name/default changes preserve results. Lists are transient and excluded from snapshots; storage versions and historical tasks are unchanged. Refresh never selects a model or rewrites saved IDs. Empty results and errors allow manual entry. Success verifies list access only, not inference.

## Remaining protocol work

Dedicated-worktree artifact operations have host interfaces, with UI integrated; parallel task execution remains future work. The [retained design reference](./design.md) describes the intended UI. Implemented asynchronous execution messages identify both task and run. Active-task deletion waits for stop acknowledgement; failures preserve records. The read-only example view uses UI-only data and does not emit task mutations.

## Role handoffs

The execution service implements these handoffs. Existing task storage remains version 1; independent execution records require no task migration.

- Keep separate Worker/Reviewer histories for each workspace, task and execution instance. Sharing a connection, model or cached model list must never merge histories.
- Both agents receive the same frozen task requirements and acceptance criteria, with their own frozen role instructions and configuration. A later preset/default edit cannot alter the active execution.
- Worker → Reviewer carries current artifacts and test evidence. Reviewer → Worker carries conclusions, findings and requested changes. Each handoff identifies its task, execution instance, round, sender and recipient; workspace ownership is checked by the host.
- Handoffs exclude full conversations, internal analysis, unrelated tool records and credentials. Their text is content to evaluate, never a replacement for the receiving agent's role instructions.
- Route results and cancellation by execution instance and agent. A cancelled or superseded execution cannot append late output to either history. Retries must have distinguishable attempt identity so late results from an earlier attempt cannot overwrite the current attempt or reach the other role.

Mock-server execution tests now capture both protocols and verify independent role histories, independent Reviewer verification and check-gated completion. No personal API credentials or paid requests are used for acceptance.

## Internal Git workspace service

The development branch adds host-only `prepare(taskId)` and `files(taskId, role)` operations; these remain host-only operations behind the execution service, with an optional task Git strategy. The host resolves the saved task, source repository and storage directory. It accepts a validated existing local branch name only in specified mode, never arbitrary paths or Git commands, and the returned file interface fixes the host-selected role for its lifetime. Both roles expose list/read/status/diff/fingerprint and validated command-directory access; Worker additionally exposes writes. Review approval cannot mutate files or merge results.

Preparation returns the registered baseline, branch, directory and phase. Errors distinguish unavailable/old Git, workspace trust or shape, missing task/repository/commit, detached HEAD, submodules, dirty source, conflicts, changed ownership, storage failure, invalid paths, output limits and timeout. Intent and partial resources survive failures; errors identify the affected location without returning raw Git stderr. File access is revoked after task deletion or workspace/binding changes.

Legacy task deletion retains the Git record, worktree and branch. New host operations support explicit preservation/cleanup and optional cleanup on deletion, with UI integrated; see [task lifecycle](./task-lifecycle.md). For dedicated worktrees only (never the directly opened project), to clean up manually, first inspect and preserve the task's work (including untracked/ignored files), then run `git -C <source-repository> worktree remove <task-directory>` without force. Delete the branch with `git -C <source-repository> branch -d <task-branch>` only when Git confirms it is safely merged. If either command refuses, retain the resources and resolve the remaining work yourself. Historical registry records remain as recovery information; the service never adopts unknown branches/directories or recreates a missing ready directory automatically.

## Execution messages and persistence

`execution.request` correlates a request ID with configuration save, start/restart, pause/resume/stop, paused feedback, history, diff preview or opening the task directory. `execution.result` returns the execution snapshot and optional history page or a sanitized error. `execution.update` batches summaries and public events; every event carries task ID, execution ID, sequence and, where applicable, agent/request ID. The UI deduplicates events; task chat spans executions while the legacy history API remains scoped to a run. Model requests and command work never hold the settings-store queue.

`dualMind.execution.v1` stores workspace command presets and run summaries. Per-run JSONL history lives in workspace extension storage, outside task files. A page contains at most 80 events. API keys and private Responses reasoning are not journaled. OpenAI-compatible connections add optional `protocol: chatCompletions | responses`; omission means Chat Completions, without rewriting older records. Requests keep gateway prefixes and never fall back to another protocol automatically.

Runs transition through preparing, planning, worker, checking, reviewer, answering, pausing, paused, stopping and the terminal statuses answered/stopped/completed/roundLimit/failed/interrupted. Answered indicates completion of a question reply, not acceptance. Paused runs occupy the workspace slot. Stop is acknowledged only after cancellation and command shutdown; host reload interrupts pending runs, and explicit restart creates a new execution ID without replaying prior calls. Active task edits and changes to the referenced connection URL/protocol/key are rejected by the host. Deleting an active task first stops it, removes its visible execution history, and retains the Git artifacts.

`submit_plan` issues the initial plan, `finish_work` submits artifacts, and `submit_review` accepts them or issues the next plan. Plain text never substitutes for these tools. After each submission, the host runs enabled additional checks and verifies actual evidence and artifact fingerprints before accepting approval. Role histories are never joined. Explicit commit/merge uses separate host artifact operations, outside model tool permissions.

## Task branch selection

`TaskInput.git` / `TaskDraft.git` is optional: `{mode: "managed"}`, `{mode: "current"}`, or `{mode: "branch", branch: "existing-local-name"}`. Missing means managed for old tasks. An edit omitting the field preserves an existing selection. The host rejects strategy changes after preparation. No arbitrary paths, revision expressions or Git command arguments are accepted.

Execution action `git.branches` is readonly and returns `repository: {currentBranch, branches, dirty, branchHeads}` alongside execution state. It lists local branches only and needs no saved task. Execution state includes `preparedTaskIds` to lock the form even after interrupted preparation. `RunSummary.git` holds the actual frozen binding, including `baseCommit` and `headCommit`. Older run records without that field use their managed registration. `binding(taskId, expected?)` validates without preparing; preview/openDirectory cannot switch or reset. Each direct start/restart rechecks cleanliness and records a new baseline. Old runs refuse access if their branch or HEAD no longer matches. Chat continuation uses `binding` to retain the directory and uncommitted artifacts without calling `prepare`; new artifacts require fresh verification evidence.

Deletion retains the registration and results. Dedicated worktree cleanup instructions above do not apply to direct mode: never remove the user's opened repository with worktree cleanup commands. Direct mode never automatically reverts files or restores the previous branch.

## Plans, submissions and command evidence

ExecutionConfig adds optional customCommandsEnabled. When absent it is normalized from whether either command array is nonempty, without changing storage keys. Disabling retains values. Default execution does not require a nonempty checks array.

TaskPlan contains host-assigned version, objective, requirements, steps, criteria and revisionReason. Criteria have stable id, description, verification (command/reading), evidence and reason; reading requires a reason. Plans allow up to 40 steps and 40 criteria. Revisions must explain changes and retain existing criterion IDs and verification methods.

Worker finish_work includes summary, completedSteps, per-criterion evidence (criterionId, commandIds, evidence) and unresolved; the host adds planVersion and revision. Reviewer submit_review includes verdict, summary and per-criterion acceptance with passed. Rejection requires nextPlan. Approval covers every criterion and requires valid actual evidence and additional checks; model-written success claims cannot replace host records.

run_command accepts name, command (shell text), optional cwd (default dot), purpose (prepare/verify/explore), criterionIds and optional timeoutSeconds (default 180). Planning/answering allow explore only. The host assigns evidence ID, agent, phase and planVersion (0 before planning), with shell metadata, fingerprints, output and result. Reviewer may cite its own acceptance-stage verify records. Saved presets keep program/args; old missing agent fields mean Worker. read_command_output continues paginating full redacted output. See [Shell execution](./shell-execution.md).

RunSummary optionally carries plan, submission and review for current display. RunEvent adds plan/submission kinds and an optional detail discriminated union (plan, submission, review, command). History retains all versions; old fields and records remain readable. planning is a new pausable phase. Each role receives only its phase's tools, with complete nested batch validation before execution.

Command startup adds structured commandNotFound, commandPermissionDenied, commandStartFailed and commandPlatformUnsupported errors, with the command name and executable path where applicable. Details follow existing redaction rules. Nonzero exit, timeout, excessive output and cancellation retain their existing codes. Legacy systemd translations remain for historical records only and are not emitted by the new runner. Execution replies, plans and evidence storage fields remain compatible without migration.

## Task messages and independent pagination

New execution actions:

| Action            | Parameters and result                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `message.send`    | `taskId`, client UUID `messageId`, and 1–50,000 character `text`; persistence precedes acknowledgement and ID retries do not launch again |
| `messages.resume` | `taskId`; explicit processing of saved messages after stop/interruption, without automatically resuming a manual pause                    |
| `conversation`    | `taskId`, optional opaque `before`; returns `conversation: {messages, before?}`, up to 40 messages                                        |
| `evidence`        | `taskId`, optional `runId`, `through` sequence and opaque `before`; returns `evidence: {events, before?}`, up to 80 grouped records       |

`TaskMessage` carries stable `id`, `taskId`, `time`, `role`, `kind`, `text`, and optional `status: pending | processing | handled`, `runId`, `sequence`, `round`, `detail`, `fault`. Text, parameters and details are redacted; model and command output is not translated. `conversationVersion` signals message updates. Page responses do not overwrite fresher execution state.

`RunSummary` adds optional `kind: conversation | execution`, `previousRunId`, and `sourceMessageIds`. `answering` can pause; `answered` is a question-only terminal state, never acceptance. Older runs without kind remain execution records. Existing execution, history and configuration interfaces remain compatible. New `messageInvalid`, `messageConflict`, `continuationUnavailable`, and `conversationUnavailable` codes use the shared bilingual error table.

`submit_answer` accepts a nonempty `answer` and is exposed only during message processing. Two completion tools cannot share a batch. This phase may instead submit a complete `submit_plan`; active-plan revisions still retain criteria and explain changes. Model histories remain role-isolated. Public handoff includes original requirements, user additions, previous plans/submissions/reviews and real command records; old commands cannot certify new-run artifacts.

## Native shell commands

Both roles now use the [shared shell execution layer](./shell-execution.md), with automatic environment inheritance and independent Reviewer verification. No language-specific setup setting is required. macOS and Windows native CI is configured; passing results must be observed before those platforms are called validated. Historical validation reports retain their original scope.

## Optional activity and public process contracts

`ExecutionSnapshot.activity` is ephemeral and optional. Its fields are `id`, `taskId`, `runId`, `agent`, `phase`, `stage`, `startedAt`, and optional `requestId`, `tool`, `commandId`, `label`. Stage is waiting/receiving/tool/command. Snapshots and subscriptions contain redacted metadata only, never raw model protocol or command arguments. No activity is persisted in run records or restored after host restart.

The `conversation` request adds optional boolean `includeProcess` (default false for existing clients). When enabled, `TaskMessage.kind` may be `process`, with `requestId`. Public text events are grouped by run, role and request across the full run history before pagination, not the last 80 events. The first event provides stable ID/time; sequence tracks the last included event for evidence navigation. Unattributed legacy text remains evidence-only. Raw logs are not rewritten; final answers and submissions remain separate messages. The approved chat UI sends `includeProcess: true`; older clients keep the default projection.

`TaskWorkspaces.prepare(taskId, strategy?, taskName?)` accepts the host's saved task title, defaulting to `task` for older internal callers. New managed bindings add optional naming metadata version 2. Legacy bindings without metadata retain their exact original name; forged task suffixes, incompatible naming metadata and changed registered branches are rejected.

`EvidencePage.summary` optionally contains `{records, errors}` for all grouped records in the requested scope, before pagination. Streaming chunks belonging to one record count once; records with structured faults, error kind or failed command evidence count as errors. The UI polls unscoped totals while the panel is minimized and compares the record count to the last open-panel count without changing the selected evidence scope. A separate scoped fetch supplies the visible list when needed.

## Failure recovery

The host now persists role, phase, operation outcomes and execution position. Failed and reloaded runs resume with current model connections while preserving the plan, work round and uncommitted files. The read-only `read_operation` tool exposes older operations independently of the latest 80 UI events. Ordinary tool failures still return to the model. Transient model failures before a valid stream event allow at most three requests sharing a 120-second budget, including waits; authentication, quota and protocol failures do not retry automatically.

The play icon with **Continue execution** resumes paused runs and eligible failed/interrupted runs. The fixed recovery notice identifies the role, phase, saved position and any blocking reason, including while evidence is minimized. Recovery checks and cancellable retry waits use host-reported state and request attempts; countdowns run only in the Webview. Restart remains a separate new run. See the [approved recovery design](./recovery-proposal.md) and [recovery behavior](./execution-recovery.md) for journal, process and evidence boundaries.

## Sidebar page connection and migration

`dualMind.tasks` is a native WebviewView. Optional `AppSnapshot.initialViewState` contains only allowlisted display state: version, navigation and per-task expansion/minimization preferences. It contains no credentials, raw environment or recovery context. Existing page state wins, followed by the workspace mirror and legacy-tab state. Older clients ignore the added field.

UI → host `view.state` mirrors display state; `navigation.ack` consumes a navigation request by ID. `rendered` may include display state; the host saves it before completing initialization and closing a legacy tab. State writes are serialized and callbacks from replaced pages cannot reply to the new page. Retrying `ready` requests a fresh snapshot. Hidden execution remains in the host; reveal refreshes snapshots and paged chat. Execution requests, run records and recovery formats are unchanged.

## Locally committed lifecycle interfaces

New operations use `execution.request/result`. The host resolves directories and refs, never arbitrary frontend paths. Operation UUIDs support idempotent retry; `token` is the last inspected state token.

| Operation                        | Input and result                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `git.artifacts`                  | `taskId` → `artifact`, including files, exclusions, branch, token, acceptance and pending operations |
| `git.commit`                     | `taskId, operationId, token, message` → updated artifact state                                       |
| `git.merge`                      | `taskId, operationId, token, targetBranch` → integrated or conflicted state                          |
| `git.merge.check/complete/abort` | `taskId, operationId`; operate only on that recorded merge                                           |
| `git.openMerge`                  | Host validates and opens the registered merge directory                                              |
| `git.cleanup`                    | `taskId, operationId, token`; preserve before removing the managed worktree                          |
| `git.saved`                      | Independent `savedArtifacts`, including preserved records needing inspection after failure           |
| `git.restore`                    | `snapshotId, operationId, input` → `createdTaskId`, a new task from the snapshot                     |
| `task.followup`                  | `taskId, operationId, input` → `createdTaskId`, a new task from the selected base                    |

`task.delete` optionally carries `cleanup: {operationId, token}`; omission retains the worktree. Connections add `contextWindows: Record<modelId, tokenWindow>`, and managed strategies add optional `baseBranch`. Older omitted fields remain compatible; storage stays at version 1. Derived task IDs use the operation UUID with an input digest to prevent duplicate creation.

`RunSummary.context` reports per-role window, estimated status, input budget, request bytes and summary count; `ExecutionActivity.stage` adds `compacting`. `RecoveryState.contexts` references separately synced summary files. `ExecutionSnapshot.artifacts` and `gitOperationTaskId` expose cleaned tasks and ongoing artifact operations; artifact records use independent `dualMind.git.artifacts.v1` storage.

## Tool outcomes and frontend integration revision

Optional `RunEvent.tool` and `RecoveryOperation.outcome` carry `ToolOutcome`: call/request/operation IDs, tool, `execution`, `status`, structured `fault`, linked `commandId`, and `causedBy`. `CommandEvidence.toolOperationId` links the parent tool so aggregation counts one operation; legacy records retain their existing display.

Commands add optional `stdout`, `stderr`, `durationMs`, `termination`, and `actualExitCode` (null when unknown), retaining `exitCode` and `ok`. `ToolBudget` adds `calls` and failure identities; `RunSummary.toolPause` stores reason, budget key, operation and count. Explicit continuation clears only the correction observation window, not total call budgets. `EvidencePage.summary.blockers` is independent of historical error totals.

`RepositoryInfo` adds read-only `dirty` and `branchHeads`; optional `git.merge.expectedTargetHead` detects changes since target preview. Artifact status adds structured `changedFiles`, pending commit messages and restoration operation IDs. `context`/`artifacts` settings routes preserve their return target; the host publishes the derived task in a snapshot/navigation request before reporting creation success.

## Bundled tool environment summary

The optional `ExecutionEnvironmentSummary.bundledTools?` array contains `name` (`rg`/`fd`/`jq`), bundled `version`, `status` (`available`/`unavailable`) and optional `reason` (`unsupportedPlatform`, `unconfigured`, `missing`, `integrity`, `architecture`, `permission`, `unreadable`). This describes fallbacks, not actual PATH selection. Older snapshots remain valid without the field. Raw environment values are not persisted; recovery reconstructs the current environment. Model tools and command result protocols are unchanged. See [bundled commands](./bundled-tools.md).
