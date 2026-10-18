/**
 * Pure display logic for the task view — mirrors the static helpers in
 * lib/features/process_tasks/domain/entity/task_iten_entity.dart
 * (tryParseJsonList / tryParseStringList / findDescriptionById /
 * _searchJsonForKey / tryParseRelaxedJson) and the grouping/dedup helpers in
 * view_task.dart + process_fields_section.dart.
 */
import type { TaskItem } from '../../data/models/task-models';
import type { TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import type { Form } from '../../../process-forms/data/models/form-model';

type Json = Record<string, unknown>;

/* ---------------------------------- JSON parsing ---------------------------------- */

/** Port of TaskItemEntity.tryParseRelaxedJson — Dart map-list strings like `[{id: emp-1, nin: null}]`. */
function tryParseRelaxedJson(input: unknown): unknown {
  const str = String(input ?? '').trim();
  if (!str) return null;
  const kvRegExp = /([a-zA-Z0-9_\-]+)\s*:\s*([^,{}]+)/g;

  const parsePairs = (body: string): Json => {
    const map: Json = {};
    for (const m of body.matchAll(kvRegExp)) {
      const key = m[1].trim();
      let val: string | null = m[2].trim();
      if (val === 'null' || val === 'None') val = null;
      if (key) map[key] = val;
    }
    return map;
  };

  if (str.startsWith('[')) {
    const list: Json[] = [];
    for (const m of str.matchAll(/\{([^}]+)\}/g)) {
      const map = parsePairs(m[1]);
      if (Object.keys(map).length > 0) list.push(map);
    }
    return list.length > 0 ? list : null;
  }
  if (str.startsWith('{')) {
    const body = str.slice(1, str.endsWith('}') ? str.length - 1 : str.length);
    const map = parsePairs(body);
    return Object.keys(map).length > 0 ? map : null;
  }
  return null;
}

/**
 * Port of TaskItemEntity.tryParseJsonList — decodes a value (string, list or
 * map) into a list of maps. Maps resolve their list via a single list value
 * or one of the conventional keys; a bare map wraps to [map].
 * Non-map entries are dropped.
 */
export function tryParseJsonList(rawValue: unknown): Json[] | null {
  if (rawValue == null) return null;
  let decoded: unknown = rawValue;
  if (typeof rawValue === 'string') {
    const str = rawValue.trim();
    if (!str.startsWith('[') && !str.startsWith('{')) return null;
    try {
      decoded = JSON.parse(str);
    } catch {
      decoded = tryParseRelaxedJson(str);
    }
  }
  let list: unknown[] | null = null;
  if (Array.isArray(decoded)) {
    list = decoded;
  } else if (decoded && typeof decoded === 'object') {
    const obj = decoded as Json;
    const entries = Object.entries(obj);
    if (entries.length === 1 && Array.isArray(entries[0][1])) {
      list = entries[0][1] as unknown[];
    } else {
      for (const key of ['items', 'list', 'data', 'content', 'employees', 'records']) {
        if (Array.isArray(obj[key])) {
          list = obj[key] as unknown[];
          break;
        }
      }
      list ??= [decoded];
    }
  }
  if (!list) return null;
  const maps = list.filter((e) => e && typeof e === 'object' && !Array.isArray(e)) as Json[];
  return maps.length > 0 ? maps : null;
}

/** Port of TaskItemEntity.tryParseStringList — JSON list of plain strings. */
export function tryParseStringList(rawValue: unknown): string[] | null {
  let decoded: unknown = rawValue;
  if (typeof rawValue === 'string') {
    const str = rawValue.trim();
    if (!str.startsWith('[')) return null;
    try {
      decoded = JSON.parse(str);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(decoded) || decoded.length === 0) return null;
  if (decoded.every((e) => typeof e === 'string')) return decoded as string[];
  return null;
}

/* ---------------------------------- value lookup ---------------------------------- */

/** Port of TaskItemEntity._searchJsonForKey — recursive key search. */
function recursiveSearch(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const map = obj as Json;
    for (const [k, v] of Object.entries(map)) {
      if (k === key) {
        if (v == null) return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }
      const result = recursiveSearch(v, key);
      if (result != null) return result;
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = recursiveSearch(item, key);
      if (result != null) return result;
    }
  } else if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return recursiveSearch(JSON.parse(trimmed), key);
      } catch {
        const relaxed = tryParseRelaxedJson(trimmed);
        if (relaxed != null) return recursiveSearch(relaxed, key);
      }
    }
  }
  return null;
}

