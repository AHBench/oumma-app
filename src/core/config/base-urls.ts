import {
  envCompile,
  getRuntimeString,
  initializeRuntimeConfig,
} from './runtime-config';

/**
 * Service URL resolution — mirrors Flutter `BaseUrls`:
 * runtime config (window.APP_CONFIG) first, then compile-time env,
 * then hardcoded defaults.
 */
function resolve(runtimeKey: string, fallback: string): string {
  initializeRuntimeConfig();
  const runtime = getRuntimeString(runtimeKey, '');
  return runtime.trim() !== '' ? runtime : fallback;
}

export const BaseUrls = {
  get documentServiceBaseUrl(): string {
    return resolve('DOCUMENT_SERVICE_BASE_URL', envCompile.dmsUrl);
  },

  get dataOperIndexUrl(): string {
    return resolve('BRIEF_DATA_OPER_INDEX_URL', envCompile.operDataIndexUrl);
  },

  get processServiceBaseUrl(): string {
    return resolve('PROCESS_SERVICE_BASE_URL', envCompile.userProcessesUrl);
  },

  get briefAiBaseUrl(): string {
    return resolve('BRIEF_AI_BASE_URL', envCompile.authBackendUrl);
  },

  get briefDataIndexUrl(): string {
    return resolve('BRIEF_DATA_INDEX_URL', envCompile.dataIndexUrl);
  },

  get oummaUrl(): string {
    return resolve('OUMMA_PROCESSES_URL', envCompile.processUrl);
  },

  get loginUrl(): string {
    return resolve('KEYCLOAK_LOGIN_URL', `${envCompile.authBackendUrl}/signin`);
  },

  get checkTokenUrl(): string {
    return resolve('KEYCLOAK_CHECK_TOKEN_URL', `${envCompile.authBackendUrl}/session/active`);
  },

  get logoutUrl(): string {
    return resolve('KEYCLOAK_LOGOUT_URL', `${envCompile.authBackendUrl}/signout`);
  },

  get refreshUrl(): string {
    return resolve('KEYCLOAK_REFRESH_URL', `${envCompile.authBackendUrl}/refresh`);
  },
};
