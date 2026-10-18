import { apiClient, getErrorMessage } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type {
  ProcessGraph,
} from '../../domain/entities/process-graph';
import {
  definitionFor,
  fetchDefinitions,
  listActiveStates,
  type OummaState,
} from '../../../process-apps/data/oumma-mapping';
import type {
  ProcessItem,
  TaskAttachment,
  TaskComment,
  TaskGroup,
  TaskItem,
} from '../models/task-models';
import {
  processItemFromJson,
  taskItemFromJson,
} from '../models/task-models';

type Json = Record<string, unknown>;

function axiosStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: number; data?: unknown } };
  return e?.response?.status;
}

function axiosBody(error: unknown): unknown {
  const e = error as { response?: { status?: number; data?: unknown } };
  return e?.response?.data;
}

function checkLicense(error: unknown): never | void {
  if (axiosStatus(error) === 403) {
    throwIfLicenseInvalidStrict(403, axiosBody(error));
  }
}

function base(oummaUrl: string): string {
  return oummaUrl.replace(/\/+$/, '');
}

/**
 * Oumma task datasource — same public surface as the former Kogito
 * datasource, speaking the Oumma REST API (brief/oumma):
 *
 *  - instances        GET  /processes/{pid}
 *  - active tasks     GET  /processes/{pid}/{iid}/tasks   (filtered client-side
 *                        by the workflow task group — the server-side ?group=
 *                        filter validates against Keycloak groups, which is a
 *                        different namespace)
 *  - complete         POST /processes/{pid}/{iid}/{task_name}/{task_id}
 *                     body { input } (input is validated against the task's
 *                     output_schema by the engine)
 *  - comments         POST/GET/PUT/DELETE .../comments[/{cid}]  (JSON bodies)
 *  - attachments      POST/GET/DELETE .../attachments[/{at_id}]  ({name, uri})
 *
 * claim/release have no Oumma equivalent (visibility is group-scoped) and
 * resolve as no-ops; the UI buttons for them are removed.
 */
export class OummaTaskDataSource {
  constructor(private readonly oummaUrl: string) {}

  /** GET /processes/{pid} — active instances as the app's Json shape. */
  async getUserProcesses(
    process: ProcessApp,
    _userDepartment: string[],
    _groupsId: string[],
    token: string,
  ): Promise<Json[]> {
    try {
      const states = await this.activeStates(process.id, token);
      return states.map((s) => ({
        id: s.process_id,
        form_id: s.process_id,
        department: s.global_context?.department,
      }));
    } catch (e) {
      checkLicense(e);
      appLogger.error('Error fetching tasklist', { error: e });
      throw new Error(`Error fetching tasklist: ${getErrorMessage(e)}`);
    }
  }

  private async activeStates(processId: string, token: string): Promise<OummaState[]> {
    return listActiveStates(base(this.oummaUrl), processId, token);
  }

