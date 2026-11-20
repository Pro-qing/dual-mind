# UI designs: adopted workbench and model-discovery scenes

[简体中文](../zh/design.md) · [Documentation](./README.md)

**Source version: 0.0.3 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.3 version notes](./release-notes-0.0.3.md).

**All seven scenes are adopted; scenes 6–7 are implemented in the development branch.** Original SVG/PNG files and their historical review labels remain unchanged. Drawings contain illustrative content, not live API results. Published 0.0.1 retains local settings; the development branch adds explicit model-list queries and selection. The development branch now also implements single-task execution, streaming and review rounds; original-workspace application and parallel execution remain planned. See [Usage](./usage.md).

Each scene is **1440 × 900**, uses a VS Code-style dark palette, and contains editable SVG text and vector elements. English interface labels are explained in both languages. The SVGs have no embedded images, scripts, external fonts, or external resources. The PNGs are rendered previews.

## Design gallery

| Scene                      | Editable source                                     | Preview                                             |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| 1. Parallel task workbench | [SVG](../design/dual-mind-workbench.svg)            | [PNG](../design/dual-mind-workbench.png)            |
| 2. API Connections         | [SVG](../design/dual-mind-api-settings.svg)         | [PNG](../design/dual-mind-api-settings.png)         |
| 3. Reviewer Roles          | [SVG](../design/dual-mind-reviewer-roles.svg)       | [PNG](../design/dual-mind-reviewer-roles.png)       |
| 4. New task                | [SVG](../design/dual-mind-new-task.svg)             | [PNG](../design/dual-mind-new-task.png)             |
| 5. Delete task             | [SVG](../design/dual-mind-delete-task.svg)          | [PNG](../design/dual-mind-delete-task.png)          |
| 6. API model discovery     | [SVG](../design/dual-mind-api-model-discovery.svg)  | [PNG](../design/dual-mind-api-model-discovery.png)  |
| 7. Task model selection    | [SVG](../design/dual-mind-task-model-selection.svg) | [PNG](../design/dual-mind-task-model-selection.png) |

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

## Implemented model discovery additions

Scenes 6–7 extend the adopted layout and define the implemented connection and model selection flow. These two scenes define model selection, not execution; overall execution capability is documented in the current version notes.

### 6. API connection and model discovery

![API connection form, searchable model IDs, and query-state examples](../design/dual-mind-api-model-discovery.png)

The center shows a saved connection and an open model selector. The right-hand cards are separate state examples for review, not panels shown together in the product. `example-model-*`, connection names, counts, and times are illustrative; no model is recommended or assumed to be available to an account.

New connections prefill `https://api.openai.com/v1`; the Base URL remains editable for OpenAI-compatible services. The **default model is optional** so the first-use sequence can be: save name and Base URL → set the key in VS Code's password prompt → **Test & fetch models** → choose a default if desired → save. Current `0.0.1` still requires a default model when saving; the development branch now allows an empty default. **Set key / Replace key** continues to show only saved-key status in the page.

**Test & fetch models** verifies access to the model-list endpoint and returns model IDs. **Refresh** repeats that query. Both require a saved connection and key; editing the Base URL requires saving before either query can run. Opening a page or selector does not automatically send a request. The visible result reports a count and query time, with success described as **Model list accessible**, not an inference test. Availability in a returned list does not establish chat or code-task suitability.

The editable selector searches model IDs while allowing an ID to be typed directly, including one absent from the list. Opening it shows suggestions; typing filters them. Returned IDs are displayed and saved verbatim, without translation or an invented friendly name. A successful query never selects the first model automatically or overwrites the current selection. Existing Worker/Reviewer default settings remain in the API page and reuse this same control; this scene focuses on the connection editor.

The state examples cover an unsaved connection, missing key, in-progress request, success in the center panel, an empty list, a failed request, and an edited address. Disable duplicate requests while fetching. On an empty list, unsupported endpoint or other failure, retain manual input and the selected ID; offer retry when configuration permits. Address/key changes invalidate old results, so another query is needed. An empty successful list is distinct from a failed query.

### 7. Task model selection

![independent Worker and Reviewer model choices, saved-ID preservation and narrow-window layout](../design/dual-mind-task-model-selection.png)

The main panel shows a new-task dialog with separate connections and model IDs: Worker uses an illustrative OpenAI selection; Reviewer uses a manually entered gateway ID with a missing key. **Create draft** remains available. The side insets show an edit-draft case, connection switching, and narrow layout; they are review references outside the dialog.

