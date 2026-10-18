import { apiClient } from '../../../../core/http/client';
import { BaseUrls } from '../../../../core/config/base-urls';
import type { ProcessPrintPayload } from '../models/print-models';
import { processPrintPayloadFromJson } from '../models/print-models';

type Json = Record<string, unknown>;

/**
 * Print templates datasource — mirrors
 * lib/features/process_print/data/datasource/process_print_remote_data_source.dart
 *
 * Method 1: POST {processService}/templates with allowed_groups/allowed_steps
 * Method 2: GET  {processService}/templates/{processId}
 */
export class ProcessPrintRemoteDataSource {
  async getProcessPrintData(
    processId: string,
    params?: {
      allowedGroups?: string[];
      allowedSteps?: Json[];
      inputData?: Json;
      token?: string;
    },
  ): Promise<ProcessPrintPayload> {
    const baseUrl = BaseUrls.processServiceBaseUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(params?.token ? { Authorization: `Bearer ${params.token}` } : {}),
    };

    let response;
    const hasGroups =
      params?.allowedGroups && params.allowedGroups.length > 0;
    const hasSteps = params?.allowedSteps && params.allowedSteps.length > 0;

    if (hasGroups || hasSteps) {
      const body: Json = { process_id: processId };
      if (hasGroups) body.allowed_groups = params!.allowedGroups;
      if (hasSteps) body.allowed_steps = params!.allowedSteps;
      response = await apiClient.post(`${baseUrl}/templates`, body, { headers });
    } else {
      response = await apiClient.get(`${baseUrl}/templates/${processId}`, { headers });
    }

    if (response.status !== 200) {
      throw new Error(`Failed to load process print templates: ${response.status}`);
    }
    return processPrintPayloadFromJson(response.data as Json, params?.inputData);
  }
}
