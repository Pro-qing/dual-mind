import { useEffect, useRef, useState } from 'react';
import type {
  Action,
  AppSnapshot,
  Bridge,
  ErrorCode,
  LanguageSetting,
} from '../../src/shared/model';
import { t, type MessageKey } from '../../src/shared/i18n';
import { UIContext, type LanguageGuard } from './context';
import { Dialog, Icon } from './components';
import { Connections, Roles } from './Settings';
import { Tasks } from './Tasks';

export interface Navigation {
  view: 'workbench' | 'api' | 'roles';
}
export function App({
  snapshot,
  bridge,
  initialNavigation,
  onNavigation,
}: {
  snapshot: AppSnapshot;
  bridge: Bridge;
  initialNavigation?: Partial<Navigation>;
  onNavigation?(value: Navigation): void;
}) {
  const [view, setView] = useState<Navigation['view']>(
    initialNavigation?.view === 'api' || initialNavigation?.view === 'roles'
      ? initialNavigation.view
      : 'workbench',
  );
  const [preview, setPreview] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<{ key: MessageKey; error: boolean } | null>(null);
  const [languageTarget, setLanguageTarget] = useState<LanguageSetting | null>(null);
  const guard = useRef<LanguageGuard | null>(null);
  const pending = pendingCount > 0;
  const tr = (key: MessageKey) => t(snapshot.locale, key);
  useEffect(() => {
    if (!notice || notice.error) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    document.documentElement.lang = snapshot.locale;
  }, [snapshot.locale]);
  useEffect(() => {
    onNavigation?.({ view });
  }, [view, onNavigation]);
  const run = async (action: Action, message: MessageKey | false = 'saved') => {
    setPendingCount((count) => count + 1);
    setNotice(null);
    try {
      const next = await bridge.request(action);
      if (message) {
        setNotice({ key: message, error: false });
      }
      return next;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code: ErrorCode }).code
          : 'storageFailed';
      const known: ErrorCode[] = [
        'invalidMessage',
        'required',
        'invalidUrl',
        'invalidRounds',
        'notFound',
        'workspaceRequired',
        'builtInProtected',
        'storageFailed',
        'invalidStoredData',
        'unavailable',
      ];
      setNotice({ key: known.includes(code) ? code : 'storageFailed', error: true });
      throw error;
    } finally {
      setPendingCount((count) => count - 1);
    }
  };
  const changeLanguage = (value: LanguageSetting) => {
    if (value === snapshot.language) {
      return;
    }
    if (guard.current) {
      setLanguageTarget(value);
    } else {
      void run({ kind: 'language.set', value }, false).catch(() => undefined);
    }
  };
  const finishLanguage = async (save: boolean) => {
    if (!languageTarget) {
      return;
    }
    if (save) {
      await guard.current?.save();
    } else {
      guard.current?.discard();
    }
    await run({ kind: 'language.set', value: languageTarget }, false);
    setLanguageTarget(null);
  };
  return (
    <UIContext.Provider
      value={{
        snapshot,
        pending,
        run,
        registerLanguageGuard: (value) => {
          guard.current = value;
        },
      }}
    >
      <div className="dm-app">
        <header className="app-header">
          <div className="brand">
            <span className="brand-symbol" aria-hidden="true">
              〈〉
            </span>
            <div>
              <h1>
                DualMind
                {view !== 'workbench' && <span className="breadcrumb"> / {tr('settings')}</span>}
              </h1>
              <p>{tr(view === 'workbench' ? 'tagline' : 'settingsHint')}</p>
            </div>
          </div>
          <div className="header-actions">
            {view === 'workbench' ? (
              <>
                <span className="stage-badge">
                  {preview ? tr('sampleCounts') : tr('localStage')}
                </span>
                <button
                  onClick={() => {
                    setPreview(false);
                    setView('api');
                  }}
                >
                  <Icon name="settings" />
                  {tr('settings')}
                </button>
              </>
            ) : (
              <>
                <label className="language-control">
                  {tr('language')}
                  <select
                    aria-label={tr('language')}
                    value={snapshot.language}
                    disabled={pending}
                    onChange={(event) => changeLanguage(event.target.value as LanguageSetting)}
                  >
                    <option value="auto">{tr('languageAuto')}</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <button onClick={() => setView('workbench')}>
                  <Icon name="arrow" />
                  {tr('backToTasks')}
                </button>
              </>
            )}
          </div>
        </header>
        {notice && (
          <div
            className={`toast ${notice.error ? 'toast-error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
          >
            <span>{tr(notice.key)}</span>
            <button
              className="icon-button"
              aria-label={tr('close')}
              onClick={() => setNotice(null)}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {view === 'workbench' ? (
          <Tasks preview={preview} onPreviewChange={setPreview} onSettings={() => setView('api')} />
        ) : (
          <>
            <nav className="settings-tabs" aria-label={tr('settings')}>
              <button
                className={view === 'api' ? 'active' : ''}
                aria-current={view === 'api' ? 'page' : undefined}
                onClick={() => setView('api')}
              >
                {tr('apiTab')}
              </button>
              <button
                className={view === 'roles' ? 'active' : ''}
                aria-current={view === 'roles' ? 'page' : undefined}
                onClick={() => setView('roles')}
              >
                {tr('rolesTab')}
              </button>
            </nav>
            {view === 'api' ? <Connections /> : <Roles />}
          </>
        )}
        {languageTarget && (
          <Dialog
            title={tr('unsavedTitle')}
            onClose={() => setLanguageTarget(null)}
            footer={
              <>
                <button disabled={pending} onClick={() => setLanguageTarget(null)}>
                  {tr('cancel')}
                </button>
                <button
                  disabled={pending}
                  onClick={() => {
                    void finishLanguage(false).catch(() => undefined);
                  }}
                >
                  {tr('discard')}
                </button>
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => {
                    void finishLanguage(true).catch(() => undefined);
                  }}
                >
                  {tr('save')}
                </button>
              </>
            }
          >
            <p>{tr('unsavedHint')}</p>
          </Dialog>
        )}
      </div>
    </UIContext.Provider>
  );
}
