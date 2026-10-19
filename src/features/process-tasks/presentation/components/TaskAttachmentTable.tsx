import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskAttachment, TaskGroup, TaskItem } from '../../data/models/task-models';
import type { TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import { Modal, btnCls } from '../../../shared/components/ui';
import { AddAttachmentDialog } from './AddAttachmentDialog';

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.1 6.4L20.5 10l-6.4 2.1L12 18.5 9.9 12.1 3.5 10l6.4-1.6L12 2z" />
    </svg>
  );
}
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

interface Props {
  attachments: TaskAttachment[];
  process: ProcessApp;
  processInstanceId: string;
  group: TaskGroup;
  task: TaskItem;
  user: User;
  viewItems: TaskItemLabel[];
  token: string;
  onRefresh(): void;
  onDeleteAttachment(attachment: TaskAttachment): Promise<void>;
  onAskAI?(docLinks: string[], accessToken: string, attachmentName: string): void;
}

/**
 * Port of lib/features/process_tasks/presentation/pages/widgets/task_attachments_table.dart:
 * attachment rows with file-type chip, authenticated download, Ask AI and
 * delete (with confirmation); "Add attachment" uploads via the document
 * service then registers the task attachment.
 */
export function TaskAttachmentTable(props: Props) {
  const { t } = useTranslation();
  const { attachments, process, processInstanceId, group, task, user, token, onRefresh, onDeleteAttachment, onAskAI } = props;
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TaskAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pickFile = () => setShowAdd(true);

  /** Authenticated download — port of _downloadAttachment (Bearer header, Content-Disposition filename). */
  const download = async (attachment: TaskAttachment) => {
    try {
      const res = await fetch(attachment.content, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(`${t('failedToDownload')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="rounded-(--app-radius) border border-separator bg-surface-secondary/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--accent)/10 text-(--accent)">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="m20 6-8.5 8.5a3 3 0 0 0 4.2 4.2l8-8a5 5 0 0 0-7-7l-8 8a7 7 0 0 0 9.8 9.8L21 14l-1.4-1.4-6.4 6.4a5 5 0 0 1-7-7l8-8a3 3 0 0 1 4.2 4.2l-8 8a1 1 0 0 1-1.4-1.4L20 6Z" />
            </svg>
          </span>
          <h3 className="text-(--app-fs-base) font-semibold text-foreground">{t('attachments')}</h3>
        </div>
        <button onClick={pickFile} className="button button--outline button--sm">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
          </svg>
          {t('addAttachment')}
        </button>
      </div>

      {attachments.length === 0 ? (
        <p className="py-4 text-center text-(--app-fs-base) text-muted">{t('noAttachmentsYet')}</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group flex items-center gap-2.5 rounded-(--app-radius) border border-separator bg-surface p-2"
            >
              <FileChip name={a.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-(--app-fs-base) font-medium text-foreground">{a.name}</div>
                <div className="truncate text-(--app-fs-small) text-muted">
                  {a.updatedBy} · {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : ''}
                  {a.tags && a.tags.length > 0 ? ` · ${a.tags.map((tag) => tag.name).join(', ')}` : ''}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                {a.content ? (
                  <button title={t('download')} className="rounded p-1 text-(--accent) hover:bg-surface" onClick={() => void download(a)}>
                    <DownloadIcon className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {onAskAI && a.content ? (
                  <button title={t('askAiAboutAttachment')} className="rounded p-1 text-(--accent) hover:bg-surface" onClick={() => onAskAI([a.content], token, a.name)}>
                    <SparkleIcon className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button title={t('delete')} className="rounded p-1 text-(--danger) hover:bg-surface" onClick={() => setConfirmDelete(a)}>
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation — port of the Dart confirmDeleteAttachment dialog */}
      {confirmDelete ? (
        <Modal title={t('confirmDelete')} onClose={() => setConfirmDelete(null)}>
          <div className="space-y-3">
            <p className="text-(--app-fs-body) font-semibold text-foreground">{t('confirmDeleteAttachment')}</p>
            <p className="truncate text-(--app-fs-body) italic text-muted">{confirmDelete.name}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className={btnCls('outline')}>
                {t('cancel')}
              </button>
              <button
                disabled={deleting}
                onClick={() => {
                  const target = confirmDelete;
                  setDeleting(true);
                  setConfirmDelete(null);
                  void onDeleteAttachment(target)
                    .catch((e) => window.alert(`${t('failedToDeleteAttachment')}: ${e instanceof Error ? e.message : String(e)}`))
                    .finally(() => setDeleting(false));
                }}
                className={btnCls('danger')}
              >
                {deleting ? t('deleting') : t('yesDelete')}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Add attachments — multi-file + per-file tag selection (add_task_attachment.dart) */}
      {showAdd ? (
        <AddAttachmentDialog
          process={process}
          processInstanceId={processInstanceId}
          group={group}
          task={task}
          user={user}
          token={token}
          onClose={() => setShowAdd(false)}
          onDone={onRefresh}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------- file chip ---------------------------------- */

function fileColor(ext: string): string {
  switch (ext) {
    case 'pdf':
      return '#c0392b';
    case 'doc':
    case 'docx':
      return '#1d4ed8';
    case 'xls':
    case 'xlsx':
      return '#1e7e44';
    case 'ppt':
    case 'pptx':
      return '#b45309';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return '#6d28d9';
    case 'zip':
    case 'rar':
    case '7z':
      return '#a16207';
    default:
      return '#5e7478';
  }
}

function FileChip({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  const ext = dot !== -1 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : 'file';
  const color = fileColor(ext);
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[8px] font-bold uppercase text-white"
      style={{ backgroundColor: color }}
    >
      {ext.length > 4 ? ext.slice(0, 4) : ext}
    </span>
  );
}
