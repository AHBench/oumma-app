import { apiClient } from '../../../../core/http/client';

type Json = Record<string, unknown>;

/**
 * Field data sources for `field_source_type: 'internalapi'` and
 * `field_source_type: 'internalapiconfig'` — mirrors the _InternalApi*Field
 * widgets of form_field_factory.dart. Base URL is the Kogito process service.
 */
export class InternalApiFieldSource {
  constructor(private readonly oummaUrl: string) {}

  /**
   * `internalapi`: GET {kogito}/{field_source} (absolute URLs pass through),
   * with Bearer + optional api_key header. Options come from the response
   * list, or from the values of a response map.
   */
  async fetchDropdownOptions(
    fieldSource: string,
    token: string | null,
    apiKey: string | null,
  ): Promise<string[]> {
    const base = this.oummaUrl.replace(/\/+$/, '');
    const endpoint = fieldSource;
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${base}/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (apiKey) headers['api_key'] = apiKey;

    const response = await apiClient.get(url, { headers });
    if (response.status !== 200) {
      throw new Error(`Failed to load options (Status: ${response.status})`);
    }
    const decoded: unknown = response.data;
    if (Array.isArray(decoded)) {
      return decoded.map((e) => String(e));
    }
    if (decoded && typeof decoded === 'object') {
      return Object.values(decoded as Json).map((e) => String(e));
    }
    return [];
  }

  /**
   * `internalapiconfig`: GET {kogito}/management/active-sources/fields?table=&limit=1000
   * — rows of a params_* configuration table (see docs/ACTIVE_SOURCES_ENDPOINTS.md).
   */
  async fetchTableRows(
    tableName: string,
    token: string | null,
  ): Promise<Json[]> {
    const base = this.oummaUrl.replace(/\/+$/, '');
    const url = `${base}/management/active-sources/fields?table=${encodeURIComponent(tableName)}&limit=1000`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiClient.get(url, { headers });
    if (response.status !== 200) {
      throw new Error(`Failed to load values (Status: ${response.status})`);
    }
    const decoded: unknown = response.data;
    const rawRows =
      decoded && typeof decoded === 'object' && !Array.isArray(decoded)
        ? (decoded as Json).rows
        : Array.isArray(decoded)
          ? decoded
          : null;
    if (!Array.isArray(rawRows)) return [];
    return rawRows
      .filter((e) => typeof e === 'object' && e !== null)
      .map((e) => Object.fromEntries(
        Object.entries(e as Json).map(([k, v]) => [k, v]),
      ));
  }

  /** POST {kogito}/management/active-sources/fields — {table, fields} */
  async insertTableRow(
    tableName: string,
    fields: Json,
    token: string | null,
  ): Promise<void> {
    const base = this.oummaUrl.replace(/\/+$/, '');
    const url = `${base}/management/active-sources/fields`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiClient.post(url, { table: tableName, fields }, { headers });
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Failed to add value: ${JSON.stringify(response.data)}`);
    }
  }

  /** Human-readable label for a params_ row (configured columns joined). */
  static rowLabel(row: Json, columns?: string[]): string {
    if (columns && columns.length > 0) {
      return columns.map((c) => String(row[c] ?? '')).join(' ');
    }
    return Object.values(row)
      .filter((v) => v != null && (typeof v === 'string' || typeof v === 'number'))
      .map((v) => String(v))
      .join(' ');
  }
}
