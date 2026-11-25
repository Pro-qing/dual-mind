import type { TaskDraft } from './model';
import { restoreNavigation, type Navigation } from './navigation';

export interface GroupView {
  requests?: Record<string, boolean>;
  roles?: Record<string, boolean>;
}
export interface ChatView {
  taskPanel?: 'none' | 'context' | 'artifacts';
  conversationGroups?: GroupView;
  evidenceGroups?: GroupView;
  detailsExpanded?: boolean;
  panel?: 'open' | 'minimized' | 'closed';
  expandedMessages?: string[];
  minimizedMessages?: string[];
  expandedEvidence?: string[];
  minimizedEvidence?: string[];
  scope?: { runId?: string; through?: number };
  evidenceTop?: number;
  seenRecords?: number;
  seenErrors?: number;
}
export interface WorkbenchViewState {
  version: 1;
  navigation: Navigation;
  chats: Record<string, ChatView>;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function restoreChatViews(
  value: unknown,
  tasks: readonly Pick<TaskDraft, 'id'>[],
): Record<string, ChatView> {
  const raw = object(value);
  return Object.fromEntries(
    tasks.slice(-100).flatMap((task) => {
      if (!Object.hasOwn(raw, task.id)) {
        return [];
      }
      const input = object(raw[task.id]),
        result: ChatView = {};
      if (['none', 'context', 'artifacts'].includes(String(input.taskPanel))) {
        result.taskPanel = input.taskPanel as ChatView['taskPanel'];
      }
      for (const key of ['conversationGroups', 'evidenceGroups'] as const) {
        if (input[key] && typeof input[key] === 'object') {
          const groups = object(input[key]);
          result[key] = Object.fromEntries(
            ['requests', 'roles'].map((kind) => [
              kind,
              Object.fromEntries(
                Object.entries(object(groups[kind]))
                  .filter(([id, open]) => id.length <= 250 && typeof open === 'boolean')
                  .slice(-1000),
              ),
            ]),
          );
        }
      }
      if (typeof input.detailsExpanded === 'boolean') {
        result.detailsExpanded = input.detailsExpanded;
      }
      if (['open', 'minimized', 'closed'].includes(String(input.panel))) {
        result.panel = input.panel as ChatView['panel'];
      }
      for (const key of [
        'expandedMessages',
        'minimizedMessages',
        'expandedEvidence',
        'minimizedEvidence',
      ] as const) {
        if (Array.isArray(input[key])) {
          result[key] = [
            ...new Set(
              input[key].filter(
                (item): item is string => typeof item === 'string' && item.length <= 250,
              ),
            ),
          ].slice(-1000);
        }
      }
      for (const key of ['evidenceTop', 'seenRecords', 'seenErrors'] as const) {
        if (Number.isSafeInteger(input[key]) && Number(input[key]) >= 0) {
          result[key] = Number(input[key]);
        }
      }
      const scope = object(input.scope);
      if (typeof scope.runId === 'string' && scope.runId.length <= 100) {
        result.scope = {
          runId: scope.runId,
          ...(Number.isSafeInteger(scope.through) && Number(scope.through) > 0
            ? { through: Number(scope.through) }
            : {}),
        };
      }
      return [[task.id, result]];
    }),
  );
}
export function restoreWorkbenchView(
  value: unknown,
  tasks: readonly TaskDraft[],
): WorkbenchViewState {
  const raw = object(value);
  return {
    version: 1,
    navigation: restoreNavigation(raw.version === 1 ? raw.navigation : value, tasks),
    chats: restoreChatViews(raw.version === 1 ? raw.chats : undefined, tasks),
  };
}
export function toggleId(values: readonly string[] | undefined, id: string, enabled: boolean) {
  const next = new Set(values);
  if (enabled) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return [...next].slice(-1000);
}

/** Import only display preferences; never retain arbitrary legacy page data. */
export function chooseWorkbenchView(
  local: unknown,
  saved: unknown,
  legacy: unknown,
  tasks: readonly TaskDraft[],
): WorkbenchViewState | undefined {
  for (const value of [local, saved, legacy]) {
    const raw = object(value);
    if (
      raw.version === 1 ||
      ['home', 'task', 'api', 'defaults', 'roles', 'execution'].includes(String(raw.view))
    ) {
      return restoreWorkbenchView(value, tasks);
    }
  }
  return undefined;
}
