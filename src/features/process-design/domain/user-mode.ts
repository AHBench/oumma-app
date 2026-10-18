import { useSyncExternalStore } from 'react';
import type { User } from '../../auth/domain/entities/user';
import { isDesigner } from './designer-gate';

/**
 * User mode (Designer vs Normal) — a user who has the `Designer` Keycloak
 * group can choose at login how to use the app:
 *
 *  - "designer": full designer experience (Process Design menu, design
 *    landing page, designer workspace)
 *  - "normal":   the regular user experience — designer surfaces are hidden
 *    even though the account is allowed to use them
 *
 * The choice is made in the orientation dialog that appears right after
 * login (only once per account — persisted in localStorage) and can be
 * changed any time from the user menu.
 */
export type UserMode = 'designer' | 'normal';

const STORAGE_KEY = 'oumma-user-mode';

let cache: UserMode | null = read();
const subscribers = new Set<() => void>();

function read(): UserMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'designer' || v === 'normal' ? v : null;
  } catch {
    return null;
  }
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function getMode(): UserMode | null {
  return cache;
}

export function setMode(mode: UserMode): void {
  cache = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  subscribers.forEach((fn) => fn());
}

/** Forgets the stored mode so the orientation dialog shows again
 *  (called after every login for Designer accounts). */
export function clearMode(): void {
  cache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  subscribers.forEach((fn) => fn());
}

export function useMode(): UserMode | null {
  return useSyncExternalStore(subscribe, getMode);
}

/**
 * Effective designer: the token carries the Designer group AND the user's
 * chosen mode is not "normal". Non-designer accounts are never designers
 * regardless of a stale mode choice.
 */
export function effectiveDesigner(user: User | null, mode: UserMode | null = getMode()): boolean {
  return isDesigner(user) && mode !== 'normal';
}
