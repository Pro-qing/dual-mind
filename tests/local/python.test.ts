import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PythonDiscovery,
  type PythonProbeObserver,
  pythonGuidance,
} from '../../src/execution/python';
import { ProjectEnvironment } from '../../src/execution/environment';
import { runProcess, CommandShutdownError } from '../../src/execution/commands';
import { OperationError } from '../../src/shared/errors';
import type { PythonInterpreter } from '../../src/shared/environment';

const signal = () => new AbortController().signal;
const posix = process.platform !== 'win32';
async function folder(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'dualmind python 中文 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function executable(file: string, contents = 'fixture') {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents, { mode: 0o755 });
  return file;
}
function reply(command: Parameters<typeof runProcess>[0], version = [3, 12, 4]) {
  const token = command.args.at(-1)!.match(/sys.stdout.write\('([^']+)'/)![1];
  const output =
    token +
    JSON.stringify({ version, executable: command.program, implementation: 'cpython' }) +
    token;
  return {
    id: command.id,
    name: command.name,
    ok: true,
    exitCode: 0,
    stdout: output,
    stderr: '',
    output,
  };
}
function observer(events: string[], check: () => void = () => {}): PythonProbeObserver {
  return {
    check: async () => check(),
    start: async (candidate) => {
      events.push('start:' + candidate.path);
      return {
        onProcess: async () => {
          events.push('process:' + candidate.path);
        },
        finish: async (result, fatal) => {
          events.push('finish:' + (fatal ? 'fatal' : result.status));
        },
      };
    },
  };
}
for (const variants of [
  ['python3'],
  ['python2'],
  ['python3', 'python2', 'python'],
  ['python'],
  [],
]) {
  test(`local Python discovery confirms versions rather than command names: ${variants.join(',') || 'absent'}`, async (t) => {
    const root = await folder(t),
      bin = path.join(root, 'bin');
    await mkdir(bin);
    for (const name of variants) {
      await executable(path.join(bin, name + (posix ? '' : '.exe')));
    }
    const env = { PATH: bin };
    const calls: string[] = [];
    const discovery = new PythonDiscovery(async (cmd, _cwd, _signal, options) => {
      calls.push(cmd.program);
      assert.deepEqual(cmd.args.slice(0, 5), ['-E', '-s', '-S', '-B', '-c']);
      assert.equal(options.maxOutputBytes, 4096);
      assert.ok(cmd.timeoutSeconds <= 2);
      return reply(cmd, path.basename(cmd.program).startsWith('python3') ? [3, 8, 10] : [2, 7, 18]);
    });
    const result = await discovery.discover(root, env, signal());
    assert.equal(result.complete, true);
    assert.equal(calls.length, variants.length);
    assert.deepEqual(
      result.interpreters.map((p) => p.major),
      variants.map((name) => (name === 'python3' ? 3 : 2)),
    );
    assert.deepEqual(env, { PATH: bin });
    assert.ok(result.interpreters.every((p) => p.status === 'available'));
  });
}
test(
  'project and activated environments precede PATH and deduplicate invocation paths only',
  { skip: !posix },
  async (t) => {
    const root = await folder(t),
      bin = path.join(root, 'system'),
      active = path.join(root, 'activated'),
      conda = path.join(root, 'conda');
    const system = await executable(path.join(bin, 'python3'));
    for (const prefix of ['.venv', 'venv']) {
      const file = path.join(root, prefix, 'bin/python');
      await mkdir(path.dirname(file), { recursive: true });
      await symlink(system, file);
    }
    await executable(path.join(active, 'bin/python'));
    await executable(path.join(conda, 'bin/python'));
    await executable(path.join(bin, 'python2'));
    const calls: string[] = [];
    const discovery = new PythonDiscovery(async (cmd) => {
      calls.push(cmd.program);
      return reply(cmd);
    });
    const result = await discovery.discover(
      root,
      { PATH: path.join(root, '.venv/bin') + ':' + bin, VIRTUAL_ENV: active, CONDA_PREFIX: conda },
      signal(),
    );
    assert.deepEqual(
      result.interpreters.map((p) => p.source),
      ['project', 'project', 'virtualenv', 'conda', 'path', 'path'],
    );
    assert.equal(new Set(calls).size, calls.length);
    assert.equal(calls[0], path.join(root, '.venv/bin/python'));
    assert.ok(calls.includes(system));
  },
);
test(
  'only actual task roots are searched, never parent or original checkout virtualenvs',
  { skip: !posix },
  async (t) => {
    const root = await folder(t),
      task = path.join(root, 'isolated');
    await mkdir(task);
    await executable(path.join(root, '.venv/bin/python'));
    let calls = 0;
    const result = await new PythonDiscovery(async (cmd) => {
      calls++;
      return reply(cmd);
    }).discover(task, { PATH: path.join(root, 'missing') }, signal());
    assert.equal(calls, 0);
    assert.deepEqual(result, { complete: true, interpreters: [] });
  },
);
test('bounded probe failures are metadata, never raw output, and do not prevent other interpreters', async (t) => {
  const root = await folder(t),
    bin = path.join(root, 'bin');
  await mkdir(bin);
  for (const name of ['python3', 'python2', 'python', 'python2.7']) {
    await executable(path.join(bin, name + (posix ? '' : '.exe')));
  }
  let calls = 0;
  const result = await new PythonDiscovery(async (cmd) => {
    calls++;
    if (calls === 1) {
      return { ...reply(cmd), ok: false, reason: 'timeout', output: 'SECRET' };
    }
    if (calls === 2) {
      return { ...reply(cmd), ok: false, reason: 'outputLimit', output: 'SECRET' };
    }
    if (calls === 3) {
      return { ...reply(cmd), stdout: 'SECRET{malformed', output: 'SECRET' };
    }
    return reply(cmd, [2, 7, 18]);
  }).discover(root, { PATH: bin }, signal());
  assert.deepEqual(
    result.interpreters.map((p) => p.reason),
    ['timeout', 'outputLimit', 'invalidResponse', undefined],
  );
  assert.equal(result.interpreters[3].status, 'available');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test(
  'shared eight-second budget skips remaining candidates and admits at most eight',
  { skip: !posix },
  async (t) => {
    const root = await folder(t),
      bin = path.join(root, 'system'),
      active = path.join(root, 'active'),
      conda = path.join(root, 'conda');
    for (const prefix of [path.join(root, '.venv'), path.join(root, 'venv'), active, conda]) {
      await executable(path.join(prefix, 'bin/python'));
    }
    for (const name of ['python3', 'python2', 'python', 'python2.7']) {
      await executable(path.join(bin, name));
    }
    let time = 0,
      calls = 0;
    const events: string[] = [];
    const result = await new PythonDiscovery(
      async (cmd) => {
        calls++;
        time += 2001;
        return reply(cmd);
      },
      'linux',
      () => time,
    ).discover(
      root,
      { PATH: bin, VIRTUAL_ENV: active, CONDA_PREFIX: conda },
      signal(),
      observer(events),
    );
    assert.equal(result.complete, false);
    assert.equal(result.interpreters.length, 8);
    assert.equal(calls, 4);
    assert.equal(events.filter((e) => e.startsWith('start:')).length, 4);
    assert.ok(
      result.interpreters.slice(4).every((p) => p.status === 'skipped' && p.reason === 'budget'),
    );
  },
);
test('operation writes precede probes and persistence, ownership, cancellation and unknown cleanup are fatal', async (t) => {
  const root = await folder(t);
  await executable(path.join(root, 'python3' + (posix ? '' : '.exe')));
  let calls = 0;
  const discovery = new PythonDiscovery(async (cmd) => {
    calls++;
    return reply(cmd);
  });
  await assert.rejects(
    discovery.discover(root, { PATH: root }, signal(), {
      check: async () => {},
      start: async () => {
        throw new OperationError('persistenceFailed');
      },
    }),
    { code: 'persistenceFailed' },
  );
  assert.equal(calls, 0);
  await assert.rejects(
    discovery.discover(
      root,
      { PATH: root },
      signal(),
      observer([], () => {
        throw new OperationError('workspaceUntrusted');
      }),
    ),
    { code: 'workspaceUntrusted' },
  );
  assert.equal(calls, 0);
  const events: string[] = [],
    abort = new AbortController();
  await assert.rejects(
    new PythonDiscovery(async (cmd) => {
      events.push('probe');
      abort.abort();
      return reply(cmd);
    }).discover(root, { PATH: root }, abort.signal, observer(events)),
    { code: 'executionStopped' },
  );
  assert.deepEqual(
    events.map((e) => e.split(':')[0]),
    ['start', 'probe', 'finish'],
  );
  assert.equal(events.at(-1), 'finish:fatal');
  await assert.rejects(
    new PythonDiscovery(async () => {
      throw new CommandShutdownError();
    }).discover(root, { PATH: root }, signal(), observer([])),
    { code: 'commandShutdown' },
  );
  await assert.rejects(
    new PythonDiscovery(async (cmd) => ({
      ...reply(cmd),
      ok: false,
      reason: 'persistence',
    })).discover(root, { PATH: root }, signal()),
    { code: 'persistenceFailed' },
  );
});
test('invalid or unsupported interpreter identity never becomes usable', async (t) => {
  const root = await folder(t);
  await executable(path.join(root, 'python' + (posix ? '' : '.exe')));
  for (const version of [
    [2, 6, 9],
    [1, 9, 0],
    ['3', 8, 10],
  ]) {
    const result = await new PythonDiscovery(async (cmd) =>
      reply(cmd, version as number[]),
    ).discover(root, { PATH: root }, signal());
    assert.equal(result.interpreters[0].status, 'unavailable');
  }
});
test(
  'same run keeps its Python snapshot; recovery recaptures candidates without environment activation',
  { skip: !posix },
  async (t) => {
    const root = await folder(t),
      bin = path.join(root, 'bin');
    await executable(path.join(bin, 'python3'));
    let probes = 0;
    const discovery = new PythonDiscovery(async (cmd) => {
      probes++;
      return reply(cmd);
    });
    const shell = async () => ({ program: '/bin/sh', kind: 'sh' as const });
    const failedLogin: typeof runProcess = async () => {
      throw new Error('failed profile');
    };
    const host = { PATH: bin },
      make = () =>
        new ProjectEnvironment(host, 5, failedLogin, shell, undefined, undefined, discovery);
    const environment = make(),
      first = await environment.resolve(root, signal());
    assert.equal(first.summary.source, 'host');
    assert.equal(first.summary.python?.interpreters[0].major, 3);
    await rm(path.join(bin, 'python3'));
    assert.equal(await environment.resolve(root, signal()), first);
    assert.deepEqual((await make().resolve(root, signal())).summary.python, {
      complete: true,
      interpreters: [],
    });
    assert.equal(probes, 1);
    assert.deepEqual(host, { PATH: bin });
  },
);
test(
  'login PATH is the discovery source, and incomplete metadata remains optional for older snapshots',
  { skip: !posix },
  async (t) => {
    const root = await folder(t),
      bin = path.join(root, 'login');
    await executable(path.join(bin, 'python2'));
    const capture: typeof runProcess = async (cmd) => {
      const [begin, end] = cmd.args.at(-1)!.match(/__dualmind_[\w-]+_(?:begin|end)__/g)!;
      return {
        id: cmd.id,
        name: cmd.name,
        ok: true,
        exitCode: 0,
        output: begin + 'PATH=' + bin + '\0' + end,
      };
    };
    const environment = new ProjectEnvironment(
      { PATH: '/missing' },
      5,
      capture,
      async () => ({ program: '/bin/sh', kind: 'sh' }),
      undefined,
      undefined,
      new PythonDiscovery(async (cmd) => reply(cmd, [2, 7, 18])),
    );
    const result = await environment.resolve(root, signal());
    assert.equal(result.summary.python?.interpreters[0].major, 2);
    assert.equal(result.env.PATH, bin);
  },
);
test(
  'real probes preserve virtualenv invocation and reject missing/non-executable paths without importing project modules',
  { skip: !posix },
  async (t) => {
    const root = await folder(t);
    const candidates = await new PythonDiscovery().discover(
      root,
      { PATH: '/usr/bin:/bin' },
      signal(),
    );
    const python = candidates.interpreters.find((p) => p.status === 'available' && p.major === 3);
    if (!python) {
      t.skip('No local Python 3 installed');
      return;
    }
    const file = path.join(root, '.venv/bin/python');
    await mkdir(path.dirname(file), { recursive: true });
    await symlink(python.path, file);
    await writeFile(path.join(root, 'json.py'), 'raise RuntimeError("project json imported")\n');
    await writeFile(
      path.join(root, 'sitecustomize.py'),
      'raise RuntimeError("site customization imported")\n',
    );
    await executable(path.join(root, 'python3'), '#!/bin/sh\nexit 1\n');
    await chmod(path.join(root, 'python3'), 0o644);
    await symlink(path.join(root, 'missing'), path.join(root, 'python2'));
    const events: string[] = [];
    const result = await new PythonDiscovery().discover(
      root,
      { PATH: root, PYTHONPATH: root, PYTHONHOME: root },
      signal(),
      observer(events),
    );
    assert.equal(result.interpreters[0].status, 'available');
    assert.equal(result.interpreters[0].path, file);
    assert.deepEqual(
      result.interpreters.slice(1).map((p) => p.reason),
      ['permission', 'missing'],
    );
    assert.ok(events.some((e) => e.startsWith('process:')));
    await assert.rejects(readFile(path.join(root, 'json.pyc')));
  },
);
test(
  'local Python 2/3 read JSON and CSV via ordinary commands and retain failure exits',
  { skip: !posix },
  async (t) => {
    const root = await folder(t);
    await writeFile(path.join(root, 'data.json'), '{"value": 42}');
    await writeFile(path.join(root, 'data.csv'), 'name,value\nanswer,42\n');
    const discovered = await new PythonDiscovery().discover(
      root,
      { PATH: '/usr/bin:/bin' },
      signal(),
    );
    const selected = [2, 3]
      .map((major) =>
        discovered.interpreters.find((p) => p.status === 'available' && p.major === major),
      )
      .filter((p): p is PythonInterpreter => Boolean(p));
    if (!selected.length) {
      t.skip('No local Python installed');
      return;
    }
    for (const interpreter of selected) {
      const command = {
        id: 'read',
        name: 'Local Python information',
        program: interpreter.path,
        args: [
          '-B',
          '-c',
          'import json,csv; assert json.load(open("data.json"))["value"] == 42; assert list(csv.reader(open("data.csv")))[1][1] == "42"; print("read-ok")',
        ],
        timeoutSeconds: 2,
      };
      const result = await runProcess(command, root, signal(), { env: { PATH: '/usr/bin:/bin' } });
      assert.equal(result.ok, true);
      assert.match(result.output, /read-ok/);
      const failed = await runProcess(
        { ...command, args: ['-c', 'import sys; sys.exit(9)'] },
        root,
        signal(),
        { env: { PATH: '/usr/bin:/bin' } },
      );
      assert.equal(failed.ok, false);
      assert.equal(failed.exitCode, 9);
    }
    assert.match(pythonGuidance, /not a guarantee of current dependencies/);
    assert.match(pythonGuidance, /-m pip/);
  },
);
test('small probe output cap stops a noisy child and cancellation waits for exit', async (t) => {
  const root = await folder(t);
  const noisy = await runProcess(
    {
      id: 'noisy',
      name: 'noisy probe',
      program: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(5000));setInterval(()=>{},1000)'],
      timeoutSeconds: 2,
    },
    root,
    signal(),
    { env: {}, maxOutputBytes: 4096 },
  );
  assert.equal(noisy.ok, false);
  assert.equal(noisy.reason, 'outputLimit');
  assert.ok(Buffer.byteLength(noisy.output) <= 4096);
  const abort = new AbortController();
  const events: string[] = [];
  const candidate = await executable(path.join(root, 'python3' + (posix ? '' : '.exe')));
  const discovery = new PythonDiscovery((cmd, cwd, signal, options) =>
    runProcess(
      { ...cmd, program: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
      cwd,
      signal,
      options,
    ),
  );
  const pending = discovery.discover(root, { PATH: root }, abort.signal, observer(events));
  setTimeout(() => abort.abort(), 100);
  await assert.rejects(pending, { code: 'executionStopped' });
  assert.ok(events.includes('start:' + candidate));
  assert.equal(events.at(-1), 'finish:fatal');
});

test('trust revocation after one probe prevents every later candidate', async (t) => {
  const root = await folder(t);
  for (const name of ['python3', 'python2']) {
    await executable(path.join(root, name + (posix ? '' : '.exe')));
  }
  let trusted = true,
    calls = 0;
  await assert.rejects(
    new PythonDiscovery(async (cmd) => {
      calls++;
      trusted = false;
      return reply(cmd);
    }).discover(
      root,
      { PATH: root },
      signal(),
      observer([], () => {
        if (!trusted) {
          throw new OperationError('workspaceUntrusted');
        }
      }),
    ),
    { code: 'workspaceUntrusted' },
  );
  assert.equal(calls, 1);
});
test('real probe timeout is bounded and process registration failure cannot downgrade to unavailable', async (t) => {
  const root = await folder(t);
  await executable(path.join(root, 'python3' + (posix ? '' : '.exe')));
  const probe: typeof runProcess = (cmd, cwd, signal, options) =>
    runProcess(
      { ...cmd, program: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
      cwd,
      signal,
      options,
    );
  const result = await new PythonDiscovery(probe).discover(root, { PATH: root }, signal());
  assert.equal(result.interpreters[0].reason, 'timeout');
  await assert.rejects(
    new PythonDiscovery(probe).discover(root, { PATH: root }, signal(), {
      check: async () => {},
      start: async () => ({
        onProcess: async () => {
          throw new OperationError('persistenceFailed');
        },
        finish: async (_result, fatal) => {
          assert.ok(fatal instanceof CommandShutdownError);
        },
      }),
    }),
    { code: 'commandShutdown' },
  );
});
test(
  'real virtualenv keeps installed dependencies while discovery omits site initialization',
  { skip: !posix },
  async (t) => {
    const root = await folder(t);
    const summary = await new PythonDiscovery().discover(root, { PATH: '/usr/bin:/bin' }, signal());
    const python = summary.interpreters.find((p) => p.status === 'available' && p.major === 3);
    if (!python) {
      t.skip('No local Python 3');
      return;
    }
    const create = await runProcess(
      {
        id: 'venv',
        name: 'Create test virtualenv',
        program: python.path,
        args: ['-m', 'venv', '--without-pip', path.join(root, '.venv')],
        timeoutSeconds: 5,
      },
      root,
      signal(),
      { env: { PATH: '/usr/bin:/bin' } },
    );
    if (!create.ok) {
      t.skip('Local Python lacks venv');
      return;
    }
    const lib = path.join(
      root,
      '.venv/lib',
      'python' + python.version!.split('.').slice(0, 2).join('.'),
      'site-packages',
    );
    await mkdir(lib, { recursive: true });
    await writeFile(path.join(lib, 'dualmind_fixture_dependency.py'), 'VALUE = 42\n');
    await writeFile(
      path.join(lib, 'sitecustomize.py'),
      `open(${JSON.stringify(path.join(root, 'site-ran'))}, 'w').write('site')\n`,
    );
    const discovered = await new PythonDiscovery().discover(
      root,
      { PATH: '/usr/bin:/bin' },
      signal(),
    );
    const project = discovered.interpreters[0];
    assert.equal(project.source, 'project');
    assert.equal(project.path, path.join(root, '.venv/bin/python'));
    assert.equal(project.status, 'available');
    await assert.rejects(readFile(path.join(root, 'site-ran')));
    const script = await runProcess(
      {
        id: 'dependency',
        name: 'Use project dependency',
        program: project.path,
        args: [
          '-B',
          '-c',
          'import dualmind_fixture_dependency; print(dualmind_fixture_dependency.VALUE)',
        ],
        timeoutSeconds: 2,
      },
      root,
      signal(),
      { env: { PATH: '/usr/bin:/bin' } },
    );
    assert.equal(script.ok, true);
    assert.equal(script.output.trim(), '42');
  },
);
