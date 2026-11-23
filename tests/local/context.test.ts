import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RoleContext,
  contextGroups,
  publicHistory,
  contextDigest,
} from '../../src/providers/context';
import {
  Inference,
  toolResult,
  type Endpoint,
  type History,
  type ModelTurn,
  type ToolDefinition,
} from '../../src/providers/inference';
import type { ContextSummary, ContextCheckpoint } from '../../src/shared/context';
import { OperationError } from '../../src/shared/errors';

const tools: ToolDefinition[] = [
  { name: 'read_file', description: 'Read', parameters: { type: 'object' } },
];
class Summarizer extends Inference {
  inputs: History[] = [];
  override async turn(
    _endpoint: Endpoint,
    history: History,
    definitions: ToolDefinition[],
  ): Promise<ModelTurn> {
    assert.deepEqual(
      definitions.map((d) => d.name),
      ['submit_context_summary'],
    );
    this.inputs.push(structuredClone(history));
    return {
      text: '',
      output: [],
      calls: [
        {
          id: 'summary',
          name: 'submit_context_summary',
          arguments: JSON.stringify({
            summary:
              'Goal: fix cancellation. Preserve failures and operation IDs. Recheck the current files; work is not yet accepted.',
          }),
        },
      ],
    };
  }
}
function history(protocol: Endpoint['protocol']): History {
  const result: History = [
    { role: 'system', content: 'Original requirements and immutable role policy.' },
  ];
  for (let i = 0; i < 10; i++) {
    const call = { id: `call-${i}`, name: 'read_file', arguments: '{"path":"file"}' };
    if (protocol === 'responses') {
      result.push(
        { type: 'reasoning', encrypted_content: `PRIVATE-${i}` },
        { type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments },
      );
    } else {
      result.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          },
        ],
      });
    }
    result.push(
      toolResult(protocol, call, { operationId: `op-${i}`, output: 'data '.repeat(1300) }),
    );
  }
  return result;
}
for (const protocol of ['chatCompletions', 'responses'] as const) {
  test(`${protocol}: compaction preserves immutable policy, role boundaries, complete calls and durable summaries`, async () => {
    const endpoint = { baseUrl: 'http://unused.invalid', key: 'key', model: 'fixture', protocol };
    const context = new RoleContext('worker', 'run-id', endpoint);
    const original = history(protocol),
      messages = structuredClone(original);
    const inference = new Summarizer();
    let saved: { value: ContextSummary; checkpoint: ContextCheckpoint } | undefined;
    assert.equal(context.needsCompaction(messages, tools), true);
    await context.compact({
      history: messages,
      tools,
      inference,
      facts: { planVersion: 3, stage: 'worker', pending: ['human-message'] },
      throughOperation: 'op-9',
      signal: new AbortController().signal,
      clean: (text) => text,
      persist: async (value, checkpoint) => {
        assert.deepEqual(messages, original, 'memory changes only after persistence');
        assert.equal(checkpoint.hash, contextDigest(value));
        saved = { value, checkpoint };
      },
    });
    assert.ok(saved);
    assert.deepEqual(messages[0], original[0]);
    assert.ok(JSON.stringify(messages).includes('human-message'));
    assert.ok(inference.inputs.length > 1, 'large prefixes are summarized in bounded chunks');
    assert.ok(!JSON.stringify(inference.inputs).includes('PRIVATE-'));
    assert.ok(!JSON.stringify(saved).includes('PRIVATE-'));
    assert.ok(contextGroups(messages, protocol).length <= 6);
    assert.ok(
      context.usage(messages, tools).requestBytes < context.usage(original, tools).requestBytes / 2,
    );
    const restored = new RoleContext('worker', 'run-id', endpoint);
    restored.restore(saved!.checkpoint, saved!.value);
    assert.ok(restored.restoredMessage());
    const otherRole = new RoleContext('reviewer', 'run-id', endpoint);
    assert.throws(() => otherRole.restore(saved!.checkpoint, saved!.value), {
      code: 'contextSnapshot',
    });
    assert.throws(() => restored.restore(saved!.checkpoint, { ...saved!.value, text: 'forged' }), {
      code: 'contextSnapshot',
    });
  });
  test(`${protocol}: failed persistence and cancellation leave original role history intact`, async () => {
    const endpoint = { baseUrl: 'http://unused.invalid', key: 'key', model: 'fixture', protocol };
    const context = new RoleContext('reviewer', 'run-id', endpoint),
      messages = history(protocol),
      original = structuredClone(messages);
    const options = {
      history: messages,
      tools,
      inference: new Summarizer(),
      facts: {},
      throughOperation: null,
      signal: new AbortController().signal,
      clean: (text: string) => text,
      persist: async () => {
        throw new OperationError('persistenceFailed');
      },
    };
    await assert.rejects(context.compact(options), { code: 'persistenceFailed' });
    assert.deepEqual(messages, original);
    assert.equal(context.checkpoint, undefined);
    await assert.rejects(context.compact({ ...options, signal: AbortSignal.abort() }), {
      code: 'executionStopped',
    });
  });
}
test('Responses keeps multi-call batches, rejects orphans, and strips opaque protocol state from summary input', () => {
  const messages: History = [
    { type: 'reasoning', encrypted_content: 'opaque' },
    { type: 'message', content: [{ type: 'output_text', text: 'Public note' }] },
    { type: 'function_call', call_id: 'a', name: 'read_file', arguments: '{}' },
    { type: 'function_call', call_id: 'b', name: 'read_file', arguments: '{}' },
    { type: 'function_call_output', call_id: 'a', output: '{}' },
    { type: 'function_call_output', call_id: 'b', output: '{}' },
  ];
  assert.equal(contextGroups(messages, 'responses').length, 1);
  assert.throws(() => contextGroups(messages.slice(0, -1), 'responses'), {
    code: 'contextCompaction',
  });
  assert.throws(() => contextGroups(messages.slice(-1), 'responses'), {
    code: 'contextCompaction',
  });
  assert.ok(!JSON.stringify(publicHistory(messages)).includes('opaque'));
});
test('minimum budgets and non-progressing summaries fail recoverably instead of deleting instructions', async () => {
  const endpoint: Endpoint = {
    baseUrl: 'http://unused.invalid',
    key: 'key',
    model: 'fixture',
    protocol: 'chatCompletions',
    contextWindowTokens: 8192,
  };
  const context = new RoleContext('worker', 'run-id', endpoint);
  const messages: History = [
    { role: 'system', content: 'requirements '.repeat(2000) },
    { role: 'user', content: 'Continue' },
  ];
  const original = structuredClone(messages),
    inference = new Summarizer();
  await assert.rejects(
    context.compact({
      history: messages,
      tools,
      facts: {},
      throughOperation: null,
      inference,
      signal: new AbortController().signal,
      forced: true,
      clean: (text) => text,
      persist: async () => undefined,
    }),
    { code: 'contextMinimum' },
  );
  assert.deepEqual(messages, original);
  assert.equal(inference.inputs.length, 0);
  const small = new RoleContext('worker', 'run-id', { ...endpoint, contextWindowTokens: 32768 });
  await assert.rejects(
    small.compact({
      history: [
        { role: 'system', content: 'policy' },
        { role: 'user', content: 'Hi' },
      ],
      tools,
      facts: {},
      throughOperation: null,
      inference,
      signal: new AbortController().signal,
      forced: true,
      clean: (text) => text,
      persist: async () => undefined,
    }),
    { code: 'contextCompaction' },
  );
});
