import { useTranslation } from 'react-i18next';
import { useTokenUsage } from '../hooks/use-queries';

/**
 * Small "tokens used" pill for the top-right corner of content areas.
 * Shows tokens + the USD cost (flat cost per LLM call).
 * With instanceId: the selected dossier's usage; without: the whole
 * process (every instance) — used by the workspace when no dossier is
 * selected and by the designer view.
 */
export function TokenUsageBadge({
  processId,
  instanceId,
  token,
  bare = false,
}: {
  processId: string | null;
  instanceId?: string | null;
  token: string | null;
  /** bare: no own border/background — for embedding inside a bordered
      container (e.g. the create-dossier toolbar field). */
  bare?: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useTokenUsage({ processId, instanceId, token });
  if (!data || data.total_tokens <= 0) return null;
  const cost = data.cost_usd ?? 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-(--app-fs-small) text-muted ${
        bare ? '' : 'rounded-(--app-radius) border border-separator bg-surface px-2 py-1'
      }`}
      title={t('tokenUsageTitle', {
        p: data.prompt_tokens.toLocaleString(),
        c: data.completion_tokens.toLocaleString(),
        n: data.calls,
      })}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 text-(--accent)">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
      {data.total_tokens.toLocaleString()} {t('tokenUsage')}
      {cost > 0 ? <span className="text-foreground/70">· ${cost.toFixed(4)}</span> : null}
    </span>
  );
}
