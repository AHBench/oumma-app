import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskComment, TaskGroup, TaskItem } from '../../data/models/task-models';
import type { TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import { Modal, btnCls } from '../../../shared/components/ui';

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.1 6.4L20.5 10l-6.4 2.1L12 18.5 9.9 12.1 3.5 10l6.4-1.6L12 2z" />
    </svg>
  );
}
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
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
  comments: TaskComment[];
  process: ProcessApp;
  processInstanceId: string;
  group: TaskGroup;
  task: TaskItem;
  user: User;
  viewItems: TaskItemLabel[];
  token: string;
  onAddComment(content: string): Promise<void>;
  onUpdateComment(comment: TaskComment, content: string): Promise<void>;
  onDeleteComment(commentId: string): Promise<void>;
  /** Opens the AI assistant with the comment text + word count (TA TC001/CM001 in the Dart app). */
  onSuggestComment?(userComment: string, wordcount: string, accessToken: string): void;
}

/**
 * Port of lib/features/process_tasks/presentation/pages/widgets/task_comments_table.dart:
 * header with "Add comment", comment cards (content, author, date) with
 * AI-suggest / edit / delete actions.
 */
export function TaskCommentTable(props: Props) {
  const { t } = useTranslation();
  const { comments, token, onAddComment, onUpdateComment, onDeleteComment, onSuggestComment } = props;

  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TaskComment | null>(null);

  const send = async () => {
    const content = newContent.trim();
    if (!content) return;
    setAdding(true);
    try {
      await onAddComment(content);
      setNewContent('');
      setShowAdd(false);
    } catch (e) {
      window.alert(`${t('failedToAddComment')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-(--app-radius) border border-separator bg-surface-secondary/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--accent)/10 text-(--accent)">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-5 4V4a1 1 0 0 1 1-1Zm3 5v2h10V8H7Zm0 4v2h7v-2H7Z" />
            </svg>
          </span>
          <h3 className="text-(--app-fs-base) font-semibold text-foreground">{t('comments')}</h3>
        </div>
        <button onClick={() => setShowAdd(true)} className="button button--outline button--sm">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
          </svg>
          {t('addComment')}
        </button>
      </div>

      {comments.length === 0 ? (
        <p className="py-4 text-center text-(--app-fs-base) text-muted">{t('noCommentsYet')}</p>
      ) : (
        <div className="space-y-1.5">
          {comments.map((c) => (
            <div key={c.id} className="group rounded-(--app-radius) border border-separator bg-surface p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-(--app-fs-body) text-foreground">
                  {c.content}
                </p>
                <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  {onSuggestComment ? (
                    <button
                      title={t('askAiAboutComment')}
                      className="rounded p-1 text-(--accent) hover:bg-surface"
                      onClick={() => onSuggestComment(c.content, String(c.content.trim().split(/\s+/).length), token)}
                    >
                      <SparkleIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button title={t('editComment')} className="rounded p-1 text-(--accent) hover:bg-surface" onClick={() => setEditing(c)}>
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title={t('delete')}
                    className="rounded p-1 text-(--danger) hover:bg-surface"
                    onClick={() => {
                      if (window.confirm(t('deleteCommentConfirmation'))) {
                        void onDeleteComment(c.id).catch((e) =>
                          window.alert(`${t('failedToDeleteComment')}: ${e instanceof Error ? e.message : String(e)}`),
                        );
                      }
                    }}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-(--app-fs-small) text-muted">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                  <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" />
                </svg>
                {c.updatedBy} · {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add comment dialog */}
      {showAdd ? (
        <Modal title={t('addComment')} onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <textarea
              rows={4}
              autoFocus
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t('writeAComment')}
              className="input w-full min-h-24 py-2"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className={btnCls('outline')}>
                {t('cancel')}
              </button>
              <button disabled={adding || newContent.trim().length === 0} onClick={() => void send()} className={btnCls('primary')}>
                {adding ? t('sending') : t('send')}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Edit comment dialog */}
      {editing ? (
        <EditCommentDialog
          comment={editing}
          onClose={() => setEditing(null)}
          onSave={async (content) => {
            try {
              await onUpdateComment(editing, content);
              setEditing(null);
            } catch (e) {
              window.alert(`Failed to update comment: ${e instanceof Error ? e.message : String(e)}`);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function EditCommentDialog({
  comment,
  onClose,
  onSave,
}: {
  comment: TaskComment;
  onClose(): void;
  onSave(content: string): Promise<void>;
}) {
  const [value, setValue] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  return (
    <Modal title={t('editComment')} onClose={onClose}>
      <div className="space-y-3">
        <textarea
          rows={4}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input w-full min-h-24 py-2"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnCls('outline')}>
            {t('cancel')}
          </button>
          <button
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave(value).finally(() => setSaving(false));
            }}
            className={btnCls('primary')}
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
