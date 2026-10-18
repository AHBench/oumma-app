#!/bin/sh
set +e

echo "═══════════════════════════════════════════════════════════"
echo "🔧 oumma-app runtime configuration"
echo "═══════════════════════════════════════════════════════════"

# Generate /tmp/config/config.js from ENV when not mounted (K8s ConfigMap).
if [ -x /usr/local/bin/generate-config.sh ]; then
  /usr/local/bin/generate-config.sh
fi

if [ -f /tmp/config/config.js ]; then
  echo "✅ Config ready at /tmp/config/config.js ($(wc -c < /tmp/config/config.js) bytes)"
else
  echo "⚠️  No config at /tmp/config/config.js — app will run with fallbacks"
fi

# Fix temp dir permissions if running as root
if [ "$(id -u)" = "0" ]; then
  mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi 2>/dev/null
  chown -R nginx:nginx /tmp/nginx-* /tmp/nginx-cache 2>/dev/null || true
fi

exec "$@"
