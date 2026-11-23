import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { TaskDraft, ConnectionSummary } from '../../src/shared/model';
import type { ArtifactMerge, TaskArtifactStatus, SavedArtifact } from '../../src/shared/artifacts';
import { terminalStatuses, type ExecutionAction } from '../../src/shared/execution';
import { toAppError, type AppError } from '../../src/shared/errors';
import { useUI } from './context';
import { Dialog } from './components';
import { ErrorNotice } from './ErrorNotice';
import { ModelPicker } from './ModelPicker';

function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
function useArtifact(taskId: string, enabled: boolean) {
  const { execute } = useUI();
  const [value, setValue] = useState<TaskArtifactStatus>();
  const [error, setError] = useState<AppError>();
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const reply = await execute({ kind: 'git.artifacts', taskId });
      if (current === generation.current) {
        setValue(reply.artifact);
      }
      return reply.artifact;
    } catch (e) {
      if (current === generation.current) {
        setError(toAppError(e));
      }
      return undefined;
    } finally {
      if (current === generation.current) {
        setLoading(false);
      }
    }
  }, [execute, taskId]);
  useEffect(() => {
    if (enabled) {
      void refresh();
    }
    return () => {
      generation.current++;
    };
  }, [enabled, refresh]);
  return { value, setValue, error, loading, refresh };
}
export function ContextSettings() {
  const { snapshot, run, tr, pending } = useUI();
  const [selected, setSelected] = useState(snapshot.connections[0]?.id ?? '');
  const connection = snapshot.connections.find((c) => c.id === selected);
  return (
    <section className="settings-main form-stack">
      <h2>{tr('contextSettings')}</h2>
      <label>
        {tr('connectionName')}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">{tr('selectConnection')}</option>
          {snapshot.connections.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {connection && (
        <ContextEditor
          key={connection.id}
          connection={connection}
          busy={pending}
          onSave={async (model, tokens) => {
            const windows = { ...connection.contextWindows };
            if (tokens === undefined) {
              delete windows[model];
            } else {
              windows[model] = tokens;
            }
            const { id, name, baseUrl, defaultModel, protocol } = connection;
            await run(
              {
                kind: 'connection.save',
                id,
                input: { name, baseUrl, defaultModel, protocol, contextWindows: windows },
              },
              'contextSaved',
            );
          }}
        />
      )}
    </section>
  );
}
function ContextEditor({
  connection,
  busy,
  onSave,
}: {
  connection: ConnectionSummary;
  busy: boolean;
  onSave(model: string, tokens?: number): Promise<void>;
}) {
  const { tr, snapshot } = useUI();
  const [model, setModel] = useState(
    connection.defaultModel || Object.keys(connection.contextWindows ?? {})[0] || '',
  );
  const [tokens, setTokens] = useState(String(connection.contextWindows?.[model] ?? ''));
  const [error, setError] = useState<AppError>();
  const lock = useRef(false);
  const changeModel = (value: string) => {
    setModel(value);
    setTokens(String(connection.contextWindows?.[value] ?? ''));
  };
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (lock.current) {
          return;
        }
        lock.current = true;
        setError(undefined);
        void onSave(model.trim(), tokens.trim() ? Number(tokens) : undefined)
          .catch((e) => setError(toAppError(e)))
          .finally(() => {
            lock.current = false;
          });
      }}
    >
      <ModelPicker
        label={tr('contextModel')}
        value={model}
        onChange={changeModel}
        connectionId={connection.id}
      />
      {Object.keys(connection.contextWindows ?? {}).length > 0 && (
        <div className="button-row">
          {Object.keys(connection.contextWindows!).map((id) => (
            <button key={id} type="button" onClick={() => changeModel(id)}>
              {id}
            </button>
          ))}
        </div>
      )}
      <label>
        {tr('contextWindow')}
        <input
          type="number"
          min={8192}
          max={4194304}
          step={1}
          value={tokens}
          onChange={(e) => setTokens(e.target.value)}
        />
      </label>
      <p className="hint">{tr('contextDefault')}</p>
      {error && <ErrorNotice error={error} locale={snapshot.locale} />}
      <button className="primary" disabled={busy || !model.trim()}>
        {tr('save')}
      </button>
    </form>
  );
}
export function ContextUsagePanel({ taskId }: { taskId: string }) {
  const { execution, tr, openContextSettings } = useUI();
  const run = execution.runs.find((r) => r.taskId === taskId);
  if (!run) {
    return null;
  }
  return (
    <details className="context-usage">
      <summary>{tr('contextUsage')}</summary>
      {(['worker', 'reviewer'] as const).map((role) => {
        const usage = run.context?.[role];
        return (
          <div className="context-role" key={role}>
            <strong>{tr(role)}</strong>
            {usage ? (
              <>
                <span>
                  {tr(usage.windowEstimated ? 'contextEstimated' : 'contextConfigured')}:{' '}
                  {usage.estimatedInputTokens.toLocaleString()} /{' '}
                  {usage.inputBudget.toLocaleString()}
                </span>
                <progress
                  max={usage.inputBudget}
                  value={Math.min(usage.estimatedInputTokens, usage.inputBudget)}
                  aria-label={`${tr(role)} ${tr('contextUsage')}`}
                />
                <small>
                  {tr('contextSummaries')}: {usage.summaries}
                </small>
              </>
            ) : (
              <p>{tr('contextNoUsage')}</p>
            )}
          </div>
        );
      })}
      <button className="text-button" onClick={openContextSettings}>
        {tr('contextInspectSettings')}
      </button>
    </details>
  );
}
function FileManifest({ artifact }: { artifact: TaskArtifactStatus }) {
  const { tr } = useUI();
  return (
    <>
      <dl className="artifact-facts">
        <dt>{tr('artifactDirectory')}</dt>
        <dd>{artifact.directory}</dd>
        <dt>{tr('artifactBranch')}</dt>
        <dd>{artifact.branch}</dd>
        <dt>{tr('artifactBase')}</dt>
        <dd>
          {artifact.sourceBranch} · {artifact.baseCommit.slice(0, 12)}
        </dd>
        <dt>{tr('artifactHead')}</dt>
        <dd>{artifact.head.slice(0, 12)}</dd>
      </dl>
      <strong>{tr(artifact.accepted ? 'artifactAccepted' : 'artifactUnaccepted')}</strong>
      <details>
        <summary>
          {tr('artifactFiles')} ({artifact.changedFiles?.length ?? 0})
        </summary>
        {artifact.changedFiles?.length ? (
          <ul>
            {artifact.changedFiles.map((file) => (
              <li key={file.path}>
                <code>{file.status}</code> {file.previousPath ? `${file.previousPath} → ` : ''}
                {file.path}
              </li>
            ))}
          </ul>
        ) : (
          <p>{tr('artifactNoChanges')}</p>
        )}
      </details>
      <details>
        <summary>
          {tr('artifactExcluded')} ({artifact.excluded.length})
        </summary>
        <ul>
          {artifact.excluded.map((dir) => (
            <li key={dir}>{dir}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
type Operation = 'commit' | 'merge' | 'cleanup' | 'complete' | 'abort';
export function ArtifactPanel({ task }: { task: TaskDraft }) {
  const { execution, tr, snapshot, openDerived } = useUI();
  const [expanded, setExpanded] = useState(false);
  const prepared =
    execution.preparedTaskIds?.includes(task.id) || snapshot.preparedTaskIds?.includes(task.id);
  const { value, setValue, error, refresh, loading } = useArtifact(
    task.id,
    Boolean(prepared && expanded),
  );
  const [operation, setOperation] = useState<Operation>();
  const run = execution.runs.find((r) => r.taskId === task.id);
  const active = execution.runs.some((r) => !terminalStatuses.includes(r.status));
  const entry = execution.artifacts?.find((e) => e.taskId === task.id);
  useEffect(() => {
    if (expanded && prepared && !active) {
      void refresh();
    }
  }, [run?.status, entry?.pending, entry?.cleaned]);
  if (!prepared && !entry) {
    return null;
  }
  const blocked = loading || Boolean(execution.gitOperationTaskId);
  const stateLabels = {
    ready: 'artifactReady',
    committed: 'artifactCommitted',
    conflicted: 'artifactConflicted',
    integrated: 'artifactIntegrated',
    cleaned: 'artifactCleaned',
  } as const;
  return (
    <details
      className="artifact-panel"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary>{tr('artifactsTitle')}</summary>
      {error && <ErrorNotice error={error} locale={snapshot.locale} />}
      <button disabled={blocked || active} onClick={() => void refresh()}>
        {tr('artifactRefresh')}
      </button>
      {value && (
        <>
          <p role="status">{tr(stateLabels[value.state])}</p>
          <FileManifest artifact={value} />
          {entry?.pending && <p className="notice warning">{tr('artifactPending')}</p>}
          {!value.managed ? (
            <p>{tr('artifactDirect')}</p>
          ) : (
            value.state !== 'cleaned' && (
              <div className="button-row">
                <button
                  disabled={
                    blocked ||
                    active ||
                    Boolean(value.cleanupOperationId) ||
                    Boolean(value.merge && !['integrated', 'aborted'].includes(value.merge.state))
                  }
                  onClick={() => setOperation('commit')}
                >
                  {tr(value.commitOperationId ? 'artifactRetry' : 'artifactCommit')}
                </button>
                <button
                  disabled={
                    blocked ||
                    active ||
                    !value.accepted ||
                    Boolean(value.changes) ||
                    Boolean(entry?.pending)
                  }
                  onClick={() => setOperation('merge')}
                >
                  {tr('artifactMerge')}
                </button>
                <button
                  disabled={
                    blocked ||
                    Boolean(value.merge && !['integrated', 'aborted'].includes(value.merge.state))
                  }
                  onClick={() => setOperation('cleanup')}
                >
                  {tr('artifactCleanup')}
                </button>
              </div>
            )
          )}
          {value.merge && !['integrated', 'aborted'].includes(value.merge.state) && (
            <MergeActions
              taskId={task.id}
              value={value}
              update={setValue}
              onOperation={setOperation}
            />
          )}
          {value.state === 'cleaned' && <p className="hint">{tr('artifactCleaned')}</p>}
          <div className="button-row">
            <button
              disabled={blocked || active || Boolean(entry?.pending)}
              onClick={() =>
                openDerived({
                  kind: 'followup',
                  taskId: task.id,
                  source: task,
                  baseBranch:
                    value.merge?.state === 'integrated'
                      ? value.merge.targetBranch
                      : value.sourceBranch,
                })
              }
            >
              {tr('artifactFollowup')}
            </button>
            {value.snapshotId && (
              <button
                disabled={blocked || active}
                onClick={() =>
                  openDerived({ kind: 'restore', snapshotId: value.snapshotId, source: task })
                }
              >
                {tr('artifactRestore')}
              </button>
            )}
            {value.restore && !value.restore.complete && (
              <button
                disabled={blocked || active}
                onClick={() =>
                  openDerived({
                    kind: 'restore',
                    snapshotId: value.restore!.snapshotId,
                    operationId: value.restore!.operationId,
                    source: task,
                  })
                }
              >
                {tr('artifactRetry')}
              </button>
            )}
          </div>
        </>
      )}
      {operation && value && (
        <ArtifactDialog
          key={`${task.id}:${operation}`}
          task={task}
          initial={value}
          operation={operation}
          onClose={() => setOperation(undefined)}
          onUpdated={setValue}
        />
      )}
    </details>
  );
}
function MergeLocation({ merge }: { merge: ArtifactMerge }) {
  const { tr } = useUI();
  return (
    <dl className="artifact-facts">
      <dt>{tr('artifactTarget')}</dt>
      <dd>{merge.targetBranch}</dd>
      <dt>{tr('artifactMergeDirectory')}</dt>
      <dd>{merge.directory}</dd>
      <dt>{tr('artifactTargetHead')}</dt>
      <dd>{merge.targetHead}</dd>
    </dl>
  );
}
function MergeActions({
  taskId,
  value,
  update,
  onOperation,
}: {
  taskId: string;
  value: TaskArtifactStatus;
  update(value: TaskArtifactStatus): void;
  onOperation(op: Operation): void;
}) {
  const { execute, tr, execution } = useUI();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useAlive();
  const action = async (kind: 'git.openMerge' | 'git.merge.check') => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const r = await execute({ kind, taskId, operationId: value.merge!.operationId });
      if (alive.current && r.artifact) {
        update(r.artifact);
      }
    } catch {
      /* Host error is displayed by App. */
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  const disabled = busy || Boolean(execution.gitOperationTaskId);
  return (
    <section className="merge-actions">
      <MergeLocation merge={value.merge!} />
      <ul>
        {value.conflicts?.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
      <div className="button-row">
        <button disabled={disabled} onClick={() => void action('git.openMerge')}>
          {tr('artifactMergeOpen')}
        </button>
        <button disabled={disabled} onClick={() => void action('git.merge.check')}>
          {tr('artifactMergeCheck')}
        </button>
        {value.merge?.state === 'preparing' && (
          <button disabled={disabled} onClick={() => onOperation('merge')}>
            {tr('artifactRetry')}
          </button>
        )}
        <button
          disabled={
            disabled || Boolean(value.conflicts?.length) || value.merge?.state !== 'conflicted'
          }
          onClick={() => onOperation('complete')}
        >
          {tr('artifactMergeComplete')}
        </button>
        <button
          disabled={disabled || value.merge?.state !== 'conflicted'}
          onClick={() => onOperation('abort')}
        >
          {tr('artifactMergeAbort')}
        </button>
      </div>
    </section>
  );
}
function ArtifactDialog({
  task,
  initial,
  operation,
  onClose,
  onUpdated,
}: {
  task: TaskDraft;
  initial: TaskArtifactStatus;
  operation: Operation;
  onClose(): void;
  onUpdated(value: TaskArtifactStatus): void;
}) {
  const { execute, execution, tr, snapshot } = useUI();
  const messageId = useId();
  const [value, setValue] = useState(initial),
    [message, setMessage] = useState(initial.pendingCommitMessage ?? `task: ${task.name}`);
  const [target, setTarget] = useState(
    initial.merge && !['integrated', 'aborted'].includes(initial.merge.state)
      ? initial.merge.targetBranch
      : initial.sourceBranch,
  );
  const [heads, setHeads] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<string[]>([]),
    [error, setError] = useState<AppError>(),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(true),
    [submitted, setSubmitted] = useState(false);
  const id = useRef(
    operation === 'commit'
      ? (initial.commitOperationId ?? crypto.randomUUID())
      : operation === 'cleanup'
        ? (initial.cleanupOperationId ?? crypto.randomUUID())
        : initial.merge && !['integrated', 'aborted'].includes(initial.merge.state)
          ? initial.merge.operationId
          : crypto.randomUUID(),
  );
  const lock = useRef(false),
    alive = useAlive();
  const active = execution.runs.find(
    (run) => run.taskId === task.id && !terminalStatuses.includes(run.status),
  );
  useEffect(() => {
    if (operation === 'merge') {
      void execute({ kind: 'git.branches' })
        .then((r) => {
          if (alive.current) {
            setBranches(r.repository?.branches ?? []);
            setHeads(r.repository?.branchHeads ?? {});
          }
        })
        .catch((e) => {
          if (alive.current) {
            setError(toAppError(e));
          }
        });
    }
  }, []);
  const refresh = async () => {
    if (operation === 'merge') {
      const repo = await execute({ kind: 'git.branches' });
      if (alive.current) {
        setBranches(repo.repository?.branches ?? []);
        setHeads(repo.repository?.branchHeads ?? {});
      }
    }
    const reply = await execute({ kind: 'git.artifacts', taskId: task.id });
    if (alive.current && reply.artifact) {
      setValue(reply.artifact);
      onUpdated(reply.artifact);
      if (reply.artifact.pendingCommitMessage) {
        setMessage(reply.artifact.pendingCommitMessage);
      }
      setChecked(true);
    }
    return reply.artifact;
  };
  const submit = async () => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (operation === 'cleanup' && active) {
        await execute({ kind: 'stop', runId: active.id });
        await refresh();
        return;
      }
      if (!checked) {
        await refresh();
        return;
      }
      const action: ExecutionAction =
        operation === 'commit'
          ? {
              kind: 'git.commit',
              taskId: task.id,
              operationId: id.current,
              token: value.token,
              message,
            }
          : operation === 'merge'
            ? {
                kind: 'git.merge',
                taskId: task.id,
                operationId: id.current,
                token: value.token,
                targetBranch: target,
                expectedTargetHead: heads[target],
              }
            : operation === 'cleanup'
              ? {
                  kind: 'git.cleanup',
                  taskId: task.id,
                  operationId: id.current,
                  token: value.token,
                }
              : {
                  kind: operation === 'complete' ? 'git.merge.complete' : 'git.merge.abort',
                  taskId: task.id,
                  operationId: value.merge!.operationId,
                };
      setSubmitted(true);
      const result = await execute(action);
      if (alive.current) {
        if (result.artifact) {
          onUpdated(result.artifact);
        }
        onClose();
      }
    } catch (e) {
      if (alive.current) {
        setError(toAppError(e));
        setChecked(false);
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  const title =
    operation === 'commit'
      ? 'artifactCommit'
      : operation === 'merge'
        ? 'artifactMerge'
        : operation === 'cleanup'
          ? 'artifactCleanup'
          : operation === 'complete'
            ? 'artifactMergeComplete'
            : 'artifactMergeAbort';
  return (
    <Dialog
      title={tr(title)}
      onClose={onClose}
      busy={busy}
      danger={operation === 'cleanup' || operation === 'abort'}
      footer={
        <>
          <button disabled={busy} onClick={onClose}>
            {tr('cancel')}
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              (operation === 'commit' && !message.trim()) ||
              (operation === 'merge' && (!target || (!heads[target] && !value.merge)))
            }
            onClick={() => void submit()}
          >
            {tr(
              operation === 'cleanup' && active
                ? 'stopForCleanup'
                : !checked
                  ? 'artifactRefresh'
                  : 'confirmOperation',
            )}
          </button>
        </>
      }
    >
      <h3>{task.name}</h3>
      {error && <ErrorNotice error={error} locale={snapshot.locale} />}
      {!checked && <p className="notice warning">{tr('operationUncertain')}</p>}
      <FileManifest artifact={value} />
      {operation === 'commit' && (
        <>
          <label htmlFor={messageId}>{tr('artifactMessage')}</label>
          <textarea
            id={messageId}
            value={message}
            disabled={busy || submitted}
            maxLength={10000}
            onChange={(e) => setMessage(e.target.value)}
          />
        </>
      )}
      {operation === 'merge' && (
        <>
          <label>
            {tr('artifactTarget')}
            <select
              value={target}
              disabled={busy || submitted}
              onChange={(e) => {
                setTarget(e.target.value);
                setChecked(false);
              }}
            >
              {!branches.includes(target) && <option value={target}>{target}</option>}
              {branches
                .filter((name) => name !== value.branch)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          {heads[target] && (
            <p className="break-text">
              {tr('artifactTargetHead')}: {heads[target]}
            </p>
          )}
          <p>{tr('artifactMergeHint')}</p>
        </>
      )}
      {(operation === 'complete' || operation === 'abort') && value.merge && (
        <MergeLocation merge={value.merge} />
      )}
      {operation === 'cleanup' && (
        <p className="notice warning">
          {tr(active ? 'stopForCleanupHint' : 'artifactCleanupHint')}
        </p>
      )}
      {operation === 'abort' && <p className="notice warning">{tr('artifactAbortHint')}</p>}
    </Dialog>
  );
}
export function DeleteTaskDialog({
  task,
  onClose,
  onDeleted,
}: {
  task: TaskDraft;
  onClose(): void;
  onDeleted(): void;
}) {
  const { run, execute, execution, snapshot, tr } = useUI();
  const [cleanup, setCleanup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<AppError>(),
    [checked, setChecked] = useState(true);
  const prepared =
    execution.preparedTaskIds?.includes(task.id) || snapshot.preparedTaskIds?.includes(task.id);
  const { value, refresh, loading } = useArtifact(task.id, Boolean(cleanup && prepared));
  const operationId = useRef(crypto.randomUUID()),
    lock = useRef(false),
    alive = useAlive();
  const active = execution.runs.find(
    (r) => r.taskId === task.id && !terminalStatuses.includes(r.status),
  );
  const managed = (task.git?.mode ?? 'managed') === 'managed';
  const submit = async () => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (cleanup && active) {
        await execute({ kind: 'stop', runId: active.id });
        await refresh();
        return;
      }
      if (!checked) {
        await refresh();
        if (alive.current) {
          setChecked(true);
        }
        return;
      }
      await run(
        {
          kind: 'task.delete',
          id: task.id,
          confirmed: true,
          ...(cleanup && value
            ? {
                cleanup: {
                  operationId: value.cleanupOperationId ?? operationId.current,
                  token: value.token,
                },
              }
            : {}),
        },
        'deleted',
      );
      if (alive.current) {
        onDeleted();
        onClose();
      }
    } catch (e) {
      if (alive.current) {
        setError(toAppError(e));
        if (cleanup) {
          setChecked(false);
        }
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  return (
    <Dialog
      title={tr('deleteTask')}
      onClose={onClose}
      busy={busy}
      danger
      footer={
        <>
          <button disabled={busy} onClick={onClose}>
            {tr('cancel')}
          </button>
          <button
            className="danger"
            disabled={busy || loading || (cleanup && !value)}
            onClick={() => void submit()}
          >
            {tr(
              cleanup
                ? active
                  ? 'stopForCleanup'
                  : !checked
                    ? 'artifactRefresh'
                    : 'deleteWithCleanup'
                : active
                  ? 'stopAndDelete'
                  : 'delete',
            )}
          </button>
        </>
      }
    >
      <h3 className="break-text">{task.name}</h3>
      <p>{tr('taskDeleteHint')}</p>
      {managed && prepared && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={cleanup}
            disabled={busy}
            onChange={(e) => setCleanup(e.target.checked)}
          />
          {tr('deleteCleanupOption')}
        </label>
      )}
      {cleanup && value && (
        <>
          <FileManifest artifact={value} />
          <p className="notice warning">
            {tr(active ? 'stopForCleanupHint' : 'artifactCleanupHint')}
          </p>
        </>
      )}
      {error && <ErrorNotice error={error} locale={snapshot.locale} />}
    </Dialog>
  );
}
export function SavedArtifacts() {
  const { execute, tr, snapshot, openDerived, openTask, execution } = useUI();
  const [items, setItems] = useState<SavedArtifact[]>([]),
    [error, setError] = useState<AppError>(),
    [busy, setBusy] = useState(false);
  const alive = useAlive(),
    lock = useRef(false);
  const refresh = async () => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const r = await execute({ kind: 'git.saved' });
      if (alive.current) {
        setItems(r.savedArtifacts ?? []);
      }
    } catch (e) {
      if (alive.current) {
        setError(toAppError(e));
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const blocked =
    busy ||
    Boolean(execution.gitOperationTaskId) ||
    execution.runs.some((r) => !terminalStatuses.includes(r.status));
  return (
    <section className="settings-main form-stack">
      <h2>{tr('savedArtifacts')}</h2>
      <button disabled={busy} onClick={() => void refresh()}>
        {tr('artifactRefresh')}
      </button>
      {error && <ErrorNotice error={error} locale={snapshot.locale} />}
      {!items.length && !busy && <p>{tr('artifactSavedEmpty')}</p>}
      {items.map((item) => (
        <article className="saved-artifact" key={item.id}>
          <h3>{item.taskName}</h3>
          <p>{tr(item.ready ? 'artifactSavedReady' : 'artifactSavedPartial')}</p>
          <small>{item.createdAt}</small>
          <details>
            <summary>{tr('artifactSavedDetails')}</summary>
            <dl className="artifact-facts">
              <dt>{tr('artifactSnapshot')}</dt>
              <dd>{item.id}</dd>
              <dt>{tr('artifactBase')}</dt>
              <dd>
                {item.sourceBranch} · {item.head.slice(0, 12)}
              </dd>
            </dl>
            <ul>
              {item.files.map((file) => (
                <li key={file.path}>
                  {file.kind === 'missing' ? '− ' : ''}
                  {file.path}
                </li>
              ))}
            </ul>
            <p>{tr('artifactExcluded')}</p>
            <ul>
              {item.excluded.map((dir) => (
                <li key={dir}>{dir}</li>
              ))}
            </ul>
          </details>
          <div className="button-row">
            <button
              disabled={!item.ready || blocked}
              onClick={() =>
                openDerived({ kind: 'restore', snapshotId: item.id, source: item.task })
              }
            >
              {tr('artifactRestore')}
            </button>
            {snapshot.tasks.some((t) => t.id === item.taskId) && (
              <button onClick={() => openTask(item.taskId)}>{tr('artifactOrigin')}</button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
