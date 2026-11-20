import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchModels, modelsUrl, modelResponseLimit } from '../../src/providers/models';
import { ModelQueries } from '../../src/core/modelQueries';
import { fixture, taskInput } from './fixtures';
import { modelServer } from './modelServer';

const key = 'local-test-key-only';
const signal = () => new AbortController().signal;

test('joins model paths without losing gateway prefixes or duplicating slashes', () => {
  assert.equal(modelsUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/models');
  assert.equal(
    modelsUrl('http://localhost:8000/gateway/v1///'),
    'http://localhost:8000/gateway/v1/models',
  );
  for (const url of [
    'file:///tmp/data',
    'https://user:key@example.test/v1',
    'https://example.test/v1?key=x',
    'https://example.test/v1#x',
  ]) {
    assert.throws(() => modelsUrl(url), { code: 'invalidUrl' });
  }
});
test('performs a real authenticated GET, sends no task data, validates and deduplicates IDs', async () => {
  const server = await modelServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/gateway/v1/models');
    assert.equal(req.headers.authorization, `Bearer ${key}`);
    assert.equal(req.headers['content-length'], undefined);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'model-B' }, { id: 'model-a' }, { id: 'model-B' }] }));
  });
  try {
    const result = await fetchModels({ baseUrl: `${server.url}/gateway/v1/`, key }, signal());
    assert.deepEqual(result.models, ['model-B', 'model-a']);
    assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
    assert.ok(!JSON.stringify(result).includes(key));
  } finally {
    await server.close();
  }
});
test('empty success differs from malformed JSON and invalid model entries', async () => {
  for (const [body, valid] of [
    [{ data: [] }, true],
    [{ data: [{ id: '' }] }, false],
    [{ data: [{ id: 42 }] }, false],
    [{ data: [{ id: ' model ' }] }, false],
    [{ data: [{ id: 'a'.repeat(501) }] }, false],
    [{ data: [{ id: 'line\nbreak' }] }, false],
    [{ wrong: [] }, false],
    ['not-json', false],
  ] as const) {
    const server = await modelServer((_req, res) =>
      res.end(typeof body === 'string' ? body : JSON.stringify(body)),
    );
    try {
      const query = fetchModels({ baseUrl: server.url, key }, signal());
      if (valid) {
        assert.deepEqual((await query).models, []);
      } else {
        await assert.rejects(query, { code: 'modelsInvalidResponse' });
      }
    } finally {
      await server.close();
    }
  }
});
test('missing keys never issue a request', async () => {
  let requests = 0;
  const server = await modelServer((_req, res) => {
    requests++;
    res.end('{}');
  });
  try {
    await assert.rejects(fetchModels({ baseUrl: server.url }, signal()), { code: 'keyRequired' });
    assert.equal(requests, 0);
  } finally {
    await server.close();
  }
});
test('maps HTTP failures without echoing raw bodies or credentials', async () => {
  for (const [status, code] of [
    [401, 'modelsAuth'],
    [403, 'modelsForbidden'],
    [404, 'modelsUnsupported'],
    [405, 'modelsUnsupported'],
    [429, 'modelsRateLimited'],
    [500, 'modelsServer'],
    [400, 'modelsFailed'],
  ] as const) {
    const server = await modelServer((_req, res) => {
      res.writeHead(status);
      res.end(`unsafe-provider-body ${key}`);
    });
    try {
      await assert.rejects(
        fetchModels({ baseUrl: server.url, key }, signal()),
        (error: unknown) => {
          assert.equal((error as { code: string }).code, code);
          assert.ok(!String(error).includes(key));
          assert.ok(!String(error).includes('unsafe-provider-body'));
          return true;
        },
      );
    } finally {
      await server.close();
    }
  }
});
test('rejects redirects before contacting their destination', async () => {
  let redirected = false;
  const target = await modelServer((_req, res) => {
    redirected = true;
    res.end('{"data":[]}');
  });
  const origin = await modelServer((_req, res) => {
    res.writeHead(302, { Location: `${target.url}/models` });
    res.end();
  });
  try {
    await assert.rejects(fetchModels({ baseUrl: origin.url, key }, signal()), {
      code: 'modelsRedirect',
    });
    assert.equal(redirected, false);
  } finally {
    await origin.close();
    await target.close();
  }
});
test('enforces the byte limit for declared and chunked bodies', async () => {
  for (const declared of [true, false]) {
    const server = await modelServer((_req, res) => {
      if (declared) {
        res.setHeader('Content-Length', modelResponseLimit + 1);
      }
      res.write('x'.repeat(modelResponseLimit));
      res.end('x');
    });
    try {
      await assert.rejects(fetchModels({ baseUrl: server.url, key }, signal()), {
        code: 'modelsTooLarge',
      });
    } finally {
      await server.close();
    }
  }
});
test('timeout covers headers and body; cancellation has its own result', async () => {
  for (const headers of [false, true]) {
    const server = await modelServer((_req, res) => {
      if (headers) {
        res.writeHead(200);
        res.write('{"data":[');
      }
    });
    try {
      await assert.rejects(fetchModels({ baseUrl: server.url, key }, signal(), { timeoutMs: 40 }), {
        code: 'modelsTimeout',
      });
    } finally {
      await server.close();
    }
  }
  const server = await modelServer((_req, _res) => undefined);
  try {
    const controller = new AbortController();
    const query = fetchModels({ baseUrl: server.url, key }, controller.signal);
    controller.abort();
    await assert.rejects(query, { code: 'modelsChanged' });
  } finally {
    await server.close();
  }
});
test('network failures become actionable errors', async () => {
  const server = await modelServer((req) => req.socket.destroy());
  try {
    await assert.rejects(fetchModels({ baseUrl: server.url, key }, signal()), {
      code: 'modelsNetwork',
    });
  } finally {
    await server.close();
  }
});
test('allows independent connections, rejects duplicates, and drops invalidated late results', async () => {
  const releases = new Map<string, () => void>();
  const changed: string[] = [];
  const service = new ModelQueries(
    async (id) => ({ baseUrl: id, key }),
    (id) => changed.push(id),
    async ({ baseUrl }) => {
      await new Promise<void>((resolve) => releases.set(baseUrl, resolve));
      return { models: [baseUrl], fetchedAt: '2026-01-01T00:00:00Z' };
    },
  );
  const a = service.query('a');
  const b = service.query('b');
  await assert.rejects(service.query('a'), { code: 'modelsBusy' });
  service.invalidate('a');
  releases.get('a')!();
  releases.get('b')!();
  await assert.rejects(a, { code: 'modelsChanged' });
  assert.deepEqual((await b).models, ['b']);
  assert.deepEqual(changed, ['a']);
  const again = service.query('a');
  await Promise.resolve();
  service.dispose();
  releases.get('a')!();
  await assert.rejects(again, { code: 'modelsChanged' });
});
test('network waits do not hold the store queue; blank models and existing data remain valid', async () => {
  let release!: () => void;
  let began!: () => void;
  const ready = new Promise<void>((resolve) => {
    began = resolve;
  });
  const f = fixture({
    fetchModels: async () => {
      began();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { models: ['remote'], fetchedAt: new Date().toISOString() };
    },
  });
  await f.store.dispatch({
    kind: 'connection.save',
    input: { name: 'Blank default', baseUrl: 'https://example.test/v1', defaultModel: '' },
  });
  const c = (await f.store.snapshot()).connections[0];
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  const query = f.queries.query(c.id);
  await ready;
  await f.store.dispatch({ kind: 'task.save', input: taskInput() });
  assert.equal((await f.store.snapshot()).tasks.length, 1);
  release();
  assert.deepEqual((await query).models, ['remote']);
});
test('only successful URL/key changes and deletion invalidate model results', async () => {
  const f = fixture();
  const input = { name: 'First', baseUrl: 'https://example.test/v1', defaultModel: '' };
  await f.store.dispatch({ kind: 'connection.save', input });
  const c = (await f.store.snapshot()).connections[0];
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  assert.deepEqual(f.invalidated, [c.id]);
  f.invalidated.length = 0;
  await f.store.dispatch({
    kind: 'connection.save',
    id: c.id,
    input: { ...input, name: 'Rename', defaultModel: 'm' },
  });
  f.setKey(undefined);
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  f.setKey('test-only-key');
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  assert.deepEqual(f.invalidated, []);
  f.global.fail = true;
  await assert.rejects(
    f.store.dispatch({
      kind: 'connection.save',
      id: c.id,
      input: { ...input, baseUrl: 'https://other.test' },
    }),
  );
  assert.deepEqual(f.invalidated, []);
  f.global.fail = false;
  await f.store.dispatch({
    kind: 'connection.save',
    id: c.id,
    input: { ...input, baseUrl: 'https://other.test' },
  });
  f.setKey('replaced-key');
  await f.store.dispatch({ kind: 'connection.key', id: c.id });
  await f.store.dispatch({ kind: 'connection.delete', id: c.id, confirmed: true });
  assert.deepEqual(f.invalidated, [c.id, c.id, c.id]);
});

