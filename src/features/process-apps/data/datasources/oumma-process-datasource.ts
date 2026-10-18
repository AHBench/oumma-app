import { apiClient } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { BaseUrls } from '../../../../core/config/base-urls';
import type { ProcessApp } from '../../domain/entities/process-app';
import { processAppFromJson } from '../models/process-app-model';
import { fetchDefinitions } from '../oumma-mapping';

type Json = Record<string, unknown>;

function strip(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Oumma process datasource — mirrors the Flutter
 * `BackendProcessDatasource` model:
 *
 *  1. "My Processes" + the user's roles come from the **auth backend**
 *     `GET {processServiceBaseUrl}/my-accessible-processes` — already
 *     filtered by the caller's token (Keycloak groups → process roles).
 *  2. Those are **compared against the existing Oumma processes**
 *     (`GET /definitions`): a process is kept only if the engine actually
 *     has a workflow definition for it, so the list only ever shows
 *     processes the user may run.
 *
 * The auth-backend roles (role_tasks + actions) drive every permission
 * check in the app (Complete/Claim/Release, initial task, decision form);
 * the oumma definitions are still consumed separately by the
 * forms/tasks datasources for schemas, groups and topology.
 */
export class OummaProcessDatasource {
  constructor(
    private readonly oummaUrl: string,
    private readonly authBackendUrl: string = BaseUrls.processServiceBaseUrl,
  ) {}

  async fetchProcesses(token: string): Promise<ProcessApp[]> {
    try {
      const [accessRes, defs] = await Promise.all([
        apiClient.get(`${strip(this.authBackendUrl)}/my-accessible-processes`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchDefinitions(this.oummaUrl, token),
      ]);

      const body: Json = (accessRes.data as Json) ?? {};
      const items: Json[] = Array.isArray(body.data) ? (body.data as Json[]) : [];

      const engineIds = new Set(defs.map((d) => d.id));
      const apps: ProcessApp[] = [];
      for (const item of items) {
        const processId = String(item.process_id ?? '');
        if (!engineIds.has(processId)) continue; // not an existing Oumma process
        apps.push(processAppFromJson(item));
      }
      return apps;
    } catch (e) {
      appLogger.error('Error fetching processes', { error: e });
      throw new Error(`Error fetching processes: ${String(e)}`);
    }
  }
}
