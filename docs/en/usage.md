# Usage

[简体中文](../zh/usage.md) · [Documentation](./README.md)

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

You can also select **Extensions: Install from VSIX...** and choose the verified file. To build from source, follow [Development](./development.md) and [Packaging](./releasing.md). The current local artifact is `release/dual-mind-0.0.1.vsix`; it and downloaded verification files are not committed to Git.

## Switch from Preview 1

The old `dual-mind-dev-placeholder.dual-mind` and new `Pro-qing.dual-mind` identities are separate extensions. Search `@id:dual-mind-dev-placeholder.dual-mind` in Extensions, use its gear menu to **Disable**, and reload the window before opening the new extension. This prevents duplicate command registrations. You can keep the old extension installed and disabled; its data is not actively deleted.

The new identity starts with its own drafts, connection metadata, API keys, model defaults, and custom roles. Recreate them as needed; no automatic migration is included. The `dualMind.language` user setting uses the same key and may carry over. `--force` does not move data across publishers. Preserve Preview 1's original asset if you need that historical build.

## Open the workbench

After installation, reload VS Code if requested, open the Command Palette, and run **DualMind: Open Workbench** (Chinese editor: **DualMind: 打开工作台**). The command opens a single editor tab and reuses it on subsequent invocations. **DualMind: Show Status** remains a readiness check. Open a folder or workspace before creating drafts; without one, settings and read-only examples remain available.

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

The five [approved design scenes](./design.md) remain in the repository. Their execution states describe intended later behavior. See the [roadmap](./roadmap.md) for the remaining work. If the workbench command is missing after an update, confirm `Pro-qing.dual-mind` is installed and enabled in that VS Code instance and reload its window.
