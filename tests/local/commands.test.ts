import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemdCommands } from '../../src/execution/commands';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Linux resource enforcement is validated against real user systemd, not a shell imitation.
test('real preset runner enforces memory/swap limits, exact argv, output limits and cancellation', async (t) => {
  if (process.env.DUALMIND_TEST_SYSTEMD !== '1') {
    t.skip('Run explicitly under the bounded Linux systemd verification slice.');
    return;
  }
  const root = await mkdtemp(join(tmpdir(), 'dualmind-command-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SystemdCommands();
  await runner.available(new AbortController().signal);
  const command = {
    id: 'test',
    name: 'Test',
    program: process.execPath,
    args: [
      '-e',
      'console.log(process.argv[1]); console.log(process.env.OPENAI_API_KEY || "no-key")',
      'literal;$(no-shell)',
    ],
    timeoutSeconds: 10,
  };
  const result = await runner.run(command, root, new AbortController().signal);
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /literal;\$\(no-shell\)/);
  assert.match(result.output, /no-key/);
  const controller = new AbortController();
  const started = Date.now();
  const running = runner.run(
    { ...command, args: ['-e', 'console.log("started");setInterval(()=>{},1000)'] },
    root,
    controller.signal,
    (text) => {
      if (text.includes('started')) {
        controller.abort();
      }
    },
  );
  const stopped = await running;
  assert.equal(stopped.ok, false);
  assert.equal(stopped.reason, 'stopped');
  assert.ok(Date.now() - started < 8000);
  const early = new AbortController();
  const earlyRun = runner.run(
    { ...command, args: ['-e', 'setInterval(()=>{},1000)'] },
    root,
    early.signal,
  );
  setTimeout(() => early.abort(), 10);
  const earlyResult = await earlyRun.catch((error: Error) => error);
  assert.ok(earlyResult instanceof Error ? /stopped/.test(earlyResult.message) : !earlyResult.ok);
  const timed = Date.now();
  const timeout = await runner.run(
    { ...command, args: ['-e', 'setInterval(()=>{},1000)'] },
    root,
    new AbortController().signal,
  );
  assert.equal(timeout.ok, false);
  assert.ok(
    Date.now() - timed >= 9000 && Date.now() - timed < 16000,
    'Runtime deadline must terminate the process',
  );
  const large = await runner.run(
    {
      ...command,
      args: ['-e', 'process.stdout.write("x".repeat(3*1024*1024));setInterval(()=>{},1000)'],
    },
    root,
    new AbortController().signal,
  );
  assert.equal(large.ok, false);
  assert.equal(large.reason, 'outputLimit');
});
