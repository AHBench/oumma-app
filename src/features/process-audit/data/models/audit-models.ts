type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

function parseDate(value: unknown): string | null {
  if (value == null) return null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Mirrors search_item_model.dart */
export interface SearchItem {
  fieldName: string;
  fieldType: string;
  fieldLabelFr: string;
  fieldLabelEn: string;
  fieldLabelAr: string;
}

export function searchItemFromJson(json: Json): SearchItem {
  return {
    fieldName: str(json.fieldName),
    fieldType: str(json.fieldType),
    fieldLabelFr: str(json.fieldLabel_fr),
    fieldLabelEn: str(json.fieldLabel_en),
    fieldLabelAr: str(json.fieldLabel_ar),
  };
}

/** Mirrors comment_hist_item_model.dart */
export interface CommentHistoryItem {
  id: string;
  content: string;
  updatedAt: string | null;
  updatedBy: string;
  userTaskInstanceId: string;
}

export function commentHistoryFromJson(json: Json): CommentHistoryItem {
  return {
    id: str(json.id),
    content: str(json.content),
    updatedAt: parseDate(json.updatedAt),
    updatedBy: str(json.updatedBy),
    userTaskInstanceId: str(json.userTaskInstanceId),
  };
}

/** Mirrors attachment_hist_item_model.dart */
export interface AttachmentHistoryItem {
  id: string;
  name: string;
  content: string;
  updatedAt: string | null;
  updatedBy: string;
  userTaskInstanceId: string;
}

export function attachmentHistoryFromJson(json: Json): AttachmentHistoryItem {
  return {
    id: str(json.id),
    name: str(json.name),
    content: str(json.content),
    updatedAt: parseDate(json.updatedAt),
    updatedBy: str(json.updatedBy),
    userTaskInstanceId: str(json.userTaskInstanceId),
  };
}

/** Mirrors task_history_item_model.dart */
export interface TaskHistoryItem {
  id: string;
  taskName: string;
  taskDescription?: string | null;
  referenceName: string;
  startDate: string;
  completeDate?: string | null;
  state: string;
  actualOwner?: string | null;
  inputsString: unknown;
  outputsString: unknown;
  processInstanceId: string;
  processId: string;
  taskPhase: string;
  taskPhaseStatus: string;
  detailed: boolean;
  comments: CommentHistoryItem[];
  attachments: AttachmentHistoryItem[];
  /** Localized view items resolved from outputs × search items. */
  viewItems: { key: string; value: unknown }[];
}

function parseRawOutputs(raw: unknown): Json {
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Json;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Json;
  return {};
}

/** Recursive search of a search item's value inside the outputs map. */
function findItemValue(
  map: Json,
  item: SearchItem,
  languageCode: string,
  out: { key: string; value: unknown }[],
): void {
  for (const [key, value] of Object.entries(map)) {
    if (key.toLowerCase() === item.fieldName.toLowerCase()) {
      if (languageCode === 'fr') {
        out.push({ key: item.fieldLabelFr, value });
      } else if (languageCode === 'en') {
        out.push({ key: item.fieldLabelEn, value });
      } else if (languageCode === 'ar') {
        out.push({ key: item.fieldLabelAr, value });
      } else {
        out.push({ key: item.fieldName, value });
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      findItemValue(value as Json, item, languageCode, out);
    } else if (Array.isArray(value)) {
      for (const element of value) {
        if (element && typeof element === 'object' && !Array.isArray(element)) {
          findItemValue(element as Json, item, languageCode, out);
        }
      }
    }
  }
}

export function taskHistoryItemFromJson(
  json: Json,
  currentItems: SearchItem[],
  languageCode: string,
): TaskHistoryItem {
  const rawInputs =
    json.inputsString ?? json.inputs ?? json.inputs_string ?? json.inputString;
  const rawOutputs =
    json.outputsString ??
    json.outputs ??
    json.outputs_string ??
    json.outputString ??
    json.results;

  const outputsMap = parseRawOutputs(rawOutputs);

  const viewItems: { key: string; value: unknown }[] = [];
  for (const item of currentItems) {
    findItemValue(outputsMap, item, languageCode, viewItems);
  }

  const commentsJson = json.comments as Json[] | undefined;
  const attachmentsJson = json.attachments as Json[] | undefined;

  return {
    id: str(json.id),
    taskName: str(json.taskName),
    taskDescription: json.taskDescription != null ? str(json.taskDescription) : null,
    referenceName: str(json.referenceName),
    startDate:
      json.startDate != null ? new Date(str(json.startDate)).toISOString() : new Date(0).toISOString(),
    completeDate: json.completeDate != null ? parseDate(json.completeDate) : null,
    state: str(json.state),
    actualOwner: json.actualOwner != null ? str(json.actualOwner) : null,
    inputsString: rawInputs,
    outputsString: rawOutputs,
    processInstanceId: str(json.processInstanceId),
    processId: str(json.processId),
    taskPhase: json.state != null ? str(json.state) : '',
    taskPhaseStatus: json.phaseStatus != null ? str(json.phaseStatus) : '',
    detailed: json.detailed === true,
    comments: Array.isArray(commentsJson) ? commentsJson.map(commentHistoryFromJson) : [],
    attachments: Array.isArray(attachmentsJson)
      ? attachmentsJson.map(attachmentHistoryFromJson)
      : [],
    viewItems,
  };
}

/** Mirrors process_instance_data_model.dart */
export interface NodeInstance {
  id: string;
  nodeId: string;
  nodeDefinitionId: string;
  nodeName: string;
  nodeType: string;
  triggerTime?: string | null;
  leaveTime?: string | null;
  orderIndex: number;
}

export function nodeInstanceFromJson(json: Json): NodeInstance {
  const rawOrder = json.order_index ?? json.orderIndex;
  return {
    id: str(json.id),
    nodeId: str(json.nodeId),
    nodeDefinitionId: str(json.nodeDefinitionId),
    nodeName: str(json.nodeName),
    nodeType: str(json.nodeType),
    triggerTime: json.triggerTime != null ? parseDate(json.triggerTime) : null,
    leaveTime: json.leaveTime != null ? parseDate(json.leaveTime) : null,
    orderIndex: Number.parseInt(str(rawOrder), 10) || 0,
  };
}

export interface ProcessInstanceData {
  id: string;
  processId: string;
  processName: string;
  startDate?: string | null;
  endDate?: string | null;
  state?: number | null;
  businessKey?: string | null;
  nodeInstances: NodeInstance[];
}

/* ── Oumma execution timeline (track × taskshist × llm_logs) ────────────── */

/** One LLM routing decision — the arrow between two timeline steps. */
export interface TimelineDecision {
  fromTask: string;
  toTask: string;
  reasoning: string;
  model?: string;
  durationMs?: number | null;
  at?: string | null;
  error?: string | null;
  overrideApplied?: boolean;
}

/** The LLM prepare_input call for a step (system-task readiness). */
export interface TimelineInputCall {
  model?: string;
  durationMs?: number | null;
  at?: string | null;
  error?: string | null;
}

export interface TimelineStep {
  id: string;
  taskName: string;
  order: number;
  kind: 'start' | 'human' | 'system' | 'end' | 'unknown';
  state: 'pending' | 'running' | 'waiting' | 'completed' | 'failed';
  owner?: string | null;
  group?: string[];
  startedAt?: string | null;
  endedAt?: string | null;
  output?: Json;
  /** The LLM decision that routed INTO this step. */
  decision?: TimelineDecision | null;
  /** The LLM prepare_input call that fed this step. */
  inputCall?: TimelineInputCall | null;
}

export interface ProcessTimeline {
  instanceId: string;
  processId: string;
  instanceStatus?: string | null;
  startedAt?: string | null;
  steps: TimelineStep[];
}
