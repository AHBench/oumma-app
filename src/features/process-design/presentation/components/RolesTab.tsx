import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OummaDesignDataSource } from '../../data/datasources/oumma-design-datasource';

type Json = Record<string, unknown>;

/**
 * Roles & Permissions (designer tab) — replaces the manual
 * setparams/add-roles-*.sh scripts:
 *  - "Sync roles from process tasks" derives one role per HUMAN-task group
 *    from the engine design (POST design/{pid}/sync-roles)
 *  - every permission per role is editable and saved via the upsert
 *    (POST /api/management/add-role/{pid} replaces by role_id)
 */
const DOC_PERMS = ['read', 'view', 'write', 'share', 'delete'] as const;
const ACTION_GROUPS: Record<string, string[]> = {
  attachment: ['read', 'write', 'update', 'delete'],
  comment: ['read', 'write', 'update', 'delete'],
  action: ['skip', 'Complete', 'Claim', 'Release', 'Complete by manager'],
};

type RoleDTO = {
  role_id: string;
  role_name: string;
  apply_dept_filter?: boolean;
  role_can_launch?: boolean | null;
  can_edit_initial_form?: boolean | null;
  doc_roles?: { role_id: string; role_name: string; doc_permissions: { id: string; permission: boolean }[] }[];
  role_tasks?: {
    task_name: string;
    task_actions?: { action_group: string; action_items: { action_name: string; action_value: boolean | null }[] }[];
  }[];
  view_access_roles?: string[];
};

