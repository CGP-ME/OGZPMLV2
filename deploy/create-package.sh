#!/usr/bin/env bash
set -euo pipefail

# Build a distributable copy without creating a second configuration contract.
# The packaged runtime uses the repository's settings.json, internals.json,
# ecosystem.config.js, and start-ogzprime.sh unchanged.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="ogzprime-v2-$(date +%Y%m%d-%H%M%S)"
PACKAGE_DIR="/tmp/${PACKAGE_NAME}"
ARCHIVE_PATH="/tmp/${PACKAGE_NAME}.tar.gz"

mkdir -p "$PACKAGE_DIR"

echo "Copying OGZPrime package files..."
rsync -a \
  --exclude='.env' \
  --exclude='.env.gates' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='logs' \
  --exclude='*.log' \
  --exclude='trai_brain/models' \
  --exclude='*.gguf' \
  --exclude='*.brain' \
  --exclude='credentials.json' \
  "$REPO_ROOT/" "$PACKAGE_DIR/"

cp "$PACKAGE_DIR/config/.env.example" "$PACKAGE_DIR/.env.template"

cat > "$PACKAGE_DIR/setup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

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
  cp .env.template .env
  echo "Created .env from the credential-only template. Populate the credentials and capabilities used by your enabled services before starting."
fi

echo "Trading/customer settings: config/settings.json"
echo "Implementation constants: config/internals.json"
echo "Credentials/capabilities: .env"
echo "Start in paper mode: ./start.sh"
EOF

cat > "$PACKAGE_DIR/start.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec bash start-ogzprime.sh start
EOF

cat > "$PACKAGE_DIR/stop.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec bash start-ogzprime.sh stop
EOF

cat > "$PACKAGE_DIR/PACKAGE-README.md" <<'EOF'
# OGZPrime packaged runtime

- Put credentials and service capabilities in `.env`.
- Change customer/trading settings in `config/settings.json`.
- Keep implementation constants in `config/internals.json`.
- Run `./setup.sh`, then `./start.sh` to use the same four-process paper launcher as the repository.
- Run `./stop.sh` to stop those four named processes.

The package does not generate another PM2 descriptor or another configuration source.
EOF

chmod +x "$PACKAGE_DIR/setup.sh" "$PACKAGE_DIR/start.sh" "$PACKAGE_DIR/stop.sh" "$PACKAGE_DIR/start-ogzprime.sh"

tar -C /tmp -czf "$ARCHIVE_PATH" "$PACKAGE_NAME"
echo "Package created: $ARCHIVE_PATH"
