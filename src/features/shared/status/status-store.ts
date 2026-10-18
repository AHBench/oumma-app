import { useSyncExternalStore } from 'react';
import i18next from 'i18next';
import type { SearchItem } from '../../process-forms/data/models/form-model';

/**
 * App-wide status-bar state (bottom of the window).
 *
 * Two content sources, activity wins:
 *  1. BACKGROUND ACTIVITY — components report what the model/engine is
 *     doing right now ("Thinking", "Reading document…"); the bar shows an
 *     animated ellipsis while non-null.
 *  2. HOVER HINTS — when idle, the bar shows a short tip for the action
 *     the user is hovering. Hints are resolved, in order, from the
 *     process' search-items catalog (kind "hint", language-context
 *     labels), the i18n `statusHints` table, then the element's own
 *     title attribute.
 */
export interface StatusState {
  /** Non-null while background work is running (e.g. the model thinks). */
  activity: string | null;
  /** Hovered action's hint (raw resolved text, or null when none). */
  hoverHint: string | null;
}

let activity: string | null = null;
let hoverHint: string | null = null;
/** Search-items catalog of the current process (hint labels). */
let searchItems: SearchItem[] = [];
const listeners = new Set<() => void>();
// Cached snapshot: useSyncExternalStore requires a stable reference
// between changes (a fresh object per call would loop forever).
let cachedState: StatusState = { activity, hoverHint };

function emit(): void {
  cachedState = { activity, hoverHint };
  for (const l of listeners) l();
}

export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function currentState(): StatusState {
  return cachedState;
}

/** Report a background activity (null clears it). */
export function setStatusActivity(label: string | null): void {
  if (activity === label) return;
  activity = label;
  emit();
}

/** Report the hovered action's tip (null when leaving). */
export function setStatusHoverHint(hint: string | null): void {
  if (hoverHint === hint) return;
  hoverHint = hint;
  emit();
}

/** Update the search-items catalog used to resolve `hint.*` keys. */
export function setStatusSearchItems(items: SearchItem[] | null | undefined): void {
  searchItems = items ?? [];
  emit();
}

/** Resolve a `data-status-hint` attribute value to display text. */
export function resolveStatusHint(value: string | null | undefined, lang: string): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('hint.')) {
    const key = v.slice('hint.'.length);
    for (const item of searchItems) {
      if ((item.fieldName ?? '').trim().toLowerCase() === key.toLowerCase()) {
        const label =
          lang === 'ar' ? item.fieldLabelAr : lang === 'fr' ? item.fieldLabelFr : item.fieldLabelEn;
        if (label && label.trim()) return label.trim();
      }
    }
    // i18n fallback: statusHints.<key>
    const translated = i18next.t(`statusHints.${key}`, { defaultValue: '' });
    if (translated) return translated;
    return key;
  }
  return v;
}

export function useStatusState(): StatusState {
  return useSyncExternalStore(subscribeStatus, currentState, currentState);
}
