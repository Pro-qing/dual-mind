import { mkdir, realpath, lstat, rm, chmod } from 'node:fs/promises';
import * as path from 'node:path';
import type { StateStorage } from '../core/store';
import { OperationError } from '../shared/errors';
import type { TaskDraft } from '../shared/model';
import type { TaskGitWorkspace } from '../shared/execution';
import type {
  ArtifactFile,
  ArtifactMerge,
  SavedArtifact,
  TaskArtifactStatus,
} from '../shared/artifacts';
import { GitProcess } from './process';
import { serialized } from './taskWorkspaces';
import {
  artifactHash,
  artifactPath,
  contentHash,
  gitFiles,
  inventory,
  objectFormat,
  sameFiles,
  treeFiles,
  validCommit,
  validOperationId,
  verifyResidual,
} from './artifactFiles';

export const artifactsStorageKey = 'dualMind.git.artifacts.v1';
interface CommitOperation {
  id: string;
  before: string;
  content: string;
  message: string;
  result?: string;
}
interface CleanupOperation {
  id: string;
  snapshotId: string;
  stage: 'saving' | 'removing' | 'cleaned';
  residual?: ArtifactFile[];
  algorithm?: string;
}
interface ArtifactEntry {
  taskId: string;
  accepted?: { runId: string; revision: string; content: string };
  commit?: CommitOperation;
  merge?: ArtifactMerge;
  cleanup?: CleanupOperation;
  restore?: { operationId: string; snapshotId: string; complete: boolean };
}
interface ArtifactData {
  version: 1;
  tasks: ArtifactEntry[];
  saved: SavedArtifact[];
}
export interface ArtifactPorts {
  state: StateStorage;
  source(): Promise<{ repository: string; commonDir: string; storage: string }>;
  registered(taskId: string): Promise<TaskGitWorkspace>;
  fingerprint(taskId: string): Promise<string>;
  markCleaned(taskId: string, snapshotId: string): Promise<void>;
  prepareSnapshot(taskId: string, name: string, saved: SavedArtifact): Promise<TaskGitWorkspace>;
}
const exists = async (file: string) =>
  lstat(file).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    },
  );
const activeMerge = (entry?: ArtifactEntry) =>
  entry?.merge && !['integrated', 'aborted'].includes(entry.merge.state);
function identity(id: string) {
  if (!validOperationId(id)) {
    throw new OperationError('invalidExecution');
  }
}
function branchName(name: string) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.startsWith('-') ||
    name.length > 1000 ||
    [...name].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || '~^:?*[\\'.includes(char),
    ) ||
    name.includes('..') ||
    name.includes('@{')
  ) {
    throw new OperationError('invalidExecution');
  }
}

