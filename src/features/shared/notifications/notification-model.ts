/**
 * Process notification model — app-side derivation of the Oumma engine's
 * lifecycle events for instances the user's roles are involved in.
 *
 * The Oumma backend has no global push channel (SSE streams are tied to a
 * start/complete request), so the app polls every process and diffs
 * consecutive snapshots. Each diff produces notifications for these
 * scenarios of a running process related to the user's tasks:
 *
 *  - new-task            a HUMAN task for one of the user's groups appeared
 *  - fork-task           a parallel branch created another task for the user
 *  - task-completed      a task that was pending for the user is gone
 *  - routed              the engine (LLM) advanced the instance to a new step
 *  - instance-completed  the instance reached COMPLETED
 *  - instance-failed     the instance reached FAILED (incl. SYSTEM_TASK_ERROR)
 *  - instance-aborted    the instance was aborted (ABORTED instances are
 *                        filtered out of the server list, so they "disappear")
 */

export type NotificationKind =
  | 'new-task'
  | 'fork-task'
  | 'task-completed'
  | 'routed'
  | 'instance-completed'
  | 'instance-failed'
  | 'instance-aborted';

export interface AppNotification {
  /** Deterministic id — used to dedupe across polls and reloads. */
  id: string;
  kind: NotificationKind;
  processId: string;
  /** Display name of the process (resolved at creation time). */
  processLabel: string;
  instanceId: string;
  /** The task involved (name). */
  taskName?: string;
  /** Where the process moved / continues (routed, task-completed). */
  toTask?: string;
  /** Creation time (ISO). */
  at: string;
  read: boolean;
}

/** One instance as seen in a scan (ABORTED never appears — server filters). */
export interface InstanceView {
  id: string;
  status: string; // RUNNING | PAUSED | COMPLETED | FAILED
  currentTaskId: string;
}

/** One active HUMAN task visible to the user's groups. */
export interface MyTaskView {
  instanceId: string;
  taskInstanceId: string;
  taskName: string;
}

/** Per-process snapshot produced by one scan. */
export interface ProcessSnapshot {
  processId: string;
  instances: InstanceView[];
  myTasks: MyTaskView[];
}
