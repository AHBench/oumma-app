import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { setStatusActivity } from '../../../shared/status/status-store';
import { useColumnWidth } from '../../../../core/hooks/use-resize';
import { useWorkspaceContext } from '../../../process-page/presentation/hooks/use-workspace-context';
import { useDocuments, useProcessInstanceData, useStartProcess, useTaskAttachments } from '../../../shared/hooks/use-queries';
import { getDependencies } from '../../../../core/di';
import { ErrorBox, btnCls } from '../../../shared/components/ui';
import { useQuota, useClaimQuota } from '../../../shared/hooks/use-quota';
import { BaseUrls } from '../../../../core/config/base-urls';
import { buildAiContext } from '../ai-context';
import { renderMarkdown } from './markdown';
import {
  MAX_AGENT_TURNS,
  agentSystemPrompt,
  imageToolResultMessage,
  launchFormInfo,
  parseAgentReply,
  type LaunchField,
} from '../agent-loop';
import type { AgentChatMessage } from '../../data/datasources/oumma-agent-datasource';
import type { Form } from '../../../process-forms/data/models/form-model';
import { buildSubmittedFormInput, resolveFieldValues } from '../../../process-forms/presentation/components/FormFieldFactory';

type Json = Record<string, unknown>;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Tool activity note (rendered muted, sent to the LLM as a user message). */
  note?: string;
  kind?: 'tool';
}

interface PendingLaunch {
  values: Json;
  structure: Form;
}

const docKindOf = (url: string): string => {
  const p = url.split('?')[0].toLowerCase();
  if (p.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(p)) return 'image';
  return 'file';
};

/**
 * AI Assist sidebar — the user-facing agent. Grounded in the active
 * workspace context (dossier, timeline, active task, documents) it can:
 *
 *  - answer questions about the dossier/process (as before),
 *  - LAUNCH a new process: it analyses the user's prompt, extracts the
 *    launch-form values, asks for missing ones, and shows a confirmable
 *    form; on confirmation the app launches with the hidden fields
 *    (form_id, department, lang) filled by the process-start datasource,
 *  - READ documents: list the task's documents and analyse PDFs (server-side
 *    text extraction) and images (sent to the model as an image part).
 */
