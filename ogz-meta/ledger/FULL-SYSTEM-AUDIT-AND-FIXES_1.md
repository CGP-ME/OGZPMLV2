# OGZPrime FULL SYSTEM AUDIT — March 14, 2026
# Broken Plumbing Only. Gates Stay Down Until Tested.

---

## WHAT THIS DOC IS

Fixes for broken infrastructure that makes ALL test results invalid.  
These are NOT gates or thresholds — these are pipes that aren't connected.

**What this doc does NOT do:**  
Re-enable risk manager, raise confidence gates, or turn ATR filter back on.  
Those were intentionally taken down. They stay down until we have a valid  
backtest baseline, then we add them back ONE AT A TIME with testing.

---

## BUG 1 [CRITICAL] — BACKTEST_MODE Never Set

### What's broken
Backtest launches with `EXECUTION_MODE=backtest` + `CANDLE_SOURCE=file`.  
15+ downstream files check `process.env.BACKTEST_MODE === 'true'`.  
**Nobody ever sets BACKTEST_MODE.** Every downstream check fails silently.

### What it breaks
| File | What goes wrong |
|------|-----------------|
| `core/StateManager.js` | State never resets → loads stale balance from prior run |
| `core/EnhancedPatternRecognition.js` | Garbage patterns saved to disk |
| `core/PatternMemoryBank.js` | Wrong partition, wrong mode label |
| `core/CandleProcessor.js` | Historical candles flagged as "stale data" |
| `core/OrderExecutor.js` | Falls to PAPER path instead of BACKTEST sim |
| `core/tradeLogger.js` | Backtest trades logged to disk unnecessarily |
| `core/TRAIDecisionModule.js` | TRAI runs in wrong mode |
| `core/FeatureFlagManager.js` | Reports wrong mode |
| `run-empire-v2.js:8` | Silent mode doesn't activate (40K lines output) |

### The Fix — ONE LINE

**File:** `run-empire-v2.js`  
**After line 33** (after the state isolation block that sets STATE_FILE and DATA_DIR):

```js
// FIX 2026-03-14: Normalize BACKTEST_MODE for all downstream modules
// 15+ files check BACKTEST_MODE but backtest launches via EXECUTION_MODE
if (process.env.EXECUTION_MODE === 'backtest' || process.env.CANDLE_SOURCE === 'file') {
  process.env.BACKTEST_MODE = 'true';
}
```

---

## BUG 2 [CRITICAL] — initialBalance Never Stored

### What's broken
`stateManager.get('initialBalance')` returns `undefined` everywhere.  
TradingLoop line 378 falls back to `|| 10000`.  
But `stateManager.get('balance')` can be ANY value from a prior run.  
Drawdown = `(randomOldBalance - 10000) / 10000` = garbage number.  
Result: account_drawdown fires on every single trade instantly.

### The Fix — 3 small additions

**File:** `core/StateManager.js`, line 86 — Add to default state:
```js
this.state = {
    position: 0,
    positionCount: 0,
    entryPrice: 0,
    entryTime: null,
    balance: 10000,
    totalBalance: 10000,
    initialBalance: 10000,   // ADD THIS LINE
    inPosition: 0,
    // ... rest unchanged
```

**File:** `run-empire-v2.js`, line 724 — Add initialBalance to init:
```js
stateManager.updateState({
    balance: initialBalance,
    totalBalance: initialBalance,
    initialBalance: initialBalance,   // ADD THIS LINE
    activeTrades: new Map()
}, { action: 'INIT' });
```

**File:** `run-empire-v2.js`, after line 730 — Ensure it exists on restore:
```js
} else {
    console.log('✅ Using existing state - Balance:', currentState.balance, 'Trades:', currentState.activeTrades?.size || 0);
    // ADD THESE 3 LINES:
    if (!currentState.initialBalance) {
        stateManager.updateState({ initialBalance: initialBalance }, { action: 'SET_INITIAL_BALANCE' });
    }
}
```

---

## BUG 3 [CRITICAL] — Corrupted Pattern Memory

### What's broken
3,460 patterns recorded during the invalid backtest with garbage P&L data  
(all exits were `account_drawdown` after exactly 15 minutes).  
Saved to `pattern-memory.paper.json` because Bug 1 prevented save suppression.

### The Fix
**Automatically fixed by Bug 1 fix** — `BACKTEST_MODE=true` suppresses saves.

**Clean the corruption before next run:**
```bash
# Backup corrupted file
cp /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json \
   /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json.bak-corrupted

# Delete stale backtest state
rm -f /opt/ogzprime/OGZPMLV2/data/state-backtest.json
```

---

## THINGS THAT ARE NOT BUGS (Intentional Gate Changes)

These were taken down on purpose during debugging. They stay down until  
we get a valid baseline backtest, then we test them one at a time:

| What | Current State | Why it was taken down | When to revisit |
|------|--------------|----------------------|-----------------|
| Risk Manager | Bypassed (returns approved:true) | Was blocking all trades | After valid baseline |
| minTradeConfidence | 0.01 (1%) | Was blocking RSI signals | After valid baseline |
| minStrategyConfidence | 0.01 (1%) | Was blocking RSI signals | After valid baseline |
| ATR Filter | Disabled (`if false &&`) | Was killing 74% of candles | After valid baseline |

**The plan:** Fix plumbing → get valid baseline → add gates back ONE AT A TIME  
→ compare each result to baseline → keep what helps, remove what doesn't.

---

## EXECUTION ORDER

### Step 1: Bug 1 Fix (one line)
Add `process.env.BACKTEST_MODE = 'true'` normalization to `run-empire-v2.js` after line 33.

### Step 2: Bug 2 Fix (3 small additions)
Add `initialBalance` to StateManager default state and init/restore in `run-empire-v2.js`.

### Step 3: Clean State (VPS commands)
```bash
rm -f /opt/ogzprime/OGZPMLV2/data/state-backtest.json
cp /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json \
   /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json.bak-corrupted
```

### Step 4: Run Valid Backtest
```bash
EXECUTION_MODE=backtest \
CANDLE_SOURCE=file \
CANDLE_DATA_FILE=/opt/ogzprime/OGZPMLV2/data/btc-15m-2025.json \
BACKTEST_VERBOSE=true \
INITIAL_BALANCE=10000 \
node run-empire-v2.js
```

### What VALID looks like:
- `[StateManager] BACKTEST MODE: Starting with clean $10K state` at startup
- Exit reasons: `stop_loss`, `take_profit`, `trailing_stop`, `max_hold` — NOT all `account_drawdown`
- Hold times VARY — not all exactly 15.0 minutes
- No `Account drawdown: -5X%` on every trade

---

## CLAUDE CODE PROMPT

```
Read FULL-SYSTEM-AUDIT-AND-FIXES.md. Apply ONLY the plumbing fixes.
Do NOT touch risk manager, confidence gates, or ATR filter — those stay as-is.

Step 1: run-empire-v2.js — after line 33 (after the state isolation block),
add: if EXECUTION_MODE === 'backtest' or CANDLE_SOURCE === 'file',
set process.env.BACKTEST_MODE = 'true'. Commit.

Step 2: core/StateManager.js line 86 — add initialBalance: 10000 to default state.
run-empire-v2.js line 724 — add initialBalance: initialBalance to the updateState call.
run-empire-v2.js after line 730 — add initialBalance restore if missing. Commit.

That's it. 2 commits. Show me git log --oneline.
```
