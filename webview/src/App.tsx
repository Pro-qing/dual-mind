import { restoreChatViews, type ChatView, type WorkbenchViewState } from './chatViewState';
import { OperationError, toAppError, type AppError } from '../../src/shared/errors';
import { ErrorNotice } from './ErrorNotice';
import { restoreNavigation, type Navigation } from './navigation';
export type { Navigation } from './navigation';
import { ExecutionSettings } from './Execution';
import {
  emptyExecutionConfig,
  type ExecutionAction,
  type ExecutionSnapshot,
  type RunEvent,
} from '../../src/shared/execution';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Action,
  AppSnapshot,
  Bridge,
  TaskDraft,
  LanguageSetting,
} from '../../src/shared/model';
import { t, type MessageKey } from '../../src/shared/i18n';
import { UIContext, type LanguageGuard } from './context';
import { Dialog, Icon } from './components';
import { Connections, Defaults, Roles } from './Settings';
import { Tasks, TaskForm } from './Tasks';
import { useModelQueries } from './modelQueries';

export function App({
  snapshot,
  bridge,
  initialNavigation,
  onNavigation,
  initialChatViews,
  onViewState,
  onNavigationHandled,
}: {
  snapshot: AppSnapshot;
  bridge: Bridge;
  initialNavigation?: unknown;
  onNavigation?(value: Navigation): void;
  initialChatViews?: unknown;
  onViewState?(value: WorkbenchViewState): void;
  onNavigationHandled?(id: string): void;
}) {
  const [navigation, setNavigation] = useState<Navigation>(() =>
    restoreNavigation(initialNavigation, snapshot.tasks),
  );
  const [chatViews, setChatViews] = useState(() =>
    restoreChatViews(initialChatViews, snapshot.tasks),
  );
  const updateChatView = useCallback((taskId: string, patch: Partial<ChatView>) => {
    setChatViews((current) => {
      const next = { ...current[taskId], ...patch };
      if (JSON.stringify(current[taskId]) === JSON.stringify(next)) {
        return current;
      }
      return { ...current, [taskId]: next };
    });
  }, []);
  useEffect(() => {
    onViewState?.({ version: 1, navigation, chats: restoreChatViews(chatViews, snapshot.tasks) });
  }, [navigation, chatViews, snapshot.tasks, onViewState]);
  const view = navigation.view;
  const settingsView = view !== 'home' && view !== 'task';
  const [preview, setPreview] = useState(false);
  const [taskForm, setTaskForm] = useState<'new' | TaskDraft | null>(null);
  const [execution, setExecution] = useState<ExecutionSnapshot>(
    () => snapshot.execution || { config: emptyExecutionConfig(), runs: [] },
  );
  const [executionEvents, setExecutionEvents] = useState<RunEvent[]>([]);
  const [executionError, setExecutionError] = useState<AppError>();
  const historicalPage = useRef(false);
  const historyRequest = useRef(0);
  useEffect(() => {
    if (snapshot.execution) {
      setExecution(snapshot.execution);
    }
  }, [snapshot.execution]);
  useEffect(
    () =>
      bridge.onExecution?.((update) => {
        setExecution(update.state);
        if (historicalPage.current) {
          return;
        }
        setExecutionEvents((current) => {
          const combined = [...current];
          for (const event of update.events) {
            if (
              !combined.some(
                (item) => item.runId === event.runId && item.sequence === event.sequence,
              )
            ) {
              combined.push(event);
            }
          }
          return combined.slice(-80);
        });
      }),
    [bridge],
  );
  const execute = useCallback(
    async (action: ExecutionAction) => {
      setExecutionError(undefined);
      const request = action.kind === 'history' ? ++historyRequest.current : 0;
      if (action.kind === 'history') {
        historicalPage.current = action.before !== undefined;
      }
      try {
        if (!bridge.execute) {
          throw new OperationError('hostUnavailable');
        }
        const result = await bridge.execute(action);
        if (request && request !== historyRequest.current) {
          return result;
        }
        if (!['conversation', 'evidence'].includes(action.kind)) {
          setExecution(result.state);
        }
        if (result.events && request === historyRequest.current) {
          setExecutionEvents(result.events);
        }
        return result;
      } catch (error) {
        if (!request || request === historyRequest.current) {
          setExecutionError(toAppError(error));
        }
        throw error;
      }
    },
    [bridge],
  );
  const navigate = (next: Navigation) => {
    if (JSON.stringify(next) === JSON.stringify(navigation)) {
      return;
    }
    const taskRoute = (route: Navigation) =>
      route.view === 'home' || route.view === 'task' ? route : route.returnTo;
    if (JSON.stringify(taskRoute(next)) !== JSON.stringify(taskRoute(navigation))) {
      historyRequest.current++;
      historicalPage.current = false;
      setExecutionEvents([]);
      setExecutionError(undefined);
    }
    setNavigation(next);
  };
  const setView = (view: 'api' | 'defaults' | 'execution' | 'roles') => {
    setPreview(false);
    navigate({
      view,
      returnTo:
        navigation.view === 'home' || navigation.view === 'task' ? navigation : navigation.returnTo,
    });
  };
  const consumedNavigation = useRef<string | undefined>(undefined);
  useEffect(() => {
    const request = snapshot.navigationRequest;
    if (!request || consumedNavigation.current === request.id) {
      return;
    }
    consumedNavigation.current = request.id;
    setPreview(false);
    if (request.newTask) {
      setTaskForm('new');
    } else if (request.taskId) {
      setTaskForm(null);
      navigate(restoreNavigation({ view: 'task', taskId: request.taskId }, snapshot.tasks));
    }
    onNavigationHandled?.(request.id);
  }, [snapshot.navigationRequest?.id]);
  useEffect(() => {
    const restored = restoreNavigation(navigation, snapshot.tasks);
    if (JSON.stringify(restored) !== JSON.stringify(navigation)) {
      navigate(restored);
    }
  }, [snapshot.tasks, navigation]);

  const modelQueries = useModelQueries(bridge);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<{ key: MessageKey; error: boolean } | null>(null);
  const [languageTarget, setLanguageTarget] = useState<LanguageSetting | null>(null);
  const guard = useRef<LanguageGuard | null>(null);
  const pending = pendingCount > 0;
  const tr = (key: MessageKey) => t(snapshot.locale, key);
  useEffect(() => {
    if (!notice || notice.error) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    document.documentElement.lang = snapshot.locale;
  }, [snapshot.locale]);
  useEffect(() => {
    onNavigation?.(navigation);
  }, [navigation, onNavigation]);
  const run = async (action: Action, message: MessageKey | false = 'saved') => {
    setPendingCount((count) => count + 1);
    setNotice(null);
    if (action.kind !== 'language.set') {
      setExecutionError(undefined);
    }
    try {
      const next = await bridge.request(action);
      if (message) {
        setNotice({ key: message, error: false });
      }
      return next;
    } catch (error) {
      setExecutionError(toAppError(error));
      throw error;
    } finally {
      setPendingCount((count) => count - 1);
    }
  };
  const changeLanguage = (value: LanguageSetting) => {
    if (value === snapshot.language) {
      return;
    }
    if (guard.current) {
      setLanguageTarget(value);
    } else {
      void run({ kind: 'language.set', value }, false).catch(() => undefined);
    }
  };
  const finishLanguage = async (save: boolean) => {
    if (!languageTarget) {
      return;
    }
    if (save) {
      await guard.current?.save();
    } else {
      guard.current?.discard();
    }
    await run({ kind: 'language.set', value: languageTarget }, false);
    setLanguageTarget(null);
  };
  return (
    <UIContext.Provider
      value={{
        snapshot,
        execution,
        executionEvents,
        chatViews,
        updateChatView,
        execute,
        pending,
        ...modelQueries,
        run,
        registerLanguageGuard: (value) => {
          guard.current = value;
        },
      }}
    >
      <div className={`dm-app sidebar-workbench${settingsView ? ' settings-view' : ''}`}>
        <header className="app-header">
          {settingsView ? (
            <button onClick={() => navigate(navigation.returnTo)}>
              <Icon name="arrow" />
              {tr(navigation.returnTo.view === 'task' ? 'backToTask' : 'backToHome')}
            </button>
          ) : view === 'task' ? (
            <button onClick={() => navigate({ view: 'home' })}>
              <Icon name="arrow" />
              {tr('backToHome')}
            </button>
          ) : (
            <span className="sidebar-workspace" title={snapshot.workspaceName}>
              {snapshot.workspaceName || tr('noWorkspaceName')}
            </span>
          )}
          {!settingsView && (
            <button
              className="chat-icon-button"
              title={tr('settings')}
              aria-label={tr('settings')}
              onClick={() => setView('api')}
            >
              <Icon name="settings" />
            </button>
          )}
        </header>
        {executionError && (
          <div className="toast toast-error">
            <ErrorNotice error={executionError} locale={snapshot.locale} />
            <button
              className="icon-button"
              aria-label={tr('close')}
              onClick={() => setExecutionError(undefined)}
            >
              ×
            </button>
          </div>
        )}
        {notice && (
          <div
            className={`toast ${notice.error ? 'toast-error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
          >
            <span>{tr(notice.key)}</span>
            <button
              className="icon-button"
              aria-label={tr('close')}
              onClick={() => setNotice(null)}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        <div className="task-surface" hidden={settingsView} inert={settingsView ? true : undefined}>
          <Tasks
            visible={!settingsView}
            taskId={
              navigation.view === 'task'
                ? navigation.taskId
                : settingsView && navigation.returnTo.view === 'task'
                  ? navigation.returnTo.taskId
                  : undefined
            }
            preview={preview}
            onPreviewChange={setPreview}
            onSettings={() => setView('api')}
            onSelect={(id) => navigate({ view: 'task', taskId: id })}
            onNewTask={() => setTaskForm('new')}
            onEditTask={setTaskForm}
            onDeleted={(id) => {
              if (navigation.view === 'task' && navigation.taskId === id) {
                navigate({ view: 'home' });
              }
            }}
          />
        </div>
        {settingsView && (
          <>
            <div className="settings-navigation">
              <label className="language-control">
                {tr('language')}
                <select
                  aria-label={tr('language')}
                  value={snapshot.language}
                  disabled={pending}
                  onChange={(event) => changeLanguage(event.target.value as LanguageSetting)}
                >
                  <option value="auto">{tr('languageAuto')}</option>
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <select
                aria-label={tr('settingsCategory')}
                value={view}
                onChange={(event) =>
                  setView(event.target.value as 'api' | 'defaults' | 'execution' | 'roles')
                }
              >
                <option value="api">{tr('apiTab')}</option>
                <option value="defaults">{tr('defaults')}</option>
                <option value="execution">{tr('executionTab')}</option>
                <option value="roles">{tr('rolesTab')}</option>
              </select>
            </div>
            <div className="settings-content">
              {view === 'api' ? (
                <Connections />
              ) : view === 'defaults' ? (
                <Defaults />
              ) : view === 'execution' ? (
                <ExecutionSettings />
              ) : (
                <Roles />
              )}
            </div>
          </>
        )}
        {taskForm && (
          <TaskForm
            task={taskForm === 'new' ? undefined : taskForm}
            onClose={() => setTaskForm(null)}
            onSaved={(id) => {
              setTaskForm(null);
              navigate({ view: 'task', taskId: id });
            }}
          />
        )}
        {languageTarget && (
          <Dialog
            title={tr('unsavedTitle')}
            onClose={() => setLanguageTarget(null)}
            footer={
              <>
                <button disabled={pending} onClick={() => setLanguageTarget(null)}>
                  {tr('cancel')}
                </button>
                <button
                  disabled={pending}
                  onClick={() => {
                    void finishLanguage(false).catch(() => undefined);
                  }}
                >
                  {tr('discard')}
                </button>
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => {
                    void finishLanguage(true).catch(() => undefined);
                  }}
                >
                  {tr('save')}
                </button>
              </>
            }
          >
            <p>{tr('unsavedHint')}</p>
          </Dialog>
        )}
      </div>
    </UIContext.Provider>
  );
}
