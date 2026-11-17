# Local packaging and release preparation

[简体中文](../zh/releasing.md) · [Documentation](./README.md)

## Local VSIX

Use the shared [environment baseline](./environment.md): Ubuntu 20.04+ on x86_64/amd64, VS Code 1.100.0+, and nvm-managed Node.js 24 for building and packaging. Install the documented Electron libraries, Xvfb, and xauth for headless tests; replace `npm test` below with `xvfb-run -a npm test` in that environment.

```bash
nvm use
npm ci
npm run check
npm test
npm run package
code --install-extension release/dual-mind-0.0.1.vsix
```

Reload VS Code and run **DualMind: Show Status**. The artifact is ignored by Git. Packaging rebuilds the extension through `vscode:prepublish` and excludes development files, dependencies, test editors, source maps, and existing VSIX files. The documentation and SVG remain available in the package.

The packaging script uses `skipLicense: true` only because the license remains undecided. It creates a local artifact and never publishes it. The `private` npm flag prevents npm publication; it is not a Marketplace publication safeguard.

## Before public distribution

- Select the license, add its full text, update bilingual documentation and metadata, and remove `skipLicense` from local packaging.
- Replace `dual-mind-dev-placeholder` with a verified Marketplace publisher; update the smoke test's expected extension identifier at the same time.
- Set a final icon and review package contents and dependency license obligations.
- Configure private security/contact channels; replace pending entries in repository policies.
- Check README feature claims, release version, bilingual changelogs, and the packaged extension on supported editors.
- Obtain UI approval before implementing the proposed interface; describe the actual release status accurately.

No publish workflow, Marketplace token, GitHub release, or repository push is configured by this scaffold. CI produces only temporary local validation artifacts. Publishing is a separate owner-authorized action.
