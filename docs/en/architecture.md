# Architecture

[简体中文](../zh/architecture.md) · [Documentation](./README.md)

**Source version: 0.0.4 · Local version record · Unpublished.** Recorded on 2026-11-21; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.4 version notes](./release-notes-0.0.4.md).

## Page navigation and structured errors

`webview/src/navigation.ts` defines `home`, `task` with a `taskId`, and settings pages with a `returnTo` location. Webview state persists navigation; creation uses the ID in the save response, and restoration verifies that the task exists. Old `workbench` state opens home. Home and detail share the task form. Native creation requests can open that form over settings and preserve the originating page on cancellation.

`src/shared/errors.ts` defines error identifiers, parameters, original details, and bilingual formatting. Errors receive identifiers at their source; the host redacts them before sending or persisting. Summaries and events retain structured errors, formatted in the current language when displayed. Native VS Code notifications use the same formatter, and old text records remain readable. Version-1 `status: 'draft'` is solely a storage compatibility field; the interface shows Pending or the run status.

## Implemented local workbench

`dualMind.openWorkbench` creates or reveals one React Webview panel. The command completes after the panel renders a host snapshot; the serializer reopens the panel after a window reload. `dualMind.showStatus` remains a localized readiness notification. Commands, listeners, and panels are disposed through the extension lifecycle.

