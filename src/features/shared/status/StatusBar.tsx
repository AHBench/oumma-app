import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useStatusState,
  setStatusHoverHint,
  resolveStatusHint,
} from './status-store';

/**
 * App-wide status bar (bottom of the window).
 *
 * - Background activity (model thinking, document reading…): the label
 *   with an animated ellipsis ("Thinking…").
 * - Idle: a short tip for the action the user is hovering. Hints come
 *   from `data-status-hint` attributes — `hint.<key>` values are resolved
 *   through the process' search-items catalog (language context), then
 *   the i18n `statusHints` table, then the element's title.
 */
export function StatusBar() {
  const { t, i18n } = useTranslation();
  const { activity, hoverHint } = useStatusState();
  const [dots, setDots] = useState(1);

  // Animated ellipsis while an activity is running.
  useEffect(() => {
    if (!activity) return;
    setDots(1);
    const id = window.setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => window.clearInterval(id);
  }, [activity]);

  // Delegated hover tracking: the nearest [data-status-hint] (or [title])
  // of the pointer target provides the tip.
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-status-hint],[title]') as
        | HTMLElement
        | null;
      const value = el?.getAttribute('data-status-hint') ?? el?.getAttribute('title');
      setStatusHoverHint(resolveStatusHint(value, i18n.resolvedLanguage ?? 'en'));
    };
    const onOut = (e: MouseEvent) => {
      const from = e.target as Element | null;
      const to = e.relatedTarget as Element | null;
      const had = from?.closest?.('[data-status-hint],[title]');
      const has = to?.closest?.('[data-status-hint],[title]');
      if (had && had !== has) setStatusHoverHint(null);
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, [i18n.resolvedLanguage]);

  const text = activity
    ? `${activity}${'.'.repeat(dots)}`
    : (hoverHint ?? t('statusReady'));

  return (
    <div
      className="flex h-6 shrink-0 items-center gap-2 border-t border-separator bg-surface px-3 text-(--app-fs-small) text-muted"
      role="status"
      aria-live="polite"
    >
      {activity ? (
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-(--accent)" />
      ) : (
        <span className="inline-block h-2 w-2 rounded-full bg-separator" />
      )}
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </div>
  );
}
