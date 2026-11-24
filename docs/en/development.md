# Development

[简体中文](../zh/development.md) · [Documentation](./README.md)

**Source version: 0.0.7 · Local release preparation; not publicly released.** Recorded November 24, 2026. See the [0.0.7 version notes](./release-notes-0.0.7.md) for changes, validation and the local artifact. Publication is handled separately by the maintainer; historical version records retain their original meaning.

## Environment

Use **Ubuntu 20.04+ on x86_64/amd64**, VS Code 1.100.0+, and nvm-managed Node.js 24. Other platforms and ARM64 are not yet validated. The [environment guide](./environment.md) is the reference for system requirements, nvm setup, Electron libraries, Xvfb, and xauth. The extension bundle targets Node.js 20 for the minimum supported editor's extension host.

If nvm is installed but not loaded, run:

```bash
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" --no-use
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
npm run tools:fetch
```

`.npmrc` enables strict engine checks. The environment check also runs before installation, checks, builds, and watch commands. Do not bypass `EBADENGINE` with `--force` or replace the system Node.js binary. Load nvm and select the repository version instead. nvm selection is per shell; run `nvm use` in each new terminal. See the [environment guide](./environment.md#prepare-the-development-toolchain) for initialization that preserves the machine default. Run `nvm use system` after project work to return to system Node.js; changing directories alone does not switch versions.

## Code and documentation synchronization

Code and corresponding documentation must be completed in the same change. Searching, reviewing and recording documentation impact are delivery requirements; checking links or the existence of translations alone is insufficient.

1. Identify affected features, modules, interfaces, message/configuration fields, user actions and behavioral limits from the code diff. Include English and Chinese terms, plus both old and new names.
2. Use `rg` to search relevant documentation throughout the repository, including root guides/policies, `docs/en/`, `docs/zh/`, module READMEs and `.github/` templates. Start with a command such as the following, replace the example terms, and expand the search through references and new findings instead of checking only one known page:

   ```bash
   rg -n --hidden -g '*.md' -g '!.git/**' -g '!node_modules/**' -g '!dist/**' -g '!out/**' -g '!release/**' -g '!.vscode-test/**' -g '!.test-workspace/**' -g '!coverage/**' 'TaskChat|message.send|任务聊天|task chat' .
   ```

3. Read each match in context and follow related sections. Compare descriptions, examples, defaults, boundaries/limitations, implementation/approval/publication status and cross-references against the code. Update both languages and repeated descriptions; document new behavior in the relevant guide when coverage is missing.
4. Distinguish current descriptions from historical designs, releases and validation records. Current descriptions follow the code. Preserve historical dates, results, failures and unverified cases; add revision notes and current-document links where clarification is needed. Designs, CI configuration and old passing tests are not evidence of current validation.
5. Every code change must append corresponding entries to the [English development log](./development-log.md) and [Chinese development log](../zh/development-log.md). Record the actual date, change, search terms and reviewed files/sections, documentation updates, executed checks and results, and unrun checks/limitations. Even when no text needs updating, record the review scope and specific reason. Documentation-only synchronization also records the review and checks actually performed.
6. Run checks appropriate to the change, then search again for old terms and contradictory descriptions. Confirm that remaining matches have an explicit historical context. Confirm documentation review, bilingual synchronization and development-log entries separately in the PR.

For documentation-only changes, run `npm run docs:check`, `npm run format:check` and `git diff --check`. The first two validate links/assets/language pairs and formatting, not semantic accuracy. Code changes still require the relevant engineering checks and tests from the [contribution guide](../../CONTRIBUTING.md). Log only actual results, without reusing historical conclusions.

## Git commit messages

Every new Git commit must include English and Simplified Chinese, including documentation changes. Retain the existing type prefix and use `type(scope): English summary / 中文摘要`, with an optional scope. Both languages must describe the same change; translations in a PR or development log cannot replace a bilingual commit message. This rule applies to new commits; do not rewrite existing history merely to add translations.

When a body is needed, use separate `English:` and `中文：` sections covering the reason, final behavior, actual validation and relevant limitations in the same order. Keep filenames, commands and interface identifiers unchanged. A short commit may consist only of its bilingual subject. The following is a format example; replace validation placeholders with actual results for the change:

```text
docs: synchronize documentation / 同步文档

English:
Update current behavior descriptions and document the required review workflow.
Validation: <checks actually run and their results; unrun checks and limitations>.

中文：
同步现行行为说明，并记录必须执行的文档核对流程。
验证：<实际执行的检查及结果；未运行项与限制>。
```

Before committing, review the staged diff, matching bilingual meaning and validation record. Use a UTF-8 message file with `git commit --file <message-file>` for multiline messages, preserving actual newlines instead of interpolating the body into a shell command.

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

Local tests use serial workers and a 256 MiB JavaScript heap per test process. On a constrained host, run checks and GUI suites separately; observe the entire process tree, available memory, swap and elapsed time, and stop the test if the host loses its reserve. A JavaScript heap cap alone does not bound Electron memory. `DUAL_MIND_RESOURCE_UI=1` adds renderer/heap limits and disables unrelated extensions in GUI fixtures; `DUAL_MIND_SKIP_NATIVE_UI=1` runs the Webview suite alone so `node scripts/verify-sidebar.mjs` can follow separately. These flags do not impose an OS memory quota.

Set `DUAL_MIND_PACKAGE_PATH=release/dual-mind-0.0.7-candidate.vsix` when running `npm run package` to keep a separate candidate without replacing the default package. Packaging does not install or publish the extension.

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

Local tests run serially with a 256 MiB JavaScript heap and the 30-second per-test timeout (90 seconds on native Windows). Run each verification command separately with a 1 GiB memory / 60-second limit for individual local batches (420 seconds for the full `npm run check`, which includes the real command timeout test), or 2 GiB / 300 seconds for Electron, and no swap. On Linux, a user systemd service can enforce these using `MemoryMax`, `MemorySwapMax=0`, and `RuntimeMaxSec`.

Set `VSCODE_TEST_EXECUTABLE=/usr/share/code/code` to reuse an installed VS Code for `npm test` and `npm run test:ui`; omit it to retain automatic download. Run Electron under `xvfb-run -a` when headless. All tests use isolated user profiles. The real Webview test starts a local mock server and uses a fake key in the native password prompt, then verifies query, selection, persistence, both languages and narrow layouts. It never reads personal credentials; model requests use local mock endpoints and no paid services.

## Execution verification

Tests use temporary repositories, local SSE servers and test credentials. Real command tests now run in the ordinary `npm run test:local` suite without `DUALMIND_TEST_SYSTEMD` or a user systemd session. They cover exact arguments, working directory, environment inheritance, launch errors, nonzero exit, cancellation, timeout, output limits and surviving child cleanup. Failing systemd tool stubs verify that the runner never calls those programs.

```bash
nvm use
npm run check
VSCODE_TEST_EXECUTABLE=/usr/share/code/code npm test
VSCODE_TEST_EXECUTABLE=/usr/share/code/code npm run test:ui
```

Product commands in these tests have no extension-imposed memory/swap quota. Callers may apply the overall development verification budgets described above externally; directly launched children inherit that outer cgroup without creating new systemd units. For headless Electron, prepend `xvfb-run -a` and unset `ELECTRON_RUN_AS_NODE`. These tests do not create or install a package.

Real UI verification configures both model protocols and real additional commands, checks failure/revision/approval, bilingual command errors, stopping a running command, unchanged source files in dedicated mode, direct writes in current/specified modes and branch selection restoration. Missing systemd/cgroup no longer selects a skip path: failure of the command cycle fails verification instead of reporting only interface success.

## Dual-agent cycle validation

Local model fixtures cover Reviewer-first planning, autonomous Worker commands, revised plans after rejection, reading-only acceptance and legacy custom configuration. Contract tests cover nested tool arguments, stable criteria, forged/stale/failed evidence, feedback and newer failures superseding older success. Real command runner tests execute by default; reading acceptance remains independently covered.

See the [validation record](./execution-cycle-validation.md) for actual environments, passes and unverified scenarios.

## Task chat development record

See the [development log](./development-log.md) and [task chat validation](./task-chat-validation.md). Tests cover cross-run pages, idempotency and redaction, read-only answers, all Git strategies with uncommitted continuation, handoff queues, pause/stop/reload, round budgets, fresh evidence, IME and drawer state.

## Native shell commands

Both roles now use the [shared shell execution layer](./shell-execution.md), with automatic environment inheritance and independent Reviewer verification. No language-specific setup setting is required. macOS and Windows native CI is configured; passing results must be observed before those platforms are called validated. Historical validation reports retain their original scope.

Recovery tests use scripted endpoints, forced exits of isolated child processes and recreated execution services, modifying only temporary repositories. Before recovery UI approval, real UI regression covers existing controls only, not the proposed button. See [recovery behavior](./execution-recovery.md).

## Sidebar regression

`npm run test:ui` runs both-protocol execution/chat regression followed by native sidebar and legacy-tab migration scenarios. Use `node scripts/verify-sidebar.mjs` to run the latter separately. Select an installed editor with `VSCODE_TEST_EXECUTABLE`, or use `VSCODE_TEST_VERSION=1.100.0` for the minimum version. Tests use temporary profiles and workspaces. See [actual sidebar validation](./sidebar-workbench-validation.md).

## Bundled command-line tools

Linux x64 `rg`, `fd` and `jq` are included offline in the VSIX. System commands have priority; only task subprocess PATH is extended. Explicitly run `npm run tools:fetch` before building; valid caches support offline builds. Versions, failures, licenses and validation are documented in [Bundled command-line tools](./bundled-tools.md).

## Verification for execution continuity

Prepare and verify the bundled-tool cache before running local suites, including inside independent worktrees: `npm run tools:prepare` and `npm run tools:verify`. A source checkout does not copy ignored caches. Tests use local model endpoints; no private credentials or paid inference are required. Regression cases cover both protocols beyond former call limits, recovery without replay, structured acceptance errors, redaction and background-command cleanup. Run checks in the foreground and record final exit status. A background launch and an empty output file are not successful validation.
