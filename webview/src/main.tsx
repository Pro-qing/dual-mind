import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type Navigation } from './App';
import { connect, type VSCodeApi } from './bridge';
import type { AppSnapshot, ErrorCode, Locale } from '../../src/shared/model';
import { t } from '../../src/shared/i18n';
import './styles.css';

declare function acquireVsCodeApi(): VSCodeApi;
const api = acquireVsCodeApi();
function Root() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
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
    const timer = window.setTimeout(() => setError((current) => current || 'unavailable'), 20000);
    return () => clearTimeout(timer);
  }, [snapshot]);
  useEffect(() => {
    if (snapshot && !reportedReady.current) {
      reportedReady.current = true;
      api.postMessage({ type: 'rendered' });
    }
  }, [snapshot]);
  const locale: Locale =
    snapshot?.locale || (document.documentElement.lang.startsWith('zh') ? 'zh-CN' : 'en');
  if (!snapshot) {
    return (
      <div className="boot-message">
        <h1>DualMind</h1>
        <p role={error ? 'alert' : 'status'}>{t(locale, error || 'loading')}</p>
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
  const previous = api.getState() as Partial<Navigation> | undefined;
  return (
    <App
      snapshot={snapshot}
      bridge={bridge}
      initialNavigation={previous}
      onNavigation={(value) => api.setState(value)}
    />
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
