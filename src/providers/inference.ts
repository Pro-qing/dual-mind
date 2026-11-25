import {
  providerFailure,
  contextOverflow,
  retryAfter,
  retryDelay,
  transientNetwork,
  waitForRetry,
} from './retry';
import { OperationError } from '../shared/errors';
import type { Protocol, ProviderPreset } from '../shared/execution';
import { inferenceBody, inferenceHeaders, inferenceUrl, toolResult } from './adapters/protocol';
export interface Endpoint {
  contextWindowTokens?: number;
  baseUrl: string;
  key: string;
  model: string;
  protocol: Protocol;
  provider?: ProviderPreset;
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
  usage?: { inputTokens: number; outputTokens: number };
  attempts?: number;
  text: string;
  calls: ToolCall[];
  output: History;
}
export class InferenceError extends OperationError {
  attempts = 1;
  retryable = false;
  retryAfterMs?: number;
}
interface WireEvent {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: unknown;
  type?: string;
  delta?: unknown;
  index?: number;
  message?: { usage?: { input_tokens?: number } };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
    text?: string;
  };
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
  response?: {
    status: string;
    output: History;
    error?: unknown;
    incomplete_details?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
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
    progress?: () => void,
    retry?: (attempt: number, delayMs: number) => void | Promise<void>,
    attemptStarted?: (attempt: number) => void,
  ): Promise<ModelTurn> {
    const deadline = Date.now() + this.limits.timeoutMs;
    for (let attempt = 1; ; attempt++) {
      let received = false;
      try {
        if (attempt > 1) {
          attemptStarted?.(attempt);
        }
        const result = await this.attempt(
          endpoint,
          history,
          tools,
          signal,
          delta,
          () => {
            received = true;
            progress?.();
          },
          Math.max(1, deadline - Date.now()),
        );
        return { ...result, attempts: attempt };
      } catch (error) {
        if (error instanceof InferenceError) {
          error.attempts = attempt;
        }
        if (
          !(error instanceof InferenceError) ||
          !error.retryable ||
          received ||
          signal.aborted ||
          attempt >= 3
        ) {
          throw error;
        }
        const delay = retryDelay(attempt, deadline - Date.now(), error.retryAfterMs);
        if (delay === undefined) {
          throw error;
        }
        await retry?.(attempt + 1, delay);
        await waitForRetry(delay, signal);
      }
    }
  }
  private async attempt(
    endpoint: Endpoint,
    history: History,
    tools: ToolDefinition[],
    signal: AbortSignal,
    delta: (text: string) => void,
    progress: () => void,
    timeoutMs: number,
  ): Promise<ModelTurn> {
    const chat = endpoint.protocol === 'chatCompletions';
    const url = inferenceUrl(endpoint);
    const body = inferenceBody(endpoint, history, tools);
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
    }, timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: inferenceHeaders(endpoint),
        body: encoded,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) {
        const { quota, context } = await providerFailure(response);
        const error = new InferenceError(
          response.status === 401 || response.status === 403
            ? 'inferenceAuth'
            : quota
              ? 'inferenceQuota'
              : context
                ? 'inferenceContext'
                : 'inferenceHttp',
          { status: response.status },
        );
        error.retryable =
          !quota && !context && [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        error.retryAfterMs = retryAfter(response.headers.get('retry-after'));
        throw error;
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
      let reportedProgress = false;
      const reportProgress = () => {
        if (!reportedProgress) {
          reportedProgress = true;
          progress?.();
        }
      };
      const calls = new Map<number, ToolCall>();
      let output: History = [];
      let usage: ModelTurn['usage'];
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
          throw new InferenceError(
            contextOverflow(
              event.error ?? event.response?.error ?? event.response?.incomplete_details ?? event,
            )
              ? 'inferenceContext'
              : 'inferenceIncomplete',
          );
        }
        if (endpoint.protocol === 'anthropic') {
          const inputTokens = event.message?.usage?.input_tokens ?? event.usage?.input_tokens;
          const outputTokens = event.usage?.output_tokens;
          if (Number.isSafeInteger(inputTokens) && (inputTokens ?? 0) > 0) {
            usage = { inputTokens: inputTokens!, outputTokens: usage?.outputTokens ?? 0 };
          }
          if (Number.isSafeInteger(outputTokens) && (outputTokens ?? -1) >= 0) {
            usage = { inputTokens: usage?.inputTokens ?? 0, outputTokens: outputTokens! };
          }
        } else {
          const inputTokens = chat
            ? event.usage?.prompt_tokens
            : event.response?.usage?.input_tokens;
          const outputTokens = chat
            ? event.usage?.completion_tokens
            : event.response?.usage?.output_tokens;
          if (
            Number.isSafeInteger(inputTokens) &&
            (inputTokens ?? 0) > 0 &&
            Number.isSafeInteger(outputTokens) &&
            (outputTokens ?? -1) >= 0
          ) {
            usage = { inputTokens: inputTokens!, outputTokens: outputTokens! };
          }
        }
        if (chat) {
          if (!Array.isArray(event.choices)) {
            throw invalid();
          }
          if (!event.choices.length) {
            return;
          }
          reportProgress();
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
        } else if (endpoint.protocol === 'responses') {
          if (typeof event.type === 'string' && event.type.startsWith('response.')) {
            reportProgress();
          }
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
        } else {
          reportProgress();
          if (event.type === 'message_start') {
            if (!event.message || !event.message.usage) {
              throw invalid();
            }
          } else if (event.type === 'content_block_start') {
            if (!Number.isSafeInteger(event.index) || event.index! < 0 || event.index! > 100) {
              throw invalid();
            }
            const block = event.content_block;
            if (!block || typeof block.type !== 'string') {
              throw invalid();
            }
            if (block.type === 'text') {
              if (typeof block.text !== 'string') {
                throw invalid();
              }
              if (block.text) {
                text += block.text;
                delta(block.text);
              }
            } else if (block.type === 'tool_use') {
              if (
                typeof block.id !== 'string' ||
                typeof block.name !== 'string' ||
                calls.has(event.index!)
              ) {
                throw invalid();
              }
              calls.set(event.index!, { id: block.id, name: block.name, arguments: '' });
            } else if (!['thinking', 'redacted_thinking'].includes(block.type)) {
              throw invalid();
            }
          } else if (event.type === 'content_block_delta') {
            const part = event.delta as Record<string, unknown> | undefined;
            if (!part || typeof part.type !== 'string') {
              throw invalid();
            }
            if (part.type === 'text_delta') {
              if (typeof part.text !== 'string') {
                throw invalid();
              }
              text += part.text;
              delta(part.text);
            } else if (part.type === 'input_json_delta') {
              const call = calls.get(event.index ?? -1);
              if (!call || typeof part.partial_json !== 'string') {
                throw invalid();
              }
              call.arguments += part.partial_json;
            } else if (!['thinking_delta', 'signature_delta'].includes(part.type)) {
              throw invalid();
            }
          } else if (event.type === 'message_delta') {
            const update = event.delta as Record<string, unknown> | undefined;
            const stopReason = update?.stop_reason;
            if (!['end_turn', 'tool_use', 'stop_sequence'].includes(String(stopReason))) {
              throw new InferenceError('inferenceIncomplete');
            }
            finished = true;
          } else if (event.type === 'message_stop') {
            if (!finished) {
              throw invalid();
            }
            done = true;
          } else if (event.type !== 'ping' && event.type !== 'content_block_stop') {
            throw invalid();
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
        list.some(
          (call) => !call.id || !call.name || call.id.length > 200 || call.name.length > 200,
        )
      ) {
        throw invalid();
      }
      // Completed argument strings are validated by the execution layer so the
      // model can correct them. Framing and IDs remain strict; the host rejects unavailable tools.
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
      } else if (endpoint.protocol === 'anthropic') {
        output = [
          {
            role: 'assistant',
            content: [
              ...(text ? [{ type: 'text', text }] : []),
              ...list.map((call) => {
                let input: unknown;
                try {
                  input = JSON.parse(call.arguments || '{}');
                } catch {
                  input = null;
                }
                return {
                  type: 'tool_use',
                  id: call.id,
                  name: call.name,
                  input: input && typeof input === 'object' && !Array.isArray(input) ? input : {},
                };
              }),
            ],
          },
        ];
      }
      return { text, calls: list, output, ...(usage ? { usage } : {}) };
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
      const failure = new InferenceError('inferenceNetwork');
      failure.retryable = transientNetwork(error);
      throw failure;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
}
export { inferenceBody, toolResult };

/** Use the exact same envelope for estimation and transport. */
export function inferenceBytes(
  endpoint: Endpoint,
  history: History,
  tools: ToolDefinition[],
): number {
  return Buffer.byteLength(JSON.stringify(inferenceBody(endpoint, history, tools)));
}
