import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import {
  useSavedForms,
  useStartProcess,
  useDeleteForm,
  useUpdateForm,
  useFormStructure,
  useFormSearchItems,
} from '../../../shared/hooks/use-queries';
import { AppTooltip, EmptyBox, Spinner, Modal, btnCls } from '../../../shared/components/ui';
import { appLogger } from '../../../../core/logging/app-logger';
import { getDependencies } from '../../../../core/di';
import { FormRenderer, buildSubmittedFormInput, resolveFieldValues } from '../../../process-forms/presentation/components/FormFieldFactory';
import { ProcessProgressPanel } from '../../../process-status/presentation/components/ProcessProgressPanel';
import type { Form } from '../../../process-forms/data/models/form-model';
import { searchItemLabel } from '../../../process-forms/data/models/form-model';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';

type Json = Record<string, unknown>;

/**
 * "My Pending Forms" tab — port of Flutter's
 * process_forms/presentation/pages/form_list.dart (ListMyForms,
 * "Mes formulaires en instances"): saved-but-not-launched forms
 * (oper-data-index, activeform=false), with a table/grid view toggle and
 * per-form Launch / Edit / Delete actions.
 *
 * Launch mirrors ProcessStartBloc._onProcessStartRequested:
 *   1. start the engine instance (POST /processes/{pid}, form data)
 *   2. re-read the saved form (the engine may have written values into it)
 *   3. append the new instance id to processInstanceIds
 *   4. PUT the form — the backend derives activeform from
 *      process_instance_id being non-empty, so the form flips to active
 *      and drops out of this list (it shows up in the dossier list).
 */
