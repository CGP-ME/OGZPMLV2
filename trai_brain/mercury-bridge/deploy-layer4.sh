#!/usr/bin/env bash
#
# deploy-mercury-bridge-layer4.sh
# ───────────────────────────────────────────────────────────────
# Deploys the Layer 4 (ReAct loop) update to an existing
# mercury-bridge installation on the VPS.
#
# What it does:
#   1. Verifies the target mercury-bridge directory exists
#   2. Backs up the existing ask.js (the only modified existing file)
#   3. Copies the 7 production files into place
#   4. Runs node --check on every file to verify syntax
#   5. Reports next steps (no automatic smoke test — that's manual)
#
# What it does NOT do:
#   - Reindex (existing index stays; Layer 4 doesn't require reindex)
#   - Restart any services
#   - Run the smoke tests (you run them manually after deploy)
#   - Modify .env or MongoDB
#
# Usage:
#   ./deploy-mercury-bridge-layer4.sh <source_dir> <target_dir>
#
# Example:
#   ./deploy-mercury-bridge-layer4.sh \
#       /tmp/mercury-bridge-layer4 \
#       /opt/ogzprime/OGZPMLV2/trai_brain/mercury-bridge

set -euo pipefail

# ─── Arguments ───────────────────────────────────────────────
if [ $# -ne 2 ]; then
  echo "Usage: $0 <source_dir> <target_dir>"
  echo ""
  echo "Example:"
  echo "  $0 /tmp/mercury-bridge-layer4 /opt/ogzprime/OGZPMLV2/trai_brain/mercury-bridge"
  exit 1
fi

SOURCE_DIR="$1"
TARGET_DIR="$2"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "═══ Mercury Bridge Layer 4 Deployment ═══"
echo "Source: $SOURCE_DIR"
echo "Target: $TARGET_DIR"
echo "Time:   $TIMESTAMP"
echo ""

# ─── Sanity checks ───────────────────────────────────────────
if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: source directory does not exist: $SOURCE_DIR"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: target directory does not exist: $TARGET_DIR"
  echo "Expected an existing mercury-bridge installation from the initial deployment."
  exit 1
fi

# Files we expect in the source
REQUIRED_FILES=(
  "config.js"
  "mongo-store.js"
  "indexer.js"
  "searcher.js"
  "ask.js"
  "tool-adapter.js"
  "react-loop.js"
  "README.md"
)

echo "─── Step 1: Verifying source files ───"
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$SOURCE_DIR/$f" ]; then
    echo "ERROR: missing source file: $SOURCE_DIR/$f"
    exit 1
  fi
  echo "  ✓ $f"
done
echo ""

# ─── Parse-check source files BEFORE touching target ────────
echo "─── Step 2: Syntax-checking source files ───"
PARSE_FAILED=0
for f in "${REQUIRED_FILES[@]}"; do
  if [[ "$f" == *.js ]]; then
    if node --check "$SOURCE_DIR/$f" 2>&1; then
      echo "  ✓ $f parses"
    else
      echo "  ✗ $f FAILED parse check"
      PARSE_FAILED=1
    fi
  fi
done

if [ $PARSE_FAILED -eq 1 ]; then
  echo ""
  echo "ERROR: one or more source files failed syntax check. Aborting deployment."
  echo "Target directory untouched."
  exit 1
fi
echo ""

# ─── Back up the existing ask.js ────────────────────────────
if [ -f "$TARGET_DIR/ask.js" ]; then
  BACKUP_PATH="$TARGET_DIR/ask.js.backup-$TIMESTAMP"
  echo "─── Step 3: Backing up existing ask.js ───"
  cp "$TARGET_DIR/ask.js" "$BACKUP_PATH"
  echo "  ✓ backup: $BACKUP_PATH"
  echo ""
fi

# ─── Copy new files ──────────────────────────────────────────
echo "─── Step 4: Copying files ───"
for f in "${REQUIRED_FILES[@]}"; do
  cp "$SOURCE_DIR/$f" "$TARGET_DIR/$f"
  echo "  ✓ $f"
done
echo ""

# ─── Re-verify at the target ─────────────────────────────────
echo "─── Step 5: Re-verifying target files ───"
for f in "${REQUIRED_FILES[@]}"; do
  if [[ "$f" == *.js ]]; then
    if node --check "$TARGET_DIR/$f" 2>&1; then
      echo "  ✓ $f parses at target"
    else
      echo "  ✗ $f FAILED parse at target — this should not happen"
      exit 1
    fi
  fi
done
echo ""

# ─── Verify ripgrep availability (optional but good for perf) ─
echo "─── Step 6: Checking ripgrep (optional, adapter has JS fallback) ───"
if command -v rg >/dev/null 2>&1; then
  RG_VERSION=$(rg --version | head -1)
  echo "  ✓ ripgrep available: $RG_VERSION"
else
  echo "  ⚠ ripgrep NOT installed — adapter will use JS fallback (slower but functional)"
  echo "    To install: sudo apt-get install -y ripgrep"
fi
echo ""

# ─── Done ────────────────────────────────────────────────────
echo "═══ DEPLOYMENT COMPLETE ═══"
echo ""
echo "Next steps (manual):"
echo ""
echo "1. Verify OPENAI_API_KEY is still in /opt/ogzprime/OGZPMLV2/.env"
echo "   (needed for query embedding during starter-context retrieval)"
echo ""
echo "2. Verify INCEPTION_API_KEY is still in /opt/ogzprime/OGZPMLV2/.env"
echo "   (needed for Mercury calls inside the ReAct loop)"
echo ""
echo "3. Verify MongoDB is still running:"
echo "     systemctl is-active mongod"
echo ""
echo "4. Smoke test the agentic mode with the three validator queries:"
echo ""
echo "     cd /opt/ogzprime/OGZPMLV2"
echo ""
echo "     node trai_brain/mercury-bridge/ask.js --agentic --show-history \\"
echo "       \"What does StopLossChecker.js do? Cite file:line for every claim.\""
echo ""
echo "     node trai_brain/mercury-bridge/ask.js --agentic --show-history \\"
echo "       \"How does MaxProfitManager handle the BE scale-out at the 1R trigger?\""
echo ""
echo "     node trai_brain/mercury-bridge/ask.js --agentic --show-history \\"
echo "       \"There is a contract mismatch between MaxProfitManager and OrderExecutor \\"
echo "        around partial close exit sizes. Find the exact files and line numbers \\"
echo "        where each side of this contract is defined.\""
echo ""
echo "The third query is the real validator — Mercury should find the bug by grepping"
echo "the actual code, not by regurgitating documentation."
echo ""
echo "If agentic mode misbehaves, the legacy single-shot mode is still available:"
echo "     node trai_brain/mercury-bridge/ask.js \"your question\"   # without --agentic"
echo ""
