import type { OummaDesignDataSource } from '../data/datasources/oumma-design-datasource';

type Json = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : v != null ? String(v) : '');
const bool = (v: unknown): boolean => v === true || v === 'true';

/** Result strings fed back to the LLM are capped (context budget). */
export function capResult(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  return s.length > 4000 ? `${s.slice(0, 4000)}\n…(truncated)` : s;
}

export interface DesignToolCall {
  name: string;
  args: Json;
}

/** Field types accepted by the backend (audit of brief setparams scripts). */
export const AUTHORIZED_FIELD_TYPES = [
  'text',
  'dropdown',
  'checkbox',
  'date',
  'external',
  'json list',
] as const;

export type AuthorizedFieldType = (typeof AUTHORIZED_FIELD_TYPES)[number];

export interface FieldTemplateItem {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  fieldRegex?: string;
}

/**
 * Parses a ```tool fenced block ({"name","args"}) from a designer-chat LLM
 * answer — same protocol as the server-side /ask tool loop.
 */
export function parseToolCall(text: string): DesignToolCall | null {
  const open = '```tool';
  const i = text.indexOf(open);
  if (i < 0) return null;
  const rest = text.slice(i + open.length);
  const j = rest.indexOf('```');
  if (j < 0) return null;
  try {
    const parsed = JSON.parse(rest.slice(0, j).trim()) as Json;
    const name = str(parsed.name);
    if (!name) return null;
    return { name, args: (parsed.args ?? {}) as Json };
  } catch {
    return null;
  }
}

export interface DesignToolDef {
  name: string;
  description: string;
  /** Writes require an explicit user confirmation (ActionCard). */
  needsConfirmation: boolean;
  run(args: Json, token: string, ds: OummaDesignDataSource): Promise<unknown>;
}

const A = (args: Json, key: string) => args[key];

/**
 * Designer tool catalog (B-1). Every tool talks to the Oumma
 * `/api/management` API with the user's token; the server re-checks the
 * Designer group on each call.
 */
