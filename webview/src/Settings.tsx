import { ModelPicker } from './ModelPicker';
import { useEffect, useRef, useState } from 'react';
import type {
  AgentBindings,
  ConnectionRecord,
  ConnectionSummary,
  ReviewerPreset,
  RoleText,
} from '../../src/shared/model';
import { Confirm, Icon, ModelFields } from './components';
import { useUI } from './context';

export function Defaults() {
  const { snapshot, tr, run, pending } = useUI();
  const [input, setInput] = useState<AgentBindings>(() => structuredClone(snapshot.defaults));
  const previous = useRef(JSON.stringify(snapshot.defaults));
  useEffect(() => {
    const value = JSON.stringify(snapshot.defaults);
    if (value !== previous.current) {
      const old = previous.current;
      setInput((current) =>
        JSON.stringify(current) === old ? structuredClone(snapshot.defaults) : current,
      );
      previous.current = value;
    }
  }, [snapshot.defaults]);
  return (
    <section className="settings-main defaults-section">
      <header className="section-heading">
        <div>
          <h2>{tr('defaults')}</h2>
          <p>{tr('defaultsHint')}</p>
        </div>
      </header>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run({ kind: 'defaults.save', input })
            .then((next) => setInput(structuredClone(next.defaults)))
            .catch(() => undefined);
        }}
      >
        <div className="two-fields">
          <ModelFields
            agent="worker"
            value={input.worker}
            connections={snapshot.connections}
            onChange={(worker) => setInput({ ...input, worker })}
          />
          <ModelFields
            agent="reviewer"
            value={input.reviewer}
            connections={snapshot.connections}
            onChange={(reviewer) => setInput({ ...input, reviewer })}
          />
        </div>
        <div className="form-actions">
          <button className="primary" disabled={pending}>
            {tr('saveDefaults')}
          </button>
        </div>
      </form>
    </section>
  );
}
function ConnectionEditor({
  record,
  onSaved,
  onDeleted,
}: {
  record?: ConnectionSummary;
  onSaved(id: string): void;
  onDeleted(): void;
}) {
  const { snapshot, tr, run, pending } = useUI();
  const [input, setInput] = useState<Omit<ConnectionRecord, 'id'>>(() => ({
    name: record?.name || '',
    baseUrl: record?.baseUrl || 'https://api.openai.com/v1',
    defaultModel: record?.defaultModel || '',
    provider: record?.provider || 'openaiCompatible',
    protocol: record?.protocol || 'chatCompletions',
  }));
  const [deleting, setDeleting] = useState(false);
  const save = async () => {
    const next = await run({ kind: 'connection.save', id: record?.id, input });
    const saved = next.connections.find((c) =>
      record ? c.id === record.id : !snapshot.connections.some((old) => old.id === c.id),
    );
    if (saved) {
      onSaved(saved.id);
    }
  };
  return (
    <div className="settings-main">
      <header className="section-heading">
        <div>
          <h2>{record?.name || tr('newConnection')}</h2>
          <p>{tr('connectionHint')}</p>
        </div>
        <span className="type-label">
          {tr(input.provider === 'commandCode' ? 'providerCommandCode' : 'compatible')}
        </span>
      </header>
      <div className="settings-detail-grid">
        <div>
          <form
            className="form-stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save().catch(() => undefined);
            }}
          >
            <label>
              {tr('connectionName')} <span className="required">*</span>
              <input
                value={input.name}
                required
                maxLength={200}
                onChange={(event) => setInput({ ...input, name: event.target.value })}
              />
            </label>
            <label>
              {tr('baseUrl')} <span className="required">*</span>
              <input
                value={input.baseUrl}
                required
                type="url"
                maxLength={2048}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => setInput({ ...input, baseUrl: event.target.value })}
              />
            </label>
            <p className="hint">{tr('modelsUrlHint')}</p>
            <label>
              {tr('modelProvider')}
              <select
                value={input.provider}
                onChange={(event) =>
                  setInput({
                    ...input,
                    provider: event.target.value as ConnectionRecord['provider'],
                  })
                }
              >
                <option value="openaiCompatible">{tr('compatible')}</option>
                <option value="commandCode">{tr('providerCommandCode')}</option>
              </select>
            </label>
            <label>
              {tr('inferenceProtocol')}
              <select
                aria-label={tr('inferenceProtocol')}
                value={input.protocol}
                onChange={(event) =>
                  setInput({
                    ...input,
                    protocol: event.target.value as ConnectionRecord['protocol'],
                  })
                }
              >
                <option value="chatCompletions">Chat Completions</option>
                <option value="responses">Responses</option>
                <option value="anthropic">Anthropic Messages</option>
              </select>
            </label>
            <div>
              <span className="field-label">{tr('apiKey')}</span>
              <div className="key-row">
                <span className={`readonly-field ${record?.hasKey ? 'key-saved' : ''}`}>
                  {tr(record?.hasKey ? 'keySaved' : 'keyMissing')}
                </span>
                <button
                  type="button"
                  disabled={!record || pending}
                  onClick={() => {
                    if (record) {
                      void run({ kind: 'connection.key', id: record.id }, false).catch(
                        () => undefined,
                      );
                    }
                  }}
                >
                  {tr(record?.hasKey ? 'replaceKey' : 'setKey')}
                </button>
              </div>
              <p className="hint">{tr(record ? 'keyHint' : 'saveBeforeKey')}</p>
            </div>
            <ModelPicker
              label={tr('defaultModel')}
              value={input.defaultModel}
              onChange={(defaultModel) => setInput({ ...input, defaultModel })}
              connectionId={record?.id || ''}
              connectionMode
              blockedReason={
                record &&
                (input.baseUrl.trim() !== record.baseUrl ||
                  input.provider !== (record.provider ?? 'openaiCompatible') ||
                  input.protocol !== (record.protocol ?? 'chatCompletions'))
                  ? 'modelsSaveConnection'
                  : undefined
              }
            />
            <div className="form-actions">
              <button className="primary" disabled={pending}>
                {tr('saveConnection')}
              </button>
            </div>
          </form>
        </div>
        <aside className="settings-notes">
          <div className="note-card">
            <h3>{tr('apiKey')}</h3>
            <p>{tr('keyHint')}</p>
          </div>
          <div className="note-card">
            <h3>{tr('testConnection')}</h3>
            <p>{tr('modelsScope')}</p>
          </div>
          {record && (
            <div className="note-card">
              <h3>{tr('deleteConnection')}</h3>
              <p>{tr('connectionDeleteHint')}</p>
              <button disabled={pending} className="danger-quiet" onClick={() => setDeleting(true)}>
                <Icon name="trash" />
                {tr('deleteConnection')}
              </button>
            </div>
          )}
        </aside>
      </div>
      {deleting && record && (
        <Confirm
          title={tr('deleteConnection')}
          name={record.name}
          hint={tr('connectionDeleteHint')}
          actionLabel={tr('delete')}
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await run({ kind: 'connection.delete', id: record.id, confirmed: true }, 'deleted');
            onDeleted();
          }}
        />
      )}
    </div>
  );
}
export function Connections() {
  const { snapshot, tr, pending, models } = useUI();
  const [selected, setSelected] = useState(snapshot.connections[0]?.id || 'new');
  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <h2 className="eyebrow">{tr('connections')}</h2>
        <button className="primary" disabled={pending} onClick={() => setSelected('new')}>
          <Icon name="plus" />
          {tr('newConnection')}
        </button>
        <div className="settings-list">
          {snapshot.connections.map((c) => (
            <button
              key={c.id}
              className={`settings-item ${selected === c.id ? 'selected' : ''}`}
              onClick={() => setSelected(c.id)}
            >
              <strong>{c.name}</strong>
              <span>
                {tr(c.provider === 'commandCode' ? 'providerCommandCode' : 'compatible')} ·{' '}
                {c.protocol === 'anthropic'
                  ? 'Anthropic Messages'
                  : c.protocol === 'responses'
                    ? 'Responses'
                    : 'Chat Completions'}
              </span>
              <span className={c.hasKey ? 'key-saved' : 'warning-text'}>
                {tr(c.hasKey ? 'keySaved' : 'keyMissing')}
              </span>
              {models[c.id]?.status === 'success' && (
                <span>
                  {models[c.id].models.length} {tr('modelsCount')}
                </span>
              )}
              {models[c.id]?.status === 'loading' && <span>{tr('modelsLoading')}</span>}
            </button>
          ))}
        </div>
        {snapshot.connections.length === 0 && <p className="hint">{tr('noConnections')}</p>}
      </aside>
      <ConnectionEditor
        key={selected}
        record={snapshot.connections.find((c) => c.id === selected)}
        onSaved={setSelected}
        onDeleted={() => setSelected('new')}
      />
    </div>
  );
}
function RoleEditor({
  role,
  onSaved,
  onDeleted,
}: {
  role?: ReviewerPreset;
  onSaved(id: string): void;
  onDeleted(): void;
}) {
  const { snapshot, tr, run, pending, registerLanguageGuard } = useUI();
  const [input, setInput] = useState<RoleText>(() => ({
    name: role?.name || '',
    purpose: role?.purpose || '',
    instructions: role?.instructions || '',
  }));
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const original = {
    name: role?.name || '',
    purpose: role?.purpose || '',
    instructions: role?.instructions || '',
  };
  const dirty = JSON.stringify(input) !== JSON.stringify(original);
  const save = async () => {
    const next = await run({ kind: 'role.save', id: role?.id, locale: snapshot.locale, input });
    const saved = next.roles.find((r) =>
      role ? r.id === role.id : !snapshot.roles.some((old) => old.id === r.id),
    );
    if (saved) {
      setInput({ name: saved.name, purpose: saved.purpose, instructions: saved.instructions });
      onSaved(saved.id);
    }
  };
  // The guard owns the current editor buffer; it never translates or discards it implicitly.
  useEffect(() => {
    registerLanguageGuard(dirty ? { save, discard: () => setInput(original) } : null);
    return () => registerLanguageGuard(null);
  });
  return (
    <div className="settings-main">
      <header className="section-heading">
        <div>
          <h2>{role?.name || tr('newRole')}</h2>
          <p>{tr(role?.builtIn ? 'roleLanguageHint' : 'customLanguageHint')}</p>
        </div>
        <span className="type-label">{tr(role?.builtIn ? 'builtIn' : 'custom')}</span>
      </header>
      <div className="settings-detail-grid">
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save().catch(() => undefined);
          }}
        >
          <label>
            {tr('roleName')} <span className="required">*</span>
            <input
              required
              disabled={role?.builtIn}
              maxLength={200}
              value={input.name}
              onChange={(event) => setInput({ ...input, name: event.target.value })}
            />
          </label>
          {role?.builtIn && <p className="hint">{tr('roleNameFixed')}</p>}
          <label>
            {tr('purpose')}
            <textarea
              rows={2}
              maxLength={2000}
              value={input.purpose}
              onChange={(event) => setInput({ ...input, purpose: event.target.value })}
            />
          </label>
          <label>
            {tr('instructions')} <span className="required">*</span>
            <textarea
              className="instructions-editor"
              rows={11}
              maxLength={50000}
              required
              value={input.instructions}
              onChange={(event) => setInput({ ...input, instructions: event.target.value })}
            />
          </label>
          <div className="form-actions">
            {role?.builtIn ? (
              <button type="button" disabled={pending} onClick={() => setConfirm('reset')}>
                {tr('restoreDefault')}
              </button>
            ) : (
              role && (
                <button
                  type="button"
                  className="danger-quiet"
                  disabled={pending}
                  onClick={() => setConfirm('delete')}
                >
                  <Icon name="trash" />
                  {tr('deleteRole')}
                </button>
              )
            )}
            <button className="primary" disabled={pending}>
              {tr('saveRole')}
            </button>
          </div>
        </form>
        <aside className="settings-notes">
          <div className="note-card worker">
            <h3>{tr('worker')}</h3>
            <p>{tr('workerPurpose')}</p>
          </div>
          <div className="note-card">
            <h3>{tr('snapshot')}</h3>
            <p>{tr('roleSnapshotHint')}</p>
          </div>
          <div className="note-card">
            <h3>{tr('language')}</h3>
            <p>{tr(role?.builtIn ? 'roleLanguageHint' : 'customLanguageHint')}</p>
          </div>
        </aside>
      </div>
      {confirm && role && (
        <Confirm
          title={tr(confirm === 'reset' ? 'restoreDefault' : 'deleteRole')}
          name={role.name}
          hint={tr(confirm === 'reset' ? 'roleResetHint' : 'roleDeleteHint')}
          actionLabel={tr(confirm === 'reset' ? 'restoreDefault' : 'delete')}
          danger={confirm === 'delete'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm === 'reset') {
              const next = await run({
                kind: 'role.reset',
                id: role.id,
                locale: snapshot.locale,
                confirmed: true,
              });
              const item = next.roles.find((r) => r.id === role.id)!;
              setInput({ name: item.name, purpose: item.purpose, instructions: item.instructions });
            } else {
              await run({ kind: 'role.delete', id: role.id, confirmed: true }, 'deleted');
              onDeleted();
            }
          }}
        />
      )}
    </div>
  );
}
export function Roles() {
  const { snapshot, tr, pending } = useUI();
  const [selected, setSelected] = useState('bug');
  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <h2 className="eyebrow">{tr('reviewerRole')}</h2>
        <button className="primary" onClick={() => setSelected('new')} disabled={pending}>
          <Icon name="plus" />
          {tr('newRole')}
        </button>
        {[true, false].map((builtIn) => (
          <div className="settings-list" key={String(builtIn)}>
            <h3 className="eyebrow">{tr(builtIn ? 'builtIn' : 'custom')}</h3>
            {snapshot.roles
              .filter((role) => role.builtIn === builtIn)
              .map((role) => (
                <button
                  className={`settings-item role-item ${selected === role.id ? 'selected' : ''}`}
                  key={role.id}
                  onClick={() => setSelected(role.id)}
                >
                  <strong>{role.name}</strong>
                  <span>{role.purpose}</span>
                </button>
              ))}
          </div>
        ))}
      </aside>
      <RoleEditor
        key={`${selected}:${snapshot.locale}`}
        role={snapshot.roles.find((role) => role.id === selected)}
        onSaved={setSelected}
        onDeleted={() => setSelected('bug')}
      />
    </div>
  );
}
