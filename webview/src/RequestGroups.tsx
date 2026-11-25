import { Fragment, useId, useRef, type ReactNode } from 'react';
import type { RequestSummary } from '../../src/shared/execution';
import type { GroupView } from '../../src/shared/viewState';
import { useUI } from './context';
import { Icon } from './components';
import {
  earlierRequest,
  failedRecord,
  groupRequests,
  recordRole,
  type GroupRecord,
} from './requestGrouping';

export function RequestGroups<T extends GroupRecord>({
  items,
  requests,
  preferences,
  onChange,
  renderItem,
  activeRequestId,
  renderRequest,
}: {
  items: T[];
  requests: RequestSummary[];
  preferences?: GroupView;
  onChange(value: GroupView): void;
  renderItem(item: T): ReactNode;
  activeRequestId?: string;
  renderRequest?(request: RequestSummary): ReactNode;
}) {
  const { tr, snapshot, execution } = useUI();
  const prefix = useId();
  const groups = groupRequests(items, requests);
  const defaultId = groups.some((group) => group.id === activeRequestId)
    ? activeRequestId
    : groups.at(-1)?.id;
  // Remember initial defaults so streaming and new pages never close a reader's open group.
  const defaults = useRef(new Map<string, boolean>());
  for (const group of groups) {
    if (!defaults.current.has(group.id)) {
      defaults.current.set(group.id, group.id === defaultId);
    }
  }
  const changed = (kind: 'requests' | 'roles', id: string, open: boolean) => {
    onChange({ ...preferences, [kind]: { ...preferences?.[kind], [id]: open } });
  };
  const all = (open: boolean) => {
    const next = { requests: { ...preferences?.requests }, roles: { ...preferences?.roles } };
    for (const group of groups) {
      next.requests[group.id] = open;
      for (const role of ['reviewer', 'worker', 'system']) {
        next.roles[JSON.stringify([group.id, role])] = open;
      }
    }
    onChange(next);
  };
  if (!groups.length) {
    return null;
  }
  return (
    <div className="request-groups">
      <div className="request-group-actions">
        <button className="text-button" onClick={() => all(true)}>
          {tr('requestExpandAll')}
        </button>
        <button className="text-button" onClick={() => all(false)}>
          {tr('requestCollapseAll')}
        </button>
      </div>
      {groups.map((group, index) => {
        const request = group.request;
        const user = group.items.find((item) => recordRole(item) === 'user');
        const title =
          group.id === earlierRequest
            ? tr('requestEarlier')
            : (request?.text ??
              user?.text ??
              tr(group.id.startsWith('initial:') ? 'requestInitial' : 'requestUnavailable'));
        const open = preferences?.requests?.[group.id] ?? defaults.current.get(group.id)!;
        const contentId = `${prefix}-request-${index}`;
        const errors = group.items.filter(failedRecord).length;
        const run = execution.runs.find((entry) => entry.id === request?.runId);
        const status =
          request?.status === 'answered'
            ? tr('run_answered')
            : request?.status
              ? tr(
                  request.status === 'pending'
                    ? 'chatPending'
                    : request.status === 'processing'
                      ? 'chatProcessing'
                      : 'chatHandled',
                )
              : undefined;
        const runStatus = run?.status ?? request?.runStatus;
        const showRun = group.id.startsWith('initial:') || group.id === activeRequestId;
        return (
          <section key={group.id} className="request-group" data-request-id={group.id}>
            <button
              className="request-heading"
              aria-expanded={open}
              aria-controls={contentId}
              title={title}
              onClick={() => changed('requests', group.id, !open)}
            >
              <span className="group-chevron" data-open={open}>
                <Icon name="arrow" />
              </span>
              <span className="request-heading-text">{title}</span>
              <span className="request-heading-meta">
                {status && (
                  <span
                    title={request?.status === 'handled' ? tr('requestProcessedHint') : undefined}
                  >
                    {status}
                  </span>
                )}
                {showRun && runStatus && (
                  <span>
                    {tr('requestRunStatus')}: {tr(`run_${runStatus}`)}
                  </span>
                )}
                <span>
                  {group.items.length} {tr('requestRecords')}
                </span>
                {errors > 0 && (
                  <span className="chat-error-badge">
                    {tr('chatError')}: {errors}
                  </span>
                )}
              </span>
            </button>
            <div id={contentId} hidden={!open} className="request-content">
              {Number.isFinite(Date.parse(group.time)) && (
                <time className="hint" dateTime={group.time}>
                  {new Date(group.time).toLocaleString(snapshot.locale)}
                </time>
              )}
              {request && renderRequest?.(request)}
              {group.items
                .filter((item) => recordRole(item) === 'user')
                .map((item) => (
                  <Fragment key={'id' in item ? item.id : `${item.runId}:${item.sequence}`}>
                    {renderItem(item)}
                  </Fragment>
                ))}
              {(['reviewer', 'worker', 'system'] as const).map((role) => {
                const records = group.items.filter((item) => recordRole(item) === role);
                if (!records.length) {
                  return null;
                }
                const key = JSON.stringify([group.id, role]);
                const expanded = preferences?.roles?.[key] ?? true;
                const roleId = `${contentId}-${role}`;
                const failures = records.filter(failedRecord).length;
                return (
                  <section key={role} className={`request-role ${role}`}>
                    <button
                      className="request-role-heading"
                      aria-expanded={expanded}
                      aria-controls={roleId}
                      onClick={() => changed('roles', key, !expanded)}
                    >
                      <span className="group-chevron" data-open={expanded}>
                        <Icon name="arrow" />
                      </span>
                      <strong>{tr(role === 'system' ? 'chatSystem' : role)}</strong>
                      <span>
                        {records.length} {tr('requestRecords')}
                      </span>
                      {failures > 0 && (
                        <span className="chat-error-badge">
                          {tr('chatError')}: {failures}
                        </span>
                      )}
                    </button>
                    <div id={roleId} hidden={!expanded} className="request-role-content">
                      {records.map((item, i) => (
                        <Fragment
                          key={'id' in item ? item.id : `${item.runId}:${item.sequence}:${i}`}
                        >
                          {renderItem(item)}
                        </Fragment>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
