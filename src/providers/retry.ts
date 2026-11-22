import { OperationError } from '../shared/errors';

export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d+$/.test(value.trim())) {
    return Number(value) * 1000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
export function retryDelay(attempt: number, remaining: number, after?: number): number | undefined {
  const wait = after ?? 1000 * attempt;
  return Number.isFinite(wait) && wait >= 0 && wait < remaining ? wait : undefined;
}
export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new OperationError('executionStopped'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new OperationError('executionStopped'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function quotaError(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.status === 402;
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (bytes < 8192) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const part = value.subarray(0, 8192 - bytes);
      chunks.push(part);
      bytes += part.length;
    }
  } catch {
    /* Status classification still applies if the error body is unreadable. */
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return (
    response.status === 402 ||
    /insufficient_quota|quota_exceeded|billing_hard_limit|usage[_ ]limit[_ ](?:reached|exceeded)|credit(?:s)?[_ ](?:balance[_ ])?(?:exhausted|insufficient)|exceeded your current quota/i.test(
      text,
    )
  );
}
export function transientNetwork(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  return code
    ? [
        'ECONNRESET',
        'ETIMEDOUT',
        'EAI_AGAIN',
        'ECONNREFUSED',
        'EPIPE',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_SOCKET',
        'ENETUNREACH',
      ].includes(code)
    : error instanceof TypeError;
}
