import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../../core/i18n';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskGroup, TaskItem } from '../../data/models/task-models';
import type { TaskGroupLabel, TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import type { Form } from '../../../process-forms/data/models/form-model';
import { useTaskGroups, useFormSearchItems } from '../../../shared/hooks/use-queries';
import { ErrorBox, Spinner, AppTooltip, btnCls } from '../../../shared/components/ui';
import { useWorkspaceContext } from '../../../process-page/presentation/hooks/use-workspace-context';
import { TaskView } from './TaskView';
import { findDescriptionById, tryParseJsonList } from './task-view-model';
import { searchItemLabel } from '../../../process-forms/data/models/form-model';

/**
 * Task list — React port of process_tasks/presentation/pages/my_tasks_page.dart:
 * toolbar (search, "only reserved", sort by date/priority, grid/table toggle),
 * a table view (default) whose columns are the task-group label's
 * `taskViewItems` (the process data's view items — headers localized via
 * search items; values resolved via findDescriptionById), a card grid view,
 * and pagination (10 per page). The clickable task of a row is the one found
 * through the first `urlActive` label (falling back to the first task item)
 * — the same task the Dart app opens in ViewTask.
 */
export function TaskListView({
  process,
  user,
  token,
  filterId,
  taskLabels,
  dossier,
}: {
  process: ProcessApp;
  user: User;
  token: string;
  filterId?: string | null;
  taskLabels: TaskGroupLabel[];
  /** Selected dossier (if any) — view items already shown on the dossier
   *  card are hidden from the task view's "Task Details". */
  dossier?: Form | null;
}) {
  const { t, i18n } = useTranslation();
  const { data: groups, isLoading, isError, error, refetch } = useTaskGroups({
    process,
    user,
    token,
  });
  const { data: searchItems } = useFormSearchItems({ process, token });
  const { setActiveTask, requestAi } = useWorkspaceContext();

  const openTask = (group: TaskGroup, task: TaskItem) => {
    setActiveTask({ group, task }); // shared "active task" for the AI Assist sidebar
    setSelected({ group, task });
  };

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<number | null>(null);
  const [showOnlyReserved, setShowOnlyReserved] = useState(false);
  const [sortField, setSortField] = useState<'date' | 'priority' | null>(null);
  const [sortAscending, setSortAscending] = useState(true);
  const [isTableView, setIsTableView] = useState(true); // Dart default: table
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage] = useState(10);
  const [selected, setSelected] = useState<{ group: TaskGroup; task: TaskItem } | null>(null);

  // taskItems = ALL labels flattened across the label groups — used for the
  // search filter and the clickable (urlActive) task resolution.
  const itemLabels: TaskItemLabel[] = useMemo(
    () => taskLabels.flatMap((g) => g.taskItems),
    [taskLabels],
  );

  // The TABLE's columns are the view items (my_tasks_page:
  // _selectedTaskGroupLabel = taskState.taskLabels.expand((g) => g.taskViewItems)).
  const viewLabels: TaskItemLabel[] = useMemo(
    () => taskLabels.flatMap((g) => g.taskViewItems),
    [taskLabels],
  );

  // View-item headers are localized from the process's search items
  // (field_name match, active language), falling back to the item description.
  const viewColumns = useMemo(
    () =>
      viewLabels.map((l) => ({
        ...l,
        description: searchItemLabel(searchItems ?? [], l.itemColumnName, i18n.language) ?? l.description,
      })),
    [viewLabels, searchItems, i18n.language],
  );

  const onQueryChange = (q: string) => {
    setQuery(q);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setDebouncedQuery(q.trim());
      setCurrentPage(0);
    }, 300);
  };

  const filtered = useMemo(() => {
    let list = (groups ?? []).filter((g) => {
      if (filterId && g.id !== filterId && g.formId !== filterId) return false;
      if (g.taskItems.length === 0) return false;
      if (showOnlyReserved && !g.taskItems.some((t) => t.taskPhaseStatus === 'Reserved')) return false;
      return true;
    });

    if (debouncedQuery.length > 0) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter((g) => {
        const clickable = clickableTask(g, itemLabels);
        if (clickable) {
          const desc = String(clickable.description ?? '').replaceAll('_', ' ').toLowerCase();
          if (desc.includes(q)) return true;
          if (clickable.priority != null && `priority_${clickable.priority}`.toLowerCase().includes(q)) return true;
        }
        for (const label of itemLabels) {
          const val = findDescriptionById(g.taskItems, label.itemColumnName ?? '');
          if (val != null && String(val).length > 0) {
            if (String(val).toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    if (sortField === 'date') {
      list = [...list].sort((a, b) => {
        const da = a.taskItems[0]?.startedAt ?? null;
        const db = b.taskItems[0]?.startedAt ?? null;
        if (da == null) return 1;
        if (db == null) return -1;
        return sortAscending ? da.localeCompare(db) : db.localeCompare(da);
      });
    } else if (sortField === 'priority') {
      list = [...list].sort((a, b) => {
        const pa = a.taskItems[0]?.priority ?? 99;
        const pb = b.taskItems[0]?.priority ?? 99;
        return sortAscending ? pa - pb : pb - pa;
      });
    }
    return list;
  }, [groups, filterId, showOnlyReserved, debouncedQuery, sortField, sortAscending, itemLabels]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const page = Math.min(currentPage, totalPages - 1);
  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const start = filtered.length === 0 ? 0 : page * rowsPerPage + 1;
  const end = Math.min((page + 1) * rowsPerPage, filtered.length);

  const toggleSort = (field: 'date' | 'priority') => {
    if (sortField === field) {
      setSortAscending((a) => !a);
    } else {
      setSortField(field);
      setSortAscending(field === 'date' ? false : true); // date: newest first; priority: highest (1) first
    }
    setCurrentPage(0);
  };

  if (isLoading) return <Spinner label={t('loadingTasks')} />;
  if (isError) {
    return <ErrorBox message={String(error ?? t('failedToLoadTasks'))} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-separator px-2 py-1.5">
        <div className="relative w-52">
          <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('searchTasks')}
            className="input w-full ps-8"
            aria-label={t('searchTasks')}
          />
        </div>
        <div className="flex items-center overflow-hidden rounded-(--app-radius) border border-separator bg-surface" role="group" aria-label={t('taskListOptions')}>
          <ToolButton
            label={t('showOnlyReserved')}
            active={showOnlyReserved}
            onClick={() => {
              setShowOnlyReserved((v) => !v);
              setCurrentPage(0);
            }}
            icon={<UserIcon className="h-3.5 w-3.5" />}
          />
          <span className="h-4 w-px bg-separator" />
          <ToolButton
            label={t('sortByDate')}
            active={sortField === 'date'}
            onClick={() => toggleSort('date')}
            icon={
              <>
                <CalendarIcon className="h-3.5 w-3.5" />
                {sortField === 'date' ? <SortArrow ascending={sortAscending} /> : null}
              </>
            }
          />
          <span className="h-4 w-px bg-separator" />
          <ToolButton
            label={t('sortByPriority')}
            active={sortField === 'priority'}
            onClick={() => toggleSort('priority')}
            icon={
              <>
                <FlagIcon className="h-3.5 w-3.5" />
                {sortField === 'priority' ? <SortArrow ascending={sortAscending} /> : null}
              </>
            }
          />
          <span className="h-4 w-px bg-separator" />
          <ToolButton label={t('cardView')} active={!isTableView} onClick={() => setIsTableView(false)} icon={<GridIcon className="h-3.5 w-3.5" />} />
          <span className="h-4 w-px bg-separator" />
          <ToolButton label={t('tableView')} active={isTableView} onClick={() => setIsTableView(true)} icon={<ListIcon className="h-3.5 w-3.5" />} />
        </div>
        <span className="chip chip--sm">{
            filtered.length === 0 ? t('noRows') : t('rowsOf', { start, end, total: filtered.length })
          }</span>
        <AppTooltip label={t('openAiAssist')}>
          <button onClick={() => requestAi('')} className={`${btnCls('outline', true)} ms-auto`} aria-label={t('aiAssist')}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-(--accent)">
              <path d="M12 2 9.9 9.9 2 12l7.9 2.1L12 22l2.1-7.9L22 12l-7.9-2.1L12 2Zm7 14-1.2 4.8L15 19.6 10.2 20.8 15 19.6 13.8 20.8 15 19.6 15 16Zm-2.5-1.5-2.1 2.1 1.3 4.4 2.1-2.1-1.3-4.4Z" />
            </svg>
            AI Assist
          </button>
        </AppTooltip>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-10 w-10 text-muted/60">
              {debouncedQuery ? (
                <path d="M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" strokeLinecap="round" />
              ) : (
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            <p className="text-(--app-fs-body) font-semibold text-foreground">
              {debouncedQuery ? t('noResultsFound') : t('noActiveTasks')}
            </p>
            <p className="text-(--app-fs-small) text-muted">
              {debouncedQuery ? t('tryDifferentQuery') : t('newTasksHere')}
            </p>
          </div>
        ) : isTableView ? (
          <TaskTable groups={paginated} itemLabels={itemLabels} viewLabels={viewColumns} onOpen={openTask} />
        ) : (
          <TaskCards groups={paginated} itemLabels={itemLabels} onOpen={openTask} />
        )}
      </div>

      {/* Pagination controls */}
      {filtered.length > 0 ? (
        <div className="flex items-center justify-end gap-1 border-t border-separator px-2 py-1">
          <PageButton icon="«" disabled={page === 0} onClick={() => setCurrentPage(0)} />
          <PageButton icon="‹" disabled={page === 0} onClick={() => setCurrentPage(page - 1)} />
          <span className="px-1 text-(--app-fs-small) text-muted">
            {page + 1} / {totalPages}
          </span>
          <PageButton icon="›" disabled={page >= totalPages - 1} onClick={() => setCurrentPage(page + 1)} />
          <PageButton icon="»" disabled={page >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)} />
        </div>
      ) : null}

      {selected ? (
        <TaskView
          process={process}
          user={user}
          token={token}
          group={selected.group}
          task={selected.task}
          taskLabels={taskLabels}
          dossier={dossier ?? null}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------- helpers ---------------------------------- */

/**
 * Port of the Dart "clickable task" resolution: the task found through the
 * first urlActive label (findDescriptionById), else the first task item.
 */
export function clickableTask(group: TaskGroup, itemLabels: TaskItemLabel[]): TaskItem | null {
  for (const label of itemLabels) {
    if (label.urlActive) {
      const col = label.itemColumnName ?? '';
      const direct = group.taskItems.find((t) => t.taskId === col);
      if (direct) {
        if (direct.description != null && String(direct.description).length > 0) return direct;
        continue;
      }
      const resolved = findDescriptionById(group.taskItems, col);
      if (resolved !== undefined && resolved !== null && String(resolved).length > 0) {
        // Like the Dart findDescriptionById: synthesize the item from its
        // parent (same taskId/instanceId) with the resolved description —
        // that description goes into the comment/complete URLs.
        const parent = group.taskItems[0];
        return { ...parent, taskId: parent.taskId, description: resolved };
      }
    }
  }
  return group.taskItems.length > 0 ? group.taskItems[0] : null;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#c0392b',
  2: '#b45309',
  3: '#1d4ed8',
  4: '#1e7e44',
  5: '#5e7478',
};

function PriorityChip({ priority }: { priority: number }) {
  const color = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS[5];
  return (
    <span
      className="ms-1 inline-flex h-4 items-center rounded-full border px-1.5 align-middle text-[9px] font-bold"
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}14` }}
    >
      P{priority}
    </span>
  );
}

function cellValue(label: TaskItemLabel, group: TaskGroup): string {
  const value = findDescriptionById(group.taskItems, label.itemColumnName ?? '');
  if (value == null || String(value).length === 0) return '';
  let displayValue = String(value);
  if (label.format === 'Date') {
    const date = Date.parse(displayValue);
    if (!Number.isNaN(date)) displayValue = formatDate(new Date(date));
  } else if (label.format === 'Number') {
    const num = Number.parseFloat(displayValue);
    if (!Number.isNaN(num) && label.formatString) {
      const decimals = (label.formatString.match(/0\.(0+)/) ?? [])[1]?.length ?? 0;
      displayValue = num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
  }
  const jsonList = tryParseJsonList(displayValue);
  if (jsonList) displayValue = i18n.t('jsonListCount', { n: jsonList.length });
  return label.urlActive ? displayValue.replaceAll('_', ' ') : displayValue;
}

function formatDate(dt: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(dt.getDate())}/${two(dt.getMonth() + 1)}/${dt.getFullYear()} ${two(dt.getHours())}:${two(dt.getMinutes())}`;
}

function timeDelta(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (Math.floor(diff / 86400000) > 0) return `${Math.floor(diff / 86400000)}d`;
  if (Math.floor(diff / 3600000) > 0) return `${Math.floor(diff / 3600000)}h`;
  if (mins > 0) return `${mins}m`;
  return 'now';
}

function StatusIcon({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation();
  const reserved = status === 'Reserved';
  return (
    <span
      title={reserved ? t('taskStatusReservedTooltip') : t('taskStatusFreeTooltip')}
      className="flex h-5 w-5 items-center justify-center rounded-full"
      style={{
        color: reserved ? 'var(--success)' : 'var(--muted)',
        backgroundColor: `color-mix(in srgb, ${reserved ? 'var(--success)' : 'var(--muted)'} 12%, transparent)`,
        border: `0.5px solid color-mix(in srgb, ${reserved ? 'var(--success)' : 'var(--muted)'} 30%, transparent)`,
      }}
    >
      <UserIcon className="h-3 w-3" />
    </span>
  );
}

/* ---------------------------------- toolbar icons ---------------------------------- */

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" />
    </svg>
  );
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H7V2Zm-2 9h14v8H5v-8Z" />
    </svg>
  );
}
function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 3v18h2v-7h11l-2-4 2-4H7V3H5Z" />
    </svg>
  );
}
function GridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  );
}
function ListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h16v2H4v-2Z" />
    </svg>
  );
}
function SortArrow({ ascending }: { ascending: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`h-3 w-3 ${ascending ? '' : 'rotate-180'}`}>
      <path d="M12 5 6 13h4v6h4v-6h4L12 5Z" />
    </svg>
  );
}

function ToolButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick(): void; icon: React.ReactNode }) {
  return (
    <AppTooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex h-(--app-icon-btn) items-center gap-1 px-2 ${
          active ? 'text-(--accent)' : 'text-muted hover:bg-surface-secondary'
        }`}
      >
        {icon}
      </button>
    </AppTooltip>
  );
}

/* ---------------------------------- table view ---------------------------------- */

function TaskTable({
  groups,
  itemLabels,
  viewLabels,
  onOpen,
}: {
  groups: TaskGroup[];
  /** All labels — clickable (urlActive) task resolution + search. */
  itemLabels: TaskItemLabel[];
  /** The table's columns — the process data's view items. */
  viewLabels: TaskItemLabel[];
  onOpen(group: TaskGroup, task: TaskItem): void;
}) {
  const { t } = useTranslation();
  return (
    <div className="table-root h-full">
      <div className="table__scroll-container h-full overflow-auto">
        <table className="w-full min-w-max border-collapse text-start">
          <thead className="table__header sticky top-0 z-10">
            <tr>
              {viewLabels.map((label) => (
                <th key={label.itemColumnName || label.description} className="table__column whitespace-nowrap">
                  {label.description}
                  {label.urlActive ? <span className="ms-1 font-normal opacity-60">{t('priority')}</span> : null}
                </th>
              ))}
              <th className="table__column whitespace-nowrap">{t('started')}</th>
              <th className="table__column whitespace-nowrap">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="table__body">
            {groups.map((group) => {
              const clickable = clickableTask(group, itemLabels);
              const dateTask = clickable ?? group.taskItems[0];
              const status = clickable?.taskPhaseStatus ?? group.taskItems[0]?.taskPhaseStatus;
              return (
                <tr
                  key={group.id}
                  className="table__row cursor-pointer hover:bg-surface-secondary"
                  onClick={() => clickable && onOpen(group, clickable)}
                >
                  {viewLabels.map((label) => (
                    <td key={label.itemColumnName || label.description} className="table__cell max-w-[180px] min-w-[110px] truncate">
                      {cellValue(label, group) || <span className="opacity-40">—</span>}
                      {label.urlActive && clickable?.priority != null ? (
                        <PriorityChip priority={clickable.priority} />
                      ) : null}
                    </td>
                  ))}
                  <td className="table__cell whitespace-nowrap text-muted">
                    {dateTask?.startedAt
                      ? `${formatDate(new Date(dateTask.startedAt))} (${timeDelta(dateTask.startedAt)})`
                      : ''}
                  </td>
                  <td className="table__cell">
                    <StatusIcon status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------- card view ---------------------------------- */

function TaskCards({
  groups,
  itemLabels,
  onOpen,
}: {
  groups: TaskGroup[];
  itemLabels: TaskItemLabel[];
  onOpen(group: TaskGroup, task: TaskItem): void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const clickable = clickableTask(group, itemLabels);
        const mainLabel = itemLabels.find((l) => l.urlActive) ?? itemLabels[0];
        const mainValue = mainLabel ? cellValue(mainLabel, group) : '';
        const status = clickable?.taskPhaseStatus ?? group.taskItems[0]?.taskPhaseStatus;
        return (
          <button
            key={group.id}
            onClick={() => clickable && onOpen(group, clickable)}
            className="rounded-(--app-radius) border border-separator bg-surface p-2.5 text-start transition hover:border-(--accent)/60 hover:shadow-surface"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-(--app-fs-base) font-semibold text-foreground">
                {group.name.replaceAll('_', ' ')}
              </span>
              <StatusIcon status={status} />
            </div>
            {mainValue ? <div className="truncate text-(--app-fs-base) text-muted">{mainValue}</div> : null}
            <div className="mt-1 flex items-center justify-between">
              <span className="text-(--app-fs-small) text-muted">
                {clickable?.startedAt
                  ? `${formatDate(new Date(clickable.startedAt))} (${timeDelta(clickable.startedAt)})`
                  : ''}
              </span>
              {clickable?.priority != null ? <PriorityChip priority={clickable.priority} /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PageButton({ icon, disabled, onClick }: { icon: string; disabled: boolean; onClick(): void }) {
  const { t } = useTranslation();
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="button button--outline button--sm"
      aria-label={`${t('pageLabel')} ${icon}`}
    >
      {icon}
    </button>
  );
}
