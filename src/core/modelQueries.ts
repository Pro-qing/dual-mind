import { fetchModels, ModelQueryError, type ModelCredentials } from '../providers/models';
import type { ModelList } from '../shared/model';

/** One cancellable query per connection, independent of persistence and other connections. */
export class ModelQueries {
  private readonly pending = new Map<string, AbortController>();
  constructor(
    private readonly read: (id: string) => Promise<ModelCredentials>,
    private readonly invalidated: (id: string) => void,
    private readonly fetchList = fetchModels,
  ) {}
  async query(id: string): Promise<ModelList> {
    if (!id || id.length > 200 || id !== id.trim()) {
      throw new ModelQueryError('invalidMessage');
    }
    if (this.pending.has(id)) {
      throw new ModelQueryError('modelsBusy');
    }
    const controller = new AbortController();
    this.pending.set(id, controller);
    try {
      const credentials = await this.read(id);
      if (controller.signal.aborted) {
        throw new ModelQueryError('modelsChanged');
      }
      const result = await this.fetchList(credentials, controller.signal);
      if (controller.signal.aborted) {
        throw new ModelQueryError('modelsChanged');
      }
      return result;
    } finally {
      if (this.pending.get(id) === controller) {
        this.pending.delete(id);
      }
    }
  }
  invalidate(id: string): void {
    this.pending.get(id)?.abort();
    this.pending.delete(id);
    this.invalidated(id);
  }
  dispose(): void {
    this.pending.forEach((controller) => controller.abort());
    this.pending.clear();
  }
}
