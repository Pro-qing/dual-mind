# Security

[简体中文](./SECURITY.zh.md) · [Project home](./README.md)

## Current source scope

DualMind 0.0.2 is a local, unpublished source version. Public 0.0.1 artifacts retain historical behavior. API keys enter through the native VS Code password prompt and remain in SecretStorage; the Webview receives only saved status. The host validates messages; the Webview uses nonce-based CSP and disallows direct network access.

Explicit model-list queries are host requests with authentication and contain no task requirements, role instructions or workspace content. This version has no inference, runtime conversation history or executor.

The lazy Git foundation can create dedicated task branches/worktrees and provide Worker write/Reviewer read interfaces. It is not connected to Start. Saving drafts does not prepare branches or modify project files. Path checks and role interfaces are not OS sandboxes or proof of runtime context isolation.

No long-term preview support or fixed response time is promised. Local source tags do not indicate public distribution.

## Private reports

GitHub private vulnerability reporting is **enabled and verified as of November 18, 2026**. Use [Report a vulnerability](https://github.com/Pro-qing/dual-mind/security/advisories/new), also available from the repository's Security page. This channel is for security reports; ordinary bugs and feature requests belong in issues.

Include the affected tag/commit, VS Code and operating-system versions, reproduction steps, impact, and relevant logs. Remove API keys, tokens, personal data, and confidential task content. Do not post exploitable details in public issues while a report is being assessed.

If the private reporting entry becomes unavailable, request a private contact without publishing vulnerability details. A separate private maintainer email is **not configured**; no address or response SLA is implied. Conduct incidents are addressed separately in the [code of conduct](./CODE_OF_CONDUCT.md).
