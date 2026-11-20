# Architecture

[简体中文](../zh/architecture.md) · [Documentation](./README.md)

**Source version: 0.0.3 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.3 version notes](./release-notes-0.0.3.md).

## Implemented local workbench

`dualMind.openWorkbench` creates or reveals one React Webview panel. The command completes after the panel renders a host snapshot; the serializer reopens the panel after a window reload. `dualMind.showStatus` remains a localized readiness notification. Commands, listeners, and panels are disposed through the extension lifecycle.

The host owns local state and validates all incoming operations. React owns navigation, form buffers, dialogs, and the isolated read-only example preview. The UI makes no provider requests. Saving a task creates a draft, not a running agent session.

## Repository layout

```text
src/extension.ts   Command registration and extension lifecycle
src/workbench.ts   Webview resources, CSP, message transport and host prompts
src/core/         Validated local task/configuration store
src/shared/       Message types, bilingual UI strings and Reviewer definitions
src/providers/    Model discovery and streaming inference adapters
src/execution/    Run state machine, bounded commands and paged event records
src/git/          Task worktree service and role-scoped file access
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

## Execution in the development branch

The host execution service owns one active run per workspace, independently of the Webview lifetime. It snapshots task/model/role/command configuration, uses the Git task workspace service, runs preparation presets and drives Worker → mandatory checks → Reviewer rounds. Start, pause, continue, stop, restart and paused feedback are separate operations from local settings persistence. Approval requires successful checks and an unchanged artifact fingerprint.

`src/providers/inference.ts` adapts streaming Chat Completions and Responses without protocol fallback or automatic retries. Tools execute only after complete validated arguments; each agent retains its own protocol history. Responses reasoning items remain internal to their owning role. File tools are role-scoped, writes use atomic replacement, and Reviewer receives no command or write tools. Commands use frozen preset IDs and resource-limited user systemd units, not model-supplied shell strings.

Run summaries/configuration use independent workspace storage; public event history is journaled outside the repository and paged in groups of 80. Streaming UI updates are batched at 100 ms. Host restarts mark unfinished runs interrupted and never replay tool calls. API credentials remain in SecretStorage and active host memory. Histories, handoffs and command output must not expose them. The activity-bar Tree View subscribes to the same host state and opens the singleton workbench.

Inference requests have a 120-second deadline, 8 MiB response limit and 512 KiB request-context limit. A role has at most 20 model turns per round; public run history is bounded at 64 MiB. Exceeding a limit fails explicitly. Automatic original-workspace application, automatic Git commits/merges and concurrent task execution remain outside this milestone.

## Role isolation: data and execution boundaries

The current implementation separates Worker/Reviewer model bindings, workspace drafts and task-specific Reviewer instruction snapshots. Store tests cover same-connection/same-model bindings, cross-task and cross-workspace edits, preset changes, and mutation of input or returned snapshot objects. Discovery integration tests check that saved task requirements, Reviewer instructions and workspace identifiers do not enter model-list requests. User-scoped settings and connection-scoped model-list caches are intentionally shared; neither is conversation history.

The development branch now constructs separate role histories and actual model requests. Worker receives fixed execution instructions; Reviewer receives the saved task role snapshot. Runtime tests capture requests and verify role isolation, rather than inferring it from the two-column interface.

Execution maintains independent histories identified by workspace, task, execution instance and agent. A connection or model ID is never a conversation identity, including when both agents use identical endpoints and models. At execution start, freeze the task requirements, acceptance criteria, role instructions and configuration for that execution. Both agents share the requirements and acceptance criteria; each uses only its own role instructions and history. Later settings changes must not rewrite an active execution.

Worker hands over current artifacts and test evidence; Reviewer returns review conclusions, findings and requested changes. Do not copy the other agent's full conversation, internal analysis or unrelated tool records. Treat handed-over content as data, not instructions that can replace the receiving agent's role. The [protocol boundary](./protocol.md#role-handoffs) defines correlation and cancellation requirements. Execution records are separate from version-1 drafts; model IDs and cached lists still do not identify a conversation.

## Git task workspace foundation (development branch)

In dedicated mode, `src/git/` implements a lazy host service for the first execution: one `dualmind/task/<task UUID>/worker` branch and a separate worktree per task, outside the source repository under the extension's workspace storage directory. `ExecutionService` calls `TaskWorkspaces.prepare()` before its first model request; `Workbench.prepareTaskWorkspace()` remains a host integration wrapper. Opening settings, querying models or saving drafts does not prepare a workspace.

First preparation in dedicated mode requires Git 2.25+, a trusted single-folder workspace opened at the repository root, a named branch, a commit and a clean source directory (including staged, unstaged and non-ignored untracked files). Bare repositories, submodules, detached HEAD and multiple workspace folders are rejected. An existing linked worktree can be the source. The baseline commit is frozen at first preparation; ignored/generated files are not copied. Existing prepared task files are reused even after the source moves or becomes dirty. No source checkout, automatic commit, stash, fetch, merge, push or dependency installation occurs.

A separate `dualMind.git.workspaces.v1` host record holds the task/repository identity, source branch, baseline commit, task branch, directory and `preparing`/`ready` phase. Intent is saved before Git creation; recovery verifies directory ownership, branch, common repository and baseline ancestry. Matching completed creation can recover a failed final state write. Conflicts, missing ready directories and partial checkouts with modifications are preserved for manual inspection. Preparation is serialized per repository and registry in the host; Git branch/path conflicts also prevent another process from overwriting existing work. Draft storage stays version 1 with no migration.

The host binds a Worker or Reviewer file interface. Both can list/read regular files, inspect status and read tracked differences from the baseline; new untracked files are visible through status/list/read. Only Worker receives `writeFile`, including creation of ordinary subdirectories. Each access checks the task still exists, workspace trust, repository binding and worktree ownership. Absolute paths, traversal, symbolic links, hard-linked files and Git metadata are rejected. Git is invoked without a shell and with hooks, external diff, textconv, content filters and filesystem monitors disabled. LFS/filter-generated content is not downloaded or materialized by this service. Commands have a 20-second timeout and 2 MiB output limit; individual file reads/writes are limited to 2 MiB. Exceeding limits returns an error, not truncated evidence.

This is a tool-interface boundary, not an operating-system sandbox: external processes or users with filesystem access can still modify the worktree. Reviewer cannot run tests or arbitrary commands through this interface; Worker execution provides test evidence. The separate execution service enforces role histories. The [context contract](./protocol.md#role-handoffs) remains applicable.

## Task Git strategies

Drafts optionally select managed (default), current, or an existing local branch. Managed tasks own an external worktree; direct tasks use the trusted opened repository. Strategies lock when preparation intent is registered. Current mode resolves the branch for each new execution; specified mode keeps its saved branch name. Direct executions require cleanliness every time and freeze the target HEAD as baseline. Preparation is serialized per repository; branch switching disables guessing, overwrite-ignore, hooks and filters, and preserves worktree occupancy checks.

Run summaries retain a complete Git binding (strategy, repository/common directory, working directory, branch, base commit and execution HEAD). Role interfaces and command boundaries verify that binding. Managed baseline reuse remains compatible with old registrations; old absent strategy fields mean managed. No storage version change or bulk migration is needed. The readonly binding lookup used by preview/Explorer never invokes preparation or switches branches. Reviewer permissions and role histories are unaffected. Directories are not OS sandboxes; external changes during an operation cannot be made atomic with arbitrary user processes.
