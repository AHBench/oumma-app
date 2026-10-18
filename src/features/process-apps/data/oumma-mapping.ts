import { apiClient } from '../../../core/http/client';
import type { Form, FormField } from '../../process-forms/data/models/form-model';

type Json = Record<string, unknown>;

/**
 * Oumma workflow-engine mappings — the shared adapter layer between the
 * Oumma REST API (brief/oumma) and the app's existing domain models.
 *
 * Oumma shapes (see oumma README / handler):
 *  - GET /definitions → OummaDefinition[]
 *  - GET /processes/{pid} → ExecutionState[]
 *  - ExecutionState: {process_id, definition_id, current_task_id,
 *      last_completed_task_id, status, active_task_instance_id,
 *      global_context, task_outputs, created_at, updated_at}
 */

export interface OummaTaskDef {
  id: string;
  type: string; // START | HUMAN | SYSTEM | END
  description?: string;
  group?: string;
  input_schema?: Json | null;
  output_schema?: Json | null;
  config?: { url?: string; method?: string } | null;
}

export interface OummaTopologyEdge {
  from?: string;
  to?: string;
  condition?: string;
  fork?: boolean;
  join_from?: string[];
}

export interface OummaDefinition {
  id: string;
  description: string;
  tasks: Record<string, OummaTaskDef>;
  start_task_id?: string;
  end_task_ids?: string[];
  topology?: OummaTopologyEdge[];
}

