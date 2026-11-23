# Licensing

[简体中文](../zh/licensing.md) · [Documentation](./README.md)

DualMind is licensed under the **MIT License**, with the copyright notice `Copyright (c) 2026 Pro-qing`. The authoritative terms are in the complete [LICENSE](../../LICENSE), which is included in the VSIX.

Package metadata uses `"license": "MIT"`. `"private": true` remains an npm publication safeguard; it does not change the license or prevent distributing a VSIX through GitHub Releases. Packaging now checks for the license normally, without a missing-license bypass.

Dependencies retain their own copyright and license terms. React, React DOM, and Scheduler are included in the Webview bundle; their complete notice is preserved in [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md), alongside the license comments in the generated JavaScript. Development tooling is excluded from the VSIX.

Contributions follow the repository's MIT license. No separate CLA or copyright transfer is required. See [Contributing](../../CONTRIBUTING.md) and [Packaging and releases](./releasing.md).

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).
