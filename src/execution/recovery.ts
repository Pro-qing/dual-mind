import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskDraft } from '../shared/model';
import type { Agent, ExecutionConfig, RunSummary, TaskMessage } from '../shared/execution';
import { OperationError } from '../shared/errors';
import type { AgentPhase } from './contracts';
import type { ProcessIdentity } from './processTree';

export type RecoveryStage =
  | 'planning'
  | 'preparing'
  | 'worker'
  | 'checking'
  | 'reviewer'
  | 'reviewResult'
  | 'answering'
  | 'completed'
  | 'roundLimit';
export interface RecoveryCursor {
  stage: RecoveryStage;
  index: number;
}
export interface RecoveryState {
  version: 1;
  task: TaskDraft;
  config: ExecutionConfig;
  summary: RunSummary;
  projections?: {
    detail: import('../shared/execution').ExecutionDetail;
    round: number;
    agent: Agent;
    text: string;
  }[];
  generation: number;
  cursor: RecoveryCursor;
  returning?: RecoveryCursor;
  continuation?: RunSummary;
  phase?: AgentPhase | 'preparing' | 'checking';
  agent?: Agent;
  budgets: Record<string, { turn: number; corrections: number }>;
  turn: number;
  corrections: number;
  requestId?: string;
  accepted?: { phase: AgentPhase; value: Record<string, unknown>; id: string };
  handling: string[];
  feedback: string[];
  reviewFeedback: boolean;
  reviewRevision?: string;
  submissionRound?: number;
  roundExhausted?: boolean;
  answer?: TaskMessage;
  planApplied?: boolean;
}
export interface RecoveryOperation {
  id: string;
  generation: number;
  kind: 'model' | 'tool' | 'command' | 'environment';
  phase?: RecoveryState['phase'];
  agent?: Agent;
  name: string;
  status: 'pending' | 'started' | 'succeeded' | 'failed' | 'unknown';
  requestId?: string;
  nextAttempt?: number;
  args?: unknown;
  result?: unknown;
  process?: ProcessIdentity;
  cleanup?: 'confirmed' | 'unconfirmed';
  time: string;
}
type Payload =
  { kind: 'state'; value: RecoveryState } | { kind: 'operation'; value: RecoveryOperation };
interface Entry {
  version: 1;
  sequence: number;
  previous: string;
  payload: Payload;
  hash: string;
}
export interface RecoveryData {
  state: RecoveryState;
  operations: RecoveryOperation[];
  torn: boolean;
}
const limit = 64 * 1024 * 1024;
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
const digest = (entry: Omit<Entry, 'hash'>) =>
  createHash('sha256').update(JSON.stringify(entry)).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** The journal is authoritative; the snapshot is a checked index, never a substitute for missing operations. */
