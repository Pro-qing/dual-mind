# Development log

[简体中文](../zh/development-log.md) · [Development guide](./development.md)

## 2026-11-21 — Bilingual Git commit messages

- **Change:** new commit subjects must include English and Simplified Chinese. Any body must provide corresponding bilingual reasons, behavior and actual validation; existing commit history is retained.
- **Documentation review:** searched commit/提交/PR and reviewed English/Chinese contribution guides, development guides, development logs, changelogs and the PR template. Added consistent message examples and checks. Product behavior, UI and protocol are unchanged; other current descriptions retain the earlier review results.
- **Validation:** `npm run docs:check`, `npm run format:check` and `git diff --check` passed; documentation validation covered 63 Markdown files, 568 local links, 26 language pairs and 17 SVG/PNG pairs. Checks used the current Node.js 26.13.1 for documentation only; engineering checks on the Node.js 24 baseline and runtime tests were not rerun.
- **Commit scope:** at the user's request, record the preceding documentation synchronization and this convention together in a new bilingual Git commit; pushing and public distribution are outside this action.

## 2026-11-21 — Development rules and documentation synchronization

- **Change:** existing contribution/development guides and the PR template now require code/documentation synchronization. Every code change must append English and Chinese log entries, including review scope and reasons when no documentation text needs updating. This change edits documentation and the template only.
- **Search and review:** used `rg` across repository Markdown for systemd/cgroup, 七组/十一组/seven/eleven, 待审核/awaiting review, 双栏/two-column, 900/1100, 开始/重新执行/继续修改 and start/restart/continuation. Reviewed root guides/policies, bilingual usage/architecture/protocol/design/roadmap/release/development guides, module READMEs, proposals, validation records and the PR template against command-runner, chat-layout and execution/Git-binding code.
- **Documentation updates:** synchronized direct-command boundaries, the 17 designs and their approval status, design/validation navigation, current chat/evidence drawer layout, direct start/restart versus continuation with uncommitted artifacts, English active-message guidance and current task terminology.
- **Retained content and reasons:** historical releases, old-runner failures, unverified cases and original SVG/PNG assets remain, with current-description links where needed. Reviewed role isolation, protocol/storage compatibility and environment baselines still match implementation and remain intact. Outer development-validation budgets are not product prerequisites.
- **Validation:** `npm run docs:check`, `npm run format:check` and `git diff --check` passed for this change; documentation checks cover 63 Markdown files, 26 language pairs and 17 SVG/PNG pairs. Repeated searches and manual review confirmed that remaining old terms occur in historical records, previous design descriptions or search logs. Checks used the current Node.js 26.13.1 for documentation only; they do not establish passing engineering checks on the Node.js 24 development baseline. Runtime, extension-host and real UI tests were not rerun; no VSIX was built, installed or published. Earlier passes belong only to their original environment and date.

## 2026-11-20 — Task chat and continuing conversation

- **Approval:** the user approved scenes 14–17: wide chat, narrow drawer, queued messages and post-execution follow-up. The previous 13 SVG/PNG designs are retained.
- **Implementation:** durable messages, idempotent sending, cross-run conversation and independent evidence pages. Reviewer answers are separate from actual executions; modifications issue a plan and retain the bound directory. Handoffs process active messages while preserving pause, stop, reload and round limits.
- **Interface:** compact model bars, left/right chat, a persistent composer and an independent evidence panel. Removed duplicated plans/artifacts and role descriptions; added IME, scrolling, drawer focus and bilingual controls.
- **Regression findings addressed:** old tests assumed removed cards; output chunks disrupted pagination, so evidence groups command/request chunks; replies must preserve prior acceptance; fingerprints are checked again after answering; reload recovers processing messages as pending; fixed long-message truncation, serialized completion against message admission, and fitted the composer to actual viewport height.
- **Documentation:** updated both languages across home pages, usage, architecture, protocol, design, development and this log. Design approval, implementation and actual verification are recorded separately.
- **Validation status:** full checks passed (137 local and 22 environment tests), both extension-host cases passed, and real UI passed with 49 screenshots; `npm run package` passed, generating `release/dual-mind-0.0.3.vsix` (98 files, about 2.7 MB). Final results belong in the [validation record](./task-chat-validation.md). These are local unpublished changes, not a claim of installation, commit or publication.
