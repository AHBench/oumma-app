import { useMemo, useState } from 'react';
import { Tooltip } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import type { ProcessTimeline, TimelineStep } from '../../../process-audit/data/models/audit-models';

/**
 * Process timeline — dense horizontal line built from the Oumma execution
 * data (GET /track × /taskshist × /llm_logs, merged by
 * `OummaAuditDataSource.getProcessTimeline`):
 *
 * - one compact node per task visited (start / human / system / end),
 *   auto-scroll centered on the current step
 * - each node: status icon, name, the HUMAN task's owner, and a compact
 *   start → end line ("in progress" while open)
 * - SYSTEM steps are shown too, with a "called correctly" ✓ / failed ✗ mark
 *   (taskshist state + the prepare_input LLM error)
 * - the connector between two steps carries the LLM routing decision:
 *   hover shows the reasoning, target task, model, duration and any error
 * - hovering a node shows its details (kind, state, owner, dates, and for
 *   system steps the prepare_input call)
 */

const STEP_MIN_WIDTH = 112;

/** dd/MM HH:mm — dense (e.g. 14/10 16:44). */
function short(dt: string): string {
  const d = new Date(dt);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** dd/MM/yyyy HH:mm — tooltips. */
function full(dt: string): string {
  const d = new Date(dt);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

function stepColor(step: TimelineStep): string {
  switch (step.state) {
    case 'completed': return 'var(--success)';
    case 'failed': return 'var(--danger)';
    case 'running':
    case 'waiting': return 'var(--accent)';
    default: return 'var(--muted)';
  }
}

const KIND_KEYS: Record<TimelineStep['kind'], string> = {
  start: 'StartNode',
  human: 'HumanTaskNode',
  system: 'ServiceTaskNode',
  end: 'EndNode',
  unknown: '',
};

function StepIcon({ step }: { step: TimelineStep }) {
  const color = stepColor(step);
  if (step.state === 'failed') {
    return (
      <div className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full"
        style={{ border: `2px solid ${color}`, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="4" className="h-2 w-2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (step.state === 'completed') {
    return (
      <div className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full"
        style={{ border: `2px solid ${color}`, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="4" className="h-2 w-2">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (step.kind === 'system') {
    return (
      <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
        style={{ border: `1.5px dashed ${color}` }}>
        <svg viewBox="0 0 24 24" fill={color} className="h-2 w-2">
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L16 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 9 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1c.6.5 1.3.9 2 1.2L12 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" />
        </svg>
      </div>
    );
  }
  // human / start / end / unknown — running|waiting|pending
  return (
    <div className="h-3 w-3 shrink-0 rounded-full"
      style={{
        border: `2px solid ${color}`,
        backgroundColor: step.state === 'pending' ? 'transparent' : `color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    />
  );
}

/** Rich tooltip: the LLM routing decision on the connector into [step]. */
function DecisionTooltip({ step, t }: { step: TimelineStep; t: (k: string) => string }) {
  const d = step.decision;
  if (!d) return null;
  return (
    <div className="max-w-72 space-y-1.5 text-start">
      <div className="flex items-center gap-1.5 font-semibold">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 shrink-0">
          <path d="M12 2 9.9 9.9 2 12l7.9 2.1L12 22l2.1-7.9L22 12l-7.9-2.1L12 2Z" />
        </svg>
        {t('timelineDecision')}
      </div>
      <div className="text-(--app-fs-small) opacity-90">
        {d.fromTask.replaceAll('_', ' ')} → {d.toTask.replaceAll('_', ' ')}
      </div>
      {d.reasoning ? (
        <div>
          <div className="text-(--app-fs-small) opacity-70">{t('timelineReasoning')}</div>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap text-(--app-fs-small)">{d.reasoning}</div>
        </div>
      ) : null}
      {d.model ? (
        <div className="text-(--app-fs-small) opacity-80">
          {t('timelineModel')}: {d.model}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-3 text-(--app-fs-small) opacity-80">
        {typeof d.durationMs === 'number' && d.durationMs > 0 ? (
          <span>{t('timelineDuration')}: {(d.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
        {d.at ? <span>{full(d.at)}</span> : null}
      </div>
      {d.overrideApplied ? (
        <div className="rounded-(--app-radius) border border-current px-1.5 py-0.5 text-(--app-fs-small)">
          {t('timelineOverride')}
        </div>
      ) : null}
      {d.error ? (
        <div className="whitespace-pre-wrap text-(--app-fs-small) text-(--danger)">{d.error}</div>
      ) : null}
    </div>
  );
}

function StepTooltip({ step, t }: { step: TimelineStep; t: (k: string) => string }) {
  const systemOk = step.kind === 'system' && step.state === 'completed' && !step.inputCall?.error;
  const systemBad = step.kind === 'system' && (step.state === 'failed' || !!step.inputCall?.error);
  return (
    <div className="max-w-72 space-y-1 text-start">
      <div className="font-semibold">{step.taskName.replaceAll('_', ' ')}</div>
      {KIND_KEYS[step.kind] ? (
        <div className="text-(--app-fs-small) opacity-80">{t(KIND_KEYS[step.kind])}</div>
      ) : null}
      {step.state === 'waiting' ? (
        <div className="text-(--app-fs-small) opacity-80">{t('timelineWaiting')}</div>
      ) : step.state === 'running' ? (
        <div className="text-(--app-fs-small) opacity-80">{t('inProgress')}</div>
      ) : step.state === 'failed' ? (
        <div className="text-(--app-fs-small) text-(--danger)">{t('timelineCallFailed')}</div>
      ) : step.state === 'completed' ? (
        <div className="text-(--app-fs-small) opacity-80">✓</div>
      ) : null}
      {step.owner ? (
        <div className="text-(--app-fs-small) opacity-80">
          {t('owner')}: {step.owner}
        </div>
      ) : null}
      {(step.startedAt || step.endedAt) ? (
        <div className="text-(--app-fs-small) opacity-80">
          {step.startedAt ? full(step.startedAt) : '—'} → {step.endedAt ? full(step.endedAt) : t('inProgress')}
        </div>
      ) : null}
      {step.kind === 'system' && systemOk ? (
        <div className="text-(--app-fs-small) text-(--success)">{t('timelineCalledOk')}</div>
      ) : null}
      {systemBad ? (
        <div className="space-y-0.5">
          <div className="text-(--app-fs-small) text-(--danger)">{t('timelineCallFailed')}</div>
          {step.inputCall?.error ? (
            <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-(--app-fs-small) text-(--danger)">
              {step.inputCall.error}
            </div>
          ) : null}
        </div>
      ) : null}
      {step.kind === 'system' && step.inputCall && !systemBad ? (
        <div className="text-(--app-fs-small) opacity-70">
          {step.inputCall.model ? `${step.inputCall.model} · ` : ''}
          {typeof step.inputCall.durationMs === 'number' && step.inputCall.durationMs > 0
            ? `${(step.inputCall.durationMs / 1000).toFixed(1)}s`
            : ''}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowLine({ timeline }: { timeline: ProcessTimeline }) {
  const { t } = useTranslation();
  const nodes = useMemo(
    () => [...timeline.steps].sort((a, b) => a.order - b.order),
    [timeline.steps],
  );

  // Default selection: the current (open) step, else the last one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdNow =
    selectedId && nodes.some((n) => n.id === selectedId)
      ? selectedId
      : (nodes.find((n) => n.state === 'running' || n.state === 'waiting') ?? nodes[nodes.length - 1])?.id ?? null;

  if (nodes.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-(--app-radius) border border-separator bg-surface">
      <div className="overflow-x-auto px-3 py-2">
        <div className="flex w-max items-start">
          {nodes.map((node, i) => {
            const isSelected = node.id === selectedIdNow;
            const color = stepColor(node);
            const systemOk = node.kind === 'system' && node.state === 'completed' && !node.inputCall?.error;
            const systemBad = node.kind === 'system' && (node.state === 'failed' || !!node.inputCall?.error);
            return (
              <div key={node.id} className="flex items-start">
                {/* Connector — carries the LLM decision that routed into this step */}
                {i > 0 ? (
                  <Tooltip.Root delay={250} closeDelay={150}>
                    <Tooltip.Trigger
                      className="mt-1.5 flex h-3 w-6 shrink-0 cursor-help items-center sm:w-8"
                      aria-label={`${node.taskName} — ${t('timelineDecision')}`}
                    >
                      <div
                        className="h-0.5 w-full"
                        style={{
                          backgroundColor: node.state === 'pending'
                            ? 'color-mix(in srgb, var(--muted) 25%, transparent)'
                            : `color-mix(in srgb, ${color} 55%, transparent)`,
                        }}
                      />
                      <svg viewBox="0 0 8 8" className="-ms-1 h-2 w-2" style={{ color: node.state === 'pending' ? 'var(--muted)' : color }}>
                        <path d="M0 0l8 4-8 4V0Z" fill="currentColor" />
                      </svg>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="max-w-72 text-(--app-fs-small)">
                      {node.decision ? <DecisionTooltip step={node} t={t} /> : <span>{node.taskName.replaceAll('_', ' ')}</span>}
                    </Tooltip.Content>
                  </Tooltip.Root>
                ) : null}

                {/* Step node */}
                <Tooltip.Root delay={250} closeDelay={150}>
                  <Tooltip.Trigger
                    className="shrink-0"
                    style={{ minWidth: STEP_MIN_WIDTH }}
                    aria-label={node.taskName}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(node.id)}
                      className="block w-full cursor-pointer rounded-(--app-radius) border px-1.5 py-1 text-start transition-colors"
                      style={{
                        backgroundColor: isSelected ? 'color-mix(in srgb, var(--muted) 8%, transparent)' : 'transparent',
                        borderColor: isSelected ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        <StepIcon step={node} />
                        <span className={`truncate text-(--app-fs-small) ${isSelected ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                          {node.taskName.replaceAll('_', ' ')}
                        </span>
                      </span>
                      {/* owner (human) / called-correctly mark (system) */}
                      <span className="mt-0.5 block truncate text-(--app-fs-small) text-muted">
                        {node.kind === 'system' ? (
                          systemBad ? `✗ ${t('timelineCallFailed')}` : systemOk ? `✓ ${t('timelineCalledOk')}` : t('inProgress')
                        ) : node.owner ? (
                          node.owner
                        ) : node.state === 'waiting' ? (
                          t('timelineWaiting')
                        ) : null}
                      </span>
                      {(node.startedAt || node.endedAt) ? (
                        <span className="mt-0.5 block whitespace-nowrap text-(--app-fs-small) text-muted" style={node.state === 'failed' ? { color: 'var(--danger)' } : undefined}>
                          {node.startedAt ? short(node.startedAt) : '—'} → {node.endedAt ? short(node.endedAt) : node.state === 'failed' ? '✗' : t('inProgress')}
                        </span>
                      ) : null}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="max-w-72 text-(--app-fs-small)">
                    <StepTooltip step={node} t={t} />
                  </Tooltip.Content>
                </Tooltip.Root>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
