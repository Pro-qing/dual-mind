# Worktrees, context summaries, and task artifacts

[简体中文](../zh/task-lifecycle.md) · [UI proposal](./task-lifecycle-proposal.md) · [Protocol](./protocol.md)

**Locally committed revision, November 23, 2026; version remains 0.0.5.** Managed bases, automatic context summaries, and artifact operations now have both host and frontend support. Scenes 28–34 were approved in this round; settings, commit/merge/cleanup and restoration controls are connected. [Tool-error handling](./tool-errors.md) is integrated too. Original tags and releases remain intact.

The work-preservation approach was informed by The Pair 3.0.4 at local commit `dace8ea`; implementation uses DualMind's TypeScript services without copying Rust source. Semantic summarization is new here, rather than The Pair's fixed history-window trimming.

## Worktrees and task completion

`managed` remains the default and accepts an optional existing local `baseBranch`. Otherwise the first preparation resolves the source checkout's current branch and freezes its commit. Worktrees remain in extension workspace storage. Source modifications may remain dirty and are not copied into isolation. Direct `current`/`branch` modes retain their clean-directory and branch-switch behavior.

Reviewer approval only completes execution. The host separately records acceptance bound to file content, retaining the directory and branch. Explicit commits recheck a preview token and save current nonignored Git changes with a reviewed file list and message. Acceptance remains content-based across a commit; it does not certify the target project's merged state.

Merging requires committed task content matching acceptance. It performs an ordinary merge with fast-forward allowed, without squash, rebase, or push. A target checked out in the source directory requires that directory to be clean; another unoccupied local target uses an extension-managed temporary worktree. An external checkout blocks merging and reports its location. Source/target commits, operation ID, and directory are recorded before mutation. Conflicts retain their workspace and support host check/complete/abort operations. Completion requires manually resolved, staged conflicts. Every integrated result is marked as requiring verification; source-task acceptance is not reused as target acceptance.

Mutations are serialized by common Git repository within the host, using Git reference checks, preview tokens, and persistent operation records to avoid duplicate commits or unsafe retries. This is not an atomic transaction with arbitrary external Git clients: changed branches, files, or merge state block further work. Git hooks, filters, external diffs, and custom merge drivers remain disabled so repository configuration cannot launch additional programs.

## Preservation, cleanup, and restoration

Explicit cleanup applies only to registered DualMind managed worktrees. After execution and child-process shutdown are confirmed, persist intent and a file manifest, save changes with `git stash --all`, and anchor them at `refs/dualmind/snapshots/<id>/head` and `/work`. Verify required file contents against Git objects before removal. Changing `stash@{n}` positions are not recovery identities.

Preserve staged, unstaged, untracked, and nonregenerable ignored files. Exclude only wholly untracked `node_modules`, `.venv`, `venv`, `target`, `dist`, `build`, `coverage`, `.next`, `.cache`, and `__pycache__` directories, listing them in preview; tracked files prevent exclusion. Scan excluded directories for nested Git repositories too. Git saves content, symlinks, and index state; the manifest additionally records regular-file permissions. ACLs, extended attributes, and timestamps are not preserved by this contract.

Limits are 256 MiB of saved files, 20,000 files, and 200,000 scanned directory entries; Git retains its 20-second/2 MiB-output guard. Special files, hardlinks, nested repositories, submodules, redirected directories, excessive inventories, incomplete preservation, or new unsaved changes block cleanup. Preflight rejects Git text/EOL transformations before stash can change original bytes. Pending artifact operations block new execution until the operation is recovered. Failure after saving may have moved changes into the snapshot; keep its references and worktree and resume with the same operation ID, rather than pretending no save occurred.

Keep task branches with unique commits. Delete only the registered task branch when another local branch, remote-tracking ref, or tag contains its tip, with a compare-and-swap ref update. Rescue detached HEAD commits with a named branch. A missing directory permits removing only that worktree registration; unrelated missing registrations remain, without global prune.

Cleanup retains task history and rejects new execution messages. Delete-with-cleanup saves artifacts before removing the task record. Legacy `task.delete` without `cleanup` retains directories and branches. Saved artifacts use independent `dualMind.git.artifacts.v1` storage and survive task deletion.

`git.restore` creates a new task branch/worktree at the anchored snapshot commit, restoring changes and index state. Failed or partial restores retain the new directory and cannot overwrite intervening edits. `task.followup` creates a pending task based on the integrated target or original source branch, with an explicit local-base override. Neither operation inherits acceptance evidence or automatically starts model requests.

## Automatic context summaries

Each role has its own request context. The default window is an **estimated 32,768 tokens**, reserving 4,096 for output. `contextWindows[modelId]` on a connection overrides the window, accepting 8,192–4,194,304. Older connection saves that omit the field preserve existing overrides; an empty object clears them. Configuration is available in the Model context settings category.

Estimate the whole serialized request at UTF-8 bytes divided by two, including policy, tool definitions, and protocol packaging; raise the conservative ratio when returned input usage requires it. Compact at 80% of available input or 80% of the separate 512 KiB request-size guard, targeting approximately 50% of the input budget. Byte size is not a model's token capacity.

Use the current role's endpoint/model with only the internal `submit_context_summary` tool. Preserve public goals, constraints, decisions, outstanding issues, and operation references; the host supplies immutable role rules, original requirements, current plan/cursor, and pending user messages. Prefer the most recent four complete exchanges and reduce their count to fit. Never split calls from results. Responses private reasoning is neither summarized nor persisted.

Chunk old history on UTF-8 code-point boundaries, with at most eight summary requests per compaction and a 12 KiB summary limit. Tool results over 12,000 bytes become excerpts with operation IDs; `read_operation` retains paged full access. Public conversation, command output, and acceptance records are not deleted by compaction.

Recognized HTTP/stream context errors halve that role's effective budget and trigger another compaction, at most twice for one business request. No reduction, oversized fixed instructions, summary failure, or persistence failure stops advancement and retains recoverable records. Summaries do not spend work rounds or reset tool, correction, or transport retry budgets. Existing limits of 20 business model turns per phase and 64 MiB execution records still apply independently.

## Three different recovery records

| Record                     | Content                                                                | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Context summary            | One role's public facts, covered operation position, digest and budget | Smaller model requests and factual memory after reload     |
| Execution recovery journal | Phase, plan, evidence, operation status and process identity           | Resume the same run without replaying completed operations |
| Git artifact snapshot      | Files, index state, base/commits and stable refs                       | Restore a new task after cleanup or task deletion          |

Write and sync the summary first, persist its checkpoint reference second, then replace memory. Recovery validates run, role, digest, and coverage and reconstructs public context rather than replaying private protocol messages. Stop, persistence failure, stale-generation replies, and unknown-process rules remain in force.

See the [development log](./development-log.md) for executed checks, platforms, and actual UI validation.
