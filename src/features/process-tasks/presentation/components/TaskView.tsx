import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskAttachment, TaskGroup, TaskItem } from '../../data/models/task-models';
import type { TaskGroupLabel } from '../../../process-page/data/models/task-group-label';
import type { Form } from '../../../process-forms/data/models/form-model';
import type { TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import { useDocuments, useProcessInstanceData, useProcessTimeline, useTaskActions, useTaskAttachments, useTaskComments, useDeleteDocument } from '../../../shared/hooks/use-queries';
import { ErrorBox, Modal, Spinner, btnCls } from '../../../shared/components/ui';
import { WorkflowLine } from '../../../process-status/presentation/components/WorkflowLine';
import { ProcessProgressPanel } from '../../../process-status/presentation/components/ProcessProgressPanel';
import { useWorkspaceContext } from '../../../process-page/presentation/hooks/use-workspace-context';
import { dedupViewItems, groupRowsByViewItemId } from './task-view-model';
import { ProcessFieldsSection } from './ProcessFieldsSection';
import { getDependencies } from '../../../../core/di';
import { TaskActionButtons } from './TaskActionButtons';
import { TaskCommentTable } from './TaskCommentTable';
import { TaskAttachmentTable } from './TaskAttachmentTable';

type Json = Record<string, unknown>;

interface Props {
  process: ProcessApp;
  user: User;
  token: string;
  group: TaskGroup;
  /** The clicked task item (its description is the step/task name). */
  task: TaskItem;
  taskLabels: TaskGroupLabel[];
  /** Selected dossier (if any) — its field names are deduped from Task Details. */
  dossier: Form | null;
  onClose(): void;
}

const PRIORITY_STYLES: Record<number, { color: string }> = {
  1: { color: '#c0392b' },
  2: { color: '#b45309' },
  3: { color: '#1d4ed8' },
  4: { color: '#1e7e44' },
  5: { color: '#5e7478' },
};

/**
 * Task view — port of lib/features/process_tasks/presentation/pages/view_task.dart.
 *
 * On open: loads comments, attachments (enriched with document tags, as in
 * TaskBloc._enrichAttachments), the task status (priority) and the process
 * instance data (+ node owners) for the workflow line. View items come from
 * the process's task-group labels and are deduped against the selected
 * dossier; rows are grouped by view item id (JSON-list child keys skipped).
 */
export function TaskView({ process, user, token, group, task, taskLabels, dossier, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { groups } = useWorkspaceContext();
  const actions = useTaskActions(process, token);
  const deleteDocument = useDeleteDocument(token);

  const taskName = String(task.description ?? group.name).replaceAll('_', ' ');

  // View items are flattened across all labels (port of
  // _selectedTaskGroupLabel = taskState.taskLabels.expand((g) => g.taskViewItems))
  // — the synthesized oumma label is keyed by process id, not group name, so a
  // find-by-group-name lookup never matched and the detail rows came up empty.
  const rawViewItems: TaskItemLabel[] = useMemo(
    () => taskLabels.flatMap((l) => l.taskViewItems),
    [taskLabels],
  );
  // Port of _dedupViewItems: hide view items whose field name already exists
  // in the selected dossier (the dossier card already shows them).
  const viewItems = useMemo(() => dedupViewItems(rawViewItems, dossier), [rawViewItems, dossier]);
  const groupedRows = useMemo(
    () => groupRowsByViewItemId(group.taskItems, viewItems),
    [group.taskItems, viewItems],
  );

  // Fallback Task Details: when the configured view items yield no rows
  // (the section is empty), show this task's own OUTPUT data from the task
  // history (taskshist) — label + value, labels translated through the
  // process' search items, output values only. Same data as the audit
  // view's per-task history.
  const hasConfiguredRows = Object.keys(groupedRows).length > 0;
  const { data: historyItems } = useQuery({
    queryKey: ['task-view-outputs', process.id, group.id],
    queryFn: async () => {
      // Search items first (output labels resolve against them), same as
      // the useTaskHistory hook in the audit view.
      const si = await getDependencies().auditDataSource.getSearchItems(
        process.id,
        groups,
        token,
      );
      return getDependencies().auditDataSource.getTaskHistoryItems({
        processId: process.id,
        instanceId: group.id,
        groups,
        currentItems: si,
        languageCode: i18n.language,
        token,
      });
    },
    enabled: !hasConfiguredRows,
  });
  const detailRows = useMemo(() => {
    if (hasConfiguredRows || !historyItems) return groupedRows;
    const entry = historyItems.find(
      (h) => h.taskDescription === group.name || h.referenceName === group.name,
    );
    if (!entry || entry.viewItems.length === 0) return groupedRows;
    return {
      [taskName]: entry.viewItems.map((v) => ({
        label: v.key,
        value: typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value ?? ''),
      })),
    };
  }, [hasConfiguredRows, historyItems, groupedRows, group.name, taskName]);

  const {
    data: commentsData,
    isLoading: commentsLoading,
    error: commentsError,
    refetch: refetchComments,
  } = useTaskComments({ process, instanceId: group.id, groupId: group.name, token });
  const {
    data: attachmentsData,
    isLoading: attachmentsLoading,
    error: attachmentsError,
    refetch: refetchAttachments,
  } = useTaskAttachments({ process, instanceId: group.id, groupId: group.name, token });

  // Attachment enrichment with document tags (port of TaskBloc._enrichAttachments).
  const docRoles = process.roles[0]?.docRoles?.map((r) => ({ id: r.id })) ?? [];
  const { data: documents } = useDocuments({
    processId: process.id,
    docRoles,
    groups: [group.name],
    processInstanceId: group.id,
    token,
  });
  const attachments: TaskAttachment[] = useMemo(() => {
    const list = attachmentsData ?? [];
    if (!documents || documents.length === 0) return list;
    return list.map((a) => {
      if (a.documentId != null) {
        const matched = documents.find((d) => d.id === a.documentId);
        if (matched) return { ...a, tags: matched.tags ?? a.tags };
      }
      return a;
    });
  }, [attachmentsData, documents]);

  // Task status → priority (port of the bloc's taskPriority parsing from
  // status.value[0].taskPriority).
  const [priority, setPriority] = useState<number | null>(null);
  const statusFetched = useRef(false);
  useEffect(() => {
    if (statusFetched.current) return;
    statusFetched.current = true;
    void actions.getTaskStatus
      .mutateAsync({ processInstanceId: group.id, groupId: group.name })
      .then((status) => {
        const value = (status as { value?: unknown }).value;
        if (Array.isArray(value) && value.length > 0) {
          const first = value[0] as { taskPriority?: unknown };
          if (typeof first?.taskPriority === 'number') setPriority(first.taskPriority);
          else if (first?.taskPriority != null) {
            const p = Number.parseInt(String(first.taskPriority), 10);
            if (!Number.isNaN(p)) setPriority(p);
          }
        }
      })
      .catch(() => {
        /* status is best-effort */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  // Process instance data → task report (node instances).
  const { data: processStatus } = useProcessInstanceData({
    processId: process.id,
    instanceId: group.id,
    token,
  });
  // Oumma execution timeline (track × taskshist × llm_logs) → workflow line,
  // with owners + LLM decisions built in.
  const { data: timeline } = useProcessTimeline({
    processId: process.id,
    instanceId: group.id,
    token,
  });

  // Completion state
  const [isCompleting, setIsCompleting] = useState(false);
  const [completedOutput, setCompletedOutput] = useState<Json | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  const refreshAll = () => {
    void refetchComments();
    void refetchAttachments();
  };

  const complete = async (formData?: Json) => {
    setViewError(null);
    try {
      await actions.complete.mutateAsync({
        processInstanceId: group.id,
        taskId: String(task.description),
        taskInstanceId: task.instanceId,
        userId: user.username,
        groupId: group.name,
        formData,
      });
      setCompletedOutput(formData ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setViewError(`Task completed with an error: ${msg}`);
      throw e;
    } finally {
      setIsCompleting(false);
    }
  };

  /* ---------------------------------- AI assistant ---------------------------------- */
  // Both entry points open the workspace AI Assist sidebar with a prefill
  // (single AI surface — the old AiDialog modal is retired).
  const { requestAi } = useWorkspaceContext();
  const openAiAttachment = (docLinks: string[], _token: string, attachmentName: string) => {
    void docLinks; // the sidebar already picks the task's attachments into its context
    requestAi(`Analyse le document joint « ${attachmentName} » et présente ses points clés.`);
  };
  const openAiComment = (userComment: string, wordcount: string, _token: string) => {
    requestAi(`Suggère une réponse à ce commentaire (${wordcount} mots) : « ${userComment} »`);
  };

  /* ---------------------------------- completed screen ---------------------------------- */
  if (completedOutput !== null) {
    const rows = Object.entries(completedOutput).filter(([, v]) => v != null);
    return (
      <Modal title={taskName} onClose={onClose} wide>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-(--success)/15 text-(--success)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-7 w-7">
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-(--app-fs-title) font-bold text-foreground">{t('taskFinished')}</h2>
          <p className="text-(--app-fs-body) text-muted">{t('yourTaskIsForwarded')}</p>
          {/* Live Oumma progress until the engine responds with the result
              (next human task, or the process finishing). */}
          <div className="w-full max-w-[800px]">
            <ProcessProgressPanel
              processId={process.id}
              instanceId={group.id}
              token={token}
              runningLabel={t('forwardedProcessing')}
              settledLabel={(status, task) =>
                status === 'PAUSED'
                  ? `${t('forwardedWaitingAt')} ${task ?? ''}`
                  : status === 'COMPLETED'
                    ? t('processCompleted')
                    : t('processEndedWithError')
              }
            />
          </div>
          {rows.length > 0 ? (
            <div className="w-full max-w-[600px] overflow-hidden rounded-(--app-radius) border border-separator">
              <table className="w-full text-start">
                <thead className="table__header">
                  <tr>
                    <th className="table__column">{t('name')}</th>
                    <th className="table__column">{t('value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([k, v]) => (
                    <tr key={k} className="table__row">
                      <td className="table__cell text-muted">{k}</td>
                      <td className="table__cell">
                        {String(v).trim() === '' ? '-' : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <button onClick={onClose} className={btnCls('outline')}>
            ← Back to tasks
          </button>
        </div>
      </Modal>
    );
  }

  /* ---------------------------------- main view ---------------------------------- */
  return (
    <Modal title={taskName} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-(--app-fs-title) font-bold text-foreground">{taskName}</h2>
          {priority != null ? <PriorityBadge level={priority} /> : null}
        </div>
        <TaskActionButtons
          process={process}
          processInstanceId={group.id}
          group={group}
          task={task}
          user={user}
          token={token}
          viewItems={viewItems}
          comments={commentsData ?? null}
          attachments={attachments}
          processStatus={processStatus ?? null}
          groupedDetails={groupedRows}
          onComplete={async (formData) => {
            setIsCompleting(true);
            try {
              await complete(formData);
            } catch {
              /* error surfaced via viewError */
            }
          }}
          isCompleting={isCompleting}
          setIsCompleting={setIsCompleting}
        />
      </div>

      {viewError ? (
        <div className="alert alert--danger mt-2 gap-2 px-3 py-1.5">
          <div className="alert__content">
            <span className="alert__description text-(--app-fs-small)">{viewError}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 max-h-[60vh] space-y-3 overflow-auto pe-1">
        {/* Process progress at a glance — before the view items, as in the Dart view */}
        {timeline ? (
          <WorkflowLine timeline={timeline} />
        ) : null}

        {/* Task details (grouped view items; falls back to the task's own
            output data when no view items are configured) */}
        <ProcessFieldsSection groupedRows={detailRows} viewItems={viewItems} title={t('taskDetailsTitle')} />

        {/* Comments */}
        {commentsLoading ? (
          <Spinner label={t('loadingComments')} />
        ) : commentsError ? (
          <ErrorBox message={String(commentsError)} onRetry={() => void refetchComments()} />
        ) : (
          <TaskCommentTable
            comments={commentsData ?? []}
            process={process}
            processInstanceId={group.id}
            group={group}
            task={task}
            user={user}
            viewItems={viewItems ?? []}
            token={token}
            onAddComment={async (content) => {
              await actions.addComment.mutateAsync({
                processInstanceId: group.id,
                taskDescription: String(task.description),
                taskInstanceId: task.instanceId,
                userId: user.username,
                group: group.name,
                content,
              });
              refreshAll();
            }}
            onUpdateComment={async (comment, content) => {
              await actions.updateComment.mutateAsync({
                processInstanceId: group.id,
                taskDescription: String(task.description),
                taskInstanceId: task.instanceId,
                userId: user.username,
                group: group.name,
                comment: { ...comment, content },
              });
              refreshAll();
            }}
            onDeleteComment={async (commentId) => {
              await actions.deleteComment.mutateAsync({
                processInstanceId: group.id,
                taskDescription: String(task.description),
                taskInstanceId: task.instanceId,
                userId: user.username,
                group: group.name,
                commentId,
              });
              refreshAll();
            }}
            onSuggestComment={openAiComment}
          />
        )}

        {/* Attachments */}
        {attachmentsLoading ? (
          <Spinner label={t('loadingAttachments')} />
        ) : attachmentsError ? (
          <ErrorBox message={String(attachmentsError)} onRetry={() => void refetchAttachments()} />
        ) : (
          <TaskAttachmentTable
            attachments={attachments}
            process={process}
            processInstanceId={group.id}
            group={group}
            task={task}
            user={user}
            viewItems={viewItems ?? []}
            token={token}
            onRefresh={refreshAll}
            onDeleteAttachment={async (attachment) => {
              // Port of TaskBloc._onDeleteAttachmentsAndRefresh: delete the
              // backing document (when present) then the task attachment.
              if (attachment.documentId != null) {
                try {
                  await deleteDocument.mutateAsync(attachment.documentId);
                } catch {
                  /* document may already be gone */
                }
              }
              await actions.deleteAttachment.mutateAsync({
                processInstanceId: group.id,
                taskDescription: String(task.description),
                taskInstanceId: task.instanceId,
                userId: user.username,
                group: group.name,
                attachment,
              });
              refreshAll();
            }}
            onAskAI={openAiAttachment}
          />
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------- helpers ---------------------------------- */

function PriorityBadge({ level }: { level: number }) {
  const { t } = useTranslation();
  const style = PRIORITY_STYLES[level] ?? PRIORITY_STYLES[5];
  return (
    <span
      className="chip chip--sm"
      style={{
        color: style.color,
        borderColor: `${style.color}66`,
        backgroundColor: `${style.color}14`,
        border: `1px solid ${style.color}66`,
      }}
    >
      <span className="chip__label inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.color }} />
        {t('priorityN', { n: level })}
      </span>
    </span>
  );
}
