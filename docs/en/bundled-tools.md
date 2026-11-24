# Bundled command-line tools

[简体中文](../zh/bundled-tools.md) · [Documentation](./README.md)

DualMind 0.0.6 includes offline Linux x64 copies of `rg` 16.0.0, `fd` 10.5.2 and `jq` 1.8.2 for text search, file discovery and JSON processing. The supported baseline is Ubuntu 20.04+ amd64; other platforms continue using system commands. Actual validation is recorded in the [development log](./development-log.md).

## Use in tasks

Worker and Reviewer continue using `run_command`. After capturing the login environment, the host appends validated tool directories to that run's PATH. System commands have priority. A failed login probe applies the same procedure to the host environment snapshot. User terminals, shell profiles and the global process environment are unchanged; task execution never downloads or installs tools.

An explicitly empty PATH retains its current-directory entry. An absent PATH starts with standard Linux system directories. An existing system command is never automatically retried with a bundled version, even if it is old or fails. Each command still starts a new shell from the run snapshot; explicit PATH changes within a command retain normal shell semantics.

The optional `bundledTools` environment summary describes fallback names, bundled versions, availability and failure reasons. It does not identify the selected system version or include raw environment values. Missing, damaged or non-executable tools are individually disabled; other tools remain usable. A new or resumed run rechecks the current extension resources. Completed commands are not replayed, and existing budgets and correction counters are preserved.

Prefer bounded searches, for example:

```bash
rg --threads 2 --glob '*.ts' -- 'pattern' src
fd --threads 2 --type f --extension ts . src
jq '.scripts' package.json
```

`rg` exit code 1 means no matches. Raw `run_command` results still record success or failure from the command's exit status. Only exploratory searches that explicitly allow no matches should handle that exit code in the same shell call. For Bash/Zsh/sh:

```bash
rg --threads 2 -- 'pattern' src
search_status=$?
if [ "$search_status" -eq 1 ]; then
  printf 'No matches\n'
elif [ "$search_status" -ne 0 ]; then
  exit "$search_status"
fi
```

Do not use unconditional `|| true`: genuine search errors and verification failures must remain failures. This example does not apply to acceptance checks requiring a match, `jq -e`, or other programs. Use equivalent syntax for PowerShell/cmd. The host does not rewrite commands or interpret compound commands to change exit codes. No model tool or settings page is added.

## Development, cache and packaging

The [asset manifest](../../resources/tools/manifest.json) locks official URLs, versions, sizes, SHA-256 hashes and license files. Fetching tools is an explicit development step:

```bash
npm run tools:fetch
npm run tools:prepare
npm run check
npm run package
```

`tools:fetch` downloads sequentially into ignored `out/bundled-tools/cache/` directories and validates complete replacements before updating their cache. Valid caches work offline. Network errors, digest changes, size limits and unsafe archives fail the fetch while retaining previous valid versions. URLs and redirects are limited to approved upstream HTTPS hosts.

Builds and watch builds prepare `dist/tools/` offline. A missing or invalid cache produces an explicit fetch instruction instead of hidden network access. Extraction selects only manifest files and rejects escaping paths, links, duplicate entries and truncation. Preparation checks static x64 ELF binaries, hashes, permissions and licenses; package validation checks the actual VSIX again. Linux release candidates are built on Linux with executable permissions verified. Checks on other platforms do not establish Linux permission compatibility.

Runtime uses extension resources without the development cache. Existing Git, shell, project toolchain and dependency requirements still apply. See [third-party notices](../../THIRD_PARTY_NOTICES.md). Upgrading a tool requires an explicit manifest and hash change.

## Validation resources

Validation uses small temporary repositories, controlled PATH values and local mock models, without uninstalling or modifying host commands. Comprehensive checks, extension-host tests and packaging run sequentially with one CPU, low priority, a 256 MiB test heap and process-tree resource monitoring. Test limits do not establish a product command sandbox or fixed memory quota.

Python uses existing local environments; see [local Python](./local-python.md). It is separate from the bundled rg/fd/jq assets.
