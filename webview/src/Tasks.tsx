import { ExecutionControls, statusKey } from './Execution';
import { terminalStatuses } from '../../src/shared/execution';
import { useEffect, useState } from 'react';
import type {
  GitStrategy,
  RepositoryInfo,
  RoleSnapshot,
  TaskDraft,
  TaskInput,
} from '../../src/shared/model';
import { builtInRole } from '../../src/shared/roles';
import { Confirm, Dialog, Icon, ModelFields } from './components';
import { useUI } from './context';

type TaskView = Omit<TaskDraft, 'status'> & {
  status: 'draft' | 'reviewing' | 'working' | 'paused' | 'completed';
  round?: number;
};
function TaskForm({ task, onClose }: { task?: TaskDraft; onClose(): void }) {
  const { snapshot, tr, run, pending, execute, execution } = useUI();
  const [input, setInput] = useState<TaskInput>(() => ({
    git: task?.git ?? { mode: 'managed' },
    name: task?.name || '',
    requirements: task?.requirements || '',
    roleId: task?.role.id || '',
    maxRounds: task?.maxRounds || 5,
    worker: { ...(task?.worker || snapshot.defaults.worker) },
    reviewer: { ...(task?.reviewer || snapshot.defaults.reviewer) },
  }));
  const [repository, setRepository] = useState<RepositoryInfo>();
  const [branchError, setBranchError] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const strategyLocked = Boolean(
    task &&
    (snapshot.preparedTaskIds?.includes(task.id) ||
      execution.preparedTaskIds?.includes(task.id) ||
      execution.runs.some((item) => item.taskId === task.id && item.directory)),
  );
  const refreshBranches = async () => {
    setLoadingBranches(true);
    setBranchError('');
    try {
      setRepository((await execute({ kind: 'git.branches' })).repository);
    } catch (error) {
      setBranchError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingBranches(false);
    }
  };
  useEffect(() => {
    if (input.git?.mode === 'branch') {
      void refreshBranches();
    }
  }, [input.git?.mode]);
  const builtIn = snapshot.roles.filter((role) => role.builtIn),
    custom = snapshot.roles.filter((role) => !role.builtIn);
  const incomplete = [input.worker, input.reviewer].some(
    (binding) =>
      !binding.model ||
      !snapshot.connections.some((c) => c.id === binding.connectionId && c.hasKey),
  );
  const save = async () => {
    await run({ kind: 'task.save', id: task?.id, input });
    onClose();
  };
  return (
    <Dialog
      title={tr(task ? 'editTask' : 'newTask')}
      onClose={onClose}
      footer={
        <>
          <span className="footer-hint">{tr('draftHint')}</span>
          <button disabled={pending} onClick={onClose}>
            {tr('cancel')}
          </button>
          <button
            className="primary"
            type="submit"
            form="task-form"
            disabled={pending || (input.git?.mode === 'branch' && !input.git.branch)}
          >
            {tr(task ? 'saveDraft' : 'createDraft')}
          </button>
        </>
      }
    >
      <form
        id="task-form"
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save().catch(() => undefined);
        }}
      >
        <label>
          {tr('taskName')} <span className="required">*</span>
          <input
            required
            maxLength={200}
            value={input.name}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
          />
        </label>
        <label>
          {tr('requirements')} <span className="required">*</span>
          <textarea
            required
            rows={3}
            maxLength={50000}
            value={input.requirements}
            onChange={(event) => setInput({ ...input, requirements: event.target.value })}
          />
        </label>
        <fieldset className="git-choice" disabled={strategyLocked || pending}>
          <label>
            {tr('gitStrategy')}
            <select
              value={input.git?.mode ?? 'managed'}
              onChange={(event) => {
                const mode = event.target.value as GitStrategy['mode'];
                setInput({ ...input, git: mode === 'branch' ? { mode, branch: '' } : { mode } });
              }}
            >
              <option value="managed">{tr('gitManaged')}</option>
              <option value="current">{tr('gitCurrent')}</option>
              <option value="branch">{tr('gitBranch')}</option>
            </select>
          </label>
          {input.git?.mode === 'branch' && (
            <>
              <label>
                {tr('localBranch')}
                <select
                  value={input.git.branch}
                  onChange={(event) =>
                    setInput({ ...input, git: { mode: 'branch', branch: event.target.value } })
                  }
                >
                  <option value="">{tr('selectBranch')}</option>
                  {input.git.branch && !repository?.branches.includes(input.git.branch) && (
                    <option value={input.git.branch}>{input.git.branch}</option>
                  )}
                  {repository?.branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={loadingBranches}
                onClick={() => void refreshBranches()}
              >
                {tr('refreshBranches')}
              </button>
              {repository && (
                <p className="hint">
                  {tr('gitCurrentBranch')}: {repository.currentBranch}
                </p>
              )}
              {branchError && (
                <p role="alert" className="notice warning">
                  {branchError}
                </p>
              )}
            </>
          )}
        </fieldset>
        {strategyLocked && <p className="hint">{tr('gitLocked')}</p>}
        {input.git?.mode !== 'managed' && <p className="notice warning">{tr('gitDirectHint')}</p>}
        <fieldset className="role-choice">
          <legend>
            {tr('reviewerRole')} <span className="required">*</span>
          </legend>
          {task ? (
            <>
              <div className="readonly-field">{task.role.name}</div>
              <p className="hint">{tr('taskRoleFixed')}</p>
            </>
          ) : (
            <>
              <div className="role-choice-grid">
                {builtIn.map((role) => (
                  <label
                    key={role.id}
                    className={`role-choice-card ${input.roleId === role.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="reviewer-role"
                      value={role.id}
                      checked={input.roleId === role.id}
                      onChange={() => setInput({ ...input, roleId: role.id })}
                    />
                    <strong>{role.name}</strong>
                    <span>{role.purpose}</span>
                  </label>
                ))}
              </div>
              {custom.length > 0 && (
                <label className="custom-role-select">
                  {tr('custom')}
                  <select
                    aria-label={tr('custom')}
                    value={custom.some((role) => role.id === input.roleId) ? input.roleId : ''}
                    onChange={(event) => setInput({ ...input, roleId: event.target.value })}
                  >
                    <option value="">{tr('chooseRole')}</option>
                    {custom.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </fieldset>
        <p className="hint worker-text">{tr('workerRole')}</p>
        <div className="two-fields">
          <ModelFields
            agent="worker"
            connections={snapshot.connections}
            value={input.worker}
            onChange={(worker) => setInput({ ...input, worker })}
          />
          <ModelFields
            agent="reviewer"
            connections={snapshot.connections}
            value={input.reviewer}
            onChange={(reviewer) => setInput({ ...input, reviewer })}
          />
        </div>
        <label className="round-field">
          {tr('maximumRounds')}
          <input
            type="number"
            min={1}
            step={1}
            required
            value={Number.isNaN(input.maxRounds) ? '' : input.maxRounds}
            onChange={(event) => setInput({ ...input, maxRounds: event.target.valueAsNumber })}
          />
        </label>
        {incomplete && <p className="notice warning">{tr('apiIncomplete')}</p>}
      </form>
    </Dialog>
  );
}
function AgentPanel({
  agent,
  task,
  example,
}: {
  agent: 'worker' | 'reviewer';
  task: TaskView;
  example: boolean;
}) {
  const { snapshot, tr, execution, executionEvents } = useUI();
  const runtime = execution.runs.find((item) => item.taskId === task.id);
  const output = executionEvents.filter(
    (event) => event.runId === runtime?.id && event.agent === agent && event.kind === 'text',
  );
  const binding = task[agent];
  const connection = snapshot.connections.find((c) => c.id === binding.connectionId);
  const frozen = runtime?.models?.[agent];
  const label =
    !example && frozen
      ? `${frozen.connectionName} / ${frozen.model}`
      : example
        ? `${tr(agent === 'worker' ? 'sampleLocal' : 'sampleTeam')} / ${binding.model}`
        : binding.connectionId
          ? `${connection?.name || tr('missingConnection')} / ${binding.model || tr('noBinding')}`
          : tr('noBinding');
  return (
    <section className={`agent-panel ${agent}`} aria-label={tr(agent)}>
      <header className="agent-header">
        <span className="agent-avatar">{agent === 'worker' ? 'W' : 'R'}</span>
        <div>
          <h2>{tr(agent)}</h2>
          <p>{agent === 'worker' ? tr('workerRole') : task.role.name}</p>
        </div>
        <span className="agent-state">
          {example
            ? tr(agent === 'worker' ? 'working' : 'reviewing')
            : runtime
              ? tr(runtime.status === 'completed' ? 'completed' : statusKey(runtime.status))
              : tr('draft')}
        </span>
      </header>
      <div className="agent-body">
        <div
          className={`model-readout ${!example && binding.connectionId && !connection ? 'invalid' : ''}`}
          title={label}
        >
          {label}
        </div>
        {example ? (
          <>
            <h3 className="eyebrow">{tr('readonly')}</h3>
            <p className="conversation-text">
              {tr(agent === 'worker' ? 'sampleWorker' : 'sampleReviewer')}
            </p>
            {agent === 'worker' && (
              <pre>
                <code>{tr('sampleCode')}</code>
              </pre>
            )}
          </>
        ) : output.length ? (
          <div className="conversation-output">
            {output.map((event) => (
              <span key={event.sequence}>{event.text}</span>
            ))}
          </div>
        ) : (
          <div className="conversation-empty">
            <h3>{tr('noConversation')}</h3>
            <p>{tr('draftConversation')}</p>
          </div>
        )}
        {agent === 'reviewer' && (
          <div className="review-focus">
            <h3 className="eyebrow">{tr('reviewFocus')}</h3>
            <p>{task.role.purpose}</p>
            <details>
              <summary>
                {tr('snapshot')} ·{' '}
                {task.role.locale === 'original'
                  ? tr('originalText')
                  : task.role.locale === 'zh-CN'
                    ? '简体中文'
                    : 'English'}
              </summary>
              <pre className="instruction-snapshot">{task.role.instructions}</pre>
              <p className="hint">{tr('snapshotHint')}</p>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
export function Tasks({
  preview,
  onPreviewChange,
  onSettings,
  newTaskRequest,
  onNewTaskHandled,
}: {
  preview: boolean;
  onPreviewChange(value: boolean): void;
  onSettings(): void;
  newTaskRequest?: string;
  onNewTaskHandled?(): void;
}) {
  const { snapshot, tr, run, pending, execution } = useUI();
  const [dialog, setDialog] = useState<'new' | TaskDraft | null>(null);
  const [deleting, setDeleting] = useState<TaskDraft | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sampleId, setSampleId] = useState('sample-bug');
  useEffect(() => {
    if (newTaskRequest && snapshot.hasWorkspace) {
      setDialog('new');
      onNewTaskHandled?.();
    }
  }, [newTaskRequest, snapshot.hasWorkspace, onNewTaskHandled]);

  const samples: TaskView[] = (['bug', 'feature', 'review', 'refactor'] as const).map(
    (role, index) => ({
      id: `sample-${role}`,
      name: tr((['sampleBug', 'sampleFeature', 'sampleReview', 'sampleRefactor'] as const)[index]),
      requirements: tr('sampleRequirement'),
      role: {
        ...builtInRole(role, snapshot.locale),
        id: role,
        builtIn: true,
        locale: snapshot.locale,
      } satisfies RoleSnapshot,
      status: (['reviewing', 'working', 'paused', 'completed'] as const)[index],
      maxRounds: 5,
      round: index === 0 ? 2 : 1,
      worker: { connectionId: '', model: 'fast-model' },
      reviewer: { connectionId: '', model: 'reasoning-model' },
      createdAt: '',
      updatedAt: '',
    }),
  );
  const tasks: TaskView[] = preview ? samples : snapshot.tasks;
  const selectedId = preview ? sampleId : snapshot.selectedTaskId;
  const current = tasks.find((task) => task.id === selectedId) || tasks[0];
  const currentRun =
    !preview && current ? execution.runs.find((item) => item.taskId === current.id) : undefined;
  const locked = currentRun && !terminalStatuses.includes(currentRun.status);
  const select = (task: TaskView) => {
    if (preview) {
      setSampleId(task.id);
    } else {
      void run({ kind: 'task.select', id: task.id }, false).catch(() => undefined);
    }
    setSidebarOpen(false);
  };
  const newButton = (
    <button
      className="primary"
      disabled={pending || preview}
      onClick={() => {
        if (snapshot.hasWorkspace) {
          setDialog('new');
        } else {
          void run({ kind: 'workspace.open' }, false).catch(() => undefined);
        }
      }}
    >
      <Icon name="plus" />
      {tr(snapshot.hasWorkspace ? 'newTask' : 'openFolder')}
    </button>
  );
  return (
    <>
      {preview && (
        <div className="preview-banner" role="status">
          <span>{tr('previewBadge')}</span>
          <button onClick={() => onPreviewChange(false)}>{tr('exitPreview')}</button>
        </div>
      )}
      <div className="mobile-task-toolbar">
        <button aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Icon name="tasks" />
          {tr('tasks')}
        </button>
        {!preview && <button onClick={() => onPreviewChange(true)}>{tr('samplePreview')}</button>}
        {newButton}
      </div>
      <div className={`workspace-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {sidebarOpen && (
          <button
            className="sidebar-scrim"
            aria-label={tr('close')}
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className="task-sidebar" aria-label={tr('workspaceTasks')}>
          <div className="sidebar-heading">
            <h2 className="eyebrow">{tr('workspaceTasks')}</h2>
            <button
              className="icon-button sidebar-close"
              aria-label={tr('close')}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          {newButton}
          <div className="task-list">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`task-item ${current?.id === task.id ? 'selected' : ''}`}
              >
                <button
                  className="task-select"
                  onClick={() => select(task)}
                  aria-current={current?.id === task.id ? 'true' : undefined}
                >
                  <strong>{task.name}</strong>
                  <span
                    className={`role-badge ${task.role.id.startsWith('custom:') ? 'custom' : task.role.id}`}
                  >
                    {task.role.name}
                  </span>
                  <span className="task-state">
                    {!preview && execution.runs.some((item) => item.taskId === task.id)
                      ? tr(
                          statusKey(execution.runs.find((item) => item.taskId === task.id)!.status),
                        )
                      : tr(task.status)}
                    {task.round
                      ? ` · ${task.round} / ${task.maxRounds}`
                      : !preview && execution.runs.some((item) => item.taskId === task.id)
                        ? ` · ${execution.runs.find((item) => item.taskId === task.id)!.round} / ${task.maxRounds}`
                        : ''}
                  </span>
                </button>
                <button
                  className="icon-button task-delete"
                  aria-label={`${tr('deleteTask')}: ${task.name}`}
                  title={preview ? tr('readonly') : tr('deleteTask')}
                  disabled={preview || pending}
                  onClick={() => setDeleting(snapshot.tasks.find((item) => item.id === task.id)!)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            <p>{tr('independentTasks')}</p>
            <span title={snapshot.workspaceName}>
              {snapshot.workspaceName || tr('noWorkspaceName')}
            </span>
            {!preview && (
              <button className="text-button" onClick={() => onPreviewChange(true)}>
                {tr('samplePreview')}
              </button>
            )}
          </div>
        </aside>
        <main className="task-content">
          {!current ? (
            <section className="empty-workbench">
              <span className="empty-symbol">+</span>
              <h2>{tr('noTasks')}</h2>
              <p>{tr(snapshot.hasWorkspace ? 'emptyDescription' : 'noWorkspace')}</p>
              <div className="button-row">
                {newButton}
                <button onClick={() => onPreviewChange(true)}>{tr('samplePreview')}</button>
              </div>
              <div className="empty-role-pair">
                <div className="worker">
                  <h3>{tr('worker')}</h3>
                  <p>{tr('workerRole')}</p>
                </div>
                <div className="reviewer">
                  <h3>{tr('reviewer')}</h3>
                  <p>{tr('reviewerRole')}</p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="task-summary">
                <div className="summary-top">
                  <span className="eyebrow">{tr('selectedTask')}</span>
                  <span className="status-badge">
                    {preview
                      ? `${tr(current.status)} · ${current.round} / ${current.maxRounds}`
                      : currentRun
                        ? tr(statusKey(currentRun.status))
                        : tr('editableDraft')}
                  </span>
                </div>
                <h1>{current.name}</h1>
                {currentRun?.branch && (
                  <p>
                    {tr('gitStrategy')}: {currentRun.branch}
                  </p>
                )}
                <p className="task-requirements">{current.requirements}</p>
                <span
                  className={`role-badge ${current.role.id.startsWith('custom:') ? 'custom' : current.role.id}`}
                >
                  {tr('reviewer')}: {current.role.name}
                </span>
              </section>
              <div className="task-controls">
                <div className="button-row">
                  {preview &&
                    (['start', 'pause', 'stop'] as const).map((key, index) => (
                      <button key={key} disabled title={tr(preview ? 'readonly' : 'unavailable')}>
                        <Icon name={(['play', 'pause', 'stop'] as const)[index]} />
                        {tr(key)}
                      </button>
                    ))}
                  {!preview && (
                    <button
                      onClick={() =>
                        setDialog(snapshot.tasks.find((task) => task.id === current.id)!)
                      }
                      disabled={pending || Boolean(locked)}
                    >
                      <Icon name="edit" />
                      {tr('editTask')}
                    </button>
                  )}
                </div>
                <span>
                  {tr('maximumRounds')} <strong>{current.maxRounds}</strong>
                </span>
              </div>
              {!preview && <ExecutionControls taskId={current.id} run={currentRun} />}
              <div className="agent-grid">
                <AgentPanel agent="worker" task={current} example={preview} />
                <AgentPanel agent="reviewer" task={current} example={preview} />
              </div>
              {!preview && (
                <ExecutionControls taskId={current.id} run={currentRun} mode="details" />
              )}
              {preview && (
                <>
                  <section className="feedback-panel">
                    <label>
                      {tr('feedback')}
                      <textarea rows={2} disabled placeholder={tr('feedbackPlaceholder')} />
                    </label>
                    <button disabled title={tr('unavailable')}>
                      {tr('sendFeedback')}
                    </button>
                  </section>
                  <section className="result-panel">
                    <div>
                      <h3>{tr('noResult')}</h3>
                      <p>{tr('resultHint')}</p>
                    </div>
                    <div className="button-row">
                      <button disabled>{tr('previewDraft')}</button>
                      <button disabled>{tr('apply')}</button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          {!preview && (
            <p className="capability-note">
              {tr('executionReadyHint')}{' '}
              <button className="text-button" onClick={onSettings}>
                {tr('settings')}
              </button>
            </p>
          )}
        </main>
      </div>
      {dialog && (
        <TaskForm task={dialog === 'new' ? undefined : dialog} onClose={() => setDialog(null)} />
      )}
      {deleting && (
        <Confirm
          title={tr('deleteTask')}
          name={deleting.name}
          hint={tr('taskDeleteHint')}
          actionLabel={tr(
            execution.runs.some(
              (item) => item.taskId === deleting.id && !terminalStatuses.includes(item.status),
            )
              ? 'stopAndDelete'
              : 'delete',
          )}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            run({ kind: 'task.delete', id: deleting.id, confirmed: true }, 'deleted')
          }
        />
      )}
    </>
  );
}
