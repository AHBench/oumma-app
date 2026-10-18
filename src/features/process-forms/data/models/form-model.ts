type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

function parseBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

/**
 * Form field definition — mirrors
 * lib/features/process_forms/data/model/form_item_model.dart
 */
export interface FormField {
  fieldType: string;
  fieldLabel: string;
  fieldName: string;
  fieldRequired: boolean;
  fieldUnique?: boolean | null;
  fieldMinlength?: number | null;
  fieldPattern?: string | null;
  fieldTab: string;
  fieldRow: number;
  fieldValue?: unknown;
  fieldEdit: boolean;
  fieldOptions?: string[];
  fieldHeaderDisplay: boolean;
  fieldTemplate?: Json[] | null;
  fieldSource?: string | null;
  fieldSourceType?: string | null;
  apiKey?: string | null;
  fieldTableName?: string | null;
  fieldTableFieldNames?: string[];
  userCanAdd: boolean;
  fieldMultpleChoice: boolean;
}

export function formFieldFromJson(json: Json): FormField {
  let fieldTemplate: Json[] | null = null;
  if (Array.isArray(json.field_template)) {
    fieldTemplate = (json.field_template as unknown[])
      .filter((e) => typeof e === 'object' && e !== null)
      .map((e) => Object.fromEntries(
        Object.entries(e as Record<string, unknown>).map(([k, v]) => [k, v]),
      ));
  }

  const fieldRow =
    typeof json.field_row === 'number'
      ? (json.field_row as number)
      : Number.parseInt(str(json.field_row), 10) || 0;

  // The auth backend serialises the length limits as field_minLength /
  // field_maxLength (capital L); both casings are accepted.
  const minLength = json.field_minLength ?? json.field_minlength;

  return {
    fieldType: str(json.field_type),
    fieldLabel: str(json.field_label),
    // The auth backend names template fields with a leading $ (e.g.
    // "$firstName_fr"); the $ is a template marker, not part of the field
    // identity — strip it so the name matches the search items / engine
    // context keys ("FirstName_fr").
    fieldName: str(json.field_name).replace(/\$/g, ''),
    fieldRequired: typeof json.field_required === 'boolean' ? (json.field_required as boolean) : false,
    fieldUnique: json.field_unique != null && typeof json.field_unique === 'boolean' ? (json.field_unique as boolean) : null,
    fieldMinlength: typeof minLength === 'number' ? (minLength as number) : null,
    fieldPattern: json.field_pattern != null ? str(json.field_pattern) : null,
    fieldTab: str(json.field_tab),
    fieldRow,
    fieldValue: json.field_value,
    fieldEdit: typeof json.field_edit === 'boolean' ? (json.field_edit as boolean) : true,
    fieldOptions: Array.isArray(json.field_options)
      ? (json.field_options as unknown[]).map(String)
      : undefined,
    fieldHeaderDisplay:
      typeof json.field_header_display === 'boolean' ? (json.field_header_display as boolean) : false,
    fieldTemplate,
    fieldSource: json.field_source != null ? str(json.field_source) : null,
    fieldSourceType: json.field_source_type != null ? str(json.field_source_type) : null,
    apiKey: json.api_key != null ? str(json.api_key) : null,
    fieldTableName: json.field_table_name != null ? str(json.field_table_name) : null,
    fieldTableFieldNames: Array.isArray(json.field_table_field_names)
      ? (json.field_table_field_names as unknown[]).map(String)
      : undefined,
    userCanAdd: parseBool(json.user_can_add),
    fieldMultpleChoice: parseBool(json.field_multple_choice),
  };
}

