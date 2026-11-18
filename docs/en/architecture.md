# Architecture

[简体中文](../zh/architecture.md) · [Documentation](./README.md)

## Implemented local workbench

`dualMind.openWorkbench` creates or reveals one React Webview panel. The command completes after the panel renders a host snapshot; the serializer reopens the panel after a window reload. `dualMind.showStatus` remains a localized readiness notification. Commands, listeners, and panels are disposed through the extension lifecycle.

The host owns local state and validates all incoming operations. React owns navigation, form buffers, dialogs, and the isolated read-only example preview. The UI makes no provider requests. Saving a task creates a draft, not a running agent session.

## Repository layout

```text
src/extension.ts   Command registration and extension lifecycle
src/workbench.ts   Webview resources, CSP, message transport and host prompts
src/core/         Validated local task/configuration store
src/shared/       Message types, bilingual UI strings and Reviewer definitions
src/providers/    Reserved for real model adapters
src/editor/       Reserved for context collection and result application
webview/src/      React workbench, settings, forms, bridge and responsive styles
resources/        Packaged PNG icon and archived branding source
scripts/          Build, checks, local tests and actual Webview verification
tests/local/     Store and React interaction tests
tests/            VS Code extension-host tests
docs/design/     Five approved SVG scenes and matching PNG previews
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

## Future execution

The [approved designs](./design.md) also illustrate parallel task execution and review results. Real model adapters, independently cancellable sessions, streaming, pause/stop, feedback, and editor changes remain unimplemented. Future execution events must identify their task and run so output cannot cross between conversations. Reviewer approval must remain distinct from explicit user approval to apply a result.