The host owns local state and validates all incoming operations. React owns navigation, form buffers, dialogs, and the isolated read-only example preview. The UI makes no provider requests. Creating a task opens its detail page in the Pending state; execution starts only when requested.

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
docs/design/     17 approved SVG/PNG design pairs
docs/en/          English documentation
docs/zh/          中文文档
.github/          Compatibility CI and collaboration templates
.vscode/          Shared launch and build tasks
```

`resources/icon.png` is the extension and Marketplace icon. The original JPEG in `resources/branding/` stays in Git for maintenance and is excluded from the VSIX. See the [branding notes](../../resources/README.md).

## State ownership

| State                                                                      | Storage and behavior                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tasks and selected task                                                    | `ExtensionContext.workspaceState`, key `dualMind.local.workspace.v1`; requires an open workspace |
| Connections, model defaults, custom roles and localized built-in overrides | `ExtensionContext.globalState`, key `dualMind.local.global.v1`                                   |
| API key                                                                    | `ExtensionContext.secrets`, keyed by the connection ID; never included in a UI snapshot          |
| Language choice                                                            | User setting `dualMind.language`: `auto`, `zh-CN`, or `en`                                       |
| Selected page                                                              | Webview state, allowing restoration after reload                                                 |
| Unsaved forms, dialogs and example preview                                 | React memory; examples never enter stored task data                                              |

The store serializes writes within a host to prevent rapid mutations from losing state. It validates stored version/shape and reports unsupported data without overwriting it. The host acknowledges an operation after persistence, then returns a fresh snapshot. A failed save leaves the form available for retry.

Task creation captures one Reviewer role's name, purpose, instructions and language. Edits to an existing task preserve this snapshot. Built-in overrides are separate per language; custom content has an `original` language marker and is never translated automatically. Worker has a fixed general implementation role. Deleting a preset leaves snapshots intact. Deleting a connection removes its secret, clears matching defaults, and leaves referencing tasks available for rebinding.

## UI and build boundaries

The host bundle targets Node.js 20 for VS Code 1.100.0, while the development toolchain uses nvm-managed Node.js 24. esbuild separately creates `dist/extension.js`, `dist/webview/main.js`, and `dist/webview/main.css`. React is bundled; installed users do not need npm dependencies or an external web server.

Webview resources are limited to its built output, with a nonce-based script CSP and no direct network connections. API key entry uses a host-managed password prompt. The Webview receives only metadata and key-presence status. See the [implemented message boundary](./protocol.md).

Home and detail are separate pages; the native VS Code sidebar opens task detail directly. Detail uses compact model bars, user messages on the right and AI messages on the left, independent evidence and a persistent composer. Wide windows have an approximately 360 CSS pixel evidence panel; below 1100 CSS pixels it becomes a drawer capped at 430 CSS pixels and the viewport width. Task rows and actions wrap, while narrow settings and dialogs scroll without hiding their actions. Theme colors come from VS Code variables. Both UI languages use the same components and stable role IDs.

## Connection verification and model discovery

The development branch implements [scenes 6–7](./design.md) for OpenAI-compatible endpoints using Bearer authentication. `src/providers/models.ts` appends `/models` to the saved API path, retaining gateway prefixes. Azure-specific authentication and inference protocols are outside this feature.

A user requests a query → the host reads saved metadata and its secret under the store lock → `ModelQueries` performs network work outside that lock → the host returns validated IDs and a timestamp → React displays suggestions or manual input. The Webview keeps its no-direct-network CSP. Queries send no task requirements, role instructions, or workspace content.

Each connection has one cancellable in-flight query. The adapter applies a 20-second timeout, a 2 MiB body limit, structural validation and ID deduplication. It rejects redirects and returns localized error codes instead of upstream bodies. The bridge has a 30-second fallback timeout and correlates both request and connection IDs.

Results are held in React memory, never persisted. Successful URL/key changes or deletion cancel and invalidate the affected connection; late results cannot refill its cache. Renaming a connection, changing defaults or cancelling key entry keeps the list. Refreshing never rewrites selected IDs, task bindings or role snapshots. Defaults may be empty; the storage version remains unchanged.

Discovery establishes access to the model-list endpoint only. Unsupported endpoints, empty lists and query failures keep manual input available. The implemented message contract is documented in [Protocol](./protocol.md).

## Execution in the development branch

The host execution service owns one active run per workspace, independently of the Webview lifetime. It snapshots task/model/role/command configuration, uses the Git task workspace service, obtains a Reviewer plan, runs enabled preparation and drives Reviewer plan → Worker implementation/verification → additional checks → Reviewer acceptance rounds. Start, pause, continue, stop, restart and paused feedback are separate operations from local settings persistence. Approval requires valid evidence for all criteria, successful additional checks and an unchanged artifact fingerprint.

`src/providers/inference.ts` adapts streaming Chat Completions and Responses without protocol fallback or automatic retries. Tools execute only after complete validated arguments; each agent retains its own protocol history. Responses reasoning items remain internal to their owning role. File tools are role-scoped, writes use atomic replacement, and Reviewer receives no command or write tools. Worker commands use structured executable and argument fields; enabled additional checks retain preset IDs. LocalCommands launches commands directly in the task directory, without implicit shell parsing, using a separate Linux process group and an environment allowlist.

Run summaries/configuration use independent workspace storage; public event history is journaled outside the repository and paged in groups of 80. Streaming UI updates are batched at 100 ms. Host restarts mark unfinished runs interrupted and never replay tool calls. API credentials remain in SecretStorage and active host memory. Histories, handoffs and command output must not expose them. The activity-bar Tree View subscribes to the same host state and opens the singleton workbench.

Inference requests have a 120-second deadline, 8 MiB response limit and 512 KiB request-context limit. A role has at most 20 model turns per round; public run history is bounded at 64 MiB. Exceeding a limit fails explicitly. Automatic original-workspace application, automatic Git commits/merges and concurrent task execution remain outside this milestone.

## Role isolation: data and execution boundaries

The current implementation separates Worker/Reviewer model bindings, workspace tasks and task-specific Reviewer instruction snapshots. Store tests cover same-connection/same-model bindings, cross-task and cross-workspace edits, preset changes, and mutation of input or returned snapshot objects. Discovery integration tests check that saved task requirements, Reviewer instructions and workspace identifiers do not enter model-list requests. User-scoped settings and connection-scoped model-list caches are intentionally shared; neither is conversation history.

The development branch now constructs separate role histories and actual model requests. Worker receives fixed execution instructions; Reviewer receives the saved task role snapshot. Runtime tests capture requests and verify role isolation; role labels in the interface do not establish isolation.

Execution maintains independent histories identified by workspace, task, execution instance and agent. A connection or model ID is never a conversation identity, including when both agents use identical endpoints and models. At execution start, freeze the task requirements, acceptance criteria, role instructions and configuration for that execution. Both agents share the requirements and acceptance criteria; each uses only its own role instructions and history. Later settings changes must not rewrite an active execution.

Worker hands over current artifacts and test evidence; Reviewer returns review conclusions, findings and requested changes. Do not copy the other agent's full conversation, internal analysis or unrelated tool records. Treat handed-over content as data, not instructions that can replace the receiving agent's role. The [protocol boundary](./protocol.md#role-handoffs) defines correlation and cancellation requirements. Execution records are separate from version-1 tasks; model IDs and cached lists still do not identify a conversation.

## Git task workspace foundation (development branch)

In dedicated mode, `src/git/` implements a lazy host service for the first execution: one `dualmind/task/<task UUID>/worker` branch and a separate worktree per task, outside the source repository under the extension's workspace storage directory. `ExecutionService` calls `TaskWorkspaces.prepare()` before its first model request; `Workbench.prepareTaskWorkspace()` remains a host integration wrapper. Opening settings, querying models or saving tasks does not prepare a workspace.

First preparation in dedicated mode requires Git 2.25+, a trusted single-folder workspace opened at the repository root, a named branch, a commit and a clean source directory (including staged, unstaged and non-ignored untracked files). Bare repositories, submodules, detached HEAD and multiple workspace folders are rejected. An existing linked worktree can be the source. The baseline commit is frozen at first preparation; ignored/generated files are not copied. Existing prepared task files are reused even after the source moves or becomes dirty. The Git preparation service performs no source checkout, automatic commit, stash, fetch, merge, push or dependency installation; Worker may subsequently prepare project dependencies under the plan.

A separate `dualMind.git.workspaces.v1` host record holds the task/repository identity, source branch, baseline commit, task branch, directory and `preparing`/`ready` phase. Intent is saved before Git creation; recovery verifies directory ownership, branch, common repository and baseline ancestry. Matching completed creation can recover a failed final state write. Conflicts, missing ready directories and partial checkouts with modifications are preserved for manual inspection. Preparation is serialized per repository and registry in the host; Git branch/path conflicts also prevent another process from overwriting existing work. Task storage stays version 1 with no migration.

The host binds a Worker or Reviewer file interface. Both can list/read regular files, inspect status and read tracked differences from the baseline; new untracked files are visible through status/list/read. Only Worker receives `writeFile`, including creation of ordinary subdirectories. Each access checks the task still exists, workspace trust, repository binding and worktree ownership. Absolute paths, traversal, symbolic links, hard-linked files and Git metadata are rejected. Git is invoked without a shell and with hooks, external diff, textconv, content filters and filesystem monitors disabled. LFS/filter-generated content is not downloaded or materialized by this service. Commands have a 20-second timeout and 2 MiB output limit; individual file reads/writes are limited to 2 MiB. Exceeding limits returns an error, not truncated evidence.

This is a tool-interface boundary, not an operating-system sandbox: external processes or users with filesystem access can still modify the worktree. Reviewer cannot run tests or arbitrary commands through this interface; Worker execution provides test evidence. The separate execution service enforces role histories. The [context contract](./protocol.md#role-handoffs) remains applicable.

## Task Git strategies

Tasks optionally select managed (default), current, or an existing local branch. Managed tasks own an external worktree; direct tasks use the trusted opened repository. Strategies lock when preparation intent is registered. Current mode resolves the branch at start/restart; specified mode keeps its saved branch name. Direct start/restart requires cleanliness and freezes the target HEAD as baseline. Chat continuation uses the existing binding, retains uncommitted artifacts and obtains fresh evidence without preparing again or switching branches. Preparation is serialized per repository; branch switching disables guessing, overwrite-ignore, hooks and filters, and preserves worktree occupancy checks.

Run summaries retain a complete Git binding (strategy, repository/common directory, working directory, branch, base commit and execution HEAD). Role interfaces and command boundaries verify that binding. Managed baseline reuse remains compatible with old registrations; old absent strategy fields mean managed. No storage version change or bulk migration is needed. The readonly binding lookup used by preview/Explorer never invokes preparation or switches branches. Reviewer permissions and role histories are unaffected. Directories are not OS sandboxes; external changes during an operation cannot be made atomic with arbitrary user processes.

## Reviewer planning and acceptance loop

The execution service uses preparing → planning → worker → checking (when additional checks exist) → reviewer phases. Reviewer reads task-related context and submits requirements, objectives, steps and criteria through submit_plan. Worker receives the plan, not Reviewer private history, implements it using file tools and run_command, and submits artifacts with finish_work. submit_review must cover every criterion; rejection includes a complete nextPlan. The host versions plans and persists plan, submission and review events. Existing role snapshots remain compatible; phase instructions define planning, implementation and acceptance responsibilities.

Models derive plans from requirements and relevant files; there is no language/project-type command detector. Reviewer keeps read-only file access. Worker handles project dependency preparation, inspection and verification, without obtaining Reviewer private conversation or protocol items. Reviewer handles user feedback; unhandled feedback blocks approval.

The host records actual command arguments, relative task directory, plan version, round, exit status, before/after artifact fingerprints and output. Full redacted output is stored in paged events; models read it using read_command_output pagination, so a shortened excerpt is not represented as complete evidence. Only genuine successful verification for the current plan/artifact version and criterion can pass. A newer failure for a criterion prevents reuse of its older success. Enabled additional custom checks are mandatory after every submission; legacy nonempty configurations stay enabled and disabled values are retained.

Reading review requires a reason for no command and concrete findings. Command-free tasks can complete independently. Commands require no systemd/cgroup probe and receive no memory or swap quota from the extension. Directory resolution rejects absolute paths, traversal and symlinks, but commands run with the user's permissions and this is not an OS sandbox. Each phase allows 20 model turns; command and error evidence retains output, history and redaction limits. Revisions retain acceptance IDs and verification methods to avoid silently weakening acceptance.

The command runner interface now exposes only run; the available probe is removed. Cancellation, timeout, output overflow and normal parent exit all clean up the remaining process group: SIGTERM first, SIGKILL after 3 seconds if still alive, with at most 10 seconds to confirm shutdown. Exited zombies awaiting OS reaping are not considered live processes. Only after cleanup does the execution service record the post-command fingerprint. Unconfirmed termination retains commandShutdown and blocks new execution in the current host. Services deliberately leaving the process group are outside this mechanism.

## Continuing conversation and execution boundaries

`RunRecords` appends user messages and Reviewer replies to `conversations/<taskId>.jsonl` in workspace extension storage. Updates reuse message IDs; conflicting content under an existing ID is rejected. Plans, submissions, reviews and system errors are projected from original run JSONL files without migration. Legacy conclusions lacking role information appear as system records. Conversation and evidence pagination are independent and deduplicate stable IDs; command and streaming-request chunks are grouped when reading evidence.

`ExecutionService` reads pending messages at active-task handoffs. The `answering` phase exposes only Reviewer read tools, `submit_answer` and `submit_plan`, with no commands, writes or acceptance tool. Read-only processing uses `kind: conversation` and terminal `answered`, preserving the prior execution verdict; a modification plan promotes it to `kind: execution`. Active batches retain their round budget; idle continuation creates a linked run and must obtain new verification evidence.

Continuation uses `TaskWorkspaces.binding(taskId, previous.git)` to validate and reuse artifacts instead of `prepare`, which can require cleanliness or switch branches. Previous command output is readable by Reviewer but is not imported into the current valid evidence map. Stopped messages are not automatically launched; reload recovers processing messages as pending with an interruption marker. Messages, errors, answers and execution records are redacted before persistence and transport.

`TaskChat.tsx` owns scrolling, sending, independent pagination and evidence panel state. Role information uses compact bars. Expanded event IDs survive updates and localization without remounting the panel. The viewport breakpoint selects a right panel or drawer with keyboard focus containment. Home, sidebar and detail ignore finished question-only sessions when selecting the latest actual execution status.
