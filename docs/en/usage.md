# Usage

[简体中文](../zh/usage.md) · [Documentation](./README.md)

**Source version: 0.0.3 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.3 version notes](./release-notes-0.0.3.md).

## Home, task detail, and errors

The workbench opens on task home. Open a task to enter its separate detail page. **New task → Create task** immediately opens the newly saved task in the **Pending** state without issuing model requests. Incomplete configuration does not block creation; detail identifies missing connections, credentials, or models. Complete them and click **Start**. Editing and saving apply directly to the task, with no separate draft submission step.

**Back to home** does not stop execution. Settings opened from detail return to that task, and native sidebar selections open the corresponding detail. Reload restores the page and task, falling back to home if the task is gone. Deleting the current task returns home; active executions must still stop successfully before deletion.

Application errors follow the interface language, including run failures, check commands, Git, inference, and bridge timeouts. Expand **Original details** for redacted source text when available. Command output and model responses remain verbatim. Old historical errors receive localized context with their original text. Changing language reformats structured errors immediately.

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

After installation, reload VS Code if requested, open the Command Palette, and run **DualMind: Open Workbench** (Chinese editor: **DualMind: 打开工作台**). The command opens a single editor tab and reuses it on subsequent invocations. **DualMind: Show Status** remains a readiness check. Open a folder or workspace before creating tasks; without one, settings and read-only examples remain available.

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

Settings → **Defaults for new tasks** is a separate tab between API Connections and Reviewer Roles. Configure the Worker and Reviewer bindings here and click **Save defaults**. Switching tabs discards unsaved edits; reloading restores the selected tab and saved values. The connection’s own default model remains on API Connections.

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

The development branch executes tasks in dedicated worktrees or directly on a selected local branch with streaming, checks/review rounds and pause/continue/stop. Automatic editor-context collection, parallel execution and applying dedicated-worktree results to the original workspace remain unavailable. Examples remain isolated read-only content.

The seven [adopted design scenes](./design.md) remain in the repository. The drawings remain illustrative; current source supports single-task execution while parallel execution remains planned. See the [roadmap](./roadmap.md) for the remaining work. If the workbench command is missing after an update, confirm `Pro-qing.dual-mind` is installed and enabled in that VS Code instance and reload its window.

## Executing tasks (development source)

Open the workbench from the **DualMind activity-bar icon** and create a task. Creation opens its detail page in the pending state. Only **Start** sends inference requests.

1. Configure Worker and Reviewer connections, keys and models, selecting Chat Completions or Responses as appropriate. Models must support streaming and tool calls.
2. Open a trusted single-folder Git repository with a committed named branch and a clean directory for initial preparation. Select a managed worktree, the current branch or an existing local branch.
3. Describe the requirements and press Start. **Reviewer first reads relevant project context, decomposes the request and issues an executable plan with acceptance criteria.** Initial planning does not consume an execution round.
4. **Worker implements that plan**, prepares project dependencies as needed, changes files and selects concrete verification commands. No preparation/check configuration is required. Worker does not automatically install system toolchains.
5. Worker submits artifacts, actual execution evidence and outstanding issues. **Reviewer inspects actual files and differences and accepts each criterion.** Approval completes the task. Rejection must include the next executable plan, which Worker automatically follows until approval, the round limit or a stop request.

Task detail shows the current plan version, steps, criteria, submission and verdict; history retains each plan and actual command records. Results include exit status, output and evidence IDs. Changed artifacts need fresh verification; failed or stale evidence cannot pass. Documentation-only work may use reading review with reasons and concrete evidence. Acceptance does not commit, merge or push.

Pause takes effect at an operation boundary. Feedback submitted while paused is handled by Reviewer at the next planning/acceptance handoff. Continue resumes; Stop cancels requests and commands. Each round is one Worker implementation plus Reviewer acceptance. Exhausted rounds retain outstanding work. Reload marks unfinished runs interrupted; restarting creates a new run and plan. Active/paused tasks and referenced critical connection settings remain locked. Deleting an active task first stops it and preserves Git artifacts.

### Advanced settings: additional custom commands

**Settings → Task execution** explains the default collaboration. Expand **Advanced settings** and enable **additional custom commands** to impose extra preparation or validation: preparation runs after planning and before Worker; every additional check runs after every submission and must pass. Worker can still perform other relevant validation.

Each command has a name, executable, arguments entered one per line and a 10–900 second timeout, default 180. For `npm run check`, enter program `npm` and argument lines `run` and `check`. The runner passes executable and arguments separately without implicit shell parsing. Disabling the switch retains saved values. Legacy nonempty configurations default enabled; empty ones default disabled. Settings changes affect subsequent runs.

Commands run directly as the current user in the task directory or an ordinary subdirectory. They require neither user systemd nor cgroup v2; the extension sets no memory or swap quota. Timeout defaults to 180 seconds (10–900 allowed), with a 2 MiB output cap. Cancellation, timeout and excessive output terminate the command process group. Normal parent exit also cleans up remaining group members before the artifact fingerprint is recorded. Unconfirmed shutdown is reported and blocks new tasks in the current host. This is not an OS sandbox; background services that deliberately leave the process group are outside that cleanup boundary. API keys are not injected into command environments, and logs and handoffs are redacted. Managed worktrees do not copy ignored dependencies; Worker prepares project dependencies as needed. Missing programs or permissions produce bilingual errors with original details, without automatic system toolchain installation.

## Development branch selection (development builds)

New tasks default to **Use a DualMind dedicated branch**. Choose **Use the current branch** to work directly in the opened project on the branch checked out at execution start, or **Use a specified local branch** to select an existing local branch and switch to it before execution. Refreshing the branch list and saving a task never switch or create branches. No remote fetch or branch creation is performed in direct modes.

Every start/restart in direct mode requires a clean directory, including staged, unstaged and non-ignored untracked files. Commit or otherwise handle previous results yourself before restarting. Branches occupied by another worktree, ignored-file collisions and target submodules block switching. Once preparation has registered a directory, the strategy is locked; create a new task to change it. Old tasks retain dedicated mode.

Direct execution changes your project files. Stop, completion and deletion do not undo changes or switch back. **Show current project files** focuses Explorer; preview uses the execution's fixed branch/HEAD and never switches branches. Each direct run records a fresh baseline from the target HEAD. A branch/HEAD change invalidates further access to that run; use a new execution after handling changes. Dedicated runs keep their existing baseline and retained worktree. Reviewer remains read-only in either mode. These changes are not in the published 0.0.1 artifact.
