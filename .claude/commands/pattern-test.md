---
description: Standard smoke test for pattern memory persistence
---

# Pattern Memory Smoke Test

## QUICK TEST COMMAND
```bash
# One-liner to verify patterns are saving
rm -f data/pattern-memory.json && timeout 15 node run-empire-v2.js > /dev/null 2>&1 && cat data/pattern-memory.json | jq '.patterns | length'
```

## FULL TEST PROTOCOL

### 1. Setup
```bash
# Backup existing patterns if needed
[ -f data/pattern-memory.json ] && cp data/pattern-memory.json data/pattern-memory.backup.json

# Clear the slate
rm -f data/pattern-memory.json
```

### 2. Run Bot (Brief)
```bash
timeout 15 node run-empire-v2.js > test.log 2>&1
```

### 3. Verify
```bash
# Check file exists
if [ ! -f data/pattern-memory.json ]; then
  echo "❌ FAIL: No pattern file created"
  exit 1
fi

# Check patterns exist
COUNT=$(cat data/pattern-memory.json | jq '.patterns | length')
if [ $COUNT -eq 0 ]; then
  echo "❌ FAIL: Pattern file empty"
  exit 1
fi

echo "✅ PASS: $COUNT patterns saved to data/pattern-memory.json"
```

## CRITICAL NOTES

⚠️ **REAL FILE**: `data/pattern-memory.json` (NOT root `pattern_memory.json`)
⚠️ **MINIMUM**: At least 1 pattern (BASE_PATTERN) should always exist
⚠️ **GROWTH**: After 30+ seconds, should see multiple patterns

## KNOWN GOTCHAS

1. **Wrong file**: Root `pattern_memory.json` is OBSOLETE - ignore it
2. **Init wipe**: Fixed in commit 353c55c (conditional memory init)
3. **Path confusion**: Always check `data/` subdirectory