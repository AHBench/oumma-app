import type { OummaTaskDataSource } from '../datasources/oumma-task-datasource';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app.ts';
import type {
  ProcessItem,
  TaskAttachment,
  TaskComment,
  TaskGroup,
} from '../models/task-models';
import type { ProcessGraph } from '../../domain/entities/process-graph';

type Json = Record<string, unknown>;

/** Task repository contract — mirrors lib/features/process_tasks/domain/repository/task_repository.dart */
export interface TaskRepository {
  getTaskGroupList(
    process: ProcessApp,
    userDepartment: string[],
    groupsId: string[],
    token: string,
  ): Promise<TaskGroup[]>;

  getActiveProcessItems(
    process: ProcessApp,
    userDepartment: string[],
    groupsId: string[],
    token: string,
  ): Promise<ProcessItem[]>;

  getTaskComments(
    process: ProcessApp,
    processInstanceId: string,
    groupId: string,
    token: string,
  ): Promise<TaskComment[]>;

  getTaskAttachment(
    process: ProcessApp,
    processInstanceId: string,
    groupId: string,
    token: string,
  ): Promise<TaskAttachment[]>;

  completeTask(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskId: string;
    taskInstanceId: string;
    userId: string;
    groupId: string;
    token: string;
    formData?: unknown;
  }): Promise<{ status: string }>;

  claimTask(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskId: string;
    taskInstanceId: string;
    userId: string;
    groupId: string;
    token: string;
  }): Promise<Json>;

  releaseTask(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskId: string;
    taskInstanceId: string;
    userId: string;
    groupId: string;
    token: string;
  }): Promise<Json>;

  getTaskStatus(params: {
    process: ProcessApp;
    processInstanceId: string;
    groupId: string;
    token: string;
  }): Promise<Json>;

  addTaskAttachment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    attachment: TaskAttachment;
  }): Promise<TaskAttachment>;

  deleteTaskAttachment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    attachment: TaskAttachment;
  }): Promise<boolean>;

  addTaskComment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    content: string;
  }): Promise<TaskComment>;

  updateTaskComment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    comment: TaskComment;
  }): Promise<TaskComment>;

  deleteTaskComment(params: {
    process: ProcessApp;
    processInstanceId: string;
    taskDescription: string;
    taskInstanceId: string;
    userId: string;
    group: string;
    token: string;
    commentId: string;
  }): Promise<boolean>;

  fetchProcessGraph(processId: string, token?: string): Promise<ProcessGraph>;
}

interface ActionParams {
  process: ProcessApp;
  processInstanceId: string;
  taskId: string;
  taskInstanceId: string;
  userId: string;
  groupId: string;
  token: string;
  formData?: unknown;
}

interface SimpleActionParams {
  process: ProcessApp;
  processInstanceId: string;
  taskId: string;
  taskInstanceId: string;
  userId: string;
  groupId: string;
  token: string;
}

interface TextActionParams {
  process: ProcessApp;
  processInstanceId: string;
  taskDescription: string;
  taskInstanceId: string;
  userId: string;
  group: string;
  token: string;
}

export class TaskRepositoryImpl implements TaskRepository {
  private readonly datasource: OummaTaskDataSource;
  constructor(datasource: OummaTaskDataSource) {
    this.datasource = datasource;
  }

  getTaskGroupList(process: ProcessApp, userDepartment: string[], groupsId: string[], token: string) {
    return this.datasource.getTaskGroupList(process, userDepartment, groupsId, token);
  }
  getActiveProcessItems(process: ProcessApp, userDepartment: string[], groupsId: string[], token: string) {
    return this.datasource.getActiveProcessItems(process, userDepartment, groupsId, token);
  }
  getTaskComments(process: ProcessApp, processInstanceId: string, groupId: string, token: string) {
    return this.datasource.getTaskComments(process, processInstanceId, groupId, token);
  }
  getTaskAttachment(process: ProcessApp, processInstanceId: string, groupId: string, token: string) {
    return this.datasource.getTaskAttachment(process, processInstanceId, groupId, token);
  }
  completeTask(params: ActionParams) {
    return this.datasource.completeTask(params);
  }
  claimTask(params: SimpleActionParams) {
    return this.datasource.claimTask(params);
  }
  releaseTask(params: SimpleActionParams) {
    return this.datasource.releaseTask(params);
  }
  getTaskStatus(params: { process: ProcessApp; processInstanceId: string; groupId: string; token: string }) {
    return this.datasource.getTaskStatus(params);
  }
  addTaskAttachment(params: TextActionParams & { attachment: TaskAttachment }) {
    return this.datasource.addTaskAttachment(params);
  }
  deleteTaskAttachment(params: TextActionParams & { attachment: TaskAttachment }) {
    return this.datasource.deleteTaskAttachment(params);
  }
  addTaskComment(params: TextActionParams & { content: string }) {
    return this.datasource.addTaskComment(params);
  }
  updateTaskComment(params: TextActionParams & { comment: TaskComment }) {
    return this.datasource.updateTaskComment(params);
  }
  deleteTaskComment(params: TextActionParams & { commentId: string }) {
    return this.datasource.deleteTaskComment(params);
  }
  fetchProcessGraph(processId: string, token?: string) {
    return this.datasource.fetchProcessGraph(processId, token);
  }
}
