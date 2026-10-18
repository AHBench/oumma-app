import { describe, expect, it } from 'vitest';

// FormFieldFactory transitively imports the i18n core, which reads
// localStorage and touches document at module load — provide node shims
// before importing it.
(globalThis as Record<string, unknown>).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
if (!(globalThis as Record<string, unknown>).document) {
  (globalThis as Record<string, unknown>).document = {
    documentElement: { lang: 'en', dir: 'ltr', setAttribute: () => undefined },
  };
}

const { buildSubmittedFormInput } = await import(
  '../../../src/features/process-forms/presentation/components/FormFieldFactory'
);
const { formFromJson, formFieldFromJson } = await import(
  '../../../src/features/process-forms/data/models/form-model'
);

const field = (name: string, type = 'text') =>
  ({ field_name: name, field_type: type, field_label: name });

describe('buildSubmittedFormInput — decision output -> process data', () => {
  it('keeps template-declared keys resolved', () => {
    const form = formFromJson({
      step_id: 'Controle Responsable',
      form_input: { manager_approval: '$manager_approval' },
      form_fields: [field('$manager_approval', 'dropdown')],
    });
    const out = buildSubmittedFormInput(form, { manager_approval: 'No' });
    expect(out.manager_approval).toBe('No');
  });

  it('writes user-set values under the bare field_name even when the template has no key', () => {
    const form = formFromJson({
      step_id: 'Some Step',
      form_input: {},
      form_fields: [field('$employee_approval', 'dropdown'), field('$fraude_valide', 'dropdown')],
    });
    const out = buildSubmittedFormInput(form, { employee_approval: 'Yes' });
    expect(out.employee_approval).toBe('Yes');
    // fields the user did not set are NOT injected (no pollution with defaults)
    expect(out.fraude_valide).toBeUndefined();
  });

  it('does not overwrite template-resolved keys', () => {
    const form = formFromJson({
      step_id: 'S',
      form_input: { x: '$x' },
      form_fields: [field('$x')],
    });
    const out = buildSubmittedFormInput(form, { x: 'val' });
    expect(out.x).toBe('val');
  });
});
