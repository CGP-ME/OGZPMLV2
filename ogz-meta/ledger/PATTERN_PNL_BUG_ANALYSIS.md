# 🐛 Pattern Memory PnL=0 Bug — Root Cause Analysis

## The Bug
Pattern memory entries consistently save with `pnl = 0`, `wins = 0`, `losses = 0`,
corrupting the pattern bank so it can never learn.

## Root Cause: TWO COMPETING PATTERN SYSTEMS

There are **two completely separate** pattern memory systems that don't talk to each other:

### System 1: EnhancedPatternRecognition (the one run-empire uses)
- **File**: `core/EnhancedPatternRecognition.js`
- **Storage**: `data/pattern-memory.{paper|live|backtest}.json`
- **Schema**: `{ timesSeen, totalPnL, wins, losses, results: [{pnl, timestamp}] }`
- **Key format**: Feature vector joined by commas: `"0.58,12.30,1,0.02,0.01,0.65,0.12,0.03,0"`
- **Recording**: `this.patternChecker.recordPatternResult(features[], {pnl, timestamp})`
- **Called at**: Trade EXIT in run-empire-v2.js line ~2690

### System 2: OptimizedTradingBrain.patternMemory (legacy, writes to root)
- **File**: `core/OptimizedTradingBrain.js`
- **Storage**: `./pattern_memory.json` (ROOT directory, not data/)
- **Schema**: `{ trades: [{id, direction, entryPrice, confidence}], successRate, avgProfit }`
- **Key format**: Pattern type names: `"BUY_91201"` or `"bullish_engulfing"`
- **Recording**: `this.patternMemory.set(key, ...)` via PersistentPatternMap
- **Called at**: Trade ENTRY in Brain.trackTrade() line ~602

### The Collision
- Brain System 2 records on **ENTRY** with no PnL (just `{entryPrice, confidence}`)
- Brain System 2's `updatePatternLearning()` at line 2106 records at EXIT with actual PnL
- **BUT** `Brain.closePosition()` is **NEVER CALLED** from run-empire-v2.js
- run-empire handles closing directly via `stateManager.closePosition()`, bypassing the Brain entirely
- So System 2 only ever has ENTRY records with no PnL → `successRate: 0, avgProfit: 0`

Meanwhile:
- System 1 (EnhancedPatternRecognition) records at EXIT with real PnL
- System 1 writes to `data/pattern-memory.paper.json` (or live/backtest)
- But whoever looks at `./pattern_memory.json` (root) sees System 2's zero-PnL data

## The Data on Disk

**pattern_memory.json** (root — System 2, the broken one):
```json
{
  "": {
    "trades": [{"id": "trade_17654...", "direction": "buy", "entryPrice": 92435.3, "confidence": 0.5926}],
    "successRate": 0,
    "avgProfit": 0
  }
}
```
Single entry with empty-string key, no PnL, one trade with entry data only.

**data/pattern-memory.{mode}.json** (System 1 — the correct one):
This is where the actual PnL-bearing records go. But if it's empty or not being read by
anything that matters, the pattern learning is effectively dead.

## Why It Keeps Getting Corrupted

1. Brain.trackTrade() is called on BUY → writes entry to `./pattern_memory.json` with no PnL
2. Brain.closePosition() would update it with PnL, but **it's never called**
3. run-empire closes via stateManager.closePosition() instead
4. run-empire records to EnhancedPatternRecognition (System 1) with real PnL
5. But System 1 saves to a different file (`data/pattern-memory.paper.json`)
6. Anything reading `./pattern_memory.json` sees only zero-PnL entries

## The Fix

### Option A: Kill System 2 (Recommended — lean and mean)
System 2 in OptimizedTradingBrain is legacy dead code. It never gets exit data.

In `core/OptimizedTradingBrain.js`:

1. **Line ~239**: Remove or comment out:
```javascript
// REMOVED: Legacy pattern memory - replaced by EnhancedPatternRecognition
// this.patternMemory = new PersistentPatternMap('./pattern_memory.json');
this.patternMemory = null;
```

2. **Line ~594-607** (in trackTrade): Comment out the entire pattern recording block:
```javascript
// REMOVED: Legacy entry-only recording (never gets exit PnL)
// if (patterns && patterns.length > 0) { ... }
```

3. **Line ~2146-2161** (in updatePatternLearning): Already dead — never called because
   Brain.closePosition() is never invoked. Can leave as-is or clean up.

4. **Delete**: `./pattern_memory.json` and `./pattern_memory.backup.json` from root.

### Option B: Wire Brain.closePosition into run-empire
Would require refactoring the entire exit path. NOT recommended — System 1 already works
and recording at exit with real PnL. Just make sure the bot reads from System 1.

### Option C: Both systems, deduplicated
Not worth the complexity. Kill System 2.

## After the Fix

- EnhancedPatternRecognition (System 1) is the ONLY pattern memory
- It records at trade EXIT with real percentage PnL
- Saves to `data/pattern-memory.{mode}.json`
- Pattern bank actually learns: wins increment, totalPnL accumulates, similar patterns get scored
- `getPatternKey()` uses the 9-element feature vector, not pattern names
- evaluatePattern() returns confidence based on historical win rates
