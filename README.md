**English** | [简体中文](./README.zh.md)

# 🧠 DualMind

**Two AI minds are better than one.**

DualMind is an AI pair-programming extension project for VS Code. It brings task preparation, implementation, and independent review into one workspace, with a visible path from a request to a reviewed change.

## Project status

**Source 0.0.4 · Local version record · Unpublished**

The React workbench supports local tasks, connection settings, Reviewer presets, and English / Simplified Chinese. Source 0.0.4 provides independent role histories, Worker execution, read-only review and an activity-bar entry. Tasks may use dedicated worktrees or directly edit a selected local branch; applying dedicated-worktree results back to the original workspace remains planned. The optional conversation preview is explicitly read-only example content.

Historical 0.0.1 publication: available on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Pro-qing.dual-mind) as **Pro-qing.dual-mind**, version **0.0.1**, published 2026-11-18 with the Preview label. [GitHub Preview 2](https://github.com/Pro-qing/dual-mind/releases/tag/v0.0.1-preview.2) was also published on 2026-11-18. [Release notes](./docs/en/release-notes-preview-2.md).

The [0.0.4 version notes](./docs/en/release-notes-0.0.4.md) record source capabilities and verification. The [changelog](./CHANGELOG.md) distinguishes local versions from historical public artifacts.

## Two complementary roles

- **Worker:** Keeps a general implementation role, preparing dependencies, implementing and verifying the current Reviewer plan, then submitting artifacts for acceptance.
- **Reviewer:** Decomposes requirements, issues an executable plan, accepts Worker artifacts or supplies the next plan. Uses the task’s chosen Bug, Feature, Review, Refactor, or custom review focus. Each task retains its role instructions as a snapshot.

The execution flow follows **Request → Reviewer plan → Worker implementation → Reviewer acceptance → Approval or the next plan**. Developers guide the process and decide whether to apply a reviewed result.

## Available locally

- **Task workbench:** Manage workspace tasks on home; creation opens a separate detail page with manual start, role-labelled chat and an independent evidence panel.
- **Connection settings:** Save OpenAI-compatible endpoints and independent agent model defaults, with API keys stored by VS Code.
- **Model discovery:** Save a connection with an optional model, set its key in the native password prompt, explicitly query models, then search/select or manually enter IDs for defaults and tasks. Queries verify list access only.
- **Task execution:** Stream Worker/Reviewer output, plan with Reviewer, let Worker implement and verify autonomously in a dedicated worktree or selected local branch, and iterate through acceptance and revised plans, pause/continue/stop and inspect results. Use the DualMind activity-bar icon to open the workbench.
- **Follow-up:** Ask about results or continue changes directly. Reviewer answers read-only or issues a new plan, processes queued messages at handoffs and retains bound directories and uncommitted artifacts.
- **Reviewer presets:** Edit bilingual built-in instructions or manage custom roles in their original language.
- **Language selection:** Follow VS Code or choose English / Simplified Chinese without rewriting saved task content.
- **Example preview:** Explore the intended conversations and parallel-task appearance without creating records or sending requests.

Commands run directly in the task directory without user systemd/cgroup v2 or extension-imposed memory/swap quotas. Timeouts, output limits, stopping and real-evidence acceptance remain in place.

## Planned capabilities

Independent parallel sessions, automatic editor context and explicit application of reviewed dedicated-worktree results to the original workspace remain under development.

## Interface designs

![Approved DualMind parallel-task design reference](./docs/design/dual-mind-workbench.png)

The 17 approved SVG/PNG pairs remain design references: scenes 1–7 cover the original workbench and model selection, 8–11 task pages, 12–13 planning and acceptance, and 14–17 [task chat and follow-up](./docs/en/task-chat-proposal.md). Current source implements single-task execution and chat. The image above retains the original workbench design; illustrated parallel execution remains planned. The published 0.0.1 artifact retains its original behavior. [Original workbench SVG](./docs/design/dual-mind-workbench.svg) · [Full design gallery](./docs/en/design.md).

## Documentation and contribution

- [Usage guide](./docs/en/usage.md) — Marketplace / VSIX installation, workbench, language settings, and limitations.
- [Development guide](./docs/en/development.md) — Environment, builds, debugging, and tests.
- [Architecture](./docs/en/architecture.md) — State ownership and module responsibilities.
- [Roadmap](./docs/en/roadmap.md) — Delivered and planned milestones.
- [Contributing](./CONTRIBUTING.md) — Participation and repository conventions.
- [All documentation](./docs/en/README.md) — Complete guide and policy index.

## License

[MIT License](./LICENSE). [Licensing and bundled notices](./docs/en/licensing.md).