export class RecoveryStore {
  private chain: Promise<unknown> = Promise.resolve();
  private sequence = 0;
  private hash = '';
  private bytes = 0;
  private poisoned = false;
  private tornAt?: number;
  constructor(
    private readonly folder: string,
    readonly runId: string,
  ) {
    if (!validId(runId)) {
      throw new OperationError('recoveryInvalid');
    }
  }
  private file(suffix: string) {
    return join(this.folder, `${this.runId}.${suffix}`);
  }
  async load(): Promise<RecoveryData | undefined> {
    await this.chain;
    let buffer: Buffer;
    try {
      if ((await stat(this.file('journal'))).size > limit) {
        throw new OperationError('historyLimit');
      }
      buffer = await readFile(this.file('journal'));
    } catch (error) {
      if (missing(error)) {
        return undefined;
      }
      throw error;
    }
    const end = buffer.lastIndexOf(10) + 1;
    const torn = end !== buffer.length;
    const lines = buffer.subarray(0, end).toString('utf8').split('\n').filter(Boolean);
    let state: RecoveryState | undefined;
    const operations = new Map<string, RecoveryOperation>();
    const hashes = new Map<number, string>();
    let sequence = 0,
      hash = '';
    for (const line of lines) {
      let entry: Entry;
      try {
        entry = JSON.parse(line) as Entry;
      } catch {
        throw new OperationError('recoveryInvalid');
      }
      const { hash: actual, ...body } = entry;
      if (
        entry.version !== 1 ||
        entry.sequence !== sequence + 1 ||
        entry.previous !== hash ||
        actual !== digest(body)
      ) {
        throw new OperationError('recoveryInvalid');
      }
      const payload = entry.payload;
      if (payload?.kind === 'state') {
        const value = payload.value;
        if (
          value?.version !== 1 ||
          value.summary?.id !== this.runId ||
          !validId(value.task?.id ?? '') ||
          value.summary.taskId !== value.task.id ||
          !Number.isSafeInteger(value.generation) ||
          value.generation < 1 ||
          ![
            'planning',
            'preparing',
            'worker',
            'checking',
            'reviewer',
            'reviewResult',
            'answering',
            'completed',
            'roundLimit',
          ].includes(value.cursor?.stage) ||
          !Number.isSafeInteger(value.cursor.index) ||
          value.cursor.index < 0 ||
          !Number.isSafeInteger(value.turn) ||
          value.turn < 0 ||
          value.turn > 20 ||
          !Number.isSafeInteger(value.corrections) ||
          value.corrections < 0 ||
          typeof value.task.requirements !== 'string' ||
          typeof value.task.role?.instructions !== 'string' ||
          !Number.isSafeInteger(value.summary.round) ||
          value.summary.round < 0 ||
          !Number.isSafeInteger(value.summary.maxRounds) ||
          value.summary.maxRounds < 1 ||
          !value.budgets ||
          typeof value.budgets !== 'object' ||
          Array.isArray(value.budgets) ||
          Object.values(value.budgets).some(
            (budget) =>
              !budget ||
              !Number.isSafeInteger(budget.turn) ||
              budget.turn < 0 ||
              budget.turn > 20 ||
              !Number.isSafeInteger(budget.corrections) ||
              budget.corrections < 0 ||
              budget.corrections > 3,
          ) ||
          !Array.isArray(value.handling) ||
          !Array.isArray(value.feedback)
        ) {
          throw new OperationError('recoveryInvalid');
        }
        state = value;
      } else if (payload?.kind === 'operation') {
        const op = payload.value;
        if (
          !op ||
          !validId(op.id) ||
          !['model', 'tool', 'command', 'environment'].includes(op.kind) ||
          !['pending', 'started', 'succeeded', 'failed', 'unknown'].includes(op.status) ||
          !Number.isSafeInteger(op.generation)
        ) {
          throw new OperationError('recoveryInvalid');
        }
        const previous = operations.get(op.id);
        if (
          previous &&
          (previous.generation !== op.generation ||
            previous.kind !== op.kind ||
            ['succeeded', 'failed'].includes(previous.status))
        ) {
          throw new OperationError('recoveryInvalid');
        }
        operations.set(op.id, op);
      } else {
        throw new OperationError('recoveryInvalid');
      }
      sequence = entry.sequence;
      hash = actual;
      hashes.set(sequence, hash);
    }
    if (!state) {
      throw new OperationError('recoveryInvalid');
    }
    // A torn snapshot can be rebuilt from the complete journal; a conflicting index cannot.
    for (const suffix of ['checkpoint', 'previous']) {
      let snapshot: { sequence: number; hash: string; state: RecoveryState };
      try {
        snapshot = JSON.parse(await readFile(this.file(suffix), 'utf8'));
      } catch (error) {
        if (missing(error) || error instanceof SyntaxError) {
          continue;
        }
        throw error;
      }
      if (
        !Number.isSafeInteger(snapshot.sequence) ||
        hashes.get(snapshot.sequence) !== snapshot.hash ||
        snapshot.state?.summary?.id !== this.runId
      ) {
        throw new OperationError('recoveryInvalid');
      }
    }
    this.sequence = sequence;
    this.hash = hash;
    this.bytes = end;
    this.tornAt = torn ? end : undefined;
    return { state, operations: [...operations.values()], torn };
  }
  state(value: RecoveryState) {
    return this.append({ kind: 'state', value: structuredClone(value) });
  }
  operation(value: RecoveryOperation) {
    return this.append({ kind: 'operation', value: structuredClone(value) });
  }
  private append(payload: Payload): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.poisoned) {
        throw new OperationError('persistenceFailed');
      }
      try {
        await mkdir(this.folder, { recursive: true, mode: 0o700 });
        if (this.tornAt !== undefined) {
          await truncate(this.file('journal'), this.tornAt);
          this.tornAt = undefined;
        }
        const body: Omit<Entry, 'hash'> = {
          version: 1,
          sequence: this.sequence + 1,
          previous: this.hash,
          payload,
        };
        const hash = digest(body);
        const line = `${JSON.stringify({ ...body, hash })}\n`;
        if (this.bytes + Buffer.byteLength(line) > limit) {
          throw new OperationError('historyLimit');
        }
        const file = await open(this.file('journal'), 'a', 0o600);
        try {
          await file.writeFile(line);
          await file.sync();
        } finally {
          await file.close();
        }
        this.sequence = body.sequence;
        this.hash = hash;
        this.bytes += Buffer.byteLength(line);
        if (payload.kind === 'state') {
          await this.snapshot({ sequence: this.sequence, hash, state: payload.value });
        }
      } catch (error) {
        this.poisoned = true;
        throw error instanceof OperationError ? error : new OperationError('persistenceFailed');
      }
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async snapshot(value: unknown) {
    const temp = this.file(`${randomUUID()}.tmp`);
    try {
      const file = await open(temp, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(value));
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await rename(this.file('checkpoint'), this.file('previous'));
      } catch (error) {
        if (!missing(error)) {
          throw error;
        }
      }
      await rename(temp, this.file('checkpoint'));
      if (process.platform !== 'win32') {
        const directory = await open(this.folder, 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
    } finally {
      await rm(temp, { force: true });
    }
  }
  async remove() {
    await this.chain;
    for (const suffix of ['journal', 'checkpoint', 'previous']) {
      await rm(this.file(suffix), { force: true });
    }
  }
}
