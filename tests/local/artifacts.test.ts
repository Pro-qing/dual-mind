import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises';
import { gitHarness } from './gitFixture';
import { TaskWorkspaces } from '../../src/git/taskWorkspaces';
import { artifactsStorageKey } from '../../src/git/taskArtifacts';
import { taskInput } from './fixtures';

async function prepared(t: Parameters<typeof gitHarness>[0]) {
  const h = await gitHarness(t);
  const id = await h.task(),
    workspace = await h.service.prepare(id);
  return { ...h, id, workspace, artifacts: h.service.artifacts };
}

test('managed bases are explicit, dirty source files stay in place, bindings stay frozen', async (t) => {
  const h = await gitHarness(t);
  await h.run('branch', 'base');
  const base = (await h.run('rev-parse', 'base')).trim();
  await writeFile(join(h.repo, 'file.txt'), 'new main');
  await h.run('add', '.');
  await h.run('commit', '-m', 'main moved');
  await writeFile(join(h.repo, 'file.txt'), 'dirty source');
  const id = await h.task();
  const work = await h.service.prepare(
    id,
    { mode: 'managed', baseBranch: 'base' },
    'Explicit base',
  );
  assert.equal(work.baseCommit, base);
  assert.equal(work.sourceBranch, 'base');
  assert.equal(await readFile(join(work.directory, 'file.txt'), 'utf8'), 'baseline\n');
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'dirty source');
  assert.equal(
    (await h.service.prepare(id, { mode: 'managed', baseBranch: 'base' })).baseCommit,
    base,
  );
  await assert.rejects(h.service.prepare(id, { mode: 'managed', baseBranch: 'main' }), {
    code: 'workspaceConflict',
  });
});

test('commit, acceptance-bound fast-forward merge and cleanup are explicit and repeatable', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'accepted result\n');
  let preview = await h.artifacts.inspect(h.id);
  const commitId = randomUUID();
  await h.artifacts.accept(
    h.id,
    randomUUID(),
    await (await h.service.files(h.id, 'reviewer')).fingerprint(),
  );
  assert.equal((await h.artifacts.inspect(h.id)).accepted, true);
  const committed = await h.artifacts.commit(h.id, commitId, preview.token, 'Save result');
  assert.equal(committed.state, 'committed');
  assert.equal(committed.accepted, true);
  assert.equal(
    (await h.artifacts.commit(h.id, commitId, preview.token, 'Save result')).head,
    committed.head,
  );
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
  preview = await h.artifacts.inspect(h.id);
  const mergeId = randomUUID();
  const merged = await h.artifacts.merge(h.id, mergeId, preview.token, 'main');
  assert.equal(merged.merge?.state, 'integrated');
  assert.equal(merged.merge?.verificationRequired, true);
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'accepted result\n');
  assert.equal(
    (await h.artifacts.merge(h.id, mergeId, preview.token, 'main')).merge?.resultHead,
    committed.head,
  );
  const cleanupId = randomUUID();
  const cleaned = await h.artifacts.cleanup(
    h.id,
    cleanupId,
    merged.token,
    (await h.f.store.snapshot()).tasks[0],
  );
  assert.equal(cleaned.state, 'cleaned');
  await assert.rejects(readFile(join(h.workspace.directory, 'file.txt')), { code: 'ENOENT' });
  assert.equal(
    (
      await h.git.run(
        ['show-ref', '--verify', '--quiet', `refs/heads/${h.workspace.branch}`],
        h.repo,
      )
    ).code,
    1,
  );
  await assert.rejects(h.service.prepare(h.id), { code: 'workspaceArchived' });
  assert.equal((await h.artifacts.cleanup(h.id, cleanupId, 'stale')).state, 'cleaned');
});

