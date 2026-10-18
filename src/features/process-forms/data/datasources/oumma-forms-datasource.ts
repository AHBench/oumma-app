import { apiClient, getErrorMessage } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { BaseUrls } from '../../../../core/config/base-urls';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { Form } from '../models/form-model';
import type { SearchItem } from '../models/form-model';
import { formFieldFromJson, formFromJson, formToJson } from '../models/form-model';
import {
  definitionFor,
  fetchDefinitions,
  firstHumanTask,
  schemaToFields,
} from '../../../process-apps/data/oumma-mapping';

type Json = Record<string, unknown>;

function checkLicense(error: unknown): void {
  const e = error as { response?: { status?: number; data?: unknown } };
  if (e?.response?.status === 403) {
    throwIfLicenseInvalidStrict(403, e?.response?.data);
  }
}

function base(oummaUrl: string): string {
  return oummaUrl.replace(/\/+$/, '');
}

/**
 * Oumma form datasource — mirrors the Flutter backend forms datasource:
 *
 *  - form structure  ← the auth-backend step form (GET /forms/{pid}/{stepId}),
 *                      with the task's JSON Schemas (input/output) as fallback
 *  - saved forms     ← the **oper-data-index** store (Flutter parity):
 *                      GET {oper}/user/forms?activeform=false|true, where
 *                      "active" is derived server-side from
 *                      `process_instance_id` being non-empty. Launching a
 *                      form appends the new instance id + PUTs the form, so
 *                      it flips to active and drops out of the pending list.
 *  - dossier search  ← Oumma instances (a launched dossier IS an instance)
 */
export class OummaFormsDataService {
  constructor(
    private readonly oummaUrl: string,
    private readonly authUrl: string,
    private readonly operDataIndexUrl: string = BaseUrls.dataOperIndexUrl,
  ) {}

  /**
   * stepId = task name → that step's FORM. The brief-auth step form
   * (`GET /forms/{pid}/{stepId}` — the same endpoint Flutter uses) is the
   * source of the form: its `form_fields` (with `$`-prefixed names, tabs,
   * rows, types, options) are rendered as-is and its `form_input` is the
   * nested template the values are expanded into at submit time. When no
   * step form exists (or it has no fields — e.g. Controle Juriste), the
   * task's JSON Schemas are used instead: input_schema for the initial
   * (launch) form, output_schema for decision forms.
   */
  async getFormDataStructure(
    process: ProcessApp,
    stepId: string,
    token: string,
    schemaMode?: 'input' | 'output',
  ): Promise<Form | null> {
    // Decision forms (output mode): the engine validates the completion
    // input against the task's output_schema, so the output_schema IS the
    // decision form when the task has one. The step form is the launch
    // (input) form and is only the fallback for tasks without an
    // output_schema (e.g. Controle Juriste — no schema, seeded step form).
    if (schemaMode === 'output') {
      const schemaForm = await this.formFromSchema(process.id, stepId, token, 'output');
      if (schemaForm) return schemaForm;
    }

    // 1) brief-auth step form (the real form, same as Flutter)
    if (this.authUrl && stepId !== '') {
      const step = await this.stepForm(process.id, stepId, token);
      if (step) {
        const rawFields: unknown = step.form_fields;
        if (Array.isArray(rawFields) && rawFields.length > 0) {
          return {
            // The step DTO carries the oper-data form_id of the saved step
            // form; launches must send it back (the engine refuses a
            // launch without form_id).
            formId: step.form_id != null ? String(step.form_id) : undefined,
            stepId,
            processInstanceIds: [],
            launchable: typeof step.launchable === 'boolean' ? step.launchable : true,
            formInput: (step.form_input as Json) ?? {},
            formFields: (rawFields as Json[])
              .filter((f) => f && typeof f === 'object')
              .map(formFieldFromJson),
            createdAt: null,
            formVersion: '1',
          };
        }
      }
    }

    // 2) fallback: the task's JSON Schemas
    return this.formFromSchema(process.id, stepId, token, schemaMode);
  }

