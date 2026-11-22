import { taskBranchSlug, taskBranchName, branchSuffixLengths } from '../../src/git/branchNames';
import { realpath } from 'node:fs/promises';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitProcess } from '../../src/git/process';
import {
  TaskWorkspaces,
  taskGitStorageKey,
  type TaskGitWorkspace,
} from '../../src/git/taskWorkspaces';
import { fixture, taskInput } from './fixtures';

async function harness(t: TestContext, commit = true) {
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

test('prepares separate task branches, preserves the source and freezes baseline across reuse', async (t) => {
  const h = await harness(t);
  const original = (await h.run('rev-parse', 'HEAD')).trim();
  const a = await h.task(),
    b = await h.task();
  assert.equal((await h.run('worktree', 'list', '--porcelain')).split('worktree ').length - 1, 1);
  const [first, same, other] = await Promise.all([
    h.service.prepare(a),
    h.service.prepare(a),
    h.service.prepare(b),
  ]);
  assert.deepEqual(first, same);
  assert.notEqual(first.directory, other.directory);
  assert.equal(first.branch, taskBranchName(a, 'task', 8));
  assert.equal(first.baseCommit, original);
  const worker = await h.service.files(a, 'worker'),
    reviewer = await h.service.files(a, 'reviewer');
  assert.ok(Object.isFrozen(reviewer));
  assert.ok(!('writeFile' in reviewer), 'Reviewer receives no write capability');
  assert.throws(() => (reviewer as unknown as { writeFile(): void }).writeFile(), TypeError);
  await worker.writeFile('file.txt', 'worker result\n');
  await worker.writeFile('new.txt', 'test evidence');
  await worker.writeFile('new-directory/evidence.txt', 'nested evidence');
  assert.equal(await reviewer.readFile('file.txt'), 'worker result\n');
  assert.match(await reviewer.diff(), /\+worker result/);
  assert.match(await reviewer.status(), /new.txt/);
  assert.deepEqual((await reviewer.listFiles()).sort(), [
    'file.txt',
    'new-directory/evidence.txt',
    'new.txt',
  ]);
  assert.equal(await (await h.service.files(b, 'reviewer')).readFile('file.txt'), 'baseline\n');
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
  assert.equal((await h.run('symbolic-ref', '--short', 'HEAD')).trim(), 'main');
  assert.equal(await h.run('status', '--porcelain'), '');
  await writeFile(join(h.repo, 'file.txt'), 'source moved\n');
  await h.run('add', 'file.txt');
  await h.run('commit', '-m', 'source update');
  await writeFile(join(h.repo, 'untracked.txt'), 'preserve');
  const reopened = new TaskWorkspaces(h.ports, h.git);
  assert.deepEqual(await reopened.prepare(a), first);
  assert.equal(await reviewer.readFile('file.txt'), 'worker result\n');
  await h.f.store.dispatch({ kind: 'task.delete', id: a, confirmed: true });
  await assert.rejects(reviewer.readFile('file.txt'), { code: 'accessDenied' });
  await assert.rejects(reopened.prepare(a), { code: 'taskNotFound' });
  assert.equal(await readFile(join(first.directory, 'file.txt'), 'utf8'), 'worker result\n');
  assert.ok(h.f.workspace.values.has(taskGitStorageKey));
});

test('checks Git, trust, saved task, repository, commits, branch and folder constraints before mutation', async (t) => {
  const h = await harness(t, false);
  const id = await h.task();
  h.trust(false);
  await assert.rejects(h.service.prepare(id), { code: 'workspaceUntrusted' });
  h.trust(true);
  await assert.rejects(h.service.prepare('not-a-task'), { code: 'taskNotFound' });
  h.folders([h.repo, h.root]);
  await assert.rejects(h.service.prepare(id), { code: 'workspaceUnsupported' });
  h.folders([h.root]);
  await assert.rejects(h.service.prepare(id), { code: 'notRepository' });
  h.folders([h.repo]);
  await assert.rejects(h.service.prepare(id), { code: 'noCommit' });
  await h.run('add', '.');
  await h.run('commit', '-m', 'initial');
  await h.run('checkout', '--detach');
  await assert.rejects(h.service.prepare(id), { code: 'detachedHead' });
  await h.run('checkout', 'main');
  const absentGit = new TaskWorkspaces(
    h.ports,
    new GitProcess({ executable: join(h.root, 'absent') }),
  );
  await assert.rejects(absentGit.prepare(id), { code: 'gitUnavailable' });
  assert.equal(h.f.workspace.values.has(taskGitStorageKey), false);
});

for (const change of ['staged', 'unstaged', 'untracked'] as const) {
  test(`blocks ${change} source changes without modifying them`, async (t) => {
    const h = await harness(t);
    const id = await h.task();
    const file = change === 'untracked' ? 'other.txt' : 'file.txt';
    await writeFile(join(h.repo, file), 'preserve');
    if (change === 'staged') {
      await h.run('add', file);
    }
    const before = await h.run('status', '--porcelain=v1');
    await assert.rejects(h.service.prepare(id), { code: 'dirtyRepository' });
    assert.equal(await h.run('status', '--porcelain=v1'), before);
    assert.equal(await readFile(join(h.repo, file), 'utf8'), 'preserve');
    assert.equal(h.f.workspace.values.has(taskGitStorageKey), false);
  });
}

test('supports an existing worktree as source and rejects submodules', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  const linked = join(h.root, 'linked');
  await h.run('worktree', 'add', '-b', 'linked', linked);
  h.folders([linked]);
  const prepared = await h.service.prepare(id);
  assert.equal(prepared.repository, linked);
  h.folders([h.repo]);
  // A real gitlink exercises detection without cloning or network access.
  await h.run('update-index', '--add', '--cacheinfo', '160000', prepared.baseCommit, 'sub');
  await h.run('commit', '-m', 'gitlink');
  await assert.rejects(h.service.prepare(await h.task()), { code: 'submodulesUnsupported' });
});

