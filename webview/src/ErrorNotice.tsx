import { formatError, type AppError } from '../../src/shared/errors';
import { t } from '../../src/shared/i18n';
import type { Locale } from '../../src/shared/model';

export function ErrorNotice({ error, locale }: { error: AppError; locale: Locale }) {
  return (
    <div className="error-notice" role="alert" data-error-code={error.code}>
      <p>{formatError(locale, error)}</p>
      {error.details && (
        <details>
          <summary>{t(locale, 'errorDetails')}</summary>
          <pre>{error.details}</pre>
        </details>
      )}
    </div>
  );
}
