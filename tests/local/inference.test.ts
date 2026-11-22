import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inference, toolResult, type ToolDefinition } from '../../src/providers/inference';
import { modelServer } from './modelServer';
import type { ServerResponse } from 'node:http';
const definitions: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
];
function send(res: ServerResponse, events: unknown[]) {
  res.setHeader('Content-Type', 'text/event-stream');
  const data = events
    .map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\r\n\r\n`)
    .join('');
  const cut = Math.floor(data.length / 2);
  res.write(data.slice(0, cut));
  setImmediate(() => res.end(data.slice(cut)));
}
for (const protocol of ['chatCompletions', 'responses'] as const) {
  test(`${protocol} streams text and complete tool arguments, preserving own protocol output`, async () => {
    let received = '';
    const server = await modelServer((req, res) => {
      assert.equal(req.headers.authorization, 'Bearer test-key');
      assert.equal(
        req.url,
        protocol === 'responses' ? '/gateway/responses' : '/gateway/chat/completions',
      );
      req.on('data', (chunk) => {
        received += String(chunk);
      });
      req.on('end', () =>
        send(
          res,
          protocol === 'responses'
            ? [
                { type: 'response.output_text.delta', delta: 'Hello' },
                { type: 'response.function_call_arguments.delta', delta: '{"path":' },
                {
                  type: 'response.completed',
                  response: {
                    status: 'completed',
                    output: [
                      {
                        type: 'reasoning',
                        id: 'reasoning-own',
                        encrypted_content: 'PRIVATE_PROTOCOL_STATE',
                      },
                      {
                        type: 'function_call',
                        id: 'item1',
                        call_id: 'call1',
                        name: 'read_file',
                        arguments: '{"path":"file.txt"}',
                      },
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
                        content: 'Hello',
                        tool_calls: [
                          {
                            index: 0,
                            id: 'call1',
                            type: 'function',
                            function: { name: 'read_file', arguments: '{"path":' },
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  choices: [
                    {
                      index: 0,
                      delta: { tool_calls: [{ index: 0, function: { arguments: '"file.txt"}' } }] },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
                '[DONE]',
              ],
        ),
      );
    });
    try {
      let text = '';
      let progress = 0;
      const turn = await new Inference().turn(
        { baseUrl: `${server.url}/gateway`, key: 'test-key', model: 'fixture', protocol },
        [{ role: 'system', content: 'Own role instructions' }],
        definitions,
        new AbortController().signal,
        (delta) => {
          text += delta;
        },
        () => {
          progress++;
        },
      );
      assert.equal(text, 'Hello');
      assert.equal(progress, 1);
      assert.equal(turn.calls[0].arguments, '{"path":"file.txt"}');
      assert.ok(received.includes('Own role instructions'));
      assert.ok(!received.includes('test-key'));
      const result = toolResult(protocol, turn.calls[0], { content: 'file' });
      assert.equal(result[protocol === 'responses' ? 'call_id' : 'tool_call_id'], 'call1');
      assert.equal(
        JSON.stringify(turn.output).includes('PRIVATE_PROTOCOL_STATE'),
        protocol === 'responses',
      );
    } finally {
      await server.close();
    }
  });
}
test('inference rejects redirects, malformed/incomplete streams, unknown tools', async () => {
  for (const scenario of ['redirect', 'invalid', 'incomplete', 'tool']) {
    const server = await modelServer((_req, res) => {
      if (scenario === 'redirect') {
        res.writeHead(302, { Location: 'http://127.0.0.1:1' });
        res.end();
        return;
      }
      if (scenario === 'invalid') {
        send(res, ['not-json']);
        return;
      }
      send(res, [
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call',
                    type: 'function',
                    function: {
                      name: scenario === 'tool' ? 'write_file' : 'read_file',
                      arguments: scenario === 'arguments' ? '{' : '{"path":"a"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
        ...(scenario === 'incomplete' ? [] : ['[DONE]']),
      ]);
    });
    try {
      await assert.rejects(
        new Inference().turn(
          {
            baseUrl: server.url,
            key: 'PRIVATE-KEY',
            model: 'fixture',
            protocol: 'chatCompletions',
          },
          [],
          definitions,
          new AbortController().signal,
          () => undefined,
        ),
        (error: unknown) => {
          assert.ok(!String(error).includes('PRIVATE-KEY'));
          return true;
        },
      );
    } finally {
      await server.close();
    }
  }
});
test('inference enforces timeout, cancellation, response and context limits', async () => {
  const endpoint = {
    baseUrl: '',
    key: 'fake-key',
    model: 'fixture',
    protocol: 'chatCompletions' as const,
  };
  const server = await modelServer((_req, _res) => undefined);
  try {
    endpoint.baseUrl = server.url;
    await assert.rejects(
      new Inference({ timeoutMs: 30, maxBytes: 1000, contextBytes: 1000 }).turn(
        endpoint,
        [],
        definitions,
        new AbortController().signal,
        () => undefined,
      ),
      /timed out/,
    );
    const controller = new AbortController();
    const call = new Inference().turn(
      endpoint,
      [],
      definitions,
      controller.signal,
      () => undefined,
    );
    controller.abort();
    await assert.rejects(call, /stopped/);
    await assert.rejects(
      new Inference({ timeoutMs: 100, maxBytes: 1000, contextBytes: 1 }).turn(
        endpoint,
        [],
        definitions,
        new AbortController().signal,
        () => undefined,
      ),
      /Context exceeds/,
    );
  } finally {
    await server.close();
  }
  const large = await modelServer((_req, res) => send(res, ['x'.repeat(2000)]));
  try {
    await assert.rejects(
      new Inference({ timeoutMs: 1000, maxBytes: 100, contextBytes: 1000 }).turn(
        { ...endpoint, baseUrl: large.url },
        [],
        definitions,
        new AbortController().signal,
        () => undefined,
      ),
      /size limit/,
    );
  } finally {
    await large.close();
  }
});

for (const protocol of ['chatCompletions', 'responses'] as const) {
  test(`${protocol} reports response progress without publishing tool arguments or private reasoning`, async () => {
    const server = await modelServer((_req, res) =>
      send(
        res,
        protocol === 'responses'
          ? [
              { type: 'response.reasoning.delta', delta: 'PRIVATE_REASONING' },
              {
                type: 'response.function_call_arguments.delta',
                delta: '{"path":"PRIVATE_ARGUMENT"}',
              },
              {
                type: 'response.completed',
                response: {
                  status: 'completed',
                  output: [
                    {
                      type: 'function_call',
                      call_id: 'id',
                      name: 'read_file',
                      arguments: '{"path":"PRIVATE_ARGUMENT"}',
                    },
                    { type: 'reasoning', encrypted_content: 'PRIVATE_STATE' },
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
                      reasoning_content: 'PRIVATE_REASONING',
                      tool_calls: [
                        {
                          index: 0,
                          id: 'id',
                          function: { name: 'read_file', arguments: '{"path":"PRIVATE_ARGUMENT"}' },
                        },
                      ],
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              },
              '[DONE]',
            ],
      ),
    );
    try {
      let text = '',
        progress = 0;
      const result = await new Inference().turn(
        { baseUrl: server.url, model: 'test', protocol, key: 'test-key' },
        [],
        definitions,
        new AbortController().signal,
        (delta) => {
          text += delta;
        },
        () => {
          progress++;
        },
      );
      assert.equal(progress, 1);
      assert.equal(text, '');
      assert.equal(result.calls[0].name, 'read_file');
    } finally {
      await server.close();
    }
  });
  test(`${protocol} timeout before response ends without public output or progress`, async () => {
    const server = await modelServer(() => undefined);
    try {
      let progress = 0,
        text = '';
      await assert.rejects(
        new Inference({ timeoutMs: 50, maxBytes: 1024, contextBytes: 4096 }).turn(
          { baseUrl: server.url, model: 'test', protocol, key: 'test-key' },
          [],
          definitions,
          new AbortController().signal,
          (delta) => {
            text += delta;
          },
          () => {
            progress++;
          },
        ),
        { code: 'inferenceTimeout' },
      );
      assert.equal(progress, 0);
      assert.equal(text, '');
    } finally {
      await server.close();
    }
  });
}

for (const protocol of ['chatCompletions', 'responses'] as const) {
  test(`${protocol} retries only the model request before the first valid stream event`, async () => {
    let requests = 0;
    const waits: number[] = [];
    const started: number[] = [];
    const server = await modelServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (++requests < 3) {
          res.writeHead(503, { 'Retry-After': '0' });
          res.end('temporary');
          return;
        }
        send(
          res,
          protocol === 'responses'
            ? [{ type: 'response.completed', response: { status: 'completed', output: [] } }]
            : [
                { choices: [{ index: 0, delta: { content: 'done' }, finish_reason: 'stop' }] },
                '[DONE]',
              ],
        );
      });
    });
    try {
      await new Inference().turn(
        { baseUrl: `${server.url}/gateway`, model: 'fixture', key: 'key', protocol },
        [],
        definitions,
        new AbortController().signal,
        () => {},
        undefined,
        (attempt) => {
          waits.push(attempt);
        },
        (attempt) => {
          started.push(attempt);
        },
      );
      assert.equal(requests, 3);
      assert.deepEqual(waits, [2, 3]);
      assert.deepEqual(started, [2, 3]);
    } finally {
      await server.close();
    }
  });
}
for (const status of [401, 402, 429]) {
  test(`authentication and quota failures never retry (${status})`, async () => {
    let requests = 0;
    const server = await modelServer((req, res) => {
      req.resume();
      req.on('end', () => {
        requests++;
        res.writeHead(status);
        res.end(
          JSON.stringify({
            error: {
              code: status === 401 ? 'authentication' : 'insufficient_quota',
              message: 'secret-body-must-not-be-returned',
            },
          }),
        );
      });
    });
    try {
      await assert.rejects(
        new Inference().turn(
          { baseUrl: server.url, model: 'fixture', key: 'key', protocol: 'responses' },
          [],
          definitions,
          new AbortController().signal,
          () => {},
        ),
        (error: unknown) => {
          assert.equal(
            (error as { code: string }).code,
            status === 401 ? 'inferenceAuth' : 'inferenceQuota',
          );
          assert.ok(!JSON.stringify(error).includes('secret-body'));
          return true;
        },
      );
      assert.equal(requests, 1);
    } finally {
      await server.close();
    }
  });
}
test('retry-after beyond the shared request budget stops without an early retry', async () => {
  let requests = 0;
  const server = await modelServer((req, res) => {
    req.resume();
    req.on('end', () => {
      requests++;
      res.writeHead(429, { 'Retry-After': '120' });
      res.end('slow down');
    });
  });
  try {
    await assert.rejects(
      new Inference({ timeoutMs: 1000, maxBytes: 1024, contextBytes: 4096 }).turn(
        { baseUrl: server.url, model: 'fixture', key: 'key', protocol: 'responses' },
        [],
        definitions,
        new AbortController().signal,
        () => {},
      ),
      { code: 'inferenceHttp' },
    );
    assert.equal(requests, 1);
  } finally {
    await server.close();
  }
});
test('retry waiting can be cancelled and a partial stream is never retried', async () => {
  let requests = 0;
  let partial = false;
  const server = await modelServer((req, res) => {
    req.resume();
    req.on('end', () => {
      requests++;
      if (partial) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"type":"response.output_text.delta","delta":"partial"}\n\n');
        setTimeout(() => res.destroy(), 20);
      } else {
        res.writeHead(503);
        res.end('temporary');
      }
    });
  });
  const endpoint = {
    baseUrl: server.url,
    model: 'fixture',
    key: 'key',
    protocol: 'responses' as const,
  };
  try {
    const controller = new AbortController();
    await assert.rejects(
      new Inference().turn(
        endpoint,
        [],
        definitions,
        controller.signal,
        () => {},
        undefined,
        () => controller.abort(),
      ),
      { code: 'executionStopped' },
    );
    assert.equal(requests, 1);
    partial = true;
    await assert.rejects(
      new Inference().turn(endpoint, [], definitions, new AbortController().signal, () => {}),
    );
    assert.equal(requests, 2);
  } finally {
    await server.close();
  }
});
