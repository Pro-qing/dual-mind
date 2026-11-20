import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useUI } from './context';
import type { MessageKey } from '../../src/shared/i18n';

export function ModelPicker({
  label,
  value,
  onChange,
  connectionId,
  connectionMode = false,
  blockedReason,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  connectionId: string;
  connectionMode?: boolean;
  blockedReason?: MessageKey;
}) {
  const { snapshot, models, queryModels, pending, tr } = useUI();
  const connection = snapshot.connections.find((c) => c.id === connectionId);
  const state = models[connectionId];
  const reason =
    blockedReason ||
    (!connection
      ? connectionId
        ? 'missingConnection'
        : connectionMode
          ? 'modelsSaveFirst'
          : 'selectConnection'
      : !connection.hasKey
        ? 'keyRequired'
        : undefined);
  const loading = state?.status === 'loading';
  const queryDisabled = pending || loading || Boolean(reason);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const suggestions = reason ? [] : state?.models || [];
  const choices = filtering
    ? suggestions.filter((model) => model.toLowerCase().includes(value.toLowerCase()))
    : suggestions;
  const show = () => {
    setOpen(true);
    setFiltering(false);
    setActive(-1);
  };
  const select = (model: string) => {
    // Focusing fires onFocus synchronously; close after it so selection stays closed.
    input.current?.focus();
    onChange(model);
    setOpen(false);
    setFiltering(false);
    setActive(-1);
  };
  useEffect(() => {
    setOpen(false);
    setFiltering(false);
    setActive(-1);
  }, [connectionId]);
  useEffect(() => {
    setActive(-1);
  }, [state]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const place = () => {
      const bounds = input.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      const dialog = input.current?.closest('.dialog-content')?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight - 10, dialog?.bottom ?? window.innerHeight - 10);
      const top = Math.max(10, dialog?.top ?? 10);
      const below = Math.max(0, bottom - bounds.bottom - 4);
      const above = Math.max(0, bounds.top - top - 4);
      const up = below < 160 && above > below;
      const height = Math.min(240, up ? above : below);
      const width = Math.min(bounds.width, window.innerWidth - 20);
      const left = Math.max(10, Math.min(bounds.left, window.innerWidth - width - 10));
      setPosition({
        left,
        width,
        maxHeight: Math.max(40, height),
        ...(up
          ? { bottom: window.innerHeight - bounds.top + 4, top: 'auto' }
          : { top: bounds.bottom + 4, bottom: 'auto' }),
      });
    };
    place();
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) {
        place();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [active, listId]);
  const status =
    reason ||
    (loading
      ? 'modelsLoading'
      : state?.status === 'error'
        ? state.error || 'modelsFailed'
        : state?.status === 'success'
          ? state.models.length
            ? 'modelsAccessible'
            : 'modelsEmpty'
          : 'modelsNotFetched');
  const feedback = (
    <div
      id={`${id}-status`}
      className={`model-query-status hint ${state?.status === 'error' ? 'warning-text' : ''}`}
      role={state?.status === 'error' && !reason ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span>{tr(status)}</span>
      {!reason && state?.status === 'success' && (
        <span className="model-query-meta">
          {state.models.length} {tr('modelsCount')} · {tr('modelsFetchedAt')}:{' '}
          {new Date(state.fetchedAt!).toLocaleString(snapshot.locale)}
        </span>
      )}
    </div>
  );
  return (
    <div
      className="model-picker"
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      {connectionMode && (
        <div className="model-query-actions">
          <button
            type="button"
            disabled={queryDisabled}
            onClick={() => {
              void queryModels(connectionId);
            }}
          >
            {tr('testConnection')}
          </button>
          <button
            type="button"
            disabled={queryDisabled}
            onClick={() => {
              void queryModels(connectionId);
            }}
          >
            {tr('refreshModels')}
          </button>
          {feedback}
        </div>
      )}
      <div className="model-picker-heading">
        <label htmlFor={id}>
          {label}
          {connectionMode && <span className="hint"> · {tr('optional')}</span>}
        </label>
        {!connectionMode && (
          <button
            type="button"
            className="model-refresh"
            disabled={queryDisabled}
            aria-label={`${label}: ${tr('refreshModels')}`}
            onClick={() => {
              void queryModels(connectionId);
            }}
          >
            {tr(state?.fetchedAt ? 'refreshModels' : 'fetchModels')}
          </button>
        )}
      </div>
      <div className="model-combobox">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={`${id}-status`}
          value={value}
          maxLength={500}
          placeholder={tr('modelSearch')}
          title={value || tr('modelSearch')}
          onFocus={show}
          onClick={() => {
            if (!open) {
              show();
            }
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setFiltering(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActive((old) =>
                choices.length
                  ? event.key === 'ArrowDown'
                    ? Math.min(old + 1, choices.length - 1)
                    : old < 0
                      ? choices.length - 1
                      : Math.max(old - 1, 0)
                  : -1,
              );
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active >= 0 && choices[active]) {
                select(choices[active]);
              } else {
                setOpen(false);
              }
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        <button
          type="button"
          className="model-toggle"
          tabIndex={-1}
          aria-label={`${label}: ${tr('modelToggle')}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              input.current?.focus();
              show();
            }
          }}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {open && (
        <div
          ref={menu}
          id={listId}
          role="listbox"
          aria-label={`${label}: ${tr('modelSuggestions')}`}
          className="model-options"
          style={position}
        >
          {choices.map((model, index) => (
            <div
              key={model}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={value === model}
              className={`model-option ${active === index ? 'active' : ''}`}
              title={model}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(model)}
            >
              <span className="model-option-id">{model}</span>
              <span aria-hidden="true" className="model-option-check">
                {value === model ? '✓' : ''}
              </span>
            </div>
          ))}
          {!choices.length && (
            <div className="model-no-options">
              {tr(suggestions.length ? 'modelNoMatch' : status)}
            </div>
          )}
        </div>
      )}
      {!connectionMode && feedback}
      {connectionMode && <p className="hint">{tr('modelManual')}</p>}
    </div>
  );
}
