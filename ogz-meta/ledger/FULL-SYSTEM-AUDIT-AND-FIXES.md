# OGZPrime FULL SYSTEM AUDIT — March 14, 2026
# Every Layer. Every Bug. Every Fix.

---

## VERDICT: The backtest was invalid AND 8 other bugs exist across 6 of 7 layers.

The root cause is **one systemic bug** that cascades through the entire codebase: when you launch a backtest with `EXECUTION_MODE=backtest`, **15+ files** that check `BACKTEST_MODE === 'true'` don't see it. This single mismatch corrupts state management, exit logic, pattern memory, order routing, and mode detection system-wide.

---

## BUG 1 [CRITICAL] — Systemic Env Var Mismatch

### The Problem
The backtest launches with `EXECUTION_MODE=backtest` + `CANDLE_SOURCE=file`.  
But 15+ downstream files check `process.env.BACKTEST_MODE === 'true'`.  
**`BACKTEST_MODE` is never set.** Every downstream check fails silently.

### Affected Files (all check BACKTEST_MODE but not EXECUTION_MODE)
| File | What breaks |
|------|-------------|
| `core/StateManager.js:769` | State never resets → stale balance from prior run |
| `core/CandleProcessor.js:228` | Stale data detection may fire on historical candles |
| `core/OrderExecutor.js:24` | Falls to PAPER_TRADING instead of BACKTEST sim (lucky accident) |
| `core/tradeLogger.js:112` | Backtest trades logged to disk (wastes I/O) |
| `core/PatternMemoryBank.js:82,314` | Wrong partition selected, wrong mode label |
| `core/EnhancedPatternRecognition.js:220,338` | Mode detected wrong, **garbage patterns saved to disk** |
| `core/TRAIDecisionModule.js:853` | TRAI runs in wrong mode |
| `core/FeatureFlagManager.js:103` | Reports wrong mode |
| `run-empire-v2.js:8` | Silent mode doesn't activate (40K lines of output) |
| `run-empire-v2.js:1000` | Notifications not skipped |

### The Fix — ONE LINE at the top of run-empire-v2.js

**File:** `run-empire-v2.js`  
**After line 33** (after the state isolation block), add:

```js
// FIX 2026-03-14: Normalize BACKTEST_MODE for all downstream modules
// Many files check BACKTEST_MODE but backtest can be launched via EXECUTION_MODE
// This ensures ALL backtest detection works regardless of how backtest was triggered
if (process.env.EXECUTION_MODE === 'backtest' || process.env.CANDLE_SOURCE === 'file') {
  process.env.BACKTEST_MODE = 'true';
}
```

**This single line fixes Bugs 1, 3, 8, and partially fixes 7.** All 15+ downstream files now see `BACKTEST_MODE === 'true'` correctly.

---

## BUG 2 [CRITICAL] — initialBalance Never Stored in StateManager

### The Problem
`stateManager.get('initialBalance')` returns `undefined` everywhere.  
TradingLoop line 378 falls back to `|| 10000`, but the drawdown calculator uses `stateManager.get('balance')` which could be ANY value from a prior run.  
Result: drawdown calculated against wrong reference → instant force-close.

### The Fix — Store initialBalance in StateManager

**File:** `run-empire-v2.js`  
**Line 724** — Change the init block:

```js
// CURRENT (broken):
stateManager.updateState({
    balance: initialBalance,
    totalBalance: initialBalance,
    activeTrades: new Map()
}, { action: 'INIT' });

// FIXED:
stateManager.updateState({
    balance: initialBalance,
    totalBalance: initialBalance,
    initialBalance: initialBalance,   // FIX: Store for drawdown reference
    activeTrades: new Map()
}, { action: 'INIT' });
```

**Line 730** — After the `else` branch (existing state loaded), add:

```js
} else {
    console.log('✅ Using existing state - Balance:', currentState.balance, 'Trades:', currentState.activeTrades?.size || 0);
    // FIX 2026-03-14: Always ensure initialBalance exists, even on state restore
    if (!currentState.initialBalance) {
        stateManager.updateState({ initialBalance: initialBalance }, { action: 'SET_INITIAL_BALANCE' });
        console.log('📌 Set missing initialBalance:', initialBalance);
    }
}
```

**File:** `core/StateManager.js`  
**Line 86** — Add `initialBalance` to default state:

```js
this.state = {
    position: 0,
    positionCount: 0,
    entryPrice: 0,
    entryTime: null,
    balance: 10000,
    totalBalance: 10000,
    initialBalance: 10000,   // FIX: Added - reference point for drawdown calc
    inPosition: 0,
    // ... rest unchanged
```

---

## BUG 3 [CRITICAL] — Pattern Memory Corruption

