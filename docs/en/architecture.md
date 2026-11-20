# Architecture

[简体中文](../zh/architecture.md) · [Documentation](./README.md)

**Source version: 0.0.2 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.2 version notes](./release-notes-0.0.2.md).

## Implemented local workbench

`dualMind.openWorkbench` creates or reveals one React Webview panel. The command completes after the panel renders a host snapshot; the serializer reopens the panel after a window reload. `dualMind.showStatus` remains a localized readiness notification. Commands, listeners, and panels are disposed through the extension lifecycle.

The host owns local state and validates all incoming operations. React owns navigation, form buffers, dialogs, and the isolated read-only example preview. The UI makes no provider requests. Saving a task creates a draft, not a running agent session.

## Repository layout

```text
src/extension.ts   Command registration and extension lifecycle
src/workbench.ts   Webview resources, CSP, message transport and host prompts
src/core/         Validated local task/configuration store
src/shared/       Message types, bilingual UI strings and Reviewer definitions
src/providers/    Model-list adapter; inference remains planned
src/git/          Lazy task worktree service and role-scoped file access
src/editor/       Reserved for context collection and result application
webview/src/      React workbench, settings, forms, bridge and responsive styles
resources/        Packaged PNG icon and archived branding source
scripts/          Build, checks, local tests and actual Webview verification
tests/local/     Store and React interaction tests
tests/            VS Code extension-host tests
docs/design/     Seven adopted SVG/PNG design pairs
docs/en/          English documentation
docs/zh/          中文文档
.github/          Compatibility CI and collaboration templates
.vscode/          Shared launch and build tasks
```

`resources/icon.png` is the extension and Marketplace icon. The original JPEG in `resources/branding/` stays in Git for maintenance and is excluded from the VSIX. See the [branding notes](../../resources/README.md).

## State ownership

| State                                                                      | Storage and behavior                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Drafts and selected task                                                   | `ExtensionContext.workspaceState`, key `dualMind.local.workspace.v1`; requires an open workspace |
| Connections, model defaults, custom roles and localized built-in overrides | `ExtensionContext.globalState`, key `dualMind.local.global.v1`                                   |
| API key                                                                    | `ExtensionContext.secrets`, keyed by the connection ID; never included in a UI snapshot          |
| Language choice                                                            | User setting `dualMind.language`: `auto`, `zh-CN`, or `en`                                       |
| Selected page                                                              | Webview state, allowing restoration after reload                                                 |
| Unsaved forms, dialogs and example preview                                 | React memory; examples never enter stored task data                                              |

The store serializes writes within a host to prevent rapid mutations from losing state. It validates stored version/shape and reports unsupported data without overwriting it. The host acknowledges an operation after persistence, then returns a fresh snapshot. A failed save leaves the form available for retry.

Task creation captures one Reviewer role's name, purpose, instructions and language. Edits to an existing draft preserve this snapshot. Built-in overrides are separate per language; custom content has an `original` language marker and is never translated automatically. Worker has a fixed general implementation role. Deleting a preset leaves snapshots intact. Deleting a connection removes its secret, clears matching defaults, and leaves referencing drafts available for rebinding.

## UI and build boundaries

The host bundle targets Node.js 20 for VS Code 1.100.0, while the development toolchain uses nvm-managed Node.js 24. esbuild separately creates `dist/extension.js`, `dist/webview/main.js`, and `dist/webview/main.css`. React is bundled; installed users do not need npm dependencies or an external web server.

Webview resources are limited to its built output, with a nonce-based script CSP and no direct network connections. API key entry uses a host-managed password prompt. The Webview receives only metadata and key-presence status. See the [implemented message boundary](./protocol.md).

The task sidebar collapses below 1200 CSS pixels; below 900 pixels the conversation panels stack vertically. Narrow settings and dialogs scroll without hiding their actions. Theme colors come from VS Code variables. Both UI languages use the same components and stable role IDs.

## Connection verification and model discovery

The development branch implements [scenes 6–7](./design.md) for OpenAI-compatible endpoints using Bearer authentication. `src/providers/models.ts` appends `/models` to the saved API path, retaining gateway prefixes. Azure-specific authentication and inference protocols are outside this feature.

A user requests a query → the host reads saved metadata and its secret under the store lock → `ModelQueries` performs network work outside that lock → the host returns validated IDs and a timestamp → React displays suggestions or manual input. The Webview keeps its no-direct-network CSP. Queries send no task requirements, role instructions, or workspace content.

Each connection has one cancellable in-flight query. The adapter applies a 20-second timeout, a 2 MiB body limit, structural validation and ID deduplication. It rejects redirects and returns localized error codes instead of upstream bodies. The bridge has a 30-second fallback timeout and correlates both request and connection IDs.

