import type {
  AppNotification,
  InstanceView,
  NotificationKind,
  ProcessSnapshot,
} from './notification-model';

const ACTIVE = new Set(['RUNNING', 'PAUSED']);

interface TaskMap {
  /** taskInstanceId → taskName */
  tasks: Map<string, string>;
}

function tasksFor(snapshot: ProcessSnapshot, instanceId: string): TaskMap {
  const tasks = new Map<string, string>();
  for (const t of snapshot.myTasks) {
    if (t.instanceId === instanceId) tasks.set(t.taskInstanceId, t.taskName);
  }
  return { tasks };
}

export interface DiffResult {
  notifications: AppNotification[];
  /**
   * Instance ids the user is (or was) involved in — carried forward so
   * later terminal/routing events on instances where the user's task is
   * already done still produce notifications.
   */
  touched: Set<string>;
}

/**
 * Diff two consecutive per-process scans. `prev` is null on the first scan
 * (bootstrap — no notifications, only `touched` is seeded).
 */
export function diffProcess(
  prev: ProcessSnapshot | null,
  next: ProcessSnapshot,
  now: string = new Date().toISOString(),
): DiffResult {
  const out: AppNotification[] = [];
  const touched = new Set<string>();
  const pid = next.processId;

  for (const t of next.myTasks) touched.add(t.instanceId);
  if (prev) for (const t of prev.myTasks) touched.add(t.instanceId);

  const mk = (
    kind: NotificationKind,
    instanceId: string,
    detail: string,
    extra?: { taskName?: string; toTask?: string },
  ): AppNotification => ({
    id: `${kind}:${pid}:${instanceId}:${detail}`,
    kind,
    processId: pid,
    processLabel: '',
    instanceId,
    taskName: extra?.taskName,
    toTask: extra?.toTask,
    at: now,
    read: false,
  });

  if (prev === null) {
    return { notifications: out, touched };
  }

  const prevInstances = new Map<string, InstanceView>(
    prev.instances.map((i) => [i.id, i]),
  );
  const nextIds = new Set(next.instances.map((i) => i.id));

  for (const inst of next.instances) {
    const p = prevInstances.get(inst.id);
    const wasInvolved = touched.has(inst.id);
    const myNow = tasksFor(next, inst.id).tasks;
    const myPrev = p ? tasksFor(prev, inst.id).tasks : new Map<string, string>();
    const stillActive = ACTIVE.has(inst.status);

    if (!p) {
      // New instance: notify only when it already carries a task for the user.
      if (ACTIVE.has(inst.status)) {
        let first = true;
        for (const [tid, name] of myNow) {
          out.push(
            mk(first ? 'new-task' : 'fork-task', inst.id, tid, {
              taskName: name,
            }),
          );
          first = false;
        }
      }
      continue;
    }

    const wasActive = ACTIVE.has(p.status);

    // Terminal transitions (only for instances the user was involved in).
    if (wasActive && wasInvolved && !stillActive) {
      if (inst.status === 'COMPLETED') {
        out.push(mk('instance-completed', inst.id, 'COMPLETED'));
      } else if (inst.status === 'FAILED') {
        out.push(mk('instance-failed', inst.id, 'FAILED'));
      }
      continue;
    }

    if (!wasActive || !stillActive) continue;

    // Tasks that disappeared while the instance kept running.
    let completedHere = 0;
    for (const [tid, name] of myPrev) {
      if (!myNow.has(tid)) {
        out.push(
          mk('task-completed', inst.id, tid, {
            taskName: name,
            toTask: inst.currentTaskId || undefined,
          }),
        );
        completedHere++;
      }
    }

    // Tasks that appeared (new involvement on an already-running instance).
    let newTasks = 0;
    for (const [tid, name] of myNow) {
      if (!myPrev.has(tid)) {
        out.push(
          mk(myPrev.size === 0 ? 'new-task' : 'fork-task', inst.id, tid, {
            taskName: name,
          }),
        );
        newTasks++;
      }
    }

    // Engine advanced to a different step (LLM routing) — no own task
    // appeared/disappeared, but the user was involved before → "moved to"
    // notice.
    if (
      newTasks === 0 &&
      completedHere === 0 &&
      p.currentTaskId &&
      inst.currentTaskId &&
      p.currentTaskId !== inst.currentTaskId &&
      wasInvolved
    ) {
      out.push(mk('routed', inst.id, inst.currentTaskId, { toTask: inst.currentTaskId }));
    }
  }

  // Instance vanished from the list while active: ABORTED instances are
  // filtered out of GET /processes/{pid}, so disappearance = aborted.
  for (const p of prev.instances) {
    if (ACTIVE.has(p.status) && !nextIds.has(p.id) && touched.has(p.id)) {
      out.push(mk('instance-aborted', p.id, 'ABORTED'));
    }
  }

  return { notifications: out, touched };
}
