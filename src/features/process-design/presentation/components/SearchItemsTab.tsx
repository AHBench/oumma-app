import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { getDependencies } from '../../../../core/di';
import { getErrorMessage } from '../../../../core/http/client';

type Json = Record<string, unknown>;

// Labels only — never field values. Process-data fields use field_label.
const KINDS = ['menu_item', 'tab', 'field_label'] as const;

/**
 * Search items — the process-level label catalog: localized (EN/FR/AR)
 * labels for app menu items, form tab titles, process-data fields and form
 * field labels. The app resolves every UI label through this catalog first.
 */
export function SearchItemsTab({ processId, onSaved, readOnly = false, staticItems }: { processId: string; onSaved: () => void; /** Read-only mode (viewing an old design version). */ readOnly?: boolean; /** Override the item list (version view). When omitted, fetched live. */ staticItems?: Json[] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const token = user?.accessToken ?? '';
  const ds = getDependencies().designDataSource;

  const [items, setItems] = useState<Json[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('field_label');
  const [en, setEn] = useState('');
  const [fr, setFr] = useState('');
  const [ar, setAr] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The item being edited (its field_name). The name/kind are locked while
  // editing — only the three localized labels can be changed.
  const [editing, setEditing] = useState<string | null>(null);

  const startEdit = (item: Json) => {
    setEditing(String(item.fieldName));
    setName(String(item.fieldName));
    setKind(String(item.fieldType));
    setEn(String(item.fieldLabel_en ?? ''));
    setFr(String(item.fieldLabel_fr ?? ''));
    setAr(String(item.fieldLabel_ar ?? ''));
    setStatus(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setName('');
    setKind('field_label');
    setEn('');
    setFr('');
    setAr('');
    setStatus(null);
  };

  const load = useCallback(async () => {
    try {
      setItems(await ds.listProcessSearchItems(processId, token));
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    }
  }, [processId, token, ds]);

  useEffect(() => {
    if (staticItems == null) void load();
    else setItems(staticItems);
  }, [load, staticItems]);

  const upsert = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      // New items fall back to the name for empty labels; edits keep the
      // typed values verbatim (an empty label stays empty).
      const fallback = editing ? '' : name.trim();
      const res = (await ds.addSearchItem(processId, 'app', {
        fieldName: name.trim(),
        fieldType: kind,
        fieldLabelEn: en || fallback,
        fieldLabelFr: fr || fallback,
        fieldLabelAr: ar || fallback,
      }, token)) as Json;
      if (res?.status === 'error') {
        setStatus({ kind: 'err', text: String(res.message ?? 'error') });
      } else {
        setStatus({ kind: 'ok', text: t('searchItemsSaved') });
        setEditing(null);
        setName('');
        setKind('field_label');
        setEn('');
        setFr('');
        setAr('');
        await load();
        onSaved();
      }
    } catch (e) {
      setStatus({ kind: 'err', text: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (fieldName: string) => {
    if (!confirm(t('searchItemsDeleteConfirm'))) return;
    try {
      await ds.deleteProcessSearchItem(processId, fieldName, token);
      await load();
      onSaved();
    } catch (e) {
      setStatus({ kind: 'err', text: getErrorMessage(e) });
    }
  };

  return (
    <div className="space-y-4">
      <fieldset disabled={readOnly} className="contents">
      <div className="rounded-(--app-radius) border border-separator p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={editing != null}
            placeholder={t('searchItemsNamePlaceholder')}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground disabled:opacity-50"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={editing != null}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground disabled:opacity-50"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`searchItemsKind${k.charAt(0).toUpperCase()}${k.slice(1)}`)}
              </option>
            ))}
          </select>
          <input
            value={en}
            onChange={(e) => setEn(e.target.value)}
            placeholder={t('searchItemsEn')}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground"
          />
          <input
            value={fr}
            onChange={(e) => setFr(e.target.value)}
            placeholder={t('searchItemsFr')}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground"
          />
          <input
            value={ar}
            onChange={(e) => setAr(e.target.value)}
            placeholder={t('searchItemsAr')}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-small) text-foreground"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void upsert()}
              disabled={busy || !name.trim()}
              className="rounded-(--app-radius) bg-(--accent) px-3 py-1 text-(--app-fs-small) font-semibold text-white disabled:opacity-50"
            >
              {t('searchItemsSave')}
            </button>
            {editing != null ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-(--app-radius) border border-separator px-3 py-1 text-(--app-fs-small) hover:bg-surface"
              >
                {t('searchItemsCancel')}
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-(--app-fs-small) text-muted">{t('searchItemsHint')}</p>
        {status ? (
          <p className={`mt-2 text-(--app-fs-small) ${status.kind === 'ok' ? 'text-(--success, #4ade80)' : 'text-(--danger, #f87171)'}`}>
            {status.text}
          </p>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-(--app-radius) border border-separator">
          <table className="w-full text-left text-(--app-fs-small)">
            <thead className="border-b border-separator bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t('searchItemsColName')}</th>
                <th className="px-3 py-2 font-medium">{t('searchItemsColType')}</th>
                <th className="px-3 py-2 font-medium">EN</th>
                <th className="px-3 py-2 font-medium">FR</th>
                <th className="px-3 py-2 font-medium">AR</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${String(item.fieldType)}:${String(item.fieldName)}`} className="border-b border-separator/50 last:border-0">
                  <td className="px-3 py-2 font-mono">{String(item.fieldName)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-surface px-1.5 py-0.5 text-muted">{String(item.fieldType)}</span>
                  </td>
                  <td className="px-3 py-2">{String(item.fieldLabel_en ?? '')}</td>
                  <td className="px-3 py-2">{String(item.fieldLabel_fr ?? '')}</td>
                  <td className="px-3 py-2">{String(item.fieldLabel_ar ?? '')}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        disabled={editing != null}
                        className="rounded-(--app-radius) border border-separator px-2 py-0.5 text-(--app-fs-small) hover:bg-surface disabled:opacity-50"
                      >
                        {t('searchItemsEdit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(String(item.fieldName))}
                        disabled={editing != null}
                        className="rounded-(--app-radius) border border-separator px-2 py-0.5 text-(--app-fs-small) hover:bg-surface disabled:opacity-50"
                      >
                        {t('searchItemsDelete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center text-(--app-fs-small) text-muted">{t('searchItemsEmpty')}</p>
      )}
      </fieldset>
    </div>
  );
}