export function AiAssistSidebar() {
  const { t, i18n } = useTranslation();
  const { process, token, user, stepId, selectedDossier, activeTask, setAiOpen, aiRequest, clearAiRequest } =
    useWorkspaceContext();
  // Resizable width (drag the left edge), same pattern as the other
  // sidebars in the workspace.
  const aiCol = useColumnWidth(320, { min: 260, max: 640 });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(null);
  const [launchValues, setLaunchValues] = useState<Json>({});
  const [launchError, setLaunchError] = useState<string | null>(null);
  const startProcess = useStartProcess(process, user ?? null, token ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const docListRef = useRef<{ name: string; url: string; kind: string }[]>([]);
  const launchFormRef = useRef<Form | null>(null);

  const processId = process?.id ?? null;
  const instanceId =
    activeTask?.group.id ??
    selectedDossier?.processInstanceIds[selectedDossier.processInstanceIds.length - 1] ??
    null;

  const { data: instanceData } = useProcessInstanceData({ processId, instanceId, token: token ?? '' });
  const { data: attachmentsData } = useTaskAttachments({
    process: process ?? null,
    instanceId,
    groupId: activeTask ? activeTask.group.name : null,
    token: token ?? '',
  });
  const { data: documentsData } = useDocuments({
    processId,
    groups: activeTask ? [activeTask.group.name] : undefined,
    processInstanceId: instanceId ?? undefined,
    token: token ?? '',
  });

  const attachments = attachmentsData ?? [];
  const docLinks = [
    ...attachments.map((a) => a.content).filter(Boolean),
    ...(documentsData ?? [])
      .filter((d) => !attachments.some((a) => a.documentId === d.id))
      .map((d) => `${BaseUrls.documentServiceBaseUrl}/documents/${d.id}/download/`),
  ];

  const context = buildAiContext({
    processName: process?.name,
    dossier: selectedDossier,
    timeline: instanceData ?? null,
    task: activeTask,
    attachments: attachments.length > 0 ? attachments : undefined,
    docLinks,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAsking, pendingLaunch]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || isAsking || !process || !token) return;
    setPendingLaunch(null);
    setError(null);
    lastQuestionRef.current = q;
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setIsAsking(true);
    try {
      const hasLaunchForm = (process.initialSteps?.length ?? 0) > 0 && !!stepId;      const system = agentSystemPrompt({
        processName: process.name,
        lang: i18n.language,
        contextBlock: context.systemContext,
        hasInstance: instanceId != null,
        hasLaunchForm,
      });
      // Transcript: system + past messages (tool notes go to the LLM as user
      // messages carrying the TOOL_RESULT payload).
      const transcript: AgentChatMessage[] = [{ role: 'system', content: system }];
      for (const m of messages) {
        if (m.kind === 'tool') {
          transcript.push({ role: 'user', content: m.note ?? m.content });
        } else {
          transcript.push({ role: m.role, content: m.content });
        }
      }
      transcript.push({ role: 'user', content: q });

      const agent = getDependencies().oummaAgentDataSource;
      for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
        setStatusActivity(t('statusThinking'));
        const raw = await agent.chat(transcript, true, token, {
          processId: process.id,
          instanceId: instanceId ?? undefined,
        });
        const reply = parseAgentReply(raw);
        if (reply.type === 'answer') {
          const text = reply.text.trim() || '(empty answer)';
          setMessages((m) => [...m, { role: 'assistant', content: text }]);
          break;
        }
        const result = await runTool(reply.tool, reply.args);
        if (result.interrupt) break; // prepare_launch: UI takes over
        const note = `TOOL_RESULT ${reply.tool}: ${result.text}`;
        if (result.imagePart) {
          const msg = imageToolResultMessage(String(result.imagePart.name ?? 'document'), String(result.imagePart.mime), String(result.imagePart.b64));
          transcript.push({ role: 'assistant', content: raw });
          transcript.push(msg);
          setMessages((m) => [...m, { role: 'user', content: `${reply.tool} (${result.imagePart?.name})`, kind: 'tool', note: note }]);
        } else {
          transcript.push({ role: 'assistant', content: raw });
          transcript.push({ role: 'user', content: note });
          setMessages((m) => [...m, { role: 'user', content: reply.tool, kind: 'tool', note }]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAsking(false);
      setStatusActivity(null);
    }
  };

  const runTool = async (
    tool: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; interrupt?: boolean; imagePart?: { name: string; mime: string; b64: string } }> => {
    const agent = getDependencies().oummaAgentDataSource;
    const formRepo = getDependencies().formRepository;
    try {
      switch (tool) {
        case 'get_launch_form': {
          if (!process || !stepId || !token) return { text: 'no launch form available for this process' };
          const structure = await formRepo.getFormDataStructure(process, stepId, token);
          if (!structure) return { text: 'error: no launch form structure for this step' };
          launchFormRef.current = structure;
          return { text: JSON.stringify(launchFormInfo(structure)) };
        }
        case 'prepare_launch': {
          const structure = launchFormRef.current;
          if (!structure) {
            return { text: 'error: call get_launch_form first' };
          }
          const values = args.values && typeof args.values === 'object' ? (args.values as Json) : {};
          setLaunchValues({ ...values });
          setLaunchError(null);
          setPendingLaunch({ values: { ...values }, structure });
          return { text: 'launch form shown to the user for confirmation', interrupt: true };
        }
        case 'save_draft_form': {
          const structure = launchFormRef.current;
          if (!structure || !process || !user || !token) {
            return { text: 'error: call get_launch_form first' };
          }
          const values = args.values && typeof args.values === 'object' ? (args.values as Json) : {};
          // Required-field validation is enforced at creation time: the
          // draft is only saved when every required field has a value.
          const missing = structure.formFields
            .filter((f) => f.fieldRequired)
            .map((f) => f.fieldName.replace(/^\$/, ''))
            .filter((n) => values[n] == null || values[n] === '');
          if (missing.length > 0) {
            return { text: `error: missing required fields: ${missing.join(', ')} — ask the user for them, then call save_draft_form again` };
          }
          // Same form build as the launch confirm: user values expanded
          // into the step form's template + each field_value, plus the
          // hidden launch fields (department, form_id, lang) — filled
          // automatically from the user profile and the oper-data step,
          // never asked from the user.
          const resolved = resolveFieldValues(structure, values);
          const formInput = buildSubmittedFormInput(structure, values) as Json;
          formInput.department = { codes: user.department };
          const form: Form = {
            ...structure,
            formInput,
            formFields: structure.formFields.map((f) => ({ ...f, fieldValue: resolved.get(f.fieldName) })),
          };
          const saved = await formRepo.saveFormDataStructure(process, form, token);
          qc.invalidateQueries({ queryKey: ['saved-forms'] });
          const formId = (saved as Json)?.formId ?? (saved as Json)?.form_id ?? '';
          return { text: `draft form saved (form_id ${String(formId) || 'ok'}) — it is now in the user's pending forms and can be launched later` };
        }
        case 'list_documents': {
          if (instanceId == null) return { text: 'no active dossier — no documents to list' };
          const docs = [
            ...attachments.map((a) => ({ name: a.name || 'attachment', url: a.content, kind: docKindOf(a.content) })),
            ...(documentsData ?? [])
              .filter((d) => !attachments.some((a) => a.documentId === d.id))
              .map((d) => ({
                name: d.name || `document-${d.id}`,
                url: `${BaseUrls.documentServiceBaseUrl}/documents/${d.id}/download/`,
                kind: docKindOf(`${d.name || ''}`),
              })),
          ];
          docListRef.current = docs;
          return { text: docs.length ? JSON.stringify(docs) : 'no documents on the active task' };
        }
        case 'read_document': {
          if (instanceId == null || !token) return { text: 'no active dossier — no documents to read' };
          const idx = Number(args.index ?? 0);
          const doc = docListRef.current[idx];
          if (!doc) return { text: `error: no document at index ${idx} — call list_documents first` };
          setStatusActivity(t('statusReadingDocument'));
          const res = await agent.document(doc.url, token);
          if (res.kind === 'pdf') {
            const text = res.text.length > 12000 ? `${res.text.slice(0, 12000)}\n[truncated]` : res.text;
            return { text: `document "${doc.name}" (pdf, ${res.size} bytes) text:\n${text}` };
          }
          return {
            text: `image "${doc.name}" attached (${res.size} bytes)`,
            imagePart: { name: doc.name, mime: res.mime, b64: res.b64 },
          };
        }
        default:
          return { text: `error: unknown tool "${tool}"` };
      }
    } catch (e) {
      return { text: `error: ${e instanceof Error ? e.message : String(e)}` };
    }
  };

  const confirmLaunch = async () => {
    if (!pendingLaunch || !process || !user || !token) return;
    // Required-field validation is enforced at launch time as well.
    const missingCount = pendingLaunch.structure.formFields.filter(
      (f) => f.fieldRequired && (launchValues[f.fieldName.replace(/^\$/, '')] == null || launchValues[f.fieldName.replace(/^\$/, '')] === ''),
    ).length;
    if (missingCount > 0) {
      setLaunchError(t('agentMissingFields', { n: missingCount }));
      return;
    }
    setLaunchError(null);
    try {
      // Same form build as CreateFormTab: user values expanded into the step
      // form's form_input template AND written to each field_value. The
      // process-start datasource adds the hidden fields: department (from
      // the user token), form_id (from the step DTO), lang (UI locale).
      const structure = pendingLaunch.structure;
      const resolved = resolveFieldValues(structure, launchValues);
      const formInput = buildSubmittedFormInput(structure, launchValues) as Json;
      formInput.department = { codes: user.department };
      const form: Form = {
        ...structure,
        formInput,
        formFields: structure.formFields.map((f) => ({ ...f, fieldValue: resolved.get(f.fieldName) })),
      };
      const newInstanceId = await startProcess.mutateAsync(form);
      qc.invalidateQueries({ queryKey: ['task-groups'] });
      qc.invalidateQueries({ queryKey: ['active-processes'] });
      qc.invalidateQueries({ queryKey: ['dossiers'] });
      qc.invalidateQueries({ queryKey: ['active-forms'] });
      setPendingLaunch(null);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: t('agentLaunched', { id: newInstanceId }) },
      ]);
      navigate(`/myprocesses/${process.id}/my-tasks`);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelLaunch = () => {
    setPendingLaunch(null);
    setMessages((m) => [...m, { role: 'assistant', content: t('agentLaunchCancelled') }]);
  };

  // One-shot prefill from requestAi(prompt).
  useEffect(() => {
    if (!aiRequest) return;
    const prompt = aiRequest;
    clearAiRequest();
    if (prompt.trim()) void ask(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRequest]);

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-s border-separator bg-surface"
      style={{ width: aiCol.width }}
    >
      <div
        onPointerDown={(e) => aiCol.startResize('right', e)}
        title="Drag to resize"
        className="absolute top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-(--accent)/50"
        style={{ left: 0 }}
      />
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-separator px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-(--accent)">
            <path d="M12 2 9.9 9.9 2 12l7.9 2.1L12 22l2.1-7.9L22 12l-7.9-2.1L12 2Z" />
          </svg>
          <div className="min-w-0 leading-tight">
            <div className="text-(--app-fs-base) font-semibold text-foreground">{t('aiAssist')}</div>
            <div className="truncate text-(--app-fs-small) text-muted">{t('agentSubtitle')}</div>
          </div>
        </div>
        <button onClick={() => setAiOpen(false)} className="button button--ghost button--icon-only" aria-label={t('close')}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Context chips — what the model can see */}
      <div className="flex flex-wrap gap-1 border-b border-separator px-3 py-1.5">
        <ContextChip label={t('chipDossier')} on={context.pieces.dossier} />
        <ContextChip label={t('chipTimeline')} on={context.pieces.timeline} />
        <ContextChip label={t('chipTask')} on={context.pieces.task} />
        <ContextChip label={`${t('chipDocs')} ${context.pieces.documents > 0 ? `(${context.pieces.documents})` : ''}`} on={context.pieces.documents > 0} />
        <ContextChip label={t('chipLaunch')} on={(process?.initialSteps?.length ?? 0) > 0 && !!stepId} />
      </div>

      {/* Chat area */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-8 w-8 text-muted/60">
              <path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 21h4" strokeLinecap="round" />
            </svg>
            <p className="text-(--app-fs-base) font-semibold text-foreground">{t('agentEmptyTitle')}</p>
            <p className="text-(--app-fs-small) text-muted">{t('agentEmptyBody')}</p>
          </div>
        ) : (
          <>
            {messages.map((m, i) =>
              m.kind === 'tool' ? (
                <div key={i} className="mx-auto max-w-[95%] truncate rounded bg-surface-secondary/80 px-2 py-1 text-(--app-fs-small) text-muted">
                  ⚙ {m.content}
                </div>
              ) : (
                <div
                  key={i}
                  className={`max-w-[95%] rounded-(--app-radius) px-2.5 py-1.5 text-(--app-fs-body) leading-relaxed ${
                    m.role === 'user'
                      ? 'ms-auto bg-(--accent)/10 text-foreground'
                      : 'border border-separator bg-surface-secondary/60 text-foreground'
                  }`}
                >
                  {m.role === 'assistant' ? renderMarkdown(m.content) : <span className="whitespace-pre-wrap">{m.content}</span>}
                </div>
              ),
            )}
            {isAsking ? (
              <div className="flex items-center gap-2 px-1 text-(--app-fs-small) text-muted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
                {t('aiThinking')}
              </div>
            ) : null}
            {pendingLaunch ? (
              <LaunchConfirmCard
                title={t('agentLaunchTitle')}
                fields={launchFormInfo(pendingLaunch.structure).fields}
                values={launchValues}
                onChange={(name, v) => setLaunchValues((cur) => ({ ...cur, [name]: v }))}
                onConfirm={() => void confirmLaunch()}
                onCancel={cancelLaunch}
                busy={startProcess.isPending}
                error={launchError}
                t={t}
              />
            ) : null}
          </>
        )}
        {error ? (
          <ErrorBox message={error} onRetry={() => lastQuestionRef.current && void ask(lastQuestionRef.current)} />
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-separator p-2">
        {quotaExhausted ? (
          <div className="mb-2 rounded-(--app-radius) border border-(--danger)/30 bg-(--danger)/10 px-3 py-2 text-(--app-fs-small) text-foreground">
            <p className="font-semibold text-(--danger)">{t('quotaExhaustedTitle')}</p>
            <p className="mt-1 text-muted">{t('quotaExhaustedBody', { used: quota.used.toLocaleString(), limit: quota.limit.toLocaleString() })}</p>
            {claimState === 'sent' ? (
              <p className="mt-1 font-semibold text-(--accent)">{t('quotaClaimed')}</p>
            ) : (
              <button type="button" onClick={() => void claim()} disabled={claimState === 'sending'} className={`${btnCls('primary', true)} mt-2`}>
                {claimState === 'sending' ? t('quotaClaimSending') : t('quotaClaim')}
              </button>
            )}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder={t('aiAskPlaceholder')}
            disabled={quotaExhausted}
            className="input min-h-10 flex-1 resize-none py-1.5"
            aria-label={t('aiAskPlaceholder')}
          />
          <button
            onClick={() => void ask(input)}
            disabled={isAsking || input.trim().length === 0 || quotaExhausted}
            className={btnCls('primary', true)}
            aria-label={t('send')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2 21 23 12 2 3v7l15 2-15 2v7Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ContextChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`chip chip--sm ${on ? 'chip--success' : 'chip--default opacity-50'}`}
      title={on ? 'Included in the AI context' : 'Not available right now'}
    >
      <span className="chip__label">{on ? '✓ ' : ''}{label}</span>
    </span>
  );
}

/**
 * Confirmable launch form rendered inside the chat after prepare_launch.
 * Pre-filled with the agent-extracted values; the user completes the missing
 * required fields and confirms. The actual launch (with form_id /
 * department / lang filled by the process-start datasource) happens on
 * confirm.
 */
function LaunchConfirmCard(props: {
  title: string;
  fields: LaunchField[];
  values: Json;
  onChange: (name: string, value: unknown) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const { fields, values, onChange, onConfirm, onCancel, busy, error, t, title } = props;
  const missing = fields.filter((f) => f.required && (values[f.name] == null || values[f.name] === ''));

  return (
    <div className="rounded-(--app-radius) border border-(--accent)/40 bg-surface p-2.5">
      <div className="mb-2 text-(--app-fs-base) font-semibold text-foreground">{title}</div>
      <div className="space-y-2">
        {fields.length === 0 ? (
          <div className="text-(--app-fs-small) text-muted">{t('agentNoFormFields')}</div>
        ) : (
          fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-0.5 block text-(--app-fs-small) text-muted">
                {f.label || f.name}
                {f.required ? <span className="text-(--danger)"> *</span> : null}
              </span>
              {f.type === 'dropdown' && f.options?.length ? (
                <select
                  className="input w-full py-1"
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => onChange(f.name, e.target.value)}
                >
                  <option value="">—</option>
                  {f.options.map((o: string) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-1.5 text-(--app-fs-body)">
                  <input
                    type="checkbox"
                    checked={Boolean(values[f.name])}
                    onChange={(e) => onChange(f.name, e.target.checked)}
                  />
                  <span>{t('agentYes')}</span>
                </label>
              ) : (
                <input
                  type={f.type === 'date' ? 'date' : 'text'}
                  className="input w-full py-1"
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => onChange(f.name, e.target.value)}
                />
              )}
            </label>
          ))
        )}
      </div>
      {missing.length > 0 ? (
        <div className="mt-2 text-(--app-fs-small) text-(--warning, #b45309)">
          {t('agentMissingFields', { n: missing.length })}
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 rounded border border-(--danger)/40 bg-(--danger)/10 p-1.5 text-(--app-fs-small) text-(--danger)">
          {error}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          className={btnCls('primary')}
          disabled={busy || missing.length > 0}
          onClick={onConfirm}
          title={missing.length > 0 ? t('agentMissingFields', { n: missing.length }) : undefined}
        >
          {busy ? t('launchingProcess') : t('confirmLaunchShort')}
        </button>
        <button className={btnCls('outline')} disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
