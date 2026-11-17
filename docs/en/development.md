# Development

[简体中文](../zh/development.md) · [Documentation](./README.md)

## Environment

Use **Ubuntu 20.04+ on x86_64/amd64**, VS Code 1.100.0+, and nvm-managed Node.js 24. Other platforms and ARM64 are not yet validated. The [environment guide](./environment.md) is the reference for system requirements, nvm setup, Electron libraries, Xvfb, and xauth. The extension bundle targets Node.js 20 for the minimum supported editor's extension host.

If nvm is installed but not loaded, run:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
```

If nvm is absent, follow the [official nvm installation instructions](https://github.com/nvm-sh/nvm#installing-and-updating), then open a new shell. No global Yeoman installation is needed for daily development.

```bash
nvm install
nvm use
node --version        # v24.x
npm --version
command -v node      # should point into your nvm installation
npm run check:env
npm ci
```

`.npmrc` enables strict engine checks. The environment check also runs before installation, checks, builds, and watch commands. Do not bypass `EBADENGINE` with `--force` or replace the system Node.js binary. Load nvm and select the repository version instead. nvm selection is per shell; run `nvm use` in each new terminal.

## Build and debug

```bash
npm run check
npm run build
code .
```

Select **Run DualMind** and press F5. The prelaunch build task loads nvm on Linux/macOS before running npm; it does not change nvm's default alias. On Windows, select Node.js 24 in your environment before launching VS Code. Run **DualMind: Show Status** inside the Extension Development Host to see the ready notification.

For iteration, run `npm run watch` and `npm run watch:types` in separate terminals. Reload the development host after rebuilding. Breakpoints use `dist/extension.js.map`; maps are omitted from the installable VSIX.

## Development commands

| Command               | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `npm run check:env`   | Report the environment and verify the Ubuntu/Node baseline                 |
| `npm run check:node`  | Check Node.js 24 only (compatibility command)                              |
| `npm run test:env`    | Test version rejection and unvalidated-platform warnings                   |
| `npm run check`       | Environment checks/tests, types, lint, formatting, and documentation links |
| `npm run build`       | Type-check and bundle the extension into `dist/`                           |
| `npm run watch`       | Rebuild the extension when source files change                             |
| `npm run watch:types` | Watch TypeScript diagnostics in a second terminal                          |
| `npm run format`      | Format supported source and documentation files                            |
| `npm test`            | Run the smoke test inside a downloaded stable VS Code                      |
| `npm run package`     | Build a local `release/dual-mind-0.0.1.vsix`                               |

## Validation

```bash
npm run check
npm test
VSCODE_TEST_VERSION=1.100.0 npm test
npm run package
```

`npm test` builds and executes a smoke test inside a separate VS Code installation, checking discovery and command-triggered activation. Downloads are cached in `.vscode-test/`; the first run requires internet access. The editor download allows up to 120 seconds without receiving data before timing out. A graphical display is needed. On headless Ubuntu, install the Electron libraries, `xvfb`, and `xauth` described in the [environment guide](./environment.md), then use `xvfb-run -a npm test` and `VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test`.

CI checks formatting, types, lint, relative documentation links, SVG constraints, editor activation, and local packaging. It covers VS Code 1.100.0 and stable in Ubuntu 20.04 containers, plus stable on native Ubuntu 24.04; see the [validation matrix](./environment.md). Use `npm run format` after editing supported text files. The SVG is intentionally excluded from Prettier so its hand-authored geometry stays readable.

## Troubleshooting

| Symptom                                  | Action                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `EBADENGINE` or Node 10 is shown         | Load nvm, run `nvm install` and `nvm use`, then retry                                       |
| F5 says nvm or Node 24 is missing        | Install Node with nvm in a terminal first; ensure `NVM_DIR` points to your nvm installation |
| Electron cannot launch or open a display | Install the [test dependencies](./environment.md), then use a desktop session or `xvfb-run` |
| Download fails                           | Verify access to npm and VS Code download services, then rerun                              |
| No chat panel appears                    | Expected at this milestone: only the status command is implemented                          |

Build output, downloaded editors, dependencies, and VSIX files are ignored by Git. [Usage guide](./usage.md) covers local installation and current behavior; [packaging guide](./releasing.md) covers VSIX creation and release preparation.
