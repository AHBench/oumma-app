import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { getDependencies } from '../../../../core/di';
import { getErrorMessage } from '../../../../core/http/client';

type Json = Record<string, unknown>;

type ToolSpec = {
  key: string;
  name: string;
  provider: string;
  description: string;
  config: { key: string; label: string; required: boolean; secret?: boolean; placeholder?: string; options?: string[] }[];
};

/**
 * Tools tab — the designer's MCP-like tool set (Gmail, Telegram, WhatsApp,
 * generic HTTP). Tools are added as SYSTEM tasks: the engine executes them
 * automatically when reached, resolving the mapped inputs from the process
 * context — deterministically, with zero LLM tokens.
 */
export function ToolsTab({
  processId,
  tasks,
  onSaved,
  readOnly = false,
}: {
  processId: string;
  tasks: Json[];
  onSaved: () => void;
  /** Read-only mode (viewing an old design version). */
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const token = user?.accessToken ?? '';
  const ds = getDependencies().designDataSource;

  const [catalog, setCatalog] = useState<ToolSpec[]>([]);
  const [catError, setCatError] = useState('');

  // Add form state
  const [name, setName] = useState('');
  const [toolKey, setToolKey] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<{ param: string; ctxKey: string }[]>([]);
  const [afterTask, setAfterTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    ds.getToolCatalog(token)
      .then((tools) => { if (live) setCatalog(tools as ToolSpec[]); })
      .catch((e) => { if (live) setCatError(e instanceof Error ? e.message : getErrorMessage(e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selected = catalog.find((x) => x.key === toolKey) ?? null;
  // The task's own tool tasks (system tasks carrying a tool config).
  const taskName = (x: Json) => String(x.task_id ?? x.id ?? '');
  const toolTasks = tasks.filter((x) => {
    const cfg = x.config as Json | undefined;
    return cfg && typeof cfg === 'object' && !Array.isArray(cfg) && Boolean(cfg.tool);
  });
  // Plain system tasks (HTTP executor) — including unconfigured ones that
  // were added from chat "to be configured later".
  const systemTasks = tasks.filter((x) => {
    if (String(x.type) !== 'SYSTEM') return false;
    const cfg = x.config as Json | undefined;
    return !(cfg && typeof cfg === 'object' && !Array.isArray(cfg) && Boolean(cfg.tool));
  });
  // Inline "configure later" editor state (one task at a time).
  const [editingSys, setEditingSys] = useState<string | null>(null);
  const [sysMethod, setSysMethod] = useState('POST');
  const [sysUrl, setSysUrl] = useState('');
  const [sysHeaders, setSysHeaders] = useState('');
  const openSysEditor = (t: Json) => {
    const name = taskName(t);
    setEditingSys(name);
    const cfg = (t.config ?? {}) as Json;
    setSysMethod(String(cfg.method ?? 'POST'));
    setSysUrl(String(cfg.url ?? ''));
    const h = (cfg.headers ?? {}) as Record<string, string>;
    setSysHeaders(Object.keys(h).length ? JSON.stringify(h, null, 1) : '');
  };
  const saveSysConfig = async (name: string) => {
    let headers: Record<string, string> | undefined;
    if (sysHeaders.trim()) {
      try {
        const p = JSON.parse(sysHeaders);
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          headers = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
        }
      } catch {
        setStatus({ kind: 'err', text: t('sysHeadersInvalidJson') });
        return;
      }
    }
    try {
      await ds.setTaskConfig(processId, name, { url: sysUrl.trim(), method: sysMethod, headers }, token);
      setStatus({ kind: 'ok', text: t('sysConfigSaved') });
      setEditingSys(null);
      onSaved();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : getErrorMessage(e) });
    }
  };

  const pickTool = (key: string) => {
    setToolKey(key);
    const spec = catalog.find((x) => x.key === key);
    setConfig({});
    // Default input params per provider.
    const params: Record<string, string[]> = {
      gmail: ['to', 'subject', 'body'],
      telegram: ['message'],
      whatsapp: ['to', 'message'],
      http: ['body'],
    };
    setInputs(((spec?.provider && params[spec.provider]) || []).map((p) => ({ param: p, ctxKey: '' })));
  };

  const submit = async () => {
    if (!selected || !name.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await ds.addToolTask(
        processId,
        {
          name: name.trim(),
          tool: selected.key,
          tool_config: config,
          tool_inputs: Object.fromEntries(inputs.filter((i) => i.param && i.ctxKey).map((i) => [i.param, i.ctxKey])),
          after_task: afterTask || undefined,
        },
        token,
      );
      setStatus({ kind: 'ok', text: String((res as Json).message ?? t('toolAdded')) });
      setName('');
      setToolKey('');
      setConfig({});
      setInputs([]);
      setAfterTask('');
      onSaved();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'h-8 w-full rounded-(--app-radius) border border-separator bg-surface px-2 text-(--app-fs-small)';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <fieldset disabled={readOnly} className="contents">
      {/* Existing tool tasks */}
      <div className="rounded-(--app-radius) border border-separator p-3">
        <div className="text-(--app-fs-small) font-semibold">{t('toolTasks')}</div>
        {toolTasks.length === 0 ? (
          <div className="mt-1 text-(--app-fs-small) text-muted">{t('toolTasksEmpty')}</div>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {toolTasks.map((tt) => {
              const cfg = tt.config as Json;
              const ti = (cfg.tool_inputs ?? {}) as Record<string, string>;
              return (
                <div key={taskName(tt)} className="flex flex-wrap items-center gap-2 text-(--app-fs-small)">
                  <span className="font-medium">{taskName(tt)}</span>
                  <span className="rounded-(--app-radius) bg-(--accent)/10 px-1.5 py-0.5 text-(--accent)">{String(cfg.tool)}</span>
                  <span className="text-muted">
                    {Object.entries(ti).map(([p, k]) => `${p} ← ${k}`).join(', ')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Existing system tasks (HTTP executor) — incl. unconfigured ones
          added from chat to be configured later. */}
      <div className="rounded-(--app-radius) border border-separator p-3">
        <div className="text-(--app-fs-small) font-semibold">{t('systemTasks')}</div>
        {systemTasks.length === 0 ? (
          <div className="mt-1 text-(--app-fs-small) text-muted">{t('systemTasksEmpty')}</div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {systemTasks.map((st) => {
              const name = taskName(st);
              const cfg = (st.config ?? {}) as Json;
              const hasUrl = Boolean(cfg.url);
              return (
                <div key={name} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-(--app-fs-small)">
                    <span className="font-medium">{name}</span>
                    <span className={`rounded-(--app-radius) px-1.5 py-0.5 ${hasUrl ? 'bg-(--accent)/10 text-(--accent)' : 'bg-amber-500/15 text-amber-600'}`}>
                      {hasUrl ? `${String(cfg.method ?? 'POST')} ${String(cfg.url)}` : t('sysUnconfigured')}
                    </span>
                    <button
                      type="button"
                      onClick={() => (editingSys === name ? setEditingSys(null) : openSysEditor(st))}
                      className="ms-auto text-(--app-fs-small) text-(--accent) hover:underline"
                    >
                      {editingSys === name ? t('cancel') : hasUrl ? t('edit') : t('sysConfigure')}
                    </button>
                  </div>
                  {editingSys === name ? (
                    <div className="flex flex-col gap-2 rounded-(--app-radius) bg-surface-secondary p-2">
                      <div className="flex gap-2">
                        <select className={`${inputCls} w-28`} value={sysMethod} onChange={(e) => setSysMethod(e.target.value)}>
                          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
                        </select>
                        <input className={inputCls} value={sysUrl} placeholder="https://api.example.com/hook" onChange={(e) => setSysUrl(e.target.value)} />
                      </div>
                      <textarea
                        className="w-full rounded-(--app-radius) border border-separator bg-surface p-2 text-(--app-fs-small)"
                        rows={2}
                        value={sysHeaders}
                        placeholder='{"X-Api-Key": "…"}'
                        onChange={(e) => setSysHeaders(e.target.value)}
                      />
                      <div>
                        <button
                          type="button"
                          disabled={!sysUrl.trim()}
                          onClick={() => void saveSysConfig(name)}
                          className="h-8 rounded-(--app-radius) bg-(--accent) px-3 text-(--app-fs-small) font-medium text-white disabled:opacity-40"
                        >
                          {t('save')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add a tool task */}
      <div className="rounded-(--app-radius) border border-separator p-3">
        <div className="text-(--app-fs-small) font-semibold">{t('toolAddTask')}</div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
            {t('toolTaskName')}
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Send Notification Email" />
          </label>
          <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
            {t('toolPick')}
            <select className={inputCls} value={toolKey} onChange={(e) => pickTool(e.target.value)}>
              <option value="">—</option>
              {catalog.map((x) => (
                <option key={x.key} value={x.key}>{x.name}</option>
              ))}
            </select>
          </label>
        </div>
        {catError ? <div className="mt-2 text-(--app-fs-small) text-red-600">{catError}</div> : null}

        {selected ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="text-(--app-fs-small) text-muted">{selected.description}</div>
            {/* Tool configuration (auto form from the catalog spec) */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {selected.config.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
                  {f.label}{f.required ? ' *' : ''}
                  {f.options?.length ? (
                    <select className={inputCls} value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}>
                      <option value="">—</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      className={inputCls}
                      type={f.secret ? 'password' : 'text'}
                      value={config[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            {/* Input mapping: tool parameter <- process-context field */}
            <div>
              <div className="text-(--app-fs-small) font-medium text-muted">{t('toolInputs')}</div>
              <div className="mt-1 flex flex-col gap-1">
                {inputs.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-(--app-fs-small)">{row.param}</span>
                    <span className="text-(--app-fs-small) text-muted">←</span>
                    <input
                      className={inputCls}
                      value={row.ctxKey}
                      placeholder="$email"
                      onChange={(e) => setInputs((rows) => rows.map((r, j) => (j === i ? { ...r, ctxKey: e.target.value } : r)))}
                    />
                  </div>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-(--app-fs-small) text-muted">
              {t('toolAfterTask')}
              <select className={inputCls} value={afterTask} onChange={(e) => setAfterTask(e.target.value)}>
                <option value="">—</option>
                {tasks.map((x) => (
                  <option key={taskName(x)} value={taskName(x)}>{taskName(x)}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={!selected || !name.trim() || busy}
            onClick={() => void submit()}
            className="h-8 rounded-(--app-radius) bg-(--accent) px-3 text-(--app-fs-small) font-medium text-white disabled:opacity-40"
          >
            {busy ? t('saving') : t('toolAdd')}
          </button>
          {status ? (
            <span className={`text-(--app-fs-small) ${status.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{status.text}</span>
          ) : null}
        </div>
      </div>
      </fieldset>
    </div>
  );
}
