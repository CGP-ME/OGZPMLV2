#!/bin/bash
# claude-bridge smoke test
# Runs each gate with simulated hook input and reports PASS/FAIL.

set -u
cd "$(dirname "$0")/../.."

CLI="node trai_brain/claude-bridge/cli.js"
PASS=0
FAIL=0

note() { printf "\n=== %s ===\n" "$1"; }
expect_exit() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    printf "  PASS  %s  (exit %d)\n" "$name" "$actual"; PASS=$((PASS+1))
  else
    printf "  FAIL  %s  (expected %d, got %d)\n" "$name" "$expected" "$actual"; FAIL=$((FAIL+1))
  fi
}

# Reset ledger so tests are deterministic
rm -f .claude/session-state/read-ledger.json

note "1/8  prepare — prompt that matches FIX-659 (pattern-memory) returns context"
OUT=$(echo '{"prompt":"pattern memory not growing recording features"}' | $CLI prepare 2>&1)
EX=$?
if echo "$OUT" | grep -q 'FIX-659' && [ "$EX" -eq 0 ]; then
  printf "  PASS  prior-fixes lookup found FIX-659\n"; PASS=$((PASS+1))
else
  printf "  FAIL  prior-fixes lookup. exit=%d output=%s\n" "$EX" "$(echo $OUT | head -c 200)"; FAIL=$((FAIL+1))
fi

note "2/8  pre-read on data/state.json — must BLOCK (mercury.ignore)"
echo '{"tool_input":{"file_path":"data/state.json"}}' | $CLI pre-read 2>/dev/null
expect_exit "pre-read blocks ignored path" 2 $?

note "3/8  pre-read on core/TRAIDecisionModule.js — must ALLOW"
echo '{"tool_input":{"file_path":"core/TRAIDecisionModule.js"}}' | $CLI pre-read 2>/dev/null
expect_exit "pre-read allows non-ignored path" 0 $?

note "4/8  pre-edit on data/state.json — must BLOCK (mercury.ignore)"
echo '{"tool_input":{"file_path":"data/state.json","old_string":"x","new_string":"y"}}' | $CLI pre-edit 2>/dev/null
expect_exit "pre-edit blocks ignored path" 2 $?

note "5/8  pre-edit on core/TRAIDecisionModule.js with NO prior Read — must BLOCK (forced-read)"
echo '{"tool_input":{"file_path":"core/TRAIDecisionModule.js","old_string":"x","new_string":"y"}}' | $CLI pre-edit 2>/dev/null
expect_exit "pre-edit blocks edit without prior Read" 2 $?

note "6/8  post-read records core/TRAIDecisionModule.js to ledger, then pre-edit ALLOWS"
echo '{"tool_input":{"file_path":"core/TRAIDecisionModule.js","offset":1,"limit":2000}}' | $CLI post-read
if [ -f .claude/session-state/read-ledger.json ] && grep -q 'TRAIDecisionModule' .claude/session-state/read-ledger.json; then
  printf "  PASS  ledger recorded the read\n"; PASS=$((PASS+1))
else
  printf "  FAIL  ledger did not record\n"; FAIL=$((FAIL+1))
fi
echo '{"tool_input":{"file_path":"core/TRAIDecisionModule.js","old_string":"x","new_string":"y"}}' | $CLI pre-edit 2>/dev/null
expect_exit "pre-edit allows after ledger entry" 0 $?

note "7/8  pre-bash on 'cat data/state.json' — must BLOCK (Bash bypass guard)"
echo '{"tool_input":{"command":"cat data/state.json"}}' | $CLI pre-bash 2>/dev/null
expect_exit "pre-bash blocks read-style command on ignored path" 2 $?

note "8/8  pre-bash on 'ls -la' (no ignored path) — must ALLOW"
echo '{"tool_input":{"command":"ls -la"}}' | $CLI pre-bash 2>/dev/null
expect_exit "pre-bash allows benign command" 0 $?

printf "\n────────── RESULT ──────────\n  PASS=%d  FAIL=%d\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