export function RolesTab(args: {
  processId: string;
  token: string;
  ds: OummaDesignDataSource;
  roles: Json[];
  onSaved(): void;
  /** Read-only mode (viewing an old design version). */
  readOnly?: boolean;
}) {
  const { processId, token, ds, roles, onSaved, readOnly = false } = args;
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RoleDTO>>({});

  const all = roles as RoleDTO[];
  const draftOf = (r: RoleDTO): RoleDTO => drafts[r.role_id] ?? (r as RoleDTO);

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await ds.syncRoles(processId, token);
      setMessage(`${t('rolesSynced')}: ${(res.roles as string[]).join(', ')}`);
      onSaved();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function saveRole(roleId: string) {
    const draft = drafts[roleId];
    if (!draft) return;
    setSaving(roleId);
    setMessage(null);
    try {
      await ds.upsertRole(processId, draft as unknown as Json, token);
      setMessage(`${t('rolesSaved')}: ${roleId}`);
      onSaved();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(null);
    }
  }

  function patch(roleId: string, fn: (r: RoleDTO) => void) {
    setDrafts((d) => {
      const cur = (d[roleId] ?? draftOf(all.find((x) => x.role_id === roleId)!)) as RoleDTO;
      const copy = JSON.parse(JSON.stringify(cur)) as RoleDTO;
      fn(copy);
      return { ...d, [roleId]: copy };
    });
  }

  return (
    <div className="space-y-3">
      {!readOnly ? (
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void sync()} disabled={syncing}
          className="rounded-(--app-radius) bg-(--accent) px-3 py-1.5 text-(--app-fs-small) font-semibold text-white disabled:opacity-50">
          {syncing ? t('rolesSyncing') : t('rolesSyncFromTasks')}
        </button>
        {message ? <span className="text-(--app-fs-small) text-muted">{message}</span> : null}
      </div>
      ) : null}

      {all.length === 0 ? (
        <div className="rounded-(--app-radius) border border-dashed border-separator p-4 text-center text-(--app-fs-small) text-muted">
          {t('rolesEmpty')}
        </div>
      ) : (
        all.map((role) => {
          const d = draftOf(role);
          const dirty = Boolean(drafts[role.role_id]);
          return (
            <div key={role.role_id} className="rounded-(--app-radius) border border-separator p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-(--app-fs-base) font-semibold">
                  {d.role_name}
                  <span className="ms-2 text-(--app-fs-small) font-normal text-muted">({d.role_id})</span>
                </span>
                {!readOnly ? (
                <button type="button" onClick={() => void saveRole(role.role_id)}
                  disabled={saving === role.role_id || !dirty}
                  className="rounded-(--app-radius) border border-separator px-3 py-1 text-(--app-fs-small) hover:bg-surface disabled:opacity-40">
                  {saving === role.role_id ? t('rolesSaving') : t('rolesSave')}
                </button>
                ) : null}
              </div>

              <div className="mb-3 flex flex-wrap gap-4 text-(--app-fs-small)">
                <Check label={t('rolesCanLaunch')} checked={d.role_can_launch === true} disabled={readOnly}
                  onChange={(v) => patch(role.role_id, (r) => { r.role_can_launch = v; })} />
                <Check label={t('rolesEditInitialForm')} checked={d.can_edit_initial_form === true} disabled={readOnly}
                  onChange={(v) => patch(role.role_id, (r) => { r.can_edit_initial_form = v; })} />
                <Check label={t('rolesDeptFilter')} checked={d.apply_dept_filter !== false} disabled={readOnly}
                  onChange={(v) => patch(role.role_id, (r) => { r.apply_dept_filter = v; })} />
              </div>

              {/* Per-task action permissions */}
              <div className="mb-3">
                <div className="mb-1 text-(--app-fs-small) font-semibold text-muted">{t('rolesTaskActions')}</div>
                {(d.role_tasks ?? []).map((task) => (
                  <div key={task.task_name} className="mb-2 rounded border border-separator p-2">
                    <div className="mb-1 text-(--app-fs-small) font-medium">{task.task_name}</div>
                    {(Object.keys(ACTION_GROUPS)).map((group) => {
                      const ga = (task.task_actions ?? []).find((a) => a.action_group === group);
                      return (
                        <div key={group} className="flex flex-wrap items-center gap-3 py-0.5 text-(--app-fs-small)">
                          <span className="w-20 text-muted">{group}</span>
                          {ACTION_GROUPS[group].map((action) => {
                            const item = (ga?.action_items ?? []).find((i) => i.action_name === action);
                            return (
                              <Check key={action} label={action} disabled={readOnly} checked={item?.action_value === true}
                                onChange={(v) => patch(role.role_id, (r) => {
                                  const rt = (r.role_tasks ?? []).find((x) => x.task_name === task.task_name);
                                  if (!rt) return;
                                  let ag = (rt.task_actions ?? []).find((a) => a.action_group === group);
                                  if (!ag) {
                                    ag = { action_group: group, action_items: [] };
                                    rt.task_actions = [...(rt.task_actions ?? []), ag];
                                  }
                                  const it = ag.action_items.find((i) => i.action_name === action);
                                  if (it) it.action_value = v;
                                  else ag.action_items.push({ action_name: action, action_value: v });
                                })} />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {(d.role_tasks ?? []).length === 0 ? (
                  <div className="text-(--app-fs-small) text-muted">{t('rolesNoTasks')}</div>
                ) : null}
              </div>

              {/* Document permissions per other role */}
              <div className="mb-3">
                <div className="mb-1 text-(--app-fs-small) font-semibold text-muted">{t('rolesDocPerms')}</div>
                {(d.doc_roles ?? []).map((dr) => (
                  <div key={dr.role_id} className="flex flex-wrap items-center gap-3 py-0.5 text-(--app-fs-small)">
                    <span className="w-28 truncate text-muted">{dr.role_id}</span>
                    {DOC_PERMS.map((p) => {
                      const item = (dr.doc_permissions ?? []).find((x) => x.id === p);
                      return (
                        <Check key={p} label={p} disabled={readOnly} checked={item?.permission === true}
                          onChange={(v) => patch(role.role_id, (r) => {
                            const x = (r.doc_roles ?? []).find((y) => y.role_id === dr.role_id);
                            if (!x) return;
                            const perm = (x.doc_permissions ?? []).find((y) => y.id === p);
                            if (perm) perm.permission = v;
                            else x.doc_permissions = [...(x.doc_permissions ?? []), { id: p, permission: v }];
                          })} />
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* View access */}
              <div>
                <div className="mb-1 text-(--app-fs-small) font-semibold text-muted">{t('rolesViewAccess')}</div>
                <div className="flex flex-wrap gap-3 text-(--app-fs-small)">
                  {all.filter((r) => r.role_id !== role.role_id).map((r) => (
                    <Check key={r.role_id} label={r.role_id}
                      disabled={readOnly} checked={(d.view_access_roles ?? []).includes(r.role_id)}
                      onChange={(v) => patch(role.role_id, (x) => {
                        const cur = new Set(x.view_access_roles ?? []);
                        if (v) cur.add(r.role_id); else cur.delete(r.role_id);
                        x.view_access_roles = [...cur];
                      })} />
                  ))}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Check(args: { label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" disabled={args.disabled} checked={args.checked} onChange={(e) => args.onChange(e.target.checked)} />
      <span>{args.label}</span>
    </label>
  );
}
