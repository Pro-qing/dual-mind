import { type AppError } from '../../src/shared/errors';
import { ErrorNotice } from './ErrorNotice';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  chooseWorkbenchView,
  restoreWorkbenchView,
  type WorkbenchViewState,
} from './chatViewState';
import { connect, type VSCodeApi } from './bridge';
import type { AppSnapshot, Locale } from '../../src/shared/model';
import { t } from '../../src/shared/i18n';
import './styles.css';

declare function acquireVsCodeApi(): VSCodeApi;
const api = acquireVsCodeApi();
const saveViewState = (value: WorkbenchViewState) => {
  api.setState(value);
  api.postMessage({ type: 'view.state', state: value });
};
const acknowledgeNavigation = (id: string) => api.postMessage({ type: 'navigation.ack', id });
function Root() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [bridge] = useState(() =>
    connect(
      api,
      (state) => {
        setSnapshot(state);
        setError(null);
      },
      setError,
    ),
  );
  const reportedReady = useRef(false);
  useEffect(() => {
    api.postMessage({ type: 'ready' });
    return () => {
      bridge.dispose();
    };
  }, [bridge]);
  useEffect(() => {
    if (snapshot) {
      return;
    }
    const timer = window.setTimeout(
      () => setError((current) => current || { code: 'hostUnavailable' }),
      20000,
    );
    return () => clearTimeout(timer);
  }, [snapshot]);
  useEffect(() => {
    if (snapshot && !reportedReady.current) {
      reportedReady.current = true;
      api.postMessage({
        type: 'rendered',
        state: chooseWorkbenchView(
          api.getState(),
          snapshot.initialViewState,
          undefined,
          snapshot.tasks,
        ),
      });
    }
  }, [snapshot]);
  const locale: Locale =
    snapshot?.locale || (document.documentElement.lang.startsWith('zh') ? 'zh-CN' : 'en');
  if (!snapshot) {
    return (
      <div className="boot-message">
        <h1>DualMind</h1>
        {error ? (
          <ErrorNotice error={error} locale={locale} />
        ) : (
          <p role="status">{t(locale, 'loading')}</p>
        )}
        {error && (
          <button
            onClick={() => {
              setError(null);
              api.postMessage({ type: 'ready' });
            }}
          >
            {t(locale, 'reload')}
          </button>
        )}
      </div>
    );
  }
  const previous = restoreWorkbenchView(
    chooseWorkbenchView(api.getState(), snapshot.initialViewState, undefined, snapshot.tasks),
    snapshot.tasks,
  );
  return (
    <>
      {error && <ErrorNotice error={error} locale={locale} />}
      <App
        snapshot={snapshot}
        bridge={bridge}
        initialNavigation={previous.navigation}
        initialChatViews={previous.chats}
        onViewState={saveViewState}
        onNavigationHandled={acknowledgeNavigation}
      />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