/**
 * Port of TaskItemEntity.findDescriptionById — resolves a view item's column
 * name to a value: direct task item first, then recursive JSON search.
 * Returns the raw description value (unknown).
 */
export function findDescriptionById(items: TaskItem[], searchId: string): unknown {
  const direct = items.find((item) => item.taskId === searchId);
  if (direct) return direct.description;
  for (const item of items) {
    const found = recursiveSearch(item.description, searchId);
    if (found != null && found.length > 0) return found;
  }
  return undefined;
}

/* ---------------------------------- label helpers ---------------------------------- */

function labelKeysFor(lang: string): string[] {
  const cap = lang[0]?.toUpperCase() + lang.slice(1);
  return [
    `field_label_${lang}`,
    `fieldLabel_${lang}`,
    `field_label${lang.toUpperCase()}`,
    `fieldLabel${cap}`,
    `label_${lang}`,
    `label${cap}`,
    'field_label',
    'fieldLabel',
    'label',
  ];
}

function descKeysFor(lang: string): string[] {
  const cap = lang[0]?.toUpperCase() + lang.slice(1);
  return [
    `description_${lang}`,
    `description${cap}`,
    `field_value_${lang}`,
    `fieldValue_${lang}`,
    `fieldValue${cap}`,
    `value_${lang}`,
    `value${cap}`,
    'description',
    'field_value',
    'value',
  ];
}

export const LANG_SUFFIXES = ['_en', '_fr', '_ar', 'En', 'Fr', 'Ar', '_EN', '_FR', '_AR'];

export function stripLangSuffix(s: string): string {
  for (const suffix of LANG_SUFFIXES) {
    if (s.endsWith(suffix)) return s.slice(0, s.length - suffix.length);
  }
  return s;
}

/** Port of _getLabelValueHelper / _getLabelValue (label variant). */
export function getLabelValue(itemObj: Json, lang: string): string {
  for (const key of labelKeysFor(lang)) {
    const v = itemObj[key];
    if (v != null) return String(v);
  }
  return '';
}

/** Port of _getDescValue (description/value variant). */
export function getDescValue(itemObj: Json, lang: string): unknown {
  for (const key of descKeysFor(lang)) {
    const v = itemObj[key];
    if (v != null) return v;
  }
  return null;
}

/* ---------------------------------- view-item matching ---------------------------------- */

/** Port of process_fields_section._isIdentifiedViewItem. */
export function isIdentifiedViewItem(keyOrLabel: string, viewItems: TaskItemLabel[] | null | undefined): boolean {
  if (!viewItems || viewItems.length === 0) return false;
  const target = keyOrLabel.trim();
  if (!target) return false;
  const normTarget = target.toLowerCase();
  const baseTarget = stripLangSuffix(target);
  const normBaseTarget = baseTarget.toLowerCase();
  for (const v of viewItems) {
    if (v.itemColumnName) {
      const col = v.itemColumnName;
      const normCol = col.toLowerCase();
      const baseCol = stripLangSuffix(col);
      const normBaseCol = baseCol.toLowerCase();
      if (col === target || normCol === normTarget || baseCol === baseTarget || normBaseCol === normBaseTarget) {
        return true;
      }
    }
  }
  return false;
}

/** Port of _isNonEmptyValue. */
function isNonEmptyValue(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s.length > 0 && s !== 'null' && s !== 'none' && s !== '[]' && s !== '{}';
  }
  if (Array.isArray(val)) return val.some(isNonEmptyValue);
  if (typeof val === 'object') return Object.values(val as Json).some(isNonEmptyValue);
  return true;
}

/** Port of _hasIdentifiedViewItem. */
export function hasIdentifiedViewItem(jsonList: Json[], viewItems: TaskItemLabel[] | null | undefined, lang = 'fr'): boolean {
  if (!viewItems || viewItems.length === 0 || jsonList.length === 0) return false;
  for (const itemObj of jsonList) {
    const labelVal = getLabelValue(itemObj, lang);
    if (labelVal.length > 0 && isIdentifiedViewItem(labelVal, viewItems)) return true;
    for (const [key, value] of Object.entries(itemObj)) {
      if (isIdentifiedViewItem(key, viewItems)) return true;
      const nested = tryParseJsonList(value);
      if (nested && hasIdentifiedViewItem(nested, viewItems, lang)) return true;
    }
  }
  return false;
}

