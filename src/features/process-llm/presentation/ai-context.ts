import type { Form } from '../../process-forms/data/models/form-model';
import type { TaskAttachment, TaskGroup, TaskItem } from '../../process-tasks/data/models/task-models';
import type { ProcessInstanceData } from '../../process-audit/data/models/audit-models';

export interface AiContextInput {
  processName?: string;
  dossier?: Form | null;
  timeline?: ProcessInstanceData | null;
  task?: { group: TaskGroup; task: TaskItem } | null;
  attachments?: TaskAttachment[];
  /** Download URLs of the task documents — sent as `doc_links` (server-side RAG). */
  docLinks?: string[];
}

export interface AiContext {
  /** The system-message context block (empty string when nothing is available). */
  systemContext: string;
  /** Document URLs to pass to the model (querydocv2 `doc_links`). */
  docLinks: string[];
  /** Which pieces were included — for the context chips in the sidebar. */
  pieces: { dossier: boolean; timeline: boolean; task: boolean; documents: number };
}

/**
 * Builds the AI context from the active workspace data (dossier, process
 * timeline, active task, task documents) — pure function, unit-tested.
 * Serialized as plain "label: value" blocks so any chat model can ground
 * its answers (Option A of the plan; embedding-based retrieval is the
 * future Option B behind this same interface).
 */
export function buildAiContext(input: AiContextInput): AiContext {
  const blocks: string[] = [];
  const pieces = { dossier: false, timeline: false, task: false, documents: 0 };

  // --- Dossier (selected form input) ---
  if (input.dossier) {
    const lines: string[] = [];
    for (const field of input.dossier.formFields ?? []) {
      const raw = input.dossier.formInput?.[field.fieldName];
      if (raw == null) continue;
      const value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw).trim();
      if (!value || value === 'null' || value === 'None') continue;
      const label = field.fieldLabel || field.fieldName;
      lines.push(`${label}: ${truncate(value, 300)}`);
    }
    if (lines.length > 0) {
      blocks.push(`Dossier (ID: ${input.dossier.formId ?? '?'}):\n${capLines(lines, 40).join('\n')}`);
      pieces.dossier = true;
    }
  }

  // --- Process timeline (node instances, same data as the WorkflowLine) ---
  if (input.timeline && input.timeline.nodeInstances.length > 0) {
    const nodes = [...input.timeline.nodeInstances].sort((a, b) => a.orderIndex - b.orderIndex);
    const lines = nodes.map((n, i) => {
      const name = n.nodeName || n.nodeId || n.nodeType;
      const done = n.leaveTime != null;
      const status = done ? 'completed' : n.triggerTime != null ? 'in progress' : 'not started';
      return `${i + 1}. ${name} — ${status}`;
    });
    blocks.push(`Process timeline:\n${capLines(lines, 30).join('\n')}`);
    pieces.timeline = true;
  }

  // --- Active task (group fields resolved like the task table) ---
  if (input.task) {
    const { group, task } = input.task;
    const lines: string[] = [];
    for (const item of group.taskItems ?? []) {
      const label = (item.taskId ?? '').replaceAll('_', ' ');
      if (!label) continue;
      const value = item.description == null ? '' : String(item.description).trim();
      lines.push(`${label}: ${value || '—'}`);
    }
    const header = `Active task: ${String(task.description ?? group.name).replaceAll('_', ' ')}` +
      (task.priority != null ? ` (priority ${task.priority})` : '') +
      (task.taskPhaseStatus ? ` — ${task.taskPhaseStatus}` : '');
    blocks.push(`${header}\n${capLines(lines, 40).join('\n')}`);
    pieces.task = true;
  }

  // --- Task documents (metadata here; content via doc_links on the server) ---
  if (input.attachments && input.attachments.length > 0) {
    const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
    const lines = input.attachments.map(
      (a) => `- ${a.name} (${extOf(a.name) || 'file'})${a.tags && a.tags.length > 0 ? ` [${a.tags.map((t) => t.name).join(', ')}]` : ''}`,
    );
    blocks.push(`Task documents:\n${capLines(lines, 20).join('\n')}`);
    pieces.documents = input.attachments.length;
  }

  const docLinks = (input.docLinks ?? []).filter(Boolean);

  const systemContext =
    blocks.length === 0
      ? ''
      : [
          `You are the AI assistant of the Oumma agentic workspace${input.processName ? ` for the process "${input.processName}"` : ''}.`,
          'Answer the user\'s questions using the context below. When the context is insufficient, say so and do not invent data.',
          '',
          'CONTEXT',
          ...blocks,
        ].join('\n');

  return { systemContext, docLinks, pieces };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function capLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max), `… (+${lines.length - max} more)`];
}
