import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { StateStorage } from '../core/store';
import { GitProcess, GitTaskError } from './process';

export const taskGitStorageKey = 'dualMind.git.workspaces.v1';
const fileLimit = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface TaskGitWorkspace {
  taskId: string;
  repository: string;
  commonDir: string;
  sourceBranch: string;
  baseCommit: string;
  branch: string;
  directory: string;
  phase: 'preparing' | 'ready';
}
interface Registry {
  version: 1;
  entries: TaskGitWorkspace[];
}
interface Ports {
  state: StateStorage;
  folders(): readonly string[];
  storageRoot(): string | undefined;
  trusted(): boolean;
  taskExists(taskId: string): Promise<boolean>;
}
export interface TaskReader {
  listFiles(): Promise<string[]>;
  readFile(relativePath: string): Promise<string>;
  status(): Promise<string>;
  diff(): Promise<string>;
}
export interface TaskWriter extends TaskReader {
  writeFile(relativePath: string, contents: string): Promise<void>;
}
const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(action);
  queues.set(key, result);
  try {
    return await result;
  } finally {
    if (queues.get(key) === result) {
      queues.delete(key);
    }
  }
}
function fail(code: ConstructorParameters<typeof GitTaskError>[0], message: string): never {
  throw new GitTaskError(code, message);
}
async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
async function ensureDirectory(directory: string): Promise<void> {
  let current = path.parse(directory).root;
  for (const part of path.relative(current, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('invalidPath', 'Task storage must use ordinary directories without symbolic links.');
    }
  }
}
function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

