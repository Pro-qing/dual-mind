# Development

[简体中文](../zh/development.md) · [Documentation](./README.md)

**Source version: 0.0.3 · Local version record · Unpublished.** Recorded on 2026-11-20; this does not indicate a Marketplace upload or a GitHub Release. The historical 0.0.1 Preview 1/2 records are unchanged. See the [0.0.3 version notes](./release-notes-0.0.3.md).

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

Select **Run DualMind** and press F5. The prelaunch build task loads nvm on Linux/macOS before running npm; it does not change nvm's default alias. On Windows, select Node.js 24 in your environment before launching VS Code. Run **DualMind: Open Workbench** inside the Extension Development Host. **Show Status** remains a readiness check. The workbench bundles React and CSS locally; no development web server is required.

For iteration, run `npm run watch` and `npm run watch:types` in separate terminals. The first watches both bundles, while the second checks host, Webview, and local-test TypeScript projects. Reload the development host after rebuilding. Breakpoints use `dist/extension.js.map`; maps are omitted from the installable VSIX.

## Development commands

| Command               | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run check:env`   | Report the environment and verify the Ubuntu/Node baseline                      |
| `npm run check:node`  | Check Node.js 24 only (compatibility command)                                   |
| `npm run test:env`    | Test version rejection and unvalidated-platform warnings                        |
| `npm run test:local`  | Run store and React interaction tests without launching VS Code                 |
| `npm run test:ui`     | Exercise a real VS Code Webview in an isolated profile; capture screenshots     |
| `npm run check`       | Environment and local store/React tests, types, lint, formatting, and doc links |
| `npm run build`       | Type-check and bundle the extension host and Webview into `dist/`               |
| `npm run watch`       | Rebuild the extension host and Webview when source files change                 |
| `npm run watch:types` | Watch host, Webview, and local-test TypeScript diagnostics                      |
| `npm run format`      | Format supported source and documentation files                                 |
| `npm test`            | Run the smoke test inside a downloaded stable VS Code                           |
| `npm run package`     | Build a local `release/dual-mind-<version>.vsix`                                |

## Validation

```bash
npm run check
npm test
VSCODE_TEST_VERSION=1.100.0 npm test
npm run package
```

`npm test` builds both bundles and tests command-triggered activation, actual React render readiness, singleton tabs, and reopening in a separate VS Code installation. `npm run check` also runs the local store and React interaction tests. `npm run test:ui` uses Playwright with the downloaded editor’s Electron executable (no separate browser download), an isolated temporary user profile/workspace, and real settings/task interactions. It verifies reload persistence and workspace isolation, then records English/Chinese wide/narrow screenshots under `.vscode-test/ui-validation/<version>/`. It requires a desktop or `xvfb-run -a npm run test:ui`. Downloads are cached in `.vscode-test/`; the first run requires internet access. The `npm test` configuration allows up to 120 seconds without receiving download data; `test:ui` uses the download helper's default timeout. A graphical display is needed. On headless Ubuntu, install the Electron libraries, `xvfb`, and `xauth` described in the [environment guide](./environment.md), then use `xvfb-run -a npm test` and `VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test`.

CI runs environment and local store/React tests, formatting, types, lint, documentation links, design-asset checks, and extension-host tests in each matrix job. It covers VS Code 1.100.0 and stable in Ubuntu 20.04 containers, plus stable on native Ubuntu 24.04. The Ubuntu 20.04 stable job additionally validates the real Webview and packaging; see the [validation matrix](./environment.md). Use `npm run format` after editing supported text files. The SVG is intentionally excluded from Prettier so its hand-authored geometry stays readable.

## Troubleshooting

| Symptom                                  | Action                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `EBADENGINE` or Node 10 is shown         | Load nvm, run `nvm install` and `nvm use`, then retry                                                    |
| F5 says nvm or Node 24 is missing        | Install Node with nvm in a terminal first; ensure `NVM_DIR` points to your nvm installation              |
| Electron cannot launch or open a display | Install the [test dependencies](./environment.md), then use a desktop session or `xvfb-run`              |
| Download fails                           | Verify access to npm and VS Code download services, then rerun                                           |
| No workbench appears                     | Run **DualMind: Open Workbench**; if updating the same VSIX version, force-install and reload the window |

Build output, downloaded editors, dependencies, and VSIX files are ignored by Git. [Usage guide](./usage.md) covers local installation and current behavior; [packaging guide](./releasing.md) covers VSIX creation and release preparation.

## Resource-bounded model verification

Local tests run serially with a 512 MiB JavaScript heap and the existing 30-second per-test timeout. Run each verification command separately with a 1 GiB memory / 60-second overall limit for local checks, or 2 GiB / 180 seconds for Electron, and no swap. On Linux, a user systemd service can enforce these using `MemoryMax`, `MemorySwapMax=0`, and `RuntimeMaxSec`.

Set `VSCODE_TEST_EXECUTABLE=/usr/share/code/code` to reuse an installed VS Code for `npm test` and `npm run test:ui`; omit it to retain automatic download. Run Electron under `xvfb-run -a` when headless. All tests use isolated user profiles. The real Webview test starts a local mock server and uses a fake key in the native password prompt, then verifies query, selection, persistence, both languages and narrow layouts. It never reads personal credentials; model requests use local mock endpoints and no paid services.

## Execution verification

Execution tests use temporary repositories, local SSE servers and test credentials. `DUALMIND_TEST_SYSTEMD=1` additionally exercises the real command runner (memory/swap probe, exact arguments, cancellation, timeout and output limit). Run it only inside a bounded user systemd slice; spawned command units inherit that slice, so the overall test budget covers the editor and its commands together. For example, after selecting Node 24:

```bash
systemctl --user set-property --runtime app-dualmind-validation.slice MemoryMax=1G MemorySwapMax=0 CPUQuota=100%
systemd-run --user --wait --collect --slice=app-dualmind-validation.slice \
  -p MemoryMax=1G -p MemorySwapMax=0 -p RuntimeMaxSec=60s \
  --working-directory="$PWD" --setenv="PATH=$PATH" \
  --setenv=DUALMIND_TEST_SYSTEMD=1 npm run check
```

For Electron validation, set the slice and unit to 2G and the unit deadline to 180s. Set `VSCODE_TEST_EXECUTABLE` to reuse the installed editor, and run `xvfb-run -a npm run test:ui` with `ELECTRON_RUN_AS_NODE` unset. The Webview suite enters from the activity bar, configures both protocols and real additional commands, executes a failed-check/revision/approval cycle, and verifies unchanged source files in dedicated mode, direct edits in current/specified modes, and saved branch choices across reload. No package is created or installed by these commands.

On hosts without the required cgroup v2 memory/swap limits, real UI verification checks both English and Chinese resource errors and finishes the remaining interface checks. Scenarios requiring actual commands are recorded as uncovered: `results.json` has `passed: false` and `interfacePassed: true`, and the command exits with code 2. This is not a complete pass; rerun execution verification on a supported host.

## Dual-agent cycle validation

Local model fixtures cover Reviewer-first planning, autonomous Worker commands, revised plans after rejection, reading-only acceptance and legacy custom configuration. Contract tests cover nested tool arguments, stable criteria, forged/stale/failed evidence, feedback and newer failures superseding older success. Real UI checks exercise bilingual plans and reading acceptance even when command resource probing fails. Actual command enforcement remains separately reported; missing systemd/cgroup v2 produces partial coverage with exit code 2.

See the [validation record](./execution-cycle-validation.md) for the actual environment, passes and unverified scenarios.
