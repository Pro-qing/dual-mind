import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from './components';
import { useUI } from './context';

export function ChatIconButton({
  action,
  onClick,
  expanded,
  controls,
}: {
  action: 'expand' | 'compact' | 'minimize' | 'restore';
  onClick(): void;
  expanded?: boolean;
  controls?: string;
}) {
  const { tr } = useUI();
  const label = tr(
    action === 'expand'
      ? 'chatExpand'
      : action === 'compact'
        ? 'chatCompact'
        : action === 'minimize'
          ? 'chatMinimize'
          : 'chatRestore',
  );
  return (
    <button
      type="button"
      className="chat-icon-button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <Icon name={action} />
    </button>
  );
}
export function ChatCard({
  id,
  role,
  title,
  time,
  children,
  footer,
  expanded,
  minimized,
  canMinimize,
  error,
  onExpanded,
  onMinimized,
}: {
  id: string;
  role: string;
  title: string;
  time?: string;
  children: ReactNode;
  footer?: ReactNode;
  expanded: boolean;
  minimized: boolean;
  canMinimize?: boolean;
  error?: boolean;
  onExpanded(value: boolean): void;
  onMinimized(value: boolean): void;
}) {
  const { tr, snapshot } = useUI();
  const bodyId = useId();
  const body = useRef<HTMLDivElement>(null);
  const scroll = useRef(0);
  const wasMinimized = useRef(minimized);
  useLayoutEffect(() => {
    if (!minimized && wasMinimized.current && body.current) {
      body.current.scrollTop = scroll.current;
    }
    wasMinimized.current = minimized;
  }, [minimized]);
  return (
    <article
      className={`chat-message ${role} ${minimized ? 'message-minimized' : ''}`}
      data-message-id={id}
      data-expanded={expanded}
      data-minimized={minimized}
    >
      <header className="chat-message-header">
        <h3>
          {title}
          {time && Number.isFinite(Date.parse(time)) && (
            <time dateTime={time}>
              {new Date(time).toLocaleTimeString(snapshot.locale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          )}
        </h3>
        {error && <span className="chat-error-badge">{tr('chatError')}</span>}
        <div className="chat-message-actions">
          {!minimized && (
            <ChatIconButton
              action={expanded ? 'compact' : 'expand'}
              expanded={expanded}
              controls={bodyId}
              onClick={() => onExpanded(!expanded)}
            />
          )}
          {canMinimize && (
            <ChatIconButton
              action={minimized ? 'restore' : 'minimize'}
              expanded={!minimized}
              controls={bodyId}
              onClick={() => onMinimized(!minimized)}
            />
          )}
        </div>
      </header>
      <div hidden={minimized}>
        <div
          id={bodyId}
          className={`chat-message-body ${expanded ? 'body-expanded' : ''}`}
          ref={body}
          tabIndex={0}
          aria-label={tr('chatMessageContent')}
          onScroll={() => {
            if (!minimized && body.current) {
              scroll.current = body.current.scrollTop;
            }
          }}
        >
          {children}
        </div>
        {footer}
      </div>
    </article>
  );
}
