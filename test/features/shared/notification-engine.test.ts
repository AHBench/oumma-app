import { describe, expect, it } from 'vitest';
import { diffProcess } from '../../../src/features/shared/notifications/notification-engine';
import type { ProcessSnapshot } from '../../../src/features/shared/notifications/notification-model';

const T = '2026-10-16T12:00:00.000Z';

function snap(
  processId: string,
  instances: ProcessSnapshot['instances'],
  myTasks: ProcessSnapshot['myTasks'],
): ProcessSnapshot {
  return { processId, instances, myTasks };
}

const inst = (id: string, status = 'PAUSED', currentTaskId = '') => ({
  id,
  status,
  currentTaskId,
});

const task = (instanceId: string, taskInstanceId: string, taskName: string) => ({
  instanceId,
  taskInstanceId,
  taskName,
});

describe('notifications/notification-engine', () => {
  it('bootstraps silently: first scan seeds touched without notifying', () => {
    const next = snap('p', [inst('i1', 'PAUSED', 't2')], [task('i1', 'ti1', 't2')]);
    const r = diffProcess(null, next, T);
    expect(r.notifications).toHaveLength(0);
    expect(r.touched.has('i1')).toBe(true);
  });

  it('new instance already carrying a task for the user → new-task', () => {
    const prev = snap('p', [], []);
    const next = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['new-task']);
    expect(r.notifications[0]).toMatchObject({
      processId: 'p',
      instanceId: 'i1',
      taskName: 'review',
      read: false,
    });
    expect(r.notifications[0].id).toBe('new-task:p:i1:ti1');
  });

  it('new instance with two parallel tasks → new-task + fork-task', () => {
    const prev = snap('p', [], []);
    const next = snap('p', [inst('i1', 'PAUSED', 'a')], [
      task('i1', 'ti1', 'a'),
      task('i1', 'ti2', 'b'),
    ]);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind).sort()).toEqual(['fork-task', 'new-task']);
  });

  it('new instance without a task for the user → no notification', () => {
    const prev = snap('p', [], []);
    const next = snap('p', [inst('i1', 'PAUSED', 'other-group-task')], []);
    expect(diffProcess(prev, next, T).notifications).toHaveLength(0);
  });

  it('task disappears while instance runs → task-completed with next step (no routed)', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const next = snap('p', [inst('i1', 'PAUSED', 'payment')], []);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['task-completed']);
    expect(r.notifications[0]).toMatchObject({ taskName: 'review', toTask: 'payment' });
  });

  it('a second task appears on an instance with an existing one → fork-task', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'a')], [task('i1', 'ti1', 'a')]);
    const next = snap('p', [inst('i1', 'PAUSED', 'a')], [
      task('i1', 'ti1', 'a'),
      task('i1', 'ti2', 'b'),
    ]);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['fork-task']);
    expect(r.notifications[0].taskName).toBe('b');
  });

  it('engine advances to a new step (user involved before, no new task) → routed', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const next = snap('p', [inst('i1', 'RUNNING', 'scoring')], []);
    // task-completed (ti1 gone) + routed? The task disappeared, so it is
    // task-completed; routed fires only when the task set is unchanged.
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['task-completed']);
  });

  it('task completion + advance in one scan → single task-completed (no double routed)', () => {
    const withTask = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const advanced = snap('p', [inst('i1', 'RUNNING', 'scoring')], []);
    const r = diffProcess(withTask, advanced, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['task-completed']);
    expect(r.notifications[0].toTask).toBe('scoring');
  });

  it('routed fires when a non-user task step changes while user task persists', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'mine')], [task('i1', 'ti1', 'mine')]);
    const next = snap('p', [inst('i1', 'PAUSED', 'other')], [task('i1', 'ti1', 'mine')]);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['routed']);
    expect(r.notifications[0].toTask).toBe('other');
  });

  it('terminal COMPLETED of an involved instance → instance-completed', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const next = snap('p', [inst('i1', 'COMPLETED', 'end')], []);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['instance-completed']);
  });

  it('terminal FAILED of an involved instance → instance-failed', () => {
    const prev = snap('p', [inst('i1', 'RUNNING', 'sys')], [task('i1', 'ti1', 'prev')]);
    const next = snap('p', [inst('i1', 'FAILED', 'sys')], []);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['instance-failed']);
  });

  it('terminal state of an uninvolved instance → no notification', () => {
    const prev = snap('p', [inst('i2', 'RUNNING', 'x')], []);
    const next = snap('p', [inst('i2', 'COMPLETED', 'end')], []);
    expect(diffProcess(prev, next, T).notifications).toHaveLength(0);
  });

  it('instance vanishing from the list while active (ABORTED filtered server-side) → instance-aborted', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const next = snap('p', [], []);
    const r = diffProcess(prev, next, T);
    expect(r.notifications.map((n) => n.kind)).toEqual(['instance-aborted']);
  });

  it('stable state across two scans → no repeated notifications', () => {
    const a = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    const b = snap('p', [inst('i1', 'PAUSED', 'review')], [task('i1', 'ti1', 'review')]);
    expect(diffProcess(a, b, T).notifications).toHaveLength(0);
  });

  it('notifications are deterministic (same id on identical transitions)', () => {
    const prev = snap('p', [inst('i1', 'PAUSED', 'a')], [task('i1', 'ti1', 'a')]);
    const next = snap('p', [inst('i1', 'PAUSED', 'b')], []);
    const ids = [diffProcess(prev, next, T), diffProcess(prev, next, T)].map(
      (r) => r.notifications[0]?.id,
    );
    expect(ids[0]).toBe(ids[1]);
  });
});
