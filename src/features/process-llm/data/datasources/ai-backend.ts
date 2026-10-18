import { apiClient } from '../../../../core/http/client';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';
import type { AgentParam } from '../models/llm-models';
import { agentParamFromJson } from '../models/llm-models';

type Json = Record<string, unknown>;

/**
 * AI backend params datasource — mirrors
 * lib/features/process_llm/data/datasource/ai_backend.dart
 */
export class AIBackend {
  constructor(private readonly baseUrl: string) {}

  /** GET {aiBackend}/ai-params/{processId} → data[0] */
  async getAgentParams(processId: string, token: string): Promise<AgentParam> {
    const response = await apiClient.get(`${this.baseUrl}/ai-params/${processId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 403) {
      throwIfLicenseInvalidStrict(403, response.data);
    }
    if (response.status !== 200) {
      throw new Error('Failed to load agent params from API');
    }
    const dataMap = response.data as { data?: Json[] };
    const dataList = dataMap?.data ?? [];
    if (dataList.length > 0) {
      return agentParamFromJson(dataList[0]);
    }
    throw new Error('No agent params found in API response');
  }
}
