# Host / Webview protocol draft

[简体中文](../zh/protocol.md) · [Documentation](./README.md)

**Status: design notes only. No runtime message protocol or stable public API exists yet.**

The current public entry is the command `dualMind.showStatus`. It displays the scaffold status and accepts no arguments. Extension lifecycle is managed by VS Code.

## Planned message directions

| Direction      | Intent                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Webview → host | Start a task, pause or stop a session, provide human feedback, request result preview/application |
| Host → Webview | Session state, Worker/Reviewer output, review outcome, actionable errors                          |

The host owns orchestration, provider calls, cancellation, and editor operations. The React UI renders host state. A provider failure must remain distinguishable from a review rejection.

Before implementation, define the actual message types in `src/shared/`, validate Webview input at the host boundary, and settle session correlation and cancellation semantics. Credentials belong in the host's secret storage rather than Webview messages. The UI proposal shows model labels only; it does not define a credential configuration screen.

Field names, payload schemas, transport versioning, provider APIs, and persistence are intentionally undecided until the approved UI and first working session require them. Keep changes to this draft synchronized between languages.