test('cleanup preserves staged, unstaged, untracked and ignored user files beyond task deletion', async (t) => {
  const h = await prepared(t),
    dir = h.workspace.directory;
  await writeFile(join(dir, 'file.txt'), 'staged\n');
  await h.git.checked(['add', 'file.txt'], dir);
  await writeFile(join(dir, 'file.txt'), 'unstaged\n');
  await writeFile(join(dir, 'new.txt'), 'untracked\n');
  await writeFile(join(dir, '.gitignore'), 'private.txt\nnode_modules/\n');
  await writeFile(join(dir, 'private.txt'), 'local ignored data\n');
  await mkdir(join(dir, 'node_modules'));
  await writeFile(join(dir, 'node_modules', 'generated'), 'regenerable');
  const preview = await h.artifacts.inspect(h.id);
  assert.deepEqual(preview.excluded, ['node_modules']);
  const cleanupId = randomUUID();
  const task = (await h.f.store.snapshot()).tasks[0];
  await h.artifacts.cleanup(h.id, cleanupId, preview.token, task);
  const [saved] = await h.artifacts.saved();
  assert.equal(saved.ready, true);
  assert.ok(saved.stash);
  assert.ok(saved.files.some((f) => f.path === 'private.txt'));
  await h.f.store.dispatch({ kind: 'task.delete', id: h.id, confirmed: true });
  const fresh = new TaskWorkspaces(h.ports, h.git);
  assert.equal((await fresh.artifacts.saved()).length, 1);
  const next = await h.task();
  const restored = await fresh.artifacts.restore(next, randomUUID(), saved.id, 'Restored work');
  assert.equal(restored.accepted, false);
  assert.equal(await readFile(join(restored.directory, 'file.txt'), 'utf8'), 'unstaged\n');
  assert.equal(await h.git.checked(['show', ':file.txt'], restored.directory), 'staged\n');
  assert.equal(
    await readFile(join(restored.directory, 'private.txt'), 'utf8'),
    'local ignored data\n',
  );
  assert.equal(await readFile(join(restored.directory, 'new.txt'), 'utf8'), 'untracked\n');
  await assert.rejects(readFile(join(restored.directory, 'node_modules', 'generated')), {
    code: 'ENOENT',
  });
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
});

test('unique commits and detached HEAD commits survive worktree cleanup', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'unique');
  const preview = await h.artifacts.inspect(h.id);
  const committed = await h.artifacts.commit(h.id, randomUUID(), preview.token, 'unique work');
  await h.artifacts.cleanup(h.id, randomUUID(), committed.token);
  assert.equal((await h.run('rev-parse', h.workspace.branch)).trim(), committed.head);
  const next = await h.task(),
    w = await h.service.prepare(next);
  await h.git.checked(['checkout', '--detach'], w.directory);
  await writeFile(join(w.directory, 'file.txt'), 'detached work');
  await h.git.checked(['add', '.'], w.directory);
  await h.git.checked(['commit', '-m', 'detached'], w.directory);
  const sha = (await h.git.checked(['rev-parse', 'HEAD'], w.directory)).trim();
  const state = await h.artifacts.inspect(next),
    id = randomUUID();
  await h.artifacts.cleanup(next, id, state.token);
  assert.equal((await h.run('rev-parse', `refs/heads/dualmind/rescued-${id}`)).trim(), sha);
});

test('changed previews, external target occupancy, nested repositories and symlink roots are refused', async (t) => {
  const h = await prepared(t);
  const preview = await h.artifacts.inspect(h.id);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'changed');
  await assert.rejects(h.artifacts.commit(h.id, randomUUID(), preview.token, 'bad'), {
    code: 'artifactChanged',
  });
  await mkdir(join(h.workspace.directory, 'nested'));
  await mkdir(join(h.workspace.directory, 'nested', '.git'));
  await assert.rejects(h.artifacts.inspect(h.id), { code: 'artifactUnsafe' });
  await rm(join(h.workspace.directory, 'nested'), { recursive: true });
  await h.artifacts.accept(
    h.id,
    randomUUID(),
    await (await h.service.files(h.id, 'reviewer')).fingerprint(),
  );
  const committed = await h.artifacts.commit(
    h.id,
    randomUUID(),
    (await h.artifacts.inspect(h.id)).token,
    'work',
  );
  await h.run('branch', 'occupied');
  await h.run('worktree', 'add', join(h.root, 'external'), 'occupied');
  await assert.rejects(h.artifacts.merge(h.id, randomUUID(), committed.token, 'occupied'), {
    code: 'artifactBranchOccupied',
  });
  await rm(h.workspace.directory, { recursive: true });
  await symlink(h.repo, h.workspace.directory, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(h.artifacts.inspect(h.id), { code: 'artifactUnsafe' });
});

