/**
 * localStorage helpers — the React analog of SharedPreferences
 * (the Dart app persists under 'auth_user', 'auth_access_token',
 * 'auth_refresh_token'; the token keys are owned by token-store).
 */
const USER_KEY = 'auth_user';
const THEME_KEY = 'app_theme';

export const storage = {
  getString(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setString(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getSavedUser<T>(): T | null {
    const raw = storage.getString(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  saveUser(user: unknown): void {
    storage.setString(USER_KEY, JSON.stringify(user));
  },
  clearUser(): void {
    storage.remove(USER_KEY);
  },
  getTheme(): 'light' | 'dark' | null {
    const value = storage.getString(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  },
  saveTheme(theme: 'light' | 'dark'): void {
    storage.setString(THEME_KEY, theme);
  },
};
