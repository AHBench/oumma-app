import { describe, expect, it } from 'vitest';
import {
  formFromJson,
  formToJson,
  formFieldFromJson,
  searchItemLabel,
  updateNestedKeys,
} from '../../../src/features/process-forms/data/models/form-model';

describe('process-forms/form-model', () => {
  it('parses form_input from a JSON string and a map', () => {
    const fromString = formFromJson({
      form_id: 'f1',
      step_id: 's1',
      form_input: '{"a":1}',
      form_fields: [],
    });
    expect(fromString.formInput).toEqual({ a: 1 });

    const fromMap = formFromJson({
      step_id: 's1',
      form_input: { b: 'x' },
      form_fields: [],
    });
    expect(fromMap.formInput).toEqual({ b: 'x' });
    expect(fromMap.stepId).toBe('s1');
  });

  it('parses process_instance_id as a list (and legacy string)', () => {
    expect(
      formFromJson({ step_id: '', form_fields: [], process_instance_id: ['i1', 'i2'] })
        .processInstanceIds,
    ).toEqual(['i1', 'i2']);
    expect(
      formFromJson({ step_id: '', form_fields: [], process_instance_id: 'legacy' })
        .processInstanceIds,
    ).toEqual(['legacy']);
  });

  it('round-trips the management-API wire shape', () => {
    const form = formFromJson({
      form_id: 'f1',
      step_id: 's1',
      version: '3',
      launchable: true,
      form_input: {},
      form_fields: [
        {
          field_type: 'text',
          field_label: 'Name',
          field_name: 'name',
          field_required: true,
          field_tab: 'General',
          field_row: 1,
        },
      ],
    });
    const json = formToJson(form);
    expect(json).toMatchObject({
      form_id: 'f1',
      step_id: 's1',
      process_instance_id: [],
      launchable: true,
      form_version: '3',
    });
    expect((json.form_fields as Record<string, unknown>[])[0]).toMatchObject({
      field_type: 'text',
      field_name: 'name',
      field_required: true,
      field_edit: true,
    });
  });

  it('strips the $ template marker from field_name so it matches search items', () => {
    const f = formFieldFromJson({
      field_type: 'text',
      field_label: 'First Name',
      field_name: '$firstName_fr',
      field_required: true,
      field_tab: 'General',
      field_row: 1,
    });
    expect(f.fieldName).toBe('firstName_fr');
    // and it then resolves directly against a search item named without the $
    expect(
      searchItemLabel(
        [{ fieldName: 'FirstName_fr', fieldLabelFr: 'Prénom', fieldLabelEn: 'First Name', fieldLabelAr: 'الاسم الأول' }],
        f.fieldName,
        'fr',
      ),
    ).toBe('Prénom');
  });
});

describe('updateNestedKeys — $-free field names still expand the $-template', () => {
  it('writes $-free field values into the nested form_input template', () => {
    // Real onboarding template: leaf keys are $-free, values are $-placeholders.
    const template = {
      customer: { firstName_fr: '$firstName_fr', nin: '$nin' },
      account: { acount_type_compte: '$acount_type_compte' },
      employee_approval: false,
    };
    const extracted = { firstName_fr: 'Amine', nin: '109203123456789', acount_type_compte: 'Compte Epargne' };
    updateNestedKeys(template, extracted);
    expect(template.customer.firstName_fr).toBe('Amine');
    expect(template.customer.nin).toBe('109203123456789');
    expect(template.account.acount_type_compte).toBe('Compte Epargne');
    // untouched template values pass through
    expect(template.employee_approval).toBe(false);
  });
});

describe('searchItemLabel — locale-aware label lookup', () => {
  const items = [
    { fieldName: 'FirstName_fr', fieldLabelEn: 'First Name', fieldLabelFr: 'Prénom', fieldLabelAr: 'الاسم الأول' },
    { fieldName: 'country', fieldLabelEn: 'Country', fieldLabelFr: 'Pays', fieldLabelAr: 'البلد' },
  ];

  it('returns the label for the active language', () => {
    expect(searchItemLabel(items, '$firstName_fr', 'fr')).toBe('Prénom');
    expect(searchItemLabel(items, '$firstName_fr', 'en')).toBe('First Name');
    expect(searchItemLabel(items, 'firstName_fr', 'ar')).toBe('الاسم الأول');
  });

  it('matches case-insensitively and strips the leading $', () => {
    expect(searchItemLabel(items, 'FIRSTNAME_FR', 'en')).toBe('First Name');
    expect(searchItemLabel(items, '$COUNTRY', 'fr')).toBe('Pays');
  });

  it('falls back across languages when the primary is empty', () => {
    const sparse = [
      { fieldName: 'x', fieldLabelEn: '', fieldLabelFr: 'X fr', fieldLabelAr: 'X ar' },
    ];
    expect(searchItemLabel(sparse, 'x', 'en')).toBe('X fr');
    expect(searchItemLabel(sparse, 'x', 'fr')).toBe('X fr');
    expect(searchItemLabel(sparse, 'x', 'ar')).toBe('X ar');
  });

  it('tries the last key segment for nested keys', () => {
    expect(searchItemLabel(items, 'customer.firstName_fr', 'fr')).toBe('Prénom');
    expect(searchItemLabel(items, 'phones[0].country', 'en')).toBe('Country');
  });

  it('returns null when nothing matches or no label is non-empty', () => {
    expect(searchItemLabel(items, 'unknown_field', 'fr')).toBeNull();
    expect(searchItemLabel([], 'firstName_fr', 'fr')).toBeNull();
    expect(searchItemLabel(null, 'firstName_fr', 'fr')).toBeNull();
    expect(searchItemLabel([{ fieldName: 'y', fieldLabelEn: '', fieldLabelFr: '', fieldLabelAr: '' }], 'y', 'en')).toBeNull();
  });
});

describe('searchItemLabel $-prefix normalization (regression: AR labels)', () => {
  const items = [
    { fieldName: '$acount_type_compte', fieldType: 'field_label', fieldLabelEn: 'Account Type', fieldLabelFr: 'Type de Compte', fieldLabelAr: 'نوع الحساب' },
  ];
  it('matches a form field name WITHOUT the $ against a catalog name WITH the $', () => {
    expect(searchItemLabel(items, 'acount_type_compte', 'ar')).toBe('نوع الحساب');
    expect(searchItemLabel(items, 'acount_type_compte', 'en')).toBe('Account Type');
    expect(searchItemLabel(items, '$acount_type_compte', 'ar')).toBe('نوع الحساب');
  });
});
