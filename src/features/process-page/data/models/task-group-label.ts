type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

/** Mirrors lib/features/process_page/data/model/task_item_label_model.dart */
export interface TaskItemLabel {
  id: number; // JSON `order`
  description: string;
  detailed: boolean;
  atomic: boolean;
  urlActive: boolean;
  itemColumnName: string;
  format?: string | null;
  formatString?: string | null;
}

export function taskItemLabelFromJson(json: Json): TaskItemLabel {
  return {
    id: typeof json.order === 'number' ? (json.order as number) : Number.parseInt(str(json.order), 10) || 0,
    description: str(json.item_description),
    detailed: json.detailed === true,
    atomic: json.atomic === true,
    urlActive: json.url_active === true,
    itemColumnName: str(json.item_column_name),
    format: json.format != null ? str(json.format) : null,
    formatString: json.format_string != null ? str(json.format_string) : null,
  };
}

/** Mirrors lib/features/process_page/data/model/task_group_label_model.dart */
export interface TaskGroupLabel {
  id: string;
  taskItems: TaskItemLabel[];
  taskViewItems: TaskItemLabel[];
}

export function taskGroupLabelFromJson(json: Json): TaskGroupLabel {
  return {
    id: str(json.id),
    taskItems: Array.isArray(json.task_items)
      ? (json.task_items as Json[]).map(taskItemLabelFromJson)
      : [],
    taskViewItems: Array.isArray(json.task_view)
      ? (json.task_view as Json[]).map(taskItemLabelFromJson)
      : [],
  };
}