New drafts inherit the saved Worker/Reviewer defaults. Each selector uses only the selected connection's suggestions and offers fetch/refresh plus manual entry. Explicitly changing a connection uses that connection's default model, which may be blank, in the current form. Refreshing a list does not change the selected ID. Opening an existing draft keeps its bindings even when an ID is absent from the latest list; only an explicit edit and save changes them. Editing retains its Reviewer role snapshot; the built-in role choices in the main panel apply to creating a draft.

A missing key disables query actions for that connection but does not prevent typing an ID or saving the draft. A list failure also preserves typed and saved values. Choosing different connections for the two agents never mixes their suggestions or results. The main task sidebar and conversation layout remain as approved.

### Language, keyboard, and narrow-window behavior

| English label            | Simplified Chinese label |
| ------------------------ | ------------------------ |
| Test & fetch models      | 测试并获取模型           |
| Fetch / Refresh          | 获取模型／刷新模型       |
| Default model — Optional | 默认模型（可选）         |
| Search or type an ID     | 搜索或输入模型 ID        |
| Model list accessible    | 模型列表可访问           |
| Fetching models…         | 正在获取模型…            |
| No models returned       | 未返回模型               |
| Query failed             | 查询失败                 |
| Save draft               | 保存草稿                 |

All explanatory text, statuses, validation and errors will have both languages; model IDs and user-entered connection names keep their original text. Language switching preserves current form values and selections.

The editable combobox has an accessible label, keyboard focus, and a scrollable suggestion list. Tab traverses controls; Up/Down navigate an open list, Enter selects its highlighted option, and Escape closes the list before the dialog. Typing an unmatched ID keeps it as a manual value. Closing the list alone does not submit the form or clear the current ID. Long IDs retain their complete value, scroll in the input, and are available in full on focus/hover; suggestion rows may wrap to avoid losing the identifying suffix.

Below 900 CSS pixels, Worker and Reviewer stack, in that order. Connection settings use one scrollable column, with wrapping query controls and status text. Menus stay within the visible dialog, scroll independently, and may open upward when space below is limited. Save/cancel actions remain reachable. Reference-state cards in these drawings are explanatory material, not additional runtime panels.

## Layout and state conventions

- Tasks and conversation history are organized by workspace. Connections, default model bindings, and role presets are local to the VS Code user. Credential values belong in the host's secret storage.
- Background progress updates the task list; the selected task alone supplies the two conversation columns. A task reaching an error, pause, or completion does not stop another task.
- Below 1200 CSS pixels, collapse the task sidebar to a Tasks button opening a drawer. Below 900 CSS pixels, stack Worker above Reviewer. Settings forms and dialogs become scrollable single-column layouts; controls may wrap without hiding task identity or actions.
- During implementation, use VS Code theme variables, accessible control labels, visible focus indicators, and keyboard navigation. These static drawings do not implement interaction.

## Review and implementation gate

The owner has adopted scenes 1–7. The development branch implements explicit API queries and shared model selectors with isolated tests. Historical labels inside the original artwork are preserved; they do not describe current approval status. Running states and query results in the drawings remain examples. Built-in Reviewer definitions and saved task snapshots retain their behavior.

See [Architecture](./architecture.md) for implemented module responsibilities and [Protocol](./protocol.md) for task association and configuration boundaries. Implemented settings/execution messages, role handoffs and file-access boundaries are documented there.

## Updating and validating previews

SVG is the editable source. Keep a same-name PNG beside every SVG. Preserve the approved five pairs byte-for-byte. Use a separate Python environment with CairoSVG 2.7.1, and regenerate only these model-discovery scenes from the repository root:

```bash
for scene in dual-mind-api-model-discovery dual-mind-task-model-selection; do
  python3 -m cairosvg "docs/design/${scene}.svg" -o "docs/design/${scene}.png"
done
npm run docs:check
npm run format:check
```

Inspect each rendered image at full size for clipping, missing characters, overlap, and alignment. The documentation checker discovers every SVG/PNG pair, requires all seven scenes, and checks canvas size, accessible title/description, editable text, static-vector constraints, and matching PNG dimensions. This design-only delivery does not rebuild or replace a published VSIX. Rendering and visual inspection remain necessary to verify layout. CairoSVG is optional design tooling, not a runtime or standard build dependency.

## Execution interface in the development branch

The existing drawings remain unchanged references. The actual settings tabs are API Connections, Defaults for new tasks, Task execution and Reviewer Roles. The activity-bar icon opens a native task sidebar and the existing singleton workbench. Execution adds streamed role output, check evidence, pause/continue/stop and manual-result controls to scene 1. One task runs per workspace; examples of parallel execution remain future behavior.
