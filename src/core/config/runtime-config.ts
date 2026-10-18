/**
 * Runtime configuration loader — mirrors Flutter `RuntimeConfig`
 * (lib/core/constants/runtime_config.dart). Reads `window.APP_CONFIG`
 * (served by nginx at /assets/config/config.js, or injected locally by
 * index.html for localhost dev).
 */
let _config: Record<string, unknown> | null = null;

export function initializeRuntimeConfig(): void {
  if (_config !== null) return;
  try {
    const raw = window.APP_CONFIG;
    if (raw == null) {
      _config = {};
      return;
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        _config =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
        return;
      } catch {
        _config = { APP_CONFIG_RAW: raw };
        return;
      }
    }
    if (typeof raw === 'object') {
      _config = { ...(raw as Record<string, unknown>) };
      return;
    }
    _config = {};
  } catch {
    _config = {};
  }
}

export function getRuntimeString(key: string, defaultValue: string): string {
  if (_config === null) initializeRuntimeConfig();
  const value = _config?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return defaultValue;
}

export function getRuntimeBool(key: string, defaultValue: boolean): boolean {
  if (_config === null) initializeRuntimeConfig();
  const value = _config?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return defaultValue;
}

export function getRuntimeInt(key: string, defaultValue: number): number {
  if (_config === null) initializeRuntimeConfig();
  const value = _config?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/** Compile-time env layer (Vite --env / .env files — the React analog of --dart-define). */
export const envCompile = {
  dmsUrl: import.meta.env.VITE_DMS_URL ?? '/dms-api',
  dataIndexUrl: import.meta.env.VITE_DATA_INDEX_URL ?? '/data-api',
  operDataIndexUrl: import.meta.env.VITE_OPER_DATA_INDEX_URL ?? '/oper-api',
  authBackendUrl: import.meta.env.VITE_AUTH_BACKEND_URL ?? '/api/auth',
  processUrl: import.meta.env.VITE_PROCESS_URL ?? '/processes',
  userProcessesUrl: import.meta.env.VITE_USER_PROCESSES_URL ?? '/api/user-processes',
};
