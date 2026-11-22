import { realpath } from 'node:fs/promises';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectEnvironment } from '../../src/execution/environment';
import { baseEnvironment, runProcess, CommandShutdownError } from '../../src/execution/commands';
import { selectShell, shellInvocation } from '../../src/execution/shell';
import { descendants } from '../../src/execution/processTree';
import { redactText } from '../../src/shared/errors';

async function directory(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dualmind 环境 ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const fakeShell = async () => ({ kind: 'bash' as const, program: '/bin/bash' });
function probe(script: (begin: string, end: string) => string): typeof runProcess {
  return (command, cwd, signal, options) => {
    const text = command.args.at(-1)!;
    const markers = text.match(/__dualmind_[\w-]+_(?:begin|end)__/g)!;
    return runProcess(
      { ...command, program: process.execPath, args: ['-e', script(markers[0], markers[1])] },
      cwd,
      signal,
      options,
    );
  };
}
test('a run captures profile environment once, tolerates noise and freezes inherited values', async (t) => {
  const cwd = await directory(t),
    host = { ...process.env, RUN_VALUE: 'before', API_TOKEN: 'inherited-secret' };
  const environment = new ProjectEnvironment(
    host,
    5,
    probe(
      (begin, end) =>
        `console.log('profile banner');process.stdout.write(${JSON.stringify(begin)}+'RUN_VALUE=from-profile\\0API_TOKEN=profile-secret\\0BASH_ENV=/hook\\0'+${JSON.stringify(end)});console.error('profile warning')`,
    ),
    fakeShell,
  );
  host.RUN_VALUE = 'edited';
  const first = await environment.resolve(cwd, new AbortController().signal);
  assert.equal(first.env.RUN_VALUE, 'from-profile');
  assert.equal(first.env.BASH_ENV, undefined);
  assert.equal(first.summary.source, 'login');
  assert.equal(await environment.resolve(cwd, new AbortController().signal), first);
  assert.equal(host.RUN_VALUE, 'edited');
  assert.equal(
    redactText('profile-secret inherited-secret', environment.redactionValues()),
    '[redacted] [redacted]',
  );
  assert.ok(!JSON.stringify(first.summary).includes('secret'));
});
test('profile failure and timeout fall back without storing profile output or errors', async (t) => {
  const cwd = await directory(t);
  for (const script of [
    'console.log("TOP_SECRET");process.exit(7)',
    'console.log("TOP_SECRET");setInterval(()=>{},1000)',
  ]) {
    const environment = new ProjectEnvironment(
      { ...process.env, KEEP_ME: 'kept' },
      0.15,
      probe(() => script),
      fakeShell,
    );
    const result = await environment.resolve(cwd, new AbortController().signal);
    assert.equal(result.summary.source, 'host');
    assert.equal(result.env.KEEP_ME, 'kept');
    assert.ok(result.summary.warning);
    assert.ok(!JSON.stringify(result.summary).includes('TOP_SECRET'));
  }
});
test('cancelled probes and uncertain process cleanup never downgrade to a usable environment', async (t) => {
  const cwd = await directory(t),
    controller = new AbortController();
  const environment = new ProjectEnvironment(
    process.env,
    5,
    probe(() => 'setInterval(()=>{},1000)'),
    fakeShell,
  );
  const resolving = environment.resolve(cwd, controller.signal);
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(resolving, { code: 'executionStopped' });
  await assert.rejects(environment.resolve(cwd, controller.signal), { code: 'executionStopped' });
  const broken = new ProjectEnvironment(
    process.env,
    5,
    async () => {
      throw new CommandShutdownError();
    },
    fakeShell,
  );
  await assert.rejects(broken.resolve(cwd, new AbortController().signal), {
    code: 'commandShutdown',
  });
});
test('native shell environment metadata never contains environment values', async (t) => {
  const cwd = await directory(t),
    host = baseEnvironment();
  const shell = await selectShell(host);
  assert.ok(shell.program);
  const result = await new ProjectEnvironment(host).resolve(cwd, new AbortController().signal);
  assert.equal(result.summary.platform, process.platform);
  assert.equal(typeof result.env.PATH === 'string' || typeof result.env.Path === 'string', true);
  assert.deepEqual(host, baseEnvironment());
});
test('PowerShell uses UTF-8, encoded scripts and explicit native exit status; cmd disables autorun', () => {
  const ps = shellInvocation({ kind: 'powershell', program: 'pwsh' }, 'node --version');
  const script = Buffer.from(ps.args.at(-1)!, 'base64').toString('utf16le');
  assert.match(script, /UTF8Encoding/);
  assert.match(script, /exit \$LASTEXITCODE/);
  assert.ok(ps.args.includes('-NoProfile'));
  assert.ok(
    !shellInvocation({ kind: 'powershell', program: 'pwsh' }, 'env', true).args.includes(
      '-NoProfile',
    ),
  );
  assert.deepEqual(shellInvocation({ kind: 'cmd', program: 'cmd' }, 'echo ok').args.slice(0, 3), [
    '/d',
    '/s',
    '/c',
  ]);
});
test('Windows tree tracking retains orphan ancestry and ignores PID reuse', () => {
  const since = Date.now() - 1000,
    stamp = new Date(since + 100).toISOString(),
    next = new Date(since + 200).toISOString();
  const known = new Map<number, string>();
  assert.equal(
    descendants(
      [
        { pid: 3, parent: 2, created: stamp },
        { pid: 2, parent: 1, created: stamp },
      ],
      known,
      1,
      since,
    ).length,
    2,
  );
  assert.equal(descendants([{ pid: 3, parent: 2, created: stamp }], known, 1, since).length, 1);
  assert.equal(
    descendants(
      [
        { pid: 2, parent: 9, created: next },
        { pid: 4, parent: 2, created: next },
      ],
      known,
      1,
      since,
    ).length,
    0,
  );
});
