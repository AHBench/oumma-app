import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import { usePrintPayload } from '../../../shared/hooks/use-queries';
import { ErrorBox, Modal, Spinner } from '../../../shared/components/ui';

type Json = Record<string, unknown>;

/**
 * Print dialog — React port of process_print's process_print_page.dart.
 * Loads the process print templates (POST/GET {processService}/templates)
 * and renders the payload's inputData as a printable document.
 *
 * NOTE: the Flutter app generates real PDF/Excel binaries from the
 * template's jsonTemplate; here the payload is rendered as a print-oriented
 * HTML document (window.print) plus a JSON export — same data, lighter
 * output stack.
 */
export function PrintDialog({
  process,
  token,
  groups,
  inputData,
  allowedSteps,
  onClose,
}: {
  process: ProcessApp;
  token: string;
  groups: string[];
  inputData?: Json;
  allowedSteps?: Json[];
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { data: payload, isLoading, isError, error, refetch } = usePrintPayload({
    processId: process.id,
    token,
    allowedGroups: groups,
    allowedSteps,
    inputData,
  });
  const [templateId, setTemplateId] = useState<string | null>(null);

  const templates = payload?.templates ?? [];
  const selected = templates.find((t) => t.id === (templateId ?? templates[0]?.id)) ?? templates[0];

  const rows = flattenInput(payload?.inputData ?? {});

  return (
    <Modal title={t('printExportDossier')} onClose={onClose} wide>
      {isLoading ? (
        <Spinner label={t('loadingPrintTemplates')} />
      ) : isError ? (
        <ErrorBox message={String(error ?? t('failedToLoadPrintTemplates'))} onRetry={() => void refetch()} />
      ) : templates.length === 0 ? (
        <p className="py-6 text-center text-(--app-fs-base) text-muted">{t('noPrintTemplates')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-(--app-fs-base) text-foreground">{t('template')}:</label>
            <select
              className="rounded border border-separator bg-surface-secondary px-2 py-0.5 text-(--app-fs-base) dark:border-ink-700 dark:bg-ink-900"
              value={selected?.id ?? ''}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.templateType ? `(${t.templateType})` : ''}
                </option>
              ))}
            </select>
            {selected?.templateType ? (
              <span className="text-(--app-fs-small) text-muted">{t('format')}: {selected.templateType.toUpperCase()}</span>
            ) : null}
          </div>

          <div className="max-h-[50vh] overflow-auto rounded border border-separator p-3 dark:border-ink-700">
            <h3 className="mb-2 text-(--app-fs-base) font-semibold">{selected?.name ?? t('dossier')}</h3>
            {rows.length === 0 ? (
              <p className="text-(--app-fs-base) text-muted">{t('noInputData')}</p>
            ) : (
              <table className="w-full text-(--app-fs-base)">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-separator">
                      <td className="py-1 pe-2 align-top font-medium text-foreground">
                        {r.key}
                      </td>
                      <td className="break-words py-1 text-foreground">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex gap-2">
            <button
              className="button button--primary shrink-0"
              onClick={() => printHtml(process.name, selected?.name, rows)}
            >
              {t('print')}
            </button>
            <button
              className="rounded border border-ink-300 px-3 py-1 text-(--app-fs-base) text-foreground hover:bg-surface-secondary dark:border-ink-600 dark:text-ink-300"
              onClick={() => downloadJson(selected?.name ?? 'dossier', payload?.inputData ?? {})}
            >
              {t('downloadJson')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function flattenInput(input: Json, prefix = ''): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(input)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      rows.push(...flattenInput(v as Json, key));
    } else {
      rows.push({
        key,
        value: v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v),
      });
    }
  }
  return rows;
}

function printHtml(processName: string, templateName: string | undefined, rows: { key: string; value: string }[]): void {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(`<!doctype html>
<html><head><title>${templateName ?? processName}</title>
<style>body{font-family:sans-serif;font-size:12px;padding:24px}
h1{font-size:16px}table{width:100%;border-collapse:collapse}
td{border-bottom:1px solid #ddd;padding:4px 8px}td:first-child{font-weight:600;width:40%}</style>
</head><body>
<h1>${templateName ?? processName}</h1>
<table><tbody>${rows
    .map((r) => `<tr><td>${escapeHtml(r.key)}</td><td>${escapeHtml(r.value)}</td></tr>`)
    .join('')}</tbody></table>
</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
