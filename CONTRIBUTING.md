# Contributing

[简体中文](./CONTRIBUTING.zh.md) · [Project home](./README.md)

DualMind is at the scaffold stage. Start with the [development guide](./docs/en/development.md), [architecture](./docs/en/architecture.md), and [roadmap](./docs/en/roadmap.md).

## Making a change

1. Discuss a feature or significant change in an issue before broad implementation. Use the bilingual issue templates.
2. Use nvm and `.nvmrc`, install with `npm ci`, and keep changes focused on the agreed task.
3. Update English and Chinese documentation together. Label future behavior clearly.
4. Run `npm run check`, relevant extension-host tests, and `npm run package` when changing runtime/build behavior. For documentation-only changes, checks are sufficient.
5. Describe the problem, resulting behavior, and validation in a pull request. Include SVG revisions when proposing UI changes.

The UI is subject to [explicit design approval](./docs/en/design.md); do not implement the React interface based only on acceptance of the repository scaffold. Reserved directories should gain code only when a concrete feature needs it.

Follow the [code of conduct](./CODE_OF_CONDUCT.md). Use the [security policy](./SECURITY.md) for sensitive reports. Do not place credentials in issues, commits, examples, or screenshots.

## License and contacts

The project license is pending; see [licensing status](./docs/en/licensing.md) before contributing substantial code. No CLA or transfer of ownership is currently requested. General coordination uses repository issues and PRs. A private maintainer contact is **TODO: owner to configure**.
