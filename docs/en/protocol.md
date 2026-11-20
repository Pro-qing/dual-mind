# Host / Webview protocol

[简体中文](../zh/protocol.md) · [Documentation](./README.md)

**Source version: 0.0.2 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.2 version notes](./release-notes-0.0.2.md).

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

Snapshots contain resolved locale, language choice, workspace availability/name, draft tasks, selected task ID, connection summaries, default agent bindings, and localized Reviewer presets. Connection summaries have a boolean `hasKey`, never a credential value.

## Supported operations

| Area           | Actions                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| Tasks          | `task.save` (create/edit draft), `task.select`, `task.delete`             |
| Connections    | `connection.save`, `connection.delete`, `connection.key`, `defaults.save` |
| Reviewer roles | `role.save`, `role.reset`, `role.delete`                                  |
| Environment    | `language.set`, `workspace.open`                                          |

Edits and deletions carry their item's ID. Destructive operations require explicit confirmation in the request. The host reconstructs supported fields, validates text/URLs/positive round limits and referenced IDs, rejects unknown actions, and verifies workspace availability. The UI treats a saved operation as successful only after the host responds.

## Data and language rules

Each task stores a role snapshot with stable ID, built-in/custom flag, name, purpose, instructions, and locale (`en`, `zh-CN`, or `original`). Editing a draft preserves its snapshot even if the preset was changed or deleted. Local task status is always `draft`; no execution-state transitions are supported yet.

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

Successful address/key changes and deletion invalidate results. Request and connection IDs prevent late responses from restoring stale data. Name/default changes preserve results. Lists are transient and excluded from snapshots; storage versions and historical drafts are unchanged. Refresh never selects a model or rewrites saved IDs. Empty results and errors allow manual entry. Success verifies list access only, not inference.

## Future protocol work

Model inference, execution state, streaming, cancellation, task feedback, and result application are also future work. The [retained design reference](./design.md) describes the intended UI. Future asynchronous execution messages must identify both task and run; stopping/deleting must be acknowledged before removal, with failures preserving records. The read-only example view uses UI-only data and does not emit task mutations.

## Future role handoffs

This section specifies future behavior, not supported `Action` or `HostMessage` variants. Existing storage remains version 1; no session fields or migration are introduced.

- Keep separate Worker/Reviewer histories for each workspace, task and execution instance. Sharing a connection, model or cached model list must never merge histories.
- Both agents receive the same frozen task requirements and acceptance criteria, with their own frozen role instructions and configuration. A later preset/default edit cannot alter the active execution.
- Worker → Reviewer carries current artifacts and test evidence. Reviewer → Worker carries conclusions, findings and requested changes. Each handoff identifies its task, execution instance, round, sender and recipient; workspace ownership is checked by the host.
- Handoffs exclude full conversations, internal analysis, unrelated tool records and credentials. Their text is content to evaluate, never a replacement for the receiving agent's role instructions.
- Route results and cancellation by execution instance and agent. A cancelled or superseded execution cannot append late output to either history. Retries must have distinguishable attempt identity so late results from an earlier attempt cannot overwrite the current attempt or reach the other role.

Runtime isolation remains unverified until an execution implementation and corresponding request/history tests exist. Current tests validate local data boundaries and discovery requests only.

## Internal Git workspace service

The development branch adds host-only `prepare(taskId)` and `files(taskId, role)` operations; there are no new Webview messages, task status transitions or draft fields. The host resolves the saved task, source repository and storage directory. It never accepts a UI-supplied branch/path/Git command, and the returned file interface fixes the host-selected role for its lifetime. Reviewer exposes list/read/status/diff only; Worker additionally exposes writes. Review approval cannot mutate files or merge results.

Preparation returns the registered baseline, branch, directory and phase. Errors distinguish unavailable/old Git, workspace trust or shape, missing task/repository/commit, detached HEAD, submodules, dirty source, conflicts, changed ownership, storage failure, invalid paths, output limits and timeout. Intent and partial resources survive failures; errors identify the affected location without returning raw Git stderr. File access is revoked after task deletion or workspace/binding changes.

Deleting a draft retains the Git record, worktree and branch. There is no automated cleanup endpoint. To clean up manually, first inspect and preserve the task's work (including untracked/ignored files), then run `git -C <source-repository> worktree remove <task-directory>` without force. Delete the branch with `git -C <source-repository> branch -d <task-branch>` only when Git confirms it is safely merged. If either command refuses, retain the resources and resolve the remaining work yourself. Historical registry records remain as recovery information; the service never adopts unknown branches/directories or recreates a missing ready directory automatically.
