import type { AgentChatMessage, AgentPart } from '../data/datasources/oumma-agent-datasource';
import type { Form } from '../../process-forms/data/models/form-model';

/**
 * Client-side agent loop for the user-facing AI Assist (normal users).
 *
 * The LLM speaks a strict JSON protocol (jsonMode is forced server-side):
 *   {"type":"answer","text":"..."}                 — final answer to the user
 *   {"type":"tool","tool":"<name>","args":{...}}   — request a tool call
 * The component executes the tool and appends the result as a user message
 * ("TOOL_RESULT <name>: <json>"), then asks again — up to MAX_AGENT_TURNS.
 *
 * Tools:
 *   get_launch_form   — the process' initial-step form (fields + formId)
 *   prepare_launch    — agent-extracted values; the UI renders a confirmable
 *                       form (launching happens on user confirmation)
 *   list_documents    — the active task's documents (attachments + DMS)
 *   read_document     — fetch a document: PDF -> extracted text, image ->
 *                       base64 (sent to the model as an image part)
 */

export const MAX_AGENT_TURNS = 8;

export type AgentReply =
  | { type: 'answer'; text: string }
  | { type: 'tool'; tool: string; args: Record<string, unknown> };

/** Parse one LLM reply; anything unparseable degrades to a plain answer. */
export function parseAgentReply(raw: string): AgentReply {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  }
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    if (j && typeof j === 'object') {
      if (j.type === 'tool' && typeof j.tool === 'string') {
        const args = j.args && typeof j.args === 'object' ? (j.args as Record<string, unknown>) : {};
        return { type: 'tool', tool: j.tool, args };
      }
      if (j.type === 'answer' && typeof j.text === 'string') {
        return { type: 'answer', text: j.text };
      }
      // Lenient: a bare {"text": "..."} or {"answer": "..."} is an answer.
      const t = j.text ?? j.answer;
      if (typeof t === 'string') return { type: 'answer', text: t };
    }
  } catch {
    // not JSON — fall through
  }
  return { type: 'answer', text: raw.trim() };
}

export interface LaunchField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

export interface LaunchFormInfo {
  stepId: string;
  formId?: string;
  fields: LaunchField[];
}

export function launchFormInfo(form: Form): LaunchFormInfo {
  return {
    stepId: form.stepId,
    formId: form.formId,
    fields: form.formFields.map((f) => ({
      name: f.fieldName.replace(/^\$/, ''),
      label: f.fieldLabel,
      type: f.fieldType,
      required: f.fieldRequired,
      options: f.fieldOptions ?? undefined,
    })),
  };
}

/**
 * System prompt for the agent. `contextBlock` is the existing workspace
 * context (dossier, timeline, task, documents) built by buildAiContext.
 */
export function agentSystemPrompt(opts: {
  processName: string;
  lang: string;
  contextBlock: string;
  hasInstance: boolean;
  hasLaunchForm: boolean;
}): string {
  const docsTools = opts.hasInstance
    ? `
- list_documents: no args. Returns the active task's documents as [{name, url, kind}].
- read_document: args {index: number}. Fetches the document at that index from the
  list_documents result. PDFs are reduced to their extracted text; images are attached
  to the next model turn, so you can see them. Use it whenever the user asks about a
  document (content, summary, values inside it).`
    : '';

  const launchTools = opts.hasLaunchForm
    ? `
- get_launch_form: no args. Returns the launch form of this process: {stepId, formId,
  fields: [{name, label, type, required, options?}]}. Call it before preparing a launch.
  The formId is managed by the app — never mention it to the user, never ask for it.
- prepare_launch: args {values: {<field>: <value>, ...}}. The UI will show these values
  as a confirmable form; the user edits missing ones and confirms. Extract as many
  values as the user has provided (match by meaning, not just by exact wording). Do NOT
  invent values for required fields the user has not given — leave them out so the user
  can fill them in the form. The confirm button stays disabled until every required
  field is filled, so incomplete data can never be launched.
- save_draft_form: args {values: {<field>: <value>, ...}}. Saves the launch form as a
  PENDING DRAFT without launching any process (it appears in the user's pending forms
  and can be launched later). It is saved only when ALL required fields have values —
  otherwise it returns the missing list, so ask the user for them and call it again.
  Use it when the user wants to create/fill a form WITHOUT launching the process.`
    : '';

  return `You are the AI assistant inside the "${opts.processName}" business process app.
Answer the user in the language of their messages (${opts.lang}).

You can ONLY act through tools. When you need to act, reply with EXACTLY one JSON object:
{"type":"tool","tool":"<tool name>","args":{...}}
When you are done and have something to tell the user, reply:
{"type":"answer","text":"<markdown answer>"}
Never mix prose with JSON. One object per turn.

Available tools:
- answer (no tool): just reply with the {"type":"answer",...} object.${launchTools}${docsTools}

Rules:
- form_id and department are filled AUTOMATICALLY by the app (form_id from the
  process' form service, department from the user's profile). NEVER ask the user
  for them, never include them in the values, never mention them.
- Required fields are enforced at creation and launch: neither a saved draft nor a
  launch can succeed while a required field is empty. When fields are missing, ask
  for them (one question is fine) instead of guessing.
- To launch a new dossier: call get_launch_form, then prepare_launch with the values you
  extracted from the conversation. If required fields are missing, ask the user for them
  (one question is fine) OR call prepare_launch anyway so the user can fill the blanks
  in the form. You never launch by yourself — the user confirms the form in the UI.
- To create/save a form WITHOUT launching: call get_launch_form, then save_draft_form
  with the extracted values. It is saved immediately as a pending draft — tell the user
  it was saved and where to find it (pending forms). If required fields are missing,
  ask for them first; the draft is only saved once they are all provided.
- After the user confirms a launch, the app performs the launch and you will receive a
  TOOL_RESULT with the new instance id; acknowledge it briefly.
- For document questions: list_documents, then read_document for the relevant one(s),
  then answer from the extracted content. If a document cannot be read, say so plainly.
- Be concise. No filler.

${opts.contextBlock ? `Current workspace context:\n${opts.contextBlock}` : ''}`;
}

/** Build the multimodal user message carrying a read_document image result. */
export function imageToolResultMessage(name: string, mime: string, b64: string): AgentChatMessage {
  const parts: AgentPart[] = [
    { type: 'text', text: `TOOL_RESULT read_document: image "${name}" attached below (mime ${mime}).` },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
  ];
  return { role: 'user', content: parts };
}