export function MyPendingFormsTab() {
  const { t, i18n } = useTranslation();
  const { process, user, token } = useWorkspaceContext();
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchedId, setLaunchedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Form | null>(null);
  /** The just-launched instance — its Oumma progress is followed live until
   *  it reaches a human task (PAUSED) or a terminal state. */
  const [launchProgress, setLaunchProgress] = useState<{ formId: string; instanceId: string } | null>(null);

  const launchRole =
    process?.roles.find((r) => r.roleId === process.canLaunchRoleId) ??
    process?.roles.find((r) => r.roleCanLaunch) ??
    null;
  const stepId = launchRole?.roleTasks.find((tsk) => tsk.initialTask)?.taskName ?? '';

  const { data: forms, isLoading, refetch } = useSavedForms({
    process: process ?? null,
    stepId,
    token,
    departments: user?.department ?? [],
  });
  const { data: stepForm } = useFormStructure({ process: process ?? null, stepId, token });
  const { data: searchItems } = useFormSearchItems({ process: process ?? null, token });
  const startProcess = useStartProcess(process ?? null, user ?? null, token);
  const deleteForm = useDeleteForm(process ?? null, token);
  const updateForm = useUpdateForm(process ?? null, token);

  // Display columns — Flutter: the saved forms' own fieldHeaderDisplay
  // fields, sorted by fieldRow; localized via search items. Fallback: the
  // initial step's form fields when the saved forms carry no display flags.
  const displayFields = useMemo(() => {
    const label = (name: string, fallback: string) =>
      searchItemLabel(searchItems ?? [], name, i18n.language) ?? fallback;

    const fromSaved = new Map<string, { label: string; row: number }>();
    for (const f of forms ?? []) {
      for (const fld of f.formFields) {
        if (fld.fieldHeaderDisplay) {
          fromSaved.set(fld.fieldName, { label: label(fld.fieldName, fld.fieldLabel), row: fld.fieldRow });
        }
      }
    }
    if (fromSaved.size > 0) {
      return [...fromSaved.entries()].sort((a, b) => a[1].row - b[1].row).map(([name, v]) => ({ name, label: v.label }));
    }

    const fields = stepForm?.formFields ?? [];
    return fields
      .slice()
      .sort((a, b) => a.fieldRow - b.fieldRow)
      .map((f) => ({ name: f.fieldName, label: label(f.fieldName, f.fieldLabel) }));
  }, [forms, stepForm, searchItems, i18n.language]);

  if (!process || !user || !token) return null;

  /** Launch: start the engine instance, then mark the form active in oper-data. */
  const launch = async (form: Form) => {
    const id = form.formId;
    if (!id || launchingId) return;
    setLaunchingId(id);
    try {
      // 1. start the process with the form's (expanded) input
      const instanceId = await startProcess.mutateAsync(form);
      // 2. re-read the latest form (Flutter: getFormById before the PUT)
      let toSave = form;
      try {
        toSave = await getFormById(process, id, token);
      } catch {
        appLogger.warning('Re-reading form after launch failed, using in-memory form');
      }
      // 3. append the new instance id (activeform derives from this)
      if (instanceId && !toSave.processInstanceIds.includes(instanceId)) {
        toSave = { ...toSave, processInstanceIds: [...toSave.processInstanceIds, instanceId] };
      }
      // 4. PUT — the form becomes "active" and drops out of the list
      await updateForm.mutateAsync(toSave);
      setLaunchedId(id);
      window.setTimeout(() => setLaunchedId(null), 1200);
      void refetch();
      // 5. follow the engine's progress live until it pauses on a human task
      if (instanceId) {
        setLaunchProgress({ formId: id, instanceId });
      }
    } catch (e) {
      appLogger.error('Launch failed', { error: e });
    } finally {
      setLaunchingId(null);
    }
  };

  const del = (form: Form) => {
    const id = form.formId;
    if (!id || deletingId) return;
    if (!window.confirm(t('confirmationMessage'))) return;
    setDeletingId(id);
    deleteForm.mutate(
      { stepId: form.stepId, formId: id },
      { onSettled: () => setDeletingId(null) },
    );
  };

  if (isLoading) return <Spinner />;

  const list = forms ?? [];

  if (list.length === 0) {
    return <EmptyBox message={t('noFormsFound')} />;
  }

  const actionCell = (form: Form) => (
    <span className="flex items-center justify-end gap-1">
      {launchingId === form.formId ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
      ) : launchedId === form.formId ? (
        <span className="text-(--success)" title={t('processLaunchedSuccessfully')}>
          <CheckCircleIcon />
        </span>
      ) : (
        <AppTooltip label={t('launchApplication')}>
          <button
            className="rounded p-1 text-(--accent) hover:bg-surface-secondary disabled:opacity-40"
            disabled={deletingId !== null || deletingId === form.formId}
            onClick={() => void launch(form)}
          >
            <RocketIcon />
          </button>
        </AppTooltip>
      )}
      <AppTooltip label={t('editForm')}>
        <button
          className="rounded p-1 text-(--accent) hover:bg-surface-secondary disabled:opacity-40"
          disabled={launchingId === form.formId || deletingId === form.formId}
          onClick={() => setEditing(form)}
        >
          <EditIcon />
        </button>
      </AppTooltip>
      <AppTooltip label={t('delete')}>
        <button
          className="rounded p-1 text-(--error) hover:bg-surface-secondary disabled:opacity-40"
          disabled={launchingId === form.formId || deletingId === form.formId}
          onClick={() => del(form)}
        >
          {deletingId === form.formId ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--error) border-t-transparent" />
          ) : (
            <TrashIcon />
          )}
        </button>
      </AppTooltip>
    </span>
  );

  const valueOf = (form: Form, name: string) => findDeepValue(form.formInput, name);

  return (
    <div className="flex h-full flex-col">
      {/* Header: title + launch success note + view toggle (Flutter parity) */}
      <div className="flex items-center gap-2 border-b border-separator px-2 py-1">
        <span className="text-(--app-fs-heading) font-bold">{t('savedForms')}</span>
        {launchedId ? (
          <span className="text-(--app-fs-small) text-(--success)">{t('processLaunchedSuccessfully')}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-1 border border-separator rounded-(--app-radius-xs)">
          <button
            className={`rounded p-1 disabled:opacity-40 ${
              view === 'grid' ? 'text-(--accent)' : 'text-muted hover:text-foreground'
            }`}
            title="Grid"
            onClick={() => setView('grid')}
          >
            <GridViewIcon />
          </button>
          <span className="h-4 w-px bg-separator" />
          <button
            className={`rounded p-1 disabled:opacity-40 ${
              view === 'table' ? 'text-(--accent)' : 'text-muted hover:text-foreground'
            }`}
            title="Table"
            onClick={() => setView('table')}
          >
            <TableIcon />
          </button>
        </span>
      </div>

      {/* Live Oumma progress of the just-launched instance, until the engine
          responds with the result (paused on the first human task). */}
      {launchProgress ? (
        <div className="border-b border-separator px-2 py-1.5">
          <ProcessProgressPanel
            processId={process.id}
            instanceId={launchProgress.instanceId}
            token={token}
            runningLabel={t('launchInProgress')}
            settledLabel={(status, task) =>
              status === 'PAUSED'
                ? `${t('launchedWaitingAt')} ${task ?? ''}`
                : status === 'COMPLETED'
                  ? t('processCompleted')
                  : t('processEndedWithError')
            }
            autoCloseMs={4000}
            onClose={() => setLaunchProgress(null)}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {view === 'table' ? (
          <table className="w-full min-w-max border-collapse text-start">
            <thead className="table__header">
              <tr>
                {displayFields.map(({ name, label }) => (
                  <th key={name} className="table__column whitespace-nowrap font-semibold">
                    {label}
                  </th>
                ))}
                <th className="table__column font-semibold">ID</th>
                <th className="table__column" />
              </tr>
            </thead>
            <tbody className="table__body">
              {list.map((form) => (
                <tr key={form.formId ?? form.stepId} className="table__row">
                  {displayFields.map(({ name }) => (
                    <td key={name} className="table__cell max-w-[300px] min-w-[120px] truncate">
                      {formatValue(valueOf(form, name))}
                    </td>
                  ))}
                  <td className="table__cell font-mono text-(--app-fs-small) text-muted">
                    {form.formId ? form.formId.slice(0, 8) : 'N/A'}
                  </td>
                  <td className="table__cell">{actionCell(form)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {list.map((form) => {
              const details = displayFields
                .map(({ name, label }) => {
                  const value = formatValue(valueOf(form, name));
                  return value === '' ? null : { label, value };
                })
                .filter((d): d is { label: string; value: string } => d !== null);
              return (
                <div
                  key={form.formId ?? form.stepId}
                  className="rounded-(--app-radius-xs) border border-separator p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-(--app-fs-base) font-bold">
                      {details[0]?.value ?? form.formId?.slice(0, 8) ?? 'N/A'}
                    </span>
                    <span className="ml-auto font-mono text-(--app-fs-tiny) text-muted">
                      ID: {form.formId ? form.formId.slice(0, 8) : 'N/A'}
                    </span>
                  </div>
                  {details.length > 1 ? (
                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-separator pt-1">
                      {details.slice(1).map((d) => (
                        <span key={d.label} className="truncate text-(--app-fs-small)">
                          <span className="text-muted">{d.label}: </span>
                          <span className="font-semibold">{d.value}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-end">{actionCell(form)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing ? (
        <EditSavedFormDialog
          key={editing.formId ?? editing.stepId}
          process={process}
          token={token}
          form={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetch();
          }}
        />
      ) : null}
    </div>
  );
}

/** Re-read a saved form from oper-data-index (GET /user/forms/getform). */
async function getFormById(process: ProcessApp, formId: string, token: string): Promise<Form> {
  return getDependencies().formRepository.getFormDataStructureById(process, formId, token);
}

/**
 * Edit dialog — port of update_form.dart (opened from ListMyForms): the
 * step's form structure with the saved values pre-filled; saving PUTs the
 * form (bumps its version).
 */
function EditSavedFormDialog({
  process,
  token,
  form,
  onClose,
  onSaved,
}: {
  process: ProcessApp;
  token: string;
  form: Form;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { data: structure, isLoading } = useFormStructure({ process, stepId: form.stepId, token });
  const updateForm = useUpdateForm(process, token);
  const [values, setValues] = useState<Json>({});

  // Pre-fill from the saved form's form_input (deep-matched per field name),
  // falling back to the stored field values.
  useEffect(() => {
    if (structure == null) return;
    setValues(
      Object.fromEntries(
        structure.formFields.map((f) => [
          f.fieldName,
          findDeepValue(form.formInput, f.fieldName) ?? f.fieldValue ?? '',
        ]),
      ),
    );
  }, [structure, form.formInput]);

  const save = async () => {
    if (!structure) return;
    try {
      const resolved = resolveFieldValues(structure, values);
      const formInput = buildSubmittedFormInput(structure, values) as Json;
      // Keep the department the saved form was created with (oper-data's
      // department filter depends on it).
      const prevDept = (form.formInput as Json | undefined)?.department;
      if (prevDept != null && formInput.department == null) formInput.department = prevDept;
      await updateForm.mutateAsync({
        ...form,
        formInput,
        formFields: structure.formFields.map((f) => ({ ...f, fieldValue: resolved.get(f.fieldName) })),
      });
      onSaved();
    } catch (e) {
      appLogger.error('Update saved form failed', { error: e });
    }
  };

  return (
    <Modal title={`${t('editForm')} — ${form.formId?.slice(0, 8) ?? ''}`} onClose={onClose} wide>
      {isLoading || structure == null ? (
        <Spinner label={t('loadingFormStructure')} />
      ) : (
        <div className="flex flex-col gap-3">
          <FormRenderer
            form={structure}
            values={values}
            onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
            token={token}
            process={process}
          />
          <div className="flex justify-end gap-2 border-t border-separator pt-3">
            <button className={btnCls('outline')} onClick={onClose}>
              {t('cancel')}
            </button>
            <button className={btnCls('primary')} disabled={updateForm.isPending} onClick={() => void save()}>
              {updateForm.isPending ? t('savingForm') : t('saveForm')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** First nested value in `obj` whose key equals `name` (depth-limited). */
function findDeepValue(obj: unknown, name: string, depth = 0): unknown {
  if (obj == null || typeof obj !== 'object' || depth > 4) return undefined;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const [k, v] of entries) {
    if (k === name) return v;
  }
  for (const v of entries.map(([, value]) => value)) {
    if (v != null && typeof v === 'object') {
      const found = findDeepValue(v, name, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    if (DATE_RE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
      }
    }
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function GridViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
    </svg>
  );
}
