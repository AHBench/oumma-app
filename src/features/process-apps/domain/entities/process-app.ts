/**
 * Process-app domain entities — mirrors
 * lib/features/process_apps/domain/entity/*.
 * The DTO layer (data/models) is isomorphic: the backend JSON maps
 * 1:1 to these shapes, so a single typed interface per entity is used
 * (Dart's entity/model split collapses naturally in TypeScript).
 */

export interface ActionItem {
  actionName: string;
  actionValue: boolean;
}

export interface ActionGroup {
  actionGroup: string;
  actionItems: ActionItem[];
}

export interface DocRole {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface ProcessRoleTasks {
  taskName: string;
  initialTask: boolean;
  canEditInitialFormInTask: boolean;
  actions: ActionGroup[];
  requiresDecisionForm: boolean;
}

export interface ProcessRole {
  roleId: string;
  roleName: string;
  applyDeptFilter: boolean;
  canEditInitialForm: boolean;
  roleCanLaunch: boolean;
  viewAcessRoles: string[]; // (sic) — backend field "view_access_roles"
  docRoles: DocRole[];
  roleTasks: ProcessRoleTasks[];
}

export interface ProcessApp {
  id: string;
  name: string;
  podname?: string | null;
  description: string;
  iconPath: string;
  /** Built-in icon catalog key (see core/process-icons); '' = default. */
  iconKey: string;
  link: string;
  serviceName?: string | null;
  canLaunch: boolean;
  canLaunchRoleId?: string | null;
  sharedProcessIds: string[];
  /** Step ids marked initial (launchable) in the designer's Forms tab. */
  initialSteps: string[];
  roles: ProcessRole[];
  /** Process-level label catalog (EN/FR/AR) — localized form field labels,
   *  tab titles and menu items, carried on the process DTO. */
  searchItems: SearchItem[];
}

/** A localized (EN/FR/AR) label catalog entry. */
export interface SearchItem {
  fieldName: string;
  fieldType?: string;
  fieldLabelEn?: string;
  fieldLabelFr?: string;
  fieldLabelAr?: string;
}

/**
 * Helper used across the app: role matching canLaunchRoleId plus its
 * initial task — the "first step" of a launchable process.
 */
export function findRoleByName(process: ProcessApp, roleId: string): ProcessRole | undefined {
  return process.roles.find((role) => role.roleId === roleId);
}

export function findInitialTaskId(role: ProcessRole | undefined): string {
  if (!role) return '';
  const task = role.roleTasks.find((t) => t.initialTask);
  return task?.taskName ?? role.roleTasks[0]?.taskName ?? '';
}

/**
 * Role ids + their view-access roles + the task's own group: the groups
 * accepted by /usertasks/withid for a task (same computation as Dart's
 * _allowedGroupsForTask).
 */
export function allowedGroupsForTask(process: ProcessApp, groupId: string): string[] {
  const groups = new Set<string>();
  for (const role of process.roles) {
    if (role.roleId) groups.add(role.roleId);
    for (const view of role.viewAcessRoles) groups.add(view);
  }
  groups.add(groupId);
  return [...groups];
}
