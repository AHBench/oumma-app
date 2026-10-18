import { apiClient, getErrorMessage } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';

type Json = Record<string, unknown>;

function axiosStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: number; data?: unknown } };
  return e?.response?.status;
}

function checkLicense(error: unknown): void {
  if (axiosStatus(error) === 403) {
    throwIfLicenseInvalidStrict(403, (error as { response?: { data?: unknown } })?.response?.data);
  }
}

/**
 * Oumma AI-assist agent datasource — POST /agent/chat (multi-message LLM
 * conversation for the client-side agent loop) and POST /agent/document
 * (server-side document analysis: PDF text extraction, image base64).
 *
 * The launch itself does NOT go through this datasource: the agent's
 * prepare_launch tool returns the extracted values and the UI confirms and
 * launches through the existing process-start datasource, which fills the
 * hidden fields (form_id from the step DTO, department from the user token,
 * lang from the UI).
 */

export type AgentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AgentPart[];
}

export type AgentDocumentResult =
  | { kind: 'pdf'; text: string; size: number }
  | { kind: 'image'; mime: string; b64: string; size: number };

function base(u: string): string {
  return u.replace(/\/+$/, '');
}

export class OummaAgentDataSource {
  constructor(private readonly oummaUrl: string) {}

  async chat(
    messages: AgentChatMessage[],
    jsonMode: boolean,
    token: string,
    attribution?: { processId?: string; instanceId?: string },
  ): Promise<string> {
    const url = `${base(this.oummaUrl)}/agent/chat`;
    try {
      const response = await apiClient.post<Json>(url, { messages, jsonMode, ...attribution }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 180_000,
      });
      if (response.status !== 200) {
        throw new Error(`agent chat failed with status ${response.status}`);
      }
      const answer = (response.data as Json).answer;
      return typeof answer === 'string' ? answer : '';
    } catch (e) {
      checkLicense(e);
      appLogger.error('OummaAgentDataSource.chat failed', { error: e });
      throw new Error(`AI agent chat failed: ${getErrorMessage(e)}`);
    }
  }

  async document(url: string, token: string): Promise<AgentDocumentResult> {
    const endpoint = `${base(this.oummaUrl)}/agent/document`;
    try {
      const response = await apiClient.post<Json>(endpoint, { url }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      });
      if (response.status !== 200) {
        const err = (response.data as Json)?.error;
        throw new Error(typeof err === 'string' ? err : `document fetch failed (${response.status})`);
      }
      return response.data as AgentDocumentResult;
    } catch (e) {
      checkLicense(e);
      appLogger.error('OummaAgentDataSource.document failed', { error: e });
      throw new Error(`Document analysis failed: ${getErrorMessage(e)}`);
    }
  }
}
