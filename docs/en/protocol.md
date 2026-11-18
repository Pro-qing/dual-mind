# Host / Webview protocol

[简体中文](../zh/protocol.md) · [Documentation](./README.md)

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

## Future protocol work

Real provider requests, test-connection results, execution state, streaming, cancellation, task feedback, and result application are not implemented operations. The [retained design reference](./design.md) describes the intended UI. Future asynchronous execution messages must identify both task and run; stopping/deleting must be acknowledged before removal, with failures preserving records. The read-only example view uses UI-only data and does not emit task mutations.