  /**
   * One TaskGroup per (instance × active HUMAN task the user's groups can
   * see). The task JSON is synthesized from the instance state so the
   * existing label-driven table works: `current_task` carries the YAML task
   * name (used as the task_name path segment), `id` the task instance id
   * (used as the task_id path segment).
   */
  async getTaskGroupList(
    process: ProcessApp,
    _userDepartment: string[],
    groupsId: string[],
    token: string,
  ): Promise<TaskGroup[]> {
    const states = await this.activeStates(process.id, token);
    const url = base(this.oummaUrl);
    const taskList: TaskGroup[] = [];
    const seenTaskInstanceIds = new Set<string>();

    for (const state of states) {
      let resp;
      try {
        resp = await apiClient.get(
          `${url}/processes/${process.id}/${state.process_id}/tasks`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (e) {
        checkLicense(e);
        appLogger.warning(`tasks for ${state.process_id}: ${getErrorMessage(e)}`);
        continue; // one failing instance must not kill the whole list
      }
      const tasks = Array.isArray(resp.data) ? (resp.data as Json[]) : [];
      const ctx: Json = state.global_context ?? {};

      for (const task of tasks) {
        const group = String(task.group ?? '');
        if (!groupsId.includes(group)) continue;
        const taskInstanceId = String(task.task_instance_id ?? '');
        if (seenTaskInstanceIds.has(taskInstanceId)) continue;
        seenTaskInstanceIds.add(taskInstanceId);

        const pseudo: Json = {
          id: taskInstanceId,
          phase: 'Reserved',
          phaseStatus: 'Reserved',
          started: state.updated_at ?? state.created_at ?? '',
          priority: 5,
          current_task: String(task.task_id ?? ''),
          status: state.status,
          created: state.created_at ?? '',
        };
        for (const [key, value] of Object.entries(ctx)) {
          if (key === 'owner_id' || key === 'owner_groups' || key === 'lang') continue;
          pseudo[key] = value;
        }

        const itemList: TaskItem[] = Object.keys(pseudo).map((key) =>
          taskItemFromJson(key, pseudo[key], pseudo),
        );
        taskList.push({
          id: state.process_id,
          name: group,
          taskItems: itemList,
          formId: state.process_id,
        });
      }
    }
    return taskList;
  }

  /** Running instances as form-parameter items (My Active Processes). */
  async getActiveProcessItems(
    process: ProcessApp,
    _userDepartment: string[],
    _groupsId: string[],
    token: string,
  ): Promise<ProcessItem[]> {
    const states = await this.activeStates(process.id, token);
    return states.map((s) =>
      processItemFromJson({
        id: s.process_id,
        form_id: s.process_id,
        department: s.global_context?.department,
        current_task: s.current_task_id,
        status: s.status,
        created: s.created_at,
      }),
    );
  }

  /** Active HUMAN tasks of an instance (server list, unfiltered). */
  private async instanceTasks(
    processId: string,
    instanceId: string,
    token: string,
  ): Promise<Json[]> {
    const resp = await apiClient.get(
      `${base(this.oummaUrl)}/processes/${processId}/${instanceId}/tasks`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return Array.isArray(resp.data) ? (resp.data as Json[]) : [];
  }

  private async taskFor(
    processId: string,
    instanceId: string,
    groupId: string,
    token: string,
  ): Promise<Json | null> {
    const tasks = await this.instanceTasks(processId, instanceId, token);
    return tasks.find((t) => String(t.group) === groupId) ?? tasks[0] ?? null;
  }

  async getTaskComments(
    process: ProcessApp,
    processInstanceId: string,
    groupId: string,
    token: string,
  ): Promise<TaskComment[]> {
    const task = await this.taskFor(process.id, processInstanceId, groupId, token);
    if (!task) return [];
    const resp = await apiClient.get(
      `${base(this.oummaUrl)}/processes/${process.id}/${processInstanceId}/${task.task_id}/${task.task_instance_id}/comments`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const list = Array.isArray(resp.data) ? (resp.data as Json[]) : [];
    return list.map((c) => ({
      id: String(c.id ?? ''),
      content: String(c.content ?? ''),
      updatedBy: String(c.updated_by ?? c.created_by ?? ''),
      updatedAt: String(c.updated_at ?? c.created_at ?? ''),
    }));
  }

  async getTaskAttachment(
    process: ProcessApp,
    processInstanceId: string,
    groupId: string,
    token: string,
  ): Promise<TaskAttachment[]> {
    const task = await this.taskFor(process.id, processInstanceId, groupId, token);
    if (!task) return [];
    const resp = await apiClient.get(
      `${base(this.oummaUrl)}/processes/${process.id}/${processInstanceId}/${task.task_id}/${task.task_instance_id}/attachments`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const list = Array.isArray(resp.data) ? (resp.data as Json[]) : [];
    return list
      .filter((a) => !a.deleted)
      .map((a) => ({
        id: String(a.id ?? ''),
        name: String(a.name ?? ''),
        content: String(a.uri ?? ''),
        updatedBy: '',
        updatedAt: String(a.created_at ?? ''),
      }));
  }

  async completeTask(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskId: string; // task_name (YAML task id, e.g. "manual_review")
    taskInstanceId: string;
    userId: string;
    groupId: string;
    token: string;
    formData?: unknown;
    override?: string;
  }): Promise<{ status: string }> {
    const url = `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}/${params.taskId}/${params.taskInstanceId}`;
    const body: Json = {};
    if (params.formData != null) body.input = params.formData;
    if (params.override) body.override = params.override;
    try {
      const response = await apiClient.post(url, body, {
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.status !== 200 && response.status !== 202) {
        throw new Error(`Failed to complete task: ${JSON.stringify(response.data)}`);
      }
    } catch (e) {
      checkLicense(e);
      appLogger.error('Error completing task', { error: e });
      throw new Error(`Error completing task: ${getErrorMessage(e)}`);
    }
    return { status: 'Task completed successfully' };
  }

  // Oumma has no claim/release concept — no-op so existing hooks keep working
  // while the UI buttons are removed.
  async claimTask(_params: {
    process: ProcessApp;
    processInstanceId: string;
    taskId: string;
    taskInstanceId: string;
    userId: string;
    groupId: string;
    token: string;
  }): Promise<Json> {
    return { status: 'ok' };
  }

  async releaseTask(_params: {
    process: ProcessApp;
    processInstanceId: string;
    taskId: string;
    taskInstanceId: string;
    userId: string;
    groupId: string;
    token: string;
  }): Promise<Json> {
    return { status: 'ok' };
  }

  async getTaskStatus(params: {
    process: ProcessApp;
    processInstanceId: string;
    groupId: string;
    token: string;
  }): Promise<Json> {
    const response = await apiClient.get(
      `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}`,
      { headers: { Authorization: `Bearer ${params.token}` } },
    );
    if (response.status !== 200) {
      throw new Error(
        `Failed to get task status: ${response.status} ${JSON.stringify(response.data)}`,
      );
    }
    const decoded: unknown = response.data;
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      return decoded as Json;
    }
    return { value: decoded };
  }

  async addTaskAttachment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    attachment: TaskAttachment;
  }): Promise<TaskAttachment> {
    const url = `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}/${params.taskDescription}/${params.taskInstanceId}/attachments`;
    const body: Json = { name: params.attachment.name, uri: params.attachment.content };
    const response = await apiClient.post(url, body, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 201) {
      const d = response.data as Json;
      return {
        id: String(d.id ?? ''),
        name: String(d.name ?? params.attachment.name),
        content: String(d.uri ?? params.attachment.content),
        updatedBy: '',
        updatedAt: String(d.created_at ?? ''),
      };
    }
    throw new Error(`Failed to add attachment: ${JSON.stringify(response.data)}`);
  }

  async deleteTaskAttachment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    attachment: TaskAttachment;
  }): Promise<boolean> {
    const url = `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}/${params.taskDescription}/${params.taskInstanceId}/attachments/${params.attachment.id}`;
    const response = await apiClient.delete(url, {
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (response.status === 200) return true;
    throw new Error(`Failed to delete attachment: ${JSON.stringify(response.data)}`);
  }

  async addTaskComment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    content: string;
  }): Promise<TaskComment> {
    const url = `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}/${params.taskDescription}/${params.taskInstanceId}/comments`;
    const response = await apiClient.post(url, { content: params.content }, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 201) {
      const d = response.data as Json;
      return {
        id: String(d.id ?? ''),
        content: String(d.content ?? params.content),
        updatedBy: String(d.created_by ?? ''),
        updatedAt: String(d.created_at ?? ''),
      };
    }
    throw new Error(`Failed to add comment: ${JSON.stringify(response.data)}`);
  }

