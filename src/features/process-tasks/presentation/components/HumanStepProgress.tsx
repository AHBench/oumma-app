import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessTimeline, TimelineStep } from '../../../process-audit/data/models/audit-models';

const norm = (v: unknown) => String(v ?? '').replace(/_/g, ' ').trim().toLowerCase();

/**
 * Human→human step progress — shown in the task modal right after a human
 * task is completed. Renders the completed human step, the intermediate
 * system/tool steps (DISPLAY ONLY — engine behavior is untouched) and the
 * next human step awaiting action. The timeline query already polls every
 * 3s while the instance is running, so the strip live-updates from
 * "validating…" to "waiting at manual review".
 */
export function HumanStepProgress({
  timeline,
  completedTask,
  onClose,
}: {
  timeline: ProcessTimeline;
  completedTask: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const segment = useMemo(() => {
    const nodes = [...timeline.steps].sort((a, b) => a.order - b.order);
    const from = nodes.findIndex((n) => norm(n.taskName) === norm(completedTask));
    if (from < 0) return null;
    // Extend to the NEXT human step (or the end of the known topology).
    let end = nodes.length - 1;
    for (let i = from + 1; i < nodes.length; i++) {
      if (nodes[i].kind === 'human') {
        end = i;
        break;
      }
    }
    return nodes.slice(from, end + 1);
  }, [timeline.steps, completedTask]);

  if (!segment) return null;
  const terminal = timeline.instanceStatus === 'COMPLETED' || timeline.instanceStatus === 'ABORTED';

  return (
    <div className="rounded-(--app-radius) border border-separator bg-surface px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-(--app-fs-small) font-semibold text-muted">{t('humanStepProgress')}</span>
        <button className="text-(--app-fs-small) text-muted hover:text-foreground" onClick={onClose}>
          {t('dismiss')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-y-1">
        {segment.map((n, i) => (
          <span key={n.id} className="flex items-center">
            {i > 0 ? <span className="mx-1.5 text-muted">→</span> : null}
            <StepChip step={n} />
          </span>
        ))}
        {terminal ? (
          <span className="flex items-center">
            <span className="mx-1.5 text-muted">→</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-(--app-fs-small) text-emerald-600 dark:text-emerald-400">
              ✓ {t('notifInstanceCompleted')}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StepChip({ step }: { step: TimelineStep }) {
  const { t } = useTranslation();
  const label = step.taskName.replaceAll('_', ' ');
  const cls = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-(--app-fs-small)';
  if (step.state === 'completed') {
    return (
      <span className={`${cls} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}>
        ✓ {label}
        {step.kind === 'system' || step.kind === 'unknown' ? <SystemTag /> : null}
      </span>
    );
  }
  if (step.state === 'failed') {
    return (
      <span className={`${cls} bg-red-500/10 text-red-600 dark:text-red-400`}>
        ✕ {label}
        {step.kind === 'system' || step.kind === 'unknown' ? <SystemTag /> : null}
      </span>
    );
  }
  if (step.state === 'running') {
    return (
      <span className={`${cls} bg-sky-500/10 text-sky-600 dark:text-sky-400`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
        {label}
        {step.kind === 'system' || step.kind === 'unknown' ? <SystemTag /> : null}
      </span>
    );
  }
  if (step.state === 'waiting') {
    return (
      <span className={`${cls} font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400`}>
        {label} — {t('timelineWaiting')}
      </span>
    );
  }
  return (
    <span className={`${cls} text-muted opacity-70`}>
      {label}
      {step.kind === 'system' || step.kind === 'unknown' ? <SystemTag /> : null}
    </span>
  );
}

function SystemTag() {
  const { t } = useTranslation();
  return <span className="opacity-60">({t('systemStepTag')})</span>;
}
