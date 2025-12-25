# Lessons Digest

*Generated: 2025-12-25T16:21:27.357Z*

## Key Lessons

- ✅ Preserving features array through pipeline
- ❌ Never: String signature truncation
- ✅ StateManager is now the ONLY source of truth
- ✅ No more phantom trades or balance mismatches
- ✅ All modules read/write to same centralized state
- ✅ Bot never waits for TRAI decisions
- ✅ Can react instantly to market moves
- ✅ TRAI does post-trade learning only
- ✅ Mathematical logic drives real-time decisions
- ✅ Active trades persist across restarts
- ✅ Bot remembers exact position after crash
- ✅ No more lost trades on reboot
- ✅ Automatic save after every state update
- ✅ Full IBrokerAdapter compliance
- ✅ Position tracking via StateManager
- ✅ Account polling (compensates for no private WebSocket)
- ✅ Working solution now, native rewrite later
- ✅ No more stack overflow on rate limits
- ✅ No more promise accumulation/memory leak
- ✅ Clean queue-based retry mechanism

## Common Patterns

### pattern-memory
- Fixed feature data conversion in pattern pipeline
- Fixed feature data conversion in pattern pipeline

### recording
- Fixed feature data conversion in pattern pipeline
- Fixed feature data conversion in pattern pipeline

### state
- - **File**: `run-empire-v2.js` (multiple locations)

### trai
- - **File**: `run-empire-v2.js` lines 931-954
- - **File**: `core/StateManager.js` lines 326-385

### performance
- - **File**: `run-empire-v2.js` lines 931-954

### rate-limit
- - **File**: `kraken_adapter_simple.js` lines 109-204

