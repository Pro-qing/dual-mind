import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TaskDraft } from '../../src/shared/model';
import { terminalStatuses, type RunEvent, type TaskMessage } from '../../src/shared/execution';
import { toAppError, type AppError } from '../../src/shared/errors';
import { useUI } from './context';
import { ExecutionDetailView } from './RunDetail';
import { ExecutionEvidenceItem } from './Execution';
import { ErrorNotice } from './ErrorNotice';

function mergeMessages(current: TaskMessage[], incoming: TaskMessage[]) {
  const merged = new Map(current.map((m) => [m.id, m]));
  incoming.forEach((m) => merged.set(m.id, m));
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
}: {
  task: Pick<TaskDraft, 'id' | 'requirements' | 'createdAt'>;
  preview?: boolean;
}) {
  const { execution, execute, tr, snapshot } = useUI();
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [before, setBefore] = useState<string>();
  const [error, setError] = useState<AppError>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sendId = useRef<{ text: string; id: string } | undefined>(undefined);
  const [newMessages, setNewMessages] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);
  const historyInitialized = useRef(false);
  const [loading, setLoading] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1100);
  const [scope, setScope] = useState<{ runId?: string; through?: number }>({});
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [evidenceBefore, setEvidenceBefore] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const panel = useRef<HTMLElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const evidenceGeneration = useRef(0);
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
  useEffect(() => {
    setPanelOpen(!narrow);
  }, [narrow]);
  useEffect(() => {
    if (preview) {
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
      void execute({ kind: 'conversation', taskId: task.id })
        .then((result) => {
          if (cancelled || !result.conversation) {
            return;
          }
          setMessages((current) => mergeMessages(current, result.conversation!.messages));
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
  }, [execute, task.id, preview]);
  const lastMessage = messages.at(-1)?.id;
  useLayoutEffect(() => {
    const target = scroller.current;
    if (!target) {
      return;
    }
    if (anchor.current) {
      target.scrollTop = anchor.current.top + target.scrollHeight - anchor.current.height;
      anchor.current = undefined;
    } else if (following.current) {
      target.scrollTop = target.scrollHeight;
    } else {
      setNewMessages(true);
    }
  }, [lastMessage, messages.length]);
  const older = async () => {
    if (!before || loading) {
      return;
    }
    setLoading(true);
    try {
      const result = await execute({ kind: 'conversation', taskId: task.id, before });
      if (result.conversation) {
        if (scroller.current) {
          anchor.current = {
            height: scroller.current.scrollHeight,
            top: scroller.current.scrollTop,
          };
        }
        setMessages((current) => mergeMessages(current, result.conversation!.messages));
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
        const result = await execute({
          kind: 'evidence',
          taskId: task.id,
          ...scope,
          before: older,
        });
        if (request !== evidenceGeneration.current || !result.evidence) {
          return;
        }
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
    [execute, task.id, scope],
  );
  useEffect(() => {
    if (!panelOpen || preview) {
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
  }, [panelOpen, preview, loadEvidence]);
  useEffect(() => {
    if (locate && panelOpen && events.length) {
      panel.current
        ?.querySelector<HTMLElement>('.evidence-record:last-child')
        ?.scrollIntoView?.({ block: 'nearest' });
      setLocate(0);
    }
  }, [locate, events, panelOpen]);
  useEffect(() => {
    if (!panelOpen || !narrow) {
      return;
    }
    const previous = panelTrigger.current ?? (document.activeElement as HTMLElement | null);
    const target = panel.current!;
    target.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanelOpen(false);
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
      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, [narrow, panelOpen]);
  const openEvidence = (message?: TaskMessage) => {
    panelTrigger.current = document.activeElement as HTMLElement | null;
    const next = message ? { runId: message.runId, through: message.sequence } : {};
    if (scope.runId !== next.runId || scope.through !== next.through) {
      evidenceGeneration.current++;
      evidenceInitialized.current = false;
      setEvidenceBefore(undefined);
      setScope(next);
      setEvents([]);
    }
    setPanelOpen(true);
    setLocate((value) => value + 1);
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
      setText('');
      sendId.current = undefined;
      const result = await execute({ kind: 'conversation', taskId: task.id });
      if (result.conversation) {
        setMessages((current) => mergeMessages(current, result.conversation!.messages));
      }
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setSending(false);
    }
  };
  const pending = messages.filter((m) => m.role === 'user' && m.status !== 'handled');
  const title = (m: TaskMessage) => {
    const role =
      m.role === 'system' ? tr('chatSystem') : m.role === 'user' ? tr('chatYou') : tr(m.role);
    const kind =
      m.kind === 'plan'
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
  return (
    <section
      className={`task-chat ${panelOpen && !narrow ? 'with-evidence' : ''}`}
      aria-label={tr('chatTitle')}
    >
      <div className="chat-main" inert={narrow && panelOpen ? true : undefined}>
        <div className="chat-toolbar">
          <strong>{tr('chatTitle')}</strong>
          <button onClick={() => openEvidence()}>{tr('executionEvidence')}</button>
        </div>
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
          {!before && (
            <article className="chat-message user">
              <h3>
                {tr('chatYou')} · {tr('requirements')}
              </h3>
              <p className="chat-text">{task.requirements}</p>
            </article>
          )}
          {preview && (
            <>
              <article className="chat-message worker">
                <h3>Worker · {tr('workSubmission')}</h3>
                <p>{tr('sampleWorker')}</p>
              </article>
              <article className="chat-message reviewer">
                <h3>Reviewer · {tr('chatAcceptance')}</h3>
                <p>{tr('sampleReviewer')}</p>
              </article>
            </>
          )}
          {messages.map((m) => (
            <article key={m.id} className={`chat-message ${m.role}`} data-message-id={m.id}>
              <h3>
                {title(m)}{' '}
                <time dateTime={m.time}>
                  {Number.isFinite(Date.parse(m.time))
                    ? new Date(m.time).toLocaleTimeString(snapshot.locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </time>
              </h3>
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
              {m.kind === 'answer' && <span className="message-state">{tr('run_answered')}</span>}
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
              {m.fault && m.kind !== 'error' && (
                <ErrorNotice error={m.fault} locale={snapshot.locale} />
              )}
              {m.runId && (
                <button className="text-button" onClick={() => openEvidence(m)}>
                  {tr('chatViewEvidence')}
                </button>
              )}
            </article>
          ))}
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
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {pending.length > 0 && (
            <div className="chat-queue" role="status">
              {tr(active ? 'chatQueuedHint' : 'chatResumeHint')} ({pending.length})
              {!active && latest && (
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
            <button className="primary" disabled={preview || sending || !text.trim()}>
              {tr('chatSend')}
            </button>
          </div>
        </form>
      </div>
      {panelOpen && narrow && (
        <div className="evidence-backdrop" onClick={() => setPanelOpen(false)} aria-hidden="true" />
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
          <button aria-label={tr('close')} onClick={() => setPanelOpen(false)}>
            ×
          </button>
        </header>
        <div className="evidence-toolbar">
          <button onClick={() => openEvidence()}>{tr('chatAllEvidence')}</button>
        </div>
        <div className="evidence-list">
          {evidenceBefore && (
            <button onClick={() => void loadEvidence(evidenceBefore)}>{tr('olderHistory')}</button>
          )}
          {!events.length && <p className="hint">{tr('chatNoEvidence')}</p>}
          {events.map((e) => (
            <details
              className="evidence-record"
              key={eventId(e)}
              open={expanded.has(eventId(e))}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setExpanded((current) => {
                  const next = new Set(current);
                  if (open) {
                    next.add(eventId(e));
                  } else {
                    next.delete(eventId(e));
                  }
                  return next;
                });
              }}
            >
              <summary>
                {e.agent ? tr(e.agent) : tr('chatSystem')} ·{' '}
                {e.detail?.type === 'command'
                  ? e.detail.command.name
                  : tr(
                      e.kind === 'text'
                        ? 'chatProcess'
                        : e.kind === 'error'
                          ? 'chatError'
                          : 'chatTool',
                    )}{' '}
                <small>#{e.sequence}</small>
              </summary>
              <ExecutionEvidenceItem event={e} />
            </details>
          ))}
        </div>
      </aside>
    </section>
  );
}
