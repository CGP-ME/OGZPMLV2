#!/bin/bash
# Blocks direct edits to protected paths — they must go through the pipeline.
#
# 2026-08-25: the previous version matched "^core/" against the hook's
# file_path, but the harness sends ABSOLUTE paths, so every real edit missed
# the pattern and exited 0 (allow). It failed open, silently. Paths are now
# normalized to repo-relative before matching, and an unreadable path blocks
# instead of passing.

REPO_ROOT="/opt/ogzprime/OGZPMLV2"

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // empty' 2>/dev/null)

# Fail closed: if the path cannot be read, do not silently permit the edit.
if [ -z "$FILE" ]; then
  echo "BLOCKED: enforce-pipeline could not read a file path from the tool input. Failing closed." >&2
  exit 2
fi

# Normalize to repo-relative so absolute and relative paths match identically.
REL="${FILE#$REPO_ROOT/}"
REL="${REL#./}"

# Anything still absolute is outside the repo (e.g. /tmp) — not our business.
case "$REL" in
  /*) exit 0 ;;
esac

# Production trade path, config producers, secrets, runtime posture, and the
# guardrails themselves. An agent must not be able to edit its own gate.
PROTECTED=(
  "core/"                 # trading engine
  "modules/"              # strategies
  "brokers/"              # broker adapters — the money boundary
  "foundation/"           # ConfigLoader and the broker contract
  "tuning/"               # tuning data
  "config/"               # trading.config.json — config source of truth
  "run-empire-v2.js"      # orchestrator
  "ecosystem.config.js"   # PM2 runtime env: live/paper, webhook posture
  ".env"                  # secrets and trading config
  ".claude/"              # hooks, hookify rules, claudito commands
  "package.json"          # scripts, CI chain
  "mercury.config.json"   # adversarial layer wiring
)

for path in "${PROTECTED[@]}"; do
  case "$path" in
    */)
      if [ "${REL#$path}" != "$REL" ]; then
        echo "BLOCKED: direct edit to $REL (protected: $path). Use the pipeline: node ogz-meta/pipeline.js" >&2
        exit 2
      fi
      ;;
    *)
      if [ "$REL" = "$path" ]; then
        echo "BLOCKED: direct edit to $REL (protected file). Use the pipeline: node ogz-meta/pipeline.js" >&2
        exit 2
      fi
      ;;
  esac
done

exit 0
