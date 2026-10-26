#!/bin/sh
set -e

# Inject runtime configuration. Values left empty fall back to the build-time
# VITE_* values. Which data source the portal uses is a build-time choice and
# production images always read from the audit API.
cat > /usr/share/nginx/html/env-config.js << EOF2
window.ENV = {
  API_BASE_URL: "${API_BASE_URL:-http://localhost:3100}",
  MEMORY_URL: "${MEMORY_URL:-}",
  FIREBASE_API_KEY: "${FIREBASE_API_KEY:-}",
  FIREBASE_AUTH_DOMAIN: "${FIREBASE_AUTH_DOMAIN:-}",
  FIREBASE_PROJECT_ID: "${FIREBASE_PROJECT_ID:-}",
  FIREBASE_APP_ID: "${FIREBASE_APP_ID:-}"
};
EOF2

echo "Runtime environment configuration injected for: $(grep -o '^  [A-Z_]*' /usr/share/nginx/html/env-config.js | tr -d ' ' | tr '\n' ' ')"