test('queries through the store send no saved task, role instructions or workspace content', async () => {
  const sent: { method?: string; url?: string; headers: unknown; body: string }[] = [];
  const server = await modelServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      sent.push({ method: request.method, url: request.url, headers: request.headers, body });
      response.end(JSON.stringify({ data: [{ id: 'shared-model' }] }));
    });
  });
  try {
    const f = fixture();
    f.ports.workspaceName = () => 'PRIVATE_WORKSPACE_MARKER';
    await f.store.dispatch({
      kind: 'role.save',
      locale: 'en',
      input: {
        name: 'Private reviewer',
        purpose: 'Private review',
        instructions: 'PRIVATE_REVIEWER_MARKER',
      },
    });
    const roleId = (await f.store.snapshot()).roles.find((role) => !role.builtIn)!.id;
    await f.store.dispatch({
      kind: 'connection.save',
      input: { name: 'Local', baseUrl: `${server.url}/gateway/v1`, defaultModel: 'shared-model' },
    });
    const connectionId = (await f.store.snapshot()).connections[0].id;
    await f.store.dispatch({ kind: 'connection.key', id: connectionId });
    const binding = { connectionId, model: 'shared-model' };
    await f.store.dispatch({
      kind: 'task.save',
      input: taskInput({
        roleId,
        requirements: 'PRIVATE_REQUIREMENTS_MARKER',
        worker: binding,
        reviewer: binding,
      }),
    });
    assert.deepEqual((await f.queries.query(connectionId)).models, ['shared-model']);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'GET');
    assert.equal(sent[0].url, '/gateway/v1/models');
    assert.equal(sent[0].body, '');
    for (const marker of [
      'PRIVATE_WORKSPACE_MARKER',
      'PRIVATE_REVIEWER_MARKER',
      'PRIVATE_REQUIREMENTS_MARKER',
    ]) {
      assert.ok(
        !JSON.stringify(sent).includes(marker),
        'Discovery must not send private task context',
      );
    }
    assert.ok(!JSON.stringify(await f.store.snapshot()).includes('test-only-key'));
  } finally {
    await server.close();
  }
});
