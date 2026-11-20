import type { TaskDraft } from '../../src/shared/model';

export type TaskLocation = { view: 'home' } | { view: 'task'; taskId: string };
export type Navigation =
  | TaskLocation
  | {
      view: 'api' | 'defaults' | 'roles' | 'execution';
      returnTo: TaskLocation;
    };
export function restoreNavigation(value: unknown, tasks: readonly TaskDraft[]): Navigation {
  if (!value || typeof value !== 'object') {
    return { view: 'home' };
  }
  const state = value as Record<string, unknown>;
  if (
    state.view === 'task' &&
    typeof state.taskId === 'string' &&
    tasks.some((task) => task.id === state.taskId)
  ) {
    return { view: 'task', taskId: state.taskId };
  }
  if (
    state.view === 'api' ||
    state.view === 'defaults' ||
    state.view === 'roles' ||
    state.view === 'execution'
  ) {
    const target = restoreNavigation(
      state.returnTo && typeof state.returnTo === 'object'
        ? {
            view: (state.returnTo as Record<string, unknown>).view,
            taskId: (state.returnTo as Record<string, unknown>).taskId,
          }
        : undefined,
      tasks,
    );
    return { view: state.view, returnTo: target.view === 'task' ? target : { view: 'home' } };
  }
  return { view: 'home' };
}
