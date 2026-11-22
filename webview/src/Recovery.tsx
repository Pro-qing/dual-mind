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
export function RecoveryNotice({ taskId }: { taskId: string }) {
  const { execution, snapshot, tr } = useUI();
  const run = execution.runs.find((item) => item.taskId === taskId);
  if (!run || !['failed', 'interrupted', 'recovering'].includes(run.status)) {
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
          restoring ? 'run_recovering' : run.status === 'failed' ? 'run_failed' : 'run_interrupted',
        )}
        {recovery &&
          ` · ${tr(recovery.agent ?? 'chatSystem')} · ${tr(recoveryPhase(recovery.phase))}`}
      </strong>
      {restoring ? (
        <p role="status">{tr(recoveryStep(recovery?.step))}</p>
      ) : (
        <>
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
