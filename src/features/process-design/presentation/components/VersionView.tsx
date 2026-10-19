import { useTranslation } from 'react-i18next';

type Json = Record<string, unknown>;

/**
 * Read-only view of one deployed design version (engine + app section).
 *
 * Old versions are IMMUTABLE: this panel only renders — it exposes no edit
 * controls. It is the single source for the "view version" mode: when a
 * version is selected for viewing, every process tab renders the matching
 * section of this component (so the whole workspace reflects that version).
 *
 * Tolerates both stored encodings: tasks as a LIST of {task_id,…} or as a
 * MAP keyed by task name, and form steps using `form_fields` or `fields`.
 */
export function VersionView({ design, section = 'all' }: { design: Json; section?: 'all' | 'design' | 'overview' | 'forms' | 'roles' | 'search' | 'tools' }) {
  const { t } = useTranslation();

  // tasks: list OR map keyed by task name
  const tasks: Json[] = (() => {
    const raw = design.tasks;
    if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object') as Json[];
    if (raw && typeof raw === 'object') {
      return Object.entries(raw as Record<string, Json>).map(([name, cfg]) => ({ ...(cfg ?? {}), task_id: (cfg?.task_id as string) ?? name }));
    }
    return [];
  })();
  const topology = ((design.topology ?? []) as Json[]).filter((x) => x && typeof x === 'object');
  const app = (design.app ?? {}) as Json;
  const steps = ((((app.forms ?? {}) as Json).steps ?? []) as Json[]).filter((x) => x && typeof x === 'object');
  const roles = ((app.roles ?? []) as Json[]).filter((x) => x && typeof x === 'object');
  const searchItems = ((app.search_items ?? []) as Json[]).filter((x) => x && typeof x === 'object');
  const toolTasks = tasks.filter((tk) => String(tk.type ?? '') === 'SYSTEM');

  const show = (s: string) => section === 'all' || section === s;

  return (
    <div className="space-y-4 text-(--app-fs-small)">
      {show('overview') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewOverview')}</h4>
          <div className="space-y-0.5">
            <div><span className="text-muted">{t('versionViewName')}:</span> <span className="font-medium">{String(app.name ?? design.id ?? '')}</span></div>
            <div><span className="text-muted">{t('versionViewDescription')}:</span> <span className="text-muted">{String(app.process_description ?? design.description ?? '—')}</span></div>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded bg-surface px-1.5 py-0.5 text-muted">{t('designMetaLaunchable')}: {app.can_be_launched === true ? t('yes') : t('no')}</span>
              {app.process_launch_role_id ? <span className="rounded bg-surface px-1.5 py-0.5 text-muted">{t('designMetaLaunchRole')}: {String(app.process_launch_role_id)}</span> : null}
              {app.ai && (app.ai as Json).model ? <span className="rounded bg-surface px-1.5 py-0.5 text-muted">AI: {String((app.ai as Json).model)}</span> : null}
            </div>
          </div>
        </section>
      )}

      {show('design') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewTasks')}</h4>
          {tasks.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <div className="overflow-x-auto rounded-(--app-radius) border border-separator">
              <table className="w-full text-left">
                <thead className="border-b border-separator bg-surface text-muted">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">{t('versionViewColTask')}</th>
                    <th className="px-3 py-1.5 font-medium">{t('versionViewColType')}</th>
                    <th className="px-3 py-1.5 font-medium">{t('versionViewColGroup')}</th>
                    <th className="px-3 py-1.5 font-medium">{t('versionViewColDescription')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((tk) => (
                    <tr key={String(tk.task_id)} className="border-b border-separator/50 last:border-0">
                      <td className="px-3 py-1.5 font-mono">{String(tk.task_id ?? '')}</td>
                      <td className="px-3 py-1.5 uppercase">{String(tk.type ?? '')}</td>
                      <td className="px-3 py-1.5">{String(tk.group ?? '')}</td>
                      <td className="px-3 py-1.5 text-muted">{String(tk.description ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {show('design') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewTopology')}</h4>
          {topology.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <ul className="space-y-0.5 font-mono">
              {topology.map((e, i) => {
                const from = (e.join_from as string[])?.join('+') ?? String(e.from ?? '');
                const cond = e.condition ? `  [${String(e.condition)}]` : '';
                const flags = [e.fork ? 'fork' : '', e.join ? `join:${String(e.join)}` : ''].filter(Boolean).join(' ');
                return (
                  <li key={i}>
                    {from} → {String(e.to ?? '')}
                    {cond}
                    {flags ? <span className="ml-2 text-muted">{flags}</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {show('forms') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewSteps')}</h4>
          {steps.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <ul className="space-y-0.5">
              {steps.map((st) => {
                const fields = ((st.form_fields ?? st.fields ?? []) as Json[]);
                return (
                  <li key={String(st.step_id)}>
                    <span className="font-mono">{String(st.step_id ?? '')}</span>
                    {st.launchable === true ? <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-muted">{t('versionViewInitial')}</span> : null}
                    <span className="ml-2 text-muted">
                      {t('versionViewFields')}: {fields.map((f) => String(f.field_name ?? f.name ?? '')).join(', ') || '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {show('roles') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewRoles')}</h4>
          {roles.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <ul className="space-y-1">
              {roles.map((rl) => (
                <li key={String(rl.role_id)}>
                  <span className="font-semibold">{String(rl.role_id ?? '')}</span>
                  {rl.can_launch === true ? <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-muted">{t('versionViewLaunch')}</span> : null}
                  <span className="ml-2 text-muted">
                    {t('versionViewTasks')}: {((rl.role_tasks ?? []) as Json[]).map((rt) => String(rt.task_name ?? '')).join(', ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {show('search') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewSearchItems')}</h4>
          {searchItems.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <ul className="space-y-0.5">
              {searchItems.map((si, i) => (
                <li key={i}>
                  <span className="font-mono">{String(si.field_name ?? '')}</span>
                  <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-muted">{String(si.field_type ?? '')}</span>
                  <span className="ml-2 text-muted">{String(si.field_label_en ?? '')} / {String(si.field_label_fr ?? '')} / {String(si.field_label_ar ?? '')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {show('tools') && (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewTools')}</h4>
          {toolTasks.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <div className="overflow-x-auto rounded-(--app-radius) border border-separator">
              <table className="w-full text-left">
                <thead className="border-b border-separator bg-surface text-muted">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">{t('versionViewColTask')}</th>
                    <th className="px-3 py-1.5 font-medium">{t('versionViewToolCol')}</th>
                    <th className="px-3 py-1.5 font-medium">URL</th>
                    <th className="px-3 py-1.5 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {toolTasks.map((tk) => (
                    <tr key={String(tk.task_id)} className="border-b border-separator/50 last:border-0">
                      <td className="px-3 py-1.5 font-mono">{String(tk.task_id ?? '')}</td>
                      <td className="px-3 py-1.5">{String(tk.tool ?? '—')}</td>
                      <td className="px-3 py-1.5 font-mono text-muted">{String(tk.url ?? '—')}</td>
                      <td className="px-3 py-1.5 uppercase">{String(tk.method ?? 'POST')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
