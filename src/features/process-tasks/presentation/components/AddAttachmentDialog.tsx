import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseUrls } from '../../../../core/config/base-urls';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskGroup, TaskItem } from '../../data/models/task-models';
import type { Tag } from '../../../process-document/data/models/document-model';
import { useAddDocument, useDocumentTags, useTaskActions } from '../../../shared/hooks/use-queries';
import { Modal, Spinner, btnCls } from '../../../shared/components/ui';

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
const FILE_NAME_REGEX = /^[\w\-.]+$/;

interface PendingFile {
  file: File;
  name: string;
  ext: string;
  tags: Tag[];
}

/**
 * Port of lib/features/process_tasks/presentation/pages/widgets/add_task_attachment.dart:
 * two-pane dialog — left: picked files (tap to select, selected tags shown as
 * chips); right: "Select Tags for: <file>" tile list. Submit is disabled until
 * EVERY file has at least one tag ("Select tags required"), as in the Dart
 * original. Upload = create document (with tags) then register the task
 * attachment (AddAttachmentsAndRefresh flow).
 */
export function AddAttachmentDialog({
  process,
  processInstanceId,
  group,
  task,
  user,
  token,
  onClose,
  onDone,
}: {
  process: ProcessApp;
  processInstanceId: string;
  group: TaskGroup;
  task: TaskItem;
  user: User;
  token: string;
  onClose(): void;
  onDone(): void;
}) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: availableTags, isLoading: tagsLoading } = useDocumentTags(process.id, token);
  const addDocument = useAddDocument(token);
  const actions = useTaskActions(process, token);

  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const rejected = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setError(`File type not allowed: ${f.name} (allowed: ${ALLOWED_EXTENSIONS.join(', ')})`);
        return true;
      }
      if (!FILE_NAME_REGEX.test(f.name)) {
        setError('Invalid file name! Only letters, numbers, "-", "_" and "." are allowed.');
        return true;
      }
      return false;
    });
    if (rejected.length === 0) setError(null);
    if (files.length === 0) return;
    setPending((cur) => {
      const next = [...cur];
      for (const f of files) {
        if (rejected.includes(f)) continue;
        const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
        next.push({ file: f, name: f.name, ext, tags: [] });
      }
      // Select the newly added file (Dart: _selectedAttachmentIndex = last)
      setSelected(next.length - 1);
      return next;
    });
  };

  const toggleTag = (index: number, tag: Tag) => {
    setPending((cur) =>
      cur.map((p, i) =>
        i === index
          ? {
              ...p,
              tags: p.tags.some((t) => t.id === tag.id)
                ? p.tags.filter((t) => t.id !== tag.id)
                : [...p.tags, tag],
            }
          : p,
      ),
    );
  };

  const selectedFile = selected != null ? pending[selected] : null;
  const allTagged = pending.length > 0 && pending.every((p) => p.tags.length > 0);

  /** Port of _addAttachmentsToTask → TaskBloc._onAddAttachmentsAndRefresh. */
  const submit = async () => {
    if (pending.length === 0 || !allTagged) return;
    setUploading(true);
    try {
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        const docId = Date.now() + i;
        // 1) Create the document (tags included, as in the Dart bloc).
        const doc = await addDocument.mutateAsync({
          id: docId,
          name: p.name,
          description: p.name,
          type: p.ext,
          size: p.file.size,
          userId: user.username,
          bytes: Array.from(new Uint8Array(await p.file.arrayBuffer())),
          file: p.file,
          processId: process.id,
          processInstanceId,
          organizationId: String(task.description),
          groups: [group.name],
          permissions: [],
          status: 'ACTIVE',
          tags: p.tags,
        });
        // 2) Register the task attachment pointing at the document download.
        await actions.addAttachment.mutateAsync({
          processInstanceId,
          taskDescription: String(task.description),
          taskInstanceId: task.instanceId,
          userId: user.id,
          group: group.name,
          attachment: {
            id: String(docId),
            name: p.name,
            content: `${BaseUrls.documentServiceBaseUrl}/documents/${doc.id}/download`,
            updatedBy: user.id,
            updatedAt: doc.uploadDate ?? new Date().toISOString(),
            documentId: doc.id,
            tags: p.tags,
          },
        });
      }
      onDone();
      onClose();
    } catch (e) {
      setError(`Failed to add attachments: ${e instanceof Error ? e.message : String(e)}`);
      setUploading(false);
    }
  };

  return (
    <Modal title={t('addAttachments')} onClose={onClose} wide>
      <div className="space-y-3">
        {error ? (
          <div className="alert alert--danger gap-2 px-3 py-1.5">
            <div className="alert__content">
              <span className="alert__description text-(--app-fs-small)">{error}</span>
            </div>
          </div>
        ) : null}

        {/* Two panes: files (left) | tag selection (right) — as in the Dart dialog */}
        <div className="flex flex-col gap-3 md:flex-row">
          {/* Left: picked files */}
          <div className="flex min-h-[220px] flex-1 flex-col">
            <label className="mb-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-(--app-radius) border border-dashed border-(--accent)/40 py-4 text-center transition hover:border-(--accent) hover:bg-(--accent)/5">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-(--accent)">
                <path d="M19 13H8.83l3.58-3.59a1 1 0 0 0-1.41-1.41L6 12.59 2.83 9.41a1 1 0 1 0-1.41 1.42l4.5 4.5a1 1 0 0 0 1.41 0l4.99-4.99V13a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1h-4a1 1 0 0 0 0 2h1.17L7.17 14.59a1 1 0 1 0 1.41 1.41l4.5-4.5a1 1 0 0 0 .32-.72V4a1 1 0 0 0-1-1H4a1 1 0 0 0 0 2h4.17L3.59 10.59a1 1 0 0 0 1.41 1.41L9 8.09v2.41a1 1 0 0 0 1 1h9a1 1 0 0 0 0-2Z" />
              </svg>
              <span className="text-(--app-fs-body) font-medium text-foreground">{t('selectFilesMultiple')}</span>
              <span className="text-(--app-fs-small) text-muted">{t('allowedFormats')}</span>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={pickFiles} accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')} />
            </label>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-auto">
              {pending.length === 0 ? (
                <p className="py-4 text-center text-(--app-fs-base) text-muted">{t('noFilesSelected')}</p>
              ) : (
                pending.map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    onClick={() => setSelected(i)}
                    className={`cursor-pointer rounded-(--app-radius) border p-2 transition ${
                      selected === i
                        ? 'border-(--accent) bg-(--accent)/5'
                        : 'border-separator bg-surface hover:border-(--accent)/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-(--app-fs-base) font-medium text-foreground">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-muted">
                          <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5Z" />
                        </svg>
                        <span className="truncate">{p.name}</span>
                      </span>
                      <button
                        className="shrink-0 text-(--app-fs-small) text-(--danger) hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPending((cur) => cur.filter((_, j) => j !== i));
                          setSelected(null);
                        }}
                      >
                        {t('remove')}
                      </button>
                    </div>
                    {p.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className="chip chip--sm"
                            style={{ color: t.color, borderColor: t.color, border: `1px solid ${t.color}` }}
                          >
                            <span className="chip__label">{t.name}</span>
                          </span>
                        ))}
                        {p.tags.length > 3 ? (
                          <span className="text-(--app-fs-small) text-muted">+{p.tags.length - 3}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Vertical divider (md+) */}
          <div className="hidden w-px self-stretch bg-separator md:block" />

          {/* Right: tag selection for the selected file */}
          <div className="flex flex-1 flex-col">
            <div className="mb-2 text-(--app-fs-base) font-semibold text-foreground">
              {selectedFile ? (
                <>
                  {t('selectTagsFor')}
                  <br />
                  <span className="font-mono text-(--app-fs-small) font-normal text-muted">{selectedFile.name}</span>
                </>
              ) : (
                t('selectTags')
              )}
            </div>
            <div className="min-h-[200px] flex-1 overflow-auto rounded-(--app-radius) border border-separator p-2">
              {tagsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner label={t('loadingTags')} />
                </div>
              ) : (availableTags ?? []).length === 0 ? (
                <p className="flex h-full items-center justify-center text-(--app-fs-base) text-muted">
                  {selectedFile ? t('noTagsAvailable') : t('selectFilesFirst')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(availableTags ?? []).map((tag) => {
                    const isOn = selectedFile?.tags.some((t) => t.id === tag.id) ?? false;
                    const enabled = selected != null;
                    return (
                      <button
                        key={tag.id}
                        disabled={!enabled}
                        onClick={() => selected != null && toggleTag(selected, tag)}
                        className={`flex items-center gap-1.5 rounded-(--app-radius) border px-2 py-1 transition disabled:opacity-50 ${
                          isOn ? '' : 'border-separator hover:border-(--accent)/50'
                        }`}
                        style={isOn ? { backgroundColor: tag.color + '26', borderColor: tag.color } : undefined}
                      >
                        <span
                          className="flex h-[18px] w-[18px] items-center justify-center rounded-full border"
                          style={{ color: tag.color, borderColor: tag.color, backgroundColor: tag.color + '1a' }}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
                            <path d="M21.41 11.58 12.41 2.58A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.84ZM7.5 9A1.5 1.5 0 1 1 9 7.5 1.5 1.5 0 0 1 7.5 9Z" />
                          </svg>
                        </span>
                        <span
                          className={`max-w-[140px] truncate text-(--app-fs-base) ${isOn ? 'font-semibold' : 'text-foreground'}`}
                          style={{ color: isOn ? tag.color : undefined }}
                        >
                          {tag.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedFile && selectedFile.tags.length > 0 ? (
              <p className="mt-1 text-(--app-fs-small) text-muted">
                {t('selectedCount', { n: selectedFile.tags.length })}
              </p>
            ) : null}
          </div>
        </div>

        {/* Submit — enabled only when every file has at least one tag (Dart parity) */}
        <div className="flex items-center justify-between gap-2 border-t border-separator pt-3">
          <button onClick={onClose} disabled={uploading} className={btnCls('outline')}>
            {t('cancel')}
          </button>
          <button onClick={() => void submit()} disabled={uploading || !allTagged} className={btnCls('primary')}>
            {uploading
              ? t('uploading')
              : pending.length === 0
                ? t('selectFilesFirst')
                : !allTagged
                  ? t('selectTagsRequired')
                  : t('addNAttachments', { n: pending.length })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
