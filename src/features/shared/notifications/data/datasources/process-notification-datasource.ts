import { apiClient } from '../../../../../core/http/client';
import { appLogger } from '../../../../../core/logging/app-logger';
import {
  listAllStates,
  isInstanceActive,
  type OummaState,
} from '../../../../process-apps/data/oumma-mapping';
import type {
  ProcessSnapshot,
} from '../../notification-model';

type Json = Record<string, unknown>;

function base(oummaUrl: string): string {
  return oummaUrl.replace(/\/+$/, '');
}

/**
 * Notification scan datasource — one snapshot per process:
 *  - every non-aborted instance (GET /processes/{pid}, status + current step)
 *  - the active HUMAN tasks visible to the caller's groups on active instances
 *
 * ABORTED instances are filtered out by the engine's list endpoint, so an
 * instance that disappears between scans was aborted — the diff engine
 * turns that into an `instance-aborted` notification.
 */
export class ProcessNotificationDataSource {
  constructor(private readonly oummaUrl: string) {}

  async snapshot(
    processId: string,
    groups: string[],
    token: string,
  ): Promise<ProcessSnapshot> {
    const states: OummaState[] = await listAllStates(
      this.oummaUrl,
      processId,
      token,
    );

    const instances = states.map((s) => ({
      id: s.process_id,
      status: s.status,
      currentTaskId: s.current_task_id ?? '',
    }));

    const myTasks: ProcessSnapshot['myTasks'] = [];
    const active = states.filter(isInstanceActive);
    await Promise.all(
      active.map(async (state) => {
        let resp;
        try {
          resp = await apiClient.get(
            `${base(this.oummaUrl)}/processes/${processId}/${state.process_id}/tasks`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
        } catch (e) {
          // one failing instance must not kill the whole scan
          appLogger.warning(
            `notification scan: tasks for ${state.process_id}: ${String(e)}`,
          );
          return;
        }
        const tasks = Array.isArray(resp.data) ? (resp.data as Json[]) : [];
        for (const task of tasks) {
          if (!groups.includes(String(task.group ?? ''))) continue;
          myTasks.push({
            instanceId: state.process_id,
            taskInstanceId: String(task.task_instance_id ?? ''),
            taskName: String(task.task_id ?? ''),
          });
        }
      }),
    );

    return { processId, instances, myTasks };
  }
}
