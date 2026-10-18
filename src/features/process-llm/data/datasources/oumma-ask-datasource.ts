import { apiClient, getErrorMessage } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';

type Json = Record<string, unknown>;

function axiosStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: number; data?: unknown } };
  return e?.response?.status;
}

function axiosBody(error: unknown): unknown {
  const e = error as { response?: { status?: number; data?: unknown } };
  return e?.response?.data;
}

function checkLicense(error: unknown): never | void {
  if (axiosStatus(error) === 403) {
    throwIfLicenseInvalidStrict(403, axiosBody(error));
  }
}

function base(oummaUrl: string): string {
  return oummaUrl.replace(/\/+$/, '');
}

export interface AskParams {
  processId: string;
  instanceId: string;
  question: string;
  /** Client-side context (active task, dossier, chat history). */
  context?: string;
  /** Answer language (UI locale, e.g. "en" | "fr" | "ar"). */
  lang?: string;
  token: string;
}

/**
 * Oumma `/ask` datasource — replaces brief-llm-go (`/querydocv2`) for user
 * queries (Workstream B). Oumma grounds the answer in the instance's live
 * state (global context, task outputs, execution track) plus the UI context
 * we forward. Single-shot LLM call; conversation history is sent as context.
 */
export class OummaAskDataSource {
  constructor(private readonly oummaUrl: string) {}

  async ask(params: AskParams): Promise<string> {
    const url = `${base(this.oummaUrl)}/processes/${params.processId}/${params.instanceId}/ask`;
    try {
      const response = await apiClient.post<Json>(url, {
        question: params.question,
        context: params.context ?? '',
        lang: params.lang ?? '',
      }, {
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      });
      if (response.status !== 200) {
        throw new Error(`Ask failed with status ${response.status}`);
      }
      const answer = (response.data as Json).answer;
      return typeof answer === 'string' ? answer : '';
    } catch (e) {
      checkLicense(e);
      appLogger.error('OummaAskDataSource.ask failed', { error: e });
      throw new Error(`AI query failed: ${getErrorMessage(e)}`);
    }
  }
}
