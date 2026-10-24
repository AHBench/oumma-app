import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { Form } from '../../data/models/form-model';
import { useDossiers, useFormVersions, useStartProcess } from '../../../shared/hooks/use-queries';
import { DataTable, ErrorBox, EyeIcon, Modal, SearchInput, Spinner, btnCls } from '../../../shared/components/ui';
import { FormRenderer } from './FormFieldFactory';

/**
 * Dossier search table — the React port of
 * process_forms/presentation/pages/search_form.dart (SearchForm).
 * Top search bar (server-side searchSavedForms), one row per dossier,
 * columns derived from the first form's fields.
 */
export function DossierSearchTable(props: {
  process: ProcessApp;
  user: User;
  token: string;
  stepId: string;
  groups: string[];
  forceSearchEndpoint?: boolean;
  showActions?: boolean;
  clientSideSearch?: boolean;
  onDossierSelected?: (form: Form) => void;
  /** Notified with the table's current (filtered) list — the Request page
   *  feeds its instance pane from it (Flutter's InstanceListPane). */
  onDossiersChange?: (forms: Form[]) => void;
  restrictToActiveInstances?: boolean;
  showViewDossier?: boolean;
  /** Controlled list — when provided, the internal fetch is skipped and
   *  this list is the table's source ("Mes dossiers" passes the
   *  task-restricted active forms, Flutter's restrictToTasks). */
  forms?: Form[];
}) {
  const {
    process,
    user,
    token,
    stepId,
    groups,
    forceSearchEndpoint = false,
    showActions = false,
    clientSideSearch = false,
    onDossierSelected,
    onDossiersChange,
    restrictToActiveInstances = false,
    showViewDossier = false,
    forms: controlledForms,
  } = props;
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [viewDossier, setViewDossier] = useState<Form | null>(null);
  const isControlled = controlledForms != null;
  const { data: activeInstances } = useActiveInstances(
    process,
    user,
    token,
    restrictToActiveInstances,
  );
  const startProcess = useStartProcess(process, user, token);

  const { data: fetchedForms, isLoading, isError, error, refetch } = useDossiers({
    process,
    stepId,
    user,
    token,
    groups,
    query: clientSideSearch ? '' : appliedQuery,
    forceSearchEndpoint,
    enabled: !isControlled,
  });
  const forms = controlledForms ?? fetchedForms;

  const restricted = useMemo(() => {
    let list = forms ?? [];
    if (restrictToActiveInstances && activeInstances && activeInstances.length > 0) {
      list = list.filter((f) =>
        activeInstances.some(
          (inst) =>
            (f.formId != null && (inst.id === f.formId || inst.formId === f.formId)) ||
            f.processInstanceIds.some((id) => inst.id === id || inst.formId === id),
        ),
      );
    }
    if (clientSideSearch && appliedQuery.trim() !== '') {
      const q = appliedQuery.toLowerCase();
      list = list.filter((f) =>
        f.formId?.toLowerCase().includes(q) ||
        f.processInstanceIds.some((id) => id.toLowerCase().includes(q)) ||
        JSON.stringify(f.formInput ?? {}).toLowerCase().includes(q),
      );
    }
    return list;
  }, [forms, activeInstances, restrictToActiveInstances, clientSideSearch, appliedQuery]);

  useEffect(() => {
    onDossiersChange?.(restricted);
  }, [restricted, onDossiersChange]);

  // Columns = ONLY the fields flagged for header display (fieldHeaderDisplay),
  // deduped across all forms and sorted by fieldRow — port of the Dart
  // SearchForm (displayableFieldsList). Falls back to the first form's
  // fields only when nothing is flagged, so the grid never renders empty.
  const displayableFields = useMemo(() => {
    const label = new Map<string, string>();
    const row = new Map<string, number>();
    for (const form of restricted) {
      for (const field of form.formFields) {
        if (field.fieldHeaderDisplay && !label.has(field.fieldName)) {
          label.set(field.fieldName, field.fieldLabel || field.fieldName);
          row.set(field.fieldName, field.fieldRow);
        }
      }
    }
    let names = [...label.keys()];
    if (names.length === 0 && restricted.length > 0) {
      names = restricted[0].formFields.slice(0, 6).map((f) => f.fieldName);
      for (const f of restricted[0].formFields) {
        if (!label.has(f.fieldName)) label.set(f.fieldName, f.fieldLabel || f.fieldName);
      }
    }
    names.sort((a, b) => (row.get(a) ?? 999) - (row.get(b) ?? 999));
    return names.map((name) => ({ key: name, label: label.get(name) ?? name }));
  }, [restricted]);

  const rows = restricted.map((f) => ({
    ...Object.fromEntries(
      displayableFields.map((col) => [
        col.key,
        displayValue(f.formInput[col.key] ?? deepValue(f.formInput, col.key)),
      ]),
    ),
    __formId: f.formId ?? '',
    __form: f,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-separator p-2">
        <div className="max-w-xs flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('searchDossier')}
            onSearch={clientSideSearch ? undefined : (v) => setAppliedQuery(v)}
          />
        </div>
        <button onClick={() => void refetch()} className={btnCls('outline', true)}>
          {t('refresh')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <Spinner label={t('loadingDossiers')} />
        ) : isError ? (
          <ErrorBox message={String(error ?? t('failedToLoadDossiers'))} onRetry={() => void refetch()} />
        ) : (
          <DataTable
            columns={displayableFields}
            rows={rows as unknown as Record<string, React.ReactNode>[]}
            keyFn={(row) => String(row.__formId)}
            onRowClick={(row) => {
              // Row tap always notifies the owner (filtering — the Flutter
              // row-tap behavior); the full dossier opens via the action
              // button below when showViewDossier is set.
              const f = (row as { __form?: Form }).__form;
              if (f) onDossierSelected?.(f);
            }}
            emptyMessage={t('noDossiersFound')}
            rowActions={
              showViewDossier
                ? (row) => {
                    const f = (row as { __form?: Form }).__form;
                    if (!f) return null;
                    return (
                      <button
                        className="rounded p-1 text-muted hover:text-accent"
                        title={t('viewDossier')}
                        aria-label={t('viewDossier')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewDossier(f);
                        }}
                      >
                        <EyeIcon />
                      </button>
                    );
                  }
                : undefined
            }
          />
        )}
      </div>

      {showActions || showViewDossier ? (
        <div className="border-t border-separator p-2 text-(--app-fs-small) text-muted">
          {t('selectDossierRowTo', { action: showViewDossier ? t('selectDossierRowView') : t('selectDossierRowFilter') })}
        </div>
      ) : null}

      {viewDossier ? (
        <FullDossierDialog form={viewDossier} process={process} user={user} token={token} onClose={() => setViewDossier(null)} />
      ) : null}

      {/* Action buttons on the table header row are provided per-row via the
          dedicated buttons below the table (launch / view) */}
      {(showActions || showViewDossier) && restricted.length > 0 ? (
        <div className="flex gap-2 border-t border-separator p-2">
          <button
            className={btnCls('primary', true)}
            disabled={restricted.length !== 1}
            onClick={() => setViewDossier(restricted[0])}
          >
            {t('viewDossier')}
          </button>
          {showActions ? (
            <button
              className={btnCls('outline', true)}
              disabled={restricted.length !== 1 || !restricted[0].launchable}
              onClick={() => void launchDossier(restricted[0])}
            >
              {t('launch')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  async function launchDossier(form: Form) {
    try {
      await startProcess.mutateAsync(form);
    } catch (e) {
      window.alert(`${t('launchFailed')}: ${String(e)}`);
    }
  }
}

function useActiveInstances(
  process: ProcessApp,
  user: User,
  token: string,
  enabled: boolean,
) {
  return useQueryClientSafe(process, user, token, enabled);
}

// Thin wrappers (avoid importing hooks twice)
import { useQuery } from '@tanstack/react-query';
import { getDependencies } from '../../../../core/di.ts';

function useQueryClientSafe(
  process: ProcessApp,
  user: User,
  token: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['active-processes', process.id, user.department, token],
    queryFn: () =>
      getDependencies().taskRepository.getActiveProcessItems(
        process,
        user.department,
        process.roles.map((r) => r.roleId),
        token,
      ),
    enabled,
  });
}

function displayValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* Deep first-match of a field name in the nested form_input template. */
function deepValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const v = deepValue(item, key);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const map = obj as Record<string, unknown>;
  if (key in map) return map[key];
  for (const v of Object.values(map)) {
    const r = deepValue(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}

/* ---------------------------------- full dossier dialog ---------------------------------- */

/**
 * Full dossier dialogue with version selector — port of
 * process_forms/presentation/pages/display_full_dossier.dart
 */
export function FullDossierDialog({
  form,
  process,
  user,
  token,
  onClose,
}: {
  form: Form;
  process: ProcessApp;
  user: User;
  token: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { data: versions, isLoading } = useFormVersions({
    process,
    formId: form.formId ?? null,
    token,
    departments: user.department,
  });
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const current =
    (versions ?? []).find((v) =>
      v.formVersion != null &&
      (selectedVersion == null
        ? v.formVersion === form.formVersion
        : v.formVersion === String(selectedVersion)),
    ) ?? (versions ?? [])[0] ?? form;

  return (
    <Modal title={`${t('dossier')} ${form.formId ?? ''}`} onClose={onClose} wide>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-(--app-fs-base)">
            <span className="text-muted">
              {t('instance')}: {form.processInstanceIds.join(', ') || '—'}
            </span>
            {form.createdAt ? (
              <span className="text-muted">
                {t('created')}: {new Date(form.createdAt).toLocaleString()}
              </span>
            ) : null}
            {(versions ?? []).length > 1 ? (
              <label className="ms-auto flex items-center gap-1.5">
                {t('version')}:
                <select
                  className="input w-auto py-0.5"
                  value={current.formVersion}
                  onChange={(e) => setSelectedVersion(Number.parseInt(e.target.value, 10))}
                >
                  {(versions ?? []).map((v) => (
                    <option key={v.formVersion} value={v.formVersion}>
                      {v.formVersion || t('latest')}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <FormRenderer form={current} values={current.formInput} readOnly token={token} process={process} />
        </div>
      )}
    </Modal>
  );
}
