import { useEffect, useState } from 'react';
import { terminalStatuses } from '../../src/shared/execution';
import { useUI } from './context';
import { statusKey } from './Execution';
import { recoveryStep } from './Recovery';

export function ChatActivity({ taskId }: { taskId: string }) {
  const { execution, tr } = useUI();
  const run = execution.runs.find((run) => run.taskId === taskId);
  const activity =
    run && execution.activity?.runId === run.id && execution.activity.taskId === taskId
      ? execution.activity
      : undefined;
  const busy =
    run &&
    !terminalStatuses.includes(run.status) &&
    !['paused', 'pausing', 'stopping'].includes(run.status);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!activity || !busy) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity?.id, busy]);
  if (!run) {
    return null;
  }
  const retry = busy ? activity?.retry : undefined;
  const remaining = retry?.retryAt
    ? Math.max(0, Math.ceil((Date.parse(retry.retryAt) - now) / 1000))
    : undefined;
  const waiting = retry && !retry.requesting;
  const stage =
    run.status === 'recovering'
      ? tr(recoveryStep(run.recovery?.step))
      : activity && busy
        ? waiting
          ? tr(remaining === 0 ? 'retryStarting' : 'retryWaiting')
          : tr(
              activity.stage === 'waiting'
                ? 'chatWaiting'
                : activity.stage === 'receiving'
                  ? 'chatReceiving'
                  : activity.stage === 'command'
                    ? 'chatRunningCommand'
                    : 'chatRunningTool',
            )
        : tr(statusKey(run.status));
  const seconds = Math.max(0, Math.floor((now - Date.parse(activity?.startedAt ?? '')) / 1000));
  const elapsed = Number.isFinite(seconds)
    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : '00:00';
  return (
    <div
      className="chat-activity"
      aria-label={tr('chatActivity')}
      data-active={Boolean(activity && busy)}
    >
      <span className="activity-description" aria-live="polite">
        {activity && busy && <span className="activity-spinner" aria-hidden="true" />}
        {activity && busy ? `${tr(activity.agent)} · ${tr(statusKey(activity.phase))} · ` : ''}
        {stage}
        {retry && ` · ${tr('retryRequest')} ${retry.attempt}/3`}
        {activity && busy && (activity.label || activity.tool)
          ? `: ${activity.label || activity.tool}`
          : ''}
      </span>
      {waiting && remaining !== undefined && remaining > 0 && (
        <span className="activity-time retry-countdown" aria-label={tr('retryRemaining')}>
          {remaining}s
        </span>
      )}
      {activity && busy && (
        <span className="activity-time" aria-label={tr('chatElapsed')}>
          {elapsed}
        </span>
      )}
    </div>
  );
}
