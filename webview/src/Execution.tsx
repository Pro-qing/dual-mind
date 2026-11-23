import { ExecutionDetailView } from './RunDetail';
import { toAppError } from '../../src/shared/errors';
import { ErrorNotice } from './ErrorNotice';
import { useRef, useState } from 'react';
import { Icon } from './components';
import { canResume, recoveryNoticeId } from './Recovery';
import {
  terminalStatuses,
  type ExecutionConfig,
  type PresetCommand,
  type RunSummary,
  type RunEvent,
  type RunStatus,
} from '../../src/shared/execution';
import { useUI } from './context';
export function statusKey(status: RunStatus) {
  return `run_${status}` as const;
}
export function ExecutionEvidenceItem({ event }: { event: RunEvent }) {
  const { snapshot, tr } = useUI();
  let fault = event.fault ? toAppError(event.fault) : undefined;
  if (!fault && event.kind === 'error') {
    fault = toAppError(event.text, 'legacyExecution');
  }
  if (!fault && event.kind === 'tool') {
    try {
      const old = JSON.parse(event.text) as { result?: { error?: unknown } } | null;
      if (typeof old?.result?.error === 'string') {
        fault = toAppError(old.result.error, 'legacyExecution');
      }
    } catch {
      /* Tool names and chunked output are also valid event text. */
    }
  }
  if (event.tool) {
    const tool = event.tool;
    return (
      <section className="tool-outcome" data-outcome={tool.status}>
        <strong>
          {tool.tool} · {tr(`outcome_${tool.status}`)}
        </strong>
        <p>
          {tr('callExecution')}: {tr(`execution_${tool.execution}`)}
        </p>
        {tool.causedBy && (
          <small>
            {tr('toolCausedBy')}: {tool.causedBy}
          </small>
        )}
        {event.detail ? (
          <ExecutionDetailView detail={event.detail} />
        ) : (
          tool.fault && <ErrorNotice error={tool.fault} locale={snapshot.locale} />
        )}
        <details>
          <summary>{tr('chatRawOutput')}</summary>
          <pre>{event.text}</pre>
          <small>
            {tr('toolOperation')}: {tool.operationId}
          </small>
        </details>
      </section>
    );
  }
  if (event.detail) {
    return (
      <div className="execution-detail">
        <ExecutionDetailView detail={event.detail} />
        {event.detail.type === 'command' && (
          <details className="command-output">
            <summary>{tr('chatRawOutput')}</summary>
            <pre>{event.text}</pre>
          </details>
        )}
      </div>
    );
  }
  if (fault) {
    return (
      <ErrorNotice
        error={
          event.kind === 'check' || event.kind === 'tool'
            ? { ...fault, details: event.text }
            : fault
        }
        locale={snapshot.locale}
      />
    );
  }
  return (
    <pre>
      {event.kind}: {event.text}
    </pre>
  );
}
export function ExecutionSettings() {
  const { execution, execute, tr, snapshot } = useUI();
  const [config, setConfig] = useState<ExecutionConfig>(() => structuredClone(execution.config));
  const [busy, setBusy] = useState(false);
  const enabled =
    config.customCommandsEnabled ?? Boolean(config.prepare.length || config.checks.length);
  const group = (key: 'prepare' | 'checks') => (
    <section className="command-group">
      <h3>{tr(key === 'prepare' ? 'prepareCommands' : 'checkCommands')}</h3>
      {config[key].map((command, index) => {
        const change = (patch: Partial<PresetCommand>) =>
          setConfig((current) => ({
            ...current,
            [key]: current[key].map((item) =>
              item.id === command.id ? { ...item, ...patch } : item,
            ),
          }));
        return (
          <fieldset className="command-preset" key={command.id}>
            <legend>
              {tr('commandPreset')} {index + 1}
            </legend>
            <label>
              {tr('commandName')}
              <input
                value={command.name}
                maxLength={200}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label>
              {tr('commandProgram')}
              <input
                value={command.program}
                maxLength={2048}
                placeholder="npm"
                onChange={(e) => change({ program: e.target.value })}
              />
            </label>
            <label>
              {tr('commandArgs')}
              <textarea
                rows={3}
                value={command.args.join('\n')}
                placeholder={'run\ncheck'}
                onChange={(e) => change({ args: e.target.value ? e.target.value.split('\n') : [] })}
              />
            </label>
            <label>
              {tr('commandTimeout')}
              <input
                type="number"
                min={10}
                max={900}
                value={command.timeoutSeconds}
                onChange={(e) => change({ timeoutSeconds: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setConfig((current) => ({
                  ...current,
                  [key]: current[key].filter((item) => item.id !== command.id),
                }))
              }
            >
              {tr('removeCommand')}
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={config[key].length >= 20}
        onClick={() =>
          setConfig((current) => ({
            ...current,
            [key]: [
              ...current[key],
              { id: crypto.randomUUID(), name: '', program: '', args: [], timeoutSeconds: 180 },
            ],
          }))
        }
      >
        {tr(key === 'prepare' ? 'addPrepare' : 'addCheck')}
      </button>
    </section>
  );
  return (
    <section className="settings-main">
      <header className="section-heading">
        <div>
          <h2>{tr('executionTab')}</h2>
          <p>{tr('executionSettingsHint')}</p>
        </div>
      </header>
      <p className="hint">{tr('commandLimits')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void execute({ kind: 'config.save', config })
            .finally(() => setBusy(false))
            .catch(() => undefined);
        }}
      >
        <fieldset disabled={busy || !snapshot.hasWorkspace} className="execution-config-fields">
          <div className="execution-flow">
            <h3>{tr('automaticCollaboration')}</h3>
            <p>{tr('executionCycle')}</p>
            <p>{tr('executionCycleHint')}</p>
          </div>
          <details className="advanced-execution">
            <summary>{tr('advancedSettings')}</summary>
            <label className="command-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    customCommandsEnabled: event.target.checked,
                  }))
                }
              />
              {tr('enableCustomCommands')}
            </label>
            <p className="hint">{tr('customCommandsHint')}</p>
            {enabled && (
              <>
                {group('prepare')}
                {group('checks')}
              </>
            )}
          </details>
          <div className="form-actions">
            <button className="primary">{tr('saveExecution')}</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
export function ExecutionControls({
  taskId,
  run,
  mode = 'controls',
  onSettings,
}: {
  taskId: string;
  run?: RunSummary;
  mode?: 'controls' | 'details';
  onSettings?(): void;
}) {
  const { execution, execute, tr, executionEvents, snapshot } = useUI();
  const task = snapshot.tasks.find((item) => item.id === taskId);
  const missing = task
    ? (['worker', 'reviewer'] as const).flatMap((agent) => {
        const binding = task[agent];
        const connection = snapshot.connections.find((c) => c.id === binding.connectionId);
        const items = [];
        if (!connection) {
          items.push(tr('missingConnection'));
        } else if (!connection.hasKey) {
          items.push(tr('missingKey'));
        }
        if (!binding.model) {
          items.push(tr('missingModel'));
        }
        return items.map((text) => `${tr(agent)}: ${text}`);
      })
    : [];
  const configured = Boolean(task && !missing.length);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const active = execution.runs.find((item) => !terminalStatuses.includes(item.status));
  const running = run && !terminalStatuses.includes(run.status);
  const latest = execution.runs.find((item) => item.taskId === taskId);
  const resumable = canResume(run, latest?.id, active?.id);
  const recovering = run?.status === 'recovering';
  const awaitingRecovery =
    run && (Boolean(run.toolPause) || ['failed', 'interrupted'].includes(run.status));
  const pendingActions = useRef(new Set<string>());
  const call = (action: Parameters<typeof execute>[0]) => {
    if (pendingActions.current.has(action.kind)) {
      return;
    }
    pendingActions.current.add(action.kind);
    setBusy(true);
    void execute(action)
      .finally(() => {
        pendingActions.current.delete(action.kind);
        setBusy(pendingActions.current.size > 0);
      })
      .catch(() => undefined);
  };
  const events = executionEvents.filter((event) => event.runId === run?.id);
  return (
    <section className="execution-panel" aria-label={tr('executionTab')}>
      {mode === 'controls' && (
        <>
          <div className="button-row">
            {(run?.status === 'paused' || awaitingRecovery || recovering) && (
              <button
                className={resumable || recovering ? 'primary' : undefined}
                disabled={busy || !resumable || (run?.status !== 'paused' && !configured)}
                aria-describedby={
                  awaitingRecovery || recovering ? recoveryNoticeId(taskId) : undefined
                }
                onClick={() => call({ kind: 'resume', runId: run!.id })}
              >
                <Icon name="play" />
                {tr('resumeRun')}
              </button>
            )}
            {!running && (
              <button
                className={resumable || recovering ? undefined : 'primary'}
                disabled={busy || Boolean(active) || !configured}
                onClick={() => call({ kind: run ? 'restart' : 'start', taskId })}
              >
                {tr(run ? 'restartRun' : 'start')}
              </button>
            )}
            {running && run.status !== 'paused' && (
              <button
                disabled={
                  busy ||
                  !running ||
                  ![
                    'answering',
                    'planning',
                    'preparing',
                    'worker',
                    'checking',
                    'reviewer',
                  ].includes(run!.status)
                }
                onClick={() => call({ kind: 'pause', runId: run!.id })}
              >
                <Icon name="pause" />
                {tr('pause')}
              </button>
            )}
            {running && (
              <button
                disabled={(busy && !recovering) || !running || run?.status === 'stopping'}
                onClick={() => call({ kind: 'stop', runId: run!.id })}
              >
                <Icon name="stop" />
                {tr('stop')}
              </button>
            )}
            {run && (
              <span role="status">
                {tr(statusKey(run.status))} · {run.round}/{run.maxRounds}
              </span>
            )}
          </div>
          {missing.length > 0 && (
            <div className="execution-prerequisites">
              {missing.map((text) => (
                <p className="hint" key={text}>
                  {text}
                </p>
              ))}
              {onSettings && (
                <button className="text-button" onClick={onSettings}>
                  {tr('openSettings')}
                </button>
              )}
            </div>
          )}
          {active && active.taskId !== taskId && <p className="hint">{tr('otherTaskActive')}</p>}
          {!awaitingRecovery && (run?.fault || run?.error) && (
            <ErrorNotice
              error={toAppError(run.fault || run.error, 'legacyExecution')}
              locale={snapshot.locale}
            />
          )}
        </>
      )}
      {mode === 'details' && run && (
        <>
          <details className="execution-evidence">
            <summary>{tr('executionEvidence')}</summary>
            {events
              .filter((event) => event.kind !== 'text')
              .map((event) => (
                <ExecutionEvidenceItem key={event.sequence} event={event} />
              ))}
          </details>
          <div className="button-row">
            <button
              disabled={!events.length || events[0].sequence <= 1}
              onClick={() => call({ kind: 'history', runId: run.id, before: events[0].sequence })}
            >
              {tr('olderHistory')}
            </button>
            <button onClick={() => call({ kind: 'history', runId: run.id })}>
              {tr('latestHistory')}
            </button>
          </div>
          <label>
            {tr('feedback')}
            <textarea
              rows={2}
              value={feedback}
              disabled={run.status !== 'paused'}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <button
            disabled={busy || run.status !== 'paused' || !feedback.trim()}
            onClick={() => {
              call({ kind: 'feedback', runId: run.id, text: feedback });
              setFeedback('');
            }}
          >
            {tr('sendFeedback')}
          </button>
          <div className="result-panel">
            <p>
              {tr(
                run.git?.strategy && run.git.strategy.mode !== 'managed'
                  ? 'gitDirectHint'
                  : 'manualResults',
              )}
            </p>
            <div className="button-row">
              <button
                disabled={!run.directory}
                onClick={() => call({ kind: 'preview', runId: run.id })}
              >
                {tr('previewChanges')}
              </button>
              <button
                disabled={!run.directory}
                onClick={() => call({ kind: 'openDirectory', runId: run.id })}
              >
                {tr(
                  run.git?.strategy && run.git.strategy.mode !== 'managed'
                    ? 'revealProject'
                    : 'openTaskDirectory',
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
