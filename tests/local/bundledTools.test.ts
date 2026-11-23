import { before, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BundledTools, bundledToolGuidance } from '../../src/execution/bundledTools';
import { ProjectEnvironment } from '../../src/execution/environment';
import { runProcess } from '../../src/execution/commands';

const supported = process.platform === 'linux' && process.arch === 'x64';
const source = path.resolve('dist/tools');
const signal = () => new AbortController().signal;
before(async () => {
  await promisify(execFile)(process.execPath, ['scripts/bundled-tools.mjs', 'prepare']);
});
async function directory(t: TestContext) {
  const result = await mkdtemp(path.join(tmpdir(), 'dualmind tools 中文 '));
  t.after(() => rm(result, { recursive: true, force: true }));
  return result;
}
const shell = async () => ({ program: '/bin/bash', kind: 'bash' as const });
const failedProbe: typeof runProcess = async () => {
  throw new Error('profile unavailable');
};
function probePath(value: string): typeof runProcess {
  return (command, cwd, abort, options) => {
    const markers = command.args.at(-1)!.match(/__dualmind_[\w-]+_(?:begin|end)__/g)!;
    return runProcess(
      {
        ...command,
        program: process.execPath,
        args: [
          '-e',
          `process.stdout.write(${JSON.stringify(markers[0] + 'PATH=' + value + '\0' + markers[1])})`,
        ],
      },
      cwd,
      abort,
      options,
    );
  };
}
function command(text: string, cwd: string, env: Record<string, string>) {
  return runProcess(
    {
      id: 'tools',
      name: 'Tool smoke',
      program: '/bin/bash',
      args: ['--noprofile', '--norc', '-c', text],
      timeoutSeconds: 10,
    },
    cwd,
    signal(),
    { env },
  );
}
test('unsupported platforms report unavailable fallbacks without touching PATH', async () => {
  for (const [platform, arch] of [
    ['darwin', 'x64'],
    ['win32', 'x64'],
    ['linux', 'arm64'],
  ]) {
    const env = { PATH: '/system' };
    const result = await new BundledTools('/missing', platform, arch).apply(env, signal());
    assert.deepEqual(result.env, env);
    assert.notEqual(result.env, env);
    assert.ok(result.tools.every((tool) => tool.reason === 'unsupportedPlatform'));
  }
});
test('bundled command metadata does not claim to identify the selected system version', () => {
  assert.match(bundledToolGuidance, /not the version selected/);
  assert.match(bundledToolGuidance, /System commands have priority/);
  assert.match(bundledToolGuidance, /search_status.*-eq 1/s);
  assert.match(bundledToolGuidance, /Do not use unconditional/);
});
test(
  'login capture and fallback append validated tools once while preserving environment snapshots',
  { skip: !supported },
  async (t) => {
    const cwd = await directory(t),
      original = { PATH: '/host/bin', API_TOKEN: 'environment-secret' },
      snapshot = { ...original };
    for (const probe of [probePath('/login/bin'), failedProbe]) {
      const environment = new ProjectEnvironment(
        original,
        5,
        probe,
        shell,
        undefined,
        new BundledTools(source),
      );
      const first = await environment.resolve(cwd, signal());
      assert.ok(first.env.PATH.startsWith(probe === failedProbe ? '/host/bin:' : '/login/bin:'));
      assert.ok(first.summary.bundledTools?.every((tool) => tool.status === 'available'));
      assert.equal(await environment.resolve(cwd, signal()), first);
      assert.equal(first.env.PATH.split(':').filter((value) => value.endsWith('/rg')).length, 1);
      assert.ok(!JSON.stringify(first.summary).includes('environment-secret'));
    }
    assert.deepEqual(original, snapshot);
  },
);
test(
  'empty PATH and absent PATH use offline tools without mutating the host environment',
  { skip: !supported },
  async (t) => {
    const cwd = await directory(t),
      hostPath = process.env.PATH,
      provider = new BundledTools(source);
    const result = await provider.apply({ PATH: '' }, signal());
    assert.ok(result.env.PATH.startsWith(':'));
    assert.equal((await command('rg --version', cwd, result.env)).ok, true);
    const absent = await provider.apply({}, signal());
    assert.ok(absent.env.PATH.startsWith('/usr/local/sbin:'));
    assert.equal(process.env.PATH, hostPath);
  },
);
test(
  'system commands win and a failing system command is never rerun with the fallback',
  { skip: !supported },
  async (t) => {
    const cwd = await directory(t),
      bin = path.join(cwd, 'system bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'rg'), '#!/bin/sh\nprintf "system version\\n"\nexit 7\n', {
      mode: 0o755,
    });
    const result = await new BundledTools(source).apply({ PATH: bin }, signal());
    const run = await command('rg --version', cwd, result.env);
    assert.equal(run.exitCode, 7);
    assert.equal(run.ok, false);
    assert.equal(run.output.trim(), 'system version');
  },
);
test(
  'hash failures, missing tools and permission loss disable only the affected fallback',
  { skip: !supported },
  async (t) => {
    const cwd = await directory(t),
      root = path.join(cwd, 'bundled');
    await cp(source, root, { recursive: true });
    const rg = path.join(root, 'linux-x64/rg/rg'),
      fd = path.join(root, 'linux-x64/fd/fd'),
      jq = path.join(root, 'linux-x64/jq/jq');
    const bytes = await readFile(rg);
    bytes[100] ^= 1;
    await writeFile(rg, bytes);
    await chmod(fd, 0o644);
    let result = await new BundledTools(root).apply({ PATH: '/system' }, signal());
    assert.deepEqual(
      result.tools.map((tool) => tool.reason),
      ['integrity', 'permission', undefined],
    );
    assert.equal(result.env.PATH, `/system:${path.dirname(jq)}`);
    await rm(jq);
    result = await new BundledTools(root).apply({ PATH: '/system' }, signal());
    assert.equal(result.tools[2].reason, 'missing');
    assert.equal(result.env.PATH, '/system');
  },
);
test(
  'a new recovery environment resolves current assets while an existing run retains its snapshot',
  { skip: !supported },
  async (t) => {
    const cwd = await directory(t),
      root = path.join(cwd, 'extension');
    await cp(source, root, { recursive: true });
    const make = () =>
      new ProjectEnvironment(
        { PATH: '' },
        5,
        failedProbe,
        shell,
        undefined,
        new BundledTools(root),
      );
    const original = make(),
      first = await original.resolve(cwd, signal());
    await rm(path.join(root, 'linux-x64/rg/rg'));
    assert.equal(await original.resolve(cwd, signal()), first);
    assert.equal(first.summary.bundledTools?.[0].status, 'available');
    const resumed = await make().resolve(cwd, signal());
    assert.equal(resumed.summary.bundledTools?.[0].reason, 'missing');
  },
);
test(
  'offline native tools handle Chinese files, ignores, no matches and genuine command errors',
  { skip: !supported },
  async (t) => {
    const cwd = await directory(t);
    await mkdir(path.join(cwd, '.git'));
    await writeFile(path.join(cwd, '.gitignore'), 'ignored.txt\n');
    await writeFile(path.join(cwd, '中文 文件.txt'), 'needle 中文\n');
    await writeFile(path.join(cwd, 'ignored.txt'), 'needle hidden\n');
    await writeFile(path.join(cwd, 'data.json'), '{"name":"中文"}\n');
    const { env } = await new BundledTools(source).apply({ PATH: '', LC_ALL: 'C.UTF-8' }, signal());
    for (const [name, version] of [
      ['rg', '16.0.0'],
      ['fd', '10.5.2'],
      ['jq', '1.8.2'],
    ]) {
      assert.ok((await command(`${name} --version`, cwd, env)).output.includes(version));
    }
    const search = await command('rg --threads 2 -- needle .', cwd, env);
    assert.equal(search.ok, true);
    assert.match(search.output, /中文/);
    assert.doesNotMatch(search.output, /hidden/);
    const files = await command('fd --threads 2 --type f . .', cwd, env);
    assert.equal(files.ok, true);
    assert.match(files.output, /中文/);
    assert.doesNotMatch(files.output, /ignored/);
    assert.equal((await command('rg --threads 2 -- no-such-pattern .', cwd, env)).exitCode, 1);
    assert.equal(
      (
        await command(
          'rg --threads 2 -- no-such-pattern .; search_status=$?; if [ "$search_status" -eq 1 ]; then printf "No matches\\n"; elif [ "$search_status" -ne 0 ]; then exit "$search_status"; fi',
          cwd,
          env,
        )
      ).ok,
      true,
    );
    assert.equal((await command("rg --threads 2 -- '[' .", cwd, env)).exitCode, 2);
    assert.equal((await command("jq -r '.name' data.json", cwd, env)).output.trim(), '中文');
    assert.equal((await command("jq -e 'false' data.json", cwd, env)).ok, false);
    assert.equal((await command("jq '[' data.json", cwd, env)).ok, false);
  },
);
test('cancelled tool inspection does not publish a usable environment', async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(new BundledTools(source).apply({}, abort.signal), {
    code: 'executionStopped',
  });
});
