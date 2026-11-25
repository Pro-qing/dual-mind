import { ExecutionRuntime } from './runtime';
export class ExecutionService {
  private readonly runtime: ExecutionRuntime;
  constructor(...dependencies: ConstructorParameters<typeof ExecutionRuntime>) {
    this.runtime = new ExecutionRuntime(...dependencies);
  }
  get ready() {
    return this.runtime.ready;
  }
  get records() {
    return this.runtime.records;
  }
  subscribe(...args: Parameters<ExecutionRuntime['subscribe']>) {
    return this.runtime.subscribe(...args);
  }
  snapshot(...args: Parameters<ExecutionRuntime['snapshot']>) {
    return this.runtime.snapshot(...args);
  }
  assertMutable(...args: Parameters<ExecutionRuntime['assertMutable']>) {
    return this.runtime.assertMutable(...args);
  }
  request(...args: Parameters<ExecutionRuntime['request']>) {
    return this.runtime.request(...args);
  }
  stop(...args: Parameters<ExecutionRuntime['stop']>) {
    return this.runtime.stop(...args);
  }
  deleteTask(...args: Parameters<ExecutionRuntime['deleteTask']>) {
    return this.runtime.deleteTask(...args);
  }
  directory(...args: Parameters<ExecutionRuntime['directory']>) {
    return this.runtime.directory(...args);
  }
  preview(...args: Parameters<ExecutionRuntime['preview']>) {
    return this.runtime.preview(...args);
  }
  shutdown(...args: Parameters<ExecutionRuntime['shutdown']>) {
    return this.runtime.shutdown(...args);
  }
}
