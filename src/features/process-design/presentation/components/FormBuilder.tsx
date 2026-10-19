import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDependencies } from '../../../../core/di';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { AUTHORIZED_FIELD_TYPES } from '../../domain/design-tools';
import type { AuthorizedFieldType, FieldTemplateItem } from '../../domain/design-tools';

type Json = Record<string, unknown>;

export interface FormField {
  field_row: number;
  field_tab: string;
  field_type: string;
  field_label: string;
  field_name: string;
  field_required: boolean;
  field_edit: boolean;
  field_header_display: boolean;
  field_minLength: number | null;
  field_maxLength: number | null;
  field_pattern: string | null;
  field_options: string[] | null;
  field_source: string | null;
  field_source_type: string | null;
  field_multple_choice: boolean | undefined; // sic — wire parity
  field_unique: boolean;
  user_can_add: boolean;
  field_template: FieldTemplateItem[]; // json list only
}

export interface FormStep {
  step_id: string;
  launchable: boolean;
  form_input: Record<string, unknown> | null;
  form_fields: FormField[];
}

const emptyField = (row: number): FormField => ({
  field_row: row,
  field_tab: 'General',
  field_type: 'text',
  field_label: '',
  field_name: '',
  field_required: false,
  field_edit: true,
  field_header_display: false,
  field_minLength: null,
  field_maxLength: null,
  field_pattern: null,
  field_options: [],
  field_source: null,
  field_source_type: null,
  field_multple_choice: undefined,
  field_unique: false,
  user_can_add: false,
  field_template: [],
});

/**
 * Visual form builder (req: authorized field types only). Edits one form
 * step; saving posts it through /api/management/add-forms after validation
 * and explicit user confirmation.
 */