test('normal merge retains conflicts and permits checked completion or abort', async (t) => {
  const h = await prepared(t),
    dir = h.workspace.directory;
  await writeFile(join(dir, 'file.txt'), 'task version');
  await h.artifacts.accept(
    h.id,
    randomUUID(),
    await (await h.service.files(h.id, 'reviewer')).fingerprint(),
  );
  await h.artifacts.commit(
    h.id,
    randomUUID(),
    (await h.artifacts.inspect(h.id)).token,
    'task version',
  );
  await writeFile(join(h.repo, 'file.txt'), 'main version');
  await h.run('add', '.');
  await h.run('commit', '-m', 'main version');
  const id = randomUUID();
  let status = await h.artifacts.merge(h.id, id, (await h.artifacts.inspect(h.id)).token, 'main');
  assert.equal(status.state, 'conflicted');
  assert.deepEqual(status.conflicts, ['file.txt']);
  await assert.rejects(h.artifacts.mergeAction(h.id, id, 'complete'), {
    code: 'artifactConflicts',
  });
  await h.artifacts.mergeAction(h.id, id, 'abort');
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'main version');
  const second = randomUUID();
  status = await h.artifacts.merge(h.id, second, (await h.artifacts.inspect(h.id)).token, 'main');
  assert.equal(status.state, 'conflicted');
  await writeFile(join(h.repo, 'file.txt'), 'resolved manually');
  await h.run('add', 'file.txt');
  const done = await h.artifacts.mergeAction(h.id, second, 'complete');
  assert.equal(done.merge?.state, 'integrated');
  assert.equal(done.merge?.hadConflicts, true);
  assert.equal(done.merge?.verificationRequired, true);
  assert.equal(
    (await h.run('rev-list', '--parents', '-n', '1', 'HEAD')).trim().split(' ').length,
    3,
  );
});

test('noncurrent targets use an owned temporary worktree and direct modes cannot clean the source', async (t) => {
  const h = await prepared(t);
  await h.run('branch', 'target');
  await writeFile(join(h.workspace.directory, 'new.txt'), 'result');
  await h.artifacts.accept(
    h.id,
    randomUUID(),
    await (await h.service.files(h.id, 'reviewer')).fingerprint(),
  );
  await h.artifacts.commit(h.id, randomUUID(), (await h.artifacts.inspect(h.id)).token, 'result');
  const done = await h.artifacts.merge(
    h.id,
    randomUUID(),
    (await h.artifacts.inspect(h.id)).token,
    'target',
  );
  assert.equal(done.merge?.temporary, true);
  assert.equal(done.merge?.state, 'integrated');
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
  await assert.rejects(readFile(join(h.repo, 'new.txt')), { code: 'ENOENT' });
  const direct = await h.task();
  await h.service.prepare(direct, { mode: 'current' });
  await assert.rejects(
    h.artifacts.cleanup(direct, randomUUID(), (await h.artifacts.inspect(direct)).token),
    { code: 'artifactManagedOnly' },
  );
});

test('failed metadata persistence cannot authorize deletion and derived task creation is idempotent', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'new.txt'), 'keep');
  const state = await h.artifacts.inspect(h.id);
  h.f.workspace.fail = true;
  await assert.rejects(h.artifacts.cleanup(h.id, randomUUID(), state.token), {
    code: 'artifactStorage',
  });
  h.f.workspace.fail = false;
  assert.equal(await readFile(join(h.workspace.directory, 'new.txt'), 'utf8'), 'keep');
  assert.equal(h.f.workspace.values.has(artifactsStorageKey), false);
  const id = randomUUID(),
    input = taskInput({ name: 'Follow-up', git: { mode: 'managed', baseBranch: 'main' } });
  await h.f.store.createDerivedTask(id, input, { taskId: h.id });
  await h.f.store.createDerivedTask(id, input, { taskId: h.id });
  assert.equal((await h.f.store.snapshot()).tasks.filter((t) => t.id === id).length, 1);
  await assert.rejects(
    h.f.store.createDerivedTask(id, { ...input, name: 'other' }, { taskId: h.id }),
  );
});

test('deleted tracked files retain their acceptance through commit and restore from a saved snapshot', async (t) => {
  const h = await prepared(t);
  await rm(join(h.workspace.directory, 'file.txt'));
  await h.artifacts.accept(
    h.id,
    randomUUID(),
    await (await h.service.files(h.id, 'reviewer')).fingerprint(),
  );
  const state = await h.artifacts.commit(
    h.id,
    randomUUID(),
    (await h.artifacts.inspect(h.id)).token,
    'remove file',
  );
  assert.equal(state.accepted, true);
  await h.artifacts.cleanup(h.id, randomUUID(), state.token);
  const [saved] = await h.artifacts.saved(),
    id = await h.task();
  const restored = await h.artifacts.restore(id, randomUUID(), saved.id, 'restore deletion');
  await assert.rejects(readFile(join(restored.directory, 'file.txt')), { code: 'ENOENT' });
});

