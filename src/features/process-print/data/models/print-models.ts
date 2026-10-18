type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

/** Mirrors filter_node.dart */
export interface FilterDescriptor {
  field?: string;
  operator?: string;
  value?: unknown;
  [key: string]: unknown;
}

export function filterDescriptorFromJson(json: Json): FilterDescriptor {
  return { ...json };
}

/** Mirrors print_template_model.dart */
export interface PrintTemplate {
  id: string;
  name: string;
  processId?: string | null;
  templateType?: 'pdf' | 'excel' | null;
  filters?: FilterDescriptor[] | null;
  allowedGroups?: string[] | null;
  allowedSteps?: Json[] | null;
  jsonTemplate: unknown;
}

export function printTemplateFromJson(json: Json): PrintTemplate {
  let allowedGroups: string[] | null = null;
  if (Array.isArray(json.allowed_groups)) {
    allowedGroups = (json.allowed_groups as unknown[]).map(String);
  } else if (Array.isArray(json.allowedGroups)) {
    allowedGroups = (json.allowedGroups as unknown[]).map(String);
  }

  let allowedSteps: Json[] | null = null;
  const rawSteps = Array.isArray(json.allowed_steps)
    ? json.allowed_steps
    : Array.isArray(json.allowedSteps)
      ? json.allowedSteps
      : null;
  if (rawSteps) {
    allowedSteps = rawSteps.filter(
      (e): e is Json => typeof e === 'object' && e !== null,
    );
  }

  let filters: FilterDescriptor[] | null = null;
  if (Array.isArray(json.filters)) {
    filters = (json.filters as unknown[])
      .filter((e): e is Json => typeof e === 'object' && e !== null)
      .map(filterDescriptorFromJson);
  }

  let templateType: 'pdf' | 'excel' | null = 'pdf';
  const rawType = str(json.template_type ?? json.templateType)
    .toLowerCase();
  if (rawType === 'excel' || rawType === 'xlsx') templateType = 'excel';
  else if (rawType === 'pdf') templateType = 'pdf';
  else templateType = null;

  return {
    id: str(json.id),
    name: str(json.name),
    processId: json.process_id != null ? str(json.process_id) : null,
    templateType,
    filters,
    allowedGroups,
    allowedSteps,
    jsonTemplate: json.jsonTemplate ?? json.json_template ?? null,
  };
}

/** Mirrors process_print_payload_model.dart */
export interface ProcessPrintPayload {
  templates: PrintTemplate[];
  inputData: Json;
}

export function processPrintPayloadFromJson(
  json: Json,
  inputData?: Json,
): ProcessPrintPayload {
  const templatesRaw = Array.isArray(json.templates) ? (json.templates as unknown[]) : [];
  const templates = templatesRaw
    .filter((t): t is Json => typeof t === 'object' && t !== null)
    .map(printTemplateFromJson);

  const merged: Json = {};
  if (inputData) Object.assign(merged, inputData);
  if (json.inputData && typeof json.inputData === 'object') {
    Object.assign(merged, json.inputData as Json);
  }
  if (json.data && typeof json.data === 'object') {
    Object.assign(merged, json.data as Json);
  }

  return { templates, inputData: merged };
}
