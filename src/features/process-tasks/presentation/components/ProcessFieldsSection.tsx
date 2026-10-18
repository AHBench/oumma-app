import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../shared/components/ui';
import type { TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import {
  getDescValue,
  getLabelValue,
  hasDisplayableNestedItems,
  hasIdentifiedViewItem,
  isIdentifiedViewItem,
  tryParseJsonList,
  tryParseStringList,
} from './task-view-model';

type Json = Record<string, unknown>;

/**
 * Port of lib/features/process_tasks/presentation/widgets/process_fields_section.dart:
 * renders grouped task field rows (label + value), with date formatting,
 * "View (N)" dialogs for JSON lists and string lists.
 */
export function ProcessFieldsSection({
  groupedRows,
  viewItems,
  title,
  lang = 'fr',
}: {
  groupedRows: Record<string, { label: string; value: string }[]>;
  viewItems: TaskItemLabel[] | null;
  title: string;
  lang?: string;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<
    | { kind: 'json'; title: string; list: Json[]; parentKeys: Set<string> }
    | { kind: 'string'; title: string; values: string[] }
    | null
  >(null);

  const entries = Object.entries(groupedRows);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-(--app-radius) border border-separator bg-surface-secondary/50 p-6 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-8 w-8 text-muted/60">
          <path d="M4 5h16M4 10h16M4 15h10M4 20h7" strokeLinecap="round" />
        </svg>
        <p className="text-(--app-fs-base) text-muted">{t('noDetailFields')}</p>
      </div>
    );
  }

  // Parent rendered keys for the "View (N)" dialog column filtering
  // (port of the parentKeys built in the section's button handler).
  const parentKeys = new Set<string>();
  for (const rows of Object.values(groupedRows)) {
    for (const row of rows) {
      const label = row.label.trim().toLowerCase();
      if (label) {
        parentKeys.add(label);
        const matching = viewItems?.filter((v) => v.description.trim().toLowerCase() === label);
        if (matching && matching.length > 0) {
          const col = (matching[0].itemColumnName ?? '').trim().toLowerCase();
          if (col) parentKeys.add(col);
        }
      }
    }
  }

  const openJsonDialog = (title0: string, jsonList: Json[]) =>
    setDialog({ kind: 'json', title: title0, list: jsonList, parentKeys });

  return (
    <div className="rounded-(--app-radius) border border-separator bg-surface-secondary/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--accent)/10 text-(--accent)">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z" />
          </svg>
        </span>
        <h3 className="text-(--app-fs-base) font-semibold text-foreground">{title}</h3>
      </div>

      {entries.map(([key, rows]) => (
        <div key={key} className="space-y-1 border-t border-separator/70 py-1.5">
          {rows.map((item, i) => {
            const viewItemList = viewItems?.filter((v) => v.description === item.label) ?? [];
            const viewItem = viewItemList.length > 0 ? viewItemList[0] : null;
            const rawVal = item.value;
            let displayValue = rawVal ?? '';

            if (viewItem && viewItem.format === 'Date' && displayValue.length > 0) {
              const date = Date.parse(displayValue);
              if (!Number.isNaN(date)) {
                displayValue = formatDateTime(new Date(date), viewItem.formatString ?? 'dd/MM/yyyy HH:mm');
              }
            } else if (viewItem && viewItem.format?.toLowerCase() === 'string' && displayValue.startsWith('$')) {
              displayValue = '-';
            }

            const trimmed = displayValue.trim();
            if (trimmed === '' || trimmed === 'null' || trimmed === 'None') displayValue = '-';

            const jsonList = tryParseJsonList(displayValue !== '-' ? displayValue : '');
            const stringList = jsonList == null ? tryParseStringList(displayValue !== '-' ? displayValue : '') : null;

            const showInlineText =
              stringList == null &&
              (jsonList == null || !hasIdentifiedViewItem(jsonList, viewItems, lang));
            const showViewButton =
              stringList != null ||
              (jsonList != null && hasDisplayableNestedItems(jsonList, new Set<string>(), item.label ?? t('details'), viewItems));

            return (
              <div key={i} className="flex items-start gap-2 px-1">
                <span className="shrink-0 text-(--app-fs-base) font-bold text-foreground">
                  {item.label ?? ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-(--app-fs-base) text-muted">
                  {showInlineText ? displayValue : ''}
                </span>
                {showViewButton ? (
                  <button
                    onClick={() =>
                      stringList != null
                        ? setDialog({ kind: 'string', title: item.label ?? t('details'), values: stringList })
                        : openJsonDialog(item.label ?? t('details'), jsonList!)
                    }
                    className="button button--outline button--sm shrink-0"
                  >
                    {t('view')} ({stringList?.length ?? jsonList?.length ?? 0})
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {dialog?.kind === 'string' ? (
        <StringListDialog title={dialog.title} values={dialog.values} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'json' ? (
        <JsonListDialog
          title={dialog.title}
          jsonList={dialog.list}
          viewItems={viewItems}
          parentRenderedKeys={dialog.parentKeys}
          lang={lang}
          onOpenNested={(title0, list, parentKeys) =>
            setDialog({ kind: 'json', title: title0, list, parentKeys })
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------- string list dialog ---------------------------------- */

function StringListDialog({ title, values, onClose }: { title: string; values: string[]; onClose(): void }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <ul className="max-h-72 space-y-1 overflow-auto">
        {values.map((v, i) => (
          <li
            key={i}
            className="rounded-(--app-radius) border border-separator bg-surface px-2 py-1 text-(--app-fs-base) text-foreground"
          >
            {v}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ---------------------------------- JSON list dialog ---------------------------------- */

function JsonListDialog({
  title,
  jsonList,
  viewItems,
  parentRenderedKeys,
  onOpenNested,
  onClose,
  lang = 'fr',
}: {
  title: string;
  jsonList: Json[];
  viewItems: TaskItemLabel[] | null;
  parentRenderedKeys: Set<string>;
  onOpenNested(title: string, list: Json[], parentKeys: Set<string>): void;
  onClose(): void;
  lang?: string;
}) {
  const { t } = useTranslation();
  const hasFieldLabelAndDesc = jsonList.some((item) => getLabelValue(item, lang).length > 0);

  // Column resolution — port of the dialog's columnKeys logic:
  // union of keys, grouped by base name (lang suffix stripped), one column per
  // base (preferring the current language variant), filtered to identified
  // view items, excluding the title and already-rendered parent keys, sorted
  // by view item order.
  let columnKeys: string[] = [];
  if (!hasFieldLabelAndDesc && jsonList.length > 0) {
    const keysSet = new Set<string>();
    for (const map of jsonList) for (const k of Object.keys(map)) keysSet.add(k);
    const baseToKeys = new Map<string, string[]>();
    for (const key of keysSet) {
      let base = key;
      for (const suffix of ['_en', '_fr', '_ar', 'En', 'Fr', 'Ar']) {
        if (key.endsWith(suffix)) {
          base = key.slice(0, key.length - suffix.length);
          break;
        }
      }
      baseToKeys.set(base, [...(baseToKeys.get(base) ?? []), key]);
    }
    columnKeys = [...baseToKeys.entries()].map(([, variants]) => {
      if (variants.length === 1) return variants[0];
      const cap = lang[0]?.toUpperCase() + lang.slice(1);
      return variants.find((k) => k.endsWith(`_${lang}`) || k.endsWith(cap)) ?? variants[0];
    });
    columnKeys = columnKeys.filter((key) => {
      const normKey = key.trim().toLowerCase();
      const normTitle = title.trim().toLowerCase();
      if (viewItems && viewItems.length > 0 && !isIdentifiedViewItem(key, viewItems)) return false;
      if (normKey === normTitle) return false;
      if (parentRenderedKeys.has(normKey)) return false;
      return true;
    });
    if (viewItems && viewItems.length > 0) {
      const orderOf = (key: string) => viewItems.find((v) => v.itemColumnName === key)?.id ?? 999999;
      columnKeys.sort((a, b) => orderOf(a) - orderOf(b));
    }
  }

  const displayedList = hasFieldLabelAndDesc
    ? jsonList.filter((item) => {
        const labelVal = getLabelValue(item, lang);
        const normLabel = labelVal.trim().toLowerCase();
        const normTitle = title.trim().toLowerCase();
        if (normLabel.length > 0 && normLabel === normTitle) return false;
        if (parentRenderedKeys.has(normLabel)) return false;
        return true;
      })
    : jsonList;

  const labelHeader = t('fieldLabel');
  const descHeader = t('description');

  const nextParentKeys = new Set<string>(parentRenderedKeys);
  for (const k of columnKeys) nextParentKeys.add(k.trim().toLowerCase());

  const columnTitle = (key: string): string => {
    let t = key;
    const cap = lang[0]?.toUpperCase() + lang.slice(1);
    for (const suffix of [`_${lang}`, cap]) {
      if (t.endsWith(suffix)) {
        t = t.slice(0, t.length - suffix.length);
        break;
      }
    }
    if (viewItems) {
      for (const v of viewItems) {
        if (v.itemColumnName === key || v.itemColumnName === t || String(v.id) === key) {
          if (v.description.length > 0) return v.description;
        }
      }
    }
    return t;
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="mb-2 flex items-center justify-between">
        <span className="chip chip--sm chip--primary">
          <span className="chip__label">{t('itemsCount', { n: displayedList.length })}</span>
        </span>
      </div>

      {!hasFieldLabelAndDesc && columnKeys.length === 0 ? (
        <p className="py-6 text-center text-(--app-fs-base) text-muted">{t('noAdditionalDetails')}</p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-(--app-radius) border border-separator">
          <table className="w-full border-collapse text-start">
            <thead className="table__header sticky top-0">
              <tr>
                {(hasFieldLabelAndDesc ? [labelHeader, descHeader] : columnKeys.map(columnTitle)).map(
                  (h, i) => (
                    <th key={i} className="table__column whitespace-nowrap font-bold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {displayedList.map((item, i) => (
                <tr key={i} className="table__row">
                  {hasFieldLabelAndDesc ? (
                    <>
                      <td className="table__cell whitespace-nowrap font-bold text-foreground">
                        {getLabelValue(item, lang)}
                      </td>
                      <td className="table__cell">
                        <CellValue
                          rawVal={getDescValue(item, lang)}
                          viewItems={viewItems}
                          parentKeys={nextParentKeys}
                          title={getLabelValue(item, lang)}
                          onOpenNested={onOpenNested}
                        />
                      </td>
                    </>
                  ) : (
                    columnKeys.map((key) => (
                      <td key={key} className="table__cell">
                        <CellValue
                          rawVal={item[key]}
                          viewItems={viewItems}
                          parentKeys={nextParentKeys}
                          title={columnTitle(key)}
                          onOpenNested={onOpenNested}
                        />
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/**
 * A table cell value — port of _buildJsonValueWidget + the nested
 * "View (N)" button: JSON list/object values with displayable nested items
 * render a button that opens the nested dialog; everything else renders
 * inline text.
 */
function CellValue({
  rawVal,
  viewItems,
  parentKeys,
  title,
  onOpenNested,
}: {
  rawVal: unknown;
  viewItems: TaskItemLabel[] | null;
  parentKeys: Set<string>;
  title: string;
  onOpenNested(title: string, list: Json[], parentKeys: Set<string>): void;
}) {
  const { t } = useTranslation();
  const nested = tryParseJsonList(rawVal);
  const hasNested = nested ? hasDisplayableNestedItems(nested, parentKeys, title, viewItems) : false;
  if (hasNested) {
    return (
      <button
        onClick={() => onOpenNested(title.length > 0 ? title : t('details'), nested!, parentKeys)}
        className="button button--outline button--sm"
      >
        {t('view')} ({nested!.length})
      </button>
    );
  }
  if (rawVal == null) return <span className="opacity-40">-</span>;
  if (typeof rawVal === 'object') return <span>{JSON.stringify(rawVal)}</span>;
  const s = String(rawVal);
  return <span>{s.trim() === '' || s === 'null' || s === 'None' ? '-' : s}</span>;
}

/** Minimal dd/MM/yyyy HH:mm style formatter (port of the section's DateFormat usage). */
function formatDateTime(dt: Date, pattern: string): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const tokens: Record<string, string> = {
    dd: two(dt.getDate()),
    MM: two(dt.getMonth() + 1),
    yyyy: String(dt.getFullYear()),
    HH: two(dt.getHours()),
    mm: two(dt.getMinutes()),
  };
  let out = pattern;
  for (const [token, value] of Object.entries(tokens)) out = out.split(token).join(value);
  return out;
}

export type { Json as TaskViewJson };
