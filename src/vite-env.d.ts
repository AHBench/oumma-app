/// <reference types="vite/client" />

interface Window {
  APP_CONFIG?: Record<string, unknown> | string | null;
}

interface ImportMetaEnv {
  readonly VITE_DMS_URL?: string;
  readonly VITE_DATA_INDEX_URL?: string;
  readonly VITE_OPER_DATA_INDEX_URL?: string;
  readonly VITE_AUTH_BACKEND_URL?: string;
  readonly VITE_PROCESS_URL?: string;
  readonly VITE_USER_PROCESSES_URL?: string;
  readonly VITE_DOCUMENT_SERVICE_BASE_URL?: string;
  readonly VITE_PROCESS_SERVICE_BASE_URL?: string;
  readonly VITE_KEYCLOAK_LOGIN_URL?: string;
  readonly VITE_KEYCLOAK_CHECK_TOKEN_URL?: string;
  readonly VITE_KEYCLOAK_LOGOUT_URL?: string;
  readonly VITE_KEYCLOAK_REFRESH_URL?: string;
  readonly VITE_BRIEF_DATA_INDEX_URL?: string;
  readonly VITE_BRIEF_AI_BASE_URL?: string;
  readonly VITE_BRIEF_DATA_OPER_INDEX_URL?: string;
  readonly VITE_OUMMA_PROCESSES_URL?: string;
  readonly VITE_LOG_COLLECTOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
