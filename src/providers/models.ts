import type { ModelErrorCode, ModelList } from '../shared/model';

export const modelQueryTimeout = 20_000;
export const modelResponseLimit = 2 * 1024 * 1024;
export class ModelQueryError extends Error {
  constructor(public readonly code: ModelErrorCode) {
    super(code);
  }
}
export interface ModelCredentials {
  baseUrl: string;
  key?: string;
}

/** Append to the API path rather than replacing a gateway's prefix. */
export function modelsUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.hash ||
      url.search
    ) {
      throw new Error('invalid');
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
    return url.toString();
  } catch {
    throw new ModelQueryError('invalidUrl');
  }
}
function statusError(status: number): ModelErrorCode {
  if (status >= 300 && status < 400) {
    return 'modelsRedirect';
  }
  if (status === 401) {
    return 'modelsAuth';
  }
  if (status === 403) {
    return 'modelsForbidden';
  }
  if (status === 404 || status === 405 || status === 501) {
    return 'modelsUnsupported';
  }
  if (status === 429) {
    return 'modelsRateLimited';
  }
  if (status >= 500) {
    return 'modelsServer';
  }
  return 'modelsFailed';
}
function modelIds(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) {
    throw new ModelQueryError('modelsInvalidResponse');
  }
  const ids: string[] = [];
  for (const item of value.data) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      item.id.length > 500 ||
      item.id !== item.id.trim() ||
      [...item.id].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ) {
      throw new ModelQueryError('modelsInvalidResponse');
    }
    ids.push(item.id);
  }
  return [...new Set(ids)];
}
/** Never expose upstream error bodies (which may echo credentials) to the UI. */
export async function fetchModels(
  credentials: ModelCredentials,
  signal: AbortSignal,
  options: { timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<ModelList> {
  const url = modelsUrl(credentials.baseUrl);
  if (!credentials.key) {
    throw new ModelQueryError('keyRequired');
  }
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) {
    cancel();
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? modelQueryTimeout);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await (options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${credentials.key}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ModelQueryError(statusError(response.status));
    }
    const length = Number(response.headers.get('content-length'));
    if (length > modelResponseLimit) {
      await response.body?.cancel();
      throw new ModelQueryError('modelsTooLarge');
    }
    if (!response.body) {
      throw new ModelQueryError('modelsInvalidResponse');
    }
    reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > modelResponseLimit) {
        throw new ModelQueryError('modelsTooLarge');
      }
      chunks.push(value);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ModelQueryError('modelsInvalidResponse');
    }
    return { models: modelIds(payload), fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (signal.aborted) {
      throw new ModelQueryError('modelsChanged');
    }
    if (timedOut) {
      throw new ModelQueryError('modelsTimeout');
    }
    if (error instanceof ModelQueryError) {
      throw error;
    }
    throw new ModelQueryError('modelsNetwork');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}