/** Port of _hasDisplayableNestedItems. */
export function hasDisplayableNestedItems(
  nestedJsonList: Json[] | null,
  _parentRenderedKeys: Set<string>,
  currentTitle: string,
  viewItems?: TaskItemLabel[] | null,
): boolean {
  if (!nestedJsonList || nestedJsonList.length === 0) return false;
  const normTitle = currentTitle.trim().toLowerCase();
  for (const itemObj of nestedJsonList) {
    if (Object.keys(itemObj).length === 0) continue;
    for (const [key, value] of Object.entries(itemObj)) {
      const normKey = key.trim().toLowerCase();
      if (normKey === normTitle) continue;
      if (viewItems && viewItems.length > 0) {
        if (!isIdentifiedViewItem(key, viewItems)) continue;
      }
      if (isNonEmptyValue(value)) return true;
    }
  }
  return false;
}

/* ---------------------------------- grouping / dedup ---------------------------------- */

/** Port of view_task._collectChildKeysFromParsedList. */
function collectChildKeysFromParsedList(jsonList: Json[], childKeys: Set<string>, lang = 'fr'): void {
  for (const item of jsonList) {
    const labelVal = getLabelValue(item, lang);
    if (labelVal.length > 0) childKeys.add(labelVal.trim().toLowerCase());
    for (const [key, value] of Object.entries(item)) {
      const keyStr = key.trim().toLowerCase();
      childKeys.add(keyStr);
      childKeys.add(stripLangSuffix(keyStr));
      const nested = tryParseJsonList(value);
      if (nested && nested.length > 0) collectChildKeysFromParsedList(nested, childKeys, lang);
    }
  }
}

/**
 * Port of view_task._groupRowsByViewItemId — ordered single-pass grouping of
 * task field values by view item id, skipping view items whose column names
 * belong inside a parent JSON list/object.
 */
export function groupRowsByViewItemId(
  items: TaskItem[],
  viewItems: TaskItemLabel[] | null,
  lang = 'fr',
): Record<string, { label: string; value: string }[]> {
  const groupedRows: Record<string, { label: string; value: string }[]> = {};
  if (!viewItems) return groupedRows;

  const sorted = [...viewItems].sort((a, b) => a.id - b.id);
  const childFieldKeys = new Set<string>();

  for (const viewItem of sorted) {
    const col = (viewItem.itemColumnName ?? '').trim().toLowerCase();
    const desc = (viewItem.description ?? '').trim().toLowerCase();
    const normBaseCol = stripLangSuffix(col);
    const baseDesc = stripLangSuffix(desc);

    if (
      childFieldKeys.has(col) ||
      childFieldKeys.has(normBaseCol) ||
      childFieldKeys.has(desc) ||
      childFieldKeys.has(baseDesc)
    ) {
      continue;
    }

    const matchedValue = findDescriptionById(items, viewItem.itemColumnName ?? '');
    if (matchedValue !== undefined && matchedValue !== null) {
      const jsonList = tryParseJsonList(matchedValue);
      if (jsonList && jsonList.length > 0) {
        collectChildKeysFromParsedList(jsonList, childFieldKeys, lang);
      }
      (groupedRows[viewItem.id] ??= []).push({
        label: viewItem.description,
        value: String(matchedValue),
      });
    }
  }
  return groupedRows;
}

/**
 * Port of view_task._dedupViewItems — hides view items whose field name
 * already exists in the selected dossier.
 */
export function dedupViewItems(viewItems: TaskItemLabel[] | null, dossier: Form | null): TaskItemLabel[] | null {
  if (!dossier || !viewItems) return viewItems;
  const norm = (s: string) => stripLangSuffix(s.trim().toLowerCase());
  const dossierFieldNames = new Set(dossier.formFields.map((f) => norm(f.fieldName)));
  return viewItems.filter((v) => !dossierFieldNames.has(norm(v.itemColumnName ?? '')));
}
