import { OperationError, errorText } from '../shared/errors';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { RunEvent, RunSummary, ExecutionConfig } from '../shared/execution';
import { emptyExecutionConfig, terminalStatuses } from '../shared/execution';
import type { StateStorage } from '../core/store';
export const executionStorageKey = 'dualMind.execution.v1';
export class RunRecords {
  private chain: Promise<unknown> = Promise.resolve();
  config: ExecutionConfig = emptyExecutionConfig();
  runs: RunSummary[] = [];
  constructor(
    private readonly state: StateStorage,
    private readonly root: () => string | undefined,
  ) {}
  async initialize(): Promise<void> {
    const stored = this.state.get<{ version: number; config: ExecutionConfig; runs: RunSummary[] }>(
      executionStorageKey,
      { version: 1, config: emptyExecutionConfig(), runs: [] },
    );
    if (stored.version !== 1 || !Array.isArray(stored.runs)) {
      throw new OperationError('executionStorageInvalid');
    }
    this.config = validateConfig(stored.config);
    this.runs = structuredClone(stored.runs);
    for (const run of this.runs) {
      if (!/^[0-9a-f-]{36}$/.test(run.id) || !Number.isSafeInteger(run.sequence)) {
        throw new OperationError('executionRecordInvalid');
      }
      if (!terminalStatuses.includes(run.status)) {
        run.status = 'interrupted';
        run.updatedAt = new Date().toISOString();
        run.fault = { code: 'executionInterrupted' };
        run.error = errorText('en', run.fault);
      }
    }
    await this.save();
  }
  snapshot() {
    return structuredClone({ config: this.config, runs: this.runs });
  }
  save(): Promise<void> {
    const value = { version: 1, ...this.snapshot() };
    const next = this.chain.then(() => this.state.update(executionStorageKey, value));
    this.chain = next;
    return next;
  }
  metadata(runId: string, value: unknown): Promise<void> {
    const root = this.root();
    if (!root || !/^[0-9a-f-]{36}$/.test(runId)) {
      return Promise.reject(new OperationError('executionStorageUnavailable'));
    }
    const next = this.chain.then(async () => {
      await mkdir(join(root, 'runs'), { recursive: true, mode: 0o700 });
      await writeFile(join(root, 'runs', `${runId}.json`), JSON.stringify(value), {
        mode: 0o600,
        flag: 'wx',
      });
    });
    this.chain = next;
    return next;
  }
  event(event: RunEvent): Promise<void> {
    const folder = this.root();
    if (!folder) {
      return Promise.reject(new OperationError('historyWorkspaceRequired'));
    }
    const next = this.chain.then(async () => {
      const directory = join(folder, 'runs');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await appendFile(join(directory, `${event.runId}.jsonl`), `${JSON.stringify(event)}\n`, {
        mode: 0o600,
      });
    });
    this.chain = next;
    return next;
  }
  async history(runId: string, before = Number.MAX_SAFE_INTEGER): Promise<RunEvent[]> {
    const run = this.runs.find((item) => item.id === runId);
    const root = this.root();
    if (!run || !root || !Number.isSafeInteger(before) || before < 1) {
      throw new OperationError('historyUnavailable');
    }
    await this.chain;
    const result: RunEvent[] = [];
    const stream = createReadStream(join(root, 'runs', `${runId}.jsonl`), { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        let event: RunEvent;
        try {
          event = JSON.parse(line) as RunEvent;
        } catch {
          continue;
        }
        if (event.runId === runId && event.sequence < before) {
          result.push(event);
          if (result.length > 80) {
            result.shift();
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    } finally {
      lines.close();
      stream.destroy();
    }
    return result;
  }
  async removeTask(taskId: string) {
    this.runs = this.runs.filter((run) => run.taskId !== taskId);
    await this.save();
  }
}
export function validateConfig(value: unknown): ExecutionConfig {
  if (!value || typeof value !== 'object') {
    throw new OperationError('commandConfigInvalid');
  }
  const config = value as ExecutionConfig;
  const ids = new Set<string>();
  const commands = (items: unknown): ExecutionConfig['checks'] => {
    if (!Array.isArray(items) || items.length > 20) {
      throw new OperationError('commandGroupLimit');
    }
    return items.map((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) ||
        ids.has(item.id) ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        item.name.length > 200 ||
        typeof item.program !== 'string' ||
        !item.program.trim() ||
        item.program.startsWith('-') ||
        item.program.includes('\0') ||
        item.program.length > 2048 ||
        !Array.isArray(item.args) ||
        item.args.length > 100 ||
        item.args.some(
          (arg: unknown) => typeof arg !== 'string' || arg.length > 10000 || arg.includes('\0'),
        ) ||
        !Number.isSafeInteger(item.timeoutSeconds) ||
        item.timeoutSeconds < 10 ||
        item.timeoutSeconds > 900
      ) {
        throw new OperationError('commandInvalid');
      }
      ids.add(item.id);
      return {
        id: item.id,
        name: item.name,
        program: item.program,
        args: [...item.args],
        timeoutSeconds: item.timeoutSeconds,
      };
    });
  };
  if (
    config.customCommandsEnabled !== undefined &&
    typeof config.customCommandsEnabled !== 'boolean'
  ) {
    throw new OperationError('commandConfigInvalid');
  }
  const prepare = commands(config.prepare),
    checks = commands(config.checks);
  return {
    prepare,
    checks,
    customCommandsEnabled: config.customCommandsEnabled ?? Boolean(prepare.length || checks.length),
  };
}
