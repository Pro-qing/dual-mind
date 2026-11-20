import type {
  Action,
  AppSnapshot,
  Bridge,
  ClientMessage,
  ErrorCode,
  HostMessage,
  ModelList,
  ModelErrorCode,
} from '../../src/shared/model';
export interface VSCodeApi {
  postMessage(message: ClientMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
export class RequestError extends Error {
  constructor(public readonly code: ErrorCode | ModelErrorCode) {
    super(code);
  }
}
export function connect(
  api: VSCodeApi,
  onSnapshot: (state: AppSnapshot) => void,
  onFatal: (error: ErrorCode) => void,
): Bridge & { dispose(): void } {
  const pending = new Map<
    string,
    { resolve(state: AppSnapshot): void; reject(error: Error): void }
  >();
  const modelListeners = new Set<(connectionId: string) => void>();
  const modelPending = new Map<
    string,
    {
      connectionId: string;
      timer: ReturnType<typeof setTimeout>;
      resolve(result: ModelList): void;
      reject(error: Error): void;
    }
  >();
  const listener = (event: MessageEvent<HostMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'models.invalidated') {
      for (const [id, request] of modelPending) {
        if (request.connectionId === message.connectionId) {
          clearTimeout(request.timer);
          modelPending.delete(id);
          request.reject(new RequestError('modelsChanged'));
        }
      }
      modelListeners.forEach((notify) => notify(message.connectionId));
    } else if (message.type === 'models.result') {
      const request = modelPending.get(message.requestId);
      if (!request || request.connectionId !== message.connectionId) {
        return;
      }
      clearTimeout(request.timer);
      modelPending.delete(message.requestId);
      if (message.ok) {
        request.resolve(message.result);
      } else {
        request.reject(new RequestError(message.error));
      }
    } else if (message.type === 'snapshot') {
      onSnapshot(message.snapshot);
    } else if (message.type === 'fatal') {
      onFatal(message.error);
    } else if (message.type === 'result') {
      const request = pending.get(message.requestId);
      if (!request) {
        return;
      }
      pending.delete(message.requestId);
      if (message.ok && message.snapshot) {
        onSnapshot(message.snapshot);
        request.resolve(message.snapshot);
      } else {
        request.reject(new RequestError(message.error || 'storageFailed'));
      }
    }
  };
  window.addEventListener('message', listener);
  return {
    request(action: Action): Promise<AppSnapshot> {
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        api.postMessage({ type: 'request', requestId, action });
      });
    },
    queryModels(connectionId: string): Promise<ModelList> {
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          modelPending.delete(requestId);
          reject(new RequestError('modelsTimeout'));
        }, 30_000);
        modelPending.set(requestId, { connectionId, timer, resolve, reject });
        api.postMessage({ type: 'models.query', requestId, connectionId });
      });
    },
    onModelsInvalidated(listener) {
      modelListeners.add(listener);
      return () => {
        modelListeners.delete(listener);
      };
    },
    dispose() {
      modelPending.forEach((request) => {
        clearTimeout(request.timer);
        request.reject(new RequestError('modelsChanged'));
      });
      modelPending.clear();
      modelListeners.clear();
      window.removeEventListener('message', listener);
      pending.forEach((request) => request.reject(new RequestError('unavailable')));
      pending.clear();
    },
  };
}
