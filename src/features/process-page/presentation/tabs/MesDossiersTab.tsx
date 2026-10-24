import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import { Spinner } from '../../../shared/components/ui';
import { ResizableColumn } from '../../../shared/components/ResizableSplit';
import { DossierSearchTable } from '../../../process-forms/presentation/components/DossierSearchTable';
import { TaskListView } from '../../../process-tasks/presentation/components/TaskListView';
import { MyPendingFormsTab } from './MyPendingFormsTab';
import { useActiveForms, useTaskGroups } from '../../../shared/hooks/use-queries';
import { TokenUsageBadge } from '../../../shared/components/TokenUsageBadge';
import type { TaskGroupLabel } from '../../data/models/task-group-label';

/**
 * "My Tasks" tab (MesDossiersPage) — mirrors
 * process_page/presentation/pages/widgets/mes_dossiers_page.dart:
 * top-level tabs — "My Dossiers" (dossier search grid over the task
 * list; selecting a dossier filters the task list) and "My Pending
 * Forms" (ListMyForms — unlaunched forms that can be launched).
 */
export function MesDossiersTab() {
  const { t } = useTranslation();
  const { process, user, token, groups, stepId, taskLabels, selectedDossier, setSelectedDossier } =
    useWorkspaceContext();
  const [tab, setTab] = useState(0);
  if (!process || !user || !token) return <WorkspaceReadyGuard />;

  return (
    <div className="flex h-full flex-col">
      {/* Top tabs (mes_dossiers_page.dart DefaultTabController) */}
      <div className="flex items-center gap-1 border-b border-separator px-2 pt-1">
        <button
          className={`px-2 py-1 text-(--app-fs-base) ${
            tab === 0
              ? 'border-b-2 border-(--accent) font-semibold text-(--accent)'
              : 'text-muted hover:text-foreground'
          }`}
          onClick={() => setTab(0)}
        >
          {t('mesDossiers')}
        </button>
        <button
          className={`px-2 py-1 text-(--app-fs-base) ${
            tab === 1
              ? 'border-b-2 border-(--accent) font-semibold text-(--accent)'
              : 'text-muted hover:text-foreground'
          }`}
          onClick={() => setTab(1)}
        >
          {t('mesFormulairesEnInstances')}
        </button>
        {/* Token display: inside the strip (flex items-center) so it is
            vertically centered with the tab row — the generic top-right
            overlay is suppressed on this tab (see ProcessWorkspace). */}
        <div className="ms-auto pb-0.5">
          <TokenUsageBadge
            processId={process.id}
            instanceId={(selectedDossier?.processInstanceIds ?? []).at(-1) ?? null}
            token={token}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 0 ? (
          <DossiersContent
            process={process}
            user={user}
            token={token}
            groups={groups}
            stepId={stepId}
            taskLabels={taskLabels}
            selectedDossier={selectedDossier}
            setSelectedDossier={setSelectedDossier}
          />
        ) : (
          <MyPendingFormsTab />
        )}
      </div>
    </div>
  );
}

function DossiersContent({
  process,
  user,
  token,
  groups,
  stepId,
  taskLabels,
  selectedDossier,
  setSelectedDossier,
}: {
  process: NonNullable<ReturnType<typeof useWorkspaceContext>['process']>;
  user: NonNullable<ReturnType<typeof useWorkspaceContext>['user']>;
  token: NonNullable<ReturnType<typeof useWorkspaceContext>['token']>;
  groups: string[];
  stepId: string;
  taskLabels: TaskGroupLabel[];
  selectedDossier: ReturnType<typeof useWorkspaceContext>['selectedDossier'];
  setSelectedDossier: ReturnType<typeof useWorkspaceContext>['setSelectedDossier'];
}) {
  const filterId = selectedDossier
    ? (selectedDossier.processInstanceIds[selectedDossier.processInstanceIds.length - 1] ??
      selectedDossier.formId ??
      null)
    : null;
  const { t } = useTranslation();

  // Flutter mes_dossiers_page.dart → SearchForm(restrictToTasks: true):
  // the dossier grid is the launched forms (oper-data-index activeform=true)
  // restricted to the dossiers that have a task in "My Tasks". In Oumma the
  // link is form.process_instance_id ↔ task-group id (the instance id).
  const { data: taskGroups, isLoading: tasksLoading } = useTaskGroups({ process, user, token });
  const { data: activeForms, isLoading: formsLoading } = useActiveForms({
    process,
    stepId,
    token,
    departments: user.department,
  });
  const dossiers = useMemo(() => {
    const taskGroupIds = new Set((taskGroups ?? []).map((g) => g.id));
    return (activeForms ?? []).filter((f) => f.processInstanceIds.some((id) => taskGroupIds.has(id)));
  }, [activeForms, taskGroups]);

  return (
    <div className="h-full">
      {tasksLoading || formsLoading ? (
        <Spinner label={t('loadingDossiers')} />
      ) : (
      <ResizableColumn
        first={
          <DossierSearchTable
            process={process}
            user={user}
            token={token}
            stepId={stepId}
            groups={groups}
            forms={dossiers}
            clientSideSearch
            showViewDossier
            // Clicking a dossier row ALWAYS selects it (its tasks only) —
            // no toggle: re-clicking the same row keeps the filter.
            onDossierSelected={(f) => setSelectedDossier(f)}
          />
        }
        second={
          <div
            className="flex h-full flex-col"
            // Clicking the empty space of the task pane clears the dossier
            // filter (back to the list of all tasks); clicks on the tasks
            // themselves (rows, buttons, inputs…) do not.
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button, a, input, select, textarea, label, table')) return;
              setSelectedDossier(null);
            }}
          >
            {filterId ? (
              <div className="flex items-center justify-between border-b border-separator px-2 py-1 text-(--app-fs-small) text-muted">
                <span>
                  Filtered by dossier <span className="font-mono">{filterId}</span>
                </span>
                <button className="font-medium text-(--accent) hover:underline" onClick={() => setSelectedDossier(null)}>
                  Clear filter
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 pt-1">
              <TaskListView
                process={process}
                user={user}
                token={token}
                filterId={filterId}
                taskLabels={taskLabels}
                dossier={selectedDossier}
              />
            </div>
          </div>
        }
      />
      )}
    </div>
  );
}

function WorkspaceReadyGuard() {
  const { t } = useTranslation();
  return (
    <div className="h-full">
      <Spinner label={t('loadingProcess')} />
    </div>
  );
}