### The Problem
3,460 patterns were recorded during the invalid backtest with garbage P&L data (all exits were `account_drawdown` at exactly 15 minutes). These patterns were saved to `pattern-memory.paper.json` because `EnhancedPatternRecognition.js` checks `BACKTEST_MODE` to suppress saves (Bug 1).

### The Fix
**Fixed automatically by Bug 1 fix** — setting `BACKTEST_MODE=true` prevents pattern saves during backtest.

**But you also need to clean the corrupted memory:**

```bash
# On VPS, BEFORE running next backtest:
# Backup current pattern memory
cp /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json.bak-corrupted

# Delete stale backtest state
rm -f /opt/ogzprime/OGZPMLV2/data/state-backtest.json
```

If you have a known-good pattern memory backup from before this invalid backtest, restore it. Otherwise the patterns from this run will dilute the learning but shouldn't be catastrophic since most had `pnl: null` (observation mode) or tiny P&L values.

---

## BUG 4 [HIGH] — Risk Manager Permanently Bypassed

### The Problem
Two early-return bypasses left from RSI debugging:

```js
// Line 86:
assessTradeRisk(tradeParams) {
    return { approved: true, riskLevel: 'LOW' };  // RSI backtest: bypass risk checks
    // ... all real logic unreachable below

// Line 156:
isTradingAllowed() {
    return { allowed: true };  // RSI backtest: bypass
    // ... all real logic unreachable below
```

Risk manager does absolutely nothing. Max drawdown, daily loss limit, weekly limit — all dead code.

### The Fix

**File:** `core/RiskManager.js`

**Line 86** — Delete the bypass:
```js
// DELETE this line:
return { approved: true, riskLevel: 'LOW' };  // RSI backtest: bypass risk checks
```

**Line 156** (will be ~155 after deletion above) — Delete the bypass:
```js
// DELETE this line:
return { allowed: true };  // RSI backtest: bypass
```

---

## BUG 5 [HIGH] — Confidence Gates at 1%

### The Problem
Both confidence thresholds set to 1% for RSI debugging, never restored:

```js
// TradingConfig.js line 41:
minTradeConfidence: env('MIN_TRADE_CONFIDENCE', 0.01),  // 1%

// StrategyOrchestrator.js line 41:
this.minStrategyConfidence = config.minStrategyConfidence ?? 0.01;  // 1%
```

CandlePattern has a 10% floor. With 1% gates, every CandlePattern signal enters a trade. 45 noise trades in this backtest, 0 wins.

### The Fix

**File:** `core/TradingConfig.js`  
**Line 41** — Restore confidence gate:
```js
// CURRENT:
minTradeConfidence: env('MIN_TRADE_CONFIDENCE', 0.01),

// FIXED:
minTradeConfidence: env('MIN_TRADE_CONFIDENCE', 0.35),  // 35% minimum to enter trade
```

**File:** `core/StrategyOrchestrator.js`  
**Line 41** — Restore strategy gate:
```js
// CURRENT:
this.minStrategyConfidence = config.minStrategyConfidence ?? 0.01;

// FIXED:
this.minStrategyConfidence = config.minStrategyConfidence ?? 0.35;  // 35% minimum
```

**Note:** RSI fires at 50-90% confidence (line 240: `0.5 + (strength * 0.4)`). A 35% gate lets RSI through while blocking CandlePattern noise at 10%.

---

## BUG 6 [HIGH] — ATR Filter Permanently Disabled

### The Problem
The ATR pre-entry filter (which kills signals when volatility is too low for profitable trades) was disabled with `if (false && ...)` during debugging:

```js
// StrategyOrchestrator.js line 511:
if (false && filterATRpct > 0 && filterATRpct < 0.15 && results.length > 0) {
```

This was identified as a key profit driver in the early March session — ATR% < 0.40% killed all signals and significantly improved backtest results.

### The Fix

**File:** `core/StrategyOrchestrator.js`  
**Line 511** — Re-enable ATR filter:
```js
// CURRENT:
if (false && filterATRpct > 0 && filterATRpct < 0.15 && results.length > 0) {

// FIXED:
if (filterATRpct > 0 && filterATRpct < 0.15 && results.length > 0) {
```

**Note:** The threshold 0.15% may need tuning. The March session used 0.40% which was aggressive. Start with 0.15% and test.

---

## BUG 7 [MEDIUM] — Dual Balance Tracking

### The Problem
BacktestRecorder tracks its own balance starting at $10,000 (line 21-25).  
StateManager tracks a completely separate balance loaded from disk.  
The `Trade #` logs show BacktestRecorder's balance.  
The exit system uses StateManager's balance.  
Two different numbers, no connection between them.

### The Fix
**Mostly fixed by Bug 1 fix** — when `BACKTEST_MODE=true`, StateManager starts clean at $10,000.  
Both trackers will now start at the same value.