test('rejects unregistered collisions and recovers only matching interrupted preparations', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  for (const length of branchSuffixLengths) {
    await h.run('branch', taskBranchName(id, 'task', length));
  }
  await assert.rejects(h.service.prepare(id), { code: 'workspaceConflict' });
  assert.equal(h.f.workspace.values.has(taskGitStorageKey), false);
  const recovery = await h.task();
  const update = h.f.workspace.update.bind(h.f.workspace);
  let rejectReady = true;
  h.f.workspace.update = async (key, value) => {
    if (
      key === taskGitStorageKey &&
      rejectReady &&
      (value as { entries: TaskGitWorkspace[] }).entries.some((entry) => entry.phase === 'ready')
    ) {
      throw new Error('simulated persistence failure');
    }
    await update(key, value);
  };
  await assert.rejects(h.service.prepare(recovery), { code: 'storageFailed' });
  rejectReady = false;
  const recovered = await new TaskWorkspaces(h.ports, h.git).prepare(recovery);
  assert.equal(recovered.phase, 'ready');
  await h.git.checked(['checkout', '--detach'], recovered.directory);
  await assert.rejects(h.service.prepare(recovery), { code: 'workspaceChanged' });
  await h.git.checked(['checkout', recovered.branch], recovered.directory);
  await rm(recovered.directory, { recursive: true, force: true });
  await assert.rejects(h.service.prepare(recovery), { code: 'workspaceChanged' });
});

