import type { ExecutionDetail, RunSummary, TaskPlan } from '../../src/shared/execution';
import { useUI } from './context';
import { ErrorNotice } from './ErrorNotice';

export function PlanCard({ plan }: { plan: TaskPlan }) {
  const { tr } = useUI();
  return (
    <section className="plan-card" aria-label={tr('executionPlan')}>
      <h2>
        {tr('executionPlan')} · v{plan.version}
      </h2>
      <p>{plan.objective}</p>
      <p className="hint">{plan.requirements}</p>
      {plan.revisionReason && (
        <p>
          {tr('revisionReason')}: {plan.revisionReason}
        </p>
      )}
      <div className="plan-columns">
        <div>
          <h3>{tr('planSteps')}</h3>
          <ol>
            {plan.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <h3>{tr('acceptanceCriteria')}</h3>
          <ul>
            {plan.criteria.map((c) => (
              <li key={c.id}>
                <strong>
                  {c.id} · {c.description}
                </strong>
                <span className="evidence-method">
                  {tr(c.verification === 'command' ? 'commandVerification' : 'readingReview')}
                </span>
                <p>{c.evidence}</p>
                {c.reason && <p className="hint">{c.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
export function ExecutionDetailView({ detail }: { detail: ExecutionDetail }) {
  const { tr, snapshot } = useUI();
  if (detail.type === 'plan') {
    return <PlanCard plan={detail.plan} />;
  }
  if (detail.type === 'command') {
    const c = detail.command;
    return (
      <div className="command-evidence">
        <strong>
          {c.name} ·{' '}
          {tr(
            c.purpose === 'verify'
              ? 'commandVerification'
              : c.purpose === 'prepare'
                ? 'commandPreparation'
                : 'commandExploration',
          )}
        </strong>
        <p>
          {tr('commandResult')}: {tr(c.ok ? 'commandPassed' : 'commandNotPassed')} ·{' '}
          {tr('planVersion')} {c.planVersion} · {tr('exitCode')} {c.exitCode}
        </p>
        <pre>
          {c.program} {c.args.map((arg) => JSON.stringify(arg)).join(' ')}
          {'\n'}
          {tr('commandCwd')}: {c.cwd}
          {'\n'}
          {tr('evidenceId')}: {c.id}
        </pre>
        {c.fault && <ErrorNotice error={c.fault} locale={snapshot.locale} />}
      </div>
    );
  }
  if (detail.type === 'submission') {
    const s = detail.submission;
    return (
      <section className="handoff-card">
        <h3>
          {tr('workSubmission')} · v{s.planVersion}
        </h3>
        <p>{s.summary}</p>
        <ul>
          {s.completedSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
        {s.evidence.map((e) => (
          <p key={e.criterionId}>
            {e.criterionId}: {e.evidence}
            {e.commandIds.length > 0 && (
              <small>
                {' '}
                {tr('evidenceId')}: {e.commandIds.join(', ')}
              </small>
            )}
          </p>
        ))}
        {s.unresolved.length > 0 && (
          <>
            <h4>{tr('unresolvedWork')}</h4>
            <ul>
              {s.unresolved.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }
  const r = detail.review;
  return (
    <section className="handoff-card">
      <h3>
        {tr(r.verdict === 'approve' ? 'reviewApproved' : 'reviewChanges')} · v{r.planVersion}
      </h3>
      <p>{r.summary}</p>
      <ul>
        {r.acceptance.map((e) => (
          <li key={e.criterionId}>
            <strong>
              {e.criterionId} · {tr(e.passed ? 'criterionPassed' : 'criterionNotPassed')}
            </strong>
            <p>{e.evidence}</p>
          </li>
        ))}
      </ul>
      {r.nextPlan && (
        <p>
          {tr('nextPlan')}: {r.nextPlan.objective}
        </p>
      )}
    </section>
  );
}
export function RunOverview({ run }: { run?: RunSummary }) {
  const { tr } = useUI();
  if (!run?.plan) {
    return (
      <p className="hint">{tr(run?.status === 'planning' ? 'planningHint' : 'cycleStartHint')}</p>
    );
  }
  return (
    <>
      <PlanCard plan={run.plan} />
      {run.review && <ExecutionDetailView detail={{ type: 'review', review: run.review }} />}
    </>
  );
}
