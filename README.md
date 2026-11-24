**English** | [简体中文](./README.zh.md)

# 🧠 DualMind

**Two AI minds are better than one.**

DualMind brings AI pair programming into VS Code. **Reviewer plans and reviews; Worker implements and verifies.** You guide the task, inspect the changes, and decide how to integrate the result.

Use it to work through a bug fix, build a feature, review code, or refactor a module. Keep requirements, implementation, feedback, and verification together in a task workspace, while the two roles keep their own context.

![DualMind task detail showing a requirement and separate Worker and Reviewer messages in VS Code](./resources/screenshots/dualmind-workbench.png)

_Current interface with built-in read-only example content. The example sends no model requests and changes no project files._

## How it works

**Your request → Reviewer plan → Worker implementation and verification → Reviewer review → Approval or another revision**

Reviewer first turns your request into a plan with acceptance criteria. Worker follows that plan, edits files, and runs the relevant checks. Reviewer then inspects the result and recorded evidence, accepting it or requesting another round of changes.

You can add requirements, ask questions, pause, stop, or continue. After a run, ask about the result or request a follow-up change in the same task. Review makes the process easier to inspect; you remain responsible for deciding whether the changes are ready.

## What you can do

- **Give the two roles distinct responsibilities.** Choose a Bug, Feature, Review, Refactor, or custom review focus. Worker handles implementation while Reviewer plans and evaluates the work against the task's criteria.
- **Use your own models.** Connect an OpenAI-compatible API and choose models independently for Worker and Reviewer. Use the same service or different connections, discover available model IDs, or enter them manually. API keys are stored through VS Code.
- **Keep task work separate.** Start from a local base branch in an isolated Git worktree, or work directly on the current or a selected branch. Inspect differences and open the task directory before deciding what to keep.
- **Follow the work and its evidence.** Read role-labelled conversations, command output, checks, and review results. Pause to provide feedback and continue recoverable runs. Each role manages its own context, with automatic summaries helping longer tasks continue.
- **Control the outcome.** Commit task changes and merge into a local target branch explicitly. Handle conflicts, preserve work before cleaning an isolated worktree, or restore saved artifacts into a new task. Review approval does not automatically publish your work.

## Get started

1. **Install DualMind.** Follow the [installation guide](./docs/en/usage.md) for Marketplace, VSIX, or source-build instructions. Features depend on the installed version; source and published versions may differ.
2. **Open your project.** Use a trusted Git workspace with an existing commit and branch, then select DualMind in the activity bar or run **DualMind: Open Workbench**.
3. **Configure your models.** In Settings, save an API connection, set its key, and choose the Worker and Reviewer models. You can also set defaults for new tasks.
4. **Create a task and start it.** Describe the goal and constraints, choose the review focus and Git strategy, then press **Start**. Creating a task alone does not send model requests.
5. **Review and integrate.** Follow the conversation, inspect changes and evidence, and provide feedback as needed. When satisfied, use the task's artifact controls to commit or merge the result.

Want to look around first? Select **View examples** to explore the workbench without configuring an API or changing project files.

## Requirements

The supported baseline is **Ubuntu 20.04+ x64, VS Code 1.100.0+, and Git 2.25+**. You need a compatible model API and credentials, plus the toolchains required by your project. Model requests send relevant task context to your configured service; a local workbench does not mean offline inference.

DualMind currently runs one task at a time. See the [environment guide](./docs/en/environment.md) for platform details and the [roadmap](./docs/en/roadmap.md) for planned capabilities.

## Learn more and contribute

[Usage guide](./docs/en/usage.md) · [Development](./docs/en/development.md) · [All documentation](./docs/en/README.md) · [Changelog](./CHANGELOG.md)

Bug reports, ideas, and contributions are welcome. Start with the [contribution guide](./CONTRIBUTING.md) for the workflow and project conventions.

Released under the [MIT License](./LICENSE). See [licensing and bundled notices](./docs/en/licensing.md) for third-party software.