test('rejects path traversal, links and Git metadata and revokes role access with workspace trust', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  const prepared = await h.service.prepare(id);
  const writer = await h.service.files(id, 'worker'),
    reader = await h.service.files(id, 'reviewer');
  await symlink(
    h.repo,
    join(prepared.directory, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.equal(await writer.commandDirectory('.'), prepared.directory);
  await mkdir(join(prepared.directory, 'nested'));
  assert.equal(await writer.commandDirectory('nested'), join(prepared.directory, 'nested'));
  assert.equal(await reader.commandDirectory('.'), prepared.directory);
  for (const directory of ['..', '/tmp', '.git', 'escape', 'nested/../', 'file.txt', 'missing']) {
    await assert.rejects(writer.commandDirectory(directory), { code: 'commandDirectoryInvalid' });
  }
  for (const name of [
    '../source/file.txt',
    '/etc/passwd',
    'C:\\outside',
    '.git',
    '.git/config',
    'dir/../file.txt',
    'escape/file.txt',
  ]) {
    await assert.rejects(reader.readFile(name), { code: 'invalidPath' });
    await assert.rejects(writer.writeFile(name, 'unsafe'), { code: 'invalidPath' });
  }
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
  assert.ok(!(await reader.listFiles()).includes('escape'));
  await assert.rejects(writer.writeFile('big.txt', 'x'.repeat(2 * 1024 * 1024 + 1)), {
    code: 'outputTooLarge',
  });
  await writeFile(join(prepared.directory, 'big.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(reader.readFile('big.txt'), { code: 'outputTooLarge' });
  h.trust(false);
  await assert.rejects(writer.writeFile('file.txt', 'unsafe'), { code: 'accessDenied' });
});

test('suppresses checkout hooks, content filters, external diff and textconv programs', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  const marker = join(h.root, 'unexpected-execution'),
    program = join(h.root, 'dangerous.sh');
  await writeFile(program, `#!/bin/sh\nprintf 'executed' > '${marker.replaceAll('\\', '/')}'\n`);
  await chmod(program, 0o700);
  const hooks = join(h.root, 'hooks');
  await mkdir(hooks);
  await writeFile(join(hooks, 'post-checkout'), await readFile(program));
  await chmod(join(hooks, 'post-checkout'), 0o700);
  await h.run('config', 'core.hooksPath', hooks);
  await h.run('config', 'diff.external', program);
  await h.run('config', 'diff.untrusted.textconv', program);
  await h.run('config', 'filter.untrusted.clean', program);
  await h.run('config', 'filter.untrusted.smudge', program);
  await h.run('config', 'filter.untrusted.process', program);
  await h.run('config', 'filter.untrusted.required', 'true');
  await writeFile(join(h.repo, '.gitattributes'), '*.txt diff=untrusted filter=untrusted\n');
  await h.run('add', '.gitattributes');
  await h.run('commit', '-m', 'attributes');
  await h.service.prepare(id);
  await (await h.service.files(id, 'worker')).writeFile('file.txt', 'new content\n');
  assert.match(await (await h.service.files(id, 'reviewer')).diff(), /\+new content/);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('limits process output and time, and does not inherit repository redirection', async (t) => {
  const h = await harness(t);
  const redirected = new GitProcess({
    env: {
      ...h.env,
      GIT_DIR: '/absent',
      GIT_WORK_TREE: '/absent',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/absent',
    },
  });
  assert.equal(
    await realpath((await redirected.checked(['rev-parse', '--show-toplevel'], h.repo)).trim()),
    h.repo,
  );
  await assert.rejects(new GitProcess({ env: h.env, maxBytes: 1 }).version(), {
    code: 'outputTooLarge',
  });
  if (process.platform !== 'win32') {
    const fake = join(h.root, 'slow-git');
    await writeFile(fake, '#!/bin/sh\nexec sleep 10\n');
    await chmod(fake, 0o700);
    await assert.rejects(new GitProcess({ executable: fake, timeoutMs: 40 }).version(), {
      code: 'gitTimeout',
    });
  }
});

test('preserves unrelated directories and refuses redirected task storage before touching the source', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  const { createHash } = await import('node:crypto');
  const { realpath } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const common = await realpath(
    resolve(h.repo, (await h.run('rev-parse', '--git-common-dir')).trim()),
  );
  const directory = join(
    h.storage,
    'task-worktrees',
    createHash('sha256').update(common).digest('hex').slice(0, 16),
    id,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'keep.txt'), 'user data');
  await assert.rejects(h.service.prepare(id), { code: 'workspaceConflict' });
  assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'user data');
  assert.equal(h.f.workspace.values.has(taskGitStorageKey), false);
  const redirected = new TaskWorkspaces(
    { ...h.ports, storageRoot: () => join(h.root, 'redirect') },
    h.git,
  );
  await symlink(
    h.repo,
    join(h.root, 'redirect'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const original = await h.run('status', '--porcelain=v1');
  await assert.rejects(redirected.prepare(await h.task()), { code: 'invalidPath' });
  assert.equal(await h.run('status', '--porcelain=v1'), original);
});

test('persists intent before Git creation, retries untouched intent and preserves partial resources', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  h.f.workspace.fail = true;
  await assert.rejects(h.service.prepare(id), { code: 'storageFailed' });
  assert.equal((await h.run('worktree', 'list', '--porcelain')).split('worktree ').length - 1, 1);
  h.f.workspace.fail = false;
  class InterruptedGit extends GitProcess {
    override async checked(args: readonly string[], cwd: string): Promise<string> {
      if (args[0] === 'worktree' && args[1] === 'add') {
        throw new Error('interrupted before creation');
      }
      return super.checked(args, cwd);
    }
  }
  await assert.rejects(
    new TaskWorkspaces(h.ports, new InterruptedGit({ env: h.env })).prepare(id),
    { code: 'gitFailed' },
  );
  const pending = h.f.workspace.get<{ entries: TaskGitWorkspace[] }>(taskGitStorageKey, {
    entries: [],
  }).entries[0];
  assert.equal(pending.phase, 'preparing');
  const recovered = await h.service.prepare(id);
  assert.equal(recovered.phase, 'ready');
  assert.equal(recovered.baseCommit, pending.baseCommit);
  // Another interrupted prepare whose branch exists but checkout never finished is left for inspection.
  const other = await h.task();
  await assert.rejects(
    new TaskWorkspaces(h.ports, new InterruptedGit({ env: h.env })).prepare(other),
    { code: 'gitFailed' },
  );
  await h.run('branch', taskBranchName(other, 'task', 8));
  await assert.rejects(h.service.prepare(other), { code: 'workspaceConflict' });
  assert.equal(
    (await h.run('show-ref', '--verify', `refs/heads/${taskBranchName(other, 'task', 8)}`))
      .trim()
      .split(' ')[1],
    `refs/heads/${taskBranchName(other, 'task', 8)}`,
  );
});

test('does not copy ignored source files and rejects stale role handles after folder changes', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  await writeFile(join(h.repo, '.gitignore'), 'generated/\n');
  await h.run('add', '.gitignore');
  await h.run('commit', '-m', 'ignore generated files');
  await mkdir(join(h.repo, 'generated'));
  await writeFile(join(h.repo, 'generated/output'), 'source-only');
  const prepared = await h.service.prepare(id);
  await assert.rejects(readFile(join(prepared.directory, 'generated/output')), { code: 'ENOENT' });
  const reader = await h.service.files(id, 'reviewer');
  h.folders([h.root]);
  await assert.rejects(reader.readFile('file.txt'), { code: 'accessDenied' });
  assert.equal(await readFile(join(h.repo, 'generated/output'), 'utf8'), 'source-only');
});

test('direct current mode stays in the source, freezes each run and requires clean restarts', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  assert.deepEqual(await h.service.branches(), { currentBranch: 'main', branches: ['main'] });
  const before = await h.run('worktree', 'list', '--porcelain');
  const first = await h.service.prepare(id, { mode: 'current' });
  assert.equal(first.directory, h.repo);
  assert.equal(first.branch, 'main');
  const writer = await h.service.files(id, 'worker', first);
  const reader = await h.service.files(id, 'reviewer', first);
  assert.ok(!('writeFile' in reader));
  await writer.writeFile('file.txt', 'direct result');
  assert.match(await reader.diff(), /direct result/);
  await assert.rejects(h.service.prepare(id, { mode: 'current' }), { code: 'dirtyRepository' });
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'direct result');
  await h.run('add', 'file.txt');
  await h.run('commit', '-m', 'user commit');
  await assert.rejects(writer.writeFile('file.txt', 'stale write'), { code: 'workspaceChanged' });
  const next = await h.service.prepare(id, { mode: 'current' });
  assert.notEqual(next.baseCommit, first.baseCommit);
  await assert.rejects(h.service.binding(id, first), { code: 'workspaceChanged' });
  assert.equal(
    (await h.run('worktree', 'list', '--porcelain')).split('worktree ').length,
    before.split('worktree ').length,
  );
  assert.equal(await h.run('for-each-ref', '--format=%(refname)', 'refs/heads/dualmind'), '');
  assert.throws(() => h.service.assertStrategy(id, { mode: 'managed' }), {
    code: 'workspaceConflict',
  });
  await h.f.store.dispatch({ kind: 'task.delete', id, confirmed: true });
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'direct result');
});

