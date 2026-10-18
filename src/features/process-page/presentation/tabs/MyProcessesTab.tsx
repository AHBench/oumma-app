import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import { Spinner, DataTable, ErrorBox, Badge } from '../../../shared/components/ui';
import { ResizableColumn, ResizableRow } from '../../../shared/components/ResizableSplit';
import { DossierSearchTable } from '../../../process-forms/presentation/components/DossierSearchTable';
import { useActiveProcesses, useTaskHistory, useActiveForms, useProcessTimeline } from '../../../shared/hooks/use-queries';
import type { Form } from '../../../process-forms/data/models/form-model';
import type { ProcessItem } from '../../../process-tasks/data/models/task-models';
import { WorkflowLine } from '../../../process-status/presentation/components/WorkflowLine';

/**
 * "My Dossiers" tab (MyProcessesPage) — mirrors
 * process_page/presentation/pages/widgets/my_processes_page.dart:
 * top = dossier search restricted to running instances; bottom = running
 * process instances; selecting an instance shows its audit (workflow line +
 * task history + comments/attachments).
 */
export function MyProcessesTab() {
  const { t } = useTranslation();
  const { process, user, token, groups, stepId } = useWorkspaceContext();
  const [selectedDossier, setSelectedDossier] = useState<Form | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<ProcessItem | null>(null);

  const { data: instances, isLoading, isError, error, refetch } = useActiveProcesses({
    process,
    user,
    token,
  });

  // Flutter my_processes_page.dart: the top dossier list is the user's
  // ACTIVE forms (oper-data-index) restricted to the running process
  // instances — the same id-pair matching as _matchesInstance below. With
  // no running instances the full active list is kept (Flutter bootstrap).
  const { data: activeForms } = useActiveForms({
    process,
    stepId,
    token,
    departments: user?.department ?? [],
  });
  const restrictedForms = useMemo(() => {
    const list = activeForms ?? [];
    if (!instances || instances.length === 0) return list;
    return list.filter((f) => instances.some((i) => matchesInstance(f, i)));
  }, [activeForms, instances]);

  const filterId = useMemo(() => {
    if (!selectedDossier) return null;
    const list = instances ?? [];
    const match = list.find((inst) => matchesInstance(selectedDossier, inst));
    return (
      match?.id ??
      selectedDossier.processInstanceIds[selectedDossier.processInstanceIds.length - 1] ??
      selectedDossier.formId ??
      null
    );
  }, [selectedDossier, instances]);

  if (!process || !user || !token) return <Spinner label={t('loadingProcess')} />;

  const visibleInstances = (instances ?? []).filter(
    (i) => !filterId || i.id === filterId || i.formId === filterId,
  );

  return (
    <div className="h-full">
      <ResizableColumn
        first={
          <DossierSearchTable
            process={process}
            user={user}
            token={token}
            stepId={stepId}
            groups={groups}
            forms={restrictedForms}
            clientSideSearch
            showViewDossier
            onDossierSelected={(f) => setSelectedDossier((cur) => (cur?.formId === f.formId ? null : f))}
          />
        }
        second={
          selectedInstance ? (
            <ResizableRow
              initialRatio={0.4}
              first={
                <div className="h-full overflow-auto">
                  <InstanceListBody
                    isLoading={isLoading}
                    isError={isError}
                    error={error}
                    onRetry={() => void refetch()}
                    visibleInstances={visibleInstances}
                    selectedInstance={selectedInstance}
                    onRowClick={(id) => {
                      setSelectedInstance((cur) => {
                        const next = visibleInstances.find((x) => x.id === id) ?? null;
                        return cur?.id === id ? null : next;
                      });
                    }}
                  />
                </div>
              }
              second={
                <InstanceAudit
                  processId={process.id}
                  instanceId={selectedInstance.id}
                  groups={groups}
                  token={token}
                  onClose={() => setSelectedInstance(null)}
                />
              }
            />
          ) : (
            <div className="h-full overflow-auto">
              <InstanceListBody
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={() => void refetch()}
                visibleInstances={visibleInstances}
                selectedInstance={selectedInstance}
                onRowClick={(id) => {
                  setSelectedInstance((cur) => {
                    const next = visibleInstances.find((x) => x.id === id) ?? null;
                    return cur?.id === id ? null : next;
                  });
                }}
              />
            </div>
          )
        }
      />
    </div>
  );
}

