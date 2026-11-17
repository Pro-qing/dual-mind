# Architecture

[简体中文](../zh/architecture.md) · [Documentation](./README.md)

## Implemented today

VS Code invokes `activate` when `dualMind.showStatus` is executed. The extension registers the command and adds its disposable to `context.subscriptions`; VS Code disposes it when the extension is unloaded. The command only displays a notification. No model traffic, background agent process, Webview, or workspace modification is present.

## Repository layout

```text
src/              Extension entry; core, provider, editor, and shared placeholders
webview/          Future React interface; awaiting design approval
resources/        Future extension assets
scripts/          Build, environment, documentation, and packaging tools
tests/            Environment validation tests and extension-host smoke test
docs/en/          English guides
docs/zh/          中文指南
docs/design/      Shared SVG design proposal
.github/          CI and bilingual contribution templates
.vscode/          Launch and build tasks
```

## Planned boundaries

| Area             | Intended responsibility                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `src/core/`      | Worker/Reviewer orchestration, rounds, cancellation, and approval state |
| `src/providers/` | Model adapter interfaces and streaming model implementations            |
| `src/editor/`    | Read selected context and preview/apply explicitly accepted changes     |
| `src/shared/`    | Host/Webview message contracts and shared types                         |
| `webview/src/`   | React rendering of the task, conversation columns, and session state    |
| `resources/`     | Future extension icons and packaged static assets                       |

These areas are placeholders, not implemented services. Keep model calls and editor access in the extension host; the future Webview should handle presentation and user intent.

## Intended flow

```text
Task input → extension host → Worker → Reviewer
                                 ↑        │
                                 └─ revise┘
                                         ↓
                                approved result → user review → apply
```

The host will own session state and stream updates to the two columns. Pause, stop, error handling, maximum rounds, and human intervention need implementation after design approval. Approval by the Reviewer must remain distinct from the user's decision to apply code.

The first interface uses one editor tab with two columns, stacking vertically on narrow windows. [Design notes](./design.md) and the [protocol draft](./protocol.md) capture the next milestone.
