import type { RequestSummary, RunEvent, TaskMessage } from '../../src/shared/execution';

export type GroupRecord = RunEvent | TaskMessage;
export type RecordRole = 'user' | 'reviewer' | 'worker' | 'system';
export interface RequestGroup<T> {
  id: string;
  request?: RequestSummary;
  time: string;
  items: T[];
}
export const earlierRequest = 'legacy';
export function recordRole(item: GroupRecord): RecordRole {
  return 'role' in item ? item.role : (item.agent ?? 'system');
}
export function groupRequests<T extends GroupRecord>(
  items: readonly T[],
  requests: readonly RequestSummary[],
): RequestGroup<T>[] {
  const metadata = new Map(requests.map((request) => [request.id, request]));
  const groups = new Map<string, RequestGroup<T>>();
  for (const item of items) {
    const id = item.userRequestId ?? earlierRequest;
    let group = groups.get(id);
    if (!group) {
      const request = metadata.get(id);
      group = { id, request, time: request?.time ?? item.time, items: [] };
      groups.set(id, group);
    }
    group.items.push(item);
  }
  for (const group of groups.values()) {
    group.items.sort(
      (a, b) =>
        a.time.localeCompare(b.time) ||
        (a.runId ?? '').localeCompare(b.runId ?? '') ||
        (a.sequence ?? 0) - (b.sequence ?? 0),
    );
  }
  return [...groups.values()].sort((a, b) =>
    a.id === earlierRequest
      ? -1
      : b.id === earlierRequest
        ? 1
        : a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
  );
}
export function mergeRequests(current: RequestSummary[], incoming: RequestSummary[] = []) {
  return [...new Map([...current, ...incoming].map((request) => [request.id, request])).values()];
}
export function failedRecord(item: GroupRecord) {
  if ('tool' in item && item.tool) {
    return ['failed', 'rejected', 'unknown'].includes(item.tool.status);
  }
  return (
    Boolean(item.fault) ||
    item.kind === 'error' ||
    (item.detail?.type === 'command' && !item.detail.command.ok)
  );
}