test('missing worktree directories preserve detached commits and remove only their own registration', async (t) => {
  const h = await prepared(t);
  await h.git.checked(['checkout', '--detach'], h.workspace.directory);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'detached');
  await h.git.checked(['add', '.'], h.workspace.directory);
  await h.git.checked(['commit', '-m', 'detached'], h.workspace.directory);
  const head = (await h.git.checked(['rev-parse', 'HEAD'], h.workspace.directory)).trim();
  await h.run('branch', 'other');
  const external = join(h.root, 'missing-external');
  await h.run('worktree', 'add', external, 'other');
  await rm(external, { recursive: true });
  await rm(h.workspace.directory, { recursive: true });
  const preview = await h.artifacts.inspect(h.id),
    id = randomUUID();
  assert.equal(preview.missingDirectory, true);
  await h.artifacts.cleanup(h.id, id, preview.token);
  assert.equal((await h.run('rev-parse', `refs/heads/dualmind/rescued-${id}`)).trim(), head);
  assert.ok((await h.run('worktree', 'list', '--porcelain')).includes(external));
});

test('a crash after stash creation reuses the anchored snapshot and does not overwrite a later stash', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'preserved across crash');
  const state = await h.artifacts.inspect(h.id),
    id = randomUUID();
  const original = h.f.workspace.update.bind(h.f.workspace);
  let saving = true;
  h.f.workspace.update = async (key, value) => {
    const data = value as { saved?: { stash?: string }[] };
    if (saving && key === artifactsStorageKey && data.saved?.some((entry) => entry.stash)) {
      saving = false;
      throw new Error('injected metadata failure');
    }
    return original(key, value);
  };
  await assert.rejects(h.artifacts.cleanup(h.id, id, state.token), { code: 'artifactStorage' });
  h.f.workspace.update = original;
  await writeFile(join(h.repo, 'unrelated'), 'other stash');
  await h.run('stash', 'push', '--include-untracked', '-m', 'unrelated stash');
  const otherStash = (await h.run('rev-parse', 'refs/stash')).trim();
  const reopened = new TaskWorkspaces(h.ports, h.git);
  await reopened.artifacts.cleanup(h.id, id, 'unused-on-resume');
  const saved = await reopened.artifacts.savedArtifact(id);
  assert.notEqual(saved.stash, otherStash);
  assert.equal((await h.run('rev-parse', 'refs/stash')).trim(), otherStash);
  const next = await h.task();
  const restored = await reopened.artifacts.restore(next, randomUUID(), id, 'Recover');
  assert.equal(
    await readFile(join(restored.directory, 'file.txt'), 'utf8'),
    'preserved across crash',
  );
});

test('interrupted commit is discovered by operation ID and does not create a duplicate commit', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'commit once');
  const state = await h.artifacts.inspect(h.id),
    id = randomUUID();
  const original = h.f.workspace.update.bind(h.f.workspace);
  h.f.workspace.update = async (key, value) => {
    const data = value as { tasks?: { commit?: { result?: string } }[] };
    if (key === artifactsStorageKey && data.tasks?.some((entry) => entry.commit?.result)) {
      throw new Error('lost commit reply');
    }
    return original(key, value);
  };
  await assert.rejects(h.artifacts.commit(h.id, id, state.token, 'once'), {
    code: 'artifactStorage',
  });
  h.f.workspace.update = original;
  const before = (await h.git.checked(['rev-parse', 'HEAD'], h.workspace.directory)).trim();
  const reopened = new TaskWorkspaces(h.ports, h.git);
  const result = await reopened.artifacts.commit(h.id, id, state.token, 'once');
  assert.equal(result.head, before);
  assert.equal(
    (await h.git.checked(['rev-list', '--count', 'HEAD'], h.workspace.directory)).trim(),
    '2',
  );
});

test('normalizing Git attributes are detected before stash can replace the original bytes', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, '.gitattributes'), '*.txt text eol=lf\n');
  await writeFile(join(h.workspace.directory, 'file.txt'), 'preserve\r\nbytes\r\n');
  const preview = await h.artifacts.inspect(h.id);
  await assert.rejects(h.artifacts.cleanup(h.id, randomUUID(), preview.token), {
    code: 'artifactPreservation',
  });
  assert.equal(
    await readFile(join(h.workspace.directory, 'file.txt'), 'utf8'),
    'preserve\r\nbytes\r\n',
  );
  assert.equal((await h.git.run(['rev-parse', '--verify', 'refs/stash'], h.repo)).code, 128);
});

