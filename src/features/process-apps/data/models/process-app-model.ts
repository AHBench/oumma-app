import type {
  ActionGroup,
  ActionItem,
  DocRole,
  ProcessApp,
  ProcessRole,
  ProcessRoleTasks,
} from '../../domain/entities/process-app';

type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((e) => String(e)) : [];
}

export function actionItemFromJson(json: Json): ActionItem {
  return {
    actionName: str(json.action_name),
    actionValue: bool(json.action_value),
  };
}

export function actionGroupFromJson(json: Json): ActionGroup {
  return {
    actionGroup: str(json.action_group),
    actionItems: Array.isArray(json.action_items)
      ? (json.action_items as Json[]).map(actionItemFromJson)
      : [],
  };
}

export function docRoleFromJson(json: Json): DocRole {
  return json as DocRole;
}

export function processRoleTasksFromJson(json: Json): ProcessRoleTasks {
  return {
    taskName: str(json.task_name),
    initialTask: bool(json.initial_task, false),
    canEditInitialFormInTask: bool(json.can_edit_initial_form, false),
    actions: Array.isArray(json.task_actions)
      ? (json.task_actions as Json[]).map(actionGroupFromJson)
      : [],
    requiresDecisionForm: bool(json.requires_decision_form, true),
  };
}

export function processRoleFromJson(json: Json): ProcessRole {
  return {
    roleId: str(json.role_id),
    roleName: str(json.role_name),
    applyDeptFilter: bool(json.apply_dept_filter),
    canEditInitialForm: bool(json.can_edit_initial_form),
    roleCanLaunch: bool(json.role_can_launch),
    viewAcessRoles: strList(json.view_access_roles),
    docRoles: Array.isArray(json.doc_roles)
      ? (json.doc_roles as Json[]).map(docRoleFromJson)
      : [],
    roleTasks: Array.isArray(json.role_tasks)
      ? (json.role_tasks as Json[]).map(processRoleTasksFromJson)
      : [],
  };
}

/** Response item for GET {processServiceBaseUrl}/my-accessible-processes. */
export function processAppFromJson(json: Json): ProcessApp {
  return {
    id: str(json.process_id),
    name: str(json.process_name),
    podname: json.process_podname != null ? str(json.process_podname) : null,
    description: str(json.process_description),
    iconPath: str(json.process_icon_path),
    iconKey: str(json.process_icon_key),
    link: str(json.process_link),
    serviceName: json.process_service_name != null ? str(json.process_service_name) : null,
    canLaunch: bool(json.process_can_be_launched),
    canLaunchRoleId:
      json.process_launch_role_id != null ? str(json.process_launch_role_id) : null,
    sharedProcessIds: strList(json.shared_process_ids),
    initialSteps: strList(json.initial_steps),
    searchItems: Array.isArray(json.search_items)
      ? (json.search_items as Json[]).map((it) => ({
          fieldName: str(it.fieldName ?? it.field_name),
          fieldType: it.fieldType != null ? str(it.fieldType) : it.field_type != null ? str(it.field_type) : undefined,
          fieldLabelEn: it.fieldLabel_en != null ? str(it.fieldLabel_en) : it.field_label_en != null ? str(it.field_label_en) : undefined,
          fieldLabelFr: it.fieldLabel_fr != null ? str(it.fieldLabel_fr) : it.field_label_fr != null ? str(it.field_label_fr) : undefined,
          fieldLabelAr: it.fieldLabel_ar != null ? str(it.fieldLabel_ar) : it.field_label_ar != null ? str(it.field_label_ar) : undefined,
        }))
      : [],
    roles: Array.isArray(json.roles)
      ? (json.roles as Json[]).map(processRoleFromJson)
      : [],
  };
}
