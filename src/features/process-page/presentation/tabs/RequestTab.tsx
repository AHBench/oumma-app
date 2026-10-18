import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import { useProcessTimeline, useTaskHistory, useFormSearchItems, useFormStructure } from '../../../shared/hooks/use-queries';
import { Badge, Spinner } from '../../../shared/components/ui';
import { DossierSearchTable } from '../../../process-forms/presentation/components/DossierSearchTable';
import { WorkflowLine } from '../../../process-status/presentation/components/WorkflowLine';
import type { Form, SearchItem } from '../../../process-forms/data/models/form-model';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';

/**
 * "Audit a Dossier" tab — React port of
 * process_audit/presentation/pages/request_page.dart:
 * top = the same dossier SearchForm as the other pages (server-side
 * searchSavedForms keyword search); left = the searched forms' process
 * instances (Flutter's InstanceListPane — the instances of the forms of the
 * process the user has access to); right = the selected instance's timeline
 * + task history (output fields labeled via the process search items).
 *
 * Tapping a search row (or an instance row) selects that form's process
 * instance for inspection; the row's action button opens the full dossier.
 */
export function RequestTab() {
  const { t, i18n } = useTranslation();
  const { process, user, token, groups, stepId } = useWorkspaceContext();
  const [dossierForms, setDossierForms] = useState<Form[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  if (!process || !user || !token) return <Spinner label={t('loadingProcess')} />;

  const selectFromForm = (form: Form) => {
    const instanceId = lastInstanceId(form);
    if (instanceId) setSelectedInstanceId(instanceId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top: the dossier search (same search as the other pages) */}
      <div className="min-h-0 flex-[1] border-b border-separator">
        <DossierSearchTable
          process={process}
          user={user}
          token={token}
          stepId={stepId}
          groups={groups}
          forceSearchEndpoint
          showViewDossier
          onDossierSelected={selectFromForm}
          onDossiersChange={setDossierForms}
        />
      </div>

      <div className="flex min-h-0 flex-[1]">
        {/* Left: the searched forms' process instances (Flutter's InstanceListPane) */}
        <div className="flex min-h-0 w-2/5 flex-col border-e border-separator">
          <InstanceListPane
            process={process}
            token={token}
            stepId={stepId}
            forms={dossierForms}
            selectedInstanceId={selectedInstanceId}
            onSelect={selectFromForm}
          />
        </div>

        {/* Right: the selected instance's timeline + task history */}
        <div className="min-h-0 flex-1">
          {selectedInstanceId ? (
            <InstanceDetail
              processId={process.id}
              instanceId={selectedInstanceId}
              groups={groups}
              languageCode={i18n.language}
              token={token}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-(--app-fs-base) text-muted">
              {t('selectInstanceToInspect')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The form's (last) launched process instance id — '' when never launched. */
function lastInstanceId(form: Form): string {
  return form.processInstanceIds[form.processInstanceIds.length - 1] ?? '';
}

/**
 * Left pane — the searched forms' process instances (port of
 * instance_list_pane.dart): one row per form, titled by its unique field
 * ("label: value") or the instance id, with the start date underneath.
 */
function InstanceListPane({
  process,
  token,
  stepId,
  forms,
  selectedInstanceId,
  onSelect,
}: {
  process: ProcessApp;
  token: string;
  stepId: string;
  forms: Form[];
  selectedInstanceId: string | null;
  onSelect(form: Form): void;
}) {
  const { t, i18n } = useTranslation();
  // Search-items catalog: translates the unique field's label in the
  // active language (language context).
  const { data: searchItems } = useFormSearchItems({ process, token });
  // Live step form: old saved forms may predate the field_unique flag —
  // the live step's unique field is the fallback identifier.
  const { data: liveStep } = useFormStructure({ process, stepId, token });

  if (forms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-2 text-center text-(--app-fs-small) text-muted">
        {t('requestSelectForm')}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-1">
      {forms.map((form) => {
        const instanceId = lastInstanceId(form);
        const selected = instanceId !== '' && instanceId === selectedInstanceId;
        const title = instanceTitle(form, liveStep, t('dossierGeneric'), searchItems, i18n.language);
        return (
          <button
            key={form.formId ?? instanceId}
            disabled={instanceId === ''}
            onClick={() => onSelect(form)}
            className={`mb-0.5 block w-full rounded-(--app-radius-xs) border px-2 py-1 text-start disabled:cursor-default ${
              selected
                ? 'border-(--accent) bg-surface-secondary'
                : 'border-transparent hover:bg-surface-secondary'
            }`}
          >
            <span className={`block truncate text-(--app-fs-base) ${selected ? 'font-semibold' : ''}`}>
              {title}
            </span>
            {form.createdAt ? (
              <span className="block truncate text-(--app-fs-tiny) text-muted">
                {t('started')} {formatStart(form.createdAt)}
              </span>
            ) : null}          </button>
        );
      })}
    </div>
  );
}

/** The field_unique field's "label: value" — the ONLY identifier shown in
 *  the audit list (no instance id). The label resolves through the
 *  process' search items (active language), falling back to the field's
 *  own label. The unique field comes from the saved form's own flag, or
 *  — for forms saved before the flag existed — from the live step form.
 *  When no unique field applies, the generic localized "Dossier" label
 *  is shown. */
function instanceTitle(
  form: Form,
  liveStep: Form | null | undefined,
  genericLabel: string,
  searchItems: SearchItem[] | null | undefined,
  lang: string,
): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^\$/, '');
  const labelFor = (name: string): string => {
    const item = (searchItems ?? []).find((s) => norm(s.fieldName ?? '') === norm(name));
    if (item) {
      const l = lang === 'ar' ? item.fieldLabelAr : lang === 'fr' ? item.fieldLabelFr : item.fieldLabelEn;
      if (l && l.trim()) return l.trim();
    }
    const own = form.formFields.find((f) => norm(f.fieldName) === norm(name));
    return own?.fieldLabel || own?.fieldName || name.replace(/^\$/, '');
  };
  const candidates = form.formFields.filter((f) => f.fieldUnique === true);
  const liveUnique = (liveStep?.formFields ?? []).filter((f) => f.fieldUnique === true);
  const uniqFields = candidates.length > 0 ? candidates : liveUnique.map((f) => form.formFields.find((x) => norm(x.fieldName) === norm(f.fieldName)) ?? f);
  for (const f of uniqFields) {
    let value: unknown = f.fieldValue;
    if (value == null) value = deepValue(form.formInput, f.fieldName);
    const text = value == null ? '' : String(value).trim();
    const label = labelFor(f.fieldName);
    if (text && text !== 'null') return `${label}: ${text}`;
    if (candidates.length > 0) return label;
  }
  return genericLabel;
}

function formatStart(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

/** First nested value in `obj` whose key equals `name` (depth-limited). */
function deepValue(obj: unknown, name: string, depth = 0): unknown {
  if (obj == null || typeof obj !== 'object' || depth > 4) return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const v = deepValue(item, name, depth + 1);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const map = obj as Record<string, unknown>;
  if (name in map) return map[name];
  for (const v of Object.values(map)) {
    const r = deepValue(v, name, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function InstanceDetail({
  processId,
  instanceId,
  groups,
  languageCode,
  token,
}: {
  processId: string;
  instanceId: string;
  groups: string[];
  languageCode: string;
  token: string;
}) {
  const { t } = useTranslation();
  const { data: timeline, isLoading: instanceLoading } = useProcessTimeline({
    processId,
    instanceId,
    token,
  });
  const { data: history, isLoading: historyLoading } = useTaskHistory({
    processId,
    instanceId,
    groups,
    languageCode,
    token,
  });

  return (
    <div className="h-full overflow-auto p-2">
      {instanceLoading ? (
        <Spinner />
      ) : timeline ? (
        <div className="mb-3 rounded border border-separator p-2 dark:border-ink-700">
          <div className="mb-2 text-(--app-fs-base) font-semibold">{t('workflow')}</div>
          <WorkflowLine timeline={timeline} />
        </div>
      ) : (
        <p className="mb-3 text-(--app-fs-small) text-muted">{t('noInstanceData')}</p>
      )}

      <div className="text-(--app-fs-base) font-semibold">{t('taskHistory')}</div>
      {historyLoading ? (
        <Spinner label={t('loadingHistory')} />
      ) : (
        <div className="mt-1 space-y-2">
          {(history ?? []).map((h) => (
            <div key={h.id} className="rounded border border-separator p-2 dark:border-ink-700">
              <div className="flex items-center gap-2">
                <span className="text-(--app-fs-base) font-semibold">{h.taskName || h.id}</span>
                <Badge tone={h.state === 'Completed' ? 'success' : 'default'}>{h.state || '—'}</Badge>
                <span className="ms-auto text-(--app-fs-small) text-muted">
                  {h.startDate ? new Date(h.startDate).toLocaleString() : ''}
                </span>
              </div>
              {/* Owner line (Flutter StepDetailPanel showOwner) — a dash when
                  the task has no owner. */}
              <div className="mt-1 text-(--app-fs-small)">
                <span className="font-medium text-foreground">{t('owner')}</span>{' '}
                <span className="text-foreground">{h.actualOwner || '—'}</span>
              </div>
              {h.viewItems.length > 0 ? (
                <table className="mt-1 w-full text-(--app-fs-small)">
                  <tbody>
                    {h.viewItems.map((v, i) => (
                      <tr key={i} className="border-b border-separator">
                        <td className="py-0.5 pe-2 font-medium text-foreground">{v.key}</td>
                        <td className="break-words py-0.5 text-foreground">
                          {typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value ?? '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {h.comments.length > 0 ? (
                <ul className="mt-1 list-disc ps-4 text-(--app-fs-small) text-foreground">
                  {h.comments.map((c, i) => (
                    <li key={i}>
                      {c.updatedBy}: {c.content}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {(history ?? []).length === 0 ? (
            <p className="text-center text-(--app-fs-base) text-muted">{t('noTaskHistory')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
