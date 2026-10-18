type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

/** Mirrors prompt_element_model.dart */
export interface PromptElement {
  role: string;
  content: string;
}

export function promptElementFromMap(json: Json): PromptElement {
  return {
    role: str(json.role),
    content: str(json.content),
  };
}

/** Mirrors prompt_model.dart */
export interface Prompt {
  name: string;
  type: string;
  elements: PromptElement[];
}

export function promptFromJson(json: Json): Prompt {
  return {
    name: str(json.name),
    type: str(json.type),
    elements: Array.isArray(json.prompts)
      ? (json.prompts as Json[]).map(promptElementFromMap)
      : [],
  };
}

/** Mirrors agent_param_model.dart */
export interface AgentParam {
  processId: string;
  processDescription: string;
  modelName: string;
  embeddingModelName: string;
  prompts: Prompt[];
}

export function agentParamFromJson(json: Json): AgentParam {
  return {
    processId: str(json.process_id),
    processDescription: str(json.process_desc),
    modelName: str(json.model),
    embeddingModelName: str(json.embedding_model),
    prompts: Array.isArray(json.prompts)
      ? (json.prompts as Json[]).map(promptFromJson)
      : [],
  };
}

/** Mirrors file_request_model.dart / text_request_model.dart */
export interface FileRequest {
  prompt: Prompt;
  model: string;
  documentLinks: string[];
  apiLlmToken: string;
  maxtokens: string;
  temperature: string;
}

export interface TextRequest {
  prompt: Prompt;
  model: string;
  userText: string;
  apiLlmToken: string;
  maxtokens: string;
  temperature: string;
}

/** Mirrors ai_response_model.dart (incl. markdown/JSON answer extraction). */
export interface AIResponse {
  id: string;
  model: string;
  answer: string;
  reasoning: string;
  isTruncated: boolean;
}

export function aiResponseFromJson(json: Json): AIResponse {
  const id = str(json.id);
  const model = str(json.model);
  const choices = json.choices as Json[] | undefined;
  if (!choices || choices.length === 0) {
    return { id, model, answer: '', reasoning: '', isTruncated: false };
  }
  const firstChoice = choices[0];
  const message = (firstChoice.message ?? {}) as Json;
  const finishReason = firstChoice.finish_reason != null ? str(firstChoice.finish_reason) : '';

  const content = typeof message.content === 'string' ? (message.content as string) : null;
  const reasoning = message.reasoning != null ? str(message.reasoning) : '';
  let answer = message.answer != null ? str(message.answer) : '';

  if (answer.length === 0 && content != null) {
    let trimmed = content.trim();
    if (trimmed.startsWith('```')) {
      const lines = trimmed.split('\n');
      if (lines.length > 2) {
        trimmed = lines.slice(1, lines.length - 1).join('\n').trim();
      }
    }
    if (trimmed.startsWith('{')) {
      try {
        const decoded: unknown = JSON.parse(trimmed);
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
          const m = decoded as Json;
          answer =
            (m.output != null ? str(m.output) :
              m.answer != null ? str(m.answer) :
                m.reformulated_text != null ? str(m.reformulated_text) :
                  m.result != null ? str(m.result) :
                    m.summary != null ? str(m.summary) :
                      m.response != null ? str(m.response) : '')
            || '';
          if (answer.length === 0) {
            answer = Object.entries(m)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n\n');
          }
        }
      } catch {
        answer = content;
      }
    } else {
      answer = content;
    }
  }

  return {
    id,
    model,
    answer,
    reasoning,
    isTruncated: finishReason === 'length',
  };
}
