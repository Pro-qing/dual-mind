import { useEffect, useState } from 'react';
import {
  terminalStatuses,
  type ExecutionConfig,
  type PresetCommand,
  type RunSummary,
  type RunStatus,
} from '../../src/shared/execution';
import { useUI } from './context';
export function statusKey(status: RunStatus) {
  return `run_${status}` as const;
}
export function ExecutionSettings() {
  const { execution, execute, tr, snapshot } = useUI();
  const [config, setConfig] = useState<ExecutionConfig>(() => structuredClone(execution.config));
  const [busy, setBusy] = useState(false);
  const group = (key: keyof ExecutionConfig) => (
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
          {group('prepare')}
          {group('checks')}
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
}: {
  taskId: string;
  run?: RunSummary;
  mode?: 'controls' | 'details';
}) {
  const { execution, execute, tr, executionEvents, snapshot } = useUI();
  const task = snapshot.tasks.find((item) => item.id === taskId);
  const configured =
    task &&
    [task.worker, task.reviewer].every(
      (binding) =>
        binding.model &&
        snapshot.connections.some((c) => c.id === binding.connectionId && c.hasKey),
    );
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const active = execution.runs.find((item) => !terminalStatuses.includes(item.status));
  const running = run && !terminalStatuses.includes(run.status);
  const call = (action: Parameters<typeof execute>[0]) => {
    setBusy(true);
    void execute(action)
      .finally(() => setBusy(false))
      .catch(() => undefined);
  };
  useEffect(() => {
    if (run && mode === 'controls') {
      void execute({ kind: 'history', runId: run.id }).catch(() => undefined);
    }
  }, [run?.id, execute, mode]);
  const events = executionEvents.filter((event) => event.runId === run?.id);
  return (
    <section className="execution-panel" aria-label={tr('executionTab')}>
      {mode === 'controls' && (
        <>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || Boolean(active) || !configured || !execution.config.checks.length}
              onClick={() => call({ kind: run ? 'restart' : 'start', taskId })}
            >
              {tr(run ? 'restartRun' : 'start')}
            </button>
            <button
              disabled={
                busy ||
                !running ||
                !['preparing', 'worker', 'checking', 'reviewer'].includes(run!.status)
              }
              onClick={() => call({ kind: 'pause', runId: run!.id })}
            >
              {tr('pause')}
            </button>
            <button
              disabled={busy || run?.status !== 'paused'}
              onClick={() => call({ kind: 'resume', runId: run!.id })}
            >
              {tr('resumeRun')}
            </button>
            <button
              disabled={busy || !running || run?.status === 'stopping'}
              onClick={() => call({ kind: 'stop', runId: run!.id })}
            >
              {tr('stop')}
            </button>
            {run && (
              <span role="status">
                {tr(statusKey(run.status))} · {run.round}/{run.maxRounds}
              </span>
            )}
          </div>
          {!execution.config.checks.length && <p className="hint">{tr('checksRequired')}</p>}
          {run?.error && (
            <p className="warning-text" role="alert">
              {tr('executionError')}: {run.error}
            </p>
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
                <pre key={event.sequence}>
                  {event.kind}: {event.text}
                </pre>
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
                {tr('previewDraft')}
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