test('partial worktree removal resumes from its recorded saved manifest without pruning another checkout', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'saved artifact');
  const preview = await h.artifacts.inspect(h.id),
    id = randomUUID();
  const run = h.git.run.bind(h.git);
  let inject = true;
  h.git.run = async (args, cwd) => {
    const result = await run(args, cwd);
    if (inject && args[0] === 'worktree' && args[1] === 'remove') {
      inject = false;
      // Git dropped this checkout registration, but failed while removing an ordinary remaining file.
      await mkdir(h.workspace.directory);
      await writeFile(join(h.workspace.directory, 'file.txt'), 'baseline\n');
      throw new Error('injected partial removal');
    }
    return result;
  };
  await assert.rejects(h.artifacts.cleanup(h.id, id, preview.token), /partial removal/);
  h.git.run = run;
  const reopened = new TaskWorkspaces(h.ports, h.git);
  const result = await reopened.artifacts.cleanup(h.id, id, 'resume');
  assert.equal(result.state, 'cleaned');
  const next = await h.task();
  const restored = await reopened.artifacts.restore(
    next,
    randomUUID(),
    id,
    'Restored partial cleanup',
  );
  assert.equal(await readFile(join(restored.directory, 'file.txt'), 'utf8'), 'saved artifact');
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline\n');
});

test('a completed merge is recognized after its metadata write fails, without a second merge', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'merge once');
  await h.artifacts.accept(
    h.id,
    randomUUID(),
    await (await h.service.files(h.id, 'reviewer')).fingerprint(),
  );
  await h.artifacts.commit(h.id, randomUUID(), (await h.artifacts.inspect(h.id)).token, 'task');
  const preview = await h.artifacts.inspect(h.id),
    id = randomUUID();
  const update = h.f.workspace.update.bind(h.f.workspace);
  h.f.workspace.update = async (key, value) => {
    const data = value as { tasks?: { merge?: { state: string } }[] };
    if (
      key === artifactsStorageKey &&
      data.tasks?.some((entry) => entry.merge?.state === 'integrated')
    ) {
      throw new Error('lost merge metadata');
    }
    return update(key, value);
  };
  await assert.rejects(h.artifacts.merge(h.id, id, preview.token, 'main'), {
    code: 'artifactStorage',
  });
  h.f.workspace.update = update;
  const head = (await h.run('rev-parse', 'main')).trim();
  const reopened = new TaskWorkspaces(h.ports, h.git);
  const result = await reopened.artifacts.merge(h.id, id, preview.token, 'main');
  assert.equal(result.merge?.resultHead, head);
  assert.equal((await h.run('rev-list', '--count', 'main')).trim(), '2');
});

test('cleanup finalization recovers when the registry is saved but the artifact record write fails', async (t) => {
  const h = await prepared(t),
    id = randomUUID();
  const preview = await h.artifacts.inspect(h.id),
    update = h.f.workspace.update.bind(h.f.workspace);
  h.f.workspace.update = async (key, value) => {
    const data = value as { tasks?: { cleanup?: { stage: string } }[] };
    if (
      key === artifactsStorageKey &&
      data.tasks?.some((entry) => entry.cleanup?.stage === 'cleaned')
    ) {
      throw new Error('lost finalization');
    }
    return update(key, value);
  };
  await assert.rejects(h.artifacts.cleanup(h.id, id, preview.token), { code: 'artifactStorage' });
  h.f.workspace.update = update;
  assert.equal((await h.service.registered(h.id)).lifecycle, 'cleaned');
  const reopened = new TaskWorkspaces(h.ports, h.git);
  await reopened.artifacts.cleanup(h.id, id, preview.token);
  assert.equal(reopened.artifacts.states().find((entry) => entry.taskId === h.id)?.pending, false);
});

test('restoration intent is durable before a newly created worktree can be exposed by a host crash', async (t) => {
  const h = await prepared(t);
  await writeFile(join(h.workspace.directory, 'file.txt'), 'restore this edit');
  const savedId = randomUUID();
  await h.artifacts.cleanup(h.id, savedId, (await h.artifacts.inspect(h.id)).token);
  const next = await h.task(),
    operation = randomUUID();
  const prepare = h.service.prepare.bind(h.service);
  h.service.prepare = async (...args) => {
    await prepare(...args);
    throw new Error('crash after worktree creation');
  };
  await assert.rejects(
    h.artifacts.restore(next, operation, savedId, 'Restore after crash'),
    /crash after/,
  );
  h.service.prepare = prepare;
  assert.equal(h.artifacts.states().find((entry) => entry.taskId === next)?.pending, true);
  const reopened = new TaskWorkspaces(h.ports, h.git);
  const restored = await reopened.artifacts.restore(
    next,
    operation,
    savedId,
    'Restore after crash',
  );
  assert.equal(await readFile(join(restored.directory, 'file.txt'), 'utf8'), 'restore this edit');
  assert.equal(reopened.artifacts.states().find((entry) => entry.taskId === next)?.pending, false);
});
