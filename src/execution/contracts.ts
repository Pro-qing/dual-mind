import { OperationError } from '../shared/errors';
import type {
  Agent,
  PlanInput,
  TaskPlan,
  WorkSubmission,
  ReviewResult,
  CommandEvidence,
} from '../shared/execution';
import type { ToolCall, ToolDefinition } from '../providers/inference';

const string = { type: 'string', maxLength: 12000 };
const nonempty = { ...string, minLength: 1 };
const id = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' };
const array = (items: unknown, maxItems = 40, minItems = 0) => ({
  type: 'array',
  items,
  maxItems,
  minItems,
});
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const criterion = object({
  id,
  description: nonempty,
  verification: { type: 'string', enum: ['command', 'reading'] },
  evidence: nonempty,
  reason: string,
});
const plan = object({
  objective: nonempty,
  requirements: nonempty,
  steps: array(nonempty, 40, 1),
  criteria: array(criterion, 40, 1),
  revisionReason: string,
});
const evidence = { criterionId: id, commandIds: array(id, 40), evidence: nonempty };
export type AgentPhase = Agent | 'planning' | 'answering';
export function agentTools(phase: AgentPhase): ToolDefinition[] {
  const read: ToolDefinition[] = [
    {
      name: 'read_operation',
      description:
        'Read a saved public recovery operation by its host ID, including status, arguments and result. Unknown status does not mean the operation never ran. Use pagination for older or longer records.',
      parameters: object(
        {
          id,
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 12000 },
        },
        ['id'],
      ),
    },
    {
      name: 'list_files',
      description: 'List readable task files, with pagination.',
      parameters: object(
        {
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
        [],
      ),
    },
    {
      name: 'read_file',
      description: 'Read relevant task file lines.',
      parameters: object(
        {
          path: nonempty,
          startLine: { type: 'integer', minimum: 1 },
          lineCount: { type: 'integer', minimum: 1, maximum: 500 },
        },
        ['path'],
      ),
    },
    { name: 'task_status', description: 'Get current worktree status.', parameters: object({}) },
    {
      name: 'task_diff',
      description: 'Read changes from the fixed baseline; use read_file for new files.',
      parameters: object({}),
    },
    {
      name: 'read_command_output',
      description: 'Read actual recorded command output in pages; the host owns these records.',
      parameters: object(
        {
          id,
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 12000 },
        },
        ['id'],
      ),
    },
  ];
  if (phase === 'answering') {
    return [
      ...read,
      {
        name: 'submit_answer',
        description:
          'Answer or clarify the user message using read-only inspection. This is not acceptance and must not claim new work was performed.',
        parameters: object({ answer: nonempty }),
      },
      {
        name: 'submit_plan',
        description:
          'For a requested modification, issue an executable plan for Worker. Inspect the current files and differences first.',
        parameters: plan,
      },
    ];
  }
  if (phase === 'planning') {
    return [
      ...read,
      {
        name: 'submit_plan',
        description:
          'Issue the initial executable plan based on user requirements and relevant project context. Reading criteria require a reason for no command.',
        parameters: plan,
      },
    ];
  }
  if (phase === 'reviewer') {
    return [
      ...read,
      {
        name: 'submit_review',
        description:
          'Review the actual artifacts and evidence. Use pass + finish only when the whole task is complete and confidence is at least 0.8. Use pass + continue for a correct step with more work; use fail + continue when changes are needed. Continue requires a complete nextPlan. Add the standalone TASK_COMPLETE line after the tool call only when finishing.',
        parameters: object(
          {
            verdict: { type: 'string', enum: ['pass', 'fail'] },
            risk: { type: 'string', enum: ['low', 'medium', 'high'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            issues: array(string, 40),
            evidence: array(nonempty, 80),
            reasoning: nonempty,
            summary: nonempty,
            nextStep: object(
              {
                action: { type: 'string', enum: ['continue', 'finish'] },
                instructions: string,
              },
              ['action', 'instructions'],
            ),
            nextPlan: plan,
          },
          [
            'verdict',
            'risk',
            'confidence',
            'issues',
            'evidence',
            'reasoning',
            'summary',
            'nextStep',
          ],
        ),
      },
    ];
  }
  return [
    ...read,
    {
      name: 'run_command',
      description:
        'Execute a task-related command in the host-selected shell. Each call is independent; combine activation and work in this call. Wait for foreground completion; surviving background children are stopped and the command fails. Prepare project dependencies as needed; do not install user or system toolchains. Verification must reference current command criteria. cwd is relative to the task, defaults to dot. Timeout defaults to 180 seconds. Commands run as the user, without an OS sandbox.',
      parameters: object(
        {
          name: { ...nonempty, maxLength: 200 },
          command: nonempty,
          cwd: { ...nonempty, maxLength: 2048 },
          purpose: { type: 'string', enum: ['prepare', 'verify', 'explore'] },
          criterionIds: array(id, 40),
          timeoutSeconds: { type: 'integer', minimum: 10, maximum: 900 },
        },
        ['name', 'command', 'purpose', 'criterionIds'],
      ),
    },
    {
      name: 'write_file',
      description: 'Atomically write a UTF-8 task file.',
      parameters: object({
        path: nonempty,
        content: { type: 'string', maxLength: 2 * 1024 * 1024 },
      }),
    },
    {
      name: 'delete_file',
      description: 'Delete one regular task file.',
      parameters: object({ path: nonempty }),
    },
    {
      name: 'run_check',
      description: 'Run an enabled additional user check by its saved ID.',
      parameters: object({ id }),
    },
    {
      name: 'finish_work',
      description:
        'Submit artifacts for Reviewer acceptance, not task completion. Cover all current criteria and reference host command IDs. unresolved must contain only blockers to completion; put scope notes and omitted optional checks in summary/evidence. Never omit real blockers.',
      parameters: object({
        summary: nonempty,
        completedSteps: array(nonempty),
        evidence: array(object(evidence), 40),
        unresolved: array(nonempty),
      }),
    },
  ];
}

export function toolArgumentError(
  call: ToolCall,
  path: string,
  expected: string,
  value: unknown,
): OperationError {
  const actual =
    value === undefined
      ? 'missing'
      : value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : typeof value;
  return new OperationError('toolArgumentsInvalid', {
    tool: call.name,
    callId: call.id,
    path: path.slice(0, 200),
    expected,
    actual,
  });
}
function shapeIssue(
  value: unknown,
  shape: Shape,
  path = '$',
): { path: string; expected: string; value: unknown } | undefined {
  if (valid(value, shape)) {
    return undefined;
  }
  if (shape.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of shape.required ?? []) {
      if (!Object.hasOwn(record, key)) {
        return { path: `${path}.${key}`, expected: shape.properties![key].type, value: undefined };
      }
    }
    for (const [key, item] of Object.entries(record)) {
      if (!Object.hasOwn(shape.properties!, key)) {
        return { path: `${path}.${key}`, expected: 'a declared parameter', value: item };
      }
      const issue = shapeIssue(item, shape.properties![key], `${path}.${key}`);
      if (issue) {
        return issue;
      }
    }
  }
  if (shape.type === 'array' && Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const issue = shapeIssue(value[index], shape.items!, `${path}[${index}]`);
      if (issue) {
        return issue;
      }
    }
  }
  const constraints = [
    shape.type,
    shape.enum && `one of ${shape.enum.join(', ')}`,
    shape.minimum !== undefined && `minimum ${shape.minimum}`,
    shape.maximum !== undefined && `maximum ${shape.maximum}`,
    shape.minLength !== undefined && `minLength ${shape.minLength}`,
    shape.maxLength !== undefined && `maxLength ${shape.maxLength}`,
    shape.minItems !== undefined && `minItems ${shape.minItems}`,
    shape.maxItems !== undefined && `maxItems ${shape.maxItems}`,
    shape.pattern && `pattern ${shape.pattern}`,
    shape.type === 'string' && 'without NUL',
  ].filter(Boolean);
  return { path, expected: constraints.join('; '), value };
}
// Validate the entire tool batch before the service executes any side effects.
interface Shape {
  type: string;
  properties?: Record<string, Shape>;
  required?: string[];
  items?: Shape;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  pattern?: string;
}
function valid(value: unknown, s: Shape): boolean {
  if (s.enum && !s.enum.includes(value)) {
    return false;
  }
  if (s.type === 'string') {
    return (
      typeof value === 'string' &&
      !value.includes('\0') &&
      value.length <= (s.maxLength ?? 12000) &&
      value.trim().length >= (s.minLength ?? 0) &&
      (!s.pattern || new RegExp(s.pattern).test(value))
    );
  }
  if (s.type === 'integer') {
    return (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= (s.minimum ?? 0) &&
      value <= (s.maximum ?? Number.MAX_SAFE_INTEGER)
    );
  }
  if (s.type === 'number') {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= (s.minimum ?? -Number.MAX_VALUE) &&
      value <= (s.maximum ?? Number.MAX_VALUE)
    );
  }
  if (s.type === 'boolean') {
    return typeof value === 'boolean';
  }
  if (s.type === 'array') {
    return (
      Array.isArray(value) &&
      value.length >= (s.minItems ?? 0) &&
      value.length <= (s.maxItems ?? 40) &&
      value.every((item) => valid(item, s.items!))
    );
  }
  if (s.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const v = value as Record<string, unknown>;
    return (
      (s.required || []).every((k) => Object.hasOwn(v, k)) &&
      Object.entries(v).every(
        ([k, x]) => Object.hasOwn(s.properties!, k) && valid(x, s.properties![k]),
      )
    );
  }
  return false;
}
export function validateTool(
  call: ToolCall,
  definitions: ToolDefinition[],
): Record<string, unknown> {
  const definition = definitions.find((t) => t.name === call.name);
  if (!definition) {
    throw new OperationError('toolNotAllowed');
  }
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    throw toolArgumentError(call, '$', 'a JSON object', call.arguments);
  }
  const issue = shapeIssue(args, definition.parameters as unknown as Shape);
  if (issue) {
    throw toolArgumentError(call, issue.path, issue.expected, issue.value);
  }
  return args as Record<string, unknown>;
}
export function validatePlan(input: PlanInput, previous?: TaskPlan): TaskPlan {
  if (
    !valid(input, plan as unknown as Shape) ||
    new Set(input.criteria.map((c) => c.id)).size !== input.criteria.length ||
    input.criteria.some((c) => c.verification === 'reading' && !c.reason.trim())
  ) {
    throw new OperationError('planInvalid');
  }
  if (
    previous &&
    (!input.revisionReason.trim() ||
      previous.criteria.some(
        (c) => !input.criteria.some((n) => n.id === c.id && n.verification === c.verification),
      ))
  ) {
    throw new OperationError('planRevisionInvalid');
  }
  return { ...structuredClone(input), version: (previous?.version ?? 0) + 1 };
}
export function validateSubmission(
  submission: WorkSubmission,
  _plan: TaskPlan,
  _commands: Map<string, CommandEvidence>,
) {
  if (!Array.isArray(submission.evidence) || submission.evidence.length > 40) {
    throw new OperationError('evidenceInvalid');
  }
}
export function validateReview(review: ReviewResult, plan: TaskPlan, feedback: boolean) {
  if (
    !['pass', 'fail'].includes(review.verdict) ||
    !['low', 'medium', 'high'].includes(review.risk ?? '') ||
    !Number.isFinite(review.confidence) ||
    review.confidence! < 0 ||
    review.confidence! > 1 ||
    !Array.isArray(review.issues) ||
    !Array.isArray(review.evidence) ||
    typeof review.reasoning !== 'string' ||
    !review.summary.trim() ||
    !review.nextStep ||
    !['continue', 'finish'].includes(review.nextStep.action) ||
    typeof review.nextStep.instructions !== 'string'
  ) {
    throw new OperationError('reviewIncomplete');
  }
  if (review.verdict === 'fail' && review.nextStep.action !== 'continue') {
    throw new OperationError('reviewIncomplete');
  }
  if (review.nextStep.action === 'continue') {
    if (!review.nextPlan) {
      throw new OperationError('reviewIncomplete');
    }
    validatePlan(review.nextPlan, plan);
  } else if (
    review.verdict !== 'pass' ||
    review.nextPlan ||
    review.confidence! < 0.8 ||
    review.completionMarker !== true
  ) {
    throw new OperationError('reviewFinishInvalid');
  }
  if (review.nextStep.action === 'finish' && feedback) {
    throw new OperationError('feedbackPending');
  }
}