Results are held in React memory, never persisted. Successful URL/key changes or deletion cancel and invalidate the affected connection; late results cannot refill its cache. Renaming a connection, changing defaults or cancelling key entry keeps the list. Refreshing never rewrites selected IDs, draft bindings or role snapshots. Defaults may be empty; the storage version remains unchanged.

Discovery establishes access to the model-list endpoint only. Unsupported endpoints, empty lists and query failures keep manual input available. The implemented message contract is documented in [Protocol](./protocol.md).

## Future execution

The [approved designs](./design.md) also illustrate parallel task execution and review results. Inference adapters, independently cancellable sessions, streaming, pause/stop, feedback, and editor changes remain unimplemented. Future execution events must identify their task and run so output cannot cross between conversations. Reviewer approval must remain distinct from explicit user approval to apply a result.

## Role isolation: current boundary and future execution

The current implementation separates Worker/Reviewer model bindings, workspace drafts and task-specific Reviewer instruction snapshots. Store tests cover same-connection/same-model bindings, cross-task and cross-workspace edits, preset changes, and mutation of input or returned snapshot objects. Discovery integration tests check that saved task requirements, Reviewer instructions and workspace identifiers do not enter model-list requests. User-scoped settings and connection-scoped model-list caches are intentionally shared; neither is conversation history.

There is no inference request builder, conversation history or runtime context assembler yet. Worker currently has a fixed UI role description, not an implemented system prompt. The two panels and separate model selectors therefore do not establish runtime context isolation. Reviewer snapshots preserve task instructions but are not yet submitted to a model.

Future execution must maintain independent histories identified by workspace, task, execution instance and agent. A connection or model ID is never a conversation identity, including when both agents use identical endpoints and models. At execution start, freeze the task requirements, acceptance criteria, role instructions and configuration for that execution. Both agents share the requirements and acceptance criteria; each uses only its own role instructions and history. Later settings changes must not rewrite an active execution.

Worker hands over current artifacts and test evidence; Reviewer returns review conclusions, findings and requested changes. Do not copy the other agent's full conversation, internal analysis or unrelated tool records. Treat handed-over content as data, not instructions that can replace the receiving agent's role. The [future protocol boundary](./protocol.md#future-role-handoffs) defines correlation and cancellation requirements. This is a design contract only: no runtime fields, storage migration or execution capability is added here.

## Git task workspace foundation (development branch)

`src/git/` implements a lazy host service for the future first execution: one `dualmind/task/<task UUID>/worker` branch and a separate worktree per task, outside the source repository under the extension's workspace storage directory. `Workbench.prepareTaskWorkspace()` is an internal integration point, not a command or Webview action. Opening settings, querying models or saving/deleting drafts does not call it. Start remains disabled; no inference or command executor is added.

Preparation requires Git 2.25+, a trusted single-folder workspace opened at the repository root, a named branch, a commit and a clean source directory (including staged, unstaged and non-ignored untracked files). Bare repositories, submodules, detached HEAD and multiple workspace folders are rejected. An existing linked worktree can be the source. The baseline commit is frozen at first preparation; ignored/generated files are not copied. Existing prepared task files are reused even after the source moves or becomes dirty. No source checkout, automatic commit, stash, fetch, merge, push or dependency installation occurs.

A separate `dualMind.git.workspaces.v1` host record holds the task/repository identity, source branch, baseline commit, task branch, directory and `preparing`/`ready` phase. Intent is saved before Git creation; recovery verifies directory ownership, branch, common repository and baseline ancestry. Matching completed creation can recover a failed final state write. Conflicts, missing ready directories and partial checkouts with modifications are preserved for manual inspection. Preparation is serialized per repository and registry in the host; Git branch/path conflicts also prevent another process from overwriting existing work. Draft storage stays version 1 with no migration.

The host binds a Worker or Reviewer file interface. Both can list/read regular files, inspect status and read tracked differences from the baseline; new untracked files are visible through status/list/read. Only Worker receives `writeFile`, including creation of ordinary subdirectories. Each access checks the task still exists, workspace trust, repository binding and worktree ownership. Absolute paths, traversal, symbolic links, hard-linked files and Git metadata are rejected. Git is invoked without a shell and with hooks, external diff, textconv, content filters and filesystem monitors disabled. LFS/filter-generated content is not downloaded or materialized by this service. Commands have a 20-second timeout and 2 MiB output limit; individual file reads/writes are limited to 2 MiB. Exceeding limits returns an error, not truncated evidence.

This is a tool-interface boundary, not an operating-system sandbox: external processes or users with filesystem access can still modify the worktree. Reviewer cannot run tests or arbitrary commands through this interface; future Worker execution will provide test evidence. Read-only file access does not implement independent model histories. The [future context contract](./protocol.md#future-role-handoffs) remains applicable.
