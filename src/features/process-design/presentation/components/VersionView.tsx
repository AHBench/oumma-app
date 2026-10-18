import { useTranslation } from 'react-i18next';

type Json = Record<string, unknown>;

/**
 * Read-only view of one deployed design version (engine + app section).
 * Old versions are immutable — this panel only renders, it exposes no
 * edit controls. Only the active version is editable (through the other
 * designer tabs, which always write the live/working document).
 */
export function VersionView({ design }: { design: Json }) {
  const { t } = useTranslation();
  const tasks = ((design.tasks ?? []) as Json[]).filter((x) => x && typeof x === 'object');
  const topology = ((design.topology ?? []) as Json[]).filter((x) => x && typeof x === 'object');
  const app = (design.app ?? {}) as Json;
  const steps = ((((app.forms ?? {}) as Json).steps ?? []) as Json[]);
  const roles = ((app.roles ?? []) as Json[]);
  const searchItems = ((app.search_items ?? []) as Json[]);

  return (
    <div className="space-y-4 text-(--app-fs-small)">
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

      <section>
        <h4 className="mb-1 font-semibold">{t('versionViewSteps')}</h4>
        {steps.length === 0 ? (
          <p className="text-muted">—</p>
        ) : (
          <ul className="space-y-0.5">
            {steps.map((st) => (
              <li key={String(st.step_id)}>
                <span className="font-mono">{String(st.step_id ?? '')}</span>
                {st.launchable === true ? <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-muted">{t('versionViewInitial')}</span> : null}
                <span className="ml-2 text-muted">
                  {t('versionViewFields')}: {((st.form_fields ?? []) as Json[]).map((f) => String(f.field_name ?? '')).join(', ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      {searchItems.length > 0 ? (
        <section>
          <h4 className="mb-1 font-semibold">{t('versionViewSearchItems')}</h4>
          <ul className="space-y-0.5">
            {searchItems.map((si, i) => (
              <li key={i}>
                <span className="font-mono">{String(si.field_name ?? '')}</span>
                <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-muted">{String(si.field_type ?? '')}</span>
                <span className="ml-2 text-muted">{String(si.field_label_en ?? '')} / {String(si.field_label_fr ?? '')} / {String(si.field_label_ar ?? '')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
