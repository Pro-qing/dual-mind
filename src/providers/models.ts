import type { ModelErrorCode, ModelList } from '../shared/model';
import type { Protocol, ProviderPreset } from '../shared/execution';
import { modelListHeaders, supportsProtocol } from './adapters/protocol';

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
  protocol?: Protocol;
  provider?: ProviderPreset;
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
interface ModelPage {
  ids: string[];
  hasMore: boolean;
  cursor?: string;
}
function modelPage(value: unknown, credentials: ModelCredentials): ModelPage {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) {
    throw new ModelQueryError('modelsInvalidResponse');
  }
  const ids: string[] = [];
  const lastModelId = value.data.at(-1);
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
    if (credentials.provider === 'commandCode') {
      if (!('supported_endpoints' in item) || !Array.isArray(item.supported_endpoints)) {
        throw new ModelQueryError('modelsInvalidResponse');
      }
      if (!supportsProtocol(item.supported_endpoints, credentials.protocol ?? 'chatCompletions')) {
        continue;
      }
    }
    ids.push(item.id);
  }
  const hasMore = 'has_more' in value ? value.has_more : false;
  if (typeof hasMore !== 'boolean') {
    throw new ModelQueryError('modelsInvalidResponse');
  }
  const cursor =
    'last_id' in value && typeof value.last_id === 'string'
      ? value.last_id
      : lastModelId && typeof lastModelId === 'object' && typeof lastModelId.id === 'string'
        ? lastModelId.id
        : undefined;
  return { ids, hasMore, ...(cursor ? { cursor } : {}) };
}
/** Never expose upstream error bodies (which may echo credentials) to the UI. */
export async function fetchModels(
  credentials: ModelCredentials,
  signal: AbortSignal,
  options: { timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<ModelList> {
  const baseUrl = modelsUrl(credentials.baseUrl);
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
    const ids: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let totalBytes = 0;
    for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
      const url = new URL(baseUrl);
      const anthropic =
        credentials.protocol === 'anthropic' && credentials.provider !== 'commandCode';
      if (anthropic) {
        url.searchParams.set('limit', '100');
      }
      if (cursor) {
        url.searchParams.set(anthropic ? 'after_id' : 'after', cursor);
      }
      const response = await (options.fetch ?? fetch)(url.toString(), {
        method: 'GET',
        headers: modelListHeaders({
          key: credentials.key,
          protocol: credentials.protocol,
          provider: credentials.provider,
        }),
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ModelQueryError(statusError(response.status));
      }
      const length = Number(response.headers.get('content-length'));
      if (length > modelResponseLimit - totalBytes) {
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
        totalBytes += value.byteLength;
        if (totalBytes > modelResponseLimit) {
          throw new ModelQueryError('modelsTooLarge');
        }
        chunks.push(value);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
      } catch {
        throw new ModelQueryError('modelsInvalidResponse');
      }
      const page = modelPage(payload, credentials);
      ids.push(...page.ids);
      if (!page.hasMore) {
        break;
      }
      if (!page.cursor || cursors.has(page.cursor) || pageNumber === 19) {
        throw new ModelQueryError(pageNumber === 19 ? 'modelsTooLarge' : 'modelsInvalidResponse');
      }
      cursors.add(page.cursor);
      cursor = page.cursor;
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      reader = undefined;
    }
    return { models: [...new Set(ids)], fetchedAt: new Date().toISOString() };
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
