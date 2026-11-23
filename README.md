**English** | [简体中文](./README.zh.md)

# 🧠 DualMind

**Two AI minds are better than one.**

DualMind is an AI pair-programming extension project for VS Code. It brings task preparation, implementation, and independent review into one workspace, with a visible path from a request to a reviewed change.

## Project status

**Source 0.0.5 · Locally committed · Unpublished**

Local `master` contains compact-home commit `6cdcd94`, lifecycle/tool-recovery commit `2ee08bc`, and bundled-command commit `9c8dcf0`. They follow baseline tag `v0.0.5` at `e4ae328` and have not been pushed. Existing candidates remain unchanged; see the [archive and validation record](./docs/en/development-log.md).

The React workbench supports local tasks, connection settings, Reviewer presets, and English / Simplified Chinese. Source 0.0.5 provides independent role histories, Worker execution, independent Reviewer inspection and verification and an activity-bar entry. Tasks may use dedicated worktrees or directly edit a selected local branch; host artifact integration is implemented, while its new UI controls are integrated. The optional conversation preview is explicitly read-only example content.

Historical 0.0.1 publication: available on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) as **Pro-qing.dual-mind**, version **0.0.1**, published 2026-11-18 with the Preview label. [GitHub Preview 2](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) was also published on 2026-11-18. [Release notes](./docs/en/release-notes-preview-2.md).

The [0.0.5 version notes](./docs/en/release-notes-0.0.5.md) record source capabilities and verification. The [changelog](./CHANGELOG.md) distinguishes local versions from historical public artifacts.

## Two complementary roles

- **Worker:** Keeps a general implementation role, preparing dependencies, implementing and verifying the current Reviewer plan, then submitting artifacts for acceptance.
- **Reviewer:** Decomposes requirements, issues an executable plan, accepts Worker artifacts or supplies the next plan. Uses the task’s chosen Bug, Feature, Review, Refactor, or custom review focus. Each task retains its role instructions as a snapshot.

The execution flow follows **Request → Reviewer plan → Worker implementation → Reviewer acceptance → Approval or the next plan**. Developers guide the process and decide whether to apply a reviewed result.

## Available locally

- **Task workbench:** Manage workspace tasks on home; creation opens a separate detail page with manual start, role-labelled chat and an independent evidence panel.
- **Connection settings:** Save OpenAI-compatible endpoints and independent agent model defaults, with API keys stored by VS Code.
- **Model discovery:** Save a connection with an optional model, set its key in the native password prompt, explicitly query models, then search/select or manually enter IDs for defaults and tasks. Queries verify list access only.
- **Task execution:** Stream Worker/Reviewer output, plan with Reviewer, let Worker implement and verify autonomously in a dedicated worktree or selected local branch, and iterate through acceptance and revised plans, pause/continue/stop and inspect results. Use the DualMind activity-bar icon to open the workbench.
- **Follow-up:** Ask about results or continue changes directly. Reviewer answers after inspection or issues a new plan, processes queued messages at handoffs and retains bound directories and uncommitted artifacts.
- **Reviewer presets:** Edit bilingual built-in instructions or manage custom roles in their original language.
- **Language selection:** Follow VS Code or choose English / Simplified Chinese without rewriting saved task content.
- **Example preview:** Explore the intended conversations and parallel-task appearance without creating records or sending requests.

Commands run directly in the task directory without user systemd/cgroup v2 or extension-imposed memory/swap quotas. Timeouts, output limits, stopping and real-evidence acceptance remain in place.

Tool errors return to the current role, skip the rest of the batch, and pause after three failures without progress. Users can send feedback and explicitly continue; historical failures remain separate from current acceptance blockers. See [Tool errors and acceptance](./docs/en/tool-errors.md).

## Planned capabilities

Independent parallel sessions and automatic editor context remain under development. Host artifact integration is implemented; its controls are integrated.

**New host capabilities:** managed bases, automatic context summaries, explicit commit/merge, and preserved cleanup are implemented in locally committed source. New controls implement the approved [scenes 30–34](./docs/en/task-lifecycle-proposal.md) designs; see [behavior and limits](./docs/en/task-lifecycle.md).

## Interface designs

**Approved designs:** [Compact task-list scenes 28–29](./docs/en/task-home-compact-proposal.md) document the archived compact-home changes. The archive contains 37 approved pairs.

![Approved DualMind parallel-task design reference](./docs/design/v0.0.1/dual-mind-workbench.png)

The original 27 approved SVG/PNG pairs remain design references: scenes 1–7 cover the original workbench and model selection, 8–11 task pages, 12–13 planning and acceptance, 14–17 [task chat and follow-up](./docs/en/task-chat-proposal.md), 18–20 activity and compact chat, 21–23 failure recovery, and 24–27 the native sidebar. Current source implements single-task execution and chat. The image above retains the original workbench design; illustrated parallel execution remains planned. The published 0.0.1 artifact retains its original behavior. [Original workbench SVG](./docs/design/v0.0.1/dual-mind-workbench.svg) · [Full design gallery](./docs/en/design.md).

[Native sidebar workbench](./docs/en/sidebar-workbench-proposal.md) scenes 24–27 were **approved on November 22, 2026** and implemented on November 23. The complete workbench uses the Primary or Secondary Side Bar, compact navigation, collapsible task details and manual **Keep Terminal in Editor Area**. Old editor tabs are retained only for migration. All 27 design approvals and historical artwork are preserved.

## Documentation and contribution

- [Usage guide](./docs/en/usage.md) — Marketplace / VSIX installation, workbench, language settings, and limitations.
- [Development guide](./docs/en/development.md) — Environment, builds, debugging, and tests.
- [Architecture](./docs/en/architecture.md) — State ownership and module responsibilities.
- [Roadmap](./docs/en/roadmap.md) — Delivered and planned milestones.
- [Contributing](./CONTRIBUTING.md) — Participation and repository conventions.
- [All documentation](./docs/en/README.md) — Complete guide and policy index.

## License

[MIT License](./LICENSE). [Licensing and bundled notices](./docs/en/licensing.md).

See [shell execution and independent verification](./docs/en/shell-execution.md) for automatic environment inheritance, supported shells, evidence rules and platform validation status.

The approved chat controls show current activity and public process, use icon-only message sizing, and preserve per-task minimized evidence preferences. See [the chat revision](./docs/en/chat-progress-proposal.md).

Failure recovery includes per-operation records, continuation of the saved role and bounded retries. [Approved recovery controls](./docs/en/recovery-proposal.md) now provide Continue execution, role/phase notices and retry status. See [behavior and limits](./docs/en/execution-recovery.md).

[Bundled command-line tools](./docs/en/bundled-tools.md): offline Linux x64 rg/fd/jq with system commands taking priority.
