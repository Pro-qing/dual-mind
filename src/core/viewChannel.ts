import { OperationError } from '../shared/errors';

/** One page's handshake and replies. Closing a page never owns task execution. */
export class ViewChannel<T> {
  private closed = false;
  private rendered = false;
  private failed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private resolve!: () => void;
  private reject!: (error: Error) => void;
  ready!: Promise<void>;

  constructor(
    private readonly current: () => boolean,
    private readonly post: (message: T) => PromiseLike<unknown>,
    private readonly timeout = 20000,
  ) {
    this.reset();
  }
  get active() {
    return !this.closed && this.current();
  }
  get needsReload() {
    return this.failed;
  }
  reset(): void {
    if (this.closed) {
      return;
    }
    clearTimeout(this.timer);
    this.rendered = false;
    this.failed = false;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    void this.ready.catch(() => undefined);
    this.timer = setTimeout(() => {
      this.failed = true;
      this.reject(new OperationError('workbenchTimeout'));
    }, this.timeout);
  }
  acknowledge(): void {
    if (!this.active) {
      return;
    }
    if (this.failed) {
      this.reset();
    }
    clearTimeout(this.timer);
    this.rendered = true;
    this.failed = false;
    this.resolve();
  }
  async send(message: T): Promise<void> {
    if (this.active) {
      await this.post(message);
    }
  }
  dispose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearTimeout(this.timer);
    if (!this.rendered) {
      this.reject(new OperationError('workbenchClosed'));
    }
  }
}
