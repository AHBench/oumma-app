import { useSyncExternalStore } from 'react';
import type { AppNotification } from './notification-model';

const ITEMS_KEY = 'oumma-notifications-items';
const EMITTED_KEY = 'oumma-notifications-emitted';
const MAX_ITEMS = 50;
const MAX_EMITTED = 500;

function loadItems(): AppNotification[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
  } catch {
    return [];
  }
}

function loadEmitted(): Set<string> {
  try {
    const raw = localStorage.getItem(EMITTED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

let items: AppNotification[] = loadItems();
const emitted = loadEmitted();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    localStorage.setItem(EMITTED_KEY, JSON.stringify([...emitted]));
  } catch {
    // storage unavailable (private mode) — notifications stay in-memory
  }
}

function commit(): void {
  persist();
  for (const fn of listeners) fn();
}

/**
 * Module-level notification store — survives route changes (the AppShell
 * unmounts/remounts between the process list and the workspace).
 */
export const notificationStore = {
  getItems(): readonly AppNotification[] {
    return items;
  },

  getUnreadCount(): number {
    return items.filter((n) => !n.read).length;
  },

  /**
   * Adds candidate notifications, dropping ids already emitted (dedupe
   * across polls and reloads). Returns the ones actually added.
   */
  addMany(candidates: AppNotification[]): AppNotification[] {
    const fresh = candidates.filter((n) => !emitted.has(n.id));
    if (fresh.length === 0) return [];
    for (const n of fresh) {
      emitted.add(n.id);
      if (emitted.size > MAX_EMITTED) {
        const oldest = emitted.values().next().value;
        if (oldest) emitted.delete(oldest);
      }
    }
    items = [...fresh, ...items].slice(0, MAX_ITEMS);
    commit();
    return fresh;
  },

  markRead(id: string): void {
    const next = items.map((n) => (n.id === id ? { ...n, read: true } : n));
    if (JSON.stringify(next) === JSON.stringify(items)) return;
    items = next;
    commit();
  },

  markAllRead(): void {
    if (this.getUnreadCount() === 0) return;
    items = items.map((n) => (n.read ? n : { ...n, read: true }));
    commit();
  },

  clear(): void {
    if (items.length === 0) return;
    items = [];
    commit();
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** React binding for the store (bell badge + panel). */
export function useNotifications(): {
  items: readonly AppNotification[];
  unread: number;
} {
  const it = useSyncExternalStore(
    (fn) => notificationStore.subscribe(fn),
    () => notificationStore.getItems(),
  );
  return { items: it, unread: notificationStore.getUnreadCount() };
}