/** Git mutations are host-owned, explicit and journaled before changing a worktree. */
export class TaskArtifacts {
  constructor(
    private readonly ports: ArtifactPorts,
    private readonly git: GitProcess,
  ) {}
  private data(): ArtifactData {
    const data = this.ports.state.get<ArtifactData>(artifactsStorageKey, {
      version: 1,
      tasks: [],
      saved: [],
    });
    if (
      data?.version !== 1 ||
      !Array.isArray(data.tasks) ||
      !Array.isArray(data.saved) ||
      new Set(data.tasks.map((e) => e.taskId)).size !== data.tasks.length ||
      new Set(data.saved.map((e) => e.id)).size !== data.saved.length ||
      data.tasks.some((e) => !e || !validOperationId(e.taskId)) ||
      data.saved.some(
        (e) =>
          !e ||
          !validOperationId(e.id) ||
          !validOperationId(e.taskId) ||
          !validCommit(e.head) ||
          !validCommit(e.baseCommit) ||
          !Array.isArray(e.files) ||
          !Array.isArray(e.excluded) ||
          e.headRef !== `refs/dualmind/snapshots/${e.id}/head` ||
          (e.stashRef && e.stashRef !== `refs/dualmind/snapshots/${e.id}/work`),
      )
    ) {
      throw new OperationError('artifactStorage');
    }
    return structuredClone(data);
  }
  private entry(id: string): ArtifactEntry {
    return this.data().tasks.find((e) => e.taskId === id) ?? { taskId: id };
  }
  private async save(entry: ArtifactEntry, snapshot?: SavedArtifact) {
    const data = this.data();
    data.tasks = [...data.tasks.filter((e) => e.taskId !== entry.taskId), structuredClone(entry)];
    if (snapshot) {
      data.saved = [...data.saved.filter((e) => e.id !== snapshot.id), structuredClone(snapshot)];
    }
    try {
      await this.ports.state.update(artifactsStorageKey, data);
    } catch {
      throw new OperationError('artifactStorage');
    }
  }
  committedHead(taskId: string) {
    return this.entry(taskId).commit?.result;
  }
  states() {
    return this.data().tasks.map((entry) => ({
      taskId: entry.taskId,
      cleaned: entry.cleanup?.stage === 'cleaned',
      pending: Boolean(
        activeMerge(entry) ||
        (entry.commit && !entry.commit.result) ||
        (entry.cleanup && entry.cleanup.stage !== 'cleaned') ||
        (entry.restore && !entry.restore.complete),
      ),
      snapshotId: entry.cleanup?.snapshotId,
      merge: entry.merge,
    }));
  }
  private async locked<T>(
    taskId: string,
    action: (record: TaskGitWorkspace) => Promise<T>,
  ): Promise<T> {
    identity(taskId);
    const source = await this.ports.source();
    return serialized(`repository:${source.commonDir}`, async () => {
      const record = await this.ports.registered(taskId);
      if (record.commonDir !== source.commonDir || record.repository !== source.repository) {
        throw new OperationError('artifactChanged');
      }
      return action(record);
    });
  }
  private managed(record: TaskGitWorkspace) {
    if ((record.strategy?.mode ?? 'managed') !== 'managed') {
      throw new OperationError('artifactManagedOnly');
    }
  }
  private async head(directory: string) {
    return (await this.git.checked(['rev-parse', '--verify', 'HEAD^{commit}'], directory)).trim();
  }
  private async ref(directory: string, name: string): Promise<string | undefined> {
    const value = await this.git.run(['rev-parse', '--verify', name], directory);
    const sha = value.stdout.trim();
    return !value.code && validCommit(sha) ? sha : undefined;
  }
  private async registrations(repository: string) {
    return (await this.git.checked(['worktree', 'list', '--porcelain'], repository))
      .split('\n\n')
      .filter(Boolean)
      .map((block) => {
        const lines = block.split('\n');
        return {
          directory: lines.find((l) => l.startsWith('worktree '))?.slice(9) ?? '',
          branch: lines.find((l) => l.startsWith('branch '))?.slice(7),
          head: lines.find((l) => l.startsWith('HEAD '))?.slice(5),
        };
      });
  }
  private async directory(record: TaskGitWorkspace, allowDetached = false) {
    if (!(await exists(record.directory))) {
      return false;
    }
    const info = await lstat(record.directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await realpath(record.directory)) !== record.directory
    ) {
      throw new OperationError('artifactUnsafe');
    }
    const top = (await this.git.checked(['rev-parse', '--show-toplevel'], record.directory)).trim();
    const common = (
      await this.git.checked(['rev-parse', '--git-common-dir'], record.directory)
    ).trim();
    const entry = (await this.registrations(record.repository)).find(
      (e) => path.resolve(e.directory) === record.directory,
    );
    if (
      path.resolve(top) !== record.directory ||
      (await realpath(path.resolve(record.directory, common))) !== record.commonDir ||
      !entry ||
      (!allowDetached && entry.branch !== `refs/heads/${record.branch}`)
    ) {
      throw new OperationError('artifactChanged');
    }
    return true;
  }
  private async current(record: TaskGitWorkspace, cleanup = false) {
    const present = await this.directory(record, cleanup);
    const entry = this.entry(record.taskId);
    if (!present) {
      const head =
        (await this.ref(record.repository, `refs/heads/${record.branch}`)) ?? record.baseCommit;
      return {
        head,
        files: [] as ArtifactFile[],
        excluded: [] as string[],
        content: '',
        changes: '',
        missing: true,
        token: artifactHash({
          taskId: record.taskId,
          directory: record.directory,
          head,
          missing: true,
          lifecycle: record.lifecycle,
        }),
      };
    }
    const head = await this.head(record.directory);
    const captured = await inventory(this.git, record.directory);
    const content = contentHash(await gitFiles(this.git, record.directory));
    const changes = await this.git.checked(
      ['status', '--porcelain=v1', '--untracked-files=all'],
      record.directory,
    );
    const token = artifactHash({
      taskId: record.taskId,
      head,
      files: captured.files,
      excluded: captured.excluded,
      changes,
      merge: entry.merge,
    });
    return { head, ...captured, content, changes, token, missing: false };
  }
  private checkToken(actual: string, expected: string) {
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected) || actual !== expected) {
      throw new OperationError('artifactChanged');
    }
  }
  async inspect(taskId: string): Promise<TaskArtifactStatus> {
    return this.locked(taskId, (record) => this.inspectRecord(record));
  }
  private async inspectRecord(record: TaskGitWorkspace): Promise<TaskArtifactStatus> {
    let entry = this.entry(record.taskId);
    if (activeMerge(entry) || entry.merge?.directoryRetained) {
      await this.validateMergeDirectory(record, entry.merge!, true);
    }
    // Complete a commit whose Git update succeeded before the metadata write was interrupted.
    if (entry.commit && !entry.commit.result && (await this.directory(record))) {
      const head = await this.head(record.directory);
      if (head !== entry.commit.before) {
        const message = await this.git.checked(
          ['log', '-1', '--format=%B', 'HEAD'],
          record.directory,
        );
        const parent = await this.ref(record.directory, 'HEAD^');
        if (
          message.includes(`DualMind-Operation: ${entry.commit.id}`) &&
          parent === entry.commit.before &&
          contentHash(await gitFiles(this.git, record.directory)) === entry.commit.content
        ) {
          entry.commit.result = head;
          await this.save(entry);
        }
      }
    }
    entry = this.entry(record.taskId);
    const cleaned = record.lifecycle === 'cleaned' || entry.cleanup?.stage === 'cleaned';
    const current = cleaned
      ? {
          head: entry.commit?.result ?? record.baseCommit,
          changes: '',
          content: '',
          files: [],
          excluded: [],
          token: artifactHash({ taskId: record.taskId, cleaned: true }),
          missing: true,
        }
      : await this.current(record, true);
    const conflicts =
      entry.merge?.state === 'conflicted' && (await exists(entry.merge.directory))
        ? (
            await this.git.checked(
              ['diff', '--name-only', '--diff-filter=U', '-z'],
              entry.merge.directory,
            )
          )
            .split('\0')
            .filter(Boolean)
        : undefined;
    const changedFiles: NonNullable<TaskArtifactStatus['changedFiles']> = [];
    if (!cleaned && !current.missing) {
      const entries = (
        await this.git.checked(
          ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
          record.directory,
        )
      )
        .split('\0')
        .filter(Boolean);
      for (let i = 0; i < entries.length; i++) {
        const status = entries[i].slice(0, 2),
          path = entries[i].slice(3);
        changedFiles.push({
          path,
          status,
          ...(/[RC]/.test(status) ? { previousPath: entries[++i] } : {}),
        });
      }
    }
    return {
      changedFiles,
      pendingCommitMessage: entry.commit && !entry.commit.result ? entry.commit.message : undefined,
      restore: entry.restore,
      taskId: record.taskId,
      managed: (record.strategy?.mode ?? 'managed') === 'managed',
      directory: record.directory,
      branch: record.branch,
      sourceBranch: record.sourceBranch,
      baseCommit: record.baseCommit,
      head: current.head,
      token: current.token,
      changes: current.changes,
      files: current.files.map((f) => f.path),
      excluded: current.excluded,
      accepted: !cleaned && Boolean(entry.accepted && entry.accepted.content === current.content),
      acceptedRunId: entry.accepted?.runId,
      state: cleaned
        ? 'cleaned'
        : entry.merge?.state === 'conflicted'
          ? 'conflicted'
          : entry.merge?.state === 'integrated' &&
              entry.merge.sourceHead === current.head &&
              !current.changes
            ? 'integrated'
            : entry.commit?.result === current.head && !current.changes
              ? 'committed'
              : 'ready',
      missingDirectory: current.missing,
      snapshotId: entry.cleanup?.snapshotId,
      commitOperationId: entry.commit && !entry.commit.result ? entry.commit.id : undefined,
      cleanupOperationId: entry.cleanup?.stage !== 'cleaned' ? entry.cleanup?.id : undefined,
      merge: entry.merge,
      conflicts,
    };
  }
  async accept(taskId: string, runId: string, revision: string) {
    await this.locked(taskId, async (record) => {
      // Direct tasks need no managed result operations; their execution evidence is already persisted.
      if ((record.strategy?.mode ?? 'managed') !== 'managed') {
        return;
      }
      const before = await this.ports.fingerprint(taskId);
      if (before !== revision) {
        throw new OperationError('artifactChanged');
      }
      const files = await gitFiles(this.git, record.directory);
      if ((await this.ports.fingerprint(taskId)) !== revision) {
        throw new OperationError('artifactChanged');
      }
      const entry = this.entry(taskId);
      entry.accepted = { runId, revision, content: contentHash(files) };
      await this.save(entry);
    });
  }
  async commit(taskId: string, operationId: string, token: string, message: string) {
    identity(operationId);
    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 10000 ||
      message.includes('\0')
    ) {
      throw new OperationError('invalidExecution');
    }
    return this.locked(taskId, async (record) => {
      this.managed(record);
      if (record.lifecycle === 'cleaned') {
        throw new OperationError('workspaceArchived');
      }
      await this.inspectRecord(record);
      const entry = this.entry(taskId);
      if (activeMerge(entry) || entry.cleanup) {
        throw new OperationError('artifactBusy');
      }
      if (entry.commit?.id === operationId && entry.commit.result) {
        return this.inspectRecord(record);
      }
      const current = await this.current(record);
      if (current.missing) {
        throw new OperationError('artifactChanged');
      }
      if (entry.commit && !entry.commit.result) {
        if (
          entry.commit.id !== operationId ||
          entry.commit.before !== current.head ||
          entry.commit.content !== current.content ||
          entry.commit.message !== message.trim()
        ) {
          throw new OperationError('artifactChanged');
        }
      } else {
        this.checkToken(current.token, token);
        entry.commit = {
          id: operationId,
          before: current.head,
          content: current.content,
          message: message.trim(),
        };
        await this.save(entry);
      }
      if (current.changes) {
        await this.git.checked(['add', '-A', '--', '.'], record.directory);
        if (
          contentHash(await gitFiles(this.git, record.directory)) !== entry.commit.content ||
          (await this.head(record.directory)) !== entry.commit.before
        ) {
          throw new OperationError('artifactChanged');
        }
        await this.git.checked(
          [
            'commit',
            '--no-gpg-sign',
            '-m',
            `${entry.commit.message}\n\nDualMind-Operation: ${operationId}`,
          ],
          record.directory,
        );
      }
      entry.commit.result = await this.head(record.directory);
      await this.save(entry);
      return this.inspectRecord(record);
    });
  }
  private async validateMergeDirectory(
    record: TaskGitWorkspace,
    merge: ArtifactMerge,
    allowGone = false,
  ) {
    const source = await this.ports.source();
    const expected = merge.temporary
      ? path.join(source.storage, 'integration-worktrees', merge.operationId)
      : record.repository;
    identity(merge.operationId);
    branchName(merge.targetBranch);
    if (
      merge.directory !== expected ||
      !validCommit(merge.sourceHead) ||
      !validCommit(merge.targetHead)
    ) {
      throw new OperationError('artifactStorage');
    }
    if (!(await exists(expected))) {
      if (allowGone && ['integrated', 'aborted', 'preparing'].includes(merge.state)) {
        return false;
      }
      throw new OperationError('artifactChanged');
    }
    if ((await realpath(expected)) !== expected || (await lstat(expected)).isSymbolicLink()) {
      throw new OperationError('artifactUnsafe');
    }
    const registered = (await this.registrations(record.repository)).find(
      (e) => path.resolve(e.directory) === expected,
    );
    if (!registered || registered.branch !== `refs/heads/${merge.targetBranch}`) {
      throw new OperationError('artifactChanged');
    }
    return true;
  }
  async merge(
    taskId: string,
    operationId: string,
    token: string,
    targetBranch: string,
    expectedTargetHead?: string,
  ) {
    identity(operationId);
    branchName(targetBranch);
    return this.locked(taskId, async (record) => {
      this.managed(record);
      if (record.lifecycle === 'cleaned') {
        throw new OperationError('workspaceArchived');
      }
      const entry = this.entry(taskId);
      if (
        entry.cleanup ||
        (entry.commit && !entry.commit.result) ||
        (activeMerge(entry) && entry.merge!.operationId !== operationId)
      ) {
        throw new OperationError('artifactBusy');
      }
      if (entry.merge?.operationId === operationId) {
        if (entry.merge.targetBranch !== targetBranch) {
          throw new OperationError('artifactChanged');
        }
        if (['integrated', 'aborted', 'conflicted'].includes(entry.merge.state)) {
          return this.inspectRecord(record);
        }
      } else {
        const current = await this.current(record);
        this.checkToken(current.token, token);
        if (current.missing || current.changes || targetBranch === record.branch) {
          throw new OperationError('artifactNeedsCommit');
        }
        if (!entry.accepted || entry.accepted.content !== current.content) {
          throw new OperationError('artifactNotAccepted');
        }
        const targetHead = await this.ref(record.repository, `refs/heads/${targetBranch}`);
        if (expectedTargetHead !== undefined && expectedTargetHead !== targetHead) {
          throw new OperationError('artifactChanged');
        }
        if (
          !targetHead ||
          (
            await this.git.run(
              ['check-ref-format', `refs/heads/${targetBranch}`],
              record.repository,
            )
          ).code
        ) {
          throw new OperationError('artifactChanged');
        }
        const registrations = await this.registrations(record.repository);
        const occupied = registrations.find((e) => e.branch === `refs/heads/${targetBranch}`);
        if (occupied && path.resolve(occupied.directory) !== record.repository) {
          throw new OperationError('artifactBranchOccupied', undefined, occupied.directory);
        }
        const source = await this.ports.source();
        const directory = occupied
          ? record.repository
          : path.join(source.storage, 'integration-worktrees', operationId);
        if (
          occupied &&
          (await this.git.checked(['status', '--porcelain=v1', '--untracked-files=all'], directory))
        ) {
          throw new OperationError('dirtyRepository');
        }
        if ((await this.ref(record.repository, 'MERGE_HEAD')) && occupied) {
          throw new OperationError('artifactBusy');
        }
        if (!occupied && (await exists(directory))) {
          throw new OperationError('artifactChanged');
        }
        entry.merge = {
          operationId,
          sourceHead: current.head,
          targetBranch,
          targetHead,
          directory,
          temporary: !occupied,
          state: 'preparing',
        };
        await this.save(entry);
      }
      const merge = entry.merge!;
      if (merge.temporary && !(await exists(merge.directory))) {
        await mkdir(path.dirname(merge.directory), { recursive: true });
        if ((await realpath(path.dirname(merge.directory))) !== path.dirname(merge.directory)) {
          throw new OperationError('artifactUnsafe');
        }
        await this.git.checked(
          ['worktree', 'add', '--', merge.directory, merge.targetBranch],
          record.repository,
        );
      }
      await this.validateMergeDirectory(record, merge);
      if (await this.ref(merge.directory, 'MERGE_HEAD')) {
        return this.checkMergeRecord(record, entry);
      }
      const now = await this.head(merge.directory);
      if (now !== merge.targetHead) {
        return this.checkMergeRecord(record, entry);
      }
      if (
        await this.git.checked(
          ['status', '--porcelain=v1', '--untracked-files=all'],
          merge.directory,
        )
      ) {
        throw new OperationError('dirtyRepository');
      }
      if (
        (await this.head(record.directory)) !== merge.sourceHead ||
        contentHash(await gitFiles(this.git, record.directory)) !== entry.accepted?.content
      ) {
        throw new OperationError('artifactChanged');
      }
      merge.state = 'merging';
      await this.save(entry);
      const result = await this.git.run(
        [
          'merge',
          '--ff',
          '--no-edit',
          '--no-gpg-sign',
          '-m',
          `Merge DualMind task ${taskId}\n\nDualMind-Operation: ${operationId}`,
          '--',
          merge.sourceHead,
        ],
        merge.directory,
      );
      if (result.code && !(await this.ref(merge.directory, 'MERGE_HEAD'))) {
        throw new OperationError('artifactGitFailed');
      }
      return this.checkMergeRecord(record, entry);
    });
  }
  private async checkMergeRecord(record: TaskGitWorkspace, entry: ArtifactEntry) {
    const merge = entry.merge!;
    if (['integrated', 'aborted'].includes(merge.state)) {
      return this.inspectRecord(record);
    }
    await this.validateMergeDirectory(record, merge);
    const pending = await this.ref(merge.directory, 'MERGE_HEAD');
    const head = await this.head(merge.directory);
    if (pending) {
      if (pending !== merge.sourceHead || head !== merge.targetHead) {
        throw new OperationError('artifactChanged');
      }
      merge.state = 'conflicted';
      merge.hadConflicts = true;
    } else {
      const includesSource = await this.git.run(
        ['merge-base', '--is-ancestor', merge.sourceHead, head],
        merge.directory,
      );
      const includesTarget = await this.git.run(
        ['merge-base', '--is-ancestor', merge.targetHead, head],
        merge.directory,
      );
      if (includesSource.code || includesTarget.code) {
        throw new OperationError('artifactChanged');
      }
      merge.state = 'integrated';
      merge.resultHead = head;
      merge.verificationRequired = true;
    }
    await this.save(entry);
    if (merge.state === 'integrated') {
      await this.removeIntegration(record, entry);
    }
    return this.inspectRecord(record);
  }
  private async removeIntegration(record: TaskGitWorkspace, entry: ArtifactEntry) {
    const merge = entry.merge!;
    if (!merge.temporary || !(await exists(merge.directory))) {
      return;
    }
    const captured = await inventory(this.git, merge.directory);
    const tracked = (await this.git.checked(['ls-files', '-z'], merge.directory)).split('\0');
    // No implicit deletion of files created by manual conflict resolution, even ignored ones.
    if (
      captured.excluded.length ||
      captured.files.some((f) => !tracked.includes(f.path)) ||
      (await this.git.checked(
        ['status', '--porcelain=v1', '--untracked-files=all'],
        merge.directory,
      ))
    ) {
      merge.directoryRetained = true;
      await this.save(entry);
      return;
    }
    await this.git.checked(['worktree', 'remove', '--', merge.directory], record.repository);
    merge.directoryRetained = false;
    await this.save(entry);
  }
  async mergeAction(taskId: string, operationId: string, action: 'check' | 'complete' | 'abort') {
    identity(operationId);
    return this.locked(taskId, async (record) => {
      const entry = this.entry(taskId),
        merge = entry.merge;
      if (!merge || merge.operationId !== operationId) {
        throw new OperationError('artifactChanged');
      }
      if (action === 'check') {
        return this.checkMergeRecord(record, entry);
      }
      if (['integrated', 'aborted'].includes(merge.state)) {
        return this.inspectRecord(record);
      }
      await this.validateMergeDirectory(record, merge);
      const pending = await this.ref(merge.directory, 'MERGE_HEAD');
      if (!pending) {
        return this.checkMergeRecord(record, entry);
      }
      if (pending !== merge.sourceHead || (await this.head(merge.directory)) !== merge.targetHead) {
        throw new OperationError('artifactChanged');
      }
      if (action === 'abort') {
        await this.git.checked(['merge', '--abort'], merge.directory);
        merge.state = 'aborted';
        await this.save(entry);
        await this.removeIntegration(record, entry);
        return this.inspectRecord(record);
      }
      if (
        await this.git.checked(['diff', '--name-only', '--diff-filter=U', '-z'], merge.directory)
      ) {
        throw new OperationError('artifactConflicts');
      }
      await this.git.checked(
        [
          'commit',
          '--no-gpg-sign',
          '-m',
          `Resolve DualMind merge ${taskId}\n\nDualMind-Operation: ${operationId}`,
        ],
        merge.directory,
      );
      return this.checkMergeRecord(record, entry);
    });
  }
  async mergeDirectory(taskId: string, operationId: string) {
    return this.locked(taskId, async (record) => {
      const merge = this.entry(taskId).merge;
      if (
        !merge ||
        merge.operationId !== operationId ||
        !(await this.validateMergeDirectory(record, merge))
      ) {
        throw new OperationError('artifactChanged');
      }
      return merge.directory;
    });
  }
  private async anchor(repository: string, ref: string, head: string) {
    const current = await this.ref(repository, ref);
    if (current === head) {
      return;
    }
    if (current) {
      throw new OperationError('artifactChanged');
    }
    await this.git.checked(
      ['update-ref', '--create-reflog', '-m', 'DualMind saved task artifact', ref, head, ''],
      repository,
    );
  }
  private async savedStash(repository: string, id: string) {
    const tip = await this.ref(repository, 'refs/stash');
    if (!tip) {
      return undefined;
    }
    const log = await this.git.checked(
      ['reflog', 'show', '--format=%H%x00%gs%x00', 'refs/stash'],
      repository,
    );
    const matches: string[] = [];
    for (const line of log.split('\n')) {
      const [sha, subject] = line.split('\0');
      if (validCommit(sha) && subject?.endsWith(`DualMind snapshot ${id}`)) {
        matches.push(sha);
      }
    }
    if (new Set(matches).size > 1) {
      throw new OperationError('artifactChanged');
    }
    return matches[0];
  }
  private async verifySaved(snapshot: SavedArtifact) {
    if ((await this.ref(snapshot.repository, snapshot.headRef)) !== snapshot.head) {
      throw new OperationError('artifactStorage');
    }
    if (
      snapshot.stash &&
      (!snapshot.stashRef ||
        (await this.ref(snapshot.repository, snapshot.stashRef)) !== snapshot.stash)
    ) {
      throw new OperationError('artifactStorage');
    }
    if (snapshot.missingDirectory) {
      return;
    }
    const tracked = await treeFiles(this.git, snapshot.repository, snapshot.stash ?? snapshot.head);
    const untrackedParent = snapshot.stash
      ? await this.ref(snapshot.repository, `${snapshot.stash}^3`)
      : undefined;
    const untracked = untrackedParent
      ? await treeFiles(this.git, snapshot.repository, untrackedParent)
      : new Map<string, { mode: string; hash: string }>();
    for (const file of snapshot.files) {
      artifactPath('/validation', file.path);
      const saved = tracked.get(file.path) ?? untracked.get(file.path);
      if (
        file.kind === 'missing'
          ? Boolean(saved)
          : !saved ||
            saved.hash !== file.hash ||
            (file.kind === 'link') !== (saved.mode === '120000')
      ) {
        throw new OperationError('artifactPreservation');
      }
    }
  }
  private async removeBranch(record: TaskGitWorkspace, snapshot: SavedArtifact) {
    if (snapshot.branch !== record.branch) {
      return;
    }
    const ref = `refs/heads/${record.branch}`;
    if ((await this.ref(record.repository, ref)) !== snapshot.head) {
      return;
    }
    if ((await this.registrations(record.repository)).some((e) => e.branch === ref)) {
      return;
    }
    const other = await this.git.run(
      [
        'for-each-ref',
        '--format=%(refname)',
        '--contains',
        snapshot.head,
        'refs/heads',
        'refs/remotes',
        'refs/tags',
      ],
      record.repository,
    );
    if (
      !other.code &&
      other.stdout.split('\n').some((name) => name.trim() && name.trim() !== ref)
    ) {
      // Compare-and-swap prevents deleting a branch advanced by another Git client.
      await this.git.checked(['update-ref', '-d', ref, snapshot.head], record.repository);
    }
  }
  async cleanup(taskId: string, operationId: string, token: string, task?: TaskDraft) {
    identity(operationId);
    return this.locked(taskId, async (record) => {
      this.managed(record);
      const entry = this.entry(taskId);
      if (record.lifecycle === 'cleaned' && entry.cleanup && entry.cleanup.stage !== 'cleaned') {
        // The registry can be durable even if the final artifact-state write was interrupted.
        const saved = this.data().saved.find(
          (item) => item.id === entry.cleanup!.snapshotId && item.ready,
        );
        if (!saved || record.snapshotId !== saved.id) {
          throw new OperationError('artifactStorage');
        }
        await this.verifySaved(saved);
        entry.cleanup.stage = 'cleaned';
        await this.save(entry);
      }
      if (entry.cleanup?.stage === 'cleaned' || record.lifecycle === 'cleaned') {
        return this.inspectRecord(record);
      }
      if (
        activeMerge(entry) ||
        (entry.commit && !entry.commit.result) ||
        (entry.restore && !entry.restore.complete)
      ) {
        throw new OperationError('artifactBusy');
      }
      if (entry.cleanup && entry.cleanup.id !== operationId) {
        throw new OperationError('artifactBusy');
      }
      let snapshot: SavedArtifact;
      if (!entry.cleanup) {
        const current = await this.current(record, true);
        this.checkToken(current.token, token);
        if (!current.missing) {
          // Fail before recording cleanup intent when Git attributes would change user bytes.
          for (const file of current.files) {
            if (file.kind !== 'file') {
              continue;
            }
            const normalized = (
              await this.git.checked(
                ['hash-object', `--path=${file.path}`, '--', file.path],
                record.directory,
              )
            ).trim();
            if (normalized !== file.hash) {
              throw new OperationError('artifactPreservation');
            }
          }
        }
        const registration = (await this.registrations(record.repository)).find(
          (e) => path.resolve(e.directory) === record.directory,
        );
        const actualBranch = current.missing
          ? registration?.branch?.replace(/^refs\/heads\//, '')
          : (
              await this.git.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], record.directory)
            ).stdout.trim();
        const head =
          current.missing && validCommit(registration?.head) ? registration.head : current.head;
        snapshot = {
          id: operationId,
          taskId,
          taskName: task?.name ?? taskId,
          createdAt: new Date().toISOString(),
          repository: record.repository,
          commonDir: record.commonDir,
          sourceBranch: record.sourceBranch,
          baseCommit: record.baseCommit,
          branch: actualBranch ?? '',
          head,
          headRef: `refs/dualmind/snapshots/${operationId}/head`,
          files: current.files,
          excluded: current.excluded,
          ready: false,
          missingDirectory: current.missing,
          ...(task ? { task: structuredClone(task) } : {}),
        };
        entry.cleanup = { id: operationId, snapshotId: snapshot.id, stage: 'saving' };
        await this.save(entry, snapshot);
      } else {
        const saved = this.data().saved.find((s) => s.id === entry.cleanup!.snapshotId);
        if (!saved) {
          throw new OperationError('artifactStorage');
        }
        snapshot = saved;
      }
      if (snapshot.repository !== record.repository || snapshot.commonDir !== record.commonDir) {
        throw new OperationError('artifactStorage');
      }
      await this.anchor(record.repository, snapshot.headRef, snapshot.head);
      if (!snapshot.branch) {
        await this.anchor(
          record.repository,
          `refs/heads/dualmind/rescued-${snapshot.id}`,
          snapshot.head,
        );
      }
      if (entry.cleanup.stage === 'saving') {
        if (!snapshot.missingDirectory) {
          await this.directory(record, true);
          if ((await this.head(record.directory)) !== snapshot.head) {
            throw new OperationError('artifactChanged');
          }
          let stash = snapshot.stash ?? (await this.savedStash(record.repository, snapshot.id));
          if (!stash) {
            const current = await inventory(this.git, record.directory);
            if (
              !sameFiles(current.files, snapshot.files) ||
              artifactHash(current.excluded) !== artifactHash(snapshot.excluded)
            ) {
              throw new OperationError('artifactChanged');
            }
            // Detect text/eol/encoding transformations before stash can clear the working copy.
            for (const file of snapshot.files) {
              if (file.kind !== 'file') {
                continue;
              }
              const normalized = (
                await this.git.checked(
                  ['hash-object', `--path=${file.path}`, '--', file.path],
                  record.directory,
                )
              ).trim();
              if (normalized !== file.hash) {
                throw new OperationError('artifactPreservation');
              }
            }
            const args = [
              'stash',
              'push',
              '--all',
              '-m',
              `DualMind snapshot ${snapshot.id}`,
              '--',
              '.',
            ];
            for (const dir of snapshot.excluded) {
              artifactPath(record.directory, dir);
              args.push(`:(top,literal,exclude)${dir}`);
            }
            await this.git.checked(args, record.directory);
            stash = await this.savedStash(record.repository, snapshot.id);
          }
          if (stash) {
            snapshot.stash = stash;
            snapshot.stashRef = `refs/dualmind/snapshots/${snapshot.id}/work`;
            await this.anchor(record.repository, snapshot.stashRef, stash);
            await this.save(entry, snapshot);
          }
          await this.verifySaved(snapshot);
          // A new modification from outside the stopped task must not be removed.
          const remaining = await inventory(this.git, record.directory);
          const baseline = await treeFiles(this.git, record.repository, snapshot.head);
          for (const f of remaining.files) {
            const expected = baseline.get(f.path);
            if (
              f.kind === 'missing' ||
              !expected ||
              expected.hash !== f.hash ||
              (f.kind === 'link') !== (expected.mode === '120000')
            ) {
              throw new OperationError('artifactChanged');
            }
          }
          if (
            remaining.files.length !== baseline.size ||
            artifactHash(remaining.excluded) !== artifactHash(snapshot.excluded)
          ) {
            throw new OperationError('artifactChanged');
          }
          entry.cleanup.residual = remaining.files;
          entry.cleanup.algorithm = await objectFormat(this.git, record.repository);
        }
        snapshot.ready = true;
        entry.cleanup.stage = 'removing';
        await this.save(entry, snapshot);
      }
      await this.verifySaved(snapshot);
      const registered = (await this.registrations(record.repository)).some(
        (e) => path.resolve(e.directory) === record.directory,
      );
      if (registered) {
        if (await exists(record.directory)) {
          await this.directory(record, true);
          const remaining = await inventory(this.git, record.directory);
          if (
            (await this.head(record.directory)) !== snapshot.head ||
            !sameFiles(remaining.files, entry.cleanup.residual ?? []) ||
            artifactHash(remaining.excluded) !== artifactHash(snapshot.excluded)
          ) {
            throw new OperationError('artifactChanged');
          }
        }
        await this.git.checked(
          ['worktree', 'remove', '--force', '--', record.directory],
          record.repository,
        );
      } else if (await exists(record.directory)) {
        if (
          !entry.cleanup.residual ||
          !['sha1', 'sha256'].includes(entry.cleanup.algorithm ?? '') ||
          (await realpath(record.directory)) !== record.directory
        ) {
          throw new OperationError('artifactUnsafe');
        }
        await verifyResidual(
          record.directory,
          entry.cleanup.residual,
          snapshot.excluded,
          entry.cleanup.algorithm!,
        );
        await rm(record.directory, { recursive: true });
      }
      await this.removeBranch(record, snapshot);
      await this.ports.markCleaned(taskId, snapshot.id);
      entry.cleanup.stage = 'cleaned';
      await this.save(entry, snapshot);
      return this.inspectRecord({ ...record, lifecycle: 'cleaned', snapshotId: snapshot.id });
    });
  }
  async saved(): Promise<SavedArtifact[]> {
    const source = await this.ports.source();
    return this.data().saved.filter(
      (s) => s.repository === source.repository && s.commonDir === source.commonDir,
    );
  }
  async savedArtifact(id: string): Promise<SavedArtifact> {
    identity(id);
    const snapshot = (await this.saved()).find((s) => s.id === id && s.ready);
    if (!snapshot) {
      throw new OperationError('artifactStorage');
    }
    await this.verifySaved(snapshot);
    return snapshot;
  }
  /** Prepare and restore are separated so preparation retains its existing repository lock. */
  async restore(taskId: string, operationId: string, snapshotId: string, taskName: string) {
    identity(operationId);
    identity(taskId);
    const snapshot = await this.savedArtifact(snapshotId);
    const source = await this.ports.source();
    await serialized(`repository:${source.commonDir}`, async () => {
      const entry = this.entry(taskId);
      if (entry.restore) {
        if (entry.restore.operationId !== operationId || entry.restore.snapshotId !== snapshotId) {
          throw new OperationError('artifactChanged');
        }
      } else {
        // Preparation can create the directory before it returns. Record restore intent first so
        // a host crash cannot expose an un-restored task as ready for execution.
        entry.restore = { operationId, snapshotId, complete: false };
        await this.save(entry);
      }
    });
    const record = await this.ports.prepareSnapshot(taskId, taskName, snapshot);
    return this.locked(taskId, async (registered) => {
      this.managed(registered);
      if (
        registered.directory !== record.directory ||
        registered.snapshotId !== snapshot.id ||
        registered.baseCommit !== snapshot.head
      ) {
        throw new OperationError('artifactChanged');
      }
      const entry = this.entry(taskId);
      if (
        !entry.restore ||
        entry.restore.operationId !== operationId ||
        entry.restore.snapshotId !== snapshotId
      ) {
        throw new OperationError('artifactChanged');
      }
      if (entry.restore.complete) {
        return this.inspectRecord(registered);
      }
      if ((await this.head(registered.directory)) !== snapshot.head) {
        throw new OperationError('artifactChanged');
      }
      const current = await inventory(this.git, registered.directory);
      if (!sameFiles(current.files, snapshot.files) && snapshot.stash) {
        const baseline = await treeFiles(this.git, registered.directory, snapshot.head);
        if (
          current.files.some((f) => baseline.get(f.path)?.hash !== f.hash) ||
          current.files.length !== baseline.size ||
          current.excluded.length
        ) {
          throw new OperationError('artifactRestorePartial');
        }
        await this.git.checked(['stash', 'apply', '--index', snapshot.stash], registered.directory);
      }
      for (const f of snapshot.files) {
        if (f.kind === 'file') {
          const target = artifactPath(registered.directory, f.path);
          const info = await lstat(target);
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
            throw new OperationError('artifactUnsafe');
          }
          await chmod(target, f.mode);
        }
      }
      const restored = await inventory(this.git, registered.directory);
      if (!snapshot.missingDirectory && !sameFiles(restored.files, snapshot.files)) {
        throw new OperationError('artifactRestorePartial');
      }
      entry.restore.complete = true;
      // Restored files are unreviewed; never copy the previous task's acceptance proof.
      entry.accepted = undefined;
      await this.save(entry);
      return this.inspectRecord(registered);
    });
  }
}
