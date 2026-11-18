# Security

[简体中文](./SECURITY.zh.md) · [Project home](./README.md)

## Current scope

DualMind 0.0.1 previews are early local-workbench milestones. The workbench saves workspace drafts, user connection metadata, model defaults, and Reviewer presets. API keys entered through the native VS Code password prompt are stored through `ExtensionContext.secrets`. The Webview receives only saved-key status, not credential values.

The host validates local messages; the Webview limits local resource access and uses a nonce-based content security policy with direct network connections disabled. These are implemented boundaries, not a guarantee that the extension has no vulnerabilities. The extension does not yet make model requests, run review loops, collect editor context, or apply changes to workspace files. Read-only examples are isolated from saved tasks.

Preview users should use the latest preview assets on the [Releases page](https://github.com/Pro-qing/dual-mind/releases). There is no long-term support or guaranteed response-time commitment for preview versions.

## Private reports

GitHub private vulnerability reporting is **enabled and verified as of November 18, 2026**. Use [Report a vulnerability](https://github.com/Pro-qing/dual-mind/security/advisories/new), also available from the repository's Security page. This channel is for security reports; ordinary bugs and feature requests belong in issues.

Include the affected tag/commit, VS Code and operating-system versions, reproduction steps, impact, and relevant logs. Remove API keys, tokens, personal data, and confidential task content. Do not post exploitable details in public issues while a report is being assessed.

If the private reporting entry becomes unavailable, request a private contact without publishing vulnerability details. A separate private maintainer email is **not configured**; no address or response SLA is implied. Conduct incidents are addressed separately in the [code of conduct](./CODE_OF_CONDUCT.md).

## Future integration

Before enabling actual provider requests, streaming, concurrent execution, or editor changes, extend the threat review and tests for credential handling, task isolation, cancellation, untrusted model output, and explicit user approval. The current design references describe those future capabilities, not current execution behavior.
