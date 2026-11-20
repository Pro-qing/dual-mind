import { OperationError } from '../shared/errors';
import type { Protocol } from '../shared/execution';
import { modelsUrl } from './models';
export interface Endpoint {
  baseUrl: string;
  key: string;
  model: string;
  protocol: Protocol;
}
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
export type History = Record<string, unknown>[];
export interface ModelTurn {
  text: string;
  calls: ToolCall[];
  output: History;
}
export class InferenceError extends OperationError {}
interface WireEvent {
  error?: unknown;
  type?: string;
  delta?: string;
  choices?: {
    index: number;
    delta: {
      content?: string | null;
      refusal?: unknown;
      tool_calls?: {
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string;
  }[];
  response?: { status: string; output: History };
}
const invalid = () => new InferenceError('inferenceInvalid');
export class Inference {
  constructor(
    private readonly limits = {
      timeoutMs: 120_000,
      maxBytes: 8 * 1024 * 1024,
      contextBytes: 512 * 1024,
    },
  ) {}
  async turn(
    endpoint: Endpoint,
    history: History,
    tools: ToolDefinition[],
    signal: AbortSignal,
    delta: (text: string) => void,
  ): Promise<ModelTurn> {
    const chat = endpoint.protocol === 'chatCompletions';
    const url = modelsUrl(endpoint.baseUrl).replace(
      /\/models$/,
      chat ? '/chat/completions' : '/responses',
    );
    const body = {
      model: endpoint.model,
      stream: true,
      ...(chat
        ? {
            messages: history,
            tools: tools.map((fn) => ({ type: 'function', function: { ...fn, strict: false } })),
          }
        : {
            input: history,
            store: false,
            include: ['reasoning.encrypted_content'],
            tools: tools.map((fn) => ({ type: 'function', ...fn, strict: false })),
          }),
    };
    const encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > this.limits.contextBytes) {
      throw new InferenceError('inferenceContext');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, this.limits.timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${endpoint.key}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: encoded,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new InferenceError(
          response.status === 401 || response.status === 403 ? 'inferenceAuth' : 'inferenceHttp',
          { status: response.status },
        );
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        await response.body?.cancel();
        throw invalid();
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '',
        total = 0,
        text = '',
        done = false,
        finished = false;
      const calls = new Map<number, ToolCall>();
      let output: History = [];
      const accept = (raw: string) => {
        if (!raw.trim()) {
          return;
        }
        if (raw.trim() === '[DONE]') {
          if (!chat || !finished) {
            throw invalid();
          }
          done = true;
          return;
        }
        if (done) {
          return;
        }
        let event: WireEvent;
        try {
          event = JSON.parse(raw);
        } catch {
          throw invalid();
        }
        if (
          event.error ||
          ['error', 'response.failed', 'response.incomplete'].includes(event.type || '')
        ) {
          throw new InferenceError('inferenceIncomplete');
        }
        if (chat) {
          if (!Array.isArray(event.choices)) {
            throw invalid();
          }
          if (!event.choices.length) {
            return;
          }
          const choice = event.choices[0];
          if (choice.index !== 0) {
            throw invalid();
          }
          const part = choice.delta;
          if (!part || typeof part !== 'object' || part.refusal) {
            throw invalid();
          }
          if (part.content !== null && part.content !== undefined) {
            if (typeof part.content !== 'string') {
              throw invalid();
            }
            text += part.content;
            delta(part.content);
          }
          if (part.tool_calls) {
            if (!Array.isArray(part.tool_calls)) {
              throw invalid();
            }
            for (const item of part.tool_calls) {
              if (!Number.isSafeInteger(item.index) || item.index < 0 || item.index > 100) {
                throw invalid();
              }
              const call = calls.get(item.index) || { id: '', name: '', arguments: '' };
              if (item.type && item.type !== 'function') {
                throw invalid();
              }
              if (item.id) {
                if (call.id && call.id !== item.id) {
                  throw invalid();
                }
                call.id = item.id;
              }
              if (item.function?.name) {
                call.name += item.function.name;
              }
              if (item.function?.arguments !== null && item.function?.arguments !== undefined) {
                if (typeof item.function.arguments !== 'string') {
                  throw invalid();
                }
                call.arguments += item.function.arguments;
              }
              calls.set(item.index, call);
            }
          }
          if (choice.finish_reason) {
            if (!['tool_calls', 'stop'].includes(choice.finish_reason)) {
              throw new InferenceError('inferencePartial');
            }
            finished = true;
          }
        } else {
          if (event.type === 'response.output_text.delta') {
            if (typeof event.delta !== 'string') {
              throw invalid();
            }
            text += event.delta;
            delta(event.delta);
          }
          if (event.type === 'response.completed') {
            if (event.response?.status !== 'completed' || !Array.isArray(event.response.output)) {
              throw invalid();
            }
            output = event.response.output;
            for (const item of output) {
              if (item.type === 'function_call') {
                if (
                  typeof item.call_id !== 'string' ||
                  typeof item.name !== 'string' ||
                  typeof item.arguments !== 'string'
                ) {
                  throw invalid();
                }
                calls.set(calls.size, {
                  id: item.call_id,
                  name: item.name,
                  arguments: item.arguments,
                });
              } else if (item.type !== 'message' && item.type !== 'reasoning') {
                throw invalid();
              }
              if (
                item.type === 'message' &&
                Array.isArray(item.content) &&
                item.content.some((part: unknown) =>
                  Boolean(
                    part && typeof part === 'object' && 'type' in part && part.type === 'refusal',
                  ),
                )
              ) {
                throw invalid();
              }
            }
            done = true;
          }
        }
      };
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        total += next.value.byteLength;
        if (total > this.limits.maxBytes) {
          throw new InferenceError('inferenceLimit');
        }
        buffer += decoder.decode(next.value, { stream: true });
        let match: RegExpExecArray | null;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const block = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const data = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n');
          accept(data);
        }
      }
      if (!done) {
        throw new InferenceError('inferenceEnded');
      }
      const list = [...calls.values()];
      if (
        new Set(list.map((call) => call.id)).size !== list.length ||
        list.some((call) => !call.id || !tools.some((tool) => tool.name === call.name))
      ) {
        throw invalid();
      }
      for (const call of list) {
        try {
          if (
            !JSON.parse(call.arguments) ||
            typeof JSON.parse(call.arguments) !== 'object' ||
            Array.isArray(JSON.parse(call.arguments))
          ) {
            throw invalid();
          }
        } catch {
          throw invalid();
        }
      }
      if (chat) {
        output = [
          {
            role: 'assistant',
            content: text || null,
            ...(list.length
              ? {
                  tool_calls: list.map((call) => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: call.arguments },
                  })),
                }
              : {}),
          },
        ];
      }
      return { text, calls: list, output };
    } catch (error) {
      if (signal.aborted) {
        throw new InferenceError('executionStopped');
      }
      if (timedOut) {
        throw new InferenceError('inferenceTimeout');
      }
      if (error instanceof InferenceError) {
        throw error;
      }
      throw new InferenceError('inferenceNetwork');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
}
export function toolResult(
  protocol: Protocol,
  call: ToolCall,
  result: unknown,
): Record<string, unknown> {
  const text = JSON.stringify(result);
  return protocol === 'responses'
    ? { type: 'function_call_output', call_id: call.id, output: text }
    : { role: 'tool', tool_call_id: call.id, content: text };
}
