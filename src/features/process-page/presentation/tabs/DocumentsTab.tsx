import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import {
  useDeleteDocument,
  useDocuments,
  useDownloadDocument,
  useAddDocument,
} from '../../../shared/hooks/use-queries';
import { DataTable, ErrorBox, SearchInput, Spinner, Badge } from '../../../shared/components/ui';
import { BaseUrls } from '../../../../core/config/base-urls';

/**
 * "Documents" tab — React port of
 * process_document/presentation/pages/search_document_page.dart:
 * search + documents table for the process, upload / download / delete,
 * tags and groups.
 */
export function DocumentsTab() {
  const { t } = useTranslation();
  const { process, user, token, groups } = useWorkspaceContext();
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');

  if (!process || !user || !token) return <Spinner label={t('loadingProcess')} />;

  const docRoles = process.roles.length > 0 ? process.roles[0].docRoles : [];

  const { data: documents, isLoading, isError, error, refetch } = useDocuments({
    processId: process.id,
    docRoles,
    groups,
    keyword: appliedKeyword || undefined,
    token,
  });

  const download = useDownloadDocument(token);
  const deleteDocument = useDeleteDocument(token);
  const addDocument = useAddDocument(token);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-separator p-2 dark:border-ink-800">
        <div className="max-w-xs flex-1">
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder={t('searchDocuments')}
            onSearch={setAppliedKeyword}
          />
        </div>
        <button
          onClick={() => void refetch()}
          className="button button--outline button--sm"
        >
          {t('refresh')}
        </button>
        <label className="button button--primary cursor-pointer">
          {addDocument.isPending ? t('uploading') : `+ ${t('upload')}`}
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void upload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <Spinner label={t('loadingDocuments')} />
        ) : isError ? (
          <ErrorBox message={String(error ?? t('failedToLoadDocuments'))} onRetry={() => void refetch()} />
        ) : (
          <DataTable
            columns={[
              { key: 'name', label: t('name') },
              { key: 'type', label: t('typeLabel'), width: '70px' },
              { key: 'size', label: t('size'), width: '80px' },
              { key: 'processInstanceId', label: t('instance'), width: '140px' },
              { key: 'tags', label: t('tags'), width: '140px' },
              { key: 'uploadDate', label: t('uploaded'), width: '130px' },
              { key: 'actions', label: '', width: '140px' },
            ]}
            rows={(documents ?? []).map((d) => ({
              name: d.name,
              type: (
                <Badge>{d.type}</Badge>
              ),
              size: formatSize(d.size),
              processInstanceId: (
                <span className="font-mono text-(--app-fs-small)" title={d.processInstanceId ?? ''}>
                  {d.processInstanceId ? `${d.processInstanceId.slice(0, 14)}…` : '—'}
                </span>
              ),
              tags: (d.tags ?? []).map((t) => t.name).join(', '),
              uploadDate: d.uploadDate ? new Date(d.uploadDate).toLocaleString() : '—',
              actions: (
                <span className="flex gap-1">
                  <button
                    className="text-(--accent) hover:underline"
                    disabled={download.isPending}
                    onClick={() =>
                      void download
                        .mutateAsync(d)
                        .then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = d.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        })
                        .catch((e) => window.alert(String(e)))
                    }
                  >
                    {t('download')}
                  </button>
                  <a
                    className="text-muted hover:underline"
                    href={`${BaseUrls.documentServiceBaseUrl}/documents/${d.id}/download/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('open')}
                  </a>
                  <button
                    className="text-(--danger) hover:underline"
                    onClick={() => {
                      if (!window.confirm(t('deleteDocumentConfirm', { name: d.name }))) return;
                      void deleteDocument.mutateAsync(d.id).catch((e) => window.alert(String(e)));
                    }}
                  >
                    {t('delete')}
                  </button>                </span>
              ),
            }))}
            keyFn={(_, i) => String((documents ?? [])[i]?.id ?? i)}
            emptyMessage={t('noDocumentsFound')}
          />
        )}
      </div>
    </div>
  );

  async function upload(file: File) {
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      await addDocument.mutateAsync({
        id: 0,
        name: file.name,
        description: '',
        type: guessType(file.name),
        size: file.size,
        userId: user!.username,
        bytes,
        file,
        processId: process!.id,
        permissions: [],
      });
    } catch (e) {
      window.alert(`Upload failed: ${String(e)}`);
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return 'other';
}
