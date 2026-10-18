/**
 * Task report (printable HTML) — web equivalent of
 * lib/core/utils/task_report_generator.dart: header, executive summary,
 * task details (grouped), comments, attachments, process timeline.
 * Opened in a new window; the user saves it as PDF via the browser print
 * dialog (same preview-and-print flow as TaskReportGenerator.showReportPreview).
 */
import type { TaskAttachment, TaskComment } from '../../data/models/task-models';
import type { ProcessInstanceData } from '../../../process-audit/data/models/audit-models';

interface ReportInput {
  taskName: string;
  processDescription: string;
  groupedDetails: Record<string, { label: string; value: string }[]> | null;
  comments: TaskComment[] | null;
  attachments: TaskAttachment[] | null;
  processStatus: ProcessInstanceData | null;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function cell(v: unknown): string {
  const s = v == null ? '' : String(v).trim();
  return s === '' || s === 'null' || s === 'None' ? '-' : esc(s);
}

export function buildTaskReportHtml(input: ReportInput): string {
  const { taskName, processDescription, groupedDetails, comments, attachments, processStatus } = input;
  const now = new Date().toLocaleString();

  const detailRows = Object.values(groupedDetails ?? {})
    .flatMap((section) =>
      section.map((r) => `<tr><td class="label">${esc(r.label)}</td><td>${cell(r.value)}</td></tr>`),
    )
    .join('');

  const commentRows = (comments ?? [])
    .map(
      (c) =>
        `<tr><td>${esc(c.updatedBy)}</td><td>${esc(c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '')}</td><td>${esc(c.content)}</td></tr>`,
    )
    .join('');

  const attachmentRows = (attachments ?? [])
    .map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.updatedBy)}</td><td>${esc(a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '')}</td></tr>`)
    .join('');

  const nodes = [...(processStatus?.nodeInstances ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const timelineRows = nodes
    .map(
      (n) =>
        `<tr><td>${esc(n.nodeName || n.nodeId || n.nodeType)}</td>` +
        `<td>${n.triggerTime ? new Date(n.triggerTime).toLocaleString() : '—'}</td>` +
        `<td>${n.leaveTime ? new Date(n.leaveTime).toLocaleString() : 'in progress'}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Task report — ${esc(taskName)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a2b32; margin: 32px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #d5e3e8; padding-bottom: 4px; }
  .sub { color: #5b6b72; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5eef1; vertical-align: top; }
  th { background: #f2f7f8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
  td.label { font-weight: 600; width: 34%; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Task report</h1>
  <div class="sub">${esc(taskName.replace(/_/g, ' '))} — ${esc(processDescription)} · generated ${esc(now)}</div>

  <h2>Executive summary</h2>
  <table>
    <tr><td class="label">Task</td><td>${esc(taskName.replace(/_/g, ' '))}</td></tr>
    <tr><td class="label">Process</td><td>${esc(processDescription)}</td></tr>
    <tr><td class="label">Process state</td><td>${esc(processStatus?.processName ?? '-')}</td></tr>
  </table>

  <h2>Task details</h2>
  <table>${detailRows || '<tr><td>No detail fields</td></tr>'}</table>

  <h2>Comments &amp; feedback</h2>
  <table>
    <tr><th>By</th><th>Date</th><th>Comment</th></tr>
    ${commentRows || '<tr><td colspan="3">No comments</td></tr>'}
  </table>

  <h2>Attachments &amp; documents</h2>
  <table>
    <tr><th>Name</th><th>By</th><th>Date</th></tr>
    ${attachmentRows || '<tr><td colspan="3">No attachments</td></tr>'}
  </table>

  <h2>Process timeline</h2>
  <table>
    <tr><th>Step</th><th>Started</th><th>Finished</th></tr>
    ${timelineRows || '<tr><td colspan="3">No timeline data</td></tr>'}
  </table>

  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
}
