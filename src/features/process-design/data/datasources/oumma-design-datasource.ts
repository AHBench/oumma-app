import { apiClient, getErrorMessage } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';

type Json = Record<string, unknown>;

function base(oummaUrl: string): string {
  return oummaUrl.replace(/\/+$/, '');
}

function checkLicense(error: unknown): never | void {
  const e = error as { response?: { status?: number; data?: unknown } };
  if (e?.response?.status === 403) {
    throwIfLicenseInvalidStrict(403, e.response.data);
  }
}

/**
 * Oumma process-designer datasource — the `/api/management` admin API
 * (Designer group only; server enforces) plus the designer design endpoints
 * (brief/oumma internal/processconfig). Wire shapes are the ported Java
 * DTOs: snake_case for process/role/form/ai params, camelCase for search
 * items.
 */
export class OummaDesignDataSource {
  constructor(private readonly oummaUrl: string) {}

  private auth(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  /** GET /api/management/extract-by-id/{pid} — full config (engine + app). */
  async getProcessConfig(processId: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.get(
        `${base(this.oummaUrl)}/api/management/extract-by-id/${processId}`,
        this.auth(token),
      );
      return (res.data ?? {}) as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`getProcessConfig: ${getErrorMessage(e)}`);
    }
  }

  /** GET /definitions — engine definitions (tasks + topology). Returns the
   *  definition matching processId, or null. This is the source for the
   *  process diagram (extract-by-id only returns the app section). */
  async getDefinition(processId: string, token: string): Promise<Json | null> {
    try {
      const res = await apiClient.get(`${base(this.oummaUrl)}/definitions`, this.auth(token));
      const items = (Array.isArray(res.data) ? res.data : []) as Json[];
      return items.find((d) => String(d.id) === processId) ?? null;
    } catch (e) {
      checkLicense(e);
      throw new Error(`getDefinition: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/sync-roles — derive roles from the
   *  engine design (one role per HUMAN-task group, standard permissions). */
  async syncRoles(processId: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/sync-roles`,
        {},
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`syncRoles: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/sync-forms — create a form step for
   *  every HUMAN task that has none (idempotent). */
  async syncForms(processId: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/sync-forms`,
        {},
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`syncForms: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/rename-task — renames an engine task
   *  and cascades the rename into form steps and role tasks (pending version). */
  /**
   * Set the process's menu icon (a key from the app's icon catalog; '' =
   * default). Retries on 401 (Keycloak session-introspection flakes) and
   * 5xx so the change reliably reaches the backend.
   */
  async setProcessIcon(processId: string, iconKey: string, token: string): Promise<unknown> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${this.oummaUrl}/api/management/process/${encodeURIComponent(processId)}/icon`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ icon_key: iconKey }),
      });
      lastStatus = res.status;
      if (res.ok) return res.status === 204 ? null : res.json();
      const retryable = res.status === 401 || res.status >= 500;
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 900));
    }
    throw new Error(`setProcessIcon failed: ${lastStatus}`);
  }

  async renameTask(
    processId: string,
    from: string,
    to: string,
    token: string,
  ): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/rename-task`,
        { from, to },
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`renameTask: ${getErrorMessage(e)}`);
    }
  }

  /** GET /api/management/design/tools — the MCP-like tool catalog
   *  (Gmail, Telegram, WhatsApp, HTTP) the designer can add as system
   *  tasks. */
  async getToolCatalog(token: string): Promise<Json[]> {
    try {
      const res = await apiClient.get(
        `${base(this.oummaUrl)}/api/management/design/tools`,
        this.auth(token),
      );
      const data = (res.data as Json) ?? {};
      return (data.tools as Json[]) ?? [];
    } catch (e) {
      checkLicense(e);
      throw new Error(`getToolCatalog: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/add-tool-task — append a SYSTEM
   *  task that executes a catalog tool (config + input mapping). */
  async addToolTask(
    processId: string,
    payload: {
      name: string;
      tool: string;
      tool_config?: Record<string, string>;
      tool_inputs?: Record<string, string>;
      group?: string;
      after_task?: string;
    },
    token: string,
  ): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/add-tool-task`,
        payload,
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`addToolTask: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/add-system-task — append a plain
   *  SYSTEM task (HTTP executor). Config (url/method/headers) may be
   *  suggested by the designer in the prompt — or omitted, so the task is
   *  created without configuration and completed later (setTaskConfig). */
  async addSystemTask(
    processId: string,
    payload: {
      name: string;
      description?: string;
      group?: string;
      after_task?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
    },
    token: string,
  ): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/add-system-task`,
        payload,
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`addSystemTask: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/set-task-config — "configure
   *  later": set/update the HTTP config of an existing system task. */
  async setTaskConfig(
    processId: string,
    task: string,
    cfg: { url: string; method?: string; headers?: Record<string, string> },
    token: string,
  ): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/set-task-config`,
        { task, ...cfg },
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`setTaskConfig: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/add-task — append a HUMAN task
   *  (name + role group) to the pending design. */
  async addTask(
    processId: string,
    payload: { name: string; group?: string; description?: string; after_task?: string; type?: string },
    token: string,
  ): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/add-task`,
        payload,
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`addTask: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/add-edge — append a topology edge
   *  to the pending design. */
  async addEdge(
    processId: string,
    payload: { from?: string; to: string; condition?: string; fork?: boolean; join_from?: string[]; join?: string },
    token: string,
  ): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/add-edge`,
        payload,
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`addEdge: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/delete-task — remove a task + every
   *  topology reference to it (start/end are protected). */
  async deleteTask(processId: string, task: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/delete-task`,
        { task },
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`deleteTask: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/delete-edge — remove one edge. */
  async deleteEdge(processId: string, from: string | undefined, to: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/delete-edge`,
        { from: from ?? '', to },
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`deleteEdge: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/update-task — change a task's role
   *  group and/or description. */
  async updateTask(processId: string, task: string, opts: { group?: string; description?: string }, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/update-task`,
        { task, ...(opts.group ? { group: opts.group } : {}), ...(opts.description ? { description: opts.description } : {}) },
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`updateTask: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/rename — change the PROCESS ID
   *  (never-deployed projects only; the server rejects deployed ones). */
  async renameProcess(processId: string, newProcessId: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/rename`,
        { newProcessId },
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`renameProcess: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/design/{pid}/delete — delete a never-deployed
   *  project (design, pending version and files). */
  async deleteProcess(processId: string, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/design/${encodeURIComponent(processId)}/delete`,
        {},
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`deleteProcess: ${getErrorMessage(e)}`);
    }
  }

  /** POST /api/management/add-role/{pid} — upsert a role (by role_id);
   *  this is how the designer changes permissions per role. */
  async upsertRole(processId: string, role: Json, token: string): Promise<Json> {
    try {
      const res = await apiClient.post(
        `${base(this.oummaUrl)}/api/management/add-role/${encodeURIComponent(processId)}`,
        role,
        this.auth(token),
      );
      return res.data as Json;
    } catch (e) {
      checkLicense(e);
      throw new Error(`upsertRole: ${getErrorMessage(e)}`);
    }
  }

  /** GET /api/user-processes/forms/{pid} — the process's form steps. */
  async getFormSteps(processId: string, token: string): Promise<Json[]> {
    try {
      const res = await apiClient.get(
        `${base(this.oummaUrl)}/api/user-processes/forms/${processId}`,
        this.auth(token),
      );
      const data = (res.data as Json)?.data ?? res.data;
      if (!Array.isArray(data)) return [];
      const out: Json[] = [];
      for (const pf of data as Json[]) {
        for (const s of (pf.steps ?? []) as Json[]) out.push(s as Json);
      }
      return out;
    } catch (e) {
      checkLicense(e);
      throw new Error(`getFormSteps: ${getErrorMessage(e)}`);
    }
  }

  /** GET /api/management/extract-by-id/{pid} raw YAML file is not exposed;
   *  the engine section comes from GET /definitions. */
  async getDesignDefinition(processId: string, token: string): Promise<Json | null> {
    try {
      const res = await apiClient.get(`${base(this.oummaUrl)}/definitions`, this.auth(token));
      const defs = Array.isArray(res.data) ? (res.data as Json[]) : [];
      return defs.find((d) => d.id === processId) ?? null;
    } catch (e) {
      appLogger.warning(`getDesignDefinition: ${getErrorMessage(e)}`);
      return null;
    }
  }

  /** POST /api/management/insert-process */
  async createProcess(args: {
    processName: string;
    processId?: string;
    processDescription?: string;
    processLink?: string;
    processIconPath?: string;
    processServiceName?: string;
    processPodName?: string;
    company?: string;
    processLaunchRoleId?: string;
    sharedProcessIds?: string[];
  }, token: string): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/insert-process`,
      {
        process_id: args.processId ?? '',
        process_name: args.processName,
        process_description: args.processDescription ?? '',
        process_link: args.processLink ?? '',
        process_service_name: args.processServiceName ?? '',
        process_pod_name: args.processPodName ?? '',
        process_icon_path: args.processIconPath ?? '',
        company: args.company ?? 'Brief',
        process_launch_role_id: args.processLaunchRoleId ?? '',
        shared_process_ids: args.sharedProcessIds ?? [],
      },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** PUT /api/management/update-process/{pid} */
  async updateProcess(processId: string, args: Json, token: string): Promise<Json> {
    const res = await apiClient.put(
      `${base(this.oummaUrl)}/api/management/update-process/${processId}`,
      args,
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/add-role/{pid} */
  async addRole(
    processId: string,
    args: {
      roleId: string;
      roleName: string;
      canLaunch?: boolean;
      canEditInitialForm?: boolean;
      applyDeptFilter?: boolean;
      docRoles?: Json[];
      viewAccessRoles?: string[];
      roleTasks?: Json[];
    },
    token: string,
  ): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/add-role/${processId}`,
      {
        role_id: args.roleId,
        role_name: args.roleName,
        apply_dept_filter: args.applyDeptFilter ?? false,
        role_can_launch: args.canLaunch ?? false,
        can_edit_initial_form: args.canEditInitialForm ?? false,
        doc_roles: args.docRoles ?? [],
        role_tasks: args.roleTasks ?? [],
      },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/add-forms — one step with its fields. */
  async addForm(
    processId: string,
    stepId: string,
    args: {
      launchable?: boolean;
      formInput?: unknown;
      fields: Json[];
    },
    token: string,
  ): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/add-forms`,
      {
        data: [
          {
            process_id: processId,
            steps: [
              {
                step_id: stepId,
                launchable: args.launchable ?? false,
                form_input: args.formInput ?? '',
                form_fields: args.fields,
              },
            ],
          },
        ],
      },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/add-search-item/{pid}/{roleId} (camelCase DTO). */
  /** POST add-search-item. roleId "app" (or empty) targets the process-level
   *  catalog (menu items, tabs, fields, field labels); otherwise the role. */
  async addSearchItem(
    processId: string,
    roleId: string,
    args: {
      fieldName: string;
      fieldType: string;
      fieldLabelEn?: string;
      fieldLabelFr?: string;
      fieldLabelAr?: string;
    },
    token: string,
  ): Promise<Json> {
    const body = {
      fieldName: args.fieldName,
      fieldType: args.fieldType,
      fieldLabel_en: args.fieldLabelEn ?? args.fieldName,
      fieldLabel_fr: args.fieldLabelFr ?? args.fieldLabelEn ?? args.fieldName,
      fieldLabel_ar: args.fieldLabelAr ?? args.fieldLabelEn ?? args.fieldName,
    };
    const isAppLevel = !roleId || roleId === 'app';
    const res = isAppLevel
      ? await apiClient.post(
          `${base(this.oummaUrl)}/api/management/search-item/${processId}`,
          body,
          this.auth(token),
        )
      : await apiClient.post(
          `${base(this.oummaUrl)}/api/management/add-search-item/${processId}/${roleId}`,
          body,
          this.auth(token),
        );
    return (res.data ?? {}) as Json;
  }

  /** GET /api/management/search-items/{processId} — process-level catalog. */
  async listProcessSearchItems(processId: string, token: string): Promise<Json[]> {
    const res = await apiClient.get(
      `${base(this.oummaUrl)}/api/management/search-items/${processId}`,
      this.auth(token),
    );
    return Array.isArray(res.data) ? (res.data as Json[]) : [];
  }

  /** DELETE /api/management/search-item/{processId}/{fieldName} */
  async deleteProcessSearchItem(processId: string, fieldName: string, token: string): Promise<Json> {
    const res = await apiClient.delete(
      `${base(this.oummaUrl)}/api/management/search-item/${processId}/${encodeURIComponent(fieldName)}`,
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/ai-params */
  async setAiParams(
    args: { processId: string; model: string; embeddingModel?: string; processDesc?: string },
    token: string,
  ): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/ai-params`,
      {
        process_id: args.processId,
        model: args.model,
        embedding_model: args.embeddingModel ?? 'bge',
        process_desc: args.processDesc ?? '',
        prompts: [],
      },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/add-template */
  async addTemplate(
    args: {
      processId: string;
      templateId: string;
      name: string;
      templateType?: string;
      allowedGroups?: string[];
      allowedSteps?: string[];
      jsonTemplate: unknown;
    },
    token: string,
  ): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/add-template`,
      {
        process_id: args.processId,
        template_id: args.templateId,
        template_name: args.name,
        template_type: args.templateType ?? 'print',
        allowed_groups: args.allowedGroups ?? [],
        allowed_steps: args.allowedSteps ?? [],
        json_template: args.jsonTemplate,
      },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/design/save — engine section, BPMN-validated.
   *  Saves a NEW version (postgres); returns the version number. */
  async saveDesign(processId: string, yaml: string, token: string): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/design/save`,
      { processId, yaml },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** PUT /api/management/form-step/{pid}/{stepId} — update a step in place
   *  (rename via new_step_id, fields, form_input, launchable). */
  async updateFormStep(
    processId: string,
    stepId: string,
    args: {
      newStepId?: string;
      launchable?: boolean;
      formInput?: unknown;
      fields?: Json[];
    },
    token: string,
  ): Promise<Json> {
    const res = await apiClient.put(
      `${base(this.oummaUrl)}/api/management/form-step/${encodeURIComponent(processId)}/${encodeURIComponent(stepId)}`,
      {
        new_step_id: args.newStepId,
        launchable: args.launchable,
        form_input: args.formInput ?? null,
        form_fields: args.fields ?? [],
        has_fields: (args.fields ?? []).length > 0,
      },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/design/deploy — activate a saved version.
   *  version 0 = the single pending (unconfirmed) version. */
  async deployDesign(processId: string, version: number, token: string): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/design/deploy`,
      { processId, version },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** POST /api/management/design/discard — revert unconfirmed changes. */
  async discardDesign(processId: string, token: string): Promise<Json> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/design/discard`,
      { processId },
      this.auth(token),
    );
    return (res.data ?? {}) as Json;
  }

  /** GET /api/management/design/versions?processId= */
  async listDesignVersions(processId: string, token: string): Promise<Json[]> {
    const res = await apiClient.get(
      `${base(this.oummaUrl)}/api/management/design/versions`,
      { ...this.auth(token), params: { processId } },
    );
    return Array.isArray(res.data) ? (res.data as Json[]) : [];
  }

  /** GET /api/management/design/{pid}?version= — design JSON (0 = active). */
  async getDesign(processId: string, version: number, token: string): Promise<Json> {
    const res = await apiClient.get(
      `${base(this.oummaUrl)}/api/management/design/${processId}`,
      { ...this.auth(token), params: { version } },
    );
    return (res.data ?? {}) as Json;
  }

  /** GET /api/management/design/{pid}?pending=true — the PENDING design
   *  document (the live editing target); null when there is none. */
  async getPendingDesign(processId: string, token: string): Promise<Json | null> {
    try {
      const res = await apiClient.get(
        `${base(this.oummaUrl)}/api/management/design/${processId}`,
        { ...this.auth(token), params: { pending: true } },
      );
      return ((res.data as Json)?.design ?? null) as Json | null;
    } catch {
      return null;
    }
  }

  /** POST /api/management/design/ask — designer chat (LLM, tool protocol). */
  async designAsk(
    args: {
      processId: string;
      prompt: string;
      lang?: string;
      history?: { role: string; content: string }[];
      context?: string;
    },
    token: string,
  ): Promise<string> {
    const res = await apiClient.post(
      `${base(this.oummaUrl)}/api/management/design/ask`,
      {
        processId: args.processId,
        prompt: args.prompt,
        lang: args.lang ?? '',
        history: args.history ?? [],
        context: args.context ?? '',
      },
      { ...this.auth(token), timeout: 180_000 },
    );
    return String((res.data as Json)?.answer ?? '');
  }
}
