#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${OGZ_ALIGNMENT_REPO:-/opt/ogzprime/OGZPMLV2}"
CODEX_BIN="${CODEX_BIN:-/home/linuxuser/.local/bin/codex}"
PROMPT_FILE="${OGZ_ALIGNMENT_PROMPT:-${REPO_DIR}/ogz-meta/automation/daily-alignment-maintenance-prompt.md}"
LOG_DIR="${OGZ_ALIGNMENT_LOG_DIR:-${REPO_DIR}/ogz-meta/cognition-history/alignment-maintenance}"

cd "$REPO_DIR"

if [[ "${1:-}" == "--dry-run" ]]; then
  printf 'repo=%s\n' "$REPO_DIR"
  printf 'codex=%s\n' "$CODEX_BIN"
  printf 'prompt=%s\n' "$PROMPT_FILE"
  printf 'log_dir=%s\n' "$LOG_DIR"
  exit 0
fi

if [[ "${1:-}" != "--run-approved" && "${OGZ_ALIGNMENT_ALLOW_AUTORUN:-}" != "1" ]]; then
  printf 'daily alignment maintenance is disabled by default; run only on explicit operator command with --run-approved or OGZ_ALIGNMENT_ALLOW_AUTORUN=1
' >&2
  exit 2
fi

mkdir -p "$LOG_DIR"

RUN_ID="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
RUN_LOG="${LOG_DIR}/run-${RUN_ID}.log"
LAST_MESSAGE="${LOG_DIR}/last-message-${RUN_ID}.log"

export OGZ_ALIGNMENT_RUN_ID="$RUN_ID"
export OGZ_ALIGNMENT_REPO="$REPO_DIR"
export OGZ_ALIGNMENT_LOG_DIR="$LOG_DIR"

{
  printf 'timestamp=%s\n' "$RUN_ID"
  printf 'repo=%s\n' "$REPO_DIR"
  printf 'codex=%s\n' "$CODEX_BIN"
  printf 'prompt=%s\n' "$PROMPT_FILE"
  printf 'branch=%s\n' "$(git branch --show-current)"
  printf 'status_start\n'
  git status --short --branch
  printf 'status_end\n'
} > "$RUN_LOG"

set +e
"$CODEX_BIN" --ask-for-approval never exec \
  --cd "$REPO_DIR" \
  --sandbox workspace-write \
  --color never \
  --output-last-message "$LAST_MESSAGE" \
  - < "$PROMPT_FILE" >> "$RUN_LOG" 2>&1
CODEX_EXIT=$?
set -e

{
  printf 'codex_exit=%s\n' "$CODEX_EXIT"
  printf 'post_status_start\n'
  git status --short --branch
  printf 'post_status_end\n'
  printf 'last_message=%s\n' "$LAST_MESSAGE"
} >> "$RUN_LOG"

exit "$CODEX_EXIT"
