import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SETTLED_INSTANCE_STATUSES, useProcessTimeline } from '../../../shared/hooks/use-queries';
import { Spinner } from '../../../shared/components/ui';
import { WorkflowLine } from './WorkflowLine';

/**
 * Live progress of an Oumma instance: polls the execution timeline every
 * 3s (useProcessTimeline) — dense workflow line growing as the engine
 * routes — until the instance settles (paused on a human task, or a
 * terminal state), then shows `settledLabel`. Optionally auto-closes
 * after `autoCloseMs`.
 *
 * Used after launching a pending form (MyPendingFormsTab) and after
 * completing a task (TaskView) — in both cases the UI waits for the
 * engine's result while showing its progress.
 */
export function ProcessProgressPanel({
  processId,
  instanceId,
  token,
  runningLabel,
  settledLabel,
  autoCloseMs = 0,
  onClose,
}: {
  processId: string;
  instanceId: string;
  token: string;
  /** Shown while the engine is still running. */
  runningLabel: string;
  /** Shown once the instance settles, with the settled status and the
   *  current (paused-on) task name, if any. */
  settledLabel(status: string, currentTask: string | null): string;
  /** > 0: auto-invoke `onClose` this many ms after settling. */
  autoCloseMs?: number;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { data: timeline } = useProcessTimeline({ processId, instanceId, token });
  const status = timeline?.instanceStatus ?? null;
  const settled = status != null && SETTLED_INSTANCE_STATUSES.has(status);
  const current = timeline?.steps.find((s) => s.state === 'running' || s.state === 'waiting') ?? null;

  useEffect(() => {
    if (!settled || autoCloseMs <= 0 || !onClose) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [settled, autoCloseMs, onClose]);

  return (
    <div className="rounded-(--app-radius-xs) border border-separator px-2 py-1.5">
      <div className="mb-1 flex items-center gap-2">
        {settled ? (
          <span className={status === 'FAILED' || status === 'ABORTED' ? 'text-(--error)' : 'text-(--success)'}>
            <CheckCircleIcon />
          </span>
        ) : (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
        )}
        <span className="text-(--app-fs-base) font-semibold">
          {settled && status != null
            ? settledLabel(status, current ? current.taskName.replaceAll('_', ' ') : null)
            : runningLabel}
        </span>
        <span className="font-mono text-(--app-fs-tiny) text-muted">{instanceId.slice(0, 8)}</span>
        {status ? (
          <span className="rounded-(--app-radius-xs) border border-separator px-1.5 font-mono text-(--app-fs-tiny) text-muted">
            {status}
          </span>
        ) : null}
        {onClose ? (
          <button className="ms-auto text-(--app-fs-small) text-muted hover:underline" onClick={onClose}>
            {t('close')}
          </button>
        ) : null}
      </div>
      {timeline && timeline.steps.length > 0 ? <WorkflowLine timeline={timeline} /> : <Spinner />}
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
