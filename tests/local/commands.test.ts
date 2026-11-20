import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { LocalCommands } from '../../src/execution/commands';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PresetCommand } from '../../src/shared/execution';
import { errorText, toAppError } from '../../src/shared/errors';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'dualmind-command-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = new LocalCommands();
  const command: PresetCommand = {
    id: 'test',
    name: 'Test',
    program: process.execPath,
    args: [],
    timeoutSeconds: 10,
  };
  const run = (
    script: string,
    signal = new AbortController().signal,
    output?: (text: string) => void,
  ) => runner.run({ ...command, args: ['-e', script] }, root, signal, output);
  return { root, runner, command, run };
}

async function assertDead(pid: number) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    assert.match(
      stat.slice(stat.lastIndexOf(')') + 2),
      /^[ZX] /,
      `Process ${pid} is still running`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

test('direct runner preserves argv, cwd and allowed environment without systemd or leaked credentials', async (t) => {
  const h = await fixture(t);
  const bin = join(h.root, 'bin');
  const cwd = join(h.root, 'nested');
  await mkdir(bin);
  await mkdir(cwd);
  for (const tool of ['systemd-run', 'systemctl']) {
    const file = join(bin, tool);
    await writeFile(file, `#!/bin/sh\necho called > '${h.root}/forbidden'\nexit 99\n`);
    await chmod(file, 0o755);
  }
  const oldPath = process.env.PATH;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.PATH = bin;
  process.env.OPENAI_API_KEY = 'must-not-reach-command';
  t.after(() => {
    if (oldPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = oldPath;
    }
    if (oldKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = oldKey;
    }
  });
  const result = await h.runner.run(
    {
      ...h.command,
      args: [
        '-e',
        'console.log(JSON.stringify({argv:process.argv.slice(1),cwd:process.cwd(),key:process.env.OPENAI_API_KEY,path:process.env.PATH}));console.error("stderr");',
        'literal;$(no-shell)',
        'space quote " 中文',
        '',
        '$HOME',
      ],
    },
    cwd,
    new AbortController().signal,
  );
  assert.equal(result.ok, true, result.output);
  assert.equal(result.exitCode, 0);
  const data = JSON.parse(result.output.split('\n').find((line) => line.startsWith('{'))!);
  assert.deepEqual(data, {
    argv: ['literal;$(no-shell)', 'space quote " 中文', '', '$HOME'],
    cwd,
    path: bin,
  });
  assert.match(result.output, /stderr/);
  await assert.rejects(readFile(join(h.root, 'forbidden')), { code: 'ENOENT' });
  const failed = await h.run('console.error("actual error");process.exit(7)');
  assert.equal(failed.ok, false);
  assert.equal(failed.exitCode, 7);
  assert.match(failed.output, /actual error/);
});

test('launch errors are typed, bilingual and retain original details', async (t) => {
  const h = await fixture(t);
  const denied = join(h.root, 'denied');
  await writeFile(denied, '#!/bin/sh\nexit 0');
  await chmod(denied, 0o600);
  for (const [program, code] of [
    [join(h.root, 'missing'), 'commandNotFound'],
    [denied, 'commandPermissionDenied'],
    ['invalid\0program', 'commandStartFailed'],
  ]) {
    await assert.rejects(
      h.runner.run({ ...h.command, program }, h.root, new AbortController().signal),
      (error) => {
        const fault = toAppError(error);
        assert.equal(fault.code, code);
        assert.match(errorText('zh-CN', fault), /无法启动命令/);
        assert.match(errorText('en', fault), /(?:Cannot|Could not) start command/);
        assert.ok(fault.details);
        return true;
      },
    );
  }
});

test('cancellation handles aborted signals and races immediately after spawn', async (t) => {
  const h = await fixture(t);
  const early = new AbortController();
  early.abort();
  await assert.rejects(h.run('process.exit(0)', early.signal), { code: 'executionStopped' });
  const controller = new AbortController();
  const running = h.run('setInterval(()=>{},1000)', controller.signal);
  controller.abort();
  const result = await running;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stopped');
});

test('stopping kills resistant children even if their parent exits first', async (t) => {
  const h = await fixture(t);
  const controller = new AbortController();
  let pid = 0;
  const started = Date.now();
  const result = await h.run(
    `
    const {spawn} = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});console.log(process.pid);setInterval(()=>{},1000)'], {stdio:['ignore','pipe','ignore']});
    child.stdout.on('data', text => console.log('child=' + text.toString().trim()));
    setInterval(()=>{},1000);
  `,
    controller.signal,
    (text) => {
      const match = /child=(\d+)/.exec(text);
      if (match) {
        pid = Number(match[1]);
        controller.abort();
      }
    },
  );
  assert.ok(pid > 0);
  assert.equal(result.reason, 'stopped');
  assert.equal(result.ok, false);
  assert.ok(Date.now() - started >= 3000 && Date.now() - started < 10000);
  await assertDead(pid);
});

for (const inheritedPipes of [true, false]) {
  test(`successful parent cleans up surviving children (inherited pipes=${inheritedPipes})`, async (t) => {
    const h = await fixture(t);
    const result = await h.run(`
      const {spawn} = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:${inheritedPipes ? "'inherit'" : "'ignore'"}});
      console.log(child.pid); child.unref();
    `);
    assert.equal(result.ok, true, result.output);
    await assertDead(Number(result.output.trim()));
  });
}

test('real timeout and output limits stop the command and preserve failure reasons', async (t) => {
  const h = await fixture(t);
  const started = Date.now();
  const [timeout, large] = await Promise.all([
    h.run('console.log(process.pid);setInterval(()=>{},1000)'),
    h.run(
      'console.log(process.pid);process.stdout.write("x".repeat(3*1024*1024));setInterval(()=>{},1000)',
    ),
  ]);
  assert.equal(timeout.ok, false);
  assert.equal(timeout.reason, 'timeout');
  assert.ok(Date.now() - started >= 10000 && Date.now() - started < 16000);
  assert.equal(large.ok, false);
  assert.equal(large.reason, 'outputLimit');
  assert.ok(Buffer.byteLength(large.output) <= 2 * 1024 * 1024);
  for (const result of [timeout, large]) {
    await assertDead(Number(result.output.split('\n')[0]));
  }
});

test('a termination error rejects instead of claiming the command stopped', async (t) => {
  const h = await fixture(t);
  const controller = new AbortController();
  const kill = process.kill.bind(process);
  let pid = 0;
  t.mock.method(process, 'kill', (target: number, signal?: number | NodeJS.Signals) => {
    if (target === -pid && signal === 'SIGTERM') {
      throw Object.assign(new Error('Simulated signal failure'), { code: 'EPERM' });
    }
    return kill(target, signal);
  });
  t.after(async () => {
    if (pid) {
      kill(-pid, 'SIGKILL');
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        try {
          await assertDead(pid);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      await assertDead(pid);
    }
  });
  await assert.rejects(
    h.run('console.log(process.pid);setInterval(()=>{},1000)', controller.signal, (text) => {
      pid = Number(text.trim());
      controller.abort();
    }),
    { code: 'commandShutdown' },
  );
});
