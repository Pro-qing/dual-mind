import type {
  Action,
  AppSnapshot,
  Bridge,
  ClientMessage,
  ErrorCode,
  HostMessage,
} from '../../src/shared/model';
export interface VSCodeApi {
  postMessage(message: ClientMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
export class RequestError extends Error {
  constructor(public readonly code: ErrorCode) {
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
  const listener = (event: MessageEvent<HostMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'snapshot') {
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
    dispose() {
      window.removeEventListener('message', listener);
      pending.forEach((request) => request.reject(new RequestError('unavailable')));
      pending.clear();
    },
  };
}
