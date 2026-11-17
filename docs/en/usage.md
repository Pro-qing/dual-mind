# Usage

[简体中文](../zh/usage.md) · [Documentation](./README.md)

## Current availability

DualMind is an early development scaffold with no public Marketplace release. The current build provides a status command to confirm that the extension loads. The two-agent conversation interface and collaboration workflow are planned features.

The supported baseline for installing a local VSIX is **Ubuntu 20.04+, x86_64/amd64, and VS Code 1.100.0+**. Other platforms and ARM64 are not yet validated. An already built package runs in VS Code without a separate Node.js or npm installation; see the [environment requirements](./environment.md).

## Get a local package

The local build produces `release/dual-mind-0.0.1.vsix`. This generated file is ignored by Git and is not included when cloning the repository.

To create it, follow the [development guide](./development.md) for environment setup and the [packaging guide](./releasing.md) for the build and packaging steps.

## Install and verify

With the package built and the `code` command available, run this from the repository root:

```bash
code --install-extension release/dual-mind-0.0.1.vsix
```

1. Reload VS Code after installation.
2. Open the Command Palette and run **DualMind: Show Status**.
3. Confirm that the following notification appears:

> DualMind scaffold is ready. UI design is pending review.

This confirms that the extension was loaded and its command executed. If you are running from source, use the Extension Development Host described in the [debugging instructions](./development.md).

## Current limitations

- The status command only displays a notification; it does not open a conversation panel.
- There are no model calls, Worker/Reviewer sessions, automatic review loops, or workspace edits yet.
- The [SVG concept](./design.md) is a static design proposal awaiting approval. React UI implementation starts after that approval.

If the command is missing, check that the VSIX is installed in the VS Code instance you are using and that the editor meets the minimum version. See the [roadmap](./roadmap.md) for the next milestones.
