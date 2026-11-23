import { realpath, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import type { TestContext } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitProcess } from '../../src/git/process';
import { TaskWorkspaces } from '../../src/git/taskWorkspaces';
import { fixture, taskInput } from './fixtures';
export async function gitHarness(t: TestContext, commit = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dualmind git test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'source'),
    storage = join(root, 'storage');
  await mkdir(repo);
  await mkdir(storage);
  const config = join(root, 'gitconfig');
  await writeFile(config, '');
  const env = { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
  const git = new GitProcess({ env });
  const run = (...args: string[]) => git.checked(args, repo);
  await run('init');
  await run('symbolic-ref', 'HEAD', 'refs/heads/main');
  await run('config', 'user.name', 'DualMind Test');
  await run('config', 'user.email', 'test@example.invalid');
  await writeFile(join(repo, 'file.txt'), 'baseline\n');
  if (commit) {
    await run('add', '--', 'file.txt');
    await run('commit', '-m', 'fixture');
  }
  const f = fixture();
  let trusted = true;
  let folders = [repo];
  const ports = {
    state: f.workspace,
    folders: () => folders,
    storageRoot: () => storage,
    trusted: () => trusted,
    taskExists: async (id: string) =>
      (await f.store.snapshot()).tasks.some((task) => task.id === id),
  };
  const service = new TaskWorkspaces(ports, git);
  const task = async () => {
    await f.store.dispatch({ kind: 'task.save', input: taskInput() });
    return (await f.store.snapshot()).tasks[0].id;
  };
  return {
    root,
    repo,
    storage,
    env,
    git,
    run,
    f,
    ports,
    service,
    task,
    trust: (value: boolean) => {
      trusted = value;
    },
    folders: (value: string[]) => {
      folders = value;
    },
  };
}
