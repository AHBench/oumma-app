import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '../../../src/core/http/client';
import { OummaFormsDataService } from '../../../src/features/process-forms/data/datasources/oumma-forms-datasource';
import type { ProcessApp } from '../../../src/features/process-apps/domain/entities/process-app';

const process: ProcessApp = {
  id: 'order-processing',
  name: 'Order Processing',
  description: 'd',
  iconPath: '',
  link: '',
  canLaunch: true,
  sharedProcessIds: [],
  roles: [],
};

// Real shape of GET /definitions (object map — alphabetical key order, as the
// Go handler serializes it), trimmed to the tasks the test needs.
const definition = {
  id: 'order-processing',
  description: 'End-to-end order processing',
  start_task_id: 'start',
  end_task_ids: ['end'],
  tasks: {
    end: { id: 'end', type: 'END', description: 'Finalize' },
    manual_review: {
      id: 'manual_review',
      type: 'HUMAN',
      description: 'Operations team reviews the order',
      group: 'cashier',
      input_schema: {
        type: 'object',
        properties: {
          order_summary: { type: 'string' },
          validation_result: { type: 'object' },
          requires_attention: { type: 'string' },
        },
      },
      output_schema: {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
          reviewer_notes: { type: 'string' },
        },
      },
    },
    process_payment: { id: 'process_payment', type: 'SYSTEM', description: 'Charge' },
    start: { id: 'start', type: 'START', description: 'Init' },
    validate_order: { id: 'validate_order', type: 'SYSTEM', description: 'Validate' },
  },
  topology: [
    { from: 'start', to: 'validate_order', condition: 'always' },
    { from: 'validate_order', to: 'manual_review', condition: 'valid' },
    { from: 'validate_order', to: 'end', condition: 'invalid' },
    { from: 'manual_review', to: 'process_payment', condition: 'approved' },
    { from: 'process_payment', to: 'end', condition: 'done' },
  ],
};

