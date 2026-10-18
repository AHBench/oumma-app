import type { Tag } from '../../../process-document/data/models/document-model';

type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

/** Task item — mirrors lib/features/process_tasks/data/models/task_item_model.dart */
export interface TaskItem {
  taskId: string;
  description: unknown;
  detailed: boolean;
  instanceId: string;
  parameters?: Json;
  taskPhase: string;
  taskPhaseStatus: string;
  startedAt: string;
  priority?: number;
}

export function taskItemFromJson(
  taskId: string,
  description: unknown,
  taskJson: Json,
): TaskItem {
  return {
    taskId,
    description,
    detailed: typeof description === 'object' && description !== null,
    instanceId: str(taskJson.id),
    parameters: (taskJson.parameters as Json) ?? undefined,
    taskPhase: str(taskJson.phase),
    taskPhaseStatus: str(taskJson.phaseStatus),
    startedAt: str(taskJson.started),
    priority:
      taskJson.priority != null ? Number.parseInt(String(taskJson.priority), 10) : undefined,
  };
}

/** Task group — mirrors task_group_model.dart (id = process instance id). */
export interface TaskGroup {
  id: string;
  name: string;
  taskItems: TaskItem[];
  formId: string;
}

/** Process (running) item — mirrors process_item_model.dart */
export interface ProcessItem {
  id: string;
  formId: string;
  department: unknown;
  parameters: Json;
}

export function processItemFromJson(raw: Json): ProcessItem {
  const id = str(raw.id);
  const formId =
    raw.form_id != null ? str(raw.form_id) : raw.formId != null ? str(raw.formId) : '';
  const department = raw.department;
  const parameters: Json = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key !== 'id' && key !== 'form_id' && key !== 'department') {
      parameters[key] = value;
    }
  }
  return { id, formId, department, parameters };
}

/** Task comment — mirrors task_comment_model.dart */
export interface TaskComment {
  id: string;
  content: string;
  updatedBy: string;
  updatedAt: string;
}

export function taskCommentFromJson(json: Json): TaskComment {
  return {
    id: str(json.id),
    content: str(json.content),
    updatedBy: str(json.updatedBy),
    updatedAt: str(json.updatedAt),
  };
}

/** Task attachment — mirrors task_attachment_model.dart */
export interface TaskAttachment {
  id: string;
  name: string;
  content: string; // URI
  updatedBy: string;
  updatedAt: string;
  serviceName?: string;
  tags?: Tag[];
  documentId?: number | null;
}

export function taskAttachmentFromJson(
  json: Json,
  parseTag: (raw: Json | string) => Tag,
): TaskAttachment {
  return {
    id: str(json.id),
    name: str(json.name),
    content: str(json.content),
    updatedBy: str(json.updatedBy),
    updatedAt: str(json.updatedAt),
    serviceName: json.serviceName != null ? str(json.serviceName) : undefined,
    tags: Array.isArray(json.tags) ? (json.tags as (Json | string)[]).map(parseTag) : undefined,
    documentId:
      typeof json.documentId === 'number'
        ? (json.documentId as number)
        : json.documentId != null
          ? Number.parseInt(str(json.documentId), 10)
          : null,
  };
}
