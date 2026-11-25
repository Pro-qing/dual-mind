# Environment and support baseline

[简体中文](../zh/environment.md) · [Documentation](./README.md)

**Source version: 0.0.8 · Locally prepared; awaiting manual publication by the maintainer.** Recorded November 25, 2026. See the [0.0.8 version notes](./release-notes-0.0.8.md) for features, validation and artifacts. Historical versions, design archives and validation records retain their meaning.

## Supported baseline

DualMind's configured support baseline is **Ubuntu 20.04 or newer on x86_64/amd64**. Other operating systems, Linux distributions, and ARM64 are not yet validated. The development checker reports warnings for them without adding platform or architecture installation restrictions.

| Scenario                                   | Requirements                                                       |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Install and use a built VSIX               | Ubuntu 20.04+, x86_64/amd64, and desktop VS Code 1.100.0+          |
| Develop from source                        | The same baseline, plus Git 2.25+, nvm-managed Node.js 24, and npm |
| Run extension-host tests without a desktop | The development baseline, plus Electron libraries, Xvfb, and xauth |

An installed VSIX uses VS Code's extension host; users do not need a separate Node.js or npm installation. Node.js 24 is required for development, checks, and packaging. The bundle targets Node.js 20 to remain compatible with the minimum supported editor.

The [Node.js 24 platform requirements](https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list) list Linux x64 with kernel 4.18+ and glibc 2.28+, including Ubuntu 20.04. Ubuntu 20.04's standard kernel and glibc meet those binary requirements. See also the [VS Code system requirements](https://code.visualstudio.com/docs/supporting/requirements).

## Prepare the development toolchain

On Ubuntu, install the basic tools if needed:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
```

Install nvm using its [official installation instructions](https://github.com/nvm-sh/nvm#installing-and-updating). To preserve the machine's default Node.js, add `--no-use` to the command that loads `nvm.sh` in your shell startup file. This loads version management without automatically selecting a version. Open a new terminal or load an existing installation:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" --no-use
```

For a new nvm installation on a machine previously using system Node.js, run `nvm alias default system` before the first `nvm install` so the project version does not become the default. Preserve any existing nvm default alias. `--no-use` retains the PATH inherited when the shell starts; it does not force an existing terminal back from a project version to the system version.

From the repository root:

```bash
nvm install
nvm use
node --version          # v24.x
npm --version
command -v node        # a path inside your nvm installation
npm run check:env
npm ci
npm run tools:fetch
```

Both nvm commands read `.nvmrc`, which contains `24`. Run `nvm use` again in each new terminal. Avoid Ubuntu 20.04's system Node.js 10.19.0; keep it installed if other software needs it, and select the development version through nvm. Do not replace `/usr/bin/node` or bypass `.npmrc` engine checks with `--force`.

After project work, run `nvm use system` in the same terminal to return to the system version; `nvm deactivate` removes the nvm version path from the current shell. Changing directories alone does not switch Node.js.

CI uses `actions/setup-node` to read the same `.nvmrc`; it does not need a separate nvm installation.

## Electron and headless test dependencies

For **Ubuntu 20.04**, the repository provides an installer for the required shared libraries and display tools:

```bash
sudo bash scripts/install-ubuntu20-test-deps.sh
```

Review the [installer](../../scripts/install-ubuntu20-test-deps.sh) for the exact packages. It includes GTK, NSS/NSPR, ALSA, GBM/DRM, X11, Latin/CJK fonts, Xvfb, and xauth. The CJK fonts allow Chinese Webview screenshots in a clean CI container. The script checks that it is running on Ubuntu 20.04 before installing packages; package names differ in later Ubuntu releases. In a root CI container, omit `sudo`.

On a newer Ubuntu desktop with VS Code and its dependencies already installed, add the headless display tools if needed:

```bash
sudo apt-get update
sudo apt-get install -y xvfb xauth
```

A working desktop session can run `npm test` directly. Without a display, run:

```bash
npm run check
VSCODE_TEST_VERSION=1.100.0 xvfb-run -a npm test
VSCODE_TEST_VERSION=stable xvfb-run -a npm test
npm run package
```

The first test downloads each editor into `.vscode-test/`; npm and VS Code download services must be reachable. A headless environment needs both the Electron shared libraries and Xvfb/xauth. Xvfb supplies the display, not the libraries.

## Verify the active environment

```bash
npm run check:env
```

The checker reports the distribution and version, CPU architecture, glibc, Node.js version, Node executable path, and Git version. It needs no npm dependencies. If an old npm fails before reaching the checker, run it directly:

```bash
node scripts/check-environment.cjs
```

The script uses Node.js 10-compatible syntax so the system Node can display a clear setup message.

| Detected environment                                                          | Result                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ubuntu older than 20.04                                                       | Failure with the minimum version requirement                                   |
| Development Node.js outside major version 24                                  | Failure with `nvm install` / `nvm use` instructions                            |
| Git missing from PATH or older than 2.25                                      | Failure with installation guidance                                             |
| Ubuntu 20.04+ amd64 with Node.js 24 and Git 2.25+                             | Passes the configured baseline check                                           |
| Another platform, distribution, architecture, or an unreadable Ubuntu version | “Not yet validated” warning; valid Node.js 24 and Git 2.25+ are still required |

This check confirms the configured environment requirements. It reports glibc but does not prove that every Electron library is installed; the extension-host tests check whether the editor can actually launch and activate the extension.

