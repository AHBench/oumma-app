import { describe, expect, it } from 'vitest';
import { LicenseInvalidError, throwIfLicenseInvalid, throwIfLicenseInvalidStrict } from '../../src/core/errors';
import { processAppFromJson } from '../../src/features/process-apps/data/models/process-app-model';
import {
  taskHistoryItemFromJson,
} from '../../src/features/process-audit/data/models/audit-models';

describe('core/errors — license detection', () => {
  it('loose variant raises on any 403 JSON body', () => {
    expect(() =>
      throwIfLicenseInvalid(403, { message: 'License expired', detail: 'd', error: 'X' }),
    ).toThrow(LicenseInvalidError);
    const err = (() => {
      try {
        throwIfLicenseInvalid(403, { message: 'm' });
        return null;
      } catch (e) {
        return e as LicenseInvalidError;
      }
    })();
    expect(err).toBeInstanceOf(LicenseInvalidError);
    expect(err.message).toBe('m');
  });

  it('strict variant raises only for LICENSE_INVALID / LICENCE_INVALID', () => {
    expect(() =>
      throwIfLicenseInvalidStrict(403, { error: 'LICENCE_INVALID', message: 'gone' }),
    ).toThrow(LicenseInvalidError);
    expect(() => throwIfLicenseInvalidStrict(403, { error: 'FORBIDDEN' })).not.toThrow();
    expect(() => throwIfLicenseInvalidStrict(200, { error: 'LICENSE_INVALID' })).not.toThrow();
  });
});

describe('process-apps/process-app-model', () => {
  it('maps the my-accessible-processes payload', () => {
    const p = processAppFromJson({
      process_id: 'pid',
      process_name: 'Name',
      process_description: 'Desc',
      process_icon_path: '/icon.png',
      process_link: '/link',
      process_can_be_launched: true,
      process_launch_role_id: 'role-1',
      shared_process_ids: ['sp1'],
      roles: [
        {
          role_id: 'role-1',
          role_name: 'R1',
          apply_dept_filter: true,
          can_edit_initial_form: true,
          role_can_launch: true,
          view_access_roles: ['v1'],
          doc_roles: [{ id: 'doc-1' }],
          role_tasks: [
            {
              task_id: 't1',
              task_name: 'T1',
              initial_task: true,
              can_edit_initial_form: true,
              task_actions: [
                { action_group: 'grp', action_items: [{ action_name: 'a', action_value: true }] },
              ],
              requires_decision_form: false,
            },
          ],
        },
      ],
    });
    expect(p.id).toBe('pid');
    expect(p.canLaunch).toBe(true);
    expect(p.roles[0].roleCanLaunch).toBe(true);
    expect(p.roles[0].roleTasks[0].requiresDecisionForm).toBe(false);
    expect(p.roles[0].roleTasks[0].actions[0].actionItems[0].actionValue).toBe(true);
  });
});

describe('process-audit/audit-models', () => {
  it('resolves localized view items from the outputs JSON string', () => {
    const item = taskHistoryItemFromJson(
      {
        id: 't1',
        taskName: 'Step',
        referenceName: 'ref',
        startDate: '2024-01-01T00:00:00Z',
        state: 'Completed',
        outputsString: '{"customer": {"name": "ACME"}, "total": 42}',
        processInstanceId: 'i1',
        processId: 'p1',
        comments: [{ id: 'c1', content: 'hi', updatedAt: '2024-01-02T00:00:00Z', updatedBy: 'u' }],
        attachments: [],
      },
      [
        {
          fieldName: 'name',
          fieldType: 'text',
          fieldLabelFr: 'Nom client',
          fieldLabelEn: 'Customer name',
          fieldLabelAr: 'اسم العميل',
        },
        {
          fieldName: 'total',
          fieldType: 'number',
          fieldLabelFr: 'Total FR',
          fieldLabelEn: 'Total EN',
          fieldLabelAr: 'AR',
        },
      ],
      'en',
    );
    expect(item.viewItems).toContainEqual({ key: 'Customer name', value: 'ACME' });
    expect(item.viewItems).toContainEqual({ key: 'Total EN', value: 42 });
    expect(item.comments).toHaveLength(1);
  });
});
