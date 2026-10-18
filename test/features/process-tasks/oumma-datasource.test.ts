import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '../../../src/core/http/client';
import { OummaTaskDataSource } from '../../../src/features/process-tasks/data/datasources/oumma-task-datasource';
import type { ProcessApp } from '../../../src/features/process-apps/domain/entities/process-app';

const process: ProcessApp = {
  id: 'p1',
  name: 'P1',
  description: 'd',
  iconPath: '',
  link: '',
  canLaunch: false,
  sharedProcessIds: [],
  roles: [{
    roleId: 'g1',
    roleName: 'G1',
    applyDeptFilter: false,
    canEditInitialForm: false,
    roleCanLaunch: false,
    viewAcessRoles: ['g2'],
    docRoles: [],
    roleTasks: [],
  }],
};

interface Captured {
  method: string;
  url: string;
  headers: Record<string, unknown>;
  body: unknown;
}

describe('process-tasks/oumma datasource — endpoint contract', () => {
  const calls: Captured[] = [];
  let nextResponses: { status: number; data: unknown }[] = [];

  beforeEach(() => {
    calls.length = 0;
    nextResponses = [];
    apiClient.defaults.adapter = vi.fn(async (config) => {
      let body: unknown = config.data;
      if (typeof body === 'string' && body.length > 0) {
        try {
          body = JSON.parse(body);
        } catch {
          /* keep raw */
        }
      }
      const call: Captured = {
        method: (config.method ?? 'get').toUpperCase(),
        url: (config.baseURL ?? '') + (config.url ?? ''),
        headers: { ...(config.headers as Record<string, unknown>) },
        body,
      };
      calls.push(call);
      const next = nextResponses.shift() ?? { status: 200, data: [] };
      return {
        data: next.data,
        status: next.status,
        statusText: 'OK',
        headers: {},
        config,
      };
    });
  });

  const runningState = {
    process_id: 'inst-1',
    definition_id: 'p1',
    status: 'RUNNING',
    current_task_id: 'manual_review',
    global_context: { client_name: 'Bob', department: { codes: ['100'] } },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  };

  it('lists active instances then the instance tasks, keeping group-matched tasks', async () => {
    nextResponses = [
      { status: 200, data: [runningState] },
      {
        status: 200,
        data: [
          { task_instance_id: 'ti-1', task_id: 'manual_review', group: 'g1' },
          { task_instance_id: 'ti-2', task_id: 'other', group: 'other' },
        ],
      },
    ];
    const ds = new OummaTaskDataSource('http://oumma');
    const groups = await ds.getTaskGroupList(process, [], ['g1'], 'TOKEN');

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET http://oumma/processes/p1',
      'GET http://oumma/processes/p1/inst-1/tasks',
    ]);
    expect(calls.every((c) => c.headers.Authorization === 'Bearer TOKEN')).toBe(true);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('inst-1');
    expect(groups[0].formId).toBe('inst-1');
    const current = groups[0].taskItems.find((t) => t.taskId === 'current_task');
    expect(current?.description).toBe('manual_review');
    expect(groups[0].taskItems.find((t) => t.taskId === 'client_name')?.description).toBe('Bob');
  });

  it('skips finished instances (no task fetch)', async () => {
    nextResponses = [{ status: 200, data: [{ ...runningState, status: 'COMPLETED' }] }];
    const ds = new OummaTaskDataSource('http://oumma');
    const groups = await ds.getTaskGroupList(process, [], ['g1'], 'TOKEN');
    expect(groups).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('POSTs the completion to /processes/{pid}/{iid}/{task_name}/{task_id} with input', async () => {
    nextResponses = [{ status: 200, data: {} }];
    const ds = new OummaTaskDataSource('http://oumma');
    await ds.completeTask({
      process,
      processInstanceId: 'inst-1',
      taskId: 'manual_review',
      taskInstanceId: 'ti-1',
      userId: 'u1',
      groupId: 'g1',
      token: 'TOKEN',
      formData: { decision: 'approved' },
      override: 'jump to send_letter',
    });
    expect(calls[0].url).toBe('http://oumma/processes/p1/inst-1/manual_review/ti-1');
    expect(calls[0].body).toEqual({ input: { decision: 'approved' }, override: 'jump to send_letter' });
  });

  it('adds comments through the task-scoped comments endpoint', async () => {
    nextResponses = [
      { status: 201, data: { id: 'c1', content: 'hello', created_by: 'u1', created_at: 'now' } },
    ];
    const ds = new OummaTaskDataSource('http://oumma');
    const comment = await ds.addTaskComment({
      process,
      processInstanceId: 'inst-1',
      taskDescription: 'manual_review',
      taskInstanceId: 'ti-1',
      userId: 'u1',
      group: 'g1',
      token: 'TOKEN',
      content: 'hello',
    });
    expect(calls[0].url).toBe('http://oumma/processes/p1/inst-1/manual_review/ti-1/comments');
    expect(calls[0].body).toEqual({ content: 'hello' });
    expect(comment.id).toBe('c1');
  });
});
