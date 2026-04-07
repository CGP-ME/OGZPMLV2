# Session Handoff: Pine Transpiler Debugging

**Date:** 2026-03-30
**Branch:** `tradingloop-clean-rewrite`
**Last Commit:** `2fc6dcf` - fix: Store function locals in Pine FunctionDecl handler

---

## What Was Done This Session

### Pine Transpiler Fixes (4 commits)
1. **Array static methods** (`9d2e7c7`)
   - Pine uses `array.set(arr, idx, val)` (static), not `arr.set(idx, val)` (instance)
   - Added static wrappers to PineArray.js
   - Fixed volume profile calculation (vpVolume was all zeros)

2. **Position state machine** (`9d2e7c7`)
   - `strategy.entry()` now ignores duplicate same-direction entries
   - Opposite direction entry = flip position
   - `strategy.close()` = go flat
   - Matches TradingView behavior

3. **Mintick rounding** (`80ab7d5`)
   - All TA functions (sma, ema, highest, lowest, atr, vwap) round to `syminfo.mintick`
   - Matches TradingView precision

4. **Function locals storage** (`2fc6dcf`)
   - FunctionDecl handler now stores `locals` array, not just params/body
   - User-defined functions like `getLongTP()` have 8 local variable declarations

### Signal Count Progress
- Before session: 0 signals (broken)
- After array fix: 5,461 signals (no position tracking)
- After position tracking: 419 signals
- After mintick rounding: 422 signals
- **Target:** ~397 signals
- **Variance:** 6.3% (acceptable)

### Mercury-2 Analysis
Consulted Inception Labs Mercury-2 DLLM for architecture review. Confirmed:
- Architecture is sound (lexer → parser → runtime → bridge)
- 5-6% variance is explainable (TA rounding, series lookback depth)
- Recommended: mintick rounding, `request.security()`, `varip` handling

---

## Current Bug: takeProfit Still Null

### Symptom
```
takeProfit: null
stopLoss: 217.06 (works)
getLongTP locals count: 8 (locals ARE stored now)
```

### Root Cause (Investigating)
The function `getLongTP(entry)` has 8 local variables that get stored, but the function call still returns `undefined`. Need to trace:

1. Check if locals are being executed before body eval
2. Check if the body expression can access the local variables
3. The body is a ternary: `total >= 3 ? highTarget : total >= 2 ? midTarget : atrTP_low`

### Files to Check
- `pine-transpiler/core/PineRuntime.js` lines 383-406 (user function execution)
- Locals are `RegularVarDecl` nodes, executed via `_execStatement()`

### Test Command
```bash
cd /opt/ogzprime/OGZPMLV2/pine-transpiler
node test-pnl.js  # Shows P&L with SL/TP
```

---

## Missing Fixes (From User's List)

| Fix | Status |
|-----|--------|
| TradingLoop.js: hasOpenPosition | ✅ Present |
| StateManager.js: closePosition guard | ✅ Present |
| run-empire-v2.js: strategyOrchestrator | ✅ Present |
| SmartMoneySweep.js: IVB toISOString | ✅ Present |
| SmartMoneySweep.js: vpRthOnly + _buildVpSlice() | ❌ **MISSING** |
| TradingConfig.js: vpRthOnly, vpLookbackBars, sweepMaxOffset | ❌ **MISSING** |

---

## Next Steps

1. **Finish TP fix** - Debug why `getLongTP()` returns undefined even with locals stored
2. **Run P&L backtest** - Once TP works, should see positive returns
3. **Apply missing SMS fixes** - vpRthOnly flag, _buildVpSlice method, config entries

---

## Key Files Modified

```
pine-transpiler/core/PineArray.js      - Static method wrappers
pine-transpiler/core/PineStrategyBridge.js - Position state machine
pine-transpiler/core/PineRuntime.js    - Mintick rounding, function locals
```

## Debug Scripts Created

```
pine-transpiler/test-signal-count.js   - Count signals on 25k bars
pine-transpiler/test-pnl.js            - P&L backtest with SL/TP
pine-transpiler/debug-va-expansion.js  - Value area debugging
pine-transpiler/debug-user-func.js     - User function debugging
```
