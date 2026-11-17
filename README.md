**English** | [简体中文](./README.zh.md)

# 🧠 DualMind

**Two AI minds are better than one.**

DualMind is an AI pair-programming extension project for VS Code. It aims to bring implementation and independent review into the same workspace, helping developers refine changes through a visible feedback cycle.

## Project status

**Early development · UI design pending review**

The capabilities below are planned and have not been implemented yet. The interface concept is awaiting approval before implementation begins.

## Two complementary roles

- **Worker:** Implements the task and revises the code in response to feedback.
- **Reviewer:** Checks the changes, identifies edge cases, and provides feedback before approval.

The intended collaboration follows **Generate → Review → Revise → Approve**. Developers can guide the process and decide whether to apply the reviewed result.

## Planned capabilities

- **Two conversation columns:** Follow Worker output and Reviewer feedback side by side.
- **Independent model selection:** Choose a model for each role.
- **Controlled iteration:** Set round limits, pause or stop a session, and add human feedback.
- **Editor integration:** Bring selected code into the task and preview changes before applying them.

## Interface concept

![DualMind dark-theme interface concept; design pending review](./docs/design/dual-mind-workbench.png)

A static proposal with illustrative content. [Open the SVG](./docs/design/dual-mind-workbench.svg) · [Design notes](./docs/en/design.md).

## Documentation and contribution

- [Usage guide](./docs/en/usage.md) — Local installation, current behavior, and limitations.
- [Development guide](./docs/en/development.md) — Environment setup, building, debugging, and testing.
- [Architecture](./docs/en/architecture.md) — Repository layout and module responsibilities.
- [Roadmap](./docs/en/roadmap.md) — Milestones and planned features.
- [Contributing](./CONTRIBUTING.md) — How to participate in the project.
- [All documentation](./docs/en/README.md) — The full guide and policy index.

## License

License undecided. [Details](./docs/en/licensing.md).
