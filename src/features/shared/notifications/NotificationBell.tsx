import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import type { AppNotification, NotificationKind } from './notification-model';
import { notificationStore, useNotifications } from './notification-store';

const KIND_COLOR: Record<NotificationKind, string> = {
  'new-task': 'text-emerald-500',
  'fork-task': 'text-emerald-500',
  'task-completed': 'text-sky-500',
  routed: 'text-amber-500',
  'instance-completed': 'text-emerald-500',
  'instance-failed': 'text-red-500',
  'instance-aborted': 'text-orange-500',
};

function kindIcon(kind: NotificationKind): string {
  switch (kind) {
    case 'new-task':
    case 'fork-task':
      return 'M12 5v14M5 12h14';
    case 'task-completed':
      return 'm5 13 4 4L19 7';
    case 'routed':
      return 'M4 12h16m-6-6 6 6-6 6';
    case 'instance-completed':
      return 'M12 3a9 9 0 1 0 9 9M12 7v5l3 3';
    case 'instance-failed':
      return 'M12 8v5m0 3h.01M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z';
    case 'instance-aborted':
      return 'M18 6 6 18M6 6l12 12';
  }
}

function timeLabel(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function message(n: AppNotification, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (n.kind) {
    case 'new-task':
      return t('notifNewTask', { task: n.taskName ?? '' });
    case 'fork-task':
      return t('notifForkTask', { task: n.taskName ?? '' });
    case 'task-completed':
      return t('notifTaskCompleted', { task: n.taskName ?? '' });
    case 'routed':
      return t('notifRouted', { task: n.toTask ?? n.taskName ?? '' });
    case 'instance-completed':
      return t('notifInstanceCompleted');
    case 'instance-failed':
      return t('notifInstanceFailed');
    case 'instance-aborted':
      return t('notifInstanceAborted');
  }
  return n.kind;
}

/**
 * Header bell: unread badge + dropdown panel over the notification store,
 * plus a transient toast for the newest arrival. Row tap marks read and
 * navigates to the process workspace (My Tasks).
 */
export function NotificationBell() {
  const { items, unread } = useNotifications();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<AppNotification | null>(null);
  const seenRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast on the newest item (once per item id; skip on first mount).
  const newestId = items[0]?.id ?? null;
  useEffect(() => {
    if (newestId === null) return;
    if (seenRef.current === null) {
      seenRef.current = newestId;
      return;
    }
    if (seenRef.current === newestId) return;
    seenRef.current = newestId;
    setToast(items[0] ?? null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, [newestId, items]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const open = (n: AppNotification) => {
    notificationStore.markRead(n.id);
    navigate(`/myprocesses/${n.processId}`);
  };

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger className="button button--ghost button--icon-only relative" aria-label={t('notificationsTitle')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
            <path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--accent) px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Dropdown.Trigger>
        <Dropdown.Popover className="w-80">
          <div className="flex items-center justify-between border-b border-separator px-3 py-2">
            <span className="text-(--app-fs-small) font-semibold">{t('notificationsTitle')}</span>
            <div className="flex gap-2">
              <button className="text-(--app-fs-small) text-(--accent) hover:underline" onClick={() => notificationStore.markAllRead()}>
                {t('notificationsMarkAllRead')}
              </button>
              <button className="text-(--app-fs-small) text-muted hover:underline" onClick={() => notificationStore.clear()}>
                {t('notificationsClear')}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-(--app-fs-small) text-muted">
                {t('notificationsEmpty')}
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-2 border-b border-separator px-3 py-2 text-left hover:bg-surface/60 ${n.read ? 'opacity-60' : ''}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`mt-0.5 h-4 w-4 shrink-0 ${KIND_COLOR[n.kind]}`}>
                    <path d={kindIcon(n.kind)} />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-(--app-fs-small) font-medium">{message(n, t)}</span>
                    <span className="block truncate text-(--app-fs-base) text-muted">
                      {n.processLabel} · {n.instanceId.slice(0, 8)}
                    </span>
                  </span>
                  <span className="shrink-0 text-(--app-fs-base) text-muted">{timeLabel(n.at)}</span>
                </button>
              ))
            )}
          </div>
        </Dropdown.Popover>
      </Dropdown.Root>

      {toast && (
        <div className="fixed top-16 right-4 z-50 w-80 rounded-(--app-radius) border border-separator bg-surface p-3 shadow-lg">
          <button className="flex w-full items-start gap-2 text-left" onClick={() => { open(toast); setToast(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`mt-0.5 h-4 w-4 shrink-0 ${KIND_COLOR[toast.kind]}`}>
              <path d={kindIcon(toast.kind)} />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-(--app-fs-small) font-medium">{message(toast, t)}</span>
              <span className="block truncate text-(--app-fs-base) text-muted">
                {toast.processLabel} · {toast.instanceId.slice(0, 8)}
              </span>
            </span>
          </button>
        </div>
      )}
    </>
  );
}
