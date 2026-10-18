/**
 * In-memory + localStorage token holder.
 *
 * The React analog of the Flutter AuthBloc keeping `myuser` in memory and
 * SharedPreferences persisting tokens. Datasources receive the token
 * explicitly (as in Dart); the HTTP client also reads from here for
 * convenience and 401 handling.
 */
const ACCESS_KEY = 'auth_access_token';
const REFRESH_KEY = 'auth_refresh_token';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const tokenStore = {
  set(access: string | null, refresh: string | null): void {
    accessToken = access;
    refreshToken = refresh;
    try {
      if (access !== null) localStorage.setItem(ACCESS_KEY, access);
      else localStorage.removeItem(ACCESS_KEY);
      if (refresh !== null) localStorage.setItem(REFRESH_KEY, refresh);
      else localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* storage unavailable (private mode) — memory-only */
    }
  },
  clear(): void {
    this.set(null, null);
  },
  get access(): string | null {
    if (accessToken !== null) return accessToken;
    try {
      return localStorage.getItem(ACCESS_KEY);
    } catch {
      return null;
    }
  },
  get refresh(): string | null {
    if (refreshToken !== null) return refreshToken;
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
};