export function designTools(ds: OummaDesignDataSource): DesignToolDef[] {
  return [
    {
      name: 'get_process_config',
      description: 'Full config (engine + app sections) of a process',
      needsConfirmation: false,
      run: (args, token) => ds.getProcessConfig(str(A(args, 'processId')), token),
    },
    {
      name: 'create_process',
      description: 'Create a new process (app section of its YAML)',
      needsConfirmation: true,
      run: (args, token) =>
        ds.createProcess(
          {
            processName: str(A(args, 'processName')),
            processId: str(A(args, 'processId')) || undefined,
            processDescription: str(A(args, 'processDescription')) || undefined,
            processIconPath: str(A(args, 'iconPath')) || str(A(args, 'processIconPath')) || undefined,
            processLink: str(A(args, 'processLink')) || undefined,
            processServiceName: str(A(args, 'processServiceName')) || undefined,
            processPodName: str(A(args, 'processPodName')) || undefined,
            company: str(A(args, 'company')) || undefined,
            processLaunchRoleId: str(A(args, 'launchRoleId')) || undefined,
            sharedProcessIds: Array.isArray(A(args, 'sharedProcessIds'))
              ? (A(args, 'sharedProcessIds') as string[])
              : undefined,
          },
          token,
        ),
    },
    {
      name: 'update_process',
      description:
        'Change the process display NAME (what appears in the process menu) and/or other header fields. ' +
        'args: processId (current id), name (new display name, any language), description (optional new description), ' +
        'company, link, processLaunchRoleId, sharedProcessIds (all optional). ' +
        'Use this to RENAME a process by display name — it works on deployed processes too. ' +
        '(Use rename_process only to change the technical process id of a never-deployed project.)',
      needsConfirmation: true,
      run: (args, token) => {
        const { processId, ...rest } = args;
        return ds.updateProcess(str(processId), rest as Json, token);
      },
    },
    {
      name: 'set_process_icon',
      description: 'Set the process menu icon (iconKey from the icon catalog, e.g. "bank", "shield", "e-hospital", "e-credit-card")',
      needsConfirmation: true,
      run: (args, token) =>
        ds.setProcessIcon(str(A(args, 'processId')), str(A(args, 'iconKey')), token) as Promise<Json>,
    },
    {
      name: 'rename_process',
      description:
        'Change the PROCESS ID itself. Only allowed while the project has NEVER been deployed ' +
        '(the server rejects deployed processes — the id is then immutable). ' +
        'args: processId (current id), newProcessId (lowercase, hyphens).',
      needsConfirmation: true,
      run: (args, token) =>
        ds.renameProcess(str(A(args, 'processId')), str(A(args, 'newProcessId')), token),
    },
    {
      name: 'delete_process',
      description:
        'Delete a process that was NEVER deployed (a brand-new project) — its design, pending ' +
        'version and files. The server rejects deployed processes. Only use when the user ' +
        'explicitly asks to delete the project.',
      needsConfirmation: true,
      run: (args, token) => ds.deleteProcess(str(A(args, 'processId')), token),
    },
    {
      name: 'add_role',
      description:
        'Upsert a role (Keycloak group) of a process, including its per-task permissions. ' +
        'roleTasks: array of {taskName, actions:{view?, complete?, comment?, attachment?}} — if a role declares a task, the action must be explicitly enabled.',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addRole(
          str(A(args, 'processId')),
          {
            roleId: str(A(args, 'roleId')),
            roleName: str(A(args, 'roleName')),
            canLaunch: bool(A(args, 'canLaunch')),
            canEditInitialForm: bool(A(args, 'canEditInitialForm')),
            applyDeptFilter: bool(A(args, 'applyDeptFilter')),
            docRoles: Array.isArray(A(args, 'docRoles')) ? (A(args, 'docRoles') as Json[]) : undefined,
            viewAccessRoles: Array.isArray(A(args, 'viewAccessRoles'))
              ? (A(args, 'viewAccessRoles') as string[])
              : undefined,
            roleTasks: Array.isArray(A(args, 'roleTasks')) ? (A(args, 'roleTasks') as Json[]) : undefined,
          },
          token,
        ),
    },
    {
      name: 'sync_roles',
      description: 'Re-derive the process roles from the engine design\'s task groups (idempotent)',
      needsConfirmation: true,
      run: (args, token) => ds.syncRoles(str(A(args, 'processId')), token),
    },
    {
      name: 'add_form',
      description: 'Add a form step (launch/step form) with its fields',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addForm(
          str(A(args, 'processId')),
          str(A(args, 'stepId')),
          {
            launchable: bool(A(args, 'launchable')),
            formInput: A(args, 'formInput'),
            fields: Array.isArray(A(args, 'fields')) ? (A(args, 'fields') as Json[]) : [],
          },
          token,
        ),
    },
    {
      name: 'update_form_step',
      description:
        'Edit an EXISTING form step: rename it (newStepId), toggle launchable, change formInput or replace its fields ' +
        '(same field spec as add_form). Use for the Forms tab edits.',
      needsConfirmation: true,
      run: (args, token) =>
        ds.updateFormStep(
          str(A(args, 'processId')),
          str(A(args, 'stepId')),
          {
            newStepId: str(A(args, 'newStepId')) || undefined,
            launchable: A(args, 'launchable') === undefined ? undefined : bool(A(args, 'launchable')),
            formInput: A(args, 'formInput') ?? undefined,
            fields: Array.isArray(A(args, 'fields')) ? (A(args, 'fields') as Json[]) : undefined,
          },
          token,
        ),
    },
    {
      name: 'get_form_steps',
      description: 'List the process\'s current form steps (read-only)',
      needsConfirmation: false,
      run: (args, token) => ds.getFormSteps(str(A(args, 'processId')), token),
    },
    {
      name: 'sync_forms',
      description: 'Create form steps for every human task that has none yet (idempotent)',
      needsConfirmation: true,
      run: (args, token) => ds.syncForms(str(A(args, 'processId')), token),
    },
    {
      name: 'rename_task',
      description:
        'Rename a process task (the durable way to change a step/task name). ' +
        'Renames the engine task (task_id + topology), the matching form step (step_id) ' +
        'and the role task references in one pending design version. ' +
        'args: processId, from (current task name), to (new task name).',
      needsConfirmation: true,
      run: (args, token) =>
        ds.renameTask(
          str(A(args, 'processId')),
          str(A(args, 'from')),
          str(A(args, 'to')),
          token,
        ),
    },
    {
      name: 'add_tool_task',
      description:
        'Add a SYSTEM task that executes an MCP-like tool (Gmail email, Telegram message, ' +
        'WhatsApp message, or a generic HTTP request) — the engine runs it automatically, ' +
        'deterministically, with ZERO LLM tokens. ' +
        'Available tools: mcp.gmail.send (config: from, gateway, api_key; inputs: to, subject, body), ' +
        'mcp.telegram.send (config: bot_token, chat_id; inputs: message), ' +
        'mcp.whatsapp.send (config: access_token, phone_number_id, api_base; inputs: to, message), ' +
        'mcp.http.request (config: method, url, headers; inputs: any JSON body fields). ' +
        'tool_inputs maps each tool parameter to a process-context field key ($-prefixed), e.g. ' +
        '{"to": "$email", "subject": "$subject"}. after_task wires an edge from that task to the new one. ' +
        'args: processId, name (task name), tool, tool_config (object), tool_inputs (object), after_task (optional), group (optional).',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addToolTask(
          str(A(args, 'processId')),
          {
            name: str(A(args, 'name')),
            tool: str(A(args, 'tool')),
            tool_config: (A(args, 'tool_config') as Record<string, string>) ?? {},
            tool_inputs: (A(args, 'tool_inputs') as Record<string, string>) ?? {},
            after_task: str(A(args, 'after_task')) || undefined,
            group: str(A(args, 'group')) || undefined,
          },
          token,
        ),
    },
    {
      name: 'add_system_task',
      description:
        'Add a plain SYSTEM task (automatic HTTP step) to the process design. ' +
        'If the user suggests a configuration in the prompt, pass it: url, method (default POST), headers (object). ' +
        'If the user wants to configure it later, call it WITHOUT url/method/headers — the task is created ' +
        'unconfigured and the user completes it in the designer Tools tab before deploying. ' +
        'For MCP tools (Gmail/Telegram/WhatsApp/HTTP webhook tools) use add_tool_task instead. ' +
        'args: processId, name (task name), description (optional), group (optional), ' +
        'after_task (optional task to wire an edge from), url (optional), method (optional), headers (optional object).',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addSystemTask(
          str(A(args, 'processId')),
          {
            name: str(A(args, 'name')),
            description: str(A(args, 'description')) || undefined,
            group: str(A(args, 'group')) || undefined,
            after_task: str(A(args, 'after_task')) || undefined,
            url: str(A(args, 'url')) || undefined,
            method: str(A(args, 'method')) || undefined,
            headers: (A(args, 'headers') as Record<string, string>) ?? undefined,
          },
          token,
        ),
    },
    {
      name: 'add_task',
      description:
        'Add a task to the process design (Diagram tab). Default type HUMAN (group = the Keycloak role ' +
        'that executes it); type START or END for lifecycle tasks (no group). ' +
        'after_task optionally wires an edge from that task to the new one. ' +
        'args: processId, name, group (required for HUMAN), description?, after_task?, type? (HUMAN|START|END).',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addTask(
          str(A(args, 'processId')),
          {
            name: str(A(args, 'name')),
            group: str(A(args, 'group')),
            description: str(A(args, 'description')) || undefined,
            after_task: str(A(args, 'after_task')) || undefined,
            type: str(A(args, 'type')) || undefined,
          },
          token,
        ),
    },
    {
      name: 'add_edge',
      description:
        'Connect two EXISTING tasks with a topology edge (Diagram tab). condition defaults to "always"; ' +
        'fork: true marks a parallel branch (fork branches need a join). ' +
        'args: processId, from, to, condition?, fork?.',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addEdge(
          str(A(args, 'processId')),
          {
            from: str(A(args, 'from')),
            to: str(A(args, 'to')),
            condition: str(A(args, 'condition')) || undefined,
            fork: A(args, 'fork') === undefined ? undefined : bool(A(args, 'fork')),
          },
          token,
        ),
    },
    {
      name: 'set_task_config',
      description:
        'The "configure later" path: set/update the HTTP configuration (url, method, headers object) of an ' +
        'existing system task created without configuration.',
      needsConfirmation: true,
      run: (args, token) =>
        ds.setTaskConfig(
          str(A(args, 'processId')),
          str(A(args, 'task')),
          {
            url: str(A(args, 'url')),
            method: str(A(args, 'method')) || undefined,
            headers: (A(args, 'headers') as Record<string, string>) ?? undefined,
          },
          token,
        ),
    },
    {
      name: 'add_search_item',
      description:
        'Add a localized label (en/fr/ar) to the process search-item catalog. ' +
        'fieldType: menu_item (app menu label, fieldName = menu key), tab (form tab title), ' +
        'field_label (label for a form/process-data field, fieldName = $-prefixed field name; labels only — field values are never touched). ' +
        'roleId "app" = process-level catalog (recommended); otherwise a specific role id.',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addSearchItem(
          str(A(args, 'processId')),
          str(A(args, 'roleId')) || 'app',
          {
            fieldName: str(A(args, 'fieldName')),
            fieldType: str(A(args, 'fieldType')),
            fieldLabelEn: str(A(args, 'fieldLabelEn')) || undefined,
            fieldLabelFr: str(A(args, 'fieldLabelFr')) || undefined,
            fieldLabelAr: str(A(args, 'fieldLabelAr')) || undefined,
          },
          token,
        ),
    },
    {
      name: 'delete_search_item',
      description: 'Remove a label from the process search-item catalog (roleId "app" = process-level catalog)',
      needsConfirmation: true,
      run: (args, token) =>
        ds.deleteProcessSearchItem(str(A(args, 'processId')), str(A(args, 'fieldName')), token),
    },
    {
      name: 'set_ai_params',
      description: 'Set the process AI parameters (model, embedding model)',
      needsConfirmation: true,
      run: (args, token) =>
        ds.setAiParams(
          {
            processId: str(A(args, 'processId')),
            model: str(A(args, 'model')),
            embeddingModel: str(A(args, 'embeddingModel')) || undefined,
            processDesc: str(A(args, 'processDesc')) || undefined,
          },
          token,
        ),
    },
    {
      name: 'add_template',
      description: 'Add a (print) template to a process',
      needsConfirmation: true,
      run: (args, token) =>
        ds.addTemplate(
          {
            processId: str(A(args, 'processId')),
            templateId: str(A(args, 'templateId')),
            name: str(A(args, 'name')),
            templateType: str(A(args, 'templateType')) || undefined,
            allowedGroups: Array.isArray(A(args, 'allowedGroups'))
              ? (A(args, 'allowedGroups') as string[])
              : undefined,
            allowedSteps: Array.isArray(A(args, 'allowedSteps'))
              ? (A(args, 'allowedSteps') as string[])
              : undefined,
            jsonTemplate: A(args, 'jsonTemplate') ?? {},
          },
          token,
        ),
    },
    {
      name: 'save_design',
      description: 'Save the workflow engine design (tasks + topology) as a NEW version, BPMN-validated server-side',
      needsConfirmation: true,
      run: (args, token) =>
        ds.saveDesign(str(A(args, 'processId')), str(A(args, 'yaml')), token),
    },
    {
      name: 'list_design_versions',
      description: 'Saved design versions (newest first) with status',
      needsConfirmation: false,
      run: (args, token) => ds.listDesignVersions(str(A(args, 'processId')), token),
    },
    {
      name: 'get_design_version',
      description: 'The full saved design of one version (0 = active) — read-only',
      needsConfirmation: false,
      run: (args, token) =>
        ds.getDesign(
          str(A(args, 'processId')),
          typeof A(args, 'version') === 'number' ? (A(args, 'version') as number) : 0,
          token,
        ),
    },
  ];
}