test('specified local branches switch safely; readonly access never switches back', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  await h.run('branch', 'feature/test');
  const original = await h.run('symbolic-ref', '--short', 'HEAD');
  assert.deepEqual((await h.service.branches()).branches, ['feature/test', 'main']);
  assert.equal(await h.run('symbolic-ref', '--short', 'HEAD'), original);
  const binding = await h.service.prepare(id, { mode: 'branch', branch: 'feature/test' });
  assert.equal(binding.directory, h.repo);
  assert.equal(binding.branch, 'feature/test');
  const writer = await h.service.files(id, 'worker', binding);
  await h.run('switch', 'main');
  await assert.rejects(writer.writeFile('file.txt', 'wrong branch'), { code: 'workspaceChanged' });
  await assert.rejects(h.service.binding(id, binding), { code: 'workspaceChanged' });
  assert.equal(await h.run('symbolic-ref', '--short', 'HEAD'), original);
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
  await h.service.prepare(id, { mode: 'branch', branch: 'feature/test' });
  assert.equal((await h.run('symbolic-ref', '--short', 'HEAD')).trim(), 'feature/test');
});

test('direct mode rejects dirty files, missing or occupied targets, ignored collisions and target submodules', async (t) => {
  const h = await harness(t);
  await writeFile(join(h.repo, 'untracked'), 'keep');
  await assert.rejects(h.service.prepare(await h.task(), { mode: 'current' }), {
    code: 'dirtyRepository',
  });
  await rm(join(h.repo, 'untracked'));
  await assert.rejects(h.service.prepare(await h.task(), { mode: 'branch', branch: 'missing' }), {
    code: 'workspaceConflict',
  });
  await h.run('branch', 'occupied');
  await h.run('worktree', 'add', join(h.root, 'occupied'), 'occupied');
  await assert.rejects(h.service.prepare(await h.task(), { mode: 'branch', branch: 'occupied' }), {
    code: 'workspaceConflict',
  });
  await writeFile(join(h.repo, '.gitignore'), 'collision\n');
  await h.run('add', '.gitignore');
  await h.run('commit', '-m', 'ignore');
  await h.run('switch', '-c', 'target');
  await writeFile(join(h.repo, 'collision'), 'target tracked');
  await h.run('add', '-f', 'collision');
  await h.run('commit', '-m', 'target');
  await h.run('switch', 'main');
  await writeFile(join(h.repo, 'collision'), 'user ignored content');
  await assert.rejects(h.service.prepare(await h.task(), { mode: 'branch', branch: 'target' }), {
    code: 'gitFailed',
  });
  assert.equal(await readFile(join(h.repo, 'collision'), 'utf8'), 'user ignored content');
  assert.equal((await h.run('symbolic-ref', '--short', 'HEAD')).trim(), 'main');
  await h.run('switch', '-c', 'submodule-target');
  const head = (await h.run('rev-parse', 'HEAD')).trim();
  await h.run('update-index', '--add', '--cacheinfo', `160000,${head},nested`);
  await h.run('commit', '-m', 'gitlink');
  await h.run('switch', 'main');
  await assert.rejects(
    h.service.prepare(await h.task(), { mode: 'branch', branch: 'submodule-target' }),
    { code: 'submodulesUnsupported' },
  );
  assert.equal((await h.run('symbolic-ref', '--short', 'HEAD')).trim(), 'main');
});

