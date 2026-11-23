import { OperationError, toAppError, type AppError } from '../../src/shared/errors';
import { ErrorNotice } from './ErrorNotice';
import type { ReactNode } from 'react';
import { TaskChat } from './TaskChat';
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
export function TaskForm({
  task,
  onClose,
  onSaved,
}: {
  task?: TaskDraft;
  onClose(): void;
  onSaved(id: string): void;
}) {
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
  const [branchError, setBranchError] = useState<AppError>();
  const [saveError, setSaveError] = useState<AppError>();
  const [loadingBranches, setLoadingBranches] = useState(false);
  const strategyLocked = Boolean(
    task &&
    (snapshot.preparedTaskIds?.includes(task.id) ||
      execution.preparedTaskIds?.includes(task.id) ||
      execution.runs.some((item) => item.taskId === task.id && item.directory)),
  );
  const refreshBranches = async () => {
    setLoadingBranches(true);
    setBranchError(undefined);
    try {
      setRepository((await execute({ kind: 'git.branches' })).repository);
    } catch (error) {
      setBranchError(toAppError(error));
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
    setSaveError(undefined);
    try {
      const next = await run({ kind: 'task.save', id: task?.id, input });
      const id = next.savedTaskId || task?.id || next.selectedTaskId;
      if (!id) {
        throw new OperationError('notFound');
      }
      onSaved(id);
    } catch (error) {
      setSaveError(toAppError(error));
    }
  };
  return (
    <Dialog
      title={tr(task ? 'editTask' : 'newTask')}
      onClose={onClose}
      footer={
        <>
          <span className="footer-hint">{tr('taskSaveHint')}</span>
          <button disabled={pending} onClick={onClose}>
            {tr('cancel')}
          </button>
          <button
            className="primary"
            type="submit"
            form="task-form"
            disabled={pending || (input.git?.mode === 'branch' && !input.git.branch)}
          >
            {tr(task ? 'saveTask' : 'createTask')}
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
        {saveError && <ErrorNotice error={saveError} locale={snapshot.locale} />}
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
              {branchError && <ErrorNotice error={branchError} locale={snapshot.locale} />}
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
  const { execution, tr } = useUI();
  const runtime = execution.runs.find((r) => r.taskId === task.id);
  const model =
    (!example && runtime?.models?.[agent]?.model) || task[agent].model || tr('missingModel');
  return (
    <div className={`model-bar ${agent}`} aria-label={tr(agent)}>
      <strong>{tr(agent)}</strong>
      <span title={model}>{model}</span>
    </div>
  );
}
function TaskHome({
  tasks,
  preview,
  onSelect,
  onDelete,
  newButton,
  onPreview,
}: {
  tasks: TaskView[];
  preview: boolean;
  onSelect(task: TaskView): void;
  onDelete(task: TaskDraft): void;
  newButton: ReactNode;
  onPreview(): void;
}) {
  const { snapshot, execution, tr, pending } = useUI();
  const state = (task: TaskView) =>
    execution.runs.find(
      (run) =>
        run.taskId === task.id &&
        (run.kind !== 'conversation' || !terminalStatuses.includes(run.status)),
    );
  const active = tasks.filter((task) =>
    preview
      ? ['working', 'reviewing', 'paused'].includes(task.status)
      : state(task) && !terminalStatuses.includes(state(task)!.status),
  ).length;
  const waiting = tasks.filter((task) => (preview ? task.status === 'draft' : !state(task))).length;
  const completed = tasks.filter((task) =>
    preview ? task.status === 'completed' : state(task)?.status === 'completed',
  ).length;
  return (
    <main className="task-home" aria-label={tr('home')}>
      <header className="section-heading">
        <div>
          <h2>{tr('workspaceTasks')}</h2>
          <p>{tr('homeHint')}</p>
        </div>
        {newButton}
      </header>
      {tasks.length ? (
        <>
          <div className="task-counts" aria-label={tr('workspaceTasks')}>
            <span>
              {tr('allTasks')} {tasks.length}
            </span>
            <span>
              {tr('activeTasks')} {active}
            </span>
            <span>
              {tr('pendingTask')} {waiting}
            </span>
            <span>
              {tr('completed')} {completed}
            </span>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <article className="task-item" key={task.id}>
                <button
                  className="task-select"
                  onClick={() => onSelect(task)}
                  aria-label={task.name}
                  title={task.name}
                >
                  <strong>{task.name}</strong>
                </button>
                <button
                  className="icon-button task-delete"
                  aria-label={`${tr('deleteTask')}: ${task.name}`}
                  title={tr(preview ? 'readonly' : 'deleteTask')}
                  disabled={preview || pending}
                  onClick={() => onDelete(task as TaskDraft)}
                >
                  <Icon name="trash" />
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="empty-workbench">
          <span className="empty-symbol">+</span>
          <h2>{tr('noTasks')}</h2>
          <p>{tr(snapshot.hasWorkspace ? 'emptyDescription' : 'noWorkspace')}</p>
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
      )}
      <footer className="home-footer">
        <p>{tr('homeExecutionHint')}</p>
        {!preview && (
          <button className="text-button" onClick={onPreview}>
            {tr('samplePreview')}
          </button>
        )}
      </footer>
    </main>
  );
}
function ResultActions({ runId, available }: { runId: string; available: boolean }) {
  const { execute, tr, execution } = useUI();
  return (
    <div className="button-row">
      {(['preview', 'openDirectory'] as const).map((kind) => (
        <button
          key={kind}
          disabled={!available}
          onClick={() => void execute({ kind, runId }).catch(() => undefined)}
        >
          {tr(
            kind === 'preview'
              ? 'previewChanges'
              : execution.runs.find((r) => r.id === runId)?.git?.strategy?.mode &&
                  execution.runs.find((r) => r.id === runId)?.git?.strategy?.mode !== 'managed'
                ? 'revealProject'
                : 'openTaskDirectory',
          )}
        </button>
      ))}
    </div>
  );
}
function TaskDetail({
  task,
  preview,
  visible,
  onEdit,
  onDelete,
  onSettings,
}: {
  task: TaskView;
  preview: boolean;
  visible: boolean;
  onEdit(task: TaskDraft): void;
  onDelete(task: TaskDraft): void;
  onSettings(): void;
}) {
  const { execution, tr, pending, chatViews, updateChatView } = useUI();
  const currentRun = !preview
    ? execution.runs.find(
        (item) =>
          item.taskId === task.id &&
          (item.kind !== 'conversation' ||
            !terminalStatuses.includes(item.status) ||
            ['failed', 'interrupted'].includes(item.status)),
      )
    : undefined;
  const locked = currentRun && !terminalStatuses.includes(currentRun.status);
  return (
    <main className="task-content" aria-label={tr('taskDetail')}>
      <section className="task-summary">
        <div className="summary-top">
          <h1>{task.name}</h1>
          <span className="status-badge">
            {currentRun
              ? tr(statusKey(currentRun.status))
              : tr(task.status === 'draft' ? 'pendingTask' : task.status)}
          </span>
        </div>
      </section>
      <div className="task-controls">
        {preview ? (
          <div className="button-row">
            {(['start', 'pause', 'stop'] as const).map((key) => (
              <button key={key} disabled>
                {tr(key)}
              </button>
            ))}
          </div>
        ) : (
          <ExecutionControls taskId={task.id} run={currentRun} onSettings={onSettings} />
        )}
      </div>
      <details
        className="task-details"
        open={Boolean(chatViews[task.id]?.detailsExpanded)}
        onToggle={(event) => updateChatView(task.id, { detailsExpanded: event.currentTarget.open })}
      >
        <summary>{tr('taskDetailsActions')}</summary>
        <div className="task-details-body">
          <div className="task-metadata">
            <span>
              {tr('gitStrategy')}:{' '}
              {currentRun?.branch ||
                (task.git?.mode === 'branch'
                  ? task.git.branch
                  : tr(task.git?.mode === 'current' ? 'gitCurrent' : 'gitManaged'))}
            </span>
            <span>
              {tr('maximumRounds')} {task.maxRounds}
            </span>
          </div>
          <div className="button-row task-edit-actions">
            <button
              disabled={preview || pending || Boolean(locked)}
              onClick={() => onEdit(task as TaskDraft)}
            >
              <Icon name="edit" />
              {tr('editTask')}
            </button>
            {!preview && currentRun && (
              <ResultActions runId={currentRun.id} available={Boolean(currentRun.directory)} />
            )}
            <button
              className="danger"
              disabled={preview || pending}
              aria-label={`${tr('deleteTask')}: ${task.name}`}
              onClick={() => onDelete(task as TaskDraft)}
            >
              <Icon name="trash" />
              {tr('deleteTask')}
            </button>
          </div>
          <div className="model-bars">
            <AgentPanel agent="worker" task={task} example={preview} />
            <AgentPanel agent="reviewer" task={task} example={preview} />
          </div>{' '}
        </div>
      </details>
      <TaskChat key={task.id} task={task} preview={preview} visible={visible} />
    </main>
  );
}
export function Tasks({
  taskId,
  visible = true,
  preview,
  onPreviewChange,
  onSettings,
  onSelect,
  onNewTask,
  onEditTask,
  onDeleted,
}: {
  taskId?: string;
  visible?: boolean;
  preview: boolean;
  onPreviewChange(value: boolean): void;
  onSettings(): void;
  onSelect(id: string): void;
  onNewTask(): void;
  onEditTask(task: TaskDraft): void;
  onDeleted(id: string): void;
}) {
  const { snapshot, tr, run, pending, execution } = useUI();
  const [deleting, setDeleting] = useState<TaskDraft | null>(null);
  const [sampleId, setSampleId] = useState<string>();
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
      status: (['reviewing', 'draft', 'draft', 'completed'] as const)[index],
      maxRounds: 5,
      round: index === 0 ? 2 : 1,
      worker: { connectionId: '', model: 'fast-model' },
      reviewer: { connectionId: '', model: 'reasoning-model' },
      createdAt: '',
      updatedAt: '',
    }),
  );
  const tasks: TaskView[] = preview ? samples : snapshot.tasks;
  const current = tasks.find((task) => task.id === (preview ? sampleId : taskId));
  const select = (task: TaskView) => {
    if (preview) {
      setSampleId(task.id);
    } else {
      void run({ kind: 'task.select', id: task.id }, false)
        .then(() => onSelect(task.id))
        .catch(() => undefined);
    }
  };
  const newButton = (
    <button
      className="primary"
      disabled={pending || preview}
      onClick={() => {
        if (snapshot.hasWorkspace) {
          onNewTask();
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
          <div className="button-row">
            {sampleId && <button onClick={() => setSampleId(undefined)}>{tr('backToHome')}</button>}
            <button
              onClick={() => {
                setSampleId(undefined);
                onPreviewChange(false);
              }}
            >
              {tr('exitPreview')}
            </button>
          </div>
        </div>
      )}
      {current ? (
        <TaskDetail
          visible={visible}
          key={current.id}
          task={current}
          preview={preview}
          onEdit={onEditTask}
          onDelete={setDeleting}
          onSettings={onSettings}
        />
      ) : (
        <TaskHome
          tasks={tasks}
          preview={preview}
          onSelect={select}
          onDelete={setDeleting}
          newButton={newButton}
          onPreview={() => onPreviewChange(true)}
        />
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
          onConfirm={async () => {
            await run({ kind: 'task.delete', id: deleting.id, confirmed: true }, 'deleted');
            onDeleted(deleting.id);
          }}
        />
      )}
    </>
  );
}
