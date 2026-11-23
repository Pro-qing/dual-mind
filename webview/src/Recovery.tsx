import { useEffect, useId, useRef, useState } from 'react';
import { formatError, toAppError } from '../../src/shared/errors';
import { terminalStatuses, type RunSummary } from '../../src/shared/execution';
import type { MessageKey } from '../../src/shared/i18n';
import { useUI } from './context';
import { ErrorNotice } from './ErrorNotice';

export function recoveryPhase(phase?: string): MessageKey {
  const phases: Record<string, MessageKey> = {
    planning: 'recoveryPhasePlanning',
    worker: 'recoveryPhaseWorker',
    reviewer: 'recoveryPhaseReviewer',
    reviewResult: 'recoveryPhaseReviewer',
    completed: 'recoveryPhaseReviewer',
    answering: 'recoveryPhaseAnswering',
    preparing: 'recoveryPhasePreparing',
    checking: 'recoveryPhaseChecking',
  };
  return phases[phase ?? ''] ?? 'recoveryPhaseUnknown';
}
export function recoveryStep(step?: NonNullable<RunSummary['recovery']>['step']): MessageKey {
  return step === 'processes'
    ? 'recoveryProcesses'
    : step === 'workspace'
      ? 'recoveryWorkspace'
      : step === 'environment'
        ? 'recoveryEnvironment'
        : step === 'artifacts'
          ? 'recoveryArtifacts'
          : 'recoveryPreparing';
}
export function canResume(run?: RunSummary, latestId?: string, activeId?: string) {
  return Boolean(
    run &&
    run.id === latestId &&
    (!activeId || activeId === run.id) &&
    (run.status === 'paused' ||
      (['failed', 'interrupted'].includes(run.status) && run.recovery?.available)),
  );
}
export function recoveryNoticeId(taskId: string) {
  return `recovery-${taskId}`;
}
function ToolPauseFeedback({ run }: { run: RunSummary }) {
  const { execute, tr } = useUI();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const id = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const send = async () => {
    if (lock.current || !text.trim() || run.status !== 'paused') {
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await execute({ kind: 'feedback', runId: run.id, text });
      if (alive.current) {
        setText('');
      }
    } catch {
      // Keep the draft; the host error is displayed by App.
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  return (
    <div className="form-stack">
      <label htmlFor={id}>{tr('feedback')}</label>
      <textarea
        id={id}
        rows={2}
        maxLength={8000}
        value={text}
        disabled={busy || run.status !== 'paused'}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        disabled={busy || run.status !== 'paused' || !text.trim()}
        onClick={() => void send()}
      >
        {tr('sendFeedback')}
      </button>
    </div>
  );
}
export function RecoveryNotice({ taskId }: { taskId: string }) {
  const { execution, snapshot, tr } = useUI();
  const run = execution.runs.find((item) => item.taskId === taskId);
  if (!run || (!run.toolPause && !['failed', 'interrupted', 'recovering'].includes(run.status))) {
    return null;
  }
  const recovery = run.recovery;
  const restoring = run.status === 'recovering';
  const fault = run.fault || (run.error ? toAppError(run.error, 'legacyExecution') : undefined);
  const blocked = recovery?.blocked;
  const processBlocked = [fault?.code, blocked?.code].some(
    (code) => code === 'recoveryProcessUnknown' || code === 'shutdownUnconfirmed',
  );
  const other = execution.runs.some(
    (item) => item.id !== run.id && !terminalStatuses.includes(item.status),
  );
  const operation = recovery?.operation;
  const operationKey =
    operation === 'model'
      ? 'recoveryModel'
      : operation === 'workspace'
        ? 'recoveryWorkspace'
        : operation === 'environment'
          ? 'recoveryEnvironment'
          : operation === 'run_command'
            ? 'recoveryCommand'
            : 'recoveryTool';
  return (
    <section
      id={recoveryNoticeId(taskId)}
      className="recovery-notice"
      data-restoring={restoring}
      aria-label={tr('recoveryTitle')}
    >
      <strong>
        {tr(
          run.toolPause
            ? 'repeatedPause'
            : restoring
              ? 'run_recovering'
              : run.status === 'failed'
                ? 'run_failed'
                : 'run_interrupted',
        )}
        {recovery &&
          ` · ${tr(recovery.agent ?? 'chatSystem')} · ${tr(recoveryPhase(recovery.phase))}`}
      </strong>
      {restoring ? (
        <p role="status">{tr(recoveryStep(recovery?.step))}</p>
      ) : (
        <>
          {run.toolPause && (
            <p>
              {tr('repeatedPauseHint')} {run.toolPause.tool} · {run.toolPause.count}
            </p>
          )}
          {fault && <ErrorNotice error={fault} locale={snapshot.locale} />}
          {blocked &&
            (!fault ||
              formatError(snapshot.locale, blocked) !== formatError(snapshot.locale, fault)) && (
              <ErrorNotice error={blocked} locale={snapshot.locale} />
            )}
          <p>
            {tr(
              recovery?.available
                ? processBlocked
                  ? 'recoveryBlocked'
                  : 'recoveryHint'
                : 'recoveryUnavailableHint',
            )}
          </p>
          {!recovery && <p className="hint">{tr('recoveryLegacy')}</p>}
          {recovery && !recovery.available && !blocked && (
            <p className="hint">{tr('recoveryLegacy')}</p>
          )}
          {other && <p className="hint">{tr('otherTaskActive')}</p>}
          {run.toolPause && <ToolPauseFeedback key={run.id} run={run} />}
        </>
      )}
      {recovery && (
        <p className="recovery-position">
          {tr('recoverySaved')}: {tr(recovery.agent ?? 'chatSystem')} ·{' '}
          {tr(recoveryPhase(recovery.phase))}
          {operation && ` · ${tr('recoveryOperation')}: ${tr(operationKey)}`}
          {` · ${tr('recoveryAttempts')}: ${recovery.attempts}`}
        </p>
      )}
    </section>
  );
}
