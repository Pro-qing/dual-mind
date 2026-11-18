import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ConnectionSummary, ModelBinding } from '../../src/shared/model';
import { useUI } from './context';

export function Icon({
  name,
  className = '',
}: {
  name:
    | 'plus'
    | 'settings'
    | 'trash'
    | 'close'
    | 'arrow'
    | 'tasks'
    | 'edit'
    | 'play'
    | 'pause'
    | 'stop'
    | 'check';
  className?: string;
}) {
  const paths = {
    plus: 'M8 2v12M2 8h12',
    settings: 'M8 1v2m0 10v2M1 8h2m10 0h2M3 3l2 2m6 6 2 2M3 13l2-2m6-6 2-2M8 4a4 4 0 1 0 .01 0',
    trash: 'M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10M7 6v5m2-5v5',
    close: 'm3 3 10 10M13 3 3 13',
    arrow: 'm10 3-5 5 5 5',
    tasks: 'M2 2h12v12H2zM6 2v12',
    edit: 'm3 10 8-8 3 3-8 8-4 1z',
    play: 'm4 2 9 6-9 6z',
    pause: 'M5 3v10m6-10v10',
    stop: 'M3 3h10v10H3z',
    check: 'm2 8 4 4 8-9',
  };
  return (
    <svg
      className={`icon ${className}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Dialog({
  title,
  children,
  footer,
  onClose,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose(): void;
  danger?: boolean;
}) {
  const { tr, pending } = useUI();
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = ref.current;
    target
      ?.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
      )
      ?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab' && target) {
        const focusable = [
          ...target.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
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
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className={`dialog ${danger ? 'dialog-danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label={tr('close')}
            onClick={onClose}
            disabled={pending}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-content">{children}</div>
        <footer className="dialog-footer">{footer}</footer>
      </section>
    </div>
  );
}
export function Confirm({
  title,
  name,
  hint,
  actionLabel,
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string;
  name?: string;
  hint: string;
  actionLabel: string;
  onConfirm(): Promise<unknown>;
  onClose(): void;
  danger?: boolean;
}) {
  const { tr, pending } = useUI();
  return (
    <Dialog
      title={title}
      onClose={onClose}
      danger={danger}
      footer={
        <>
          <button onClick={onClose} disabled={pending}>
            {tr('cancel')}
          </button>
          <button
            className={danger ? 'danger' : 'primary'}
            onClick={() => {
              void onConfirm()
                .then(onClose)
                .catch(() => undefined);
            }}
            disabled={pending}
          >
            {actionLabel}
          </button>
        </>
      }
    >
      {name && <h3 className="break-text">{name}</h3>}
      <p>{hint}</p>
    </Dialog>
  );
}
export function ModelFields({
  agent,
  value,
  onChange,
  connections,
  disabled = false,
}: {
  agent: 'worker' | 'reviewer';
  value: ModelBinding;
  onChange(value: ModelBinding): void;
  connections: ConnectionSummary[];
  disabled?: boolean;
}) {
  const { tr } = useUI();
  const known = connections.some((c) => c.id === value.connectionId);
  return (
    <fieldset className={`model-fields ${agent}`} disabled={disabled}>
      <legend>{tr(agent)}</legend>
      <label>
        {tr('connection')}
        <select
          aria-label={`${tr(agent)} ${tr('connection')}`}
          value={value.connectionId}
          onChange={(event) => {
            const c = connections.find((item) => item.id === event.target.value);
            onChange({ connectionId: c?.id || '', model: c?.defaultModel || '' });
          }}
        >
          <option value="">{tr('selectConnection')}</option>
          {value.connectionId && !known && (
            <option value={value.connectionId}>{tr('missingConnection')}</option>
          )}
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr('modelId')}
        <input
          aria-label={`${tr(agent)} ${tr('modelId')}`}
          value={value.model}
          maxLength={500}
          onChange={(event) => onChange({ ...value, model: event.target.value })}
        />
      </label>
    </fieldset>
  );
}
