import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormField, Form } from '../../data/models/form-model.ts';
import { searchItemByKind, searchItemLabel, updateNestedKeys } from '../../data/models/form-model.ts';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import { useFormSearchItems } from '../../../shared/hooks/use-queries';
import { getDependencies } from '../../../../core/di';

type Json = Record<string, unknown>;

interface FieldProps {
  field: FormField;
  value: unknown;
  onChange?(name: string, value: unknown): void;
  readOnly?: boolean;
  token?: string | null;
}

/**
 * FormFieldFactory — the React port of
 * process_forms/presentation/pages/widgets/form_field_factory.dart.
 * Switches on the field's `type`; unknown types fall back to the normalized
 * `field_source_type` (internalapi → dropdown via internal REST endpoint,
 * internalapiconfig → params_* table rows).
 */
export function FormFieldFactory(props: FieldProps) {
  const { field, value, onChange, readOnly, token } = props;

  const effectiveReadOnly = readOnly || !field.fieldEdit;
  const [error, setError] = useState<string | null>(null);

  const set = (v: unknown) => {
    validate(v);
    onChange?.(field.fieldName, v);
  };

  const validate = (v: unknown): void => {
    const err: string[] = [];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (field.fieldRequired && empty) err.push('required');
    const str = typeof v === 'string' ? v : '';
    if (!empty && field.fieldMinlength != null && str.length < (field.fieldMinlength ?? 0)) {
      err.push(`min length ${field.fieldMinlength}`);
    }
    if (!empty && field.fieldPattern && field.fieldPattern.length > 0) {
      try {
        if (!new RegExp(field.fieldPattern).test(str)) err.push(`pattern ${field.fieldPattern}`);
      } catch {
        /* invalid regex from backend: skip */
      }
    }
    setError(err.length > 0 ? `Invalid value (${err.join(', ')})` : null);
  };

  const inputClass = `w-full rounded border px-2 py-1 text-(--app-fs-base) outline-none focus:border-(--accent) ${
    error
      ? 'border-danger-500'
      : 'border-separator'
  } bg-surface-secondary text-foreground ${
    effectiveReadOnly ? 'opacity-70' : ''
  }`;

  let control: React.ReactNode = null;
  switch (field.fieldType) {
    case 'text':
    case 'email':
      control = (
        <input
          type={field.fieldType === 'email' ? 'email' : 'text'}
          className={inputClass}
          value={typeof value === 'string' ? value : value == null ? '' : String(value)}
          readOnly={effectiveReadOnly}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case 'date':
      control = (
        <input
          type="date"
          className={inputClass}
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          readOnly={effectiveReadOnly}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case 'dropdown':
      control = (
        <select
          className={inputClass}
          value={typeof value === 'string' ? value : ''}
          disabled={effectiveReadOnly}
          onChange={(e) => set(e.target.value)}
        >
          <option value="">—</option>
          {(field.fieldOptions ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'choicelist': {
      if (field.fieldMultpleChoice) {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        control = (
          <div className="flex flex-wrap gap-2">
            {(field.fieldOptions ?? []).map((o) => (
              <label key={o} className="flex items-center gap-1 text-(--app-fs-base)">
                <input
                  type="checkbox"
                  disabled={effectiveReadOnly}
                  checked={selected.includes(o)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, o]
                      : selected.filter((x) => x !== o);
                    set(next);
                  }}
                />
                {o}
              </label>
            ))}
          </div>
        );
      } else {
        control = (
          <select
            className={inputClass}
            value={typeof value === 'string' ? value : ''}
            disabled={effectiveReadOnly}
            onChange={(e) => set(e.target.value)}
          >
            <option value="">—</option>
            {(field.fieldOptions ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      }
      break;
    }
    case 'json':
    case 'json list':
    case 'json_list':
      control = (
        <JsonField field={field} value={value} onChange={(v) => set(v)} readOnly={effectiveReadOnly} />
      );
      break;
    case 'checkbox':
      control = (
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={value === true}
          disabled={effectiveReadOnly}
          onChange={(e) => set(e.target.checked)}
        />
      );
      break;
    default:
      // Unknown type: fall back to the normalized field_source_type.
      if (field.fieldSourceType === 'internalapi' && field.fieldSource) {
        control = (
          <InternalApiDropdownField
            field={field}
            value={value}
            onChange={(v) => set(v)}
            readOnly={effectiveReadOnly}
            token={token}
          />
        );
      } else if (field.fieldSourceType === 'internalapiconfig' || field.fieldSourceType === 'Internal-API-Config') {
        control = (
          <InternalApiConfigField
            field={field}
            value={value}
            onChange={(v) => set(v)}
            readOnly={effectiveReadOnly}
            token={token}
          />
        );
      } else {
        control = (
          <input
            type="text"
            className={inputClass}
            value={typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)}
            readOnly={effectiveReadOnly}
            onChange={(e) => set(e.target.value)}
          />
        );
      }
  }

  return (
    <div className="mb-1.5">
      {field.fieldLabel ? (
        <label className="mb-0.5 block text-(--app-fs-base) font-medium text-foreground">
          {field.fieldLabel}
          {field.fieldRequired ? <span className="text-(--danger)"> *</span> : null}
        </label>
      ) : null}
      {control}
      {error ? <p className="mt-0.5 text-(--app-fs-small) text-(--danger)">{error}</p> : null}
    </div>
  );
}

/* ---------------------------------- JSON field ---------------------------------- */

function JsonField({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FormField;
  value: unknown;
  onChange(v: unknown): void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const isList = field.fieldType === 'json list' || field.fieldType === 'json_list';
  const text =
    value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(text);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <div>
      <textarea
        rows={4}
        className={`w-full rounded border font-mono text-(--app-fs-base) px-2 py-1 outline-none focus:border-(--accent) ${
          invalid ? 'border-danger-500' : 'border-separator'
        } bg-surface-secondary text-foreground ${
          readOnly ? 'opacity-70' : ''
        }`}
        value={draft}
        readOnly={readOnly}
        onChange={(e) => {
          setDraft(e.target.value);
          let ok = true;
          try {
            const parsed: unknown = JSON.parse(e.target.value || (isList ? '[]' : '{}'));
            ok = isList ? Array.isArray(parsed) : parsed != null;
          } catch {
            ok = false;
          }
          setInvalid(!ok);
          if (ok) {
            try {
              onChange(JSON.parse(e.target.value || (isList ? '[]' : '{}')));
            } catch {
              /* ignore */
            }
          }
        }}
      />
      {invalid ? <p className="mt-0.5 text-(--app-fs-small) text-(--danger)">{t('invalidJson')}</p> : null}
    </div>
  );
}

/* ---------------------------------- internalapi dropdown ---------------------------------- */

function InternalApiDropdownField({
  field,
  value,
  onChange,
  readOnly,
  token,
}: {
  field: FormField;
  value: unknown;
  onChange(v: unknown): void;
  readOnly: boolean;
  token?: string | null;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setOptions(null);
    setError(null);
    getDependencies()
      .internalApiFieldSource.fetchDropdownOptions(field.fieldSource!, token ?? null, field.apiKey ?? null)
      .then((opts) => alive && setOptions(opts))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [field.fieldSource, field.apiKey, token]);

  if (error) return <p className="text-(--app-fs-small) text-(--danger)">{error}</p>;
  if (options == null) return <p className="text-(--app-fs-small) text-muted">{t('loadingOptions')}</p>;
  return (
    <select
      className="input w-full"
      value={typeof value === 'string' ? value : ''}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------- internalapiconfig (params_ table) ---------------------------------- */

function InternalApiConfigField({
  field,
  value,
  onChange,
  readOnly,
  token,
}: {
  field: FormField;
  value: unknown;
  onChange(v: unknown): void;
  readOnly: boolean;
  token?: string | null;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Json[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!field.fieldTableName) {
      setError(t('noParamsTable'));
      return;
    }
    getDependencies()
      .internalApiFieldSource.fetchTableRows(field.fieldTableName, token ?? null)
      .then(setRows)
      .catch((e) => setError(String(e)));
  };

  useEffect(load, [field.fieldTableName, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!field.fieldTableName) return <p className="text-(--app-fs-small) text-(--danger)">{error ?? t('noParamsTable')}</p>;
  if (error) return <p className="text-(--app-fs-small) text-(--danger)">{error}</p>;
  if (rows == null) return <p className="text-(--app-fs-small) text-muted">{t('loadingValues')}</p>;

  if (field.fieldMultpleChoice) {
    const selected = Array.isArray(value) ? (value as Json[]) : [];
    return (
      <div className="space-y-1">
        {rows.map((row, i) => {
          const label = InternalApiConfigField.labelFor(row, field.fieldTableFieldNames);
          const checked = selected.some((r) => r == null ? false : r === row || labelOf(r) === label);
          return (
            <label key={i} className="flex items-center gap-1 text-(--app-fs-base)">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, row]
                    : selected.filter((r) => !(r && (r === row || labelOf(r) === label)));
                  onChange(next);
                }}
              />
              {label}
            </label>
          );
        })}
      </div>
    );
  }

  const labelOf = (r: unknown): string =>
    r && typeof r === 'object'
      ? InternalApiConfigField.labelFor(r as Json, field.fieldTableFieldNames)
      : String(r ?? '');

  return (
    <div>
      <select
        className="input w-full"
        value={
          value && typeof value === 'object'
            ? labelOf(value)
            : typeof value === 'string'
              ? value
              : ''
        }
        disabled={readOnly}
        onChange={(e) => {
          const row = rows.find((r) => InternalApiConfigField.labelFor(r, field.fieldTableFieldNames) === e.target.value);
          onChange(row ?? e.target.value);
        }}
      >
        <option value="">—</option>
        {rows.map((row, i) => {
          const label = InternalApiConfigField.labelFor(row, field.fieldTableFieldNames);
          return (
            <option key={i} value={label}>
              {label}
            </option>
          );
        })}
      </select>
      {field.userCanAdd && !readOnly ? (
        <button
          type="button"
          className="mt-1 text-(--app-fs-small) text-(--accent) hover:underline"
          onClick={() => {
            const name = window.prompt('New value (comma-separated columns)');
            if (!name) return;
            const parts = name.split(',').map((s) => s.trim());
            const cols = field.fieldTableFieldNames ?? ['value'];
            const fields: Json = {};
            cols.forEach((c, i) => {
              fields[c] = parts[i] ?? '';
            });
            getDependencies()
              .internalApiFieldSource.insertTableRow(field.fieldTableName!, fields, token ?? null)
              .then(load)
              .catch((e) => setError(String(e)));
          }}
        >
          + Add value
        </button>
      ) : null}
    </div>
  );
}

// Static-ish label helper (columns joined, like _labelFor in the Dart factory)
InternalApiConfigField.labelFor = (row: Json, columns?: string[]): string => {
  if (columns && columns.length > 0) {
    return columns.map((c) => String(row[c] ?? '')).join(' ');
  }
  return Object.values(row)
    .filter((v) => v != null && (typeof v === 'string' || typeof v === 'number'))
    .map(String)
    .join(' ');
};

/** Exported for decision-form value normalization (port of activeSourceRowLabel). */
export const internalApiRowLabel: (row: Json, columns?: string[]) => string = InternalApiConfigField.labelFor;

/**
 * Port of form_field_factory.normalizeInternalApiConfigValue — an
 * internal-API-config field must reach the process input as a label string
 * (single choice) or list of label strings, never as raw row maps.
 */
export function normalizeInternalApiConfigValue(
  value: unknown,
  field: { fieldSourceType?: string | null; fieldTableFieldNames?: string[] },
): unknown {
  const sourceType = (field.fieldSourceType ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sourceType !== 'internalapiconfig') return value;
  const columns = field.fieldTableFieldNames ?? [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return internalApiRowLabel(value as Json, columns);
  }
  if (Array.isArray(value)) {
    return value.map((e) => (e && typeof e === 'object' ? internalApiRowLabel(e as Json, columns) : e));
  }
  return value;
}

/**
 * Builds the form_input to submit (port of create_form._submitForm /
 * DecisionForm._submitForm): per-type defaults for every field, then the
 * user's values, then internal-API-config normalisation, then expansion into
 * the step form's (possibly nested) form_input template via updateNestedKeys.
 */
/**
 * Port of create_form._submitForm's value resolution: for every field, the
 * user value (or per-type default), normalized — written back to
 * `field.fieldValue` so the saved form carries its values (the edit dialog
 * and the pending-form list display them from there).
 */
export function resolveFieldValues(form: Form, values: Json): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const field of form.formFields) {
    const t = field.fieldType.toLowerCase();
    const defaultValue =
      t.includes('number') || t.includes('int') || t.includes('double')
        ? 0
        : t.includes('bool') || t.includes('checkbox')
          ? false
          : '';
    const raw = field.fieldName in values ? values[field.fieldName] : field.fieldValue ?? defaultValue;
    out.set(field.fieldName, normalizeInternalApiConfigValue(raw, field));
  }
  return out;
}

export function buildSubmittedFormInput(form: Form, values: Json): Json {
  const extracted: Json = {};
  for (const field of form.formFields) {
    const t = field.fieldType.toLowerCase();
    const defaultValue =
      t.includes('number') || t.includes('int') || t.includes('double')
        ? 0
        : t.includes('bool') || t.includes('checkbox')
          ? false
          : '';
    extracted[field.fieldName] = field.fieldValue ?? defaultValue;
  }
  for (const [k, v] of Object.entries(values)) extracted[k] = v;
  for (const field of form.formFields) {
    const name = field.fieldName;
    if (name in extracted) {
      extracted[name] = normalizeInternalApiConfigValue(extracted[name], field);
    }
  }
  const merged: Json = JSON.parse(JSON.stringify(form.formInput ?? {}));
  updateNestedKeys(merged, extracted);
  // The decision output must reach the PROCESS DATA: the engine merges the
  // completion input into the instance's global context, from which every
  // later step (human or system) reads its input. Template expansion above
  // only covers keys declared in form_input — any other field the user set
  // would be silently dropped. Write each user-provided value under its
  // field_name whenever the result doesn't carry it yet.
  for (const field of form.formFields) {
    const name = field.fieldName; // model strips the $ template marker
    if (!(name in values)) continue;
    if (!(name in merged) && extracted[name] !== undefined) {
      merged[name] = extracted[name];
    }
  }
  return merged;
}

/* ---------------------------------- Form renderer ---------------------------------- */

/**
 * Renders a full form (grouped by tab, ordered by row) — used by the
 * dossier display, task views and create-form pages.
 */
export function FormRenderer({
  form,
  values,
  onChange,
  readOnly,
  token,
  process,
}: {
  form: Form;
  values: Json;
  onChange?(name: string, value: unknown): void;
  readOnly?: boolean;
  token?: string | null;
  process?: ProcessApp | null;
}) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  // Localized labels (EN/FR/AR per language context), falling back to
  // field_label. The catalog comes from the process DTO itself when the
  // backend carries it (zero extra requests — a failed request can no
  // longer leave labels untranslated); otherwise the dedicated
  // search-items query (role-scoped override) is used.
  const { data: queriedItems } = useFormSearchItems({
    process: process ?? null,
    token: token ?? null,
  });
  const searchItems =
    process && process.searchItems.length > 0 ? process.searchItems : queriedItems;
  const fields = useMemo(
    () =>
      searchItems && searchItems.length > 0
        ? form.formFields.map((f) => {
            const label = searchItemLabel(searchItems as Parameters<typeof searchItemLabel>[0], f.fieldName, i18n.language);
            return label ? { ...f, fieldLabel: label } : f;
          })
        : form.formFields,
    [form.formFields, searchItems, i18n.language],
  );
  // Flutter parity (update_form.dart): fields without a tab land in
  // "General"; tab names sorted alphabetically; the tab bar is always shown;
  // fields within a tab are ordered by field_row.
  const tabOf = (f: FormField) => f.fieldTab || 'General';
  const tabs = [...new Set(fields.map(tabOf))].sort();
  // Tab titles resolve through the process search-item catalog (type "tab"),
  // falling back to the raw tab name.
  const tabTitle = (name: string) =>
    searchItemByKind(searchItems, 'tab', name, i18n.language) ?? name;
  const currentTab = activeTab && tabs.includes(activeTab) ? activeTab : (tabs[0] ?? '');

  const tabFields = (tab: string) =>
    fields
      .filter((f) => tabOf(f) === tab)
      .sort((a, b) => a.fieldRow - b.fieldRow);

  return (
    <div>
      {tabs.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1 border-b border-separator">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-1 text-(--app-fs-base) ${
                tab === currentTab
                  ? 'border-b-2 border-(--accent) font-semibold text-(--accent)'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {tabTitle(tab)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        {tabFields(currentTab).map((field) => (
          <FormFieldFactory
            key={field.fieldName}
            field={field}
            value={
              Object.prototype.hasOwnProperty.call(values, field.fieldName)
                ? values[field.fieldName]
                : field.fieldValue
            }
            onChange={onChange}
            readOnly={readOnly}
            token={token}
          />
        ))}
      </div>
      {tabs.length === 0 ? (
        <p className="py-4 text-center text-(--app-fs-base) text-muted">{t('noFormFields')}</p>
      ) : null}
    </div>
  );
}
