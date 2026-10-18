import { describe, expect, it } from 'vitest';
import {
  dedupViewItems,
  findDescriptionById,
  groupRowsByViewItemId,
  tryParseJsonList,
  tryParseStringList,
} from '../../../src/features/process-tasks/presentation/components/task-view-model';
import type { TaskItem } from '../../../src/features/process-tasks/data/models/task-models';
import type { TaskItemLabel } from '../../../src/features/process-page/data/models/task-group-label';
import type { Form } from '../../../src/features/process-forms/data/models/form-model';

const item = (taskId: string, description: unknown): TaskItem => ({
  taskId,
  description,
  detailed: typeof description === 'object' && description !== null,
  instanceId: 'i1',
  taskPhase: 'Ready',
  taskPhaseStatus: 'Open',
  startedAt: '2024-01-01T00:00:00Z',
});

const label = (id: number, description: string, itemColumnName: string, extra: Partial<TaskItemLabel> = {}): TaskItemLabel => ({
  id,
  description,
  detailed: false,
  atomic: false,
  urlActive: false,
  itemColumnName,
  format: null,
  formatString: null,
  ...extra,
});

describe('task-view-model — JSON parsing (TaskItemEntity parity)', () => {
  it('parses JSON string lists, map wrappers and relaxed Dart lists', () => {
    expect(tryParseJsonList('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(tryParseJsonList('{"items":[{"x":"y"}]}')).toEqual([{ x: 'y' }]);
    expect(tryParseJsonList('{"only":[{"k":"v"}]}')).toEqual([{ k: 'v' }]);
    expect(tryParseJsonList('[{"a":1}, "str", 42]')).toEqual([{ a: 1 }]); // non-maps dropped
    expect(tryParseJsonList('plain text')).toBeNull();
    expect(tryParseJsonList('[{id: emp-101, nin: null}]')).toEqual([{ id: 'emp-101', nin: null }]);
  });

  it('parses string lists only when every entry is a string', () => {
    expect(tryParseStringList('["a","b"]')).toEqual(['a', 'b']);
    expect(tryParseStringList('[{"a":1}]')).toBeNull();
    expect(tryParseStringList('"single"')).toBeNull();
  });

  it('resolves values recursively from task item JSON (findDescriptionById)', () => {
    const items = [item('t1', JSON.stringify({ customer: { name: 'ACME' } }))];
    expect(findDescriptionById(items, 't1')).toBe(JSON.stringify({ customer: { name: 'ACME' } }));
    // Recursion: the value *at* the 'customer' key (the inner object), as in
    // the Dart _recursiveSearch (jsonEncode of the matched value).
    expect(findDescriptionById(items, 'customer')).toBe('{"name":"ACME"}');
    expect(findDescriptionById(items, 'name')).toBe('ACME');
    expect(findDescriptionById(items, 'missing')).toBeUndefined();
  });
});

describe('task-view-model — grouping (view_task._groupRowsByViewItemId parity)', () => {
  it('groups by view item id order and skips JSON child keys', () => {
    const items = [
      item('company', JSON.stringify({ full_name: 'ACME', sire: '123' })),
      item('employees', JSON.stringify([
        { full_name: 'A', role: 'dev' },
        { full_name: 'B', role: 'ops' },
      ])),
      item('full_name', 'SHOULD BE SKIPPED'),
    ];
    const viewItems = [
      label(2, 'Employees', 'employees'),
      label(1, 'Company', 'company'),
      label(3, 'Full name', 'full_name'),
    ];
    const grouped = groupRowsByViewItemId(items, viewItems, 'fr');
    // Sorted by view item id: company(1) then employees(2); full_name(3) is a
    // child key of the employees JSON list → skipped.
    expect(Object.keys(grouped)).toEqual(['1', '2']);
    expect(grouped['1'][0]).toEqual({ label: 'Company', value: '{"full_name":"ACME","sire":"123"}' });
    expect(grouped['2'].length).toBe(1);
    expect(grouped['3']).toBeUndefined();
  });

  it('returns an empty map when there are no view items', () => {
    expect(groupRowsByViewItemId([item('a', 'x')], null)).toEqual({});
  });
});

describe('task-view-model — dossier dedup (_dedupViewItems parity)', () => {
  const dossier: Form = {
    formId: 'f1',
    stepId: 's',
    processInstanceIds: ['i1'],
    formInput: {},
    formFields: [{
      fieldType: 'text',
      fieldLabel: 'Name',
      fieldName: 'full_name',
      fieldRequired: false,
      fieldTab: 'General',
      fieldRow: 1,
      fieldEdit: true,
      fieldHeaderDisplay: false,
      userCanAdd: false,
      fieldMultpleChoice: false,
    }],
  };

  it('hides view items whose column name exists on the dossier (lang suffix ignored)', () => {
    const viewItems = [
      label(1, 'Name', 'full_name_en'),
      label(2, 'Role', 'role'),
    ];
    const deduped = dedupViewItems(viewItems, dossier);
    expect(deduped?.map((v) => v.id)).toEqual([2]);
  });

  it('returns the list unchanged when no dossier is selected', () => {
    const viewItems = [label(1, 'Name', 'full_name')];
    expect(dedupViewItems(viewItems, null)).toBe(viewItems);
  });
});