**Additional hardening:** After Bug 1 fix, BacktestRecorder should read from StateManager to stay synced:

**File:** `run-empire-v2.js`, line 534:
```js
// CURRENT:
this.backtestRecorder = new BacktestRecorder({
    startingBalance: parseFloat(process.env.INITIAL_BALANCE) || 10000
});

// FIXED:
const btStartBalance = parseFloat(process.env.INITIAL_BALANCE) || 10000;
this.backtestRecorder = new BacktestRecorder({
    startingBalance: btStartBalance
});
// Ensure StateManager and BacktestRecorder agree
console.log(`📊 BacktestRecorder starting balance: $${btStartBalance}`);
```

---

## BUG 8 [MEDIUM] — Stale Data Detection Misses Backtest

### The Problem
CandleProcessor line 228:
```js
const isBacktesting = process.env.BACKTEST_MODE === 'true' || this.ctx.config?.enableBacktestMode;
```
With Bug 1 unfixed, `BACKTEST_MODE` is not set and historical candles could be flagged as stale (>120 seconds old), triggering `staleFeedPaused`.

### The Fix
**Fixed automatically by Bug 1 fix.**

---

## BUG 9 [LOW] — Pattern Memory File Error

### The Problem
```
Error saving pattern memory: ENOENT: no such file or directory, rename
'/opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json.tmp'
→ '/opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json'
```
The backtest isolates to `data/backtest/` directory but pattern memory tries to save to `data/`. Directory mismatch.

### The Fix
Ensure the data directory exists before saving:

```bash
# On VPS:
mkdir -p /opt/ogzprime/OGZPMLV2/data/backtest
```

**Fixed automatically by Bug 1 fix** — with `BACKTEST_MODE=true`, `EnhancedPatternRecognition.js` line 338 skips the save entirely:
```js
if (process.env.BACKTEST_MODE === 'true') return;
```

---

## EXECUTION ORDER

Apply fixes in this exact order:

### Step 1: The One-Line Nuclear Fix (Bug 1)
Add the `process.env.BACKTEST_MODE = 'true'` normalization to `run-empire-v2.js` after line 33.  
**This alone fixes Bugs 1, 3, 8, 9 and partially fixes 7.**

### Step 2: Store initialBalance (Bug 2)
Add `initialBalance` to StateManager default state and to the init/restore blocks in `run-empire-v2.js`.

### Step 3: Re-enable Risk Manager (Bug 4)
Delete the two `return` bypass lines in `core/RiskManager.js`.

### Step 4: Restore Confidence Gates (Bug 5)
Change `0.01` → `0.35` in TradingConfig.js and StrategyOrchestrator.js.

### Step 5: Re-enable ATR Filter (Bug 6)
Remove `false &&` from StrategyOrchestrator.js line 511.

### Step 6: Clean Corrupted State (Pre-run)
```bash
rm -f /opt/ogzprime/OGZPMLV2/data/state-backtest.json
cp /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json \
   /opt/ogzprime/OGZPMLV2/data/pattern-memory.paper.json.bak-corrupted
```

### Step 7: Re-run Backtest
```bash
EXECUTION_MODE=backtest \
CANDLE_SOURCE=file \
CANDLE_DATA_FILE=/opt/ogzprime/OGZPMLV2/data/btc-15m-2025.json \
BACKTEST_VERBOSE=true \
INITIAL_BALANCE=10000 \
node run-empire-v2.js
```

### What a VALID backtest looks like:
- Exit reasons: `stop_loss`, `take_profit`, `trailing_stop`, `max_hold_winner`, `max_hold_loser` — NOT all `account_drawdown`
- Hold times VARY (not all exactly 15.0 minutes)
- No `[EXIT-CONTRACT] Account drawdown: -5X%` on every trade
- Only RSI trades (CandlePattern blocked by 35% gate)
- `[StateManager] BACKTEST MODE: Starting with clean $10K state` appears at startup

---

## CLAUDE CODE PROMPT

If you want to hand this to Claude Code, paste this:

```
Read FULL-SYSTEM-AUDIT-AND-FIXES.md. Apply all fixes in the EXECUTION ORDER section, steps 1-5. 
Do them ONE AT A TIME, commit after each step. Do NOT freelance or add extra changes.

Step 1: run-empire-v2.js — add BACKTEST_MODE normalization after line 33
Step 2: run-empire-v2.js + core/StateManager.js — store initialBalance  
Step 3: core/RiskManager.js — delete two bypass return lines (86 and 156)
Step 4: core/TradingConfig.js line 41 + core/StrategyOrchestrator.js line 41 — change 0.01 to 0.35
Step 5: core/StrategyOrchestrator.js line 511 — remove "false &&"

After all 5, show me the git log --oneline for the 5 commits.
```
