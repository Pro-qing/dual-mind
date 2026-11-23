import type { CommandEvidence, RunSummary } from './execution';
/** Historical probe errors are not acceptance blockers. Never infer acceptance from a UI error total. */
export function acceptanceBlockers(
  run: RunSummary | undefined,
  commands: CommandEvidence[],
): string[] {
  if (!run?.plan || !run.submission) {
    return [];
  }
  const revision = run.submission.revision;
  const valid = (c?: CommandEvidence) =>
    Boolean(
      c &&
      c.ok &&
      c.exitCode === 0 &&
      !c.fault &&
      !c.reason &&
      c.before === revision &&
      c.after === revision &&
      c.planVersion === run.plan!.version,
    );
  const current = commands.filter((c) => c.planVersion === run.plan!.version);
  const blockers = run.plan.criteria
    .filter(
      (c) =>
        c.verification === 'command' &&
        !valid(
          current
            .filter((cmd) => cmd.purpose === 'verify' && cmd.criterionIds.includes(c.id))
            .at(-1),
        ),
    )
    .map((c) => c.id);
  const presets = new Map<string, CommandEvidence>();
  current
    .filter((c) => c.phase === 'checking' && c.round === run.round)
    .forEach((c) => presets.set(c.presetId ?? c.id, c));
  for (const [id, check] of presets) {
    if (!valid(check)) {
      blockers.push(id);
    }
  }
  if (run.submission.unresolved.length) {
    blockers.push('unresolved');
  }
  return [...new Set(blockers)];
}