  /** Build a Form from the task's JSON Schema (null when the task has no
   *  usable schema — e.g. an output_schema without properties). */
  private async formFromSchema(
    processId: string,
    stepId: string,
    token: string,
    schemaMode?: 'input' | 'output',
  ): Promise<Form | null> {
    try {
      const defs = await fetchDefinitions(base(this.oummaUrl), token);
      const def = definitionFor(defs, processId);
      if (!def) return null;

      const target = stepId !== '' ? def.tasks[stepId] : firstHumanTask(def);
      if (!target) return null;

      const isInitial = target.id === firstHumanTask(def)?.id;
      const schema = (
        schemaMode === 'output'
          ? (target.output_schema ?? target.input_schema)
          : isInitial
            ? (target.input_schema ?? target.output_schema)
            : (target.output_schema ?? target.input_schema)
      ) as Json | null;
      const fields = schemaToFields(schema);
      if (fields.length === 0) return null;

      return {
        formId: undefined,
        stepId: target.id,
        processInstanceIds: [],
        launchable: isInitial,
        formInput: {},
        formFields: fields,
        createdAt: null,
        formVersion: '1',
      };
    } catch (e) {
      checkLicense(e);
      appLogger.error(`Error fetching form structure: ${getErrorMessage(e)}`, {
        name: 'OummaFormsDataService',
      });
      throw new Error(`Error fetching form structure: ${getErrorMessage(e)}`);
    }
  }

