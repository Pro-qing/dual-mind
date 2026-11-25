import { RequestGroups } from './RequestGroups';
import { mergeRequests } from './requestGrouping';
import type { RequestSummary } from '../../src/shared/execution';
import { RecoveryNotice } from './Recovery';
import { ChatCard, ChatIconButton } from './ChatCard';
import { ChatActivity } from './ChatActivity';
import { Icon } from './components';
import { toggleId, type ChatView } from './chatViewState';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TaskDraft } from '../../src/shared/model';
import { terminalStatuses, type RunEvent, type TaskMessage } from '../../src/shared/execution';
import { toAppError, type AppError } from '../../src/shared/errors';
import { useUI } from './context';
import { ExecutionDetailView } from './RunDetail';
import { ExecutionEvidenceItem } from './Execution';
import { ErrorNotice } from './ErrorNotice';

function mergeMessages(
  current: TaskMessage[],
  incoming: TaskMessage[],
  requests: RequestSummary[] = [],
) {
  const merged = new Map(current.map((m) => [m.id, m]));
  incoming.forEach((m) => {
    const previous = merged.get(m.id);
    if (m.kind !== 'process' || !previous?.sequence || (m.sequence ?? 0) >= previous.sequence) {
      merged.set(m.id, m);
    }
  });
  const status = new Map(requests.map((request) => [request.id, request.status]));
  for (const [id, message] of merged) {
    const latestStatus = message.userRequestId && status.get(message.userRequestId);
    if (message.role === 'user' && latestStatus) {
      merged.set(id, {
        ...message,
        status: latestStatus === 'answered' ? 'handled' : latestStatus,
      });
    }
  }
  return [...merged.values()].sort((a, b) =>
    `${a.time}:${a.id}`.localeCompare(`${b.time}:${b.id}`),
  );
}
function eventId(event: RunEvent) {
  return `${event.runId}:${event.sequence}`;
}
export function TaskChat({
  task,
  preview = false,
  visible = true,
}: {
  task: Pick<TaskDraft, 'id' | 'requirements' | 'createdAt'>;
  preview?: boolean;
  visible?: boolean;
}) {
  const { execution, execute, tr, snapshot, chatViews, updateChatView, openDerived } = useUI();
  const cleaned =
    !preview && execution.artifacts?.find((entry) => entry.taskId === task.id && entry.cleaned);
  const sourceTask = snapshot.tasks.find((entry) => entry.id === task.id);
  const [previewView, setPreviewView] = useState<ChatView>({});
  const view = preview ? previewView : (chatViews[task.id] ?? {});
  const viewRef = useRef(view);
  viewRef.current = view;
  const updateView = useCallback(
    (patch: Partial<ChatView>) => {
      if (preview) {
        setPreviewView((current) => ({ ...current, ...patch }));
      } else {
        updateChatView(task.id, patch);
      }
    },
    [updateChatView, task.id, preview],
  );
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [evidenceRequests, setEvidenceRequests] = useState<RequestSummary[]>([]);
  const [before, setBefore] = useState<string>();
  const [error, setError] = useState<AppError>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sendId = useRef<{ text: string; id: string } | undefined>(undefined);
  const [newMessages, setNewMessages] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const anchor = useRef<
    { height: number; top: number; id?: string; offset?: number; prepend?: boolean } | undefined
  >(undefined);
  const historyInitialized = useRef(false);
  const [loading, setLoading] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  const panelMode = view.panel ?? (narrow ? 'closed' : 'open');
  const panelOpen = panelMode === 'open';
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const [totals, setTotals] = useState<{ records: number; errors: number; blockers?: number }>({
    records: view.seenRecords ?? 0,
    errors: view.seenErrors ?? 0,
  });
  const evidenceList = useRef<HTMLDivElement>(null);
  const evidenceTop = useRef(view.evidenceTop ?? 0);
  const toolbarTrigger = useRef<HTMLButtonElement>(null);
  const [scope, setScope] = useState<{ runId?: string; through?: number }>(view.scope ?? {});
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [evidenceBefore, setEvidenceBefore] = useState<string>();
  const expanded = new Set(view.expandedEvidence);
  const recordScroll = useRef(new Map<Element, number>());
  const panel = useRef<HTMLElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const evidenceGeneration = useRef(0);
  useEffect(
    () => () => {
      evidenceGeneration.current++;
    },
    [],
  );
  const evidenceInitialized = useRef(false);
  const [locate, setLocate] = useState(0);
  const active = execution.runs.find(
    (r) => r.taskId === task.id && !terminalStatuses.includes(r.status),
  );
  const latest = execution.runs.find((r) => r.taskId === task.id);
  const revision = `${execution.conversationVersion ?? 0}:${execution.runs
    .filter((r) => r.taskId === task.id)
    .map((r) => `${r.id}:${r.sequence}:${r.status}`)
    .join(',')}`;
  const latestRevision = useRef(revision);
  latestRevision.current = revision;
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const rememberAnchor = (force = false, prepend = false) => {
    const target = scroller.current;
    if (!target || (!force && following.current)) {
      return;
    }
    const top = target.getBoundingClientRect().top;
    const first = [...target.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      (item) => item.getBoundingClientRect().bottom > top,
    );
    anchor.current = {
      top: target.scrollTop,
      height: target.scrollHeight,
      prepend,
      ...(first
        ? { id: first.dataset.messageId, offset: first.getBoundingClientRect().top - top }
        : {}),
    };
  };
  const setPanelMode = (mode: 'open' | 'minimized' | 'closed', resetScroll = false) => {
    rememberAnchor(true);
    if (resetScroll) {
      evidenceTop.current = 0;
    } else if (evidenceList.current && panelOpen) {
      evidenceTop.current = evidenceList.current.scrollTop;
    }
    updateView({ panel: mode, evidenceTop: evidenceTop.current });
    if (mode !== 'open' && !narrow && panel.current?.contains(document.activeElement)) {
      toolbarTrigger.current?.focus();
    }
  };
  const changeMessage = (
    id: string,
    key: 'expandedMessages' | 'minimizedMessages',
    enabled: boolean,
  ) => {
    rememberAnchor(true);
    updateView({ [key]: toggleId(view[key], id, enabled) });
  };
  const messageSize = (id: string) => ({
    expanded: Boolean(view.expandedMessages?.includes(id)),
    minimized: Boolean(view.minimizedMessages?.includes(id)),
    onExpanded: (value: boolean) => changeMessage(id, 'expandedMessages', value),
    onMinimized: (value: boolean) => changeMessage(id, 'minimizedMessages', value),
  });
  useEffect(() => {
    if (preview || !visible) {
      return;
    }
    let cancelled = false,
      busy = false,
      seen = '';
    const timer = setInterval(() => {
      if (busy || seen === latestRevision.current) {
        return;
      }
      seen = latestRevision.current;
      busy = true;
      void execute({ kind: 'conversation', taskId: task.id, includeProcess: true })
        .then((result) => {
          if (cancelled || !result.conversation) {
            return;
          }
          rememberAnchor();
          setMessages((current) =>
            mergeMessages(current, result.conversation!.messages, result.conversation!.requests),
          );
          setRequests((current) => mergeRequests(current, result.conversation!.requests));
          if (!historyInitialized.current) {
            setBefore(result.conversation.before);
            historyInitialized.current = true;
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setError(toAppError(e));
          }
        })
        .finally(() => {
          busy = false;
        });
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [execute, task.id, preview, visible]);
  const contentVersion = messages
    .map((m) => `${m.id}:${m.sequence}:${m.text.length}:${m.status ?? ''}`)
    .join('|');
  const previousContent = useRef('');
  useLayoutEffect(() => {
    const target = scroller.current;
    if (!target || !visible) {
      return;
    }
    const saved = anchor.current;
    if (saved) {
      const element = saved.id
        ? [...target.querySelectorAll<HTMLElement>('[data-message-id]')].find(
            (item) => item.dataset.messageId === saved.id,
          )
        : undefined;
      target.scrollTop =
        element && saved.offset !== undefined
          ? target.scrollTop +
            element.getBoundingClientRect().top -
            target.getBoundingClientRect().top -
            saved.offset
          : saved.top + (saved.prepend ? target.scrollHeight - saved.height : 0);
      anchor.current = undefined;
    } else if (following.current) {
      target.scrollTop = target.scrollHeight;
    }
    if (
      !following.current &&
      previousContent.current &&
      previousContent.current !== contentVersion
    ) {
      setNewMessages(true);
    }
    previousContent.current = contentVersion;
  }, [
    contentVersion,
    visible,
    messages.length,
    view.expandedMessages,
    view.minimizedMessages,
    view.conversationGroups,
    panelMode,
    narrow,
  ]);
  useLayoutEffect(() => {
    if (!panelOpen) {
      return;
    }
    if (evidenceList.current) {
      evidenceList.current.scrollTop = evidenceTop.current;
    }
    for (const [element, top] of recordScroll.current) {
      if (element.isConnected) {
        element.scrollTop = top;
      }
    }
  }, [panelOpen, narrow, view.minimizedEvidence, events.length]);
  const older = async () => {
    if (!before || loading) {
      return;
    }
    setLoading(true);
    try {
      const result = await execute({
        kind: 'conversation',
        taskId: task.id,
        before,
        includeProcess: true,
      });
      if (result.conversation) {
        rememberAnchor(true, true);
        setMessages((current) =>
          mergeMessages(current, result.conversation!.messages, result.conversation!.requests),
        );
        setRequests((current) => mergeRequests(current, result.conversation!.requests));
        setBefore(result.conversation.before);
      }
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setLoading(false);
    }
  };
  const loadEvidence = useCallback(
    async (older?: string) => {
      const request = ++evidenceGeneration.current;
      try {
        const global = await execute({ kind: 'evidence', taskId: task.id });
        if (request !== evidenceGeneration.current) {
          return;
        }
        if (global.evidence) {
          setEvidenceRequests((current) => mergeRequests(current, global.evidence!.requests));
          const summary = global.evidence.summary ?? {
            records: global.evidence.events.length,
            errors: global.evidence.events.filter(
              (e) =>
                e.fault ||
                e.kind === 'error' ||
                (e.detail?.type === 'command' && !e.detail.command.ok),
            ).length,
          };
          setTotals(summary);
          if (panelOpenRef.current) {
            updateView({ seenRecords: summary.records, seenErrors: summary.errors });
          }
        }
        if (!panelOpenRef.current && !older) {
          return;
        }
        const result =
          scope.runId || older
            ? await execute({ kind: 'evidence', taskId: task.id, ...scope, before: older })
            : global;
        if (request !== evidenceGeneration.current || !result.evidence) {
          return;
        }
        setEvidenceRequests((current) => mergeRequests(current, result.evidence!.requests));
        setEvents((current) => {
          const merged = new Map(
            (older
              ? current
              : current.filter(
                  (e) =>
                    (!scope.runId || e.runId === scope.runId) &&
                    (!scope.through || e.sequence <= scope.through),
                )
            ).map((e) => [eventId(e), e]),
          );
          result.evidence!.events.forEach((e) => merged.set(eventId(e), e));
          return [...merged.values()].sort(
            (a, b) => a.time.localeCompare(b.time) || a.sequence - b.sequence,
          );
        });
        if (older || !evidenceInitialized.current) {
          setEvidenceBefore(result.evidence.before);
          evidenceInitialized.current = true;
        }
      } catch (e) {
        setError(toAppError(e));
      }
    },
    [execute, task.id, scope, updateView],
  );
  useEffect(() => {
    if (preview || !visible) {
      return;
    }
    let seen = '',
      busy = false;
    const timer = setInterval(() => {
      if (busy || seen === latestRevision.current) {
        return;
      }
      seen = latestRevision.current;
      busy = true;
      void loadEvidence().finally(() => {
        busy = false;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [panelOpen, preview, loadEvidence, visible]);
  useEffect(() => {
    if (locate && panelOpen && events.length) {
      panel.current
        ?.querySelector<HTMLElement>('.evidence-record:last-child')
        ?.scrollIntoView?.({ block: 'nearest' });
      setLocate(0);
    }
  }, [locate, events, panelOpen]);
  useEffect(() => {
    if (!visible || !panelOpen || !narrow) {
      return;
    }
    const previous = panelTrigger.current ?? (document.activeElement as HTMLElement | null);
    const target = panel.current!;
    target.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanelMode('closed');
      }
      if (event.key === 'Tab') {
        const items = [
          ...target.querySelectorAll<HTMLElement>(
            'button:not([disabled]), summary, [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || !target.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !target.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (
        previous?.isConnected &&
        !panel.current?.contains(previous) &&
        !previous.closest('[hidden]')
      ) {
        previous.focus();
      } else {
        toolbarTrigger.current?.focus();
      }
    };
  }, [narrow, panelOpen, visible]);
  const openEvidence = (message?: TaskMessage) => {
    panelTrigger.current = document.activeElement as HTMLElement | null;
    const next = message ? { runId: message.runId, through: message.sequence } : {};
    const changedScope = scope.runId !== next.runId || scope.through !== next.through;
    if (changedScope) {
      evidenceGeneration.current++;
      evidenceInitialized.current = false;
      setEvidenceBefore(undefined);
      setScope(next);
      updateView({ scope: next, evidenceTop: 0 });
      evidenceTop.current = 0;
      setEvents([]);
    }
    if (message) {
      const id = message.userRequestId ?? 'legacy';
      const role = message.role === 'user' ? 'reviewer' : message.role;
      updateView({
        evidenceGroups: {
          requests: { ...view.evidenceGroups?.requests, [id]: true },
          roles: { ...view.evidenceGroups?.roles, [JSON.stringify([id, role])]: true },
        },
      });
    }
    setPanelMode('open', changedScope);
    setLocate((value) => value + 1);
  };
  const restoreEvidence = () => {
    panelTrigger.current = document.activeElement as HTMLElement | null;
    setPanelMode('open');
  };
  const send = async () => {
    if (sending || !text.trim() || preview) {
      return;
    }
    if (sendId.current?.text !== text) {
      sendId.current = { text, id: crypto.randomUUID() };
    }
    const value = sendId.current;
    setSending(true);
    setError(undefined);
    try {
      await execute({
        kind: 'message.send',
        taskId: task.id,
        messageId: value.id,
        text: value.text,
      });
      setText((current) => (current === value.text ? '' : current));
      sendId.current = undefined;
      const result = await execute({ kind: 'conversation', taskId: task.id, includeProcess: true });
      if (result.conversation) {
        setMessages((current) =>
          mergeMessages(current, result.conversation!.messages, result.conversation!.requests),
        );
        setRequests((current) => mergeRequests(current, result.conversation!.requests));
      }
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setSending(false);
    }
  };
  const needsRecovery = latest && ['failed', 'interrupted', 'recovering'].includes(latest.status);
  const pending = messages.filter((m) => m.role === 'user' && m.status !== 'handled');
  const title = (m: TaskMessage) => {
    const role =
      m.role === 'system' ? tr('chatSystem') : m.role === 'user' ? tr('chatYou') : tr(m.role);
    const kind =
      m.kind === 'process'
        ? tr('chatPublicProcess')
        : m.kind === 'plan'
          ? tr('chatPlan')
          : m.kind === 'submission'
            ? tr('chatSubmission')
            : m.kind === 'review'
              ? tr('chatAcceptance')
              : m.kind === 'answer'
                ? tr('chatAnswer')
                : m.kind === 'legacy'
                  ? tr('chatLegacy')
                  : '';
    const version =
      m.detail?.type === 'plan'
        ? m.detail.plan.version
        : m.detail?.type === 'submission'
          ? m.detail.submission.planVersion
          : m.detail?.type === 'review'
            ? m.detail.review.planVersion
            : undefined;
    return `${role}${kind ? ` · ${kind}` : ''}${version ? ` · v${version}` : ''}`;
  };
  const newRecords = Math.max(0, totals.records - (view.seenRecords ?? 0));
  const badges = (
    <>
      {newRecords > 0 && (
        <span className="chat-count" aria-label={`${tr('chatNewRecords')}: ${newRecords}`}>
          {newRecords}
        </span>
      )}
      {totals.errors > 0 && (
        <span
          className="chat-error-badge"
          title={tr('historicalErrors')}
          aria-label={`${tr('chatError')}: ${totals.errors}`}
        >
          ! {totals.errors}
        </span>
      )}
    </>
  );
  return (
    <section
      className={`task-chat ${panelOpen && !narrow ? 'with-evidence' : panelMode === 'minimized' && !narrow ? 'with-evidence-rail' : ''}`}
      aria-label={tr('chatTitle')}
    >
      <div className="chat-main" inert={narrow && panelOpen ? true : undefined}>
        <div className="chat-toolbar">
          <strong>{tr('chatTitle')}</strong>
          <button
            ref={toolbarTrigger}
            onClick={() => (panelMode === 'minimized' ? restoreEvidence() : openEvidence())}
            aria-label={tr(panelMode === 'minimized' ? 'chatRestorePanel' : 'executionEvidence')}
          >
            {tr('executionEvidence')}
            {!panelOpen && badges}
          </button>
        </div>
        {!preview && <ChatActivity taskId={task.id} />}
        {!preview && <RecoveryNotice taskId={task.id} />}
        {!preview && latest?.submission && totals.blockers !== undefined && (
          <p
            className={totals.blockers ? 'acceptance-status warning-text' : 'acceptance-status'}
            role="status"
          >
            {totals.blockers
              ? `${tr('acceptanceBlockers')}: ${totals.blockers}`
              : tr('noAcceptanceBlockers')}
          </p>
        )}
        <div
          className="chat-messages"
          ref={scroller}
          tabIndex={0}
          aria-label={tr('chatTitle')}
          onScroll={() => {
            const el = scroller.current!;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (following.current) {
              setNewMessages(false);
            }
          }}
        >
          {before && (
            <button disabled={loading} onClick={() => void older()}>
              {tr('olderHistory')}
            </button>
          )}
          {!before && !messages.some((m) => m.userRequestId?.startsWith('initial:')) && (
            <ChatCard
              id="requirements"
              role="user"
              title={`${tr('chatYou')} · ${tr('requirements')}`}
              {...messageSize('requirements')}
            >
              <p className="chat-text">{task.requirements}</p>
            </ChatCard>
          )}
          {preview && (
            <>
              <ChatCard
                id="preview-worker"
                role="worker"
                title={`Worker · ${tr('workSubmission')}`}
                {...messageSize('preview-worker')}
              >
                <p>{tr('sampleWorker')}</p>
              </ChatCard>
              <ChatCard
                id="preview-reviewer"
                role="reviewer"
                title={`Reviewer · ${tr('chatAcceptance')}`}
                {...messageSize('preview-reviewer')}
              >
                <p>{tr('sampleReviewer')}</p>
              </ChatCard>
            </>
          )}
          <RequestGroups
            items={messages}
            requests={requests}
            renderRequest={(request) =>
              request.text &&
              (request.id.startsWith('initial:') ||
                !messages.some((m) => m.role === 'user' && m.userRequestId === request.id)) ? (
                <ChatCard
                  id={`requirements:${request.id}`}
                  role="user"
                  title={`${tr('chatYou')}${request.id.startsWith('initial:') ? ` · ${tr('requirements')}` : ''}`}
                  {...messageSize(`requirements:${request.id}`)}
                >
                  <p className="chat-text">{request.text}</p>
                </ChatCard>
              ) : null
            }
            activeRequestId={
              execution.activity?.taskId === task.id ? execution.activity.userRequestId : undefined
            }
            preferences={view.conversationGroups}
            onChange={(conversationGroups) => {
              rememberAnchor(true);
              updateView({ conversationGroups });
            }}
            renderItem={(m) => (
              <ChatCard
                key={m.id}
                id={m.id}
                role={`${m.role}${m.kind === 'process' ? ' process-message' : ''}`}
                title={title(m)}
                time={m.time}
                {...messageSize(m.id)}
                canMinimize={m.role === 'system'}
                error={m.kind === 'error' || Boolean(m.fault)}
                footer={
                  <>
                    {m.runId &&
                      m.kind !== 'answer' &&
                      execution.runs.some((r) => r.id === m.runId && r.kind !== 'conversation') && (
                        <small className="message-run">
                          {tr('chatRun')} #
                          {execution.runs
                            .filter((r) => r.taskId === task.id && r.kind !== 'conversation')
                            .reverse()
                            .findIndex((r) => r.id === m.runId) + 1}
                          {m.round ? ` · ${tr('chatRound')} ${m.round}` : ''}
                        </small>
                      )}
                    {m.kind === 'answer' && (
                      <span className="message-state">{tr('run_answered')}</span>
                    )}
                    {m.status && (
                      <span className="message-state">
                        {tr(
                          m.status === 'pending'
                            ? 'chatPending'
                            : m.status === 'processing'
                              ? 'chatProcessing'
                              : 'chatHandled',
                        )}
                      </span>
                    )}
                    {m.runId && (
                      <button className="text-button" onClick={() => openEvidence(m)}>
                        {tr('chatViewEvidence')}
                      </button>
                    )}
                  </>
                }
              >
                {m.detail ? (
                  <ExecutionDetailView detail={m.detail} compact />
                ) : m.kind === 'error' ? (
                  <ErrorNotice
                    error={toAppError(m.fault || m.text, 'legacyExecution')}
                    locale={snapshot.locale}
                  />
                ) : (
                  <p className="chat-text">{m.text}</p>
                )}
                {m.fault && m.kind !== 'error' && (
                  <ErrorNotice error={m.fault} locale={snapshot.locale} />
                )}
              </ChatCard>
            )}
          />
        </div>
        {newMessages && (
          <button
            className="new-messages"
            onClick={() => {
              following.current = true;
              if (scroller.current) {
                scroller.current.scrollTop = scroller.current.scrollHeight;
              }
              setNewMessages(false);
            }}
          >
            {tr('chatNewMessages')}
          </button>
        )}
        {cleaned ? (
          <div className="chat-composer archived-task">
            <p>{tr('artifactCleaned')}</p>
            <div className="button-row">
              <button
                onClick={() =>
                  openDerived({ kind: 'followup', taskId: task.id, source: sourceTask })
                }
              >
                {tr('artifactFollowup')}
              </button>
              {cleaned.snapshotId && (
                <button
                  onClick={() =>
                    openDerived({
                      kind: 'restore',
                      snapshotId: cleaned.snapshotId,
                      source: sourceTask,
                    })
                  }
                >
                  {tr('artifactRestore')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {pending.length > 0 && (
              <div className="chat-queue" role="status">
                {tr(
                  needsRecovery ? 'recoveryQueued' : active ? 'chatQueuedHint' : 'chatResumeHint',
                )}{' '}
                ({pending.length})
                {!active && latest && !needsRecovery && (
                  <button
                    type="button"
                    onClick={() =>
                      void execute({ kind: 'messages.resume', taskId: task.id }).catch((e) =>
                        setError(toAppError(e)),
                      )
                    }
                  >
                    {tr('chatResume')}
                  </button>
                )}
              </div>
            )}
            {error && <ErrorNotice error={error} locale={snapshot.locale} />}
            <label htmlFor="task-chat-input">{tr('chatInput')}</label>
            <textarea
              id="task-chat-input"
              rows={2}
              maxLength={50000}
              value={text}
              disabled={preview || sending}
              placeholder={tr('chatPlaceholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-actions">
              <span className="hint">
                {tr(
                  !latest
                    ? 'chatStartHint'
                    : active?.status === 'paused'
                      ? 'chatPausedHint'
                      : 'chatSendHint',
                )}
              </span>
              <button
                className="primary chat-send"
                aria-label={tr('chatSend')}
                title={tr('chatSend')}
                disabled={preview || sending || !text.trim()}
              >
                <Icon name="play" />
                <span>{tr('chatSend')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
      {panelOpen && narrow && (
        <div
          className="evidence-backdrop"
          onClick={() => setPanelMode('closed')}
          aria-hidden="true"
        />
      )}
      {panelMode === 'minimized' && !narrow && (
        <aside className="evidence-rail" aria-label={tr('executionEvidence')}>
          <button
            className="chat-icon-button"
            onClick={restoreEvidence}
            title={tr('chatRestorePanel')}
            aria-label={tr('chatRestorePanel')}
          >
            <Icon name="arrow" />
          </button>
          {badges}
        </aside>
      )}
      <aside
        ref={panel}
        hidden={!panelOpen}
        className={`evidence-panel ${narrow ? 'evidence-drawer' : ''}`}
        role={narrow ? 'dialog' : 'complementary'}
        aria-modal={narrow && panelOpen ? true : undefined}
        aria-label={tr('executionEvidence')}
      >
        <header>
          <div>
            <h2>{tr('executionEvidence')}</h2>
            <p className="hint">{tr(scope.runId ? 'chatEvidenceScope' : 'chatAllEvidence')}</p>
          </div>
          <div className="evidence-panel-actions">
            <button
              className="chat-icon-button"
              title={tr('chatMinimizePanel')}
              aria-label={tr('chatMinimizePanel')}
              onClick={() => setPanelMode('minimized')}
            >
              <Icon name="minimize" />
            </button>
            <button
              className="chat-icon-button"
              title={tr('close')}
              aria-label={tr('close')}
              onClick={() => setPanelMode('closed')}
            >
              <Icon name="close" />
            </button>
          </div>
        </header>
        <div className="evidence-toolbar">
          <button onClick={() => openEvidence()}>{tr('chatAllEvidence')}</button>
        </div>
        <div
          className="evidence-list"
          ref={evidenceList}
          onScroll={() => {
            if (panelOpen && evidenceList.current) {
              evidenceTop.current = evidenceList.current.scrollTop;
              updateView({ evidenceTop: Math.round(evidenceTop.current) });
            }
          }}
          onScrollCapture={(event) => {
            if (
              panelOpen &&
              event.target instanceof HTMLElement &&
              !event.target.closest('[hidden]')
            ) {
              recordScroll.current.set(event.target, event.target.scrollTop);
            }
          }}
        >
          {evidenceBefore && (
            <button onClick={() => void loadEvidence(evidenceBefore)}>{tr('olderHistory')}</button>
          )}
          {!events.length && <p className="hint">{tr('chatNoEvidence')}</p>}
          <RequestGroups
            items={events}
            requests={evidenceRequests}
            activeRequestId={
              execution.activity?.taskId === task.id ? execution.activity.userRequestId : undefined
            }
            preferences={view.evidenceGroups}
            onChange={(evidenceGroups) => updateView({ evidenceGroups })}
            renderItem={(e) => {
              const id = eventId(e),
                minimized = Boolean(view.minimizedEvidence?.includes(id));
              const failed = e.tool
                ? ['failed', 'rejected', 'unknown'].includes(e.tool.status)
                : Boolean(e.fault) ||
                  e.kind === 'error' ||
                  (e.detail?.type === 'command' && !e.detail.command.ok);
              return (
                <div className="evidence-item" key={id} data-minimized={minimized}>
                  <details
                    className="evidence-record"
                    open={expanded.has(id)}
                    onToggle={(event) => {
                      if (minimized) {
                        return;
                      }
                      const open = event.currentTarget.open;
                      updateView({
                        expandedEvidence: toggleId(viewRef.current.expandedEvidence, id, open),
                      });
                    }}
                  >
                    <summary
                      onClick={(event) => {
                        if (minimized) {
                          event.preventDefault();
                          updateView({
                            minimizedEvidence: toggleId(view.minimizedEvidence, id, false),
                          });
                        }
                      }}
                    >
                      {e.agent ? tr(e.agent) : tr('chatSystem')} ·{' '}
                      {e.detail?.type === 'command'
                        ? e.detail.command.name
                        : tr(
                            e.kind === 'plan'
                              ? 'chatPlan'
                              : e.kind === 'submission'
                                ? 'chatSubmission'
                                : e.kind === 'review'
                                  ? 'chatAcceptance'
                                  : e.kind === 'text'
                                    ? 'chatProcess'
                                    : e.kind === 'error'
                                      ? 'chatError'
                                      : 'chatTool',
                          )}{' '}
                      <small>#{e.sequence}</small>
                      {e.tool ? (
                        <span className={failed ? 'chat-error-badge' : 'chat-result-badge'}>
                          {tr(`outcome_${e.tool.status}`)}
                        </span>
                      ) : failed ? (
                        <span className="chat-error-badge">{tr('chatError')}</span>
                      ) : e.detail?.type === 'command' ? (
                        <span className="chat-result-badge">{tr('commandPassed')}</span>
                      ) : null}
                    </summary>
                    <div className="evidence-record-content" hidden={minimized}>
                      <ExecutionEvidenceItem event={e} />
                    </div>
                  </details>
                  <div className="record-actions">
                    <ChatIconButton
                      action={minimized ? 'restore' : 'minimize'}
                      expanded={!minimized}
                      onClick={() =>
                        updateView({
                          minimizedEvidence: toggleId(view.minimizedEvidence, id, !minimized),
                        })
                      }
                    />
                  </div>
                </div>
              );
            }}
          />
        </div>
      </aside>
    </section>
  );
}
