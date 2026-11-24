# Usage

[简体中文](../zh/usage.md) · [Documentation](./README.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Locally committed feature revision:** host support for [worktrees, context summaries, and artifacts](./task-lifecycle.md) is implemented. [Scenes 30–34](./task-lifecycle-proposal.md) are approved and connected; [scenes 35–37](./tool-errors-proposal.md) cover the new tool-result UI. Version 0.0.5 and existing tags are retained.

**Source version: 0.0.5 · Baseline tag `v0.0.5` (before these later commits) · Unpublished.** Recorded November 23, 2026. Includes the native sidebar workbench and versioned design archives. A local commit, tag and VSIX do not imply a remote push or Marketplace/GitHub publication. Earlier version records remain unchanged. See the [0.0.5 version notes](./release-notes-0.0.5.md).

## Home, task detail, and errors

The workbench opens on task home. Open a task to enter its separate detail page. **New task → Create task** immediately opens the newly saved task in the **Pending** state without issuing model requests. Incomplete configuration does not block creation; detail identifies missing connections, credentials, or models. Complete them and click **Start**. Editing and saving apply directly to the task, with no separate draft submission step.

**Back to home** does not stop execution. Settings opened from detail return to that task, and native task-selection commands open the corresponding detail. Reload restores the page and task, falling back to home if the task is gone. Deleting the current task returns home; active executions must still stop successfully before deletion.

Application errors follow the interface language, including run failures, check commands, Git, inference, and bridge timeouts. Expand **Original details** for redacted source text when available. Command output and model responses remain verbatim. Old historical errors receive localized context with their original text. Changing language reformats structured errors immediately.

**Locally committed workspace revision:** home rows contain only a name and delete icon; select the name to open detail. Long names use a single-line ellipsis and expose the complete name on hover. Counts remain at the top; requirements, role, branch, rounds, and individual state are available in detail. Deletion requires confirmation, with Stop and delete for active tasks. Example names open detail, while deletion and the page New task button are disabled. [Scenes 28–29](./task-home-compact-proposal.md) are approved and integrated; this note does not claim inclusion in existing tags or installed packages.

## Requirements

The supported baseline is **Ubuntu 20.04+, x86_64/amd64, and VS Code 1.100.0+**. Other platforms and ARM64 are not yet validated. Installing from Marketplace or a built VSIX does not require a separate Node.js installation. See [Environment](./environment.md).

## Install from Marketplace

[DualMind on the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) has been public since **2026-11-18**, with Publisher **Pro-qing**, extension ID **Pro-qing.dual-mind**, and version **0.0.1**. Open Extensions (`Ctrl+Shift+X`), search `@id:Pro-qing.dual-mind`, verify the publisher and icon, then select **Install**. Alternatively:

```bash
code --install-extension Pro-qing.dual-mind
```

If you installed the old development identity, follow the Preview 1 switching instructions below before opening the new workbench.

The Preview label identifies this extension's early development stage. It uses the regular Marketplace channel; selecting a pre-release channel is not required. Future published updates under the same ID will use higher extension versions and can be installed through VS Code's normal extension update flow. GitHub releases retain the corresponding VSIX and checksum.

## Download, verify, and install a VSIX

The [Preview 2 GitHub Release](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2), published on 2026-11-18, provides the verified `Pro-qing.dual-mind` version `0.0.1` VSIX and checksum. Read the [Preview 2 notes](./release-notes-preview-2.md) for the changes and validation history.

Download `dual-mind-0.0.1.vsix` and `SHA256SUMS.txt` from **Preview 2 Assets** into the same directory. The two previews use the same filenames but different extension identities and checksums; use both files from the same Release. The automatically generated source-code archives are source snapshots, not the VSIX. From the download directory:

```bash
sha256sum --check SHA256SUMS.txt
```

Continue only when the checksum reports `OK`. Install the verified package:

```bash
code --install-extension dual-mind-0.0.1.vsix --force
```

You can also select **Extensions: Install from VSIX...** and choose the verified file. To build from source, follow [Development](./development.md) and [Packaging](./releasing.md). The retained historical local artifact is `release/dual-mind-0.0.1.vsix`; it and downloaded verification files are not committed to Git.

## Switch from Preview 1

The old `dual-mind-dev-placeholder.dual-mind` and new `Pro-qing.dual-mind` identities are separate extensions. Search `@id:dual-mind-dev-placeholder.dual-mind` in Extensions, use its gear menu to **Disable**, and reload the window before opening the new extension. This prevents duplicate command registrations. You can keep the old extension installed and disabled; its data is not actively deleted.

The new identity starts with its own tasks, connection metadata, API keys, model defaults, and custom roles. Recreate them as needed; no automatic migration is included. The `dualMind.language` user setting uses the same key and may carry over. `--force` does not move data across publishers. Preserve Preview 1's original asset if you need that historical build.

## Open the workbench

Click the DualMind activity-bar icon or run **DualMind: Open Workbench** (Chinese editor: **DualMind: 打开工作台**) to open the complete native sidebar workbench. It defaults to the Primary Side Bar; subsequent opens focus the same view. The native title-bar **＋** creates a task, home opens saved tasks, and Back/Settings navigate within the page. **DualMind: Show Status** remains a readiness check. Open a folder or workspace before creating tasks; settings and examples remain available without one.

Right-click the DualMind activity-bar icon and choose **Move To → Secondary Side Bar**, or drag the container, to relocate DualMind. VS Code remembers position and width; reopening does not force it back to the left. Full height means the workspace between the title and status bars.

Manually run **DualMind: Keep Terminal in Editor Area** from the view overflow menu or Command Palette to center the bottom panel. Opening or resizing the terminal then preserves sidebar height. Justified panel alignment can still shorten the sidebars; this is controlled by VS Code. DualMind adjusts layout only when this command is selected.

Hiding, collapsing or moving the sidebar and opening Settings do not stop execution. Revealing it refreshes the snapshot and persisted chat; message expansion and minimized output preferences remain per task. Upgrade migration imports navigation and chat preferences from old editor tabs only if sidebar state is absent. The old tab closes after the sidebar is ready and its display state is saved. Failed initialization retains a retry button in the old tab. Migration carries no credentials or execution context.

Task details initially collapse branch, round, model and editing information; expand **Task details and actions** to access them. Status and primary run controls remain visible. Chat fills the remaining height with the composer at the bottom; code and long messages scroll internally. Settings uses a single column and category selector, with Language at the top. Very short windows allow necessary content scrolling so controls remain reachable.

## Local tasks

The workbench begins with an empty task list. Open a folder or workspace before creating tasks. **New task** requires a name, requirements, and exactly one Reviewer role. It captures the role's instructions, uses five rounds by default, and lets you choose separate connections/models for Worker and Reviewer. Missing API configuration does not prevent **Create task**.

Select a saved task to see its requirements and role snapshot. **Edit task** updates its text, bindings, and round limit; its original role instructions remain fixed. Delete requires confirmation and removes only the task record. Workspace files, other tasks, and saved role presets are kept.

Tasks and the selected task are saved per workspace. Reopening the workbench or reloading the window restores them. Different workspaces have separate task lists. Without a workspace, you can still use settings and examples.

**View examples** displays read-only task/conversation examples with separate home and detail pages. **Exit examples** returns to real tasks. Examples never write records or issue model requests.

## API settings

The following discovery features are available in the development branch built from source. The published `0.0.1` / Preview 2 artifact retains its original local-settings-only behavior.

Settings → **API Connections** manages a name, HTTP(S) Base URL, and an optional default model ID. The initial URL is `https://api.openai.com/v1`; compatible API base paths are editable. Configure a first connection in this order:

1. Save its name and Base URL; the default model may be empty.
2. Use **Set key** to enter a key in the native VS Code password prompt. The page only receives its saved status.
3. Click **Test & fetch models**. **Model list accessible** confirms access to the list endpoint only; it does not verify inference or chat compatibility.
4. Search or choose an ID, or enter a custom ID, then **Save connection**. **Refresh models** never changes the current model value.

Opening settings or a selector makes no request. Lists remain separate per connection and are cached only while the workbench is mounted. Queries show loading, success with count/time, an empty list, or a localized error. Manual IDs remain usable when listing fails or is unsupported. Save an edited Base URL before querying; successful URL/key changes or deletion invalidate the old list. Cancelling key replacement leaves the old key and list intact.

Settings → **Defaults for new tasks** has its own entry in the settings category selector. Configure the Worker and Reviewer bindings here and click **Save defaults**. Changing categories discards unsaved edits; reloading restores the category and saved values. The connection’s own default model remains on API Connections.

Worker and Reviewer defaults are independent. New tasks inherit them; existing tasks retain their saved IDs even if absent from a new list. Switching a connection in a form uses that connection's default model, which may be empty. Arrow keys navigate suggestions, Enter selects, and Escape closes suggestions before closing a task dialog. Mouse selection closes the menu and keeps input focus.

Connection metadata, defaults, and role presets belong to the local VS Code user and are shared across workspaces. Deleting a connection removes its secret and clears matching defaults; referencing tasks remain editable. Credentials stay in VS Code secret storage, and queries never send task requirements or workspace content.

## Languages and Reviewer definitions

Use **Settings → Language**, or the VS Code `dualMind.language` setting:

| Value            | Behavior                                                       |
| ---------------- | -------------------------------------------------------------- |
| `auto` (default) | Simplified Chinese for a Chinese VS Code UI; English otherwise |
| `zh-CN`          | Simplified Chinese                                             |
| `en`             | English                                                        |

A manual choice is saved at user scope and applied immediately. Workbench labels, messages, validation, confirmations, and example content follow it. Native command names and setting descriptions follow VS Code's own display language.

Settings → **Reviewer Roles** provides Bug, Feature, Review, and Refactor. Each has independent English and Simplified Chinese purpose/instruction text. Built-in names are fixed and localized. Editing or restoring affects only the displayed language; restoring requires confirmation. Worker keeps its fixed general implementation role.

Custom names, purposes, and instructions stay in the original entered language. They can be created, edited, and deleted. Creating a task snapshots the selected preset and its language; later language changes or preset edits/deletion do not rewrite existing tasks. The snapshot may therefore remain English inside a Chinese interface, or vice versa.

Ordinary forms keep their values when changing the language selector. If role instructions have unsaved edits, the selector offers **Save**, **Discard**, or **Cancel** before switching. Save persists the current language version first. Explicitly save forms before leaving a page or reloading the window.

## Current limitations

The development branch executes tasks in dedicated worktrees or directly on a selected local branch with streaming, checks/review rounds and pause/continue/stop. Automatic editor-context collection and parallel execution remain unavailable. Host result integration is implemented, but its page controls are integrated. Examples remain isolated read-only content.

The [design archive](./design.md) contains 37 pairs: 37 approved. The drawings remain illustrative; current source supports single-task execution while parallel execution remains planned. See the [roadmap](./roadmap.md) for the remaining work. If the workbench command is missing after an update, confirm `Pro-qing.dual-mind` is installed and enabled in that VS Code instance and reload its window.

## Executing tasks (development source)

Open the workbench from the **DualMind activity-bar icon** and create a task. Creation opens its detail page in the pending state. For a new task, **Start** begins the first model request and execution.

1. Configure Worker and Reviewer connections, keys and models, selecting Chat Completions or Responses as appropriate. Models must support streaming and tool calls.
2. Open a trusted single-folder Git repository with a committed named branch. Direct mode requires a clean directory; managed mode permits source changes and does not copy them. Select a managed worktree, the current branch or an existing local branch.
3. Describe the requirements and press Start. **Reviewer first reads relevant project context, decomposes the request and issues an executable plan with acceptance criteria.** Initial planning does not consume an execution round.
4. **Worker implements that plan**, prepares project dependencies as needed, changes files and selects concrete verification commands. No preparation/check configuration is required. Worker does not automatically install system toolchains.
5. Worker submits artifacts, actual execution evidence and outstanding issues. **Reviewer inspects actual files and differences and accepts each criterion.** Approval completes the task. Rejection must include the next executable plan, which Worker automatically follows until approval, the round limit or a stop request.

Task detail shows the current plan version, steps, criteria, submission and verdict; history retains each plan and actual command records. Results include exit status, output and evidence IDs. Changed artifacts need fresh verification; failed or stale evidence cannot pass. Documentation-only work may use reading review with reasons and concrete evidence. Acceptance does not commit, merge or push.

Pause takes effect at an operation boundary. Chat messages can be submitted while running or paused; Reviewer handles them at role handoffs, and sending does not automatically resume a manual pause. Continue resumes; Stop cancels requests and commands. Each round is one Worker implementation plus Reviewer acceptance. Exhausted rounds retain outstanding work. Reload marks unfinished runs interrupted; restarting creates a new run and plan. Active/paused tasks and referenced critical connection settings remain locked. Deleting an active task first stops it and preserves Git artifacts.

### Advanced settings: additional custom commands

**Settings → Task execution** explains the default collaboration. Expand **Advanced settings** and enable **additional custom commands** to impose extra preparation or validation: preparation runs after planning and before Worker; every additional check runs after every submission and must pass. Worker can still perform other relevant validation.

Each command has a name, executable, arguments entered one per line and a 10–900 second timeout, default 180. For `npm run check`, enter program `npm` and argument lines `run` and `check`. The runner passes executable and arguments separately without implicit shell parsing. Disabling the switch retains saved values. Legacy nonempty configurations default enabled; empty ones default disabled. Settings changes affect subsequent runs.

Commands run directly as the current user in the task directory or an ordinary subdirectory. They require neither user systemd nor cgroup v2; the extension sets no memory or swap quota. Timeout defaults to 180 seconds (10–900 allowed), with a 2 MiB output cap. Cancellation, timeout and excessive output terminate the command process group. Normal parent exit also cleans up remaining group members before the artifact fingerprint is recorded. Unconfirmed shutdown is reported and blocks new tasks in the current host. This is not an OS sandbox; background services that deliberately leave the process group are outside that cleanup boundary. API keys are not injected into command environments, and logs and handoffs are redacted. Managed worktrees do not copy ignored dependencies; Worker prepares project dependencies as needed. Missing programs or permissions produce bilingual errors with original details, without automatic system toolchain installation.

## Development branch selection (development builds)

New tasks default to **Use a DualMind dedicated branch**. Choose **Use the current branch** to work directly in the opened project on the branch checked out at start/restart, or **Use a specified local branch** to select an existing local branch and switch to it before execution. Refreshing the branch list and saving a task never switch or create branches. No remote fetch or branch creation is performed in direct modes.

Every start/restart in direct mode requires a clean directory, including staged, unstaged and non-ignored untracked files. Commit or otherwise handle previous results yourself before restarting. Branches occupied by another worktree, ignored-file collisions and target submodules block switching. Once preparation has registered a directory, the strategy is locked; create a new task to change it. Old tasks retain dedicated mode.

Direct execution changes your project files. Stop, completion and deletion do not undo changes or switch back. **Show current project files** focuses Explorer; preview uses the execution's fixed branch/HEAD and never switches branches. Each direct start/restart records a fresh baseline from the target HEAD. Chat continuation validates and reuses the existing binding and uncommitted artifacts without resetting the baseline. A branch/HEAD change invalidates further access to that run; use a new execution after handling changes. Dedicated runs keep their existing baseline and retained worktree. Reviewer remains read-only in either mode. These changes are not in the published 0.0.1 artifact.

The manual worktree cleanup instructions in the [protocol guide](./protocol.md#internal-git-workspace-service) apply only to managed mode; never use them to remove the user’s directly opened project.

## Task chat, questions and continued changes

Task detail uses compact role/model bars, a main conversation, a right evidence panel and a persistent composer. User messages appear on the right; Reviewer plans, acceptance and replies, and Worker submissions appear on the left. Host errors are system messages. The original request appears once at the beginning; large role-description cards are removed. Wide windows use an approximately 360 px evidence panel; below 1100 CSS px it becomes a drawer with Escape, focus containment and focus restoration.

“View execution details” opens records through the associated message; clicking again locates records without closing the panel. “View all records” removes the scope. Tool records, process output and command details expand independently; original command output scrolls locally. Conversation and evidence have independent older-page controls. Reading history preserves position, with a new-message indicator instead of forced scrolling.

Creation still requires manual Start. Messages sent before the first start are saved. Afterwards use the composer for questions or changes: Enter sends, Shift+Enter inserts a newline, and IME composition does not send. Input clears only after persistence; failures retain it and retries reuse the message ID.

- Questions or clarification: Reviewer can inspect files and use `submit_answer`, without Worker or commands and without changing the previous acceptance verdict. The answer is marked Replied.
- Further changes: Reviewer inspects current artifacts and issues a plan, automatically starting the Worker/Reviewer loop. A new execution links its predecessor and source messages, with a fresh configured round budget.
- Messages during execution: messages are immediately saved as Pending while the current operation continues. Reviewer handles them at a role handoff or before final completion. Questions consume no revision round; changes need a new plan and retain the active batch’s round limit.
- Pause, stop and reload: sending does not resume a manual pause. Stop preserves pending messages for explicit “Process pending messages”. Failed or reloaded runs instead require Continue execution in the original run; processing messages cannot bypass recovery. Messages can be saved while another task runs, but processing still requires the single workspace slot.

Continuation supports managed worktrees, the current branch and a selected branch, retaining bound directories and uncommitted artifacts. User edits are inspected and changed artifacts need fresh evidence. Directory identity, branch and HEAD are checked first; mismatches retain the message and report an error without switching, resetting, committing or cleaning. Restart retains its original preparation semantics and direct-mode cleanliness checks; it is distinct from continued changes in chat.

## Native shell commands

Both roles now use the [shared shell execution layer](./shell-execution.md), with automatic environment inheritance and independent Reviewer verification. No language-specific setup setting is required. macOS and Windows native CI is configured; passing results must be observed before those platforms are called validated. Historical validation reports retain their original scope.

## Task-based branch names and compact chat controls

New managed workspaces use `dualmind/<task-name>-<short-id>`, including Chinese task names. Task-name normalization, conflicts and legacy preservation are described in the [proposal](./chat-progress-proposal.md#new-branch-naming-backend-implemented). Changing a task title after preparation does not rename its branch. Existing/current-branch modes keep the selected branch.

The activity strip shows the current role, operation and elapsed time, including silent model waits. Public process text remains distinct from plans and acceptance. Each message has an icon-only sizing button: short messages use natural height, long messages scroll inside a 240-pixel body (180 on narrow screens), and the outward-arrow icon expands them without changing font size. Hover for the action name. System messages and evidence records can minimize while retaining error badges. The panel’s minus icon leaves a 44-pixel rail on wide screens or a restore button in the narrow toolbar; new records/errors update badges without forcing it open. Manual choices survive task switches, language changes and Webview reload. Only the selected task’s presentation changes; execution continues.

## Failure recovery

The host now persists role, phase, operation outcomes and execution position. Failed and reloaded runs resume with current model connections while preserving the plan, work round and uncommitted files. The read-only `read_operation` tool exposes older operations independently of the latest 80 UI events. Ordinary tool failures still return to the model. Transient model failures before a valid stream event allow at most three requests sharing a 120-second budget, including waits; authentication, quota and protocol failures do not retry automatically.

The play icon with **Continue execution** resumes paused runs and eligible failed/interrupted runs. The fixed recovery notice identifies the role, phase, saved position and any blocking reason, including while evidence is minimized. Recovery checks and cancellable retry waits use host-reported state and request attempts; countdowns run only in the Webview. Restart remains a separate new run. See the [approved recovery design](./recovery-proposal.md) and [recovery behavior](./execution-recovery.md) for journal, process and evidence boundaries.

## Sidebar validation

See [sidebar validation](./sidebar-workbench-validation.md) for actual versions, platforms and screenshots, and [the approved proposal](./sidebar-workbench-proposal.md) for scenes 24–27.

## Lifecycle pages

Settings adds Model context and Saved artifacts. Configure per-connection/model windows, leaving the value blank for the estimated default. Saved artifacts lists manifests, exclusions, origin and recovery IDs and restores new tasks. Without a Git workspace, artifact pages explain the limitation while connection settings remain available.

Managed task creation selects a base, defaulting to the current branch at preparation. Task detail expands Model context usage and Task artifacts. Artifact actions refresh previews, commit, merge, check/complete/abort conflicts, clean up and create follow-up tasks. Commit messages are editable; changing the selected target requires a fresh preview, and merges check its captured commit. Conflict completion/abort confirmations show the actual merge directory and target commit. Direct mode cannot clean the source directory.

Deletion defaults to records only, with explicit preserve/cleanup opt-in. Active tasks stop before a refreshed cleanup confirmation. Cleaned tasks retain read-only chat/evidence and show follow-up/restore actions instead of the composer. Restoration opens a new pending task without starting it. After a timeout, inspect the saved state and reuse the operation ID for retry.

Tool failures, skipped/rejected calls and unknown results have separate labels. Three failures without progress pause for feedback and continuation. Historical errors and current acceptance blockers are separate; see [tool errors](./tool-errors.md).

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).

## Local Python

Preparation and recovery identify local Python 2.7/3 and common project environments, supplying verified invocation paths and versions to Worker and Reviewer. Execution retains `run_command`, without bundling/installing Python or changing global environments. See [local Python](./local-python.md) for discovery order, budgets and failure behavior.
