# Development log

[简体中文](../zh/development-log.md) · [Development guide](./development.md)

## 2026-11-20 — Task chat and continuing conversation

- **Approval:** the user approved scenes 14–17: wide chat, narrow drawer, queued messages and post-execution follow-up. The previous 13 SVG/PNG designs are retained.
- **Implementation:** durable messages, idempotent sending, cross-run conversation and independent evidence pages. Reviewer answers are separate from actual executions; modifications issue a plan and retain the bound directory. Handoffs process active messages while preserving pause, stop, reload and round limits.
- **Interface:** compact model bars, left/right chat, a persistent composer and an independent evidence panel. Removed duplicated plans/artifacts and role descriptions; added IME, scrolling, drawer focus and bilingual controls.
- **Regression findings addressed:** old tests assumed removed cards; output chunks disrupted pagination, so evidence groups command/request chunks; replies must preserve prior acceptance; fingerprints are checked again after answering; reload recovers processing messages as pending; fixed long-message truncation, serialized completion against message admission, and fitted the composer to actual viewport height.
- **Documentation:** updated both languages across home pages, usage, architecture, protocol, design, development and this log. Design approval, implementation and actual verification are recorded separately.
- **Validation status:** full checks passed (137 local and 22 environment tests), both extension-host cases passed, and real UI passed with 49 screenshots; `npm run package` passed, generating `release/dual-mind-0.0.3.vsix` (98 files, about 2.7 MB). Final results belong in the [validation record](./task-chat-validation.md). These are local unpublished changes, not a claim of installation, commit or publication.
