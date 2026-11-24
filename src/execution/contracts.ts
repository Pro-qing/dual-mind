import { OperationError, type EvidenceFailureReason } from '../shared/errors';
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
      name: 'run_command',
      description:
        'Execute a task-related command in the host-selected shell. Each call is independent; combine activation and work in this call. Wait for foreground completion; surviving background children are stopped and the command fails. Prepare project dependencies as needed; do not install user or system toolchains. Verification must reference current command criteria. cwd is relative to the task, defaults to dot. Timeout defaults to 180 seconds. Commands run as the user, without an OS sandbox.',
      parameters: object(
        {
          name: { ...nonempty, maxLength: 200 },
          command: nonempty,
          cwd: { ...nonempty, maxLength: 2048 },
          purpose: {
            type: 'string',
            enum:
              phase === 'planning' || phase === 'answering'
                ? ['explore']
                : ['prepare', 'verify', 'explore'],
          },
          criterionIds: array(id, 40),
          timeoutSeconds: { type: 'integer', minimum: 10, maximum: 900 },
        },
        ['name', 'command', 'purpose', 'criterionIds'],
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
          'Accept actual artifacts against every criterion, or reject and issue the next executable plan. Retain existing criterion IDs and verification methods. Never approve missing, failed or stale command evidence.',
        parameters: object(
          {
            verdict: { type: 'string', enum: ['approve', 'changes_requested'] },
            summary: nonempty,
            acceptance: array(object({ ...evidence, passed: { type: 'boolean' } }), 40, 1),
            nextPlan: plan,
          },
          ['verdict', 'summary', 'acceptance'],
        ),
      },
    ];
  }
  return [
    ...read,
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
        evidence: array(object(evidence), 40, 1),
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
function covers(plan: TaskPlan, evidence: { criterionId: string }[]) {
  return (
    evidence.length === plan.criteria.length &&
    new Set(evidence.map((e) => e.criterionId)).size === evidence.length &&
    plan.criteria.every((c) => evidence.some((e) => e.criterionId === c.id))
  );
}
export function validateSubmission(
  submission: WorkSubmission,
  plan: TaskPlan,
  commands: Map<string, CommandEvidence>,
) {
  if (!covers(plan, submission.evidence)) {
    throw new OperationError('evidenceInvalid', { reason: 'coverage' });
  }
  for (const e of submission.evidence) {
    for (const id of e.commandIds) {
      const c = commands.get(id);
      if (!c || c.planVersion !== plan.version) {
        throw new OperationError('evidenceInvalid', {
          reason: c ? 'commandPlan' : 'commandMissing',
          criterionId: e.criterionId,
          commandId: id,
          expected: plan.version,
          actual: c?.planVersion ?? 'missing',
        });
      }
    }
  }
}
export function validateReview(
  review: ReviewResult,
  plan: TaskPlan,
  submission: WorkSubmission,
  commands: Map<string, CommandEvidence>,
  revision: string,
  additional: CommandEvidence[],
  feedback: boolean,
) {
  if (!covers(plan, review.acceptance)) {
    throw new OperationError('reviewIncomplete');
  }
  if (review.verdict === 'changes_requested') {
    if (!review.nextPlan) {
      throw new OperationError('reviewIncomplete');
    }
    validatePlan(review.nextPlan, plan);
  }
  if (
    review.verdict === 'approve' &&
    (review.nextPlan || review.acceptance.some((e) => !e.passed))
  ) {
    throw new OperationError('reviewIncomplete');
  }
  if (review.verdict === 'approve' && feedback) {
    throw new OperationError('feedbackPending');
  }
  const success = (c: CommandEvidence | undefined) =>
    c &&
    c.ok &&
    c.exitCode === 0 &&
    !c.reason &&
    !c.fault &&
    c.planVersion === plan.version &&
    c.before === revision &&
    c.after === revision;
  const reject = (
    reason: EvidenceFailureReason,
    params: Record<string, string | number> = {},
  ): never => {
    throw new OperationError('evidenceInvalid', { reason, ...params });
  };
  const checkCommand = (c: CommandEvidence | undefined, commandId: string, criterionId: string) => {
    const context = { commandId, criterionId };
    if (!c) {
      return reject('commandMissing', context);
    }
    if (!c.ok || c.exitCode !== 0 || c.reason || c.fault) {
      return reject('commandFailed', context);
    }
    if (c.planVersion !== plan.version) {
      return reject('commandPlan', { ...context, expected: plan.version, actual: c.planVersion });
    }
    if (c.before !== revision || c.after !== revision) {
      return reject('commandRevision', {
        ...context,
        expected: revision,
        actual: `${c.before} → ${c.after}`,
      });
    }
  };
  if (review.verdict === 'approve') {
    if (submission.unresolved.length) {
      reject('unresolved', { blockers: submission.unresolved.join('\n') });
    }
    if (submission.revision !== revision) {
      reject('submissionRevision', { expected: revision, actual: submission.revision });
    }
    for (const c of additional) {
      if (!success(c)) {
        reject('additionalCheck', { commandId: c.id });
      }
    }
  }
  for (const criterion of plan.criteria) {
    const e = review.acceptance.find((e) => e.criterionId === criterion.id)!;
    if (!e.passed) {
      continue;
    }
    if (submission.revision !== revision) {
      reject('submissionRevision', {
        criterionId: criterion.id,
        expected: revision,
        actual: submission.revision,
      });
    }
    const work = submission.evidence.find((e) => e.criterionId === criterion.id)!;
    if (criterion.verification === 'command') {
      if (!e.commandIds.length) {
        reject('commandRequired', { criterionId: criterion.id });
      }
      for (const id of e.commandIds) {
        const c = commands.get(id);
        checkCommand(c, id, criterion.id);
        const context = { criterionId: criterion.id, commandId: id };
        if (
          !work?.commandIds.includes(id) &&
          !(c?.agent === 'reviewer' && c.phase === 'reviewer')
        ) {
          reject('commandSource', context);
        }
        if (c!.purpose !== 'verify') {
          reject('commandPurpose', { ...context, actual: c!.purpose });
        }
        if (!c!.criterionIds.includes(criterion.id)) {
          reject('commandCriterion', context);
        }
      }
    }
    if (criterion.verification === 'command') {
      const latest = [...commands.values()]
        .filter(
          (c) =>
            c.planVersion === plan.version &&
            c.purpose === 'verify' &&
            c.criterionIds.includes(criterion.id),
        )
        .at(-1);
      if (!latest || !success(latest) || !e.commandIds.includes(latest.id)) {
        reject('latestVerification', {
          criterionId: criterion.id,
          commandId: latest?.id ?? 'missing',
        });
      }
    }
    if (criterion.verification === 'reading' && !e.evidence.trim()) {
      reject('readingRequired', { criterionId: criterion.id });
    }
  }
}
