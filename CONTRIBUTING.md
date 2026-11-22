# Contributing

[简体中文](./CONTRIBUTING.zh.md) · [Project home](./README.md)

DualMind’s local React workbench is available as a GitHub preview. Start with the [development guide](./docs/en/development.md), [architecture](./docs/en/architecture.md), and [roadmap](./docs/en/roadmap.md).

## Making a change

1. Discuss a feature or significant change in an issue before broad implementation. Use the bilingual issue templates.
2. Use nvm and `.nvmrc`, install with `npm ci`, and keep changes focused on the agreed task.
3. Every code change must search and review relevant documentation across the repository and synchronize affected English and Chinese descriptions in the same change. Documentation review is a completion requirement. Follow the [documentation synchronization workflow](./docs/en/development.md#code-and-documentation-synchronization) to check descriptions, examples, limitations, status and cross-references. Label future behavior clearly.
4. Every code change must append English and Chinese development-log entries covering the change, documentation search/review scope, actual updates, validation results and unrun checks. Even when no documentation text needs updating, record the review and its reason; “no documentation impact” cannot replace the search or log entry.
5. Run `npm run check`, relevant extension-host tests, and `npm run package` when changing runtime/build behavior. For documentation-only changes, run `npm run docs:check`, `npm run format:check` and `git diff --check`, then manually compare the documentation with current behavior.
6. New Git commits must include both English and Simplified Chinese. Use `type(scope): English summary / 中文摘要` for the subject (scope is optional); any body must also provide corresponding explanations of the reason, behavior and actual validation in both languages. See [Git commit messages](./docs/en/development.md#git-commit-messages) for the format.
7. Describe the problem, resulting behavior, documentation review, links to both development-log entries and validation in a pull request. Include SVG revisions when proposing UI changes.

The 23 existing [interface designs](./docs/en/design.md) are approved and retained. Future interface changes should include an updated SVG proposal for explicit review before implementation. Reserved directories should gain code only when a concrete feature needs it.

Follow the [code of conduct](./CODE_OF_CONDUCT.md). Use the [security policy](./SECURITY.md) for sensitive reports. Do not place credentials in issues, commits, examples, or screenshots.

## License and contacts

The project uses the [MIT License](./LICENSE); see the [licensing notes](./docs/en/licensing.md). No CLA or transfer of ownership is currently requested. General coordination uses repository issues and PRs. Security reports use the verified GitHub private channel in [SECURITY](./SECURITY.md). A separate private maintainer contact remains **not configured**.

Recovery scenes 21–23 were [approved](./docs/en/recovery-proposal.md) on 2026-11-22 and are implemented in development source.