export function FormBuilder({
  processId,
  steps,
  onSaved,
  readOnly = false,
}: {
  processId: string;
  steps: FormStep[];
  onSaved: () => void;
  /** Read-only mode (viewing an old design version): every control is
      disabled; the step picker stays usable to browse the steps. */
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const token = user?.accessToken ?? '';
  const ds = getDependencies().designDataSource;

  const [selected, setSelected] = useState<string>('');

  const [stepId, setStepId] = useState('');
  const [launchable, setLaunchable] = useState(false);
  const [formInput, setFormInput] = useState('');
  const [fields, setFields] = useState<FormField[]>([emptyField(1)]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The step-id input wins over the dropdown selection: editing it while a
  // step is selected RENAMEs that step (add-forms would create a duplicate,
  // so the save path routes renames through the in-place update endpoint).
  const effectiveStepId = stepId || selected || processId;

  const issues = useMemo(() => validate(processId, effectiveStepId, formInput, fields), [
    processId, effectiveStepId, formInput, fields,
  ]);
  const issueText = (v: { key: string; n?: number }) => (v.n != null ? t(v.key, { n: v.n }) : t(v.key));

  // Read-only: open on the first step so the version's form is visible.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (readOnly && !autoPicked.current && steps.length > 0 && !selected) {
      autoPicked.current = true;
      choose(steps[0].step_id);
    }
  }, [readOnly, steps, selected]);

  const choose = (id: string) => {
    setSelected(id);
    setStatus(null);
    setConfirming(false);
    const st = steps.find((s) => s.step_id === id);
    if (st) {
      setStepId(id);
      setLaunchable(!!st.launchable);
      setFormInput(st.form_input ? JSON.stringify(st.form_input, null, 2) : '');
      setFields(st.form_fields.length ? st.form_fields.map((f) => ({ ...emptyField(f.field_row), ...f })) : [emptyField(1)]);
    } else if (id === '__new__') {
      setStepId(processId);
      setLaunchable(true);
      setFormInput('');
      setFields([emptyField(1)]);
    } else {
      setStepId(id);
      setLaunchable(false);
      setFormInput('');
      setFields([emptyField(1)]);
    }
  };

  const patch = (i: number, p: Partial<FormField>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));

  const save = async () => {
    try {
      const formInputObj: Record<string, unknown> | undefined = formInput.trim()
        ? JSON.parse(formInput)
        : undefined;
      const fieldPayload = fields.map((f) => ({
        ...f,
        field_options: f.field_type === 'dropdown' ? f.field_options : undefined,
        field_template: f.field_type === 'json list' ? f.field_template : undefined,
      }));
      // Renaming an existing step (selected !== '') goes through the
      // in-place update endpoint — add-forms would create a duplicate.
      const isRename = !!selected && selected !== effectiveStepId;
      const res = (isRename
        ? await ds.updateFormStep(
            processId,
            selected,
            {
              newStepId: effectiveStepId,
              launchable,
              formInput: formInputObj ?? null,
              fields: fieldPayload as Json[],
            },
            token,
          )
        : await ds.addForm(
            processId,
            effectiveStepId,
            {
              launchable,
              formInput: formInputObj ?? null,
              fields: fieldPayload as Json[],
            },
            token,
          )) as Json;
      const ok = res?.status !== 'error';
      setStatus(ok ? { kind: 'ok', text: t('formBuilderSaved') } : { kind: 'err', text: String(res?.message ?? 'error') });
      if (ok) {
        setSelected('');
        onSaved();
      }
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Step picker */}
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => choose(e.target.value)}
          className="min-w-0 flex-1 rounded-(--app-radius) border border-separator bg-surface px-2 py-1.5 text-(--app-fs-small)"
        >
          {!readOnly ? <option value="">{t('formBuilderNewStep')}</option> : null}
          {steps.map((s) => (
            <option key={s.step_id} value={s.step_id}>{s.step_id}{s.launchable ? ` (${t('designMetaLaunchable')})` : ''}</option>
          ))}
        </select>
      </div>

      {/* fieldset[disabled] disables every control inside (read-only mode) */}
      <fieldset disabled={readOnly} className="contents">

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
          {t('formBuilderStepId')}
          <input value={stepId} onChange={(e) => setStepId(e.target.value)}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1.5 text-(--app-fs-small) text-foreground" />
        </label>
        <label className="flex items-end gap-2 pb-1.5 text-(--app-fs-small)">
          <input type="checkbox" checked={launchable} onChange={(e) => setLaunchable(e.target.checked)} />
          {t('designMetaLaunchable')}
        </label>
      </div>

      <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
        form_input ({t('formBuilderFormInputHint')})
        <textarea value={formInput} onChange={(e) => setFormInput(e.target.value)} rows={3}
          className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1.5 font-mono text-(--app-fs-small) text-foreground" />
      </label>

      {/* Fields */}
      <div className="flex flex-col gap-2">
        {fields.map((f, i) => (
          <div key={i} className="rounded-(--app-radius) border border-separator p-2">
            <div className="grid grid-cols-4 gap-2">
              <label className="col-span-2 flex flex-col gap-1 text-(--app-fs-small) text-muted">
                {t('formBuilderFieldName')}
                <input value={f.field_name} onChange={(e) => patch(i, { field_name: e.target.value })}
                  placeholder="$amount" className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                {t('formBuilderFieldLabel')}
                <input value={f.field_label} onChange={(e) => patch(i, { field_label: e.target.value })}
                  className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                {t('formBuilderFieldType')}
                <select value={f.field_type}
                  onChange={(e) => patch(i, { field_type: e.target.value as AuthorizedFieldType })}
                  className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground">
                  {AUTHORIZED_FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2">
              <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                {t('formBuilderFieldTab')}
                <input value={f.field_tab} onChange={(e) => patch(i, { field_tab: e.target.value })}
                  className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                min / max length
                <div className="flex gap-1">
                  <input type="number" value={f.field_minLength ?? ''}
                    onChange={(e) => patch(i, { field_minLength: e.target.value ? Number(e.target.value) : null })}
                    className="w-1/2 rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
                  <input type="number" value={f.field_maxLength ?? ''}
                    onChange={(e) => patch(i, { field_maxLength: e.target.value ? Number(e.target.value) : null })}
                    className="w-1/2 rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
                </div>
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-(--app-fs-small) text-muted">
                {t('formBuilderFieldPattern')}
                <input value={f.field_pattern ?? ''} onChange={(e) => patch(i, { field_pattern: e.target.value || null })}
                  className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 font-mono text-(--app-fs-small) text-foreground" />
              </label>
            </div>

            {/* Type-specific controls */}
            {f.field_type === 'dropdown' && (
              <label className="mt-2 flex flex-col gap-1 text-(--app-fs-small) text-muted">
                {t('formBuilderOptions')} (comma-separated)
                <input value={(f.field_options ?? []).join(', ')}
                  onChange={(e) => patch(i, { field_options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
              </label>
            )}
            {f.field_type === 'external' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                  {t('formBuilderFieldSource')}
                  <input value={f.field_source ?? ''} onChange={(e) => patch(i, { field_source: e.target.value || null })}
                    className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
                </label>
                <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                  {t('formBuilderSourceType')}
                  <select value={f.field_source_type ?? 'Internal-API'}
                    onChange={(e) => patch(i, { field_source_type: e.target.value })}
                    className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground">
                    <option value="Internal-API">Internal-API</option>
                    <option value="Internal-API-Config">Internal-API-Config</option>
                  </select>
                </label>
              </div>
            )}
            {f.field_type === 'json list' && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="text-(--app-fs-small) text-muted">{t('formBuilderJsonListTemplate')}</div>
                {f.field_template.map((item, ti) => (
                  <div key={ti} className="flex gap-1">
                    <input value={item.fieldName} placeholder="name"
                      onChange={(e) => patch(i, { field_template: f.field_template.map((x, xi) => xi === ti ? { ...x, fieldName: e.target.value } : x) })}
                      className="w-1/4 rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
                    <input value={item.fieldLabel} placeholder="label"
                      onChange={(e) => patch(i, { field_template: f.field_template.map((x, xi) => xi === ti ? { ...x, fieldLabel: e.target.value } : x) })}
                      className="w-1/3 rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground" />
                    <select value={item.fieldType}
                      onChange={(e) => patch(i, { field_template: f.field_template.map((x, xi) => xi === ti ? { ...x, fieldType: e.target.value } : x) })}
                      className="w-1/4 rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground">
                      {AUTHORIZED_FIELD_TYPES.filter((ty) => ty !== 'json list').map((ty) => <option key={ty} value={ty}>{ty}</option>)}
                    </select>
                    <button type="button" onClick={() => patch(i, { field_template: f.field_template.filter((_, xi) => xi !== ti) })}
                      className="rounded-(--app-radius) px-2 text-(--app-fs-small) text-red-400">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => patch(i, { field_template: [...f.field_template, { fieldName: '', fieldLabel: '', fieldType: 'text' }] })}
                  className="self-start rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small)">+ {t('formBuilderAddTemplateRow')}</button>
              </div>
            )}

            <div className="mt-2 flex items-center gap-4 text-(--app-fs-small)">
              <label className="flex items-center gap-1.5" title={t('formBuilderUniqueHint')}>
                <input type="checkbox" checked={f.field_unique === true} onChange={(e) => patch(i, { field_unique: e.target.checked })} />
                {t('formBuilderUnique')}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.field_required} onChange={(e) => patch(i, { field_required: e.target.checked })} />
                {t('formBuilderRequired')}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.field_edit} onChange={(e) => patch(i, { field_edit: e.target.checked })} />
                {t('formBuilderEditable')}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!f.field_header_display} onChange={(e) => patch(i, { field_header_display: e.target.checked })} />
                {t('formBuilderHeaderDisplay')}
              </label>
              {f.field_type === 'text' && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!f.field_multple_choice} onChange={(e) => patch(i, { field_multple_choice: e.target.checked })} />
                  multi-choice
                </label>
              )}
              <button type="button" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
                className="ml-auto rounded-(--app-radius) px-2 py-0.5 text-red-400">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setFields((fs) => [...fs, emptyField((fs[fs.length - 1]?.field_row ?? 0) + 1)])}
          className="self-start rounded-(--app-radius) border border-separator px-3 py-1 text-(--app-fs-small)">
          + {t('formBuilderAddField')}
        </button>
      </div>

      {/* Validation */}
      {!readOnly && issues.length > 0 && (
        <div className="rounded-(--app-radius) border border-red-500/40 bg-red-500/10 p-2 text-(--app-fs-small) text-red-300">
          {issues.map((iss, i) => <div key={i}>• {issueText(iss)}</div>)}
        </div>
      )}

      {/* Save (with explicit confirmation) */}
      <div className="flex items-center gap-3">
        <button type="button" disabled={issues.length > 0 || !effectiveStepId} onClick={() => setConfirming(true)}
          className="rounded-(--app-radius) bg-(--accent) px-4 py-1.5 text-(--app-fs-small) font-medium text-white disabled:opacity-40">
          {t('formBuilderSave')}
        </button>
        {confirming && (
          <>
            <span className="text-(--app-fs-small) text-muted">{t('formBuilderConfirm')}</span>
            <button type="button" onClick={() => { setConfirming(false); void save(); }}
              className="rounded-(--app-radius) bg-emerald-600 px-3 py-1.5 text-(--app-fs-small) text-white">{t('designChatConfirm')}</button>
            <button type="button" onClick={() => setConfirming(false)}
              className="rounded-(--app-radius) border border-separator px-3 py-1.5 text-(--app-fs-small)">✕</button>
          </>
        )}
        {status && (
          <span className={`text-(--app-fs-small) ${status.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{status.text}</span>
        )}
      </div>
      </fieldset>
    </div>
  );
}

/** Validation rules (mirrors the brief management rules). Returns i18n keys (n = field index). */
function validate(processId: string, stepId: string, formInputRaw: string, fields: FormField[]): { key: string; n?: number }[] {
  const out: { key: string; n?: number }[] = [];
  if (!stepId) out.push({ key: 'formBuilderVNoStep' });
  let formInput: Record<string, unknown> | null = null;
  if (formInputRaw.trim()) {
    try {
      const parsed: unknown = JSON.parse(formInputRaw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('object');
      formInput = parsed as Record<string, unknown>;
    } catch {
      out.push({ key: 'formBuilderVFormInputJson' });
    }
  }
  const names = new Set<string>();
  fields.forEach((f, i) => {
    const n = i + 1;
    if (!f.field_name.trim()) { out.push({ key: 'formBuilderVName', n }); return; }
    if (!f.field_name.startsWith('$')) out.push({ key: 'formBuilderVNameDollar', n });
    if (names.has(f.field_name)) out.push({ key: 'formBuilderVDupName', n });
    names.add(f.field_name);
    if (!f.field_label.trim()) out.push({ key: 'formBuilderVLabel', n });
    if (f.field_type === 'dropdown' && (f.field_options ?? []).length === 0) out.push({ key: 'formBuilderVOptions', n });
    if (f.field_type === 'external' && !(f.field_source ?? '').trim()) out.push({ key: 'formBuilderVSource', n });
    if (f.field_type === 'json list' && f.field_template.length === 0) out.push({ key: 'formBuilderVTemplate', n });
    if (f.field_minLength != null && f.field_maxLength != null && f.field_minLength > f.field_maxLength)
      out.push({ key: 'formBuilderVMinMax', n });
    if (f.field_pattern) {
      try { new RegExp(f.field_pattern); } catch { out.push({ key: 'formBuilderVRegex', n }); }
    }
  });
  if (formInput && launchKeys(formInput).some((k) => !names.has(`$${k}`))) {
    out.push({ key: 'formBuilderVFormInputAlign' });
  }
  void processId;
  return out;
}

function launchKeys(v: unknown, out: string[] = []): string[] {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, sub] of Object.entries(v as Record<string, unknown>)) {
      out.push(k);
      launchKeys(sub, out);
    }
  }
  return out;
}
