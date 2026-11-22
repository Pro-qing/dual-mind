import { realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, taskInput } from './fixtures';
import { modelServer } from './modelServer';
import { GitProcess } from '../../src/git/process';
import { TaskWorkspaces } from '../../src/git/taskWorkspaces';
import { OperationError } from '../../src/shared/errors';
import { ExecutionService } from '../../src/execution/service';
import { Inference } from '../../src/providers/inference';
import { RunRecords, validateConfig } from '../../src/execution/records';
import { terminalStatuses, type RunSummary, type Protocol } from '../../src/shared/execution';
import {
  CommandShutdownError,
  LocalCommands,
  type CommandRunner,
} from '../../src/execution/commands';
async function waitUntil(check: () => boolean, max = process.platform === 'win32' ? 60000 : 15000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > max) {
      throw new Error('Expected execution state was not reached.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function nodeCommand(script: string) {
  const quote = (value: string) =>
    "'" + value.replaceAll("'", process.platform === 'win32' ? "''" : "'\\''") + "'";
  return `${process.platform === 'win32' ? '& ' : ''}${quote(process.execPath)} -e ${quote(script)}`;
}
async function setup(
  t: TestContext,
  options: {
    git?: import('../../src/shared/model').GitStrategy;
    flip?: boolean;
    approve?: boolean;
    slow?: boolean;
    slowWorker?: boolean;
    fixedInitially?: boolean;
    holdReview?: boolean;
    badReviewer?: boolean;
    badCheck?: boolean;
    mutateCheck?: boolean;
    switchDuringCheck?: boolean;
    autonomous?: boolean;
    readingOnly?: boolean;
    unavailable?: boolean;
    shutdownFailure?: boolean;
    realCommands?: boolean;
    badArguments?: 'once' | 'always' | 'json';
    streamSecret?: string;
    reviewerCommands?: boolean;
    reviewerFailure?: boolean;
    reviewerMutation?: boolean;
    failure?: {
      agent: 'worker' | 'reviewer';
      phase?: 'planning' | 'answering' | 'reviewer';
      at: number;
      enabled: boolean;
      status?: number;
    };
  } = {},
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dualmind-execution-test-')));
  const cleanup: { service?: ExecutionService; server?: { close(): Promise<void> } } = {};
  t.after(async () => {
    await cleanup.service?.shutdown();
    await cleanup.server?.close();
    await rm(root, { recursive: true, force: true });
  });
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
  let explored = false;
  const verifiedRounds = new Set<number>();
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
      const tools = body.tools as { name?: string; function?: { name: string } }[];
      const planning = tools.some((tool) => (tool.name || tool.function?.name) === 'submit_plan');
      const texts = JSON.stringify(body);
      const answering = tools.some(
        (tool) => (tool.name || tool.function?.name) === 'submit_answer',
      );
      const phase = answering ? 'answering' : planning ? 'planning' : agent;
      if (
        options.failure?.enabled &&
        agent === options.failure.agent &&
        count >= options.failure.at &&
        (!options.failure.phase || options.failure.phase === phase)
      ) {
        if (agent === 'worker') {
          workerCalls--;
        } else {
          reviewerCalls--;
        }
        response.writeHead(options.failure.status ?? 401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'temporary', message: 'fixture failure' } }));
        return;
      }
      const plan = {
        objective: 'Change file.txt to fixed.',
        requirements: texts.includes('Human-only correction')
          ? 'Human-only correction'
          : 'Change file.txt to fixed.',
        steps: ['Inspect file.txt', 'Implement and verify the requested change'],
        criteria: [
          {
            id: 'artifact',
            description: 'file.txt contains fixed',
            verification: options.autonomous ? 'command' : 'reading',
            evidence: 'Inspect the actual artifact and test result',
            reason: options.autonomous ? '' : 'A single text artifact can be directly inspected',
          },
        ],
        revisionReason: planning ? '' : 'Repair the failed artifact and provide current evidence',
      };
      const messages = (body.messages || body.input) as Record<string, unknown>[];
      const commandIds = messages
        .flatMap((message) => {
          if (message.role !== 'tool' && message.type !== 'function_call_output') {
            return [];
          }
          try {
            const result = JSON.parse(String(message.content || message.output));
            return result.id && result.purpose === 'verify' ? [result.id as string] : [];
          } catch {
            return [];
          }
        })
        .slice(-1);
      const handoff = messages
        .flatMap((m) => {
          if (m.role !== 'user') {
            return [];
          }
          try {
            const value = JSON.parse(String(m.content));
            return value.handoff === 'worker_artifacts' ? [value] : [];
          } catch {
            return [];
          }
        })
        .at(-1);
      const rejected = /"accepted":false/.test(
        messages
          .filter((m) => m.role === 'tool' || m.type === 'function_call_output')
          .map((m) => String(m.content || m.output))
          .at(-1) || '',
      );
      const approve =
        !rejected &&
        (options.approve ||
          options.readingOnly ||
          options.fixedInitially ||
          (handoff?.round ?? 0) > 1);
      const preparing = options.autonomous && options.flip && count === 1;
      const workerStep =
        count -
        (options.autonomous && options.flip ? 1 : 0) -
        (options.badArguments && options.badArguments !== 'always' && count > 1 ? 1 : 0);
      const step = options.autonomous ? (workerStep - 1) % 3 : (workerStep - 1) % 2;
      const userHandoff = messages
        .filter((m) => m.role === 'user')
        .map((m) => {
          try {
            return JSON.parse(String(m.content));
          } catch {
            return undefined;
          }
        })
        .filter((m) => m?.handoff === 'user_messages')
        .at(-1);
      if (answering && userHandoff?.currentPlan) {
        plan.revisionReason = 'Apply queued user requirements';
      }
      const invalidArguments =
        agent === 'worker' &&
        options.badArguments &&
        (options.badArguments === 'always' || count === 1);
      const probeNow = options.reviewerCommands && agent === 'reviewer' && planning && !explored;
      const verifyNow =
        options.reviewerCommands &&
        agent === 'reviewer' &&
        !planning &&
        !answering &&
        !verifiedRounds.has(handoff.round);
      if (probeNow) {
        explored = true;
      }
      if (verifyNow) {
        verifiedRounds.add(handoff.round);
      }
      const call =
        probeNow || verifyNow
          ? {
              name: 'run_command',
              arguments: JSON.stringify({
                name: probeNow ? 'Reviewer explore' : 'Reviewer verify',
                command: nodeCommand(
                  probeNow
                    ? 'console.log(process.cwd())'
                    : options.reviewerMutation
                      ? 'require("node:fs").writeFileSync("file.txt","reviewer-change")'
                      : options.reviewerFailure
                        ? 'process.exit(9)'
                        : 'if(require("node:fs").readFileSync("file.txt","utf8")!=="fixed")process.exit(1)',
                ),
                purpose: probeNow ? 'explore' : 'verify',
                criterionIds: probeNow ? [] : ['artifact'],
              }),
            }
          : invalidArguments
            ? {
                name: 'run_command',
                arguments:
                  options.badArguments === 'json'
                    ? '{"secret":"must-not-log"'
                    : JSON.stringify({
                        name: 'invalid',
                        command: [17, 'must-not-log'],
                        purpose: 'explore',
                        criterionIds: [],
                      }),
              }
            : answering && !JSON.stringify(userHandoff?.messages).includes('modification')
              ? {
                  name: 'submit_answer',
                  arguments: JSON.stringify({
                    answer: 'Read-only answer about the current artifact.',
                  }),
                }
              : options.badReviewer && agent === 'reviewer'
                ? {
                    name: 'write_file',
                    arguments: '{"path":"file.txt","content":"reviewer-write"}',
                  }
                : options.badCheck && agent === 'worker'
                  ? { name: 'run_check', arguments: '{"id":"check","program":"injected"}' }
                  : planning
                    ? { name: 'submit_plan', arguments: JSON.stringify(plan) }
                    : preparing && agent === 'worker'
                      ? {
                          name: 'run_command',
                          arguments: JSON.stringify({
                            name: 'Prepare dependencies',
                            command: options.realCommands
                              ? nodeCommand('process.stdout.write("ready")')
                              : 'prepare-test-double',
                            purpose: 'prepare',
                            criterionIds: [],
                          }),
                        }
                      : agent === 'worker'
                        ? step === 0
                          ? {
                              name: 'write_file',
                              arguments: JSON.stringify({
                                path: 'file.txt',
                                content:
                                  workerStep === 1 &&
                                  !options.readingOnly &&
                                  !options.fixedInitially
                                    ? 'bad'
                                    : 'fixed',
                              }),
                            }
                          : options.autonomous && step === 1
                            ? {
                                name: 'run_command',
                                arguments: JSON.stringify({
                                  name: 'Verify artifact',
                                  command: options.realCommands
                                    ? nodeCommand(
                                        'if(require("node:fs").readFileSync("file.txt","utf8")!=="fixed")process.exit(1)',
                                      )
                                    : 'test-double',
                                  purpose: 'verify',
                                  criterionIds: ['artifact'],
                                }),
                              }
                            : {
                                name: 'finish_work',
                                arguments: JSON.stringify({
                                  summary: 'Inspect the updated artifact.',
                                  completedSteps: ['Changed file.txt'],
                                  evidence: [
                                    {
                                      criterionId: 'artifact',
                                      commandIds,
                                      evidence: 'Read file.txt and the recorded result',
                                    },
                                  ],
                                  unresolved: [],
                                }),
                              }
                        : {
                            name: 'submit_review',
                            arguments: JSON.stringify({
                              verdict: approve ? 'approve' : 'changes_requested',
                              summary: approve ? 'Verified.' : 'Fix the failing check.',
                              acceptance: [
                                {
                                  criterionId: 'artifact',
                                  commandIds:
                                    options.reviewerCommands && commandIds.length
                                      ? commandIds
                                      : (handoff?.submission?.evidence?.[0]?.commandIds ?? []),
                                  evidence:
                                    'Inspected actual file.txt and supplied command evidence',
                                  passed: approve,
                                },
                              ],
                              ...(approve ? {} : { nextPlan: plan }),
                            }),
                          };
      const id = `${agent}-${count}`;
      const batch =
        (options.badCheck && agent === 'worker') || invalidArguments
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
        if (options.streamSecret) {
          const chunks = [
            'filler '.repeat(3000) + options.streamSecret.slice(0, 13),
            options.streamSecret.slice(13),
          ];
          for (const text of chunks) {
            const delta = request.url?.endsWith('/responses')
              ? { type: 'response.output_text.delta', delta: text }
              : { choices: [{ index: 0, delta: { content: text } }] };
            response.write(`data: ${JSON.stringify(delta)}\n\n`);
          }
        }
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
        (options.slow ||
          (options.slowWorker && agent === 'worker') ||
          (options.holdReview && agent === 'reviewer' && !planning)) &&
        !release
      ) {
        release = send;
      } else {
        send();
      }
    });
  });
  cleanup.server = server;
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
      maxRounds: options.approve || options.unavailable ? 1 : 3,
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
  let commands = 0;
  const runner: CommandRunner = {
    run: async (command, directory, signal, output, environment, onProcess) => {
      commands++;
      if (options.realCommands) {
        return new LocalCommands().run(command, directory, signal, output, environment, onProcess);
      }
      if (options.shutdownFailure) {
        throw new CommandShutdownError();
      }
      if (options.unavailable) {
        throw new OperationError('commandNotFound', {
          name: command.name,
          program: 'command' in command ? command.shell.program : command.program,
        });
      }
      if (signal.aborted) {
        throw new Error('Stopped');
      }
      const ok =
        ('command' in command ? command.command : command.program) === 'prepare-test-double' ||
        (await readFile(join(directory, 'file.txt'), 'utf8')) === 'fixed';
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
  cleanup.service = service;
  await service.ready;
  if (!options.autonomous && !options.readingOnly) {
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
  }
  return {
    f,
    repo,
    storage,
    workspaces,
    runner,
    git,
    service,
    records,
    captured,
    commands: () => commands,
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
    const activities: import('../../src/shared/execution').ExecutionActivity[] = [];
    h.service.subscribe((update) => {
      if (update.state.activity) {
        activities.push(update.state.activity);
      }
    });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
    const run = h.service.snapshot().runs[0];
    assert.equal(run.status, 'completed', run.error);
    assert.equal(run.round, 2);
    assert.equal(h.service.snapshot().activity, undefined);
    assert.ok(
      activities.some(
        (a) => a.agent === 'reviewer' && a.phase === 'planning' && a.stage === 'waiting',
      ),
    );
    for (const stage of ['waiting', 'receiving', 'tool', 'command']) {
      assert.ok(
        activities.some((a) => a.stage === stage),
        stage,
      );
    }
    assert.ok(
      activities.every(
        (a) =>
          a.runId === run.id && a.taskId === h.task.id && Number.isFinite(Date.parse(a.startedAt)),
      ),
    );
    assert.ok(!JSON.stringify(activities).includes('test-secret'));
    assert.ok(!JSON.stringify(activities).includes('PRIVATE_PROTOCOL'));
    const publicMessages = (
      await h.service.request({ kind: 'conversation', taskId: h.task.id, includeProcess: true })
    ).conversation!.messages;
    assert.ok(publicMessages.some((m) => m.kind === 'process' && m.role === 'worker'));
    assert.ok(publicMessages.some((m) => m.kind === 'process' && m.role === 'reviewer'));
    assert.ok(!JSON.stringify(publicMessages).includes('PRIVATE_PROTOCOL'));
    assert.ok(!JSON.stringify(publicMessages).includes('test-secret'));

    assert.equal(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'fixed');
    assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'baseline');
    const history = await h.records.history(run.id);
    assert.ok(
      history.some(
        (event) =>
          event.kind === 'check' &&
          event.text.includes('FAIL') &&
          event.fault?.code === 'commandFailed',
      ),
    );
    assert.ok(
      history
        .filter((event) => event.fault)
        .every((event) => !JSON.stringify(event.fault).includes('test-secret')),
    );
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
    const requestCount = h.captured.length;
    await h.service.request({ kind: 'restart', taskId: h.task.id });
    assert.notEqual(h.service.snapshot().runs[0].id, run.id);
    await waitUntil(() => h.captured.length > requestCount);
    assert.equal(h.captured[requestCount].agent, 'reviewer', 'Restart must plan again');
    await h.service.request({ kind: 'stop', runId: h.service.snapshot().runs[0].id });
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

test('continue delivers paused feedback through Reviewer planning and preserves frozen configuration and roles', async (t) => {
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
  await waitUntil(() => h.captured.some((request) => request.agent === 'worker'));
  assert.ok(
    JSON.stringify(h.captured.find((request) => request.agent === 'worker')!.body).includes(
      'Check artifact',
    ),
    'The active run keeps its original additional checks',
  );
  await h.service.request({ kind: 'stop', runId: id });
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
  await waitUntil(() => h.service.snapshot().runs[0].plan?.version === 2);
  assert.ok(h.service.snapshot().runs[0].plan?.revisionReason);
  await h.service.request({ kind: 'stop', runId: run.id });
});
test('stopping a pending Worker response prevents late tools from mutating the worktree', async (t) => {
  const h = await setup(t, { slowWorker: true });
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
  assert.equal(h.captured.filter((request) => request.agent === 'reviewer').length, 1);
  assert.ok(
    (await h.records.history(run.id)).some((event) =>
      event.text.includes('Check evidence is invalid'),
    ),
  );
  await h.service.request({ kind: 'stop', runId: run.id });
});

test('direct execution runs checks in source, keeps readonly preview separate and blocks dirty restart', async (t) => {
  const h = await setup(t, { git: { mode: 'current' }, fixedInitially: true });
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
  assert.equal(h.records.runs[0].fault?.code, 'dirtyRepository');
  await h.git.checked(['branch', 'another'], h.repo);
  await h.git.checked(['switch', 'another'], h.repo);
  await assert.rejects(h.service.preview(first.id), { code: 'workspaceChanged' });
  assert.equal(
    (await h.git.checked(['symbolic-ref', '--short', 'HEAD'], h.repo)).trim(),
    'another',
  );
});

test('an externally switched branch rejects late Worker writes', async (t) => {
  const h = await setup(t, { git: { mode: 'current' }, slowWorker: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(h.hasRequest);
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
  assert.equal(h.records.runs[0].fault?.code, 'workspaceChanged');
  assert.equal(h.captured.filter((request) => request.agent === 'reviewer').length, 1);
  assert.equal(await readFile(join(h.repo, 'file.txt'), 'utf8'), 'bad');
});

for (const flip of [false, true]) {
  test(`autonomous commands execute without user presets (flip=${flip})`, async (t) => {
    const h = await setup(t, { autonomous: true, flip });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
    const run = h.records.runs[0];
    assert.equal(run.status, 'completed', run.error);
    assert.equal(h.captured[0].agent, 'reviewer');
    assert.equal(run.plan?.version, 2);
    assert.equal(run.review?.planVersion, 2);
    assert.ok(h.commands() >= 2);
    const events = await h.records.history(run.id);
    assert.equal(events.filter((e) => e.detail?.type === 'plan').length, 2);
    assert.ok(events.some((e) => e.detail?.type === 'command' && e.detail.command.ok));
    assert.equal(run.submission?.evidence[0].commandIds.length, 1);
    if (flip) {
      assert.ok(
        events.some((e) => e.detail?.type === 'command' && e.detail.command.purpose === 'prepare'),
        'Worker prepared dependencies autonomously',
      );
    }
  });
}
test('reading-only acceptance needs no command executable', async (t) => {
  const h = await setup(t, { readingOnly: true, unavailable: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.equal(h.records.runs[0].status, 'completed', h.records.runs[0].error);
  assert.equal(h.records.runs[0].round, 1);
  assert.equal(h.commands(), 0);
});
test('command launch failures remain structured evidence and cannot approve execution', async (t) => {
  const h = await setup(t, { autonomous: true, unavailable: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.notEqual(h.records.runs[0].status, 'completed');
  assert.ok(
    h.captured.filter((request) => request.agent === 'reviewer').length > 1,
    'A launch failure is returned to the agents for revision',
  );
  assert.ok(
    (await h.records.history(h.records.runs[0].id)).some(
      (e) => e.detail?.type === 'command' && e.detail.command.fault?.code === 'commandNotFound',
    ),
  );
});
test('unconfirmed command shutdown prevents further execution', async (t) => {
  const h = await setup(t, { autonomous: true, shutdownFailure: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.equal(h.records.runs[0].fault?.code, 'commandShutdown');
  await assert.rejects(h.service.request({ kind: 'start', taskId: h.task.id }), {
    code: 'shutdownUnconfirmed',
  });
  assert.equal(h.commands(), 1);
});

for (const flip of [false, true]) {
  for (const mode of ['managed', 'current', 'branch'] as const) {
    test(`follow-up answers then continues uncommitted artifacts (${mode}, flip=${flip})`, async (t) => {
      const ctx = await setup(t, {
        flip,
        readingOnly: true,
        git: mode === 'branch' ? { mode, branch: 'main' } : { mode },
      });
      await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
      await waitUntil(() => ctx.records.runs[0].status === 'completed');
      const original = structuredClone(ctx.records.runs[0]);
      const calls = ctx.captured.filter((c) => c.agent === 'worker').length;
      const id = randomUUID();
      await ctx.service.request({
        kind: 'message.send',
        taskId: ctx.task.id,
        messageId: id,
        text: 'Explain the result',
      });
      await waitUntil(() => ctx.records.runs[0].status === 'answered');
      assert.equal(ctx.captured.filter((c) => c.agent === 'worker').length, calls);
      assert.equal(ctx.commands(), 0);
      assert.deepEqual(ctx.records.runs.find((r) => r.id === original.id)?.review, original.review);
      assert.equal(ctx.records.runs[0].review, undefined);
      const count = ctx.records.runs.length;
      await ctx.service.request({
        kind: 'message.send',
        taskId: ctx.task.id,
        messageId: id,
        text: 'Explain the result',
      });
      assert.equal(ctx.records.runs.length, count);
      await assert.rejects(
        ctx.service.request({
          kind: 'message.send',
          taskId: ctx.task.id,
          messageId: id,
          text: 'Different content',
        }),
        (e: unknown) => e instanceof OperationError && e.code === 'messageConflict',
      );
      await writeFile(
        join(original.directory!, 'user-added.txt'),
        'Keep this uncommitted user work',
      );
      await ctx.service.request({
        kind: 'message.send',
        taskId: ctx.task.id,
        messageId: randomUUID(),
        text: 'Continue modification',
      });
      await waitUntil(() => ctx.records.runs[0].status === 'completed');
      assert.equal(ctx.records.runs[0].previousRunId, original.id);
      assert.equal(ctx.records.runs[0].directory, original.directory);
      assert.equal(ctx.records.runs[0].branch, original.branch);
      assert.equal(ctx.records.runs[0].round, 1);
      assert.equal(ctx.records.runs[0].plan?.version, 1);
      assert.equal(
        await readFile(join(original.directory!, 'user-added.txt'), 'utf8'),
        'Keep this uncommitted user work',
      );
      const conversation = await ctx.service.request({ kind: 'conversation', taskId: ctx.task.id });
      assert.equal(conversation.conversation?.messages.filter((m) => m.role === 'user').length, 2);
      assert.ok(conversation.conversation?.messages.some((m) => m.kind === 'answer'));
      assert.equal((await ctx.records.pending(ctx.task.id)).length, 0);
    });
  }
}
test('queued questions wait through manual pause and are answered before final acceptance', async (t) => {
  const ctx = await setup(t, { readingOnly: true, slowWorker: true });
  await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
  await waitUntil(ctx.hasRequest);
  const run = ctx.records.runs[0];
  await ctx.service.request({ kind: 'pause', runId: run.id });
  await ctx.service.request({
    kind: 'message.send',
    taskId: ctx.task.id,
    messageId: randomUUID(),
    text: 'Explain the result',
  });
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 1);
  ctx.release();
  await waitUntil(() => run.status === 'paused');
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 1);
  await ctx.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => run.status === 'completed');
  assert.equal(run.round, 1);
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 0);
  assert.ok((await ctx.records.messages(ctx.task.id)).some((m) => m.kind === 'answer'));
});
test('queued modifications create the next plan and retain the active round budget', async (t) => {
  const ctx = await setup(t, { readingOnly: true, slowWorker: true });
  await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
  await waitUntil(ctx.hasRequest);
  const run = ctx.records.runs[0];
  await ctx.service.request({
    kind: 'message.send',
    taskId: ctx.task.id,
    messageId: randomUUID(),
    text: 'Queued modification',
  });
  ctx.release();
  await waitUntil(() => run.status === 'completed');
  assert.equal(run.plan?.version, 2);
  assert.equal(run.round, 2);
  assert.equal(run.maxRounds, ctx.task.maxRounds);
  assert.equal(ctx.records.runs.length, 1);
});
test('binding changes retain the message and block continuation without switching branches', async (t) => {
  const ctx = await setup(t, { readingOnly: true, git: { mode: 'current' } });
  await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
  await waitUntil(() => ctx.records.runs[0].status === 'completed');
  await ctx.git.checked(['switch', '-c', 'external'], ctx.repo);
  await ctx.service.request({
    kind: 'message.send',
    taskId: ctx.task.id,
    messageId: randomUUID(),
    text: 'Continue modification',
  });
  assert.equal(ctx.records.runs.length, 1);
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 1);
  assert.ok((await ctx.records.pending(ctx.task.id))[0].fault);
  await assert.rejects(ctx.service.request({ kind: 'messages.resume', taskId: ctx.task.id }));
  assert.match(await ctx.git.checked(['branch', '--show-current'], ctx.repo), /external/);
});
test('stop and reload preserve queued messages without replaying them', async (t) => {
  const ctx = await setup(t, { readingOnly: true, slowWorker: true });
  await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
  await waitUntil(ctx.hasRequest);
  const run = ctx.records.runs[0];
  await ctx.service.request({
    kind: 'message.send',
    taskId: ctx.task.id,
    messageId: randomUUID(),
    text: 'Explain the result',
  });
  await ctx.service.request({ kind: 'stop', runId: run.id });
  ctx.release();
  await ctx.records.initialize();
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 1);
  assert.equal(ctx.records.runs.length, 1);
  await ctx.service.request({ kind: 'messages.resume', taskId: ctx.task.id });
  await waitUntil(() => ctx.records.runs[0].status === 'answered');
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 0);
});

for (const flip of [false, true]) {
  test(`continuation verifies new artifacts with fresh real command evidence (flip=${flip})`, async (t) => {
    const ctx = await setup(t, { flip, autonomous: true, realCommands: true });
    await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
    await waitUntil(() => ctx.records.runs[0].status === 'completed');
    const oldRun = ctx.records.runs[0];
    const oldCommands = (await ctx.records.history(oldRun.id)).flatMap((e) =>
      e.detail?.type === 'command' ? [e.detail.command.id] : [],
    );
    await ctx.service.request({
      kind: 'message.send',
      taskId: ctx.task.id,
      messageId: randomUUID(),
      text: 'Continue modification',
    });
    await waitUntil(() => ctx.records.runs[0].status === 'completed');
    const current = ctx.records.runs[0];
    assert.notEqual(current.id, oldRun.id);
    const accepted = current.review!.acceptance.flatMap((e) => e.commandIds);
    assert.ok(accepted.length > 0);
    assert.ok(accepted.every((id) => !oldCommands.includes(id)));
    const commands = (await ctx.records.history(current.id)).flatMap((e) =>
      e.detail?.type === 'command' ? [e.detail.command] : [],
    );
    assert.ok(
      accepted.every((id) => commands.some((c) => c.id === id && c.ok && c.before === c.after)),
    );
  });
}
test('queued modification cannot increase the current round limit', async (t) => {
  const ctx = await setup(t, { readingOnly: true, approve: true, slowWorker: true });
  await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
  await waitUntil(ctx.hasRequest);
  await ctx.service.request({
    kind: 'message.send',
    taskId: ctx.task.id,
    messageId: randomUUID(),
    text: 'Queued modification',
  });
  ctx.release();
  await waitUntil(() => ctx.records.runs[0].status === 'roundLimit');
  assert.equal(ctx.records.runs[0].maxRounds, 1);
  assert.equal(ctx.records.runs[0].round, 1);
  assert.equal(ctx.records.runs[0].plan?.version, 2);
  assert.equal(ctx.records.runs[0].review, undefined);
});
test('messages arriving during final review are answered before completion and secrets are redacted', async (t) => {
  const ctx = await setup(t, { readingOnly: true, holdReview: true });
  await ctx.service.request({ kind: 'start', taskId: ctx.task.id });
  await waitUntil(ctx.hasRequest);
  const id = randomUUID();
  await Promise.all(
    [1, 2].map(() =>
      ctx.service.request({
        kind: 'message.send',
        taskId: ctx.task.id,
        messageId: id,
        text: 'Explain test-secret-worker',
      }),
    ),
  );
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 1);
  assert.ok(!(await ctx.records.messages(ctx.task.id))[0].text.includes('test-secret-worker'));
  ctx.release();
  await waitUntil(() => ctx.records.runs[0].status === 'completed');
  assert.equal((await ctx.records.pending(ctx.task.id)).length, 0);
  assert.ok((await ctx.records.messages(ctx.task.id)).some((m) => m.kind === 'answer'));
});

for (const flip of [false, true]) {
  for (const badArguments of ['once', 'json', 'always'] as const) {
    test(`argument correction is atomic and bounded (${badArguments}, flip=${flip})`, async (t) => {
      const h = await setup(t, { flip, badArguments, readingOnly: true, fixedInitially: true });
      await h.service.request({ kind: 'start', taskId: h.task.id });
      await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
      const run = h.records.runs[0];
      const events = await h.records.history(run.id);
      assert.ok(events.some((event) => event.fault?.code === 'toolArgumentsInvalid'));
      assert.ok(events.some((event) => event.text.includes('entire batch was skipped')));
      assert.ok(!JSON.stringify(events).includes('must-not-log'));
      assert.equal(h.commands(), 0);
      if (badArguments === 'always') {
        assert.equal(run.fault?.code, 'toolCorrectionLimit');
        assert.equal(h.captured.filter((call) => call.agent === 'worker').length, 3);
        assert.equal(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'baseline');
      } else {
        assert.equal(run.status, 'completed');
        assert.equal(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'fixed');
        const requests = h.captured.filter((call) => call.agent === 'worker');
        const corrected = JSON.stringify(requests[1].body);
        assert.ok(corrected.includes('worker-1-first'));
        assert.ok(corrected.includes('executed'));
        if (badArguments === 'once') {
          assert.ok(corrected.includes('$.command'));
        }
      }
    });
  }
}

test('pure reading needs no language configuration and records only shell metadata', async (t) => {
  const h = await setup(t, { readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
  assert.equal(h.records.runs[0].status, 'completed');
  assert.ok(h.records.runs[0].environment?.shell.program);
  assert.ok(!('env' in h.records.runs[0].environment!));
});

for (const flip of [false, true]) {
  test(`Reviewer independently explores and verifies through real shell commands (flip=${flip})`, async (t) => {
    const h = await setup(t, {
      flip,
      autonomous: true,
      approve: true,
      fixedInitially: true,
      realCommands: true,
      reviewerCommands: true,
    });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
    const run = h.records.runs[0];
    assert.equal(run.status, 'completed', run.error);
    const commands = (await h.records.history(run.id)).flatMap((event) =>
      event.detail?.type === 'command' ? [event.detail.command] : [],
    );
    const probe = commands.find((command) => command.phase === 'planning')!;
    const verify = commands.find((command) => command.phase === 'reviewer')!;
    assert.equal(probe.agent, 'reviewer');
    assert.equal(probe.planVersion, 0);
    assert.equal(probe.purpose, 'explore');
    assert.equal(verify.agent, 'reviewer');
    assert.equal(verify.ok, true);
    assert.equal(verify.exitCode, 0);
    assert.ok(verify.command);
    assert.equal(verify.before, verify.after);
    assert.ok(run.review!.acceptance[0].commandIds.includes(verify.id));
    assert.ok(!run.submission!.evidence[0].commandIds.includes(verify.id));
    const events = await h.records.history(run.id);
    assert.ok(events.some((event) => event.kind === 'check' && event.agent === 'reviewer'));
  });
  test(`Reviewer failed verification blocks approval of earlier Worker success (flip=${flip})`, async (t) => {
    const h = await setup(t, {
      flip,
      autonomous: true,
      approve: true,
      fixedInitially: true,
      realCommands: true,
      reviewerCommands: true,
      reviewerFailure: true,
    });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
    assert.equal(h.records.runs[0].status, 'roundLimit');
    assert.equal(h.records.runs[0].review?.verdict, 'changes_requested');
  });
}
test('Reviewer source changes retain artifacts and require human continuation', async (t) => {
  const h = await setup(t, {
    autonomous: true,
    approve: true,
    fixedInitially: true,
    realCommands: true,
    reviewerCommands: true,
    reviewerMutation: true,
  });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.records.runs[0].status === 'paused');
  assert.equal(
    await readFile(join(h.records.runs[0].directory!, 'file.txt'), 'utf8'),
    'reviewer-change',
  );
  assert.ok(
    (await h.records.history(h.records.runs[0].id)).some(
      (event) => event.fault?.code === 'reviewChanged',
    ),
  );
  await h.service.request({ kind: 'stop', runId: h.records.runs[0].id });
});

for (const flip of [false, true]) {
  test(`environment credentials split across streamed deltas are redacted (flip=${flip})`, async (t) => {
    const secret = 'dualmind-stream-token-unique/a+b';
    const previous = process.env.DUALMIND_TEST_TOKEN;
    process.env.DUALMIND_TEST_TOKEN = secret;
    t.after(() => {
      if (previous === undefined) {
        delete process.env.DUALMIND_TEST_TOKEN;
      } else {
        process.env.DUALMIND_TEST_TOKEN = previous;
      }
    });
    const h = await setup(t, { flip, readingOnly: true, streamSecret: secret });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => terminalStatuses.includes(h.records.runs[0].status));
    assert.equal(h.records.runs[0].status, 'completed');
    const events = await h.records.history(
      h.records.runs[0].id,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
    const text = events
      .filter((e) => e.kind === 'text')
      .map((e) => e.text)
      .join('');
    assert.ok(text.includes('[redacted]'));
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes('dualmind-stream-token'));
    assert.ok(!text.includes('unique/a+b'));
  });
}

for (const flip of [false, true]) {
  test(`waiting activity survives silent output, pauses cleanly and is never persisted (flip=${flip})`, async (t) => {
    const h = await setup(t, { flip, slowWorker: true, readingOnly: true });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => h.hasRequest());
    const waiting = h.service.snapshot().activity!;
    assert.equal(waiting.stage, 'waiting');
    assert.equal(waiting.agent, 'worker');
    assert.ok(waiting.requestId);
    waiting.stage = 'command';
    assert.equal(
      h.service.snapshot().activity!.stage,
      'waiting',
      'snapshot must not expose mutable runtime state',
    );
    assert.equal(
      h.records.snapshot().runs.some((run) => 'activity' in run),
      false,
    );
    const run = h.records.runs[0];
    await h.service.request({ kind: 'pause', runId: run.id });
    assert.equal(run.status, 'pausing');
    h.release();
    await waitUntil(() => run.status === 'paused');
    assert.equal(h.service.snapshot().activity, undefined);
    await h.service.request({ kind: 'resume', runId: run.id });
    await waitUntil(() => terminalStatuses.includes(run.status));
    assert.equal(run.status, 'completed', run.error);
    assert.equal(h.service.snapshot().activity, undefined);
    assert.ok(
      !JSON.stringify(h.f.workspace.values.get('dualMind.execution.v1')).includes('"activity"'),
    );
  });
  test(`stopping a silent request clears activity before any late output (flip=${flip})`, async (t) => {
    const h = await setup(t, { flip, slowWorker: true, readingOnly: true });
    await h.service.request({ kind: 'start', taskId: h.task.id });
    await waitUntil(() => h.hasRequest());
    const run = h.records.runs[0];
    assert.equal(h.service.snapshot().activity!.stage, 'waiting');
    await h.service.request({ kind: 'stop', runId: run.id });
    assert.equal(run.status, 'stopped');
    assert.equal(h.service.snapshot().activity, undefined);
    h.release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(h.service.snapshot().activity, undefined);
  });
}

for (const flip of [false, true]) {
  for (const failedRole of ['worker', 'reviewer'] as const) {
    test(`durable recovery resumes ${failedRole} without repeating completed writes (flip=${flip})`, async (t) => {
      const failure = { agent: failedRole, at: 2, enabled: true };
      const h = await setup(t, { flip, failure, readingOnly: true });
      await h.service.request({ kind: 'start', taskId: h.task.id });
      await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
      await h.service.shutdown();
      const failed = h.service.snapshot().runs[0];
      assert.equal(failed.recovery?.agent, failedRole);
      assert.equal(failed.recovery?.available, true);
      const saved = await h.records.recovery(failed.id).load();
      assert.ok(
        saved?.operations.some((op) => op.name === 'write_file' && op.status === 'succeeded'),
      );
      const journal = await readFile(join(h.storage, 'recovery', `${failed.id}.journal`), 'utf8');
      assert.ok(!journal.includes('PRIVATE_PROTOCOL'));
      assert.ok(!journal.includes('test-secret'));
      const records = new RunRecords(h.f.workspace, () => h.storage);
      const service = new ExecutionService(
        h.f.store,
        h.workspaces,
        records,
        h.runner,
        new Inference(),
      );
      t.after(() => service.shutdown());
      await service.ready;
      failure.enabled = false;
      const recoveryStates: RunSummary[] = [];
      service.subscribe(({ state }) => {
        if (state.runs[0].status === 'recovering') {
          recoveryStates.push(structuredClone(state.runs[0]));
        }
      });
      const count = h.captured.length;
      const results = await Promise.allSettled([
        service.request({ kind: 'resume', runId: failed.id }),
        service.request({ kind: 'resume', runId: failed.id }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      await waitUntil(() => terminalStatuses.includes(service.snapshot().runs[0].status));
      await service.shutdown();
      const run = service.snapshot().runs[0];
      assert.equal(run.status, 'completed', run.error);
      assert.equal(run.id, failed.id);
      assert.equal(run.round, 1);
      assert.equal(run.directory, failed.directory);
      assert.equal(h.captured[count].agent, failedRole);
      assert.ok(JSON.stringify(h.captured[count].body).includes('execution_recovery'));
      const restored = await records.recovery(run.id).load();
      assert.equal(
        restored!.operations.filter((op) => op.name === 'write_file' && op.status === 'succeeded')
          .length,
        1,
      );
      assert.equal(run.recovery?.attempts, 1);
      assert.deepEqual(
        [...new Set(recoveryStates.map((state) => state.recovery?.step).filter(Boolean))],
        ['processes', 'workspace', 'environment', 'artifacts'],
      );
      assert.ok(recoveryStates.every((state) => state.recovery?.agent === failedRole));
    });
  }
}
test('authentication failure while planning can continue with the current endpoint key and protocol', async (t) => {
  const failure = { agent: 'reviewer' as const, at: 1, enabled: true };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const run = h.service.snapshot().runs[0];
  assert.equal(run.recovery?.phase, 'planning');
  assert.equal(h.captured.length, 1, 'authentication must not retry automatically');
  const c = (await h.f.store.snapshot()).connections.find((c) => c.id === h.reviewer)!;
  h.f.setKey('replacement-key');
  await h.f.store.dispatch({ kind: 'connection.key', id: c.id });
  await h.f.store.dispatch({
    kind: 'connection.save',
    id: c.id,
    input: {
      name: c.name,
      baseUrl: c.baseUrl,
      defaultModel: c.defaultModel,
      protocol: 'chatCompletions',
    },
  });
  failure.enabled = false;
  await h.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'completed');
  assert.equal(h.service.snapshot().runs[0].models?.reviewer.protocol, 'chatCompletions');
  const journal = await readFile(join(h.storage, 'recovery', `${run.id}.journal`), 'utf8');
  assert.ok(!journal.includes('replacement-key'));
});

test('messages sent during a failure wait for explicit recovery and return to the interrupted Worker', async (t) => {
  const failure = { agent: 'worker' as const, at: 2, enabled: true };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const run = h.service.snapshot().runs[0];
  const count = h.captured.length;
  const messageId = randomUUID();
  await h.service.request({
    kind: 'message.send',
    taskId: h.task.id,
    messageId,
    text: 'Explain the current result before continuing',
  });
  assert.equal(h.records.runs.length, 1);
  assert.equal(h.captured.length, count);
  assert.equal(
    (await h.records.messages(h.task.id)).find((m) => m.id === messageId)?.status,
    'pending',
  );
  failure.enabled = false;
  await h.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'completed');
  assert.equal(h.captured[count].agent, 'reviewer');
  assert.equal(h.captured[count + 1].agent, 'worker');
  assert.equal(h.service.snapshot().runs[0].round, 1);
  assert.equal((await h.records.messages(h.task.id)).filter((m) => m.kind === 'answer').length, 1);
});
test('recovering interrupted answers handles the saved user messages exactly once', async (t) => {
  const failure = {
    agent: 'reviewer' as const,
    phase: 'answering' as const,
    at: 3,
    enabled: false,
  };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'completed');
  failure.enabled = true;
  const messageId = randomUUID();
  await h.service.request({
    kind: 'message.send',
    taskId: h.task.id,
    messageId,
    text: 'Explain the result',
  });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const failed = h.service.snapshot().runs[0];
  assert.equal(failed.recovery?.phase, 'answering');
  failure.enabled = false;
  await h.service.request({ kind: 'resume', runId: failed.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'answered');
  assert.equal(h.service.snapshot().runs[0].id, failed.id);
  const messages = await h.records.messages(h.task.id);
  assert.equal(messages.find((m) => m.id === messageId)?.status, 'handled');
  assert.equal(messages.filter((m) => m.kind === 'answer').length, 1);
});
test('artifact changes while failed require a new Reviewer plan and fresh Worker artifacts', async (t) => {
  const failure = { agent: 'reviewer' as const, at: 2, enabled: true };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const run = h.service.snapshot().runs[0];
  const count = h.captured.length;
  await writeFile(join(run.directory!, 'file.txt'), 'external change during failure');
  failure.enabled = false;
  await h.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  const result = h.service.snapshot().runs[0];
  assert.equal(result.status, 'completed', result.error);
  assert.equal(result.plan?.version, 2);
  assert.equal(result.round, 2);
  assert.equal(h.captured[count].agent, 'reviewer');
  assert.equal(await readFile(join(run.directory!, 'file.txt'), 'utf8'), 'fixed');
});
test('uncertain command process blocks recovery and prevents new work from starting', async (t) => {
  const failure = { agent: 'worker' as const, at: 2, enabled: true };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  await h.service.shutdown();
  const run = h.service.snapshot().runs[0];
  const store = h.records.recovery(run.id);
  await store.load();
  await store.operation({
    id: randomUUID(),
    generation: 1,
    kind: 'command',
    phase: 'worker',
    agent: 'worker',
    name: 'unknown process',
    status: 'started',
    time: '',
  });
  const records = new RunRecords(h.f.workspace, () => h.storage);
  const service = new ExecutionService(h.f.store, h.workspaces, records, h.runner);
  t.after(() => service.shutdown());
  await service.ready;
  const count = h.captured.length;
  await service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => service.snapshot().runs[0].status === 'failed');
  assert.equal(service.snapshot().runs[0].fault?.code, 'recoveryProcessUnknown');
  assert.equal(h.captured.length, count);
  await assert.rejects(service.deleteTask(h.task.id), { code: 'shutdownUnconfirmed' });
  await assert.rejects(service.request({ kind: 'restart', taskId: h.task.id }), {
    code: 'shutdownUnconfirmed',
  });
  await service.shutdown();
});
test('correction limits survive storage and cannot be reset with resume', async (t) => {
  const h = await setup(t, { badArguments: 'always', readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const run = h.service.snapshot().runs[0];
  assert.equal(run.fault?.code, 'toolCorrectionLimit');
  assert.equal(run.recovery?.available, false);
  const saved = await h.records.recovery(run.id).load();
  assert.ok(Object.values(saved!.state.budgets).some((budget) => budget.corrections === 3));
  await assert.rejects(h.service.request({ kind: 'resume', runId: run.id }), {
    code: 'recoveryUnavailable',
  });
});

test('stop during recovery initialization waits for cleanup and cannot launch a model afterwards', async (t) => {
  const failure = { agent: 'worker' as const, at: 2, enabled: true };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const run = h.service.snapshot().runs[0];
  const count = h.captured.length;
  const save = h.records.save.bind(h.records);
  let entered = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.records.save = async () => {
    if (!entered && h.records.runs[0].status === 'recovering') {
      entered = true;
      await pending;
    }
    await save();
  };
  const resuming = h.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => entered);
  const stopping = h.service.request({ kind: 'stop', runId: run.id });
  release();
  await resuming;
  await stopping;
  assert.equal(h.service.snapshot().runs[0].status, 'stopped');
  assert.equal(h.captured.length, count);
  assert.equal(h.service.snapshot().activity, undefined);
});

test('a failed recovery preflight remains retryable after missing credentials are repaired', async (t) => {
  const failure = { agent: 'worker' as const, at: 2, enabled: true };
  const h = await setup(t, { failure, readingOnly: true });
  await h.service.request({ kind: 'start', taskId: h.task.id });
  await waitUntil(() => h.service.snapshot().runs[0].status === 'failed');
  const run = h.service.snapshot().runs[0];
  const secrets = [...h.f.secrets];
  h.f.secrets.clear();
  await assert.rejects(h.service.request({ kind: 'resume', runId: run.id }), { code: 'required' });
  assert.equal(h.service.snapshot().runs[0].recovery?.available, true);
  assert.equal(h.service.snapshot().runs[0].recovery?.agent, 'worker');
  assert.equal(h.service.snapshot().runs[0].recovery?.phase, 'worker');
  for (const [key, value] of secrets) {
    h.f.secrets.set(key, value);
  }
  failure.enabled = false;
  await h.service.request({ kind: 'resume', runId: run.id });
  await waitUntil(() => terminalStatuses.includes(h.service.snapshot().runs[0].status));
  assert.equal(h.service.snapshot().runs[0].status, 'completed');
});