Environment checking runs before dependency installation, the combined checks, build, watch, type-watch, and packaging. `npm run check:node` remains available for the Node-only check. `npm run test:env` covers accepted/rejected versions and the unvalidated-platform warnings.

## Configured CI matrix (not a new-version result)

| Execution environment                                | VS Code   | Checks                                                                                    |
| ---------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `ubuntu:20.04` container on an `ubuntu-24.04` runner | `1.100.0` | Dependency installation, project checks, extension-host smoke test                        |
| `ubuntu:20.04` container on an `ubuntu-24.04` runner | `stable`  | The same checks, real bilingual Webview interaction/screenshots, and local VSIX packaging |
| Native `ubuntu-24.04` runner                         | `stable`  | Dependency installation, project checks, extension-host smoke test                        |

The [workflow](../../.github/workflows/ci.yml) uses Bash in the Ubuntu 20.04 container and asserts the actual distribution, version, and amd64 architecture before setup. GitHub [retired its Ubuntu 20.04 hosted runner on April 15, 2025](https://github.com/actions/runner-images/issues/11101), so this job uses a container to preserve the minimum userland baseline. The container shares the host kernel and does not test an Ubuntu 20.04 kernel or a full desktop session.

Containers are for compatibility regression testing. Normal users install the VSIX in desktop VS Code as described in [Usage](./usage.md). Continue with [Development](./development.md) for F5 and commands, or [Packaging and releases](./releasing.md) for a local VSIX.

## Git task workspace dependency

The checker requires Git 2.25+ on PATH and prints its version, including during preinstall. The lazy runtime task-workspace service checks Git again when preparation is requested. Missing Git does not prevent the installed extension from managing local tasks, connections or model lists. Starting execution invokes the host Git foundation; saving a task still creates no branch. See [Architecture](./architecture.md#git-task-workspace-foundation-development-branch) for preparation requirements and [Protocol](./protocol.md#internal-git-workspace-service) for retained resources and manual cleanup.

## Execution resource enforcement

Task commands launch through native shells on Linux, macOS and Windows, without user systemd, cgroup v2 or a user D-Bus session. The extension neither probes nor enforces memory/swap quotas. Commands default to a 180-second timeout (10–900 allowed), with a 2 MiB output cap and process-group cancellation. Programs actually used by a task must be installed. Missing executables, permission errors and launch failures are recorded as structured results for Worker correction and Reviewer inspection. Commands run as the current OS user and are not filesystem or network sandboxes. Native macOS and Windows jobs are configured; actual passing results are still required.

The initial candidate audit used Ubuntu 24.04.5 amd64, Node.js 24.22.3, Git 2.43.0 and local VS Code 1.141.0. The table describes the configured workflow, not successful remote CI for 0.0.2/0.0.3. See the [validation record](./execution-cycle-validation.md) for subsequent local Ubuntu 20.04 testing; minimum VS Code 1.100.0 and other matrix combinations were not revalidated for this runner revision.

Execution regression no longer needs a user systemd session. Real command tests run by default without an opt-in variable. Real UI tests still need a desktop or Xvfb, Electron libraries and Git. Changing the runner does not establish a new remote CI result; see the [validation record](./execution-cycle-validation.md) for actual coverage.

## Automatic execution and command-free tasks

Reviewer plans first; Worker prepares dependencies and runs commands as needed. Command-free tasks can still complete through documented reading acceptance. Reviewer reads recorded command outcomes, including failures; Pair-style acceptance treats them as review inputs rather than automatic host vetoes. External tools may bound the overall development verification process; those budgets are not product task prerequisites.

## Continuing conversation environment

Chat questions use read-only Reviewer inspection and do not start Worker commands. Continued changes reuse the bound directory and require the same branch and HEAD; Worker runs any necessary commands. Commands still run directly without reinstating systemd or fixed memory requirements. Added real UI cases use local model simulators and disposable repositories; see [task chat validation](./task-chat-validation.md).

## Native shell commands

Worker uses the [host-managed shell execution layer](./shell-execution.md), with automatic environment inheritance. Reviewer has read-only file and recorded-output tools and cannot invoke commands. No language-specific setup setting is required. macOS and Windows native CI is configured; passing results must be observed before those platforms are called validated. Historical validation reports retain their original scope.

## Failure recovery

The host now persists role, phase, operation outcomes and execution position. Failed and reloaded runs resume with current model connections while preserving the plan, work round and uncommitted files. The read-only `read_operation` tool exposes older operations independently of the latest 80 UI events. Ordinary tool failures still return to the model. Transient model failures before a valid stream event allow at most three requests sharing a 120-second budget, including waits; authentication, quota and protocol failures do not retry automatically.

The play icon with **Continue execution** resumes paused runs and eligible failed/interrupted runs. The fixed recovery notice identifies the role, phase, saved position and any blocking reason, including while evidence is minimized. Recovery checks and cancellable retry waits use host-reported state and request attempts; countdowns run only in the Webview. Restart remains a separate new run. See the [approved recovery design](./recovery-proposal.md) and [recovery behavior](./execution-recovery.md) for journal, process and evidence boundaries.

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).

## Local Python

Preparation and recovery identify local Python 2.7/3 and common project environments for model context. Worker alone can invoke `run_command`; Reviewer can inspect recorded outcomes but cannot run commands. Python is not bundled or installed, and global environments are unchanged. See [local Python](./local-python.md) for discovery order, budgets and failure behavior.
