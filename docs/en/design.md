# Approved UI design reference

[简体中文](../zh/design.md) · [Documentation](./README.md)

**All five scenes, including the task-management and settings additions, are approved.** The original SVG/PNG files are preserved without alteration, including their historical review labels. They are design references with illustrative content, not current runtime screenshots. The React workbench now implements local drafts, connection/role settings, and bilingual UI; real execution and application remain future work. See [Usage](./usage.md) for current behavior.

Each scene is **1440 × 900**, uses a VS Code-style dark palette, and contains editable SVG text and vector elements. English interface labels are explained in both languages. The SVGs have no embedded images, scripts, external fonts, or external resources. The PNGs are rendered previews.

## Design gallery

| Scene                      | Editable source                               | Preview                                       |
| -------------------------- | --------------------------------------------- | --------------------------------------------- |
| 1. Parallel task workbench | [SVG](../design/dual-mind-workbench.svg)      | [PNG](../design/dual-mind-workbench.png)      |
| 2. API Connections         | [SVG](../design/dual-mind-api-settings.svg)   | [PNG](../design/dual-mind-api-settings.png)   |
| 3. Reviewer Roles          | [SVG](../design/dual-mind-reviewer-roles.svg) | [PNG](../design/dual-mind-reviewer-roles.png) |
| 4. New task                | [SVG](../design/dual-mind-new-task.svg)       | [PNG](../design/dual-mind-new-task.png)       |
| 5. Delete task             | [SVG](../design/dual-mind-delete-task.svg)    | [PNG](../design/dual-mind-delete-task.png)    |

### 1. Parallel task workbench

![Parallel task list and selected Worker / Reviewer conversations](../design/dual-mind-workbench.png)

A collapsible workspace task list sits beside the approved two-column layout. Each item shows its name, Reviewer role, state, round count, and delete action. The example has two running tasks, one paused task, and one completed task. Selecting an item changes the displayed conversation without stopping other tasks.

Start, pause, stop, human feedback, round limits, and result application belong to the selected task. Worker keeps its general implementation role. Reviewer displays the task's chosen review focus. Each agent has its own connection and model; the lock icons indicate the current run's configuration is fixed. A draft's bindings and round limit can be edited before starting; the initial round limit is five.

The result area keeps review approval separate from the user's decision to apply changes. Multiple tasks may produce drafts concurrently; each result requires its own preview and explicit application. The drawing applies no code.

### 2. API Connections

![API connection editor, independent model defaults, usage guard, and feedback states](../design/dual-mind-api-settings.png)

The shared Settings entry has **API Connections** and **Reviewer Roles** tabs. Connections are local user configurations for OpenAI-compatible endpoints, with a name, Base URL, default model ID, and saved-key status. New, save, delete, and test actions are shown. Worker and Reviewer have independently editable default connections and model IDs; newly created tasks inherit them.

**Set key / Replace key** opens a VS Code password input managed by the extension host. Settings shows only whether a key is saved; it does not display or receive the stored value. The separate prompt inset uses placeholder dots, not an actual credential. Connection-test feedback illustrates not configured, testing, connected, and failed states; none represents a real request.

Deletion is disabled while a connection is referenced by running or paused tasks. The editor lists the affected tasks and directs the user to stop them first. A saved default change affects future tasks; an active run retains its selected configuration. A saved draft with an unavailable connection must select a valid configuration before starting.

### 3. Reviewer Roles

![Four built-in Reviewer roles, editable instructions, custom roles, and a fixed Worker](../design/dual-mind-reviewer-roles.png)

The four built-in presets change **Reviewer only**:

| Role     | Default review focus                                                            |
| -------- | ------------------------------------------------------------------------------- |
| Bug      | Reproduction, root cause, effectiveness of the fix, and regression risk         |
| Feature  | Requirement coverage, acceptance criteria, boundary behavior, and compatibility |
| Review   | Correctness, security, maintainability, and test coverage                       |
| Refactor | Preserved behavior, structural improvement, and regression verification         |

Built-in names are fixed. Their purpose and review instructions can be edited and restored to defaults. **New role** opens the same editor with editable name, purpose, and instructions; custom roles also have edit and delete actions. Selecting a custom role replaces the built-in choice for that task, so there is exactly one Reviewer preset.

Task creation captures the selected role name and instructions. Later editing, resetting, or deleting that preset does not change existing tasks or their histories, including drafts. Removing a custom preset removes it from future selections. The fixed Worker role is shown as an informational card, with no role editor.

### 4. New task

![New-task dialog with Reviewer-role choice and an incomplete API setup that still permits a draft](../design/dual-mind-new-task.png)

Name, requirements, and one Reviewer role are required. The dialog confirms the two connection/model selections and a per-task round limit. The example deliberately leaves the Reviewer connection unset: **Create draft** remains available, while starting later requires both agents' API configurations to be complete. That disabled Start state must include a Settings entry and identify the missing configuration.

Creating a draft selects it in the workbench without starting model requests. Cancelling creates no task. The other tasks can continue running while this dialog is open.

### 5. Delete task

![Task deletion confirmation, stopping and failure states, and an empty-list variant](../design/dual-mind-delete-task.png)

Confirmation names the task and explains that only its record and conversation histories will be removed. Workspace files and other tasks are preserved. Draft, stopped, completed, or fully failed tasks can use **Delete task** directly. Running or paused tasks use **Stop and delete**: request stop, wait for acknowledgement, then remove the record. During stopping, the destructive action is disabled. If stopping fails, retain the task and its history and offer retry; cancellation of the dialog performs no action.

After deletion, select another remaining task; after the last deletion, show **No tasks yet** with **New task**. The side panels and lower note in this scene are labeled state examples for design review, not additional dialogs that would all open together.

## Layout and state conventions

- Tasks and conversation history are organized by workspace. Connections, default model bindings, and role presets are local to the VS Code user. Credential values belong in the host's secret storage.
- Background progress updates the task list; the selected task alone supplies the two conversation columns. A task reaching an error, pause, or completion does not stop another task.
- Below 1200 CSS pixels, collapse the task sidebar to a Tasks button opening a drawer. Below 900 CSS pixels, stack Worker above Reviewer. Settings forms and dialogs become scrollable single-column layouts; controls may wrap without hiding task identity or actions.
- During implementation, use VS Code theme variables, accessible control labels, visible focus indicators, and keyboard navigation. These static drawings do not implement interaction.

## Review and implementation gate

The owner has approved the full design. The local workbench follows its task, connection and role layout, and adds a language selector to Settings. Built-in Reviewer definitions have independent English/Chinese versions; custom text and task snapshots keep their original content. Running states and connection-test results in the drawings remain examples until their underlying features are implemented.

See [Architecture](./architecture.md) for the planned responsibilities and [Protocol draft](./protocol.md) for task association and configuration boundaries. The implemented local message types and future execution boundary are documented there.

## Updating and validating previews

SVG is the editable source. Keep a same-name PNG beside every SVG so README and VSIX documentation can display previews. In a Python environment with CairoSVG 2.7.1 installed, regenerate all previews from the repository root:

```bash
for svg in docs/design/*.svg; do
  python3 -m cairosvg "$svg" -o "${svg%.svg}.png"
done
npm run docs:check
npm run format:check
npm run package
```

Inspect each rendered image at full size for clipping, missing characters, overlap, and alignment. The documentation checker discovers every SVG/PNG pair, requires all five scenes, and checks canvas size, accessible title/description, editable text, static-vector constraints, and matching PNG dimensions. Rendering and visual inspection remain necessary to verify layout. CairoSVG is optional design tooling, not a runtime or standard build dependency.
