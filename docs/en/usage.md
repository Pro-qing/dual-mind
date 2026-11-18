# Usage

[简体中文](../zh/usage.md) · [Documentation](./README.md)

## Install and open

The supported baseline is **Ubuntu 20.04+, x86_64/amd64, and VS Code 1.100.0+**. Other platforms and ARM64 are not yet validated. A built VSIX does not require a separate Node.js installation. See [Environment](./environment.md).

The project has no public Marketplace release. Build `release/dual-mind-0.0.1.vsix` using the [development](./development.md) and [packaging](./releasing.md) guides. Generated packages are ignored by Git. Install from the repository root:

```bash
code --install-extension release/dual-mind-0.0.1.vsix --force
```

`--force` also replaces an older local build with the same unpublished version. Reload the VS Code window after updating. Open the Command Palette and run **DualMind: Open Workbench** (or **DualMind: 打开工作台** with a Chinese editor). The command opens a single editor tab and reuses it on subsequent invocations. **DualMind: Show Status** remains available as a readiness check.

## Local tasks

The workbench begins with an empty task list. Open a folder or workspace before creating tasks. **New task** requires a name, requirements, and exactly one Reviewer role. It captures the role's instructions, uses five rounds by default, and lets you choose separate connections/models for Worker and Reviewer. Missing API configuration does not prevent **Create draft**.

Select a saved draft to see its requirements and role snapshot. **Edit draft** updates its text, bindings, and round limit; its original role instructions remain fixed. Delete requires confirmation and removes only the task record. Workspace files, other tasks, and saved role presets are kept.

Drafts and the selected task are saved per workspace. Reopening the workbench or reloading the window restores them. Different workspaces have separate task lists. Without a workspace, you can still use settings and examples.

**View examples** displays read-only task/conversation examples and the proposed parallel-task appearance. **Exit examples** returns to real drafts. Examples never write records or issue model requests.

## API settings

Settings → **API Connections** manages OpenAI-compatible endpoint names, absolute HTTP(S) Base URLs, and default model IDs. Save a connection, then use **Set key / Replace key** to enter its API key in the native VS Code password prompt. Only saved-key status is returned to the workbench; credentials are stored in VS Code secret storage.

Worker and Reviewer defaults are independent. Save default bindings for new drafts; existing drafts keep their own choices. Deleting a connection removes its credential and clears matching defaults. Referencing drafts remain, display an unavailable binding, and can be edited to choose a replacement.

Connection metadata, defaults, and role presets belong to the local VS Code user. They can be used in other workspaces. **Test connection** is disabled in this milestone, and saving metadata makes no network request.

## Languages and Reviewer definitions

Use **Settings → Language**, or the VS Code `dualMind.language` setting:

| Value            | Behavior                                                       |
| ---------------- | -------------------------------------------------------------- |
| `auto` (default) | Simplified Chinese for a Chinese VS Code UI; English otherwise |
| `zh-CN`          | Simplified Chinese                                             |
| `en`             | English                                                        |

A manual choice is saved at user scope and applied immediately. Workbench labels, messages, validation, confirmations, and example content follow it. Native command names and setting descriptions follow VS Code's own display language.

Settings → **Reviewer Roles** provides Bug, Feature, Review, and Refactor. Each has independent English and Simplified Chinese purpose/instruction text. Built-in names are fixed and localized. Editing or restoring affects only the displayed language; restoring requires confirmation. Worker keeps its fixed general implementation role.

Custom names, purposes, and instructions stay in the original entered language. They can be created, edited, and deleted. Creating a task snapshots the selected preset and its language; later language changes or preset edits/deletion do not rewrite existing drafts. The snapshot may therefore remain English inside a Chinese interface, or vice versa.

Ordinary forms keep their values when changing the language selector. If role instructions have unsaved edits, the selector offers **Save**, **Discard**, or **Cancel** before switching. Save persists the current language version first. Explicitly save forms before leaving a page or reloading the window.

## Current limitations

Model execution, connection tests, streaming, automatic review loops, feedback submission, pause/stop, editor context collection, and code application are not connected yet. These controls are disabled rather than reporting simulated success. Real task records are drafts; only the isolated examples display running/paused/completed states.

The five [approved design scenes](./design.md) remain in the repository. Their execution states describe intended later behavior. See the [roadmap](./roadmap.md) for the remaining work. If the workbench command is missing after an update, confirm the VSIX is installed in that VS Code instance and reload its window.
