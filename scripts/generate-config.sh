#!/bin/sh
# Generates /tmp/config/config.js from ENV when no config is mounted.
# Mirrors brief-userapp/scripts/generate-config.sh (window.APP_CONFIG keys).
set -e

CONFIG_DIR="/tmp/config"
CONFIG_FILE="$CONFIG_DIR/config.js"

mkdir -p "$CONFIG_DIR"

# If a config file was mounted (e.g. K8s ConfigMap), keep it.
if [ -f "$CONFIG_FILE" ]; then
  echo "Using pre-mounted config: $CONFIG_FILE"
  exit 0
fi

cat > "$CONFIG_FILE" <<EOF
window.APP_CONFIG = {
  KEYCLOAK_LOGIN_URL: '${KEYCLOAK_LOGIN_URL}',
  KEYCLOAK_CHECK_TOKEN_URL: '${KEYCLOAK_CHECK_TOKEN_URL}',
  KEYCLOAK_LOGOUT_URL: '${KEYCLOAK_LOGOUT_URL}',
  KEYCLOAK_REFRESH_URL: '${KEYCLOAK_REFRESH_URL}',

  DOCUMENT_SERVICE_BASE_URL: '${DOCUMENT_SERVICE_BASE_URL}',
  BRIEF_DATA_OPER_INDEX_URL: '${BRIEF_DATA_OPER_INDEX_URL}',
  PROCESS_SERVICE_BASE_URL: '${PROCESS_SERVICE_BASE_URL}',
  OUMMA_PROCESSES_URL: '${OUMMA_PROCESSES_URL}',
  BRIEF_AI_BASE_URL: '${BRIEF_AI_BASE_URL}',
  BRIEF_DATA_INDEX_URL: '${BRIEF_DATA_INDEX_URL}',

  DOCUMENT_SERVICE_NAME: '${DOCUMENT_SERVICE_NAME}',
  PROCESS_SERVICE_NAME: '${PROCESS_SERVICE_NAME}',
  KEYCLOAK_SERVICE_NAME: '${KEYCLOAK_SERVICE_NAME}',
};
window.APP_CONFIG_LOADED = true;
EOF

echo "Generated $CONFIG_FILE from ENV"
exit 0
