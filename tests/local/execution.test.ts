import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, taskInput } from './fixtures';
import { modelServer } from './modelServer';
import { GitProcess } from '../../src/git/process';
import { TaskWorkspaces } from '../../src/git/taskWorkspaces';
import { ExecutionService } from '../../src/execution/service';
import { RunRecords, validateConfig } from '../../src/execution/records';
import { terminalStatuses, type RunSummary, type Protocol } from '../../src/shared/execution';
import type { CommandRunner } from '../../src/execution/commands';
async function waitUntil(check: () => boolean, max = 15000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > max) {
      throw new Error('Expected execution state was not reached.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function setup(
  t: TestContext,
  options: {
    git?: import('../../src/shared/model').GitStrategy;
    flip?: boolean;
    approve?: boolean;
    slow?: boolean;
    holdReview?: boolean;
    badReviewer?: boolean;
    badCheck?: boolean;
    mutateCheck?: boolean;
    switchDuringCheck?: boolean;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-execution-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'),
    storage = join(root, 'storage');
  await mkdir(repo);
  await mkdir(storage);
  const config = join(root, 'gitconfig');
  await writeFile(config, '');
  const git = new GitProcess({ env: { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' } });
  for (const args of [
    ['init'],
    ['symbolic-ref', 'HEAD', 'refs/heads/main'],
    ['config', 'user.name', 'test'],
    ['config', 'user.email', 'test@example.invalid'],
  ]) {
    await git.checked(args, repo);
  }
  await writeFile(join(repo, 'file.txt'), 'baseline');
  await git.checked(['add', 'file.txt'], repo);
  await git.checked(['commit', '-m', 'fixture'], repo);
  const f = fixture();
  let workerCalls = 0,
    reviewerCalls = 0;
  const captured: { agent: string; body: Record<string, unknown> }[] = [];
  let release: (() => void) | undefined;
  const server = await modelServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += String(chunk);
    });
    request.on('end', () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      const agent = body.model === 'worker-model' ? 'worker' : 'reviewer';
      captured.push({ agent, body });
      const count = agent === 'worker' ? ++workerCalls : ++reviewerCalls;
      const call =
        options.badReviewer && agent === 'reviewer'
          ? { name: 'write_file', arguments: '{"path":"file.txt","content":"reviewer-write"}' }
          : options.badCheck && agent === 'worker'
            ? { name: 'run_check', arguments: '{"id":"check","program":"injected"}' }
            : agent === 'worker'
              ? count % 2
                ? {
                    name: 'write_file',
                    arguments: JSON.stringify({
                      path: 'file.txt',
                      content: count === 1 ? 'bad' : 'fixed',
                    }),
                  }
                : { name: 'finish_work', arguments: '{"summary":"Inspect the updated artifact."}' }
              : {
                  name: 'submit_review',
                  arguments: JSON.stringify({
                    verdict: options.approve || count > 1 ? 'approve' : 'changes_requested',
                    summary: count === 1 ? 'Fix the failing check.' : 'Verified.',
                  }),
                };
      const id = `${agent}-${count}`;
      const batch =
        options.badCheck && agent === 'worker'
          ? [
              {
                id: `${id}-first`,
                name: 'write_file',
                arguments: '{"path":"file.txt","content":"must-not-execute"}',
              },
              { id, ...call },
            ]
          : [{ id, ...call }];
      const send = () => {
        response.setHeader('Content-Type', 'text/event-stream');
        const events = request.url?.endsWith('/responses')
          ? [
              { type: 'response.output_text.delta', delta: `${agent} public output` },
              {
                type: 'response.completed',
                response: {
                  status: 'completed',
                  output: [
                    { type: 'reasoning', encrypted_content: `${agent}_PRIVATE_PROTOCOL` },
                    ...batch.map((item) => ({
                      type: 'function_call',
                      call_id: item.id,
                      id: `item-${item.id}`,
                      name: item.name,
                      arguments: item.arguments,
                    })),
                  ],
                },
              },
            ]
          : [
              {
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: `${agent} public output`,
                      tool_calls: batch.map((item, index) => ({
                        index,
                        id: item.id,
                        type: 'function',
                        function: { name: item.name, arguments: item.arguments },
                      })),
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              },
              '[DONE]',
            ];
        response.end(
          events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''),
        );
      };
      if (
        (options.slow || (options.holdReview && agent === 'reviewer' && count === 1)) &&
        !release
      ) {
        release = send;
      } else {
        send();
      }
    });
  });
  t.after(() => server.close());
  const connection = async (name: string, protocol: Protocol) => {
    await f.store.dispatch({
      kind: 'connection.save',
      input: { name, baseUrl: `${server.url}/gateway`, defaultModel: '', protocol },
    });
    const id = (await f.store.snapshot()).connections.find((c) => c.name === name)!.id;
    f.setKey(`test-secret-${name}`);
    await f.store.dispatch({ kind: 'connection.key', id });
    return id;
  };
  const worker = await connection('worker', options.flip ? 'responses' : 'chatCompletions');
  const reviewer = await connection('reviewer', options.flip ? 'chatCompletions' : 'responses');
  await f.store.dispatch({
    kind: 'role.save',
    id: 'bug',
    locale: 'en',
    input: { name: 'Bug', purpose: 'Inspect', instructions: 'REVIEWER_PRIVATE_INSTRUCTION' },
  });
  await f.store.dispatch({
    kind: 'task.save',
    input: taskInput({
      git: options.git,
      requirements: 'Change file.txt to fixed.',
      worker: { connectionId: worker, model: 'worker-model' },
      reviewer: { connectionId: reviewer, model: 'reviewer-model' },
      maxRounds: options.approve ? 1 : 3,
    }),
  });
  const task = (await f.store.snapshot()).tasks[0];
  const workspaces = new TaskWorkspaces(
    {
      state: f.workspace,
      folders: () => [repo],
      storageRoot: () => storage,
      trusted: () => true,
      taskExists: async (id) => (await f.store.snapshot()).tasks.some((item) => item.id === id),
    },
    git,
  );
  const runner: CommandRunner = {
    available: async () => undefined,
    run: async (command, directory, signal) => {
      if (signal.aborted) {
        throw new Error('Stopped');
      }
      const ok = (await readFile(join(directory, 'file.txt'), 'utf8')) === 'fixed';
      if (options.switchDuringCheck) {
        await git.checked(['switch', '-c', 'check-switched'], directory);
      }
      if (options.mutateCheck) {
        await writeFile(join(directory, 'file.txt'), 'check-modified');
      }
      return {
        id: command.id,
        name: command.name,
        ok,
        exitCode: ok ? 0 : 1,
        output: ok ? 'check passed' : 'expected fixed',
      };
    },
  };
  const records = new RunRecords(f.workspace, () => storage);
  const service = new ExecutionService(f.store, workspaces, records, runner);
  f.ports.assertMutable = (action) => service.assertMutable(action);
  t.after(() => service.shutdown());
  await service.ready;
  await service.request({
    kind: 'config.save',
    config: {
      prepare: [],
      checks: [
        {
          id: 'check',
          name: 'Check artifact',
          program: 'unused-test-double',
          args: [],
          timeoutSeconds: 10,
        },
      ],
    },
  });
  return {
    f,
    repo,
    git,
    service,
    records,
    captured,
    task,
    worker,
    reviewer,
    release: () => release?.(),
    hasRequest: () => Boolean(release),
  };
}
for (const flip of [false, true]) {
  test(`executes two isolated agents across protocols, fixes failed checks and preserves source (flip=${flip})`, async (t) => {
    const h = await setup(t, { flip });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
    const run = h.service.snapshot().runs[0];
    assert.equal(run.status, 'completed', run.error);
    assert.equal(run.round, 2);
    assert.equal(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'fixed');
    assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline');
    const history = await h.records.history(run.id);
    assert.ok(history.some((event) => event.kind === 'check' && event.text.includes('FAIL')));
    assert.ok(history.some((event) => event.kind === 'check' && event.text.includes('PASS')));
    assert.ok(!JSON.stringify(history).includes('PRIVATE_PROTOCOL'));
    assert.ok(!JSON.stringify(history).includes('test-secret'));
    for (const request of h.captured) {
      const text = JSON.stringify(request.body);
      assert.ok(!text.includes('test-secret'));
      if (request.agent === 'worker') {
        assert.ok(!text.includes('REVIEWER_PRIVATE_INSTRUCTION'));
        assert.ok(!text.includes('reviewer_PRIVATE_PROTOCOL'));
      } else {
        assert.ok(!text.includes('worker_PRIVATE_PROTOCOL'));
        assert.ok(!text.includes('"name":"write_file"'));
      }
    }
    await h.service.request({ kind: 'restart', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
    assert.notEqual(h.service.snapshot().runs[0].id, run.id);
  });
}
test('failed mandatory checks cannot be approved and round limit is enforced', async (t) => {
  const h = await setup(t, { approve: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'roundLimit');
});
test('pauses at operation boundaries, locks inputs, accepts feedback and stops without consuming late output', async (t) => {
  const h = await setup(t, { slow: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  const run = h.service.snapshot().runs[0];
  await waitUntil(h.hasRequest);
  await assert.rejects(h.service.request({ kind: 'start', taskId: h.task.id }), /one task/);
  await assert.rejects(
    h.f.store.dispatch({ kind: 'task.save', id: h.task.id, input: taskInput() }),
    { code: 'executionLocked' },
  );
  await assert.rejects(h.f.store.dispatch({ kind: 'connection.key', id: h.worker }), {
    code: 'executionLocked',
  });
  await h.service.request({ kind: 'pause', runId: run.id });
  h.release();
  await waitUntil(() => h.service.snapshot().runs[0].status === 'paused');
  assert.equal(
    await readFile(join(h.service.snapshot().runs[0].directory!, 'file.txt'), 'utf8'),
    'baseline',
  );
  await h.service.request({ kind: 'feedback', runId: run.id, text: 'Human feedback marker' });
  await h.service.request({ kind: 'stop', runId: run.id });
  assert.equal(h.service.snapshot().runs[0].status, 'stopped');
  assert.equal(
    await readFile(join(h.service.snapshot().runs[0].directory!, 'file.txt'), 'utf8'),
    'baseline',
  );
});
test('stored unfinished executions become interrupted without starting commands', async (t) => {
  const h = await setup(t);
  const old: RunSummary = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    taskId: h.task.id,
    status: 'worker',
    round: 1,
    maxRounds: 5,
    createdAt: '',
    updatedAt: '',
    sequence: 0,
  };
  h.records.runs.push(old);
  await h.records.save();
  await h.records.initialize();
  assert.equal(h.records.runs[0].status, 'interrupted');
  assert.equal(h.captured.length, 0);
});
test('command configuration rejects arbitrary extra argument forms and invalid timeouts', () => {
  for (const timeoutSeconds of [0, 9, 901, NaN]) {
    assert.throws(() =>
      validateConfig({
        prepare: [],
        checks: [{ id: 'id', name: 'Check', program: 'npm', args: ['test'], timeoutSeconds }],
      }),
    );
  }
  assert.throws(() =>
    validateConfig({
      prepare: [],
      checks: [{ id: 'id', name: 'Check', program: 'npm', args: 'test', timeoutSeconds: 10 }],
    }),
  );
});

test('continue delivers paused feedback to Worker and preserves frozen configuration and roles', async (t) => {
  const h = await setup(t, { slow: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  const id = h.service.snapshot().runs[0].id;
  await waitUntil(h.hasRequest);
  await h.service.request({ kind: 'pause', runId: id });
  h.release();
  await waitUntil(() => h.service.snapshot().runs[0].status === 'paused');
  await h.service.request({ kind: 'feedback', runId: id, text: 'Human-only correction' });
  await h.service.request({ kind: 'config.save', config: { prepare: [], checks: [] } });
  await h.f.store.dispatch({
    kind: 'role.save',
    id: 'bug',
    locale: 'en',
    input: { name: 'Bug', purpose: 'changed', instructions: 'FUTURE_REVIEWER_ONLY' },
  });
  await h.service.request({ kind: 'resume', runId: id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'completed');
  assert.ok(
    h.captured
      .filter((request) => request.agent === 'worker')
      .some((request) => JSON.stringify(request.body).includes('Human-only correction')),
  );
  assert.ok(
    h.captured.every((request) => !JSON.stringify(request.body).includes('FUTURE_REVIEWER_ONLY')),
  );
});
test('external artifact changes invalidate review evidence and pause for explicit continuation', async (t) => {
  const h = await setup(t, { holdReview: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(h.hasRequest);
  const run = h.service.snapshot().runs[0];
  await writeFile(join(run.directory!, 'file.txt'), 'external edit');
  h.release();
  await waitUntil(() => h.service.snapshot().runs[0].status === 'paused');
  assert.ok(
    (await h.records.history(run.id)).some((event) => event.text.includes('evidence is invalid')),
  );
  await h.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'completed');
});
test('stopping a pending response prevents late tools from mutating the worktree', async (t) => {
  const h = await setup(t, { slow: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(h.hasRequest);
  const run = h.service.snapshot().runs[0];
  await h.service.request({ kind: 'stop', runId: run.id });
  h.release();
  assert.equal(h.service.snapshot().runs[0].status, 'stopped');
  assert.equal(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'baseline');
});
for (const option of ['badReviewer', 'badCheck'] as const) {
  test(`rejects unauthorized model tool use (${option})`, async (t) => {
    const h = await setup(t, { [option]: true });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
    const run = h.service.snapshot().runs[0];
    assert.equal(run.status, 'failed');
    assert.notEqual(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'reviewer-write');
    assert.notEqual(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'must-not-execute');
    assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline');
  });
}

test('checks cannot certify an artifact version that changes during command execution', async (t) => {
  const h = await setup(t, { mutateCheck: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'paused');
  const run = h.service.snapshot().runs[0];
  assert.equal(h.captured.filter((request) => request.agent === 'reviewer').length, 0);
  assert.ok(
    (await h.records.history(run.id)).some((event) =>
      event.text.includes('Check evidence is invalid'),
    ),
  );
  await h.service.request({ kind: 'stop', runId: run.id });
});

test('direct execution runs checks in source, keeps readonly preview separate and blocks dirty restart', async (t) => {
  const h = await setup(t, { git: { mode: 'current' } });
  const original = await h.git.checked(['worktree', 'list', '--porcelain'], h.repo);
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  const first = structuredClone(h.records.runs[0]);
  assert.equal(first.status, 'completed', first.error);
  assert.equal(first.directory, h.repo);
  assert.equal(first.git?.strategy?.mode, 'current');
  await assert.rejects(
    h.f.store.dispatch({
      kind: 'task.save',
      id: h.task.id,
      input: taskInput({ git: { mode: 'managed' } }),
    }),
    { code: 'gitLocked' },
  );
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'fixed');
  assert.equal(await h.service.directory(first.id), h.repo);
  assert.match(await h.service.preview(first.id), /fixed/);
  assert.equal(await h.git.checked(['worktree', 'list', '--porcelain'], h.repo), original);
  await h.service.request({ kind: 'restart', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.equal(h.records.runs[0].status, 'failed');
  assert.match(h.records.runs[0].error!, /clean directory/);
  await h.git.checked(['branch', 'another'], h.repo);
  await h.git.checked(['switch', 'another'], h.repo);
  await assert.rejects(h.service.preview(first.id), /ownership changed/);
  assert.equal(
    (await h.git.checked(['symbolic-ref', '--short', 'HEAD'], h.repo)).trim(),
    'another',
  );
});

test('an externally switched branch rejects late Worker writes', async (t) => {
  const h = await setup(t, { git: { mode: 'current' }, slow: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.captured.length > 0);
  await h.git.checked(['switch', '-c', 'external'], h.repo);
  h.release();
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.equal(h.records.runs[0].status, 'failed');
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline');
});

test('command boundaries reject a preset that switches away from the frozen execution branch', async (t) => {
  const h = await setup(t, { git: { mode: 'current' }, switchDuringCheck: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.equal(h.records.runs[0].status, 'failed');
  assert.match(h.records.runs[0].error!, /ownership changed/);
  assert.ok(!h.captured.some((request) => request.agent === 'reviewer'));
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'bad');
});
