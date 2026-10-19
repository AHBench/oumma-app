import axios, { AxiosError, type AxiosInstance } from 'axios';
import { appLogger } from '../logging/app-logger';
import { tokenStore } from './token-store';
import { BaseUrls } from '../config/base-urls';

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};

/** Wired by the AuthProvider — the React analog of AuthSessionExpiredEvent. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

/** Paths exempt from the 401 → refresh/logout handling (avoids infinite loops). */
function isAuthEndpoint(url: string): boolean {
  return (
    url.endsWith('/signin') || url.includes('/session/active') || url.includes('/refresh')
  );
}

/**
 * Refresh the access token with the stored refresh token.
 * Concurrent 401s share a single in-flight refresh.
 * Returns the new access token, or null when the refresh token is gone.
 */
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    const rt = tokenStore.refresh;
    if (!rt) return null;
    try {
      const { data } = await axios.post<Record<string, unknown>>(BaseUrls.refreshUrl, {
        refresh_token: rt,
      });
      const at = typeof data.access_token === 'string' ? data.access_token : null;
      if (!at) return null;
      const newRt = typeof data.refresh_token === 'string' ? data.refresh_token : rt;
      tokenStore.set(at, newRt);
      return at;
    } catch (e) {
      appLogger.warning(`Access token refresh failed: ${String(e)}`);
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Centralized axios instance — mirrors lib/core/utils/brief_http_client.dart:
 * - injects the bearer token when available
 * - logs every request/response
 * - on 401 (except auth endpoints) refreshes the token once and retries;
 *   only when the refresh also fails does it force a session-expired event
 */
export function createApiClient(): AxiosInstance {
  const instance = axios.create({ timeout: 60_000 });

  instance.interceptors.request.use((config) => {
    const token = tokenStore.access;
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    appLogger.debug(
      `Request: ${config.method?.toUpperCase()} ${config.baseURL ?? ''}${config.url}`,
    );
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      appLogger.debug(
        `Response: ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`,
      );
      return response;
    },
    (error: AxiosError) => {
      const status = error.response?.status;
      const url = error.config?.url ?? '';
      appLogger.error(`Response error: ${status ?? 'network'} ${url}: ${error.message}`);
      if (status === 401 && !isAuthEndpoint(url) && error.config) {
        const cfg = error.config as typeof error.config & { _retriedAfterRefresh?: boolean };
        if (!cfg._retriedAfterRefresh && tokenStore.refresh) {
          // The access token likely expired mid-session (long AI chat turns,
          // slow LLM calls). Refresh once and retry the same request instead
          // of logging the user out.
          cfg._retriedAfterRefresh = true;
          appLogger.warning('HTTP 401 — refreshing access token and retrying once…');
          return refreshAccessToken().then((newToken) => {
            if (newToken) {
              cfg.headers = { ...cfg.headers, Authorization: `Bearer ${newToken}` };
              return instance.request(cfg);
            }
            appLogger.warning('Token refresh failed — session expired.');
            onSessionExpired();
            return Promise.reject(error);
          });
        }
        appLogger.warning('HTTP 401 Unauthorized detected! Redirecting to login...');
        onSessionExpired();
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

export const apiClient = createApiClient();

export function getErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { error?: string; message?: string }
      | string
      | undefined;
    if (data && typeof data === 'object' && data.error) return data.error;
    if (data && typeof data === 'object' && data.message) return data.message;
    return `${fallback}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
