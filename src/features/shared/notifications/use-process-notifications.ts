import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDependencies } from '../../../core/di';
import type { ProcessApp } from '../../process-apps/domain/entities/process-app';
import type { User } from '../../auth/domain/entities/user';
import { diffProcess } from './notification-engine';
import { notificationStore } from './notification-store';
import type { ProcessSnapshot } from './notification-model';

/**
 * Previous scan per process + instances the user was involved in — kept at
 * module level so route changes (list ⇄ workspace, both rendering an
 * AppShell) do not re-bootstrap the diff. First scan per process seeds the
 * baseline without notifying (avoids a login-time notification storm).
 */
const prevSnapshots = new Map<string, ProcessSnapshot>();
const touchedInstances = new Map<string, Set<string>>();

export function useProcessNotificationsScan(
  processes: ProcessApp[],
  user: User | null,
  token: string | null,
): void {
  const groups = new Set<string>();
  for (const p of processes) {
    for (const r of p.roles) groups.add(r.roleId);
  }
  const groupsList = [...groups];

  const query = useQuery({
    queryKey: ['notification-scan', user?.username, token],
    queryFn: async (): Promise<ProcessSnapshot[]> => {
      const ds = getDependencies().notificationDataSource;
      const results = await Promise.all(
        processes.map((p) =>
          ds.snapshot(p.id, groupsList, token ?? '').catch(() => null),
        ),
      );
      return results.filter((s): s is ProcessSnapshot => s != null);
    },
    enabled: token != null && token !== '' && processes.length > 0,
    refetchInterval: 10_000,
    staleTime: 0,
  });

  useEffect(() => {
    const snaps = query.data;
    if (!snaps) return;

    const labelById = new Map(processes.map((p) => [p.id, p.name]));
    const created: Parameters<typeof notificationStore.addMany>[0] = [];

    for (const next of snaps) {
      const prev = prevSnapshots.get(next.processId) ?? null;
      prevSnapshots.set(next.processId, next);

      if (prev === null) {
        // Bootstrap: remember involvement, no notifications.
        const touched = touchedInstances.get(next.processId) ?? new Set<string>();
        for (const t of next.myTasks) touched.add(t.instanceId);
        touchedInstances.set(next.processId, touched);
        continue;
      }

      const result = diffProcess(prev, next);
      const touched = touchedInstances.get(next.processId) ?? new Set<string>();
      for (const id of result.touched) touched.add(id);
      touchedInstances.set(next.processId, touched);

      for (const n of result.notifications) {
        created.push({ ...n, processLabel: labelById.get(n.processId) ?? n.processId });
      }
    }

    if (created.length > 0) {
      notificationStore.addMany(created);
    }
  }, [query.data, processes]);

  // Intentionally no return value — the bell reads the store directly.
}
