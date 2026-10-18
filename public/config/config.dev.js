// Development runtime config injected for local debugging only
// (mirror of brief-userapp web/assets/config/config.dev.js)
window.APP_CONFIG = {
  // Auth + process/role config are served in-process by the oumma Go
  // binary (:8095) — the former brief-auth-backend Java service
  // (:8082) was refactored to Go (oumma/internal/auth +
  // oumma/internal/processconfig).
  KEYCLOAK_LOGIN_URL: 'http://localhost:8095/api/auth/signin',
  KEYCLOAK_CHECK_TOKEN_URL: 'http://localhost:8095/api/auth/session/active',
  KEYCLOAK_LOGOUT_URL: 'http://localhost:8095/api/auth/signout',
  KEYCLOAK_REFRESH_URL: 'http://localhost:8095/api/auth/refresh',

  // Data services run inside the oumma Go binary (oumma/docker-compose.yaml):
  // the former Java sidecars (brief-dms-docservice, brief-oper-data-index)
  // were refactored to Go and now serve /dms-api and /oper-api on :8095.
  DOCUMENT_SERVICE_BASE_URL: 'http://localhost:8095/dms-api',
  BRIEF_DATA_OPER_INDEX_URL: 'http://localhost:8095/oper-api',
  PROCESS_SERVICE_BASE_URL: 'http://localhost:8095/api/user-processes',
  OUMMA_PROCESSES_URL: 'http://localhost:8095',
  BRIEF_AI_BASE_URL: 'http://localhost:8095/api/user-processes',
  BRIEF_DATA_INDEX_URL: 'http://localhost:8095/data-api', // retired legacy path — pinned to the oumma backend

  DOCUMENT_SERVICE_NAME: 'brief-docservice',
  PROCESS_SERVICE_NAME: 'oumma',
  KEYCLOAK_SERVICE_NAME: 'keycloak'
};

// Note: this file is intended for local development only and should NOT be
// included in production builds. Production runtime config must be provided
// by the hosting environment at /config/config.js (e.g. injected by the
// Docker entrypoint into the nginx html directory).