test('direct registrations recover consistent interrupted switches and preserve failed intent', async (t) => {
  const h = await harness(t);
  const id = await h.task();
  await h.run('branch', 'target');
  const first = await h.service.prepare(id, { mode: 'branch', branch: 'target' });
  await h.f.workspace.update(taskGitStorageKey, {
    version: 1,
    entries: [{ ...first, phase: 'preparing' }],
  });
  const reopened = new TaskWorkspaces(h.ports, h.git);
  assert.equal((await reopened.prepare(id, { mode: 'branch', branch: 'target' })).phase, 'ready');
  await h.f.workspace.update(taskGitStorageKey, {
    version: 1,
    entries: [{ ...first, phase: 'preparing' }],
  });
  await writeFile(join(h.repo, 'file.txt'), 'changed baseline');
  await h.run('add', 'file.txt');
  await h.run('commit', '-m', 'external change during interrupted preparation');
  await assert.rejects(reopened.prepare(id, { mode: 'branch', branch: 'target' }), {
    code: 'workspaceChanged',
  });
  assert.equal(
    h.f.workspace.get<{ entries: TaskGitWorkspace[] }>(taskGitStorageKey, { entries: [] })
      .entries[0].baseCommit,
    first.baseCommit,
  );
});

test('managed branches normalize Unicode task names, truncate by code point and retain immutable identity', async (t) => {
  const cases = [
    [' 修复 登录 / FIX 登录.. ', '修复-登录-fix-登录'],
    ['ＦＩＸ Café e\u0301', 'fix-café-é'],
    ['---[😀]../@{*?\\~:^', 'task'],
    ['中'.repeat(60), '中'.repeat(48)],
    ['A'.repeat(47) + '---B', 'a'.repeat(47)],
  ];
  // ASCII capitals are lowercased; Unicode accents survive normalization.
  for (const [name, expected] of cases) {
    assert.equal(taskBranchSlug(name), expected);
  }
  const h = await harness(t),
    id = await h.task();
  const binding = await h.service.prepare(id, undefined, '修复 登录 / FIX 登录..');
  assert.equal(binding.branch, taskBranchName(id, '修复-登录-fix-登录', 8));
  assert.deepEqual(binding.branchNaming, {
    version: 2,
    slug: '修复-登录-fix-登录',
    suffixLength: 8,
  });
  assert.equal((await h.service.prepare(id, undefined, '改过的标题')).branch, binding.branch);
  assert.equal(
    (await new TaskWorkspaces(h.ports, h.git).binding(id, binding)).branch,
    binding.branch,
  );
  const other = await h.service.prepare(await h.task(), undefined, '修复 登录 / FIX 登录..');
  assert.notEqual(other.branch, binding.branch);
});

