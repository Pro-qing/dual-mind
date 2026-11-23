import {
  providerFailure,
  contextOverflow,
  retryAfter,
  retryDelay,
  transientNetwork,
  waitForRetry,
} from './retry';
import { OperationError } from '../shared/errors';
import type { Protocol } from '../shared/execution';
import { modelsUrl } from './models';
export interface Endpoint {
  contextWindowTokens?: number;
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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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
    const url = modelsUrl(endpoint.baseUrl).replace(
      /\/models$/,
      chat ? '/chat/completions' : '/responses',
    );
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
        const inputTokens = chat ? event.usage?.prompt_tokens : event.response?.usage?.input_tokens;
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
        } else {
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

/** Use the exact same envelope for estimation and transport. */
export function inferenceBody(endpoint: Endpoint, history: History, tools: ToolDefinition[]) {
  const chat = endpoint.protocol === 'chatCompletions';
  return {
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
}
export function inferenceBytes(
  endpoint: Endpoint,
  history: History,
  tools: ToolDefinition[],
): number {
  return Buffer.byteLength(JSON.stringify(inferenceBody(endpoint, history, tools)));
}
