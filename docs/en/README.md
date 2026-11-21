# Documentation

[简体中文](../zh/README.md) · [Project home](../../README.md)

**Source version: 0.0.4 · Local version record · Unpublished.** Recorded on 2026-11-21; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.4 version notes](./release-notes-0.0.4.md).

| Guide                                                   | Contents                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Environment](./environment.md)                         | Ubuntu 20.04+ amd64 baseline, nvm, system dependencies, and validation                  |
| [Preview 2 release notes](./release-notes-preview-2.md) | Published GitHub / Marketplace versions, identity switching, and verification           |
| [Usage](./usage.md)                                     | Marketplace / VSIX installation, local workbench, settings, and limitations             |
| [Development](./development.md)                         | nvm, build commands, debugging, and tests                                               |
| [Architecture](./architecture.md)                       | Implemented workbench, storage boundaries, branding assets, and module responsibilities |
| [Host/UI protocol](./protocol.md)                       | Settings/model queries, execution messages, role handoffs and Git bindings              |
| [UI design](./design.md)                                | 17 approved SVG/PNG scenes covering task pages, execution and chat                      |
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

- [0.0.4](./release-notes-0.0.4.md): current source and local VSIX, unpublished.
- [0.0.3](./release-notes-0.0.3.md): previous local source version, unpublished.
- [0.0.2](./release-notes-0.0.2.md): model discovery, settings and Git preparation foundations.
