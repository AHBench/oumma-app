# syntax=docker/dockerfile:1
# Multi-stage build for oumma-app (React/Vite web application).
# Mirrors the deployment model of brief-userapp: one image for all
# environments, runtime config injected via /tmp/config/config.js
# (K8s ConfigMap mount) or generated from ENV at startup.

FROM node:22-alpine AS build

# Optional compile-time fallbacks (runtime window.APP_CONFIG takes precedence)
ARG VITE_API_BASE_URL=""
ARG VITE_AUTH_BACKEND_URL=""
ARG VITE_DMS_URL=""
ARG VITE_DATA_INDEX_URL=""
ARG VITE_OPER_DATA_INDEX_URL=""
ARG VITE_PROCESS_URL=""
ARG VITE_USER_PROCESSES_URL=""

WORKDIR /app

# Dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Final light production image ------------------------------------------
FROM nginx:1.25-alpine

# Default environment values for the runtime config (same keys the Flutter
# image ships). These are only used when the app is started without a
# mounted /tmp/config/config.js.
#
# Single backend base: the oumma Go binary (:8095) serves the workflow engine,
# the ported auth API (internal/auth), the user-process read model + management
# (internal/processconfig), the DMS document service (internal/documents) and
# the operational data index (internal/forms). The former Java sidecars
# (brief-auth-backend :8082, brief-dms-docservice :8081, brief-oper-data-index
# :8083) are retired — see oumma/AUTH_BACKEND_PORT_PLAN.md.
ENV DOCUMENT_SERVICE_BASE_URL=http://localhost:8095/dms-api \
    BRIEF_DATA_OPER_INDEX_URL=http://localhost:8095/oper-api \
    PROCESS_SERVICE_BASE_URL=http://localhost:8095/api/user-processes \
    OUMMA_PROCESSES_URL=http://localhost:8095 \
    BRIEF_AI_BASE_URL=http://localhost:8095/api/user-processes \
    BRIEF_DATA_INDEX_URL=http://localhost:8095/data-api \
    KEYCLOAK_LOGIN_URL=http://localhost:8095/api/auth/signin \
    KEYCLOAK_CHECK_TOKEN_URL=http://localhost:8095/api/auth/session/active \
    KEYCLOAK_LOGOUT_URL=http://localhost:8095/api/auth/signout \
    KEYCLOAK_REFRESH_URL=http://localhost:8095/api/auth/refresh \
    DOCUMENT_SERVICE_NAME=brief-docservice \
    PROCESS_SERVICE_NAME=oumma \
    KEYCLOAK_SERVICE_NAME=keycloak \

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY scripts/generate-config.sh /usr/local/bin/generate-config.sh
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh

RUN rm -f /etc/nginx/conf.d/nginx-default.conf \
    && mkdir -p /tmp/config /tmp/nginx-cache \
    && chown -R nginx:nginx /usr/share/nginx/html /tmp/config /tmp/nginx-cache /var/cache/nginx /var/log/nginx \
    && chmod -R 777 /tmp/config \
    && sed -i 's/\r$//' /usr/local/bin/generate-config.sh /docker-entrypoint.sh \
    && chmod +x /usr/local/bin/generate-config.sh /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
