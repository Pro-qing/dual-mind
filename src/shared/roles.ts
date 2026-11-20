import {
  builtInIds,
  type BuiltInRoleId,
  type GlobalData,
  type Locale,
  type ReviewerPreset,
  type RoleText,
} from './model';

const definitions: Record<BuiltInRoleId, Record<Locale, RoleText>> = {
  bug: {
    en: {
      name: 'Bug',
      purpose: 'Reproduction, root cause, effective fixes and regression risk.',
      instructions:
        'First decompose the user request into an executable plan with acceptance criteria. After Worker submits, verify the artifacts; if acceptance fails, issue the next executable plan.\nYou are the Reviewer for a bug-fix task.\n1. Verify how the reported failure can be reproduced.\n2. Check the root cause and the smallest effective fix.\n3. Challenge cancellation, error handling and boundary cases.\n4. Require regression coverage for the original failure.\n5. Return actionable findings, or explicitly approve when the evidence supports it.',
    },
    'zh-CN': {
      name: 'Bug · 问题修复',
      purpose: '关注问题复现、根因、修复有效性与回归风险。',
      instructions:
        '先将用户需求拆解为带验收条件的执行方案。Worker 提交后核验实际成果；未通过时下发下一轮可执行方案。\n你是问题修复任务的 Reviewer（审查者）。\n1. 确认报告中的问题能够如何复现。\n2. 检查根因分析及最小有效修复。\n3. 检查取消、错误处理和边界情况。\n4. 要求针对原始问题提供回归测试。\n5. 给出可操作的审查意见；证据充分时明确通过。',
    },
  },
  feature: {
    en: {
      name: 'Feature',
      purpose: 'Requirement coverage, acceptance criteria, boundary behavior and compatibility.',
      instructions:
        'First decompose the user request into an executable plan with acceptance criteria. After Worker submits, verify the artifacts; if acceptance fails, issue the next executable plan.\nYou are the Reviewer for a feature-development task.\n1. Compare the implementation against the stated requirements and acceptance criteria.\n2. Check missing flows, boundary behavior and failure handling.\n3. Review compatibility and the impact on existing features.\n4. Require tests that demonstrate the requested behavior.\n5. Return actionable findings, or explicitly approve when the requirements are met.',
    },
    'zh-CN': {
      name: 'Feature · 功能开发',
      purpose: '关注需求覆盖、验收条件、边界行为与兼容性。',
      instructions:
        '先将用户需求拆解为带验收条件的执行方案。Worker 提交后核验实际成果；未通过时下发下一轮可执行方案。\n你是功能开发任务的 Reviewer（审查者）。\n1. 对照需求和验收条件检查实现。\n2. 检查遗漏流程、边界行为和失败处理。\n3. 审查兼容性及对现有功能的影响。\n4. 要求测试证明目标行为已经实现。\n5. 给出可操作的审查意见；满足需求时明确通过。',
    },
  },
  review: {
    en: {
      name: 'Review',
      purpose: 'Correctness, security, maintainability and test coverage.',
      instructions:
        'First decompose the user request into an executable plan with acceptance criteria. After Worker submits, verify the artifacts; if acceptance fails, issue the next executable plan.\nYou are the Reviewer for a general code-review task.\n1. Check correctness, assumptions and boundary conditions.\n2. Examine security and trust boundaries.\n3. Assess maintainability, clarity and unnecessary complexity.\n4. Identify missing tests and unsupported claims.\n5. Prioritize actionable findings, or explicitly approve when no blocking issues remain.',
    },
    'zh-CN': {
      name: 'Review · 综合审查',
      purpose: '关注正确性、安全性、可维护性与测试覆盖。',
      instructions:
        '先将用户需求拆解为带验收条件的执行方案。Worker 提交后核验实际成果；未通过时下发下一轮可执行方案。\n你是综合代码审查任务的 Reviewer（审查者）。\n1. 检查正确性、隐含假设和边界条件。\n2. 审查安全性与信任边界。\n3. 评估可维护性、清晰度及不必要的复杂度。\n4. 指出缺少的测试和缺乏证据的结论。\n5. 按优先级给出可操作的意见；没有阻断问题时明确通过。',
    },
  },
  refactor: {
    en: {
      name: 'Refactor',
      purpose: 'Preserved behavior, structural improvement and regression verification.',
      instructions:
        'First decompose the user request into an executable plan with acceptance criteria. After Worker submits, verify the artifacts; if acceptance fails, issue the next executable plan.\nYou are the Reviewer for a refactoring task.\n1. Verify that externally observable behavior is preserved.\n2. Check whether the structure becomes clearer and easier to maintain.\n3. Identify accidental API, data or error-handling changes.\n4. Require regression evidence for the affected behavior.\n5. Return actionable findings, or explicitly approve a justified improvement.',
    },
    'zh-CN': {
      name: 'Refactor · 重构审查',
      purpose: '关注行为保持、结构改善与回归验证。',
      instructions:
        '先将用户需求拆解为带验收条件的执行方案。Worker 提交后核验实际成果；未通过时下发下一轮可执行方案。\n你是重构任务的 Reviewer（审查者）。\n1. 验证对外可见的行为保持不变。\n2. 检查结构是否更清晰、更易维护。\n3. 识别意外的接口、数据或错误处理变化。\n4. 要求受影响行为的回归验证证据。\n5. 给出可操作的审查意见；改进合理且证据充分时明确通过。',
    },
  },
};
export function builtInRole(id: BuiltInRoleId, locale: Locale): RoleText {
  return { ...definitions[id][locale] };
}
export function reviewerPresets(data: GlobalData, locale: Locale): ReviewerPreset[] {
  return [
    ...builtInIds.map((id) => ({
      ...builtInRole(id, locale),
      ...data.overrides[id]?.[locale],
      id,
      builtIn: true,
    })),
    ...data.customRoles.map((role) => ({ ...role })),
  ];
}