export function formFieldToJson(field: FormField): Json {
  return {
    field_type: field.fieldType,
    field_label: field.fieldLabel,
    field_name: field.fieldName,
    field_value: field.fieldValue,
    field_required: field.fieldRequired,
    ...(field.fieldUnique != null ? { field_unique: field.fieldUnique } : {}),
    field_minlength: field.fieldMinlength,
    field_pattern: field.fieldPattern,
    field_tab: field.fieldTab,
    field_row: field.fieldRow,
    field_options: field.fieldOptions,
    field_header_display: field.fieldHeaderDisplay,
    field_edit: field.fieldEdit,
    ...(field.fieldTemplate ? { field_template: field.fieldTemplate } : {}),
    ...(field.fieldSource != null ? { field_source: field.fieldSource } : {}),
    ...(field.fieldSourceType != null ? { field_source_type: field.fieldSourceType } : {}),
    ...(field.apiKey != null ? { api_key: field.apiKey } : {}),
    ...(field.fieldTableName != null ? { field_table_name: field.fieldTableName } : {}),
    ...(field.fieldTableFieldNames ? { field_table_field_names: field.fieldTableFieldNames } : {}),
    ...(field.userCanAdd != null ? { user_can_add: field.userCanAdd } : {}),
    ...(field.fieldMultpleChoice ? { field_multple_choice: field.fieldMultpleChoice } : {}),
  };
}

/**
 * Form — mirrors lib/features/process_forms/data/model/form_model.dart
 */
export interface Form {
  formId?: string;
  stepId: string;
  processInstanceIds: string[];
  launchable: boolean;
  formInput: Json;
  formFields: FormField[];
  createdAt?: string | null; // ISO
  formVersion: string;
}

function parseFormInput(input: unknown): Json {
  if (input == null) return {};
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Json;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof input === 'object' && !Array.isArray(input)) {
    return input as Json;
  }
  return {};
}

function parseDate(date: unknown): string | null {
  if (date == null) return null;
  if (typeof date === 'number') return new Date(date).toISOString();
  if (typeof date === 'string') {
    const intValue = Number.parseInt(date, 10);
    if (!Number.isNaN(intValue) && /^\d+$/.test(date)) {
      return new Date(intValue).toISOString();
    }
    const parsed = Date.parse(date);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

function parseInstanceIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((e) => String(e)).filter((s) => s.trim() !== '');
  }
  if (typeof raw === 'string' && raw.trim() !== '') return [raw];
  return [];
}

export function formFromJson(json: Json): Form {
  return {
    formId: json.form_id != null ? String(json.form_id) : undefined,
    stepId: json.step_id != null ? String(json.step_id) : '',
    processInstanceIds: parseInstanceIds(json.process_instance_id),
    launchable: typeof json.launchable === 'boolean' ? (json.launchable as boolean) : false,
    formInput: parseFormInput(json.form_input),
    formFields: Array.isArray(json.form_fields)
      ? (json.form_fields as Json[]).map(formFieldFromJson)
      : [],
    createdAt: parseDate(json.created_at),
    formVersion: json.version != null ? String(json.version) : '',
  };
}

/** Exact `toJson` wire shape the management API expects (see Dart FormModel.toJson). */
export function formToJson(form: Form): Json {
  return {
    form_id: form.formId,
    step_id: form.stepId,
    process_instance_id: form.processInstanceIds,
    launchable: form.launchable,
    form_input: form.formInput,
    form_fields: form.formFields.map(formFieldToJson),
    created_at: form.createdAt ?? undefined,
    form_version: form.formVersion,
  };
}

/**
 * Localized field label — mirrors the auth-backend search_items table
 * (GET {process-service}/search-items/{processId}/{roles}). Field names are
 * stored WITHOUT the `$` prefix and matched case-insensitively.
 */
export interface SearchItem {
  fieldName: string;
  fieldType?: string;
  fieldLabelEn?: string;
  fieldLabelFr?: string;
  fieldLabelAr?: string;
}

/**
 * Port of json_value_dialog.lastKeySegment: "employee.first_name" →
 * "first_name", "phones[0].number" → "number".
 */
function lastKeySegment(key: string): string {
  let seg = key;
  const dot = seg.lastIndexOf('.');
  if (dot >= 0) seg = seg.substring(dot + 1);
  const bracket = seg.lastIndexOf('[');
  if (bracket >= 0) seg = seg.substring(0, bracket);
  return seg;
}