/** Lazy host foundation. Nothing runs until prepare()/files() is explicitly called by the host. */
export class TaskWorkspaces {
  constructor(
    private readonly ports: Ports,
    private readonly git = new GitProcess(),
  ) {}
  private async source(
    taskId: string,
  ): Promise<{ repository: string; commonDir: string; storage: string }> {
    if (!this.ports.trusted()) {
      fail('workspaceUntrusted', 'Trust this workspace before preparing development files.');
    }
    if (!uuid.test(taskId) || !(await this.ports.taskExists(taskId))) {
      fail('taskNotFound', 'Save a task before preparing its development workspace.');
    }
    const folders = this.ports.folders();
    const storage = this.ports.storageRoot();
    if (folders.length !== 1 || !folders[0] || !storage) {
      fail(
        'workspaceUnsupported',
        'Open one local repository folder; multi-folder workspaces are not supported yet.',
      );
    }
    await this.git.version();
    const folder = await realpath(folders[0]);
    const top = await this.git.run(['rev-parse', '--show-toplevel'], folder);
    if (top.code) {
      fail(
        'notRepository',
        'This folder is not a working Git repository. Initialize and commit it manually first.',
      );
    }
    const repository = await realpath(top.stdout.trim());
    if (folder !== repository) {
      fail('workspaceUnsupported', 'Open the Git repository root as the workspace folder.');
    }
    const commonDir = await realpath(
      path.resolve(
        repository,
        (await this.git.checked(['rev-parse', '--git-common-dir'], repository)).trim(),
      ),
    );
    const parent = (
      await this.git.checked(['rev-parse', '--show-superproject-working-tree'], repository)
    ).trim();
    const index = await this.git.checked(['ls-files', '--stage', '-z'], repository);
    if (parent || index.split('\0').some((entry) => entry.startsWith('160000 '))) {
      fail('submodulesUnsupported', 'Submodules are not supported by task workspaces yet.');
    }
    const resolvedStorage = path.resolve(storage);
    if (within(repository, resolvedStorage)) {
      fail('workspaceUnsupported', 'Task storage must be outside the source repository.');
    }
    return { repository, commonDir, storage: resolvedStorage };
  }
  private registry(): Registry {
    const data = this.ports.state.get<Registry>(taskGitStorageKey, { version: 1, entries: [] });
    if (data?.version !== 1 || !Array.isArray(data.entries)) {
      fail('storageFailed', 'Invalid task Git registry; existing records were preserved.');
    }
    const ids = new Set<string>();
    for (const entry of data.entries) {
      if (
        !entry ||
        !uuid.test(entry.taskId) ||
        ids.has(entry.taskId) ||
        !['repository', 'commonDir', 'directory'].every(
          (key) =>
            typeof entry[key as keyof TaskGitWorkspace] === 'string' &&
            path.isAbsolute(entry[key as keyof TaskGitWorkspace]),
        ) ||
        typeof entry.sourceBranch !== 'string' ||
        !entry.sourceBranch ||
        !/^[0-9a-f]{40,64}$/.test(entry.baseCommit) ||
        entry.branch !== `dualmind/task/${entry.taskId}/worker` ||
        !['preparing', 'ready'].includes(entry.phase)
      ) {
        fail('storageFailed', 'Invalid task Git registry; existing records were preserved.');
      }
      ids.add(entry.taskId);
    }
    return structuredClone(data);
  }
  private async save(record: TaskGitWorkspace): Promise<void> {
    const data = this.registry();
    data.entries = [
      ...data.entries.filter((entry) => entry.taskId !== record.taskId),
      structuredClone(record),
    ];
    try {
      await this.ports.state.update(taskGitStorageKey, data);
    } catch {
      fail(
        'storageFailed',
        `Cannot save task Git state. Preserve and inspect ${record.branch} at ${record.directory} before retrying.`,
      );
    }
  }
  private async verify(record: TaskGitWorkspace): Promise<void> {
    const directory = record.directory;
    if (
      !(await exists(directory)) ||
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)) !== directory
    ) {
      fail(
        'workspaceChanged',
        `Task directory is missing or redirected: ${directory}. Nothing was reset or removed.`,
      );
    }
    const top = await this.git.run(['rev-parse', '--show-toplevel'], directory);
    const common = await this.git.run(['rev-parse', '--git-common-dir'], directory);
    const branch = await this.git.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], directory);
    if (
      top.code ||
      common.code ||
      branch.code ||
      path.resolve(top.stdout.trim()) !== directory ||
      (await realpath(path.resolve(directory, common.stdout.trim()))) !== record.commonDir ||
      branch.stdout.trim() !== record.branch
    ) {
      fail('workspaceChanged', `Task Git ownership changed at ${directory}; inspect it manually.`);
    }
    const ancestry = await this.git.run(
      ['merge-base', '--is-ancestor', record.baseCommit, 'HEAD'],
      directory,
    );
    if (ancestry.code) {
      fail(
        'workspaceChanged',
        `Task history no longer descends from its baseline at ${directory}.`,
      );
    }
    const registered = (
      await this.git.checked(['worktree', 'list', '--porcelain'], directory)
    ).split('\n\n');
    if (
      !registered.some(
        (block) =>
          block.split('\n').includes(`worktree ${directory}`) &&
          block.split('\n').includes(`branch refs/heads/${record.branch}`),
      )
    ) {
      fail('workspaceChanged', `Git no longer registers the task directory ${directory}.`);
    }
  }
  async prepare(taskId: string): Promise<TaskGitWorkspace> {
    const source = await this.source(taskId);
    return serialized(`repository:${source.commonDir}`, () =>
      serialized(`registry:${source.storage}`, async () => {
        // Recheck task/trust after waiting, before any filesystem or Git mutation.
        if (!this.ports.trusted() || !(await this.ports.taskExists(taskId))) {
          fail('accessDenied', 'Task or workspace access changed while preparing.');
        }
        const directory = path.join(
          source.storage,
          'task-worktrees',
          createHash('sha256').update(source.commonDir).digest('hex').slice(0, 16),
          taskId,
        );
        let record = this.registry().entries.find((entry) => entry.taskId === taskId);
        if (
          record &&
          (record.repository !== source.repository ||
            record.commonDir !== source.commonDir ||
            record.directory !== directory)
        ) {
          fail(
            'workspaceConflict',
            `The task is already bound to ${record.directory}; it cannot be rebound automatically.`,
          );
        }
        if (record && (await exists(directory))) {
          await this.verify(record);
          // A partial checkout is never promoted to ready automatically.
          if (
            record.phase === 'preparing' &&
            ((await this.git.checked(['rev-parse', 'HEAD'], directory)).trim() !==
              record.baseCommit ||
              (await this.git.checked(
                ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
                directory,
              )))
          ) {
            fail(
              'workspaceChanged',
              `Interrupted preparation has changes at ${directory}; inspect it manually before retrying.`,
            );
          }
          record.phase = 'ready';
          await this.save(record);
          return structuredClone(record);
        }
        if (record?.phase === 'ready') {
          fail(
            'workspaceChanged',
            `Task directory was removed: ${directory}. It will not be recreated automatically.`,
          );
        }
        const head = await this.git.run(
          ['rev-parse', '--verify', 'HEAD^{commit}'],
          source.repository,
        );
        if (head.code) {
          fail('noCommit', 'Commit the repository before preparing a task.');
        }
        const branch = await this.git.run(
          ['symbolic-ref', '--quiet', '--short', 'HEAD'],
          source.repository,
        );
        if (branch.code) {
          fail('detachedHead', 'Check out a named source branch before preparing a task.');
        }
        const status = await this.git.checked(
          ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
          source.repository,
        );
        if (status) {
          fail(
            'dirtyRepository',
            'Commit the changes needed by the task first. Staged, unstaged and untracked files were preserved.',
          );
        }
        if (!record) {
          record = {
            taskId,
            repository: source.repository,
            commonDir: source.commonDir,
            directory,
            branch: `dualmind/task/${taskId}/worker`,
            sourceBranch: branch.stdout.trim(),
            baseCommit: head.stdout.trim(),
            phase: 'preparing',
          };
          if (
            (await exists(directory)) ||
            (
              await this.git.run(
                ['show-ref', '--verify', '--quiet', `refs/heads/${record.branch}`],
                source.repository,
              )
            ).code !== 1
          ) {
            fail(
              'workspaceConflict',
              `Unregistered branch or directory already exists: ${record.branch}, ${directory}.`,
            );
          }
          await this.save(record);
        } else if (
          (
            await this.git.run(
              ['show-ref', '--verify', '--quiet', `refs/heads/${record.branch}`],
              source.repository,
            )
          ).code !== 1
        ) {
          fail(
            'workspaceConflict',
            `Preparation left branch ${record.branch} without its directory ${directory}; inspect it manually.`,
          );
        }
        await ensureDirectory(path.dirname(directory));
        if (
          (await realpath(path.dirname(directory))) !== path.dirname(directory) ||
          within(source.repository, await realpath(path.dirname(directory)))
        ) {
          fail(
            'invalidPath',
            'Task storage contains a symbolic link or redirects into the source repository.',
          );
        }
        try {
          await this.git.checked(
            ['worktree', 'add', '-b', record.branch, '--', directory, record.baseCommit],
            source.repository,
          );
        } catch (error) {
          throw new GitTaskError(
            error instanceof GitTaskError ? error.code : 'gitFailed',
            `Preparation failed for ${record.branch} at ${directory}. Resources and the preparation record were retained; inspect them before retrying.`,
          );
        }
        await this.verify(record);
        record.phase = 'ready';
        await this.save(record);
        return structuredClone(record);
      }),
    );
  }
  files(taskId: string, role: 'worker'): Promise<TaskWriter>;
  files(taskId: string, role: 'reviewer'): Promise<TaskReader>;
  async files(taskId: string, role: 'worker' | 'reviewer'): Promise<TaskReader | TaskWriter> {
    if (role !== 'worker' && role !== 'reviewer') {
      fail('accessDenied', 'Unknown task role.');
    }
    const source = await this.source(taskId);
    const record = this.registry().entries.find((entry) => entry.taskId === taskId);
    if (
      !record ||
      record.phase !== 'ready' ||
      record.commonDir !== source.commonDir ||
      record.repository !== source.repository ||
      record.directory !==
        path.join(
          source.storage,
          'task-worktrees',
          createHash('sha256').update(source.commonDir).digest('hex').slice(0, 16),
          taskId,
        )
    ) {
      fail('workspaceChanged', 'Prepare the saved task before accessing its files.');
    }
    await this.verify(record);
    const guard = async () => {
      if (!this.ports.trusted() || !(await this.ports.taskExists(taskId))) {
        fail('accessDenied', 'Task access has been revoked.');
      }
      const folders = this.ports.folders();
      const current = this.registry().entries.find((entry) => entry.taskId === taskId);
      if (
        folders.length !== 1 ||
        !folders[0] ||
        (await realpath(folders[0])) !== record.repository ||
        !current ||
        JSON.stringify(current) !== JSON.stringify(record)
      ) {
        fail('accessDenied', 'The task workspace binding changed; obtain a new role interface.');
      }
      await this.verify(record);
    };
    const safePath = async (relative: string, writing = false): Promise<string> => {
      if (
        !relative ||
        relative.includes('\0') ||
        relative.includes('\\') ||
        path.isAbsolute(relative) ||
        path.win32.isAbsolute(relative)
      ) {
        fail('invalidPath', 'Use a relative task file path.');
      }
      const parts = relative.split('/');
      if (
        parts.some(
          (part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git',
        )
      ) {
        fail('invalidPath', 'Git metadata and traversing paths are not accessible.');
      }
      let target = record.directory;
      for (const [index, part] of parts.entries()) {
        target = path.join(target, part);
        try {
          const stat = await lstat(target);
          if (
            stat.isSymbolicLink() ||
            (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1)
          ) {
            fail(
              'invalidPath',
              'Only regular task files without symbolic or hard links are accessible.',
            );
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT' && writing) {
            if (index < parts.length - 1) {
              await ensureDirectory(target);
            }
            continue;
          }
          throw error;
        }
      }
      return target;
    };
    const reader: TaskReader = {
      listFiles: async () => {
        await guard();
        const files = (
          await this.git.checked(
            ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
            record.directory,
          )
        )
          .split('\0')
          .filter(Boolean);
        const readable: string[] = [];
        for (const file of new Set(files)) {
          try {
            await safePath(file);
            readable.push(file);
          } catch (error) {
            if (
              error instanceof GitTaskError ||
              (error as NodeJS.ErrnoException).code === 'ENOENT'
            ) {
              continue;
            }
            throw error;
          }
        }
        return readable;
      },
      readFile: async (relative) => {
        await guard();
        const file = await open(
          await safePath(relative),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.nlink > 1) {
            fail('invalidPath', 'Only regular task files are readable.');
          }
          const buffer = Buffer.alloc(fileLimit + 1);
          let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
            if (!bytesRead) {
              break;
            }
            length += bytesRead;
          }
          if (length > fileLimit) {
            fail('outputTooLarge', 'Task file exceeds 2 MiB; no partial contents were returned.');
          }
          return buffer.subarray(0, length).toString('utf8');
        } finally {
          await file.close();
        }
      },
      status: async () => {
        await guard();
        return this.git.checked(
          ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
          record.directory,
        );
      },
      diff: async () => {
        await guard();
        return this.git.checked(
          ['diff', '--no-ext-diff', '--no-textconv', '--no-color', record.baseCommit, '--'],
          record.directory,
        );
      },
    };
    if (role === 'reviewer') {
      return Object.freeze(reader);
    }
    return Object.freeze({
      ...reader,
      writeFile: async (relative: string, contents: string) => {
        await guard();
        if (typeof contents !== 'string' || Buffer.byteLength(contents) > fileLimit) {
          fail('outputTooLarge', 'Task writes are limited to 2 MiB.');
        }
        const file = await open(
          await safePath(relative, true),
          constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          0o600,
        );
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.nlink > 1) {
            fail('invalidPath', 'Only regular task files are writable.');
          }
          await file.truncate(0);
          await file.writeFile(contents, 'utf8');
        } finally {
          await file.close();
        }
      },
    });
  }
}