describe('process-forms/oumma forms datasource — schema selection', () => {
  beforeEach(() => {
    apiClient.defaults.adapter = vi.fn(async (config) => ({
      data: [definition],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
  });

  it('launch form (initial task, input mode) uses the input_schema', async () => {
    const ds = new OummaFormsDataService('http://oumma');
    const form = await ds.getFormDataStructure(process, 'manual_review', 'TOKEN', 'input');
    expect(form?.stepId).toBe('manual_review');
    expect(form?.formFields.map((f) => f.fieldName)).toEqual([
      'order_summary',
      'validation_result',
      'requires_attention',
    ]);
    expect(form?.launchable).toBe(true);
  });

  it('decision form (output mode) uses the output_schema', async () => {
    const ds = new OummaFormsDataService('http://oumma');
    const form = await ds.getFormDataStructure(process, 'manual_review', 'TOKEN', 'output');
    const fields = (form?.formFields ?? []).map((f) => `${f.fieldName}:${f.fieldType}`);
    expect(fields).toEqual(['approved:checkbox', 'reviewer_notes:text']);
  });
});

describe('process-forms/oumma forms datasource — auth-backend step form (source of truth)', () => {
  // Shape mirrors GET /forms/onboarding/{step} from the brief-auth backend:
  // $-prefixed field names, tabs, and a nested form_input template with
  // $-placeholders.
  const stepBody = {
    data: {
      step_id: 'Verification Dossier',
      launchable: true,
      form_fields: [
        { field_name: '$firstName_fr', field_tab: 'General', field_row: 1, field_label: 'First Name', field_type: 'text', field_required: true, field_minLength: 3 },
        { field_name: '$country', field_tab: 'General', field_row: 3, field_label: 'Birth Country', field_type: 'dropdown', field_required: true, field_options: ['Algeria', 'France'] },
        { field_name: '$acount_type_compte', field_tab: 'Account', field_row: 1, field_label: 'Account Type', field_type: 'dropdown', field_required: true, field_options: ['Compte Courrant', 'Compte Epargne'] },
        { field_name: '$terms', field_tab: 'Terms and Conditions', field_row: 1, field_label: 'Accept Terms', field_type: 'checkbox', field_required: false },
      ],
      form_input: {
        customer: { firstName_fr: '$firstName_fr', birthPlace: { country: '$country' } },
        account: { acount_type_compte: '$acount_type_compte' },
        employee_approval: false,
      },
    },
  };

  function mockAdapter(stepResponse: { status: number; data: unknown } | 'error') {
    apiClient.defaults.adapter = vi.fn(async (config) => {
      const url = config.url ?? '';
      if (url.includes('/forms/')) {
        if (stepResponse === 'error') {
          throw Object.assign(new Error('Not Found'), {
            response: { status: 404, data: { error: 'not found' } },
          });
        }
        return { data: stepResponse.data, status: stepResponse.status, statusText: 'OK', headers: {}, config };
      }
      return { data: [definition], status: 200, statusText: 'OK', headers: {}, config };
    });
  }

  it('renders the step form fields as-is (names, tabs, types, options)', async () => {
    mockAdapter({ status: 200, data: stepBody });
    const ds = new OummaFormsDataService('http://oumma', 'http://auth');
    const form = await ds.getFormDataStructure(process, 'Verification Dossier', 'TOKEN', 'input');
    expect(form?.stepId).toBe('Verification Dossier');
    expect(form?.formFields.map((f) => `${f.fieldName}|${f.fieldTab}|${f.fieldType}`)).toEqual([
      'firstName_fr|General|text',
      'country|General|dropdown',
      'acount_type_compte|Account|dropdown',
      'terms|Terms and Conditions|checkbox',
    ]);
    expect(form?.formFields[0].fieldMinlength).toBe(3);
    expect(form?.formFields[1].fieldOptions).toEqual(['Algeria', 'France']);
    // the nested form_input template is carried through for submit-time expansion
    expect(form?.formInput).toEqual(stepBody.data.form_input);
  });

  it('falls back to the step form for a decision form when the task has no output_schema', async () => {
    const decisionBody = {
      data: {
        step_id: 'Controle Responsable',
        launchable: false,
        form_fields: [
          { field_name: '$manager_approval', field_tab: 'Décision Responsable', field_row: 1, field_label: 'Approuver Ouverture de compte', field_type: 'dropdown', field_required: true, field_options: ['Yes', 'No'] },
          { field_name: '$manager_comment', field_tab: 'Décision Responsable', field_row: 2, field_label: 'Commentaires', field_type: 'text', field_required: false },
        ],
        form_input: { manager_approval: '$manager_approval', manager_comment: '$manager_comment' },
      },
    };
    mockAdapter({ status: 200, data: decisionBody });
    const ds = new OummaFormsDataService('http://oumma', 'http://auth');
    const form = await ds.getFormDataStructure(process, 'Controle Responsable', 'TOKEN', 'output');
    expect(form?.formFields.map((f) => f.fieldName)).toEqual(['manager_approval', 'manager_comment']);
    expect(form?.launchable).toBe(false);
    expect(form?.formInput).toEqual({ manager_approval: '$manager_approval', manager_comment: '$manager_comment' });
  });

  it('falls back to the schema form when the step form is missing', async () => {
    mockAdapter('error');
    const ds = new OummaFormsDataService('http://oumma', 'http://auth');
    const form = await ds.getFormDataStructure(process, 'manual_review', 'TOKEN', 'input');
    expect(form?.formFields.map((f) => f.fieldName)).toEqual([
      'order_summary',
      'validation_result',
      'requires_attention',
    ]);
    expect(form?.formInput).toEqual({});
  });

  it('falls back to the schema form when the step has no fields', async () => {
    mockAdapter({
      status: 200,
      data: { data: { step_id: 'Controle Juriste', launchable: false, form_fields: [], form_input: {} } },
    });
    const ds = new OummaFormsDataService('http://oumma', 'http://auth');
    const form = await ds.getFormDataStructure(process, 'manual_review', 'TOKEN', 'output');
    expect(form?.formFields.map((f) => f.fieldName)).toEqual(['approved', 'reviewer_notes']);
  });
});

describe('process-forms/oumma forms datasource — search items (localized labels)', () => {
  it('maps the backend wire shape (fieldLabel_fr/ar/en) and filters empties', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => ({
      data: [
        { fieldName: 'FirstName_fr', fieldType: 'String', fieldLabel_fr: 'Prénom', fieldLabel_ar: 'الاسم الأول', fieldLabel_en: 'First Name' },
        { fieldName: 'country', fieldType: 'String', fieldLabel_fr: 'Pays', fieldLabel_ar: 'البلد', fieldLabel_en: 'Country' },
        { fieldName: '', fieldType: 'String', fieldLabel_fr: '', fieldLabel_ar: '', fieldLabel_en: '' },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    const ds = new OummaFormsDataService('http://oumma', 'http://auth');
    const items = await ds.getSearchItems('onboarding', ['Managers', 'CustRelations'], 'TOKEN');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      fieldName: 'FirstName_fr',
      fieldType: 'String',
      fieldLabelEn: 'First Name',
      fieldLabelFr: 'Prénom',
      fieldLabelAr: 'الاسم الأول',
    });
  });

  it('re-throws when the endpoint is unavailable so the query retries (no cached empty catalog)', async () => {
    apiClient.defaults.adapter = vi.fn(async () => {
      throw Object.assign(new Error('Not Found'), {
        response: { status: 404, data: { error: 'Role not found' } },
      });
    });
    const ds = new OummaFormsDataService('http://oumma', 'http://auth');
    await expect(ds.getSearchItems('onboarding', ['Managers'], 'TOKEN')).rejects.toThrow();
  });

  it('returns [] without authUrl, roles or token', async () => {
    expect(await new OummaFormsDataService('http://oumma').getSearchItems('p', ['r'], 'TOKEN')).toEqual([]);
    expect(await new OummaFormsDataService('http://oumma', 'http://auth').getSearchItems('p', [], 'TOKEN')).toEqual([]);
    expect(await new OummaFormsDataService('http://oumma', 'http://auth').getSearchItems('p', ['r'], '')).toEqual([]);
  });
});

describe('process-forms/oumma forms datasource — oper-data-index saved forms', () => {
  const stepJson = {
    form_id: 'f-1',
    step_id: 'manual_review',
    process_instance_id: [],
    launchable: true,
    form_input: JSON.stringify({ order_summary: 'widget' }),
    form_fields: [{ field_name: 'order_summary', field_label: 'Order', field_row: 1, field_type: 'text', field_header_display: true }],
    created_at: '2026-01-01T00:00:00Z',
    version: 1,
  };

  it('getSavedForms parses user/forms (activeform=false) steps into forms', async () => {
    const adapter = vi.fn(async (config) => ({
      data: [{ id: 1, process_id: 'order-processing', steps: [stepJson] }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    apiClient.defaults.adapter = adapter;
    const ds = new OummaFormsDataService('http://oumma', 'http://auth', 'http://oper');
    const forms = await ds.getSavedForms(process, 'manual_review', 'TOKEN', ['100']);
    expect(forms).toHaveLength(1);
    expect(forms[0].formId).toBe('f-1');
    expect(forms[0].formInput).toEqual({ order_summary: 'widget' });
    const call = adapter.mock.calls[0][0] as { url: string; params: Record<string, string> };
    expect(call.url).toBe('http://oper/user/forms');
    expect(call.params.activeform).toBe('false');
    expect(call.params.step_id).toBe('manual_review');
    expect(call.params.departments).toBe('100');
  });

  it('saveFormDataStructure POSTs the form to /management/processform', async () => {
    const adapter = vi.fn(async (config) => ({
      data: { process_id: 'order-processing', steps: [{ id: 'f-9' }], version: 1 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    apiClient.defaults.adapter = adapter;
    const ds = new OummaFormsDataService('http://oumma', 'http://auth', 'http://oper');
    const res = await ds.saveFormDataStructure(process, {
      formId: undefined,
      stepId: 'manual_review',
      processInstanceIds: [],
      launchable: true,
      formInput: { order_summary: 'widget' },
      formFields: [],
      createdAt: null,
      formVersion: '1',
    }, 'TOKEN');
    expect(res.form_id).toBe('f-9');
    const call = adapter.mock.calls[0][0] as { url: string; method?: string; data: unknown };
    const body = JSON.parse(String(call.data)) as Record<string, unknown>;
    expect(call.url).toBe('http://oper/management/processform');
    expect(call.method?.toUpperCase()).toBe('POST');
    expect(body.process_id).toBe('order-processing');
    expect((body.steps as unknown[]).length).toBe(1);
  });

  it('updateFormDataStructure PUTs the step (this is how a form becomes active)', async () => {
    const adapter = vi.fn(async (config) => ({
      data: { message: 'ok', process_id: 'order-processing', form_id: 'f-1', new_version: 2 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    apiClient.defaults.adapter = adapter;
    const ds = new OummaFormsDataService('http://oumma', 'http://auth', 'http://oper');
    const res = await ds.updateFormDataStructure(process, {
      formId: 'f-1',
      stepId: 'manual_review',
      processInstanceIds: ['inst-77'],
      launchable: true,
      formInput: {},
      formFields: [],
      createdAt: null,
      formVersion: '1',
    }, 'TOKEN');
    expect(res.version).toBe(2);
    const call = adapter.mock.calls[0][0] as { url: string; method?: string; data: unknown };
    const body = JSON.parse(String(call.data)) as Record<string, unknown>;
    expect(call.url).toBe('http://oper/management/processform');
    expect(call.method?.toUpperCase()).toBe('PUT');
    expect(body.form_id).toBe('f-1');
    const step = body.step as Record<string, unknown>;
    expect(step.process_instance_id).toEqual(['inst-77']);
  });

  it('deleteFormDataStructure DELETEs with the step + form id body', async () => {
    const adapter = vi.fn(async (config) => ({
      data: { message: 'deleted', process_id: 'order-processing' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    apiClient.defaults.adapter = adapter;
    const ds = new OummaFormsDataService('http://oumma', 'http://auth', 'http://oper');
    const res = await ds.deleteFormDataStructure(process, 'manual_review', 'f-1', 'TOKEN');
    expect(res.message).toBe('deleted');
    const call = adapter.mock.calls[0][0] as { url: string; method?: string; data: unknown };
    const body = JSON.parse(String(call.data)) as Record<string, unknown>;
    expect(call.url).toBe('http://oper/management/processform');
    expect(call.method?.toUpperCase()).toBe('DELETE');
    expect((body.steps as Record<string, unknown>[])[0].form_id).toBe('f-1');
  });

  it('getFormDataStructureById re-reads the form via /user/forms/getform', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => ({
      data: { steps: [{ ...stepJson, process_instance_id: ['inst-77'] }] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    const ds = new OummaFormsDataService('http://oumma', 'http://auth', 'http://oper');
    const form = await ds.getFormDataStructureById(process, 'f-1', 'TOKEN');
    expect(form.formId).toBe('f-1');
    expect(form.processInstanceIds).toEqual(['inst-77']);
  });
});