  /** POST {oper}/management/processform — save a (draft) form. */
  async saveFormDataStructure(
    process: ProcessApp,
    form: Form,
    token: string,
  ): Promise<Json> {
    const res = await apiClient.post(
      `${this.oper()}/management/processform`,
      { process_id: process.id, steps: [formToJson(form)] },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Failed to save form: ${res.status}`);
    }
    const data = (res.data as Json) ?? {};
    if (data.formexists != null) return { formexists: data.formexists };
    const steps = Array.isArray(data.steps) ? (data.steps as Json[]) : [];
    return {
      process_id: data.process_id ?? process.id,
      form_id: steps.length > 0 ? steps[0].id ?? null : null,
      version: data.version ?? null,
    };
  }

  /** DELETE {oper}/management/processform — remove a saved form. */
  async deleteFormDataStructure(
    process: ProcessApp,
    stepId: string,
    formId: string,
    token: string,
  ): Promise<Json> {
    const res = await apiClient.delete(`${this.oper()}/management/processform`, {
      data: {
        process_id: process.id,
        steps: [{ step_id: stepId, form_id: formId, deleted_reason: 'deleted by user' }],
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Failed to delete form ${formId}: ${res.status}`);
    }
    const data = (res.data as Json) ?? {};
    return {
      message: data.message ?? 'ok',
      process_id: data.process_id ?? process.id,
    };
  }

  /**
   * PUT {oper}/management/processform — persist the form (bumps the version).
   * This is how a launched form becomes "active": the caller re-reads the
   * form, appends the new instance id to processInstanceIds and PUTs it back
   * (the server derives activeform from process_instance_id being non-empty).
   */
  async updateFormDataStructure(
    process: ProcessApp,
    form: Form,
    token: string,
  ): Promise<Json> {
    const res = await apiClient.put(
      `${this.oper()}/management/processform`,
      {
        form_id: form.formId,
        step_id: form.stepId,
        process_id: process.id,
        step: formToJson(form),
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Failed to update form ${form.formId}: ${res.status}`);
    }
    const data = (res.data as Json) ?? {};
    return {
      message: data.message ?? 'ok',
      process_id: data.process_id ?? process.id,
      form_id: data.form_id ?? form.formId,
      version: data.new_version ?? data.version ?? null,
    };
  }

  /** Saved-but-not-launched forms (activeform=false) at a step. */
  async getSavedForms(
    process: ProcessApp,
    stepId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]> {
    const params = new URLSearchParams({
      process_id: process.id,
      departments: departments.join(','),
      activeform: 'false',
    });
    if (stepId) params.set('step_id', stepId);
    return this.userForms(params, token);
  }

  /** Launched forms (activeform=true) at a step — the "dossiers". */
  async getActiveForms(
    process: ProcessApp,
    stepId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]> {
    const params = new URLSearchParams({
      process_id: process.id,
      departments: departments.join(','),
      activeform: 'true',
    });
    if (stepId) params.set('step_id', stepId);
    return this.userForms(params, token);
  }

  /** Launched (activeform=true) forms of shared processes. */
  async getSharedSavedForms(
    processId: string,
    token: string,
    departments: string[],
    regularForms: Form[],
  ): Promise<Form[]> {
    try {
      const shared = await this.userForms(
        new URLSearchParams({
          process_id: processId,
          departments: departments.join(','),
          activeform: 'true',
        }),
        token,
      );
      return [...regularForms, ...shared];
    } catch {
      return regularForms;
    }
  }

  /** Re-read a single saved form: GET {oper}/user/forms/getform. */
  async getFormDataStructureById(
    process: ProcessApp,
    formId: string,
    token: string,
  ): Promise<Form> {
    const res = await apiClient.get(
      `${this.oper()}/user/forms/getform`,
      {
        params: { process_id: process.id, form_id: formId },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = (res.data as Json) ?? {};
    const steps = Array.isArray(data.steps) ? (data.steps as Json[]) : [];
    if (steps.length === 0) throw new Error('No form data found');
    return formFromJson(steps[0]);
  }

  /** All saved versions of a form (GET {oper}/user/forms/formversions). */
  async getFormVersions(
    process: ProcessApp,
    formId: string,
    token: string,
    _departments: string[],
  ): Promise<Form[]> {
    const res = await apiClient.get(
      `${this.oper()}/user/forms/formversions`,
      {
        params: { form_id: formId, process_id: process.id, detailed: 'yes' },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const items: Json[] = Array.isArray(res.data) ? (res.data as Json[]) : [];
    const seen = new Set<string>();
    const out: Form[] = [];
    for (const item of items) {
      const steps = Array.isArray(item.steps) ? (item.steps as Json[]) : [];
      for (const step of steps) {
        const key = `${step.form_id}|${step.step_id}|${step.version}`;
        if (!seen.add(key)) continue;
        out.push(formFromJson(step));
      }
    }
    return out;
  }

  /**
   * GET {oper}/user/forms with the given query params — each item is a
   * ProcessForm whose `steps[]` are parsed into Form models (the caller
   * filters by step server-side when step_id is set).
   */
  private async userForms(params: URLSearchParams, token: string): Promise<Form[]> {
    const res = await apiClient.get(`${this.oper()}/user/forms`, {
      params: Object.fromEntries(params.entries()),
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) throw new Error(`Failed to load forms: ${res.status}`);
    const items: Json[] = Array.isArray(res.data) ? (res.data as Json[]) : [];
    const out: Form[] = [];
    for (const item of items) {
      const steps = Array.isArray(item.steps) ? (item.steps as Json[]) : [];
      for (const step of steps) out.push(formFromJson(step));
    }
    return out;
  }

  private oper(): string {
    return this.operDataIndexUrl.replace(/\/+$/, '');
  }

  /**
   * Dossier search — port of Flutter's backend_forms_datasource.searchSavedForms:
   * a non-empty query — or [forceSearchEndpoint] (the "Recherche un dossier"
   * initial listing) — goes to the oper-data search endpoint (server-side
   * keyword search over the saved forms); otherwise the formversions listing
   * (detailed=no → latest version per form/step), optionally restricted to
   * the given form_ids.
   */
  async searchSavedForms(params: {
    query: string;
    process: ProcessApp;
    stepId: string;
    token: string;
    departments: string[];
    groups: string[];
    formIds?: string[];
    forceSearchEndpoint?: boolean;
  }): Promise<Form[]> {
    const { query, process, stepId, token, departments, groups, formIds = [], forceSearchEndpoint = false } = params;
    const keepStep = (f: Form) => stepId === '' || f.stepId === stepId;

    if (query.trim().length > 0 || forceSearchEndpoint) {
      // Server-side query search (Flutter: the searchSavedForms endpoint).
      // An empty query omits the param entirely — the backend lists every
      // launched form the user has access to (query="" would explicitly
      // return an empty list).
      const searchParams: Record<string, unknown> = {
        process_id: process.id,
        step_id: stepId,
        limit: 200,
        groups: groups.join(','),
      };
      if (query.trim().length > 0) searchParams.query = query.trim();
      const res = await apiClient.get(`${this.oper()}/user/forms/searchSavedForms`, {
        params: searchParams,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status !== 200) throw new Error(`Failed to search forms: ${res.status}`);
      const items: Json[] = Array.isArray(res.data) ? (res.data as Json[]) : [];
      const out: Form[] = [];
      for (const item of items) {
        const steps = Array.isArray(item.steps) ? (item.steps as Json[]) : [];
        for (const step of steps) {
          const form = formFromJson(step);
          if (keepStep(form)) out.push(form);
        }
      }
      return out;
    }

    // formversions listing (Flutter: detailed=no, one row per form).
    const p: Record<string, unknown> = { process_id: process.id, detailed: 'no' };
    if (departments.length > 0) p.departments = departments.join(',');
    if (formIds.length > 0) p.form_id = formIds;
    const res = await apiClient.get(`${this.oper()}/user/forms/formversions`, {
      params: p,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) throw new Error(`Failed to load forms: ${res.status}`);
    const items: Json[] = Array.isArray(res.data) ? (res.data as Json[]) : [];
    const out: Form[] = [];
    for (const item of items) {
      const steps = Array.isArray(item.steps) ? (item.steps as Json[]) : [];
      for (const step of steps) {
        const form = formFromJson(step);
        if (keepStep(form)) out.push(form);
      }
    }
    return out;
  }

  async searchSavedSharedForms(
    _query: string,
    _processId: string,
    _token: string,
    _departments: string[],
    _groups: string[],
    regFormModels: Form[],
  ): Promise<Form[]> {
    return regFormModels;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Localized field labels for a process — GET {auth}/search-items/{pid}/{roles}
   * (same base URL as the step forms; the process-service base already carries
   * the /api/user-processes prefix). roles = the PROCESS's role ids,
   * comma-joined; the backend authorizes the caller against their own groups.
   * Any failure degrades to [] — callers fall back to field_label.
   */
  async getSearchItems(
    processId: string,
    roleIds: string[],
    token: string,
  ): Promise<SearchItem[]> {
    if (!this.authUrl || roleIds.length === 0 || !token) return [];
    try {
      const res = await apiClient.get(
        `${this.authUrl.replace(/\/+$/, '')}/search-items/${processId}/${encodeURIComponent(roleIds.join(','))}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status !== 200) {
        // Surface the failure so react-query retries — a silent [] would
        // cache "no catalog" and leave every field label untranslated.
        throw new Error(`search items request failed: ${res.status}`);
      }
      if (!Array.isArray(res.data)) return [];
      return (res.data as Json[])
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
          const name = typeof s.fieldName === 'string' ? s.fieldName : typeof s.field_name === 'string' ? (s.field_name as string) : '';
          const fr = typeof s.fieldLabel_fr === 'string' ? (s.fieldLabel_fr as string) : typeof s.field_label_fr === 'string' ? (s.field_label_fr as string) : undefined;
          const ar = typeof s.fieldLabel_ar === 'string' ? (s.fieldLabel_ar as string) : typeof s.field_label_ar === 'string' ? (s.field_label_ar as string) : undefined;
          const en = typeof s.fieldLabel_en === 'string' ? (s.fieldLabel_en as string) : typeof s.field_label_en === 'string' ? (s.field_label_en as string) : undefined;
          return {
            fieldName: name,
            fieldType: typeof s.fieldType === 'string' ? s.fieldType : typeof s.field_type === 'string' ? (s.field_type as string) : undefined,
            fieldLabelEn: en,
            fieldLabelFr: fr,
            fieldLabelAr: ar,
          };
        })
        .filter((s) => s.fieldName !== '');
    } catch (e) {
      checkLicense(e);
      appLogger.fine(`Search items unavailable for ${processId} — using field labels`);
      // Re-throw (except license/401-auth flows handled by checkLicense) so
      // the query retries instead of caching an empty catalog.
      throw e;
    }
  }

  /** GET {auth}/forms/{processId}/{stepId} → the step DTO (or null). */
  private async stepForm(
    processId: string,
    stepId: string,
    token: string,
  ): Promise<Json | null> {
    try {
      const res = await apiClient.get(
        `${this.authUrl.replace(/\/+$/, '')}/forms/${processId}/${stepId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status !== 200 || !res.data) return null;
      const body = res.data as Json;
      return (body.data ?? body) as Json;
    } catch (e) {
      checkLicense(e);
      appLogger.fine(`No step form for ${processId}/${stepId} — schema fallback`);
      return null;
    }
  }
}