/** Raw instance state as returned by GET /processes/{pid}[/{id}]. */
export interface OummaState {
  process_id: string;
  definition_id: string;
  current_task_id?: string;
  last_completed_task_id?: string;
  status: string; // RUNNING | PAUSED | COMPLETED | FAILED | ABORTED
  active_task_instance_id?: string;
  global_context?: Json;
  task_outputs?: Json;
  created_at?: string;
  updated_at?: string;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

/** "declaration-sinistre" → "Declaration Sinistre" (keeps spaced names as-is). */
export function humanize(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ── definitions cache (per token) ─────────────────────────────────────────────

const defCache = new Map<string, Promise<OummaDefinition[]>>();

export function fetchDefinitions(
  oummaUrl: string,
  token: string,
): Promise<OummaDefinition[]> {
  const key = `${oummaUrl}|${token}`;
  let cached = defCache.get(key);
  if (!cached) {
    cached = apiClient
      .get(`${oummaUrl.replace(/\/+$/, '')}/definitions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => (Array.isArray(res.data) ? (res.data as OummaDefinition[]) : []))
      .catch((e) => {
        defCache.delete(key); // allow retry on transient failure
        throw e;
      });
    defCache.set(key, cached);
  }
  return cached;
}

export function definitionFor(
  defs: OummaDefinition[],
  processId: string,
): OummaDefinition | undefined {
  return defs.find((d) => d.id === processId);
}

export function humanTasks(def: OummaDefinition): OummaTaskDef[] {
  return Object.values(def.tasks).filter((t) => t.type === 'HUMAN');
}

export function firstHumanTask(def: OummaDefinition): OummaTaskDef | null {
  const humans = humanTasks(def);
  if (humans.length === 0) return null;
  const start = def.start_task_id ? def.tasks[def.start_task_id] : undefined;
  if (start && start.type === 'HUMAN') return start;
  // Walk the topology from the start task — the first HUMAN task reached is
  // the initial one. (Object key order of def.tasks is alphabetical in the
  // Go handler's JSON, not the workflow order.)
  const edges = def.topology ?? [];
  const startId = def.start_task_id ?? '';
  const queue: string[] = startId ? [startId] : [];
  const seen = new Set<string>(queue);
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const e of edges) {
      if (e.from !== cur || !e.to) continue;
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      const t = def.tasks[e.to];
      if (!t) continue;
      if (t.type === 'HUMAN') return t;
      if (t.type !== 'END') queue.push(e.to);
    }
  }
  return humans[0];
}

// ── JSON Schema → FormField[] (schema-driven forms) ──────────────────────────

function fieldTypeFor(prop: Json): string {
  if (Array.isArray(prop.enum)) return 'dropdown';
  switch (prop.type) {
    case 'number':
    case 'integer':
      return 'text'; // FormFieldFactory has no numeric type; free text is validated server-side
    case 'boolean':
      return 'checkbox';
    case 'object':
    case 'array':
      return 'json';
    default:
      return 'text';
  }
}

/** JSON Schema object → flat FormField list (top-level properties only). */
export function schemaToFields(schema: Json | null | undefined): FormField[] {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema.properties ?? {}) as Record<string, Json>;
  const required: string[] = Array.isArray(schema.required)
    ? (schema.required as unknown[]).map(String)
    : [];
  return Object.entries(props).map(([name, prop], i) => ({
    fieldType: fieldTypeFor(prop),
    fieldLabel: humanize(name),
    fieldName: name,
    fieldRequired: required.includes(name),
    fieldTab: '',
    fieldRow: i,
    fieldValue: undefined,
    fieldEdit: true,
    fieldOptions: Array.isArray(prop.enum)
      ? (prop.enum as unknown[]).map(String)
      : undefined,
    fieldHeaderDisplay: false,
    userCanAdd: false,
    fieldMultpleChoice: false,
  }));
}

// ── Dossier (Form) ← ExecutionState ──────────────────────────────────────────

const INTERNAL_CTX_KEYS = new Set(['owner_id', 'owner_groups', 'lang']);

export function isInstanceActive(state: OummaState): boolean {
  return state.status === 'RUNNING' || state.status === 'PAUSED';
}

/** ExecutionState → Form (the dossier model used by the grids/dialogs). */
export function instanceToForm(state: OummaState): Form {
  const id = state.process_id;
  const ctx: Json = state.global_context ?? {};
  const formInput: Json = { ...ctx };
  const formFields: FormField[] = [];
  Object.entries(ctx).forEach(([key, value], i) => {
    if (INTERNAL_CTX_KEYS.has(key)) return;
    formFields.push({
      fieldType:
        value != null && typeof value === 'object' ? 'json' : 'text',
      fieldLabel: humanize(key),
      fieldName: key,
      fieldRequired: false,
      fieldTab: '',
      fieldRow: i,
      fieldValue: value,
      fieldEdit: false,
      fieldHeaderDisplay:
        value == null ||
        (typeof value !== 'object') ||
        Array.isArray(value),
      userCanAdd: false,
      fieldMultpleChoice: false,
    });
  });
  return {
    formId: id,
    stepId: str(state.current_task_id),
    processInstanceIds: [id],
    launchable: false,
    formInput,
    formFields,
    createdAt: state.created_at != null ? str(state.created_at) : null,
    formVersion: str(state.current_task_id),
  };
}

// ── instances listing ────────────────────────────────────────────────────────

/** GET /processes/{pid} → active (RUNNING/PAUSED) states. */
export async function listActiveStates(
  oummaUrl: string,
  processId: string,
  token: string,
): Promise<OummaState[]> {
  const res = await apiClient.get(
    `${oummaUrl.replace(/\/+$/, '')}/processes/${processId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data: unknown = res.data;
  if (!Array.isArray(data)) return [];
  return (data as OummaState[]).filter(isInstanceActive);
}

/** GET /processes/{pid} → every state (dossier grids incl. finished ones). */
export async function listAllStates(
  oummaUrl: string,
  processId: string,
  token: string,
): Promise<OummaState[]> {
  const res = await apiClient.get(
    `${oummaUrl.replace(/\/+$/, '')}/processes/${processId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data: unknown = res.data;
  if (!Array.isArray(data)) return [];
  return (data as OummaState[]).filter((s) => s.status !== 'ABORTED');
}
