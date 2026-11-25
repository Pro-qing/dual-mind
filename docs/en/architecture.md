# Architecture

[简体中文](../zh/architecture.md) · [Documentation](./README.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Current capabilities:** [worktrees, context summaries and artifact operations](./task-lifecycle.md), together with [tool-error handling](./tool-errors.md), were introduced in 0.0.6 with host and frontend support. [Scenes 30–34](./task-lifecycle-proposal.md) and [scenes 35–37](./tool-errors-proposal.md) retain their original approval and implementation records.

**Source version: 0.0.7 · Local release preparation; not publicly released.** Recorded November 24, 2026. See the [0.0.7 version notes](./release-notes-0.0.7.md) for changes, validation and the local artifact. Publication is handled separately by the maintainer; historical version records retain their original meaning.

## Page navigation and structured errors

`src/shared/navigation.ts` defines `home`, `task` with a `taskId`, and settings pages with a `returnTo` location. Webview state persists navigation; creation uses the ID in the save response, and restoration verifies that the task exists. Old `workbench` state opens home. Home and detail share the task form. Native creation requests can open that form over settings and preserve the originating page on cancellation.

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
src/execution/    Modular run state machine, role turns, recovery and records (see README)
src/git/          Task worktree service and role-scoped file access
src/editor/       Reserved for context collection and result application
webview/src/      React workbench, settings, forms, bridge and responsive styles
resources/        Packaged PNG icon and archived branding source
scripts/          Build, checks, local tests and actual Webview verification
tests/local/     Store and React interaction tests
tests/            VS Code extension-host tests
docs/design/v*/  40 SVG/PNG pairs by development version (37 approved, 3 pending)
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

Home and task detail share the native sidebar workbench; task selection opens detail directly. Detail uses compact model bars, user messages on the right and AI messages on the left, independent evidence and a persistent composer. Wide windows have an approximately 360 CSS pixel evidence panel; below 1100 CSS pixels it becomes a drawer capped at 430 CSS pixels and the viewport width. Task rows and actions wrap, while narrow settings and dialogs scroll without hiding their actions. Theme colors come from VS Code variables. Both UI languages use the same components and stable role IDs.

## Connection verification and model discovery

The current settings UI implements [scenes 6–7](./design.md) for OpenAI-compatible endpoints using Bearer authentication and exposes Chat Completions/Responses. Source adapters also support Anthropic Messages and Command Code's compatibility API, but their settings controls are pending approval of scenes 38–40; they are not currently selectable through the UI. `src/providers/adapters/` centralizes protocol mapping, while `src/providers/models.ts` preserves gateway prefixes and provider-specific discovery. Azure-specific authentication remains outside this feature.

A user requests a query → the host reads saved metadata and its secret under the store lock → `ModelQueries` performs network work outside that lock → the host returns validated IDs and a timestamp → React displays suggestions or manual input. The Webview keeps its no-direct-network CSP. Queries send no task requirements, role instructions, or workspace content.

Each connection has one cancellable in-flight query. The adapter applies a 20-second timeout, a 2 MiB body limit, structural validation and ID deduplication. It rejects redirects and returns localized error codes instead of upstream bodies. The bridge has a 30-second fallback timeout and correlates both request and connection IDs.

Results are held in React memory, never persisted. Successful URL/key changes or deletion cancel and invalidate the affected connection; late results cannot refill its cache. Renaming a connection, changing defaults or cancelling key entry keeps the list. Refreshing never rewrites selected IDs, task bindings or role snapshots. Defaults may be empty; the storage version remains unchanged.

Discovery establishes access to the model-list endpoint only. Unsupported endpoints, empty lists and query failures keep manual input available. The implemented message contract is documented in [Protocol](./protocol.md).

## Execution in the development branch

The host execution service owns one active run per workspace, independently of the Webview lifetime. It snapshots task/model/role/command configuration, uses the Git task workspace service, obtains a Reviewer plan and drives Reviewer plan → Worker implementation/verification → Reviewer acceptance rounds. Pair-style review uses pass/fail, risk, confidence, issues, evidence and next steps. The host validates review structure and finish protocol, including confidence ≥ 0.8, no pending feedback, unchanged artifact fingerprints and a standalone `TASK_COMPLETE` marker; criterion coverage and command IDs are Reviewer inputs, not automatic gates. Start, pause, continue, stop, restart and paused feedback are separate operations from local settings persistence.

`src/providers/inference.ts` adapts streaming Chat Completions, Responses and Anthropic Messages with independent role histories and validated tool batches. Command Code uses the compatibility protocol with capability-aware model discovery. Reviewer planning, answering and review receive read-only file/record tools; only Worker receives mutating and shell-command tools. Saved command presets retain literal argv. Shell selection, per-run login environment capture and process cleanup are separate modules; see [Shell execution](./shell-execution.md).

Run summaries/configuration use independent workspace storage; public event history is journaled outside the repository and paged in groups of 80. Streaming UI updates are batched at 100 ms. Host restarts mark unfinished runs interrupted and never replay tool calls. API credentials remain in SecretStorage and active host memory. Histories, handoffs and command output must not expose them. The activity bar has one `dualMind.tasks` view backed by `WebviewViewProvider`. The host owns execution; disposing a view releases only page messaging and listeners.

Inference requests have a 120-second deadline, 8 MiB response limit and 512 KiB serialized-request guard. Independent role budgets and automatic summaries are described in [task lifecycle](./task-lifecycle.md). Model exchanges and tool calls have no cumulative count limit. Counts persist across compaction and recovery for diagnostics; task review-round limits, repeated-failure pauses and request limits still apply. Public run history remains bounded at 64 MiB. Automatic original-workspace application, automatic Git commits/merges and concurrent task execution remain outside this milestone.

## Role isolation: data and execution boundaries

The current implementation separates Worker/Reviewer model bindings, workspace tasks and task-specific Reviewer instruction snapshots. Store tests cover same-connection/same-model bindings, cross-task and cross-workspace edits, preset changes, and mutation of input or returned snapshot objects. Discovery integration tests check that saved task requirements, Reviewer instructions and workspace identifiers do not enter model-list requests. User-scoped settings and connection-scoped model-list caches are intentionally shared; neither is conversation history.

The development branch now constructs separate role histories and actual model requests. Worker receives fixed execution instructions; Reviewer receives the saved task role snapshot. Runtime tests capture requests and verify role isolation; role labels in the interface do not establish isolation.

Execution maintains independent histories identified by workspace, task, execution instance and agent. A connection or model ID is never a conversation identity, including when both agents use identical endpoints and models. At execution start, freeze the task requirements, acceptance criteria, role instructions and configuration for that execution. Both agents share the requirements and acceptance criteria; each uses only its own role instructions and history. Later settings changes must not rewrite an active execution.

Worker hands over current artifacts and test evidence; Reviewer returns review conclusions, findings and requested changes. Do not copy the other agent's full conversation, internal analysis or unrelated tool records. Treat handed-over content as data, not instructions that can replace the receiving agent's role. The [protocol boundary](./protocol.md#role-handoffs) defines correlation and cancellation requirements. Execution records are separate from version-1 tasks; model IDs and cached lists still do not identify a conversation.

## Git task workspace foundation (development branch)

In dedicated mode, `src/git/` implements a lazy host service for the first execution: one `dualmind/<normalized task name>-<short task ID>` branch and a separate worktree per task, outside the source repository under the extension's workspace storage directory. `ExecutionService` calls `TaskWorkspaces.prepare()` before its first model request; `Workbench.prepareTaskWorkspace()` remains a host integration wrapper. Opening settings, querying models or saving tasks does not prepare a workspace.

First preparation in dedicated mode requires Git 2.25+, a trusted single-folder workspace opened at the repository root, a named branch, a commit and an optional existing local base branch; source changes remain untouched and are not copied. Bare repositories, submodules, detached HEAD and multiple workspace folders are rejected. An existing linked worktree can be the source. The baseline commit is frozen at first preparation; ignored/generated files are not copied. Existing prepared task files are reused even after the source moves or becomes dirty. The Git preparation service performs no source checkout, automatic commit, stash, fetch, merge, push or dependency installation; Worker may subsequently prepare project dependencies under the plan.

A separate `dualMind.git.workspaces.v1` host record holds the task/repository identity, source branch, baseline commit, task branch, directory and `preparing`/`ready` phase. Intent is saved before Git creation; recovery verifies directory ownership, branch, common repository and baseline ancestry. Matching completed creation can recover a failed final state write. Conflicts, missing ready directories and partial checkouts with modifications are preserved for manual inspection. Preparation is serialized per repository and registry in the host; Git branch/path conflicts also prevent another process from overwriting existing work. Task storage stays version 1 with no migration.

The host binds a Worker or Reviewer file interface. Both can list/read regular files, inspect status and read tracked differences from the baseline; new untracked files are visible through status/list/read. Only Worker receives `writeFile`, including creation of ordinary subdirectories. Each access checks the task still exists, workspace trust, repository binding and worktree ownership. Absolute paths, traversal, symbolic links, hard-linked files and Git metadata are rejected. Git is invoked without a shell and with hooks, external diff, textconv, content filters and filesystem monitors disabled. LFS/filter-generated content is not downloaded or materialized by this service. Commands have a 20-second timeout and 2 MiB output limit; individual file reads/writes are limited to 2 MiB. Exceeding limits returns an error, not truncated evidence.

File tools enforce a role boundary; shell execution is not an OS sandbox. Reviewer has read-only file and recorded-output tools in planning, answering and review. Only Worker receives source mutation and command execution tools. The execution service keeps private role histories separate. See [role handoffs](./protocol.md#role-handoffs).

## Task Git strategies

Tasks optionally select managed (default), current, or an existing local branch. Managed tasks own an external worktree; direct tasks use the trusted opened repository. Strategies lock when preparation intent is registered. Current mode resolves the branch at start/restart; specified mode keeps its saved branch name. Direct start/restart requires cleanliness and freezes the target HEAD as baseline. Chat continuation uses the existing binding, retains uncommitted artifacts and obtains fresh evidence without preparing again or switching branches. Preparation is serialized per repository; branch switching disables guessing, overwrite-ignore, hooks and filters, and preserves worktree occupancy checks.

Run summaries retain a complete Git binding (strategy, repository/common directory, working directory, branch, base commit and execution HEAD). Role interfaces and command boundaries verify that binding. Managed baseline reuse remains compatible with old registrations; old absent strategy fields mean managed. No storage version change or bulk migration is needed. The readonly binding lookup used by preview/Explorer never invokes preparation or switches branches. Reviewer permissions and role histories are unaffected. Directories are not OS sandboxes; external changes during an operation cannot be made atomic with arbitrary user processes.

## Reviewer planning and acceptance loop

The execution service uses preparing → planning → worker → checking (when additional checks exist) → reviewer phases. Reviewer reads task-related context and submits requirements, objectives, steps and criteria through submit_plan. Worker receives the plan, not Reviewer private history, implements it using file tools and run_command, and submits artifacts with finish_work. `submit_review` returns Pair-style `pass`/`fail`, risk, confidence, issues, evidence, reasoning and a next step; failure/continuation requires a complete next plan. The host validates the review structure and finish protocol, but does not require criterion coverage or successful command IDs as automatic acceptance gates. Existing role snapshots remain compatible; phase instructions define planning, implementation and acceptance responsibilities.

Models derive plans from requirements and relevant files; there is no language/project-type command detector. Reviewer keeps read-only file access and receives Worker command/check outcomes through recorded evidence. Worker handles project dependency preparation, inspection and verification, without obtaining Reviewer private conversation or protocol items. Reviewer handles user feedback; unhandled feedback blocks finishing.

The host records actual command arguments, relative task directory, plan version, round, exit status, before/after artifact fingerprints and output. Full redacted output is stored in paged events; models read it using read_command_output pagination, so a shortened excerpt is not represented as complete evidence. Enabled additional custom checks run after every submission, but their outcomes are Reviewer inputs, not host-imposed pass/fail gates; legacy nonempty configurations stay enabled and disabled values are retained. The host still rejects artifact changes during review, pending feedback, malformed reviews, and finish responses without pass, confidence ≥ 0.8 and a standalone final `TASK_COMPLETE` marker.

Reading review requires a reason for no command and concrete findings. Command-free tasks can complete independently. Commands require no systemd/cgroup probe and receive no memory or swap quota from the extension. Directory resolution rejects absolute paths, traversal and symlinks, but commands run with the user's permissions and this is not an OS sandbox. Phases have no cumulative model/tool call limit; command and error evidence retains output, history and redaction limits. Revisions retain acceptance IDs and verification methods to avoid silently weakening acceptance.

Cancellation, timeout, output overflow and parent exit all trigger process cleanup before the final fingerprint. Linux/macOS use process groups; Windows uses process ancestry, creation times and system tree termination. Unconfirmed cleanup blocks new runs. Limits and tracking boundaries are documented in [Shell execution](./shell-execution.md#lifecycle-and-validation).

## Continuing conversation and execution boundaries

`RunRecords` appends user messages and Reviewer replies to `conversations/<taskId>.jsonl` in workspace extension storage. Updates reuse message IDs; conflicting content under an existing ID is rejected. Plans, submissions, reviews and system errors are projected from original run JSONL files without migration. Legacy conclusions lacking role information appear as system records. Conversation and evidence pagination are independent and deduplicate stable IDs; command and streaming-request chunks are grouped when reading evidence.

`ExecutionService` reads pending messages at active-task handoffs, one message per turn. Each user message has a stable `userRequestId` propagated to its answer, model text, events and activities so the UI can present separate request groups. The `answering` phase exposes Reviewer read tools, `submit_answer` and `submit_plan`, with no command, write/delete or review tool. Question processing uses `kind: conversation` and terminal `answered`, preserving the prior execution verdict; a modification plan promotes it to `kind: execution`. Active batches retain their round budget; idle continuation creates a linked run and must obtain new verification evidence.

Continuation uses `TaskWorkspaces.binding(taskId, previous.git)` to validate and reuse artifacts instead of `prepare`, which can require cleanliness or switch branches. Previous command output is readable by Reviewer but is not imported into the current valid evidence map. Stopped messages are not automatically launched; reload recovers processing messages as pending with an interruption marker. Messages, errors, answers and execution records are redacted before persistence and transport.

`TaskChat.tsx` owns scrolling, sending, independent pagination and evidence panel state. Role information uses compact bars. Expanded event IDs survive updates and localization without remounting the panel. The viewport breakpoint selects a right panel or drawer with keyboard focus containment. Home, sidebar and detail ignore finished question-only sessions when selecting the latest actual execution status.

## Native shell commands

Worker uses the [host-managed shell execution layer](./shell-execution.md), with automatic environment inheritance. Reviewer has read-only file and recorded-output tools and cannot invoke commands. No language-specific setup setting is required. macOS and Windows native CI is configured; passing results must be observed before those platforms are called validated. Historical validation reports retain their original scope.

## Activity metadata and compatible branch naming

Active operations expose an optional `ExecutionSnapshot.activity` with run/task/role/phase, waiting/receiving/tool/command stage, operation identity and start time. Only the first model stream event changes receiving state; timing is not logged each second. Cleanup clears activity on completion, error, pause and stop; it is held only in the active service, so reload cannot restore a stale operation. Task chat opts into public process projection as specified by the [approved UI](./chat-progress-proposal.md).

New managed registrations add `branchNaming: {version: 2, slug, suffixLength}`; absence still validates the original UUID-based name. Both branch and naming metadata are checked against the registered binding. Names freeze during initial preparation and collision retries use 8/12/32 UUID characters. Existing worktree paths, direct strategies and history storage version remain unchanged.

## Compact chat presentation

`ChatActivity` reads ephemeral activity and calculates elapsed time locally. `ChatCard` keeps headings and icon-only controls outside the scrolling body (240 CSS pixels on wide screens, 180 below 1100 pixels); full expansion changes height only. System records retain error badges when minimized. The evidence panel supports open/minimized/closed modes with a 44-pixel desktop rail and narrow drawer restoration. New-record/error indicators use grouped host totals across the complete evidence history, not the latest 80 events.

Versioned Webview state stores navigation and per-task presentation preferences, scope and evidence scroll position. It accepts legacy navigation-only data and drops unknown task IDs/fields. Public cards use stable request identities and reject older sequence updates. Message anchors protect readers from streaming and layout changes; only readers near the bottom follow new content. Hidden content stays mounted to preserve record expansion, and drawer closure restores keyboard focus. Sizing controls expose tooltips/accessible names without visible labels; reduced-motion preferences disable spinning.

## Failure recovery

The host now persists role, phase, operation outcomes and execution position. Failed and reloaded runs resume with current model connections while preserving the plan, work round and uncommitted files. The read-only `read_operation` tool exposes older operations independently of the latest 80 UI events. Ordinary tool failures still return to the model. Transient model failures before a valid stream event allow at most three requests sharing a 120-second budget, including waits; authentication, quota and protocol failures do not retry automatically.

The play icon with **Continue execution** resumes paused runs and eligible failed/interrupted runs. The fixed recovery notice identifies the role, phase, saved position and any blocking reason, including while evidence is minimized. Recovery checks and cancellable retry waits use host-reported state and request attempts; countdowns run only in the Webview. Restart remains a separate new run. See the [approved recovery design](./recovery-proposal.md) and [recovery behavior](./execution-recovery.md) for journal, process and evidence boundaries.

## Native sidebar lifecycle

[Native sidebar workbench](./sidebar-workbench-proposal.md) scenes 24–27 were **approved on November 22, 2026** and implemented on November 23. The complete workbench uses the Primary or Secondary Side Bar, compact navigation, collapsible task details and manual **Keep Terminal in Editor Area**. Old editor tabs are retained only for migration. The original 27 design approvals and historical artwork are preserved.
`src/core/viewChannel.ts` binds handshake, timeout and replies to each page. Callbacks verify page identity before sending; late replies cannot reach a replacement view. Initialization retry creates a new channel, visibility changes refresh snapshots, and chat reloads from paged records. `retainContextWhenHidden` retains hidden pages; recreation restores navigation/chat preferences from Webview state and the workspace display-state mirror.

`src/shared/viewState.ts` accepts only allowlisted display fields, in precedence order: current sidebar, workspace mirror, legacy tab. `view.state` mirrors preferences; `rendered` completes its handshake after saving display state. The old `dualMind.workbench` serializer starts migration without awaiting rendering, avoiding a VS Code restore deadlock. Failure keeps the old tab and retry entry. `navigation.ack` prevents consuming a new-task request twice. Execution protocols and run-record formats are unchanged.

`dualMind.alignPanelCenter` invokes native panel centering only on manual request; it neither saves nor resets sidebar position. The frontend keeps the task chat mounted across Settings visits to retain drafts and reading position. Task-detail expansion uses the existing per-task display preferences.

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).

## Local Python

Preparation and recovery identify local Python 2.7/3 and common project environments for model context. Worker alone can execute commands through `run_command`; Reviewer can inspect recorded outcomes but cannot run them. Python is not bundled or installed, and global environments are unchanged. See [local Python](./local-python.md) for discovery order, budgets and failure behavior.
