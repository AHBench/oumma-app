import axios, { AxiosError, type AxiosInstance } from 'axios';
import { appLogger } from '../logging/app-logger';
import { tokenStore } from './token-store';

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};

/** Wired by the AuthProvider — the React analog of AuthSessionExpiredEvent. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

/** Paths exempt from the 401 → logout redirect (avoids infinite loops). */
function isAuthEndpoint(url: string): boolean {
  return (
    url.endsWith('/signin') || url.includes('/session/active') || url.includes('/refresh')
  );
}

/**
 * Centralized axios instance — mirrors lib/core/utils/brief_http_client.dart:
 * - injects the bearer token when available
 * - logs every request/response
 * - on 401 (except auth endpoints) forces a session-expired event
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
      if (status === 401 && !isAuthEndpoint(url)) {
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