test('branch collisions lengthen the suffix without adopting existing branches', async (t) => {
  const h = await harness(t);
  for (const occupied of [1, 2]) {
    const id = await h.task();
    for (const length of branchSuffixLengths.slice(0, occupied)) {
      await h.run('branch', taskBranchName(id, '修复', length));
    }
    const binding = await h.service.prepare(id, undefined, '修复');
    assert.equal(binding.branchNaming!.suffixLength, branchSuffixLengths[occupied]);
    assert.equal(binding.branch, taskBranchName(id, '修复', branchSuffixLengths[occupied]));
    for (const length of branchSuffixLengths.slice(0, occupied)) {
      assert.ok(
        (
          await h.run('show-ref', '--verify', `refs/heads/${taskBranchName(id, '修复', length)}`)
        ).includes(binding.baseCommit),
      );
    }
  }
});

test('legacy managed branches and interrupted intents remain reusable without renaming', async (t) => {
  const h = await harness(t),
    id = await h.task();
  const created = await h.service.prepare(id, undefined, 'New title');
  const branch = `dualmind/task/${id}/worker`;
  await h.git.checked(['branch', '-m', branch], created.directory);
  const legacy = { ...created, branch };
  delete legacy.branchNaming;
  await h.f.workspace.update(taskGitStorageKey, { version: 1, entries: [legacy] });
  const restored = await new TaskWorkspaces(h.ports, h.git).prepare(id, undefined, 'Changed title');
  assert.equal(restored.branch, branch);
  assert.equal(restored.branchNaming, undefined);
  const next = await h.task();
  class Interrupted extends GitProcess {
    override async checked(args: readonly string[], cwd: string) {
      if (args[0] === 'worktree' && args[1] === 'add') {
        throw new Error('Interrupted');
      }
      return super.checked(args, cwd);
    }
  }
  await assert.rejects(new TaskWorkspaces(h.ports, new Interrupted({ env: h.env })).prepare(next), {
    code: 'gitFailed',
  });
  const registry = h.f.workspace.get<{ version: number; entries: TaskGitWorkspace[] }>(
    taskGitStorageKey,
    { version: 1, entries: [] },
  );
  const intent = registry.entries.find((e) => e.taskId === next)!;
  intent.branch = `dualmind/task/${next}/worker`;
  delete intent.branchNaming;
  await h.f.workspace.update(taskGitStorageKey, registry);
  assert.equal((await h.service.prepare(next, undefined, 'Another title')).branch, intent.branch);
});

test('managed registry and bindings reject forged naming identity', async (t) => {
  const h = await harness(t),
    id = await h.task();
  const created = await h.service.prepare(id, undefined, '修复');
  for (const patch of [
    { branch: taskBranchName('00000000-0000-0000-0000-000000000000', '修复', 8) },
    { branchNaming: { ...created.branchNaming!, slug: '../other' } },
    { branchNaming: { ...created.branchNaming!, version: 99 } },
    { branchNaming: { ...created.branchNaming!, suffixLength: 9 } },
  ]) {
    await h.f.workspace.update(taskGitStorageKey, {
      version: 1,
      entries: [{ ...created, ...patch }],
    });
    assert.throws(() => h.service.preparedTaskIds(), { code: 'storageFailed' });
  }
  await h.f.workspace.update(taskGitStorageKey, { version: 1, entries: [created] });
  await assert.rejects(h.service.binding(id, { ...created, branch: 'dualmind/forged-12345678' }), {
    code: 'workspaceChanged',
  });
});
