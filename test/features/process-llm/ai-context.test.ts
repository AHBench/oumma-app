import { describe, it, expect } from 'vitest';
import { buildAiContext } from '../../../src/features/process-llm/presentation/ai-context';
import type { Form } from '../../../src/features/process-forms/data/models/form-model';
import type { TaskGroup, TaskItem, TaskAttachment } from '../../../src/features/process-tasks/data/models/task-models';
import type { ProcessInstanceData } from '../../../src/features/process-audit/data/models/audit-models';

const form = (over: Partial<Form> = {}): Form =>
  ({
    formId: 'form-1',
    formFields: [
      { fieldName: 'nom', fieldLabel: 'Nom', fieldValue: 'Dupont', fieldRow: 1, fieldHeaderDisplay: true },
      { fieldName: 'age', fieldLabel: 'Âge', fieldValue: 45, fieldRow: 2, fieldHeaderDisplay: true },
      { fieldName: 'vide', fieldLabel: 'Vide', fieldValue: null, fieldRow: 3, fieldHeaderDisplay: true },
    ],
    formInput: { nom: 'Dupont', age: 45, vide: null },
    processInstanceIds: ['inst-1'],
    ...over,
  }) as unknown as Form;

const taskGroup = (over: Partial<TaskGroup> = {}): TaskGroup =>
  ({
    id: 'group-1',
    name: 'Collecte_Informations',
    taskItems: [
      { taskId: 'step_name', description: 'Etape A', instanceId: 't1', taskPhaseStatus: 'Reserved', startedAt: '2026-01-01T00:00:00Z', priority: 2 },
    ],
    ...over,
  }) as unknown as TaskGroup;

const task: TaskItem = {
  taskId: 'step_name',
  description: 'Collecte Informations Societe',
  instanceId: 't1',
  taskPhaseStatus: 'Reserved',
  startedAt: '2026-01-01T00:00:00Z',
  priority: 2,
} as unknown as TaskItem;

const timeline = (over: Partial<ProcessInstanceData> = {}): ProcessInstanceData =>
  ({
    id: 'inst-1',
    processId: 'proc-1',
    nodeInstances: [
      { id: 'n1', nodeId: 'nd1', nodeDefinitionId: 'd1', nodeName: 'Collecte', nodeType: 'HumanTaskNode', triggerTime: '2026-01-01T10:00:00Z', leaveTime: '2026-01-01T11:00:00Z', orderIndex: 1 },
      { id: 'n2', nodeId: 'nd2', nodeDefinitionId: 'd2', nodeName: 'Vérification', nodeType: 'HumanTaskNode', triggerTime: '2026-01-02T10:00:00Z', leaveTime: null, orderIndex: 2 },
    ],
    ...over,
  }) as unknown as ProcessInstanceData;

const attachment: TaskAttachment = {
  id: 'a1',
  name: 'contrat.pdf',
  content: 'http://localhost:8081/dms-api/documents/1/download',
  updatedBy: 'appadmin',
  updatedAt: '2026-01-01T00:00:00Z',
  tags: [{ id: 1, name: 'Urgent', color: '#c0392b' }],
} as unknown as TaskAttachment;

describe('buildAiContext', () => {
  it('returns empty context when nothing is available', () => {
    const ctx = buildAiContext({});
    expect(ctx.systemContext).toBe('');
    expect(ctx.pieces).toEqual({ dossier: false, timeline: false, task: false, documents: 0 });
  });

  it('serializes dossier fields (skipping empty)', () => {
    const ctx = buildAiContext({ processName: 'Kafi', dossier: form() });
    expect(ctx.systemContext).toContain('for the process "Kafi"');
    expect(ctx.systemContext).toContain('Nom: Dupont');
    expect(ctx.systemContext).toContain('Âge: 45');
    expect(ctx.systemContext).not.toContain('Vide');
    expect(ctx.pieces.dossier).toBe(true);
  });

  it('serializes the timeline with statuses in order', () => {
    const ctx = buildAiContext({ timeline: timeline() });
    const si = ctx.systemContext.indexOf('1. Collecte');
    const si2 = ctx.systemContext.indexOf('2. Vérification');
    expect(si).toBeGreaterThan(-1);
    expect(si2).toBeGreaterThan(si);
    expect(ctx.systemContext).toContain('1. Collecte — completed');
    expect(ctx.systemContext).toContain('2. Vérification — in progress');
    expect(ctx.pieces.timeline).toBe(true);
  });

  it('serializes the active task with priority and phase', () => {
    const ctx = buildAiContext({ task: { group: taskGroup(), task } });
    expect(ctx.systemContext).toContain('Active task: Collecte Informations Societe (priority 2) — Reserved');
    expect(ctx.systemContext).toContain('step name: Etape A');
    expect(ctx.pieces.task).toBe(true);
  });

  it('lists documents with tags and passes doc_links', () => {
    const ctx = buildAiContext({
      attachments: [attachment],
      docLinks: [attachment.content, '', 'http://x/2'],
    });
    expect(ctx.systemContext).toContain('contrat.pdf (pdf) [Urgent]');
    expect(ctx.pieces.documents).toBe(1);
    expect(ctx.docLinks).toEqual([attachment.content, 'http://x/2']);
  });

  it('combines all pieces into one CONTEXT block', () => {
    const ctx = buildAiContext({
      processName: 'Kafi',
      dossier: form(),
      timeline: timeline(),
      task: { group: taskGroup(), task },
      attachments: [attachment],
      docLinks: [attachment.content],
    });
    expect(ctx.systemContext).toContain('CONTEXT');
    expect(ctx.systemContext).toContain('Dossier (ID: form-1):');
    expect(ctx.systemContext).toContain('Process timeline:');
    expect(ctx.systemContext).toContain('Task documents:');
    expect(ctx.pieces).toEqual({ dossier: true, timeline: true, task: true, documents: 1 });
  });

  it('caps long field values', () => {
    const big = 'x'.repeat(500);
    const f = form({ formInput: { nom: big }, formFields: [{ fieldName: 'nom', fieldLabel: 'Nom', fieldValue: big, fieldRow: 1, fieldHeaderDisplay: true }] });
    const ctx = buildAiContext({ dossier: f });
    const m = ctx.systemContext.match(/Nom: (x+)/);
    expect(m).not.toBeNull();
    expect((m as RegExpMatchArray)[1].length).toBeLessThanOrEqual(300);
  });
});