/**
 * Kind-aware label lookup for the process search-item catalog: menu items,
 * form tab titles, process-data fields and form field labels. The item's
 * field_type must match `kind` and the field name must match (case-
 * insensitive, `$`-insensitive). Language priority: active language first,
 * then fr, then en. Returns null when nothing matches.
 */
export function searchItemByKind(
  items: SearchItem[] | null | undefined,
  kind: string,
  name: string,
  lang: string,
): string | null {
  if (!items || items.length === 0 || !name) return null;
  const target = name.trim().toLowerCase();
  const noDollar = target.replace(/^\$/, '');
  for (const item of items) {
    if ((item.fieldType ?? '').trim().toLowerCase() !== kind) continue;
    // Normalize the $ prefix on BOTH sides: form fields arrive without
    // the $ (form-model strips it) while catalog names keep it.
    const nm = (item.fieldName ?? '').trim().toLowerCase();
    if (nm.replace(/^\$/, '') !== noDollar) continue;
    const primary =
      lang === 'ar' ? item.fieldLabelAr : lang === 'fr' ? item.fieldLabelFr : item.fieldLabelEn;
    const fallbacks =
      lang === 'ar'
        ? [item.fieldLabelFr, item.fieldLabelEn]
        : lang === 'fr'
          ? [item.fieldLabelEn]
          : [item.fieldLabelFr];
    if (primary && primary.trim()) return primary;
    for (const fb of fallbacks) {
      if (fb && fb.trim()) return fb;
    }
    return null;
  }
  return null;
}

/**
 * Port of json_value_dialog.labelFromSearchItems — locale-aware label
 * lookup over search items. Tries the full key first, then its last
 * segment; the item's field name may or may not carry the `$` prefix.
 * Language priority: the active language first, then fr, then en.
 * Returns null when nothing matches or every label is empty — the caller
 * falls back to the field's own field_label.
 */
export function searchItemLabel(
  items: SearchItem[] | null | undefined,
  key: string,
  lang: string,
): string | null {
  if (!items || items.length === 0) return null;
  const normalizedKey = key.trim().toLowerCase();
  const candidates = [normalizedKey];
  const last = lastKeySegment(normalizedKey).trim().toLowerCase();
  if (last && last !== candidates[0]) candidates.push(last);
  for (const candidate of candidates) {
    const noDollar = candidate.replace(/^\$/, '');
    for (const item of items) {
      // Normalize the $ prefix on both sides (form fields carry no $,
      // catalog names do).
      const name = (item.fieldName ?? '').trim().toLowerCase();
      const nameNoDollar = name.replace(/^\$/, '');
      if (nameNoDollar === candidate || nameNoDollar === noDollar) {
        const primary =
          lang === 'ar' ? item.fieldLabelAr : lang === 'fr' ? item.fieldLabelFr : item.fieldLabelEn;
        const fallbacks =
          lang === 'ar'
            ? [item.fieldLabelFr, item.fieldLabelEn]
            : lang === 'fr'
              ? [item.fieldLabelEn]
              : [item.fieldLabelFr];
        if (primary && primary.trim()) return primary;
        for (const fb of fallbacks) {
          if (fb && fb.trim()) return fb;
        }
        return null;
      }
    }
  }
  return null;
}

/**
 * Port of DecisionForm.updateNestedKeys — expands the user's flat field
 * values into the nested `form_input` template. The auth-backend step form
 * embeds `$field` placeholders inside the nested template (e.g.
 * `customer.firstName_fr: "$firstName_fr"`); for each submitted value the
 * matching template key (field name with the `$` stripped) is replaced, so
 * the submitted structure matches the engine's input/output schema.
 */
export function updateNestedKeys(target: Json, source: Json): void {
  for (const [key, value] of Object.entries(source)) {
    for (const [k, v] of Object.entries(target)) {
      if (k === key.replace(/\$/g, '')) {
        if (
          v && typeof v === 'object' && !Array.isArray(v) &&
          value && typeof value === 'object' && !Array.isArray(value)
        ) {
          updateNestedKeys(v as Json, value as Json);
        } else {
          target[k] = value instanceof Date ? value.toISOString() : value;
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        updateNestedKeys(v as Json, { [key]: value });
      }
    }
  }
}
