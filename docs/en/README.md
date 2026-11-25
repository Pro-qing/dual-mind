# Documentation

[简体中文](../zh/README.md) · [Project home](../../README.md)

[Tool-error handling and frontend integration](./tool-errors.md) now implements explicit outcomes, skipped batch tails, repeated-error pauses, and lifecycle controls.

**Current capabilities:** [worktrees, context summaries and artifact operations](./task-lifecycle.md), together with [tool-error handling](./tool-errors.md), were introduced in 0.0.6 with host and frontend support. [Scenes 30–34](./task-lifecycle-proposal.md) and [scenes 35–37](./tool-errors-proposal.md) retain their original approval and implementation records.

[Compact task-list designs](./task-home-compact-proposal.md): scenes 28–29 are approved and implemented and document the home-layout and interaction changes now archived on local `master`.

**Source version: 0.0.8 · Locally prepared; awaiting manual publication by the maintainer.** Recorded November 25, 2026. See the [0.0.8 version notes](./release-notes-0.0.8.md) for features, validation and artifacts. Historical versions, design archives and validation records retain their meaning.

| Guide                                                   | Contents                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Environment](./environment.md)                         | Ubuntu 20.04+ amd64 baseline, nvm, system dependencies, and validation                  |
| [Preview 2 release notes](./release-notes-preview-2.md) | Published GitHub / Marketplace versions, identity switching, and verification           |
| [Usage](./usage.md)                                     | Marketplace / VSIX installation, local workbench, settings, and limitations             |
| [Development](./development.md)                         | nvm, build commands, debugging, and tests                                               |
| [Architecture](./architecture.md)                       | Implemented workbench, storage boundaries, branding assets, and module responsibilities |
| [Host/UI protocol](./protocol.md)                       | Settings/model queries, execution messages, role handoffs and Git bindings              |
| [UI design](./design.md)                                | 40 SVG/PNG pairs: 40 approved                                                           |
| [Roadmap](./roadmap.md)                                 | Versioned progress, implemented execution and remaining capabilities                    |
| [Packaging and releases](./releasing.md)                | Publication history and the workflow for future GitHub / Marketplace versions           |
| [Licensing](./licensing.md)                             | MIT license and bundled third-party notices                                             |
| [Toolchain provenance](./toolchain.md)                  | Generator and initial environment versions                                              |

Repository policies: [contribution guide](../../CONTRIBUTING.md), [code of conduct](../../CODE_OF_CONDUCT.md), [security](../../SECURITY.md), and [changelog](../../CHANGELOG.md).

Release history: [Preview 1](./release-notes.md).

## Design revisions and validation

The following revisions were approved and implemented on 2026-11-20. Static designs and actual validation are recorded separately; earlier scenes remain historical references.

- [Task home, detail and errors](./task-pages-proposal.md): scenes 8–11, separate pages, manual start and bilingual errors.
- [Dual-agent planning and acceptance](./execution-cycle-proposal.md): scenes 12–13; see [execution-cycle validation](./execution-cycle-validation.md) for actual coverage.
- [Task chat and follow-up](./task-chat-proposal.md): scenes 14–17; see [task chat validation](./task-chat-validation.md) for actual coverage.

The [development log](./development-log.md) records code/documentation review, design approval, implementation and actual validation.

## Local source versions

- [0.0.8](./release-notes-0.0.8.md): current version awaiting manual publication, with providers, theme support, compact task headers and request groups.
- [0.0.7](./release-notes-0.0.7.md): previous execution continuity, legacy-limit recovery and acceptance diagnostics.

- [0.0.6](./release-notes-0.0.6.md): earlier complete feature set, local Python support, product introduction and local delivery record.
- [0.0.5](./release-notes-0.0.5.md): earlier native sidebar workbench, versioned designs and local tag.
- [0.0.4](./release-notes-0.0.4.md): earlier local source and VSIX, unpublished.
- [0.0.3](./release-notes-0.0.3.md): previous local source version, unpublished.
- [0.0.2](./release-notes-0.0.2.md): model discovery, settings and Git preparation foundations.

- [Activity and compact-chat proposal](./chat-progress-proposal.md): approved and implemented: activity, public process, icon-only message sizing, minimization and task-based branches.

- [Failure recovery](./execution-recovery.md): host implementation, public context, process and evidence limits.
- [Recovery UI proposal](./recovery-proposal.md): scenes 21–23, approved and integrated on 2026-11-22.

- [Native sidebar workbench](./sidebar-workbench-proposal.md) scenes 24–27 were **approved on November 22, 2026** and implemented on November 23. The complete workbench uses the Primary or Secondary Side Bar, compact navigation, collapsible task details and manual **Keep Terminal in Editor Area**. Old editor tabs are retained only for migration. The original 27 design approvals and historical artwork are preserved.
- [Sidebar validation](./sidebar-workbench-validation.md): real VS Code, legacy-tab migration, widths and terminal layout.

- [Tool errors](./tool-errors.md): outcomes, repeated-error pauses, skipped batches and acceptance boundaries.
- [Tool-error UI](./tool-errors-proposal.md): scenes 35–37, implemented under this round’s confirmation.

- [Bundled command-line tools](./bundled-tools.md): offline CLI fallbacks, system priority and integrity checks.

- [Local Python](./local-python.md): discover existing Python 2.7/3 and project environments for scripts through the command tool.
