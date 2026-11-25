# Model access and compact review workbench: interface proposal

[简体中文](../zh/review-workbench-proposal.md) · [Design index](./design.md)

**Status: pending explicit review.** Prepared November 25, 2026. The three SVG/PNG pairs below are static illustrations. They introduce model-provider configuration, a compact task header and request-grouped logs. Corresponding UI source has not been integrated; backend model adapters, read-only review and request attribution are developed independently of this visual approval.

## 38. Model-provider settings

[Editable SVG](../design/v0.0.7/dual-mind-model-provider-proposal.svg) · [PNG preview](../design/v0.0.7/dual-mind-model-provider-proposal.png)

![Provider and protocol settings](../design/v0.0.7/dual-mind-model-provider-proposal.png)

Provider and inference protocol are explicit fields. OpenAI-compatible Chat Completions/Responses, Anthropic Messages, and Command Code's compatibility API share manually entered URLs, keys and model IDs. Keys stay in the host password prompt. Refreshing models only retrieves IDs; Command Code filters declared endpoint support. No automatic endpoint inference or protocol fallback is proposed.

## 39. Task title and exclusive context/results panels

[Editable SVG](../design/v0.0.7/dual-mind-compact-task-header-proposal.svg) · [PNG preview](../design/v0.0.7/dual-mind-compact-task-header-proposal.png)

![Compact task header and exclusive panels](../design/v0.0.7/dual-mind-compact-task-header-proposal.png)

The task title and actions occupy one compact row. Existing details remain beneath it. Context usage and task results share the next row and one expansion state: opening either closes the other, and selecting an already-open item collapses it. The expanded section appears beneath the row. Narrow layouts must preserve accessible actions without horizontal overflow.

## 40. Logs grouped by request, then role

[Editable SVG](../design/v0.0.7/dual-mind-request-grouped-logs-proposal.svg) · [PNG preview](../design/v0.0.7/dual-mind-request-grouped-logs-proposal.png)

![Request and role grouped execution logs](../design/v0.0.7/dual-mind-request-grouped-logs-proposal.png)

Each user question or modification request has its own collapsible group, labelled with the original message and status. Reviewer and Worker sections collapse independently inside the group. Events remain chronological within each role; the host's stable request ID prevents identical text or concurrent updates from mixing requests. Legacy records lacking a request ID remain in an explicit earlier-records group. The same grouping applies to chat process records and evidence, without merging the private model histories.

## Review boundary

These drawings need explicit approval before their visual changes are implemented, as required by [CONTRIBUTING.md](../../CONTRIBUTING.md). Approval covers the provider controls, the two compact rows, the mutually exclusive context/results section, and the request/role accordion model. Existing artwork and its 37 approvals remain unchanged. Example timestamps, names and results do not represent an actual execution.
