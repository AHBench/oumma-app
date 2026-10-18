import { useState, useEffect } from 'react';
import { Navigate, NavLink, Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { AppShell } from '../../../process-apps/presentation/components/AppShell';
import { Spinner, ErrorBox } from '../../../shared/components/ui';
import { TokenUsageBadge } from '../../../shared/components/TokenUsageBadge';
import { useProcessApps as useProcessAppsSafe } from '../../../shared/hooks/use-queries';
import { WorkspaceProvider, useWorkspaceContext } from '../hooks/use-workspace-context';
import { AiAssistSidebar } from '../../../process-llm/presentation/components/AiAssistSidebar';
import { isDesigner } from '../../../process-design/domain/designer-gate';
import { DesignerChat } from '../../../process-design/presentation/components/DesignerChat';
import { getDependencies } from '../../../../core/di';
import { useColumnWidth } from '../../../../core/hooks/use-resize';
import { useFormSearchItems } from '../../../shared/hooks/use-queries';
import { setStatusSearchItems } from '../../../shared/status/status-store';
import { searchItemByKind } from '../../../process-forms/data/models/form-model';

/**
 * Process workspace — mirrors MainLayoutPage + Sidebar
 * (process_page/presentation/pages/main.dart & widgets/sidebar_widget.dart).
 * The right-hand menu hosts the per-process tabs (nested routes).
 */
export function ProcessWorkspace() {
  return (
    <WorkspaceProvider>
      <ProcessWorkspaceInner />
    </WorkspaceProvider>
  );
}

function ProcessWorkspaceInner() {
  const { t, i18n } = useTranslation();
  const { processId } = useParams<{ processId: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const { aiOpen, selectedDossier } = useWorkspaceContext();
  const [processListExpanded, setProcessListExpanded] = useState(true);
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const rightCol = useColumnWidth(240);

  const { data: processes, isLoading, isError, error, refetch } = useProcessAppsSafe(
    user?.accessToken ?? null,
  );

  // Menu labels resolve through the process search-item catalog (type
  // "menu_item", field_name = the i18n key), falling back to the app's
  // own translations. (Hook — must run before the early returns below.)
  const { data: menuSearchItems } = useFormSearchItems({
    process: (processes ?? []).find((p) => p.id === processId) ?? null,
    token: user?.accessToken ?? null,
  });

  // Status bar: publish this process' search-items catalog so the hover
  // tips can be resolved in the language context. (Hook — must run
  // before any early return: Rules of Hooks.)
  const process = (processes ?? []).find((p) => p.id === processId);
  useEffect(() => {
    setStatusSearchItems(process?.searchItems);
  }, [process?.searchItems]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorBox message={String(error ?? t('failedToLoadProcesses'))} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!process) return <Navigate to="/myprocesses" replace />;

  // The selected dossier's LLM tokens, shown top-right of the content.
  const instanceIds = selectedDossier?.processInstanceIds ?? [];
  const activeInstanceId = instanceIds[instanceIds.length - 1] ?? null;
  // The create-form tab renders its own badge in the toolbar and the
  // design page its own in the header — the top-right one is skipped
  // there (no double display).
  const isCreateForm = location.pathname.endsWith('/create-form');
  // My Tasks renders the badge inside its own tab strip (centered with
  // the tab row) — skip the overlay there, like create-form.
  const isMyTasks = location.pathname.endsWith('/my-tasks');
  // The design view renders the badge inside its header row (centered
  // with the process title) — skip the overlay there too.
  const isDesign = location.pathname.endsWith('/design');

  const canLaunch = process.roles.some((role) => role.roleCanLaunch === true);
  const designer = isDesigner(user);
  const ds = getDependencies().designDataSource;

  const menuLabel = (key: string) =>
    searchItemByKind(menuSearchItems, 'menu_item', key, i18n.language) ?? t(key);

  // Designer users get a single-purpose workspace: only the Process Design tab.
  const menu = designer
    ? [
        { to: 'design', label: menuLabel('processDesign'), icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z', hint: 'hint.process_design' },
      ]
    : [
        { to: 'my-tasks', label: menuLabel('myTasks'), icon: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z', hint: 'hint.my_tasks' },
        { to: 'my-processes', label: menuLabel('mesDossiers'), icon: 'M4 4h7v7H4V4Zm9 0h7v4h-7V4Zm0 6h7v10h-7V10ZM4 13h7v7H4v-7Z', hint: 'hint.my_dossiers' },
        { to: 'documents', label: menuLabel('processDocuments'), icon: 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5', hint: 'hint.documents' },
        { to: 'request', label: menuLabel('requestInvestigation'), icon: 'M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Zm-2 19h4v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1Z', hint: 'hint.audit_dossier' },
        { to: 'search-dossier', label: menuLabel('searchDossier'), icon: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z', hint: 'hint.search_dossier' },
      ];
  // "Create a dossier" is offered only when the role can launch AND the
  // process has at least one initial step configured in the Forms tab.
  if (canLaunch && process.initialSteps.length > 0 && !designer) {
    menu.push({
      to: 'create-form',
      label: menuLabel('createForm'),
      icon: 'M3 17.2V21h3.8L18.9 8.9 15.1 5.1 3 17.2ZM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8Z',
      hint: 'hint.new_dossier',
    });
  }

  return (
    <AppShell
      processListExpanded={processListExpanded}
      onToggleProcessList={() => setProcessListExpanded((v) => !v)}
      selectedProcessId={process.id}
      processPill={{ name: process.name, description: process.description }}
      rightSidebar={
        <>
          {aiOpen ? <AiAssistSidebar /> : null}
          <div
            className="relative flex shrink-0 flex-col overflow-hidden border-s border-separator bg-surface"
            style={{ width: actionsExpanded ? rightCol.width : 48 }}
          >
            {actionsExpanded ? (
              <div
                onPointerDown={(e) => rightCol.startResize('right', e)}
                title="Drag to resize"
                className="absolute top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-(--accent)/50"
                style={{ left: 0 }}
              />
            ) : null}
          <div className="flex items-center justify-between border-b border-separator px-2 py-2">
            {actionsExpanded ? (
              <span className="flex min-w-0 items-center gap-2 px-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-(--accent)">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
                <span className="truncate text-(--app-fs-base) font-semibold text-foreground">
                  {process.name}
                </span>
              </span>
            ) : null}
            <button
              onClick={() => setActionsExpanded((v) => !v)}
              className="button button--ghost button--icon-only"
              aria-label={t('toggleActionMenu')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`h-4 w-4 transition-transform ${actionsExpanded ? 'rotate-180' : ''}`}
              >
                <path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12Z" />
              </svg>
            </button>
          </div>
          <nav className="shrink-0 p-1">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-status-hint={item.hint}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded px-2 py-1.5 text-(--app-fs-base) ${
                    isActive
                      ? 'border-s-[3px] border-(--accent) bg-(--accent)/10 font-semibold text-(--accent)'
                      : 'border-s-[3px] border-transparent text-foreground hover:bg-surface-secondary'
                  }`
                }
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d={item.icon} />
                </svg>
                {actionsExpanded ? <span className="truncate">{item.label}</span> : null}
              </NavLink>
            ))}
          </nav>
          {designer && user?.accessToken ? (
            <div className="min-h-0 flex-1 border-t border-separator p-2">
              <DesignerChat
                processId={process.id}
                token={user.accessToken}
                lang={i18n.language}
                ds={ds}
              />
            </div>
          ) : null}
        </div>
          </>
      }
    >
      <div className="relative h-full min-h-0">
        {/* Top-right: the selected dossier's tokens; when no dossier is
            selected, the process total (all instances). The create-form
            tab shows its own badge in the toolbar, the my-tasks tab in
            its tab strip and the design view in its header row — skip
            the overlay there (no double display). */}
        {!(isCreateForm || isMyTasks || isDesign) ? (
          <div className="pointer-events-none absolute right-3 top-2 z-20">
            <TokenUsageBadge processId={process.id} instanceId={activeInstanceId} token={user?.accessToken ?? null} />
          </div>
        ) : null}
        <Outlet />
      </div>
    </AppShell>
  );
}
