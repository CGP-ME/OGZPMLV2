#!/usr/bin/env bash
set -euo pipefail

# Prepare this checkout and start it through the repository's sole PM2 launcher.
# This script does not read, export, or mutate application configuration values.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install the repository-supported Node.js version first."
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 is required. Install PM2 first."
  exit 1
fi

npm ci --omit=dev
mkdir -p data logs

if [ ! -f .env ]; then
  cp config/.env.example .env
  echo "Created .env from the credential-only template. Populate required credentials/capabilities, then rerun this script."
  exit 1
fi

echo "Using config/settings.json for customer/trading settings."
echo "Using config/internals.json for implementation constants."
echo "Starting the four declared paper-runtime processes through start-ogzprime.sh."
exec bash start-ogzprime.sh start
