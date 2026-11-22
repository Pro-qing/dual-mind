import { RecoveryStore } from './recovery';
import { OperationError, errorText } from '../shared/errors';
import { appendFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type {
  RunEvent,
  RunSummary,
  ExecutionConfig,
  TaskMessage,
  ConversationPage,
  EvidencePage,
} from '../shared/execution';
import { emptyExecutionConfig, terminalStatuses } from '../shared/execution';
import type { StateStorage } from '../core/store';
export const executionStorageKey = 'dualMind.execution.v1';
export class RunRecords {
  private chain: Promise<unknown> = Promise.resolve();
  config: ExecutionConfig = emptyExecutionConfig();
  runs: RunSummary[] = [];
  conversationVersion = 0;
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
    for (const taskId of new Set(this.runs.map((run) => run.taskId))) {
      const messages = await this.messages(taskId);
      await this.updateMessages(
        taskId,
        messages.filter((m) => m.status === 'processing').map((m) => m.id),
        'pending',
        undefined,
        { code: 'executionInterrupted' },
      );
    }
    await this.save();
  }
  snapshot() {
    return structuredClone({
      config: this.config,
      runs: this.runs,
      conversationVersion: this.conversationVersion,
    });
  }
  save(): Promise<void> {
    const value = { version: 1, ...this.snapshot() };
    const next = this.chain.then(() => this.state.update(executionStorageKey, value));
    this.chain = next.catch(() => undefined);
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
    this.chain = next.catch(() => undefined);
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
    this.chain = next.catch(() => undefined);
    return next;
  }
  async history(runId: string, before = Number.MAX_SAFE_INTEGER, limit = 80): Promise<RunEvent[]> {
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
          if (result.length > limit) {
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
  private messageFile(taskId: string) {
    if (!/^[0-9a-f-]{36}$/.test(taskId) || !this.root()) {
      throw new OperationError('conversationUnavailable');
    }
    return join(this.root()!, 'conversations', `${taskId}.jsonl`);
  }
  private async readMessages(taskId: string): Promise<TaskMessage[]> {
    let text: string;
    try {
      text = await readFile(this.messageFile(taskId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new OperationError('conversationUnavailable');
    }
    const messages = new Map<string, TaskMessage>();
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const message = JSON.parse(line) as TaskMessage;
        if (
          message.taskId !== taskId ||
          typeof message.id !== 'string' ||
          typeof message.text !== 'string'
        ) {
          throw new Error();
        }
        messages.set(message.id, message);
      } catch {
        throw new OperationError('conversationUnavailable');
      }
    }
    return [...messages.values()];
  }
  async messages(taskId: string) {
    await this.chain;
    return this.readMessages(taskId);
  }
  putMessage(message: TaskMessage, create = false): Promise<TaskMessage> {
    const next = this.chain.then(async () => {
      const existing = (await this.readMessages(message.taskId)).find((m) => m.id === message.id);
      if (create && existing) {
        if (existing.text !== message.text) {
          throw new OperationError('messageConflict');
        }
        return existing;
      }
      await mkdir(join(this.root()!, 'conversations'), { recursive: true, mode: 0o700 });
      await appendFile(this.messageFile(message.taskId), `${JSON.stringify(message)}\n`, {
        mode: 0o600,
      });
      this.conversationVersion++;
      return message;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
  async pending(taskId: string) {
    return (await this.messages(taskId)).filter((m) => m.role === 'user' && m.status !== 'handled');
  }
  async updateMessages(
    taskId: string,
    ids: string[],
    status: TaskMessage['status'],
    runId?: string,
    fault?: TaskMessage['fault'],
  ) {
    for (const message of await this.messages(taskId)) {
      if (ids.includes(message.id)) {
        await this.putMessage({ ...message, status, runId: runId ?? message.runId, fault });
      }
    }
  }
  async conversation(
    taskId: string,
    before?: string,
    includeProcess = false,
  ): Promise<ConversationPage> {
    if (
      typeof includeProcess !== 'boolean' ||
      (before !== undefined && (typeof before !== 'string' || before.length > 200))
    ) {
      throw new OperationError('conversationUnavailable');
    }
    const messages = await this.messages(taskId);
    const processMessages = new Map<string, TaskMessage>();
    for (const run of this.runs.filter((r) => r.taskId === taskId)) {
      for (const event of await this.history(
        run.id,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      )) {
        const detail = event.detail;
        if (
          includeProcess &&
          event.kind === 'text' &&
          event.requestId &&
          (event.agent === 'worker' || event.agent === 'reviewer')
        ) {
          const key = JSON.stringify([event.runId, event.agent, event.requestId]);
          const existing = processMessages.get(key);
          if (existing) {
            existing.text += event.text;
            existing.sequence = Math.max(existing.sequence!, event.sequence);
          } else {
            const message: TaskMessage = {
              id: `${event.runId}:process:${String(event.sequence).padStart(10, '0')}`,
              taskId,
              time: event.time,
              role: event.agent,
              kind: 'process',
              text: event.text,
              runId: event.runId,
              requestId: event.requestId,
              sequence: event.sequence,
              round: event.round,
            };
            processMessages.set(key, message);
            messages.push(message);
          }
        } else if (detail && detail.type !== 'command') {
          messages.push({
            id: `${event.runId}:${String(event.sequence).padStart(10, '0')}`,
            taskId,
            time: event.time,
            role: event.agent ?? 'system',
            kind: event.agent ? detail.type : 'legacy',
            text: event.text,
            runId: event.runId,
            sequence: event.sequence,
            round: event.round,
            detail,
          });
        } else if (event.kind === 'error' || event.kind === 'feedback' || event.kind === 'review') {
          messages.push({
            id: `${event.runId}:${String(event.sequence).padStart(10, '0')}`,
            taskId,
            time: event.time,
            role: 'system',
            kind: event.kind === 'error' ? 'error' : 'legacy',
            text: event.text,
            runId: event.runId,
            sequence: event.sequence,
            fault: event.fault,
          });
        }
      }
    }
    const ordered = messages
      .sort((a, b) => messageCursor(a).localeCompare(messageCursor(b)))
      .filter((m) => !before || messageCursor(m) < before);
    const page = ordered.slice(-40);
    return {
      messages: page,
      before: ordered.length > page.length ? messageCursor(page[0]) : undefined,
    };
  }
  async evidence(
    taskId: string,
    runId?: string,
    through?: number,
    before?: string,
  ): Promise<EvidencePage> {
    if (
      (before !== undefined && (typeof before !== 'string' || before.length > 200)) ||
      (through !== undefined && (!Number.isSafeInteger(through) || through < 0))
    ) {
      throw new OperationError('historyUnavailable');
    }
    const events: RunEvent[] = [];
    for (const run of this.runs.filter((r) => r.taskId === taskId && (!runId || r.id === runId))) {
      events.push(
        ...(
          await this.history(
            run.id,
            (through ?? Number.MAX_SAFE_INTEGER - 1) + 1,
            Number.MAX_SAFE_INTEGER,
          )
        ).filter((e) => !['plan', 'submission', 'review', 'feedback', 'state'].includes(e.kind)),
      );
    }
    const grouped = new Map<string, RunEvent>();
    for (const event of events) {
      const key = event.commandId
        ? `${event.runId}:command:${event.commandId}`
        : event.kind === 'text' && event.requestId
          ? `${event.runId}:text:${event.requestId}`
          : `${event.runId}:${event.sequence}`;
      const previous = grouped.get(key);
      if (previous) {
        previous.text += event.text;
      } else {
        grouped.set(key, structuredClone(event));
      }
    }
    const summary = {
      records: grouped.size,
      errors: [...grouped.values()].filter(
        (event) =>
          event.kind === 'error' ||
          Boolean(event.fault) ||
          (event.detail?.type === 'command' && !event.detail.command.ok),
      ).length,
    };
    const ordered = [...grouped.values()]
      .sort((a, b) => eventCursor(a).localeCompare(eventCursor(b)))
      .filter((e) => !before || eventCursor(e) < before);
    const page = ordered.slice(-80);
    return {
      events: page,
      summary,
      before: ordered.length > page.length ? eventCursor(page[0]) : undefined,
    };
  }
  recovery(runId: string) {
    const root = this.root();
    if (!root) {
      throw new OperationError('executionStorageUnavailable');
    }
    return new RecoveryStore(join(root, 'recovery'), runId);
  }
  async removeTask(taskId: string) {
    for (const run of this.runs.filter((run) => run.taskId === taskId)) {
      await this.recovery(run.id).remove();
    }
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

function messageCursor(message: TaskMessage) {
  return `${message.time}:${message.id}`;
}
function eventCursor(event: RunEvent) {
  return `${event.time}:${event.runId}:${String(event.sequence).padStart(10, '0')}`;
}
