import { apiClient } from '../../../../core/http/client';
import { BaseUrls } from '../../../../core/config/base-urls';
import { appLogger } from '../../../../core/logging/app-logger';
import i18n from '../../../../core/i18n';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import {
  definitionFor,
  fetchDefinitions,
  firstHumanTask,
  humanize,
} from '../../../process-apps/data/oumma-mapping';
import type { TaskGroupLabel, TaskItemLabel } from '../models/task-group-label';

type Json = Record<string, unknown>;

/** Context keys that are engine bookkeeping, not dossier data. */
const INTERNAL_KEYS = new Set(['owner_id', 'owner_groups', 'lang', 'department']);

/**
 * Oumma task-group labels — the Kogito "task-group metadata" endpoint doesn't
 * exist; the "view items" (the task list's columns) are derived from process
 * data, Flutter-style:
 *
 *  - "Current Step" (urlActive — clicking resolves the task to open)
 *  - one view item per field of the initial task's STEP FORM (the auth
 *    backend's form_fields — `$` stripped); the same names
 *    findDescriptionById/recursiveSearch resolve in the instance's
 *    global_context. The table renders `taskViewItems` and localizes the
 *    headers via the process's search items at render time.
 *  - schema-leaf fallback when no step form exists (e.g. Controle Juriste)
 *  - Status + Created (taskItems only — fixed table columns)
 */
export class OummaProcessPageService {
  constructor(
    private readonly oummaUrl: string,
    private readonly authUrl: string = BaseUrls.processServiceBaseUrl,
  ) {}

  async getTaskGroupLabel(process: ProcessApp, token: string): Promise<TaskGroupLabel[]> {
    const defs = await fetchDefinitions(this.oummaUrl.replace(/\/+$/, ''), token);
    const def = definitionFor(defs, process.id);
    if (!def) return [];

    const first = firstHumanTask(def);
    const fieldNames = (await this.stepFormFieldNames(process.id, first?.id ?? '', token))
      ?? leafFieldNames((first?.input_schema as Json | null) ?? null);

    const label = (
      id: number,
      description: string,
      itemColumnName: string,
      urlActive: boolean,
    ): TaskItemLabel => ({
      id,
      description,
      detailed: false,
      atomic: false,
      urlActive,
      itemColumnName,
      format: null,
      formatString: null,
    });

    const viewItems: TaskItemLabel[] = [
      label(1, i18n.t('colCurrentStep'), 'current_task', true),
      ...fieldNames.map((k, i) => label(2 + i, humanize(k), k, false)),
    ];
    const taskItems: TaskItemLabel[] = [
      ...viewItems,
      label(100, i18n.t('colStatus'), 'status', false),
      label(101, i18n.t('colCreated'), 'created', false),
    ];

    return [{ id: process.id, taskItems, taskViewItems: viewItems }];
  }

  /** Field names ($ stripped) of the auth-backend step form, or null. */
  private async stepFormFieldNames(
    processId: string,
    stepId: string,
    token: string,
  ): Promise<string[] | null> {
    if (!stepId) return null;
    try {
      const res = await apiClient.get(
        `${this.authUrl.replace(/\/+$/, '')}/forms/${processId}/${stepId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status !== 200 || !res.data) return null;
      const body = res.data as Json;
      const data = (body.data ?? body) as Json;
      const fields = Array.isArray(data.form_fields) ? (data.form_fields as Json[]) : [];
      const names = fields
        .map((f) => String(f.field_name ?? '').replace(/\$/g, '').trim())
        .filter((n) => n.length > 0 && !INTERNAL_KEYS.has(n));
      return names.length > 0 ? names : null;
    } catch (e) {
      appLogger.fine(`No step form for view items ${processId}/${stepId}: ${String(e)}`);
      return null;
    }
  }
}

/**
 * Deep leaf field names of a JSON Schema object (last key segment, deduped,
 * depth-limited). Nested objects recurse; arrays and scalars are leaves.
 */
function leafFieldNames(schema: Json | null, depth = 0, out: string[] = []): string[] {
  if (schema == null || depth > 4) return out;
  const props = (schema.properties as Json | undefined) ?? {};
  for (const [key, value] of Object.entries(props)) {
    if (INTERNAL_KEYS.has(key)) continue;
    const sub = value as Json;
    if (sub?.type === 'object' && sub.properties != null) {
      leafFieldNames(sub, depth + 1, out);
    } else if (!out.includes(key)) {
      out.push(key);
    }
  }
  return out;
}
