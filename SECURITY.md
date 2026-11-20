# Security

[简体中文](./SECURITY.zh.md) · [Project home](./README.md)

## Current source scope

DualMind 0.0.3 is a local, unpublished source version. Public 0.0.1 artifacts retain historical behavior. API keys enter through the native VS Code password prompt and remain in SecretStorage; the Webview receives only saved status. The host validates messages; the Webview uses nonce-based CSP and disallows direct network access.

The host sends task requirements, the corresponding role instructions and needed file/tool content to the configured model endpoint. Roles retain separate histories and exchange artifacts/evidence only. Public logs and execution records exclude API keys, but task text and code can contain sensitive information; evaluate the actual endpoint and task scope.

Worker can modify the selected task directory; Reviewer has only controlled read interfaces. Direct modes modify the opened project, while dedicated mode uses a worktree. Preset programs run with the current user permissions; systemd bounds memory, swap and time. File interfaces and resource limits are not OS sandboxes and cannot constrain arbitrary external processes.

Branch/HEAD and check evidence are validated. Stop cancels requests and terminates command process groups without reverting saved files. Approval does not automatically commit, merge or apply dedicated-directory results.

No long-term preview support or fixed response time is promised. Local source tags do not indicate public distribution.

## Private reports

GitHub private vulnerability reporting is **enabled and verified as of November 18, 2026**. Use [Report a vulnerability](https://github.com/Pro-qing/dual-mind/security/advisories/new), also available from the repository's Security page. This channel is for security reports; ordinary bugs and feature requests belong in issues.

Include the affected tag/commit, VS Code and operating-system versions, reproduction steps, impact, and relevant logs. Remove API keys, tokens, personal data, and confidential task content. Do not post exploitable details in public issues while a report is being assessed.

If the private reporting entry becomes unavailable, request a private contact without publishing vulnerability details. A separate private maintainer email is **not configured**; no address or response SLA is implied. Conduct incidents are addressed separately in the [code of conduct](./CODE_OF_CONDUCT.md).