function InstanceListBody({
  isLoading,
  isError,
  error,
  onRetry,
  visibleInstances,
  selectedInstance,
  onRowClick,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry(): void;
  visibleInstances: ProcessItem[];
  selectedInstance: ProcessItem | null;
  onRowClick(id: string): void;
}) {
  const { t } = useTranslation();
  return (
    isLoading ? (
      <Spinner label={t('loadingInstances')} />
    ) : isError ? (
      <ErrorBox message={String(error ?? t('failedToLoadInstances'))} onRetry={onRetry} />
    ) : (
      <DataTable
      columns={[
        { key: 'id', label: t('instanceId') },
        { key: 'formId', label: t('formId') },
        { key: 'department', label: t('department') },
      ]}
      rows={visibleInstances.map((i) => ({
        __id: i.id,
        id: (
          <span className="font-mono text-(--app-fs-small)" title={i.id}>
            {i.id.slice(0, 20)}…
          </span>
        ),
        formId: (
          <span className="font-mono text-(--app-fs-small)">
            {i.formId ? i.formId.slice(0, 20) : '—'}
          </span>
        ),
        department: formatDepartment(i.department),
      }))}
      keyFn={(r) => String(r.__id)}
      selectedKey={selectedInstance?.id}
      onRowClick={(r) => onRowClick(String(r.__id))}
      emptyMessage={t('noRunningInstances')}
    />
    )
  );
}

function InstanceAudit({
  processId,
  instanceId,
  groups,
  token,
  onClose,
}: {
  processId: string;
  instanceId: string;
  groups: string[];
  token: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { data: timeline, isLoading: instanceLoading } = useProcessTimeline({
    processId,
    instanceId,
    token,
  });
  const { data: history, isLoading: historyLoading, isError: historyError } = useTaskHistory({
    processId,
    instanceId,
    groups,
    languageCode: 'en',
    token,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-(--app-fs-base) font-semibold text-foreground">
          {t('instanceAudit')}
        </span>
        <button className="text-(--app-fs-small) text-muted hover:underline" onClick={onClose}>
          {t('close')}
        </button>
      </div>

      {instanceLoading ? (
        <Spinner />
      ) : timeline ? (
        <div className="mb-3">
          <WorkflowLine timeline={timeline} />
        </div>
      ) : (
        <p className="mb-3 text-(--app-fs-small) text-muted">{t('instanceDataNotFound')}</p>
      )}

      {historyLoading ? (
        <Spinner label={t('loadingTaskHistory')} />
      ) : historyError ? (
        <ErrorBox message={t('failedToLoadTaskHistory')} />
      ) : (
        <div className="space-y-2">
          {(history ?? []).map((h) => (
            <div key={h.id} className="rounded-(--app-radius) border border-separator bg-surface p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-(--app-fs-base) font-semibold text-foreground">{h.taskName || h.id}</span>
                <Badge tone={h.state === 'Completed' ? 'success' : 'default'}>{h.state || '—'}</Badge>
                <span className="ms-auto text-(--app-fs-small) text-muted">
                  {h.startDate ? new Date(h.startDate).toLocaleString() : ''}
                </span>
              </div>
              {h.actualOwner ? (
                <div className="text-(--app-fs-small) text-muted">{t('owner')}{h.actualOwner}</div>
              ) : null}
              {h.comments.length > 0 ? (
                <ul className="mt-1 list-disc ps-4 text-(--app-fs-small) text-muted">
                  {h.comments.map((c, i) => (
                    <li key={i}>
                      {c.updatedBy}: {c.content}
                    </li>
                  ))}
                </ul>
              ) : null}
              {h.attachments.length > 0 ? (
                <ul className="mt-1 list-disc ps-4 text-(--app-fs-small) text-muted">
                  {h.attachments.map((a, i) => (
                    <li key={i}>{a.name}</li>
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

/** A dossier matches an instance on its form id or any of its instance ids. */
function matchesInstance(form: Form, instance: ProcessItem): boolean {
  if (form.formId != null && (instance.id === form.formId || instance.formId === form.formId)) {
    return true;
  }
  return form.processInstanceIds.some((id) => instance.id === id || instance.formId === id);
}

function formatDepartment(department: unknown): string {
  if (department == null) return '—';
  if (typeof department === 'object') {
    const d = department as { codes?: unknown };
    if (Array.isArray(d.codes)) return (d.codes as unknown[]).map(String).join(', ');
  }
  return String(department);
}
