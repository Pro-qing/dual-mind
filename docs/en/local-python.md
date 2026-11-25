# Using local Python

[简体中文](../zh/local-python.md) · [Usage](./usage.md) · [Command execution](./shell-execution.md)

DualMind uses Python 2.7/3 and dependency environments already present on the host. It does not bundle, download or install Python. Worker uses `run_command` for scripts and information processing; Reviewer can inspect files and recorded outcomes but cannot execute commands. Both roles may receive the discovered environment summary as model context; no interpreter-selection page is added.

## Discovery during preparation

After capturing the login environment, task preparation and recovery check these locations in order:

1. `.venv` and `venv` in the actual task directory.
2. Existing environments referenced by `VIRTUAL_ENV` and `CONDA_PREFIX`.
3. `python3`, `python2`, `python` and `python2.7` on PATH.

Each environment uses its first existing standard entry: `bin/python`, `bin/python3`, `bin/python2`, `bin/python2.7` on Unix; `Scripts/python.exe`, `python.exe`, `Scripts/python3.exe`, `Scripts/python2.exe` on Windows. Invocation paths remain intact; distinct virtual environments are not merged simply because their symlinks resolve to one system binary. Explicit empty PATH entries resolve against the task directory; an absent PATH does not assume system search directories.

Discovery is limited to those locations, without filesystem-wide scans or enumeration of every Conda/pyenv environment. An isolated worktree does not search its original checkout's virtualenv. Activated environments may still be found through variables or PATH. AI can inspect another explicitly supplied interpreter through ordinary commands.

At most eight candidates are checked serially, with two seconds per process and an eight-second overall discovery budget. Remaining candidates are skipped when the budget expires. Combined stdout/stderr is capped at 4 KiB. Process cleanup must still confirm exit and follows existing process-tree deadlines, so cleanup can outlast the probe execution budget.

Identity probes use `-E -s -S -B`: no site initialization, user-package paths, Python environment configuration or bytecode writes. They remove the current-directory search entry before importing JSON to avoid project modules with the same name. They read only version, implementation and executable identity, without importing or enumerating third-party dependencies. Business scripts retain normal command/environment behavior; probe flags are not automatically applied to them.

## Use by the agents

Both roles receive candidate paths, sources, versions, implementations and availability. Python 3 is preferred for general information processing; Python 2 is used only when a script explicitly requires it. The major version is never inferred from the name `python`.

Choose a project environment compatible with the project first, then an activated environment, then PATH. Preserve and quote its full invocation path for the actual shell. Use the same interpreter for dependency checks and `-m pip`, for example in Bash:

```bash
'/path/to/project/.venv/bin/python' scripts/inspect_data.py
'/path/to/project/.venv/bin/python' -c 'import json; print(json.load(open("data.json")))'
'/path/to/project/.venv/bin/python' -m pip --version
```

`available` means identity detection succeeded, not that required packages, native extensions or toolchains are installed. Missing dependencies follow existing project-dependency rules, without installing a system interpreter or changing global environments. A failed script is not automatically rerun under another major version. Exit codes, skipped batch tails and repeated-error counts keep their existing semantics.

Results are preparation-time snapshots reused within a run. After an environment changes or is created, AI can recheck through `run_command`; the list is not an exhaustive availability guarantee. Recovery discovers the current environment again while retaining the saved phase, budgets and completed operations.

## Failures and records

Missing files, permissions, launch errors, timeouts, excessive output, invalid responses and unsupported versions make only that candidate unavailable. Missing Python does not prevent tasks that do not need it. Source order is retained, and only verified entries can be treated as usable interpreters.

Every admitted probe has its own `environment` operation record, with intent persisted before launch and process identity recorded. Cancellation cleans up the process. Trust/binding changes, persistence failures or unconfirmed shutdown stop progression. Discovery consumes no business tool/model-turn budget and is not acceptance evidence. Only normalized, redacted identity/status metadata is persisted, never raw probe output, environment values or package inventories.

See [Protocol](./protocol.md) for types and the [development log](./development-log.md) for actual platform validation. Initial local validation targets Ubuntu x64 and does not broaden claims about other platforms.
