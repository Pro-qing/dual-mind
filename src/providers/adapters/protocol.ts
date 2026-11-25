import type { Protocol, ProviderPreset } from '../../shared/execution';
import { modelsUrl } from '../models';
import type { Endpoint, History, ToolCall, ToolDefinition } from '../inference';

export function inferenceUrl(endpoint: Pick<Endpoint, 'baseUrl' | 'protocol'>): string {
  const path =
    endpoint.protocol === 'chatCompletions'
      ? '/chat/completions'
      : endpoint.protocol === 'responses'
        ? '/responses'
        : '/messages';
  return modelsUrl(endpoint.baseUrl).replace(/\/models$/, path);
}

export function inferenceHeaders(
  endpoint: Pick<Endpoint, 'key' | 'protocol' | 'provider'>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (endpoint.protocol === 'anthropic' && endpoint.provider !== 'commandCode') {
    headers['x-api-key'] = endpoint.key;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${endpoint.key}`;
    if (endpoint.protocol === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
    }
  }
  return headers;
}

export function inferenceBody(
  endpoint: Pick<Endpoint, 'model' | 'protocol'>,
  history: History,
  tools: ToolDefinition[],
): Record<string, unknown> {
  if (endpoint.protocol === 'chatCompletions') {
    return {
      model: endpoint.model,
      stream: true,
      messages: history,
      tools: tools.map((fn) => ({ type: 'function', function: { ...fn, strict: false } })),
    };
  }
  if (endpoint.protocol === 'responses') {
    return {
      model: endpoint.model,
      stream: true,
      input: history,
      store: false,
      include: ['reasoning.encrypted_content'],
      tools: tools.map((fn) => ({ type: 'function', ...fn, strict: false })),
    };
  }
  const system = history
    .filter((message) => message.role === 'system' || message.role === 'developer')
    .map((message) => message.content)
    .filter((content): content is string => typeof content === 'string')
    .join('\n\n');
  return {
    model: endpoint.model,
    max_tokens: 8192,
    stream: true,
    ...(system ? { system } : {}),
    messages: history.filter(
      (message) => message.role !== 'system' && message.role !== 'developer',
    ),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  };
}

export function toolResult(
  protocol: Protocol,
  call: ToolCall,
  result: unknown,
): Record<string, unknown> {
  const text = JSON.stringify(result);
  if (protocol === 'responses') {
    return { type: 'function_call_output', call_id: call.id, output: text };
  }
  if (protocol === 'anthropic') {
    return {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, content: text }],
    };
  }
  return { role: 'tool', tool_call_id: call.id, content: text };
}

export function modelListHeaders(credentials: {
  key: string;
  protocol?: Protocol;
  provider?: ProviderPreset;
}): Record<string, string> {
  if (credentials.protocol === 'anthropic' && credentials.provider !== 'commandCode') {
    return {
      'x-api-key': credentials.key,
      'anthropic-version': '2023-06-01',
      Accept: 'application/json',
    };
  }
  return { Authorization: `Bearer ${credentials.key}`, Accept: 'application/json' };
}

export function supportsProtocol(value: unknown, protocol: Protocol): boolean {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return false;
  }
  const accepted = value.map((item) =>
    item
      .toLowerCase()
      .replace(/^\/+/, '')
      .replace(/^v\d+\//, '')
      .replaceAll('_', '/'),
  );
  const suffix =
    protocol === 'chatCompletions'
      ? 'chat/completions'
      : protocol === 'responses'
        ? 'responses'
        : 'messages';
  return accepted.some((item) => item === suffix || item.endsWith(`/${suffix}`));
}