  async updateTaskComment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    comment: TaskComment;
  }): Promise<TaskComment> {
    const url = `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}/${params.taskDescription}/${params.taskInstanceId}/comments/${params.comment.id}`;
    const response = await apiClient.put(url, { content: params.comment.content }, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 200) {
      const d = response.data as Json;
      return {
        id: String(d.id ?? params.comment.id),
        content: String(d.content ?? params.comment.content),
        updatedBy: String(d.updated_by ?? params.comment.updatedBy),
        updatedAt: String(d.updated_at ?? d.created_at ?? params.comment.updatedAt),
      };
    }
    throw new Error(`Failed to update comment: ${JSON.stringify(response.data)}`);
  }

  async deleteTaskComment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    commentId: string;
  }): Promise<boolean> {
    const url = `${base(this.oummaUrl)}/processes/${params.process.id}/${params.processInstanceId}/${params.taskDescription}/${params.taskInstanceId}/comments/${params.commentId}`;
    const response = await apiClient.delete(url, {
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (response.status === 200 || response.status === 204) return true;
    throw new Error(`Failed to delete comment: ${JSON.stringify(response.data)}`);
  }

  /** Process graph ← definition topology (nodes = tasks, edges = topology). */
  async fetchProcessGraph(processId: string, token?: string): Promise<ProcessGraph> {
    const defs = await fetchDefinitions(base(this.oummaUrl), token ?? '');
    const def = definitionFor(defs, processId);
    if (!def) {
      throw new Error(`Process definition "${processId}" is not registered.`);
    }
    const nodes = Object.values(def.tasks).map((t) => ({
      id: t.id,
      name: (t.description ?? t.id).trim(),
      nodeType: t.type,
      isDisplayable: t.type === 'HUMAN' || t.type === 'START' || t.type === 'END',
      raw: { id: t.id, type: t.type, group: t.group },
    }));
    const edges = (def.topology ?? []).map((e, i) => ({
      id: `${e.from ?? (e.join_from ?? []).join('+')}-${e.to}-${i}`,
      name: e.condition,
      sourceId: e.from ?? (e.join_from ?? ['?'])[0] ?? '',
      targetId: e.to ?? '',
    }));
    return { processId, nodes, edges };
  }
}
