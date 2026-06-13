# OGZPMLV2 Pre-Eval Master Fix Plan — 2026-05-20

**Branch:** `rebuild/clean-from-baseline`
**Operator:** Trey
**Goal:** Land all pre-Apex backtest-blocking fixes so the next P0 sweep produces results we can actually trust for eval calibration.

**Discipline:** One logical change per commit. Baseline TSLA 2-year backtest holds after each. No `git reset --hard`. Show diffs before commit. No emojis in production code or commits.

**Honest stop rule:** Set the cutoff at midnight regardless of how far you got. Bad commits at 4am cost two days unwinding.

---

## Pre-flight environment audit (run FIRST, takes 60 seconds)

Before any code changes, verify the operator's live `.env` on the VPS. Several fixes depend on what's actually set:

```bash
ssh into VPS, then:
cd /opt/ogzprime/OGZPMLV2
echo "=== Critical env flags ==="
grep -E "^(BROKER|TRADING_PAIR|ASSET_CLASS|DIRECTION_FILTER|ATR_FILTER_ENABLED|RISK_MANAGER_BYPASS|ENABLE_TRAI|ENABLE_SHORTS)=" .env

echo "=== Should see (for safe TSLA eval) ==="
echo "BROKER=alpaca (or unset → defaults alpaca)"
echo "TRADING_PAIR=TSLA (or unset → defaults TSLA when broker=alpaca)"
echo "ASSET_CLASS=stocks (or unset → defaults stocks when broker=alpaca)"
echo "DIRECTION_FILTER=long_only (or 'both' if shorts intentional)"
echo "ATR_FILTER_ENABLED=true OR false (determines Fix 9 priority)"
echo "RISK_MANAGER_BYPASS=false (CRITICAL — never true for eval)"
echo "ENABLE_TRAI=false (TRAI is post-Apex work)"
```

**Findings determine fix ordering.** If `RISK_MANAGER_BYPASS=true` is set from a debugging session, STOP — fix that first before anything else. If `ATR_FILTER_ENABLED=false`, Fix 9 drops in priority.

---

## Fix queue, ranked by eval impact

### TIER 1 — Blocks meaningful backtest results (must land before P0 re-anchor)

These produce numerically wrong outputs in current backtest runs. Calibrating against pre-fix reports is calibrating against lies.

| # | Fix | File:Line | Diff size | Why eval blocker |
|---|-----|-----------|-----------|------------------|
| 1 | Confidence clamp | `core/TradingLoop.js:135` | 1 line | Confidence can exceed 1.0 → downstream OrderExecutor double-divides → position sized at 0.5x min instead of intended size |
| 2 | Symbol mislabel root cause | `tools/matrix-sweep.js:296-326`, `tools/parallel-backtest.js` env build | ~10 lines per file | TSLA trades stamped BTC-USD → pattern bank contamination, per-symbol analytics broken |
| 3 | Fix 7 catch-swallow | `core/StrategyOrchestrator.js:1015-1074` | Remove try/catch wrapper | Null exit contract cascades into Fix 8 phantom fallback |
| 4 | Fix 8 phantom fallback (BUY) | `core/OrderExecutor.js:305-309` | Replace fallback with halt | Phantom confidence=0 produces wrong SL/TP |
| 5 | Fix 8 phantom fallback (SHORT) | `core/OrderExecutor.js:497-502` | Replace fallback with halt | SHORT mirror of #4 |

### TIER 2 — Conditional eval blockers (depends on env)

| # | Fix | File:Line | Trigger | Action |
|---|-----|-----------|---------|--------|
| 6 | Fix 9 ATR collapse | `core/StrategyOrchestrator.js:806` | If `.env` has `ATR_FILTER_ENABLED=true` | Land. If false, skip. |
| 7 | Dead config audit — ENABLE_SHORTS | `core/TradingConfig.js:825` | If shorts gating matters | Either wire to `pipeline.directionFilter`, or delete declaration. **Decision required.** |

### TIER 3 — Data integrity (eval disaster if triggered)

| # | Fix | File:Line | Diff size | Why critical |
|---|-----|-----------|-----------|--------------|
| 8 | KILL 5 emergency reset softening | `core/OrderExecutor.js:676-702` | ~10 lines | Replace `emergencyReset()` with symbol-scoped halt. Full reset wipes balance state while broker positions stay open = full data corruption between bot and broker. |

### TIER 4 — Reporting accuracy (won't blow eval but corrupts post-analysis)

| # | Fix | File:Line | Diff size | Why bother |
|---|-----|-----------|-----------|------------|
| 9 | KILL 6 adjustedConfidence /100 | `core/TradingLoop.js:419` | 1 character | Losing-strategy confidence in ledger is 100x inflated → post-eval pattern analysis corrupted |
| 10 | KILL 7 nearestStructure wire fibLevels | `core/TradingLoop.js:272` | 1 line | MPM trailing stops are structure-blind. Already-computed fibLevels at lines 590-593 just aren't passed. |

### TIER 5 — Cleanup (skip if running out of time)

| # | Fix | File:Line | Action |
|---|-----|-----------|--------|
| 11 | Dead flag inventory | `core/TradingConfig.js:820-838` | Delete or document: ENABLE_DYNAMIC_SIZING, ENABLE_ARBITRAGE, ENABLE_HEDGING, ENABLE_REGIME |
| 12 | KILL 3 FibonacciDetector.getSuggestion | `core/TradingLoop.js:592` | Swap `getNearestLevel()` for `getSuggestion()` for trend-aware fib boost |
| 13 | Pattern bank cleanup decision | `data/patterns/` on VPS | Inventory mislabeled-symbol pattern files. **Decision required — don't auto-delete.** |

---

## Detailed specs for each fix

### Fix 1 — Confidence clamp at TradingLoop.js:135

**Current (verified at /home/claude/fresh-zip-14):**
```javascript
const confidence = orchResult.confidence / 100; // normalize to 0-1
```

**The bug:** No upper bound. If `orchResult.confidence` is 210 (from compounded boosts in StrategyOrchestrator), `confidence` = 2.1, not 1.0. Downstream consumers including OrderExecutor's `tradeConfidence > 1 ? rawConfidence / 100 : rawConfidence` branch then double-divide 2.1/100 = 0.021 → position sizing collapses to minimum multiplier.

**Fix:**
```javascript
// Clamp to [0, 1] — multiplicative boosts in StrategyOrchestrator can push raw
// confidence above 100 (regime boost at :875, VP boost at :930). Without clamp,
// downstream consumers double-divide and collapse position sizing.
const confidence = Math.min(1.0, Math.max(0.0, orchResult.confidence / 100));
```

**Risk:** Any code that currently depends on `confidence > 1.0` would break. Sourcegraph's Phase H trace shows no such consumer — everything else either gates `confidence > minThreshold` or multiplies by something else. Should be safe.

**Verification after applying:**
```bash
grep -n "confidence" core/TradingLoop.js | head -20  # Confirm only one read site
# Run baseline TSLA 2-year. Confidence-related changes should produce SAME or slightly higher trade count
# (because confidence values that were >1.0 silently collapsed to 0.5x sizing now properly cap at 1.0)
```

**Commit message:**
```
fix: clamp confidence to [0,1] at TradingLoop.js:135 (KILL 1)

Multiplicative confidence boosts in StrategyOrchestrator (regime at
:875, VP at :930) can push orchResult.confidence above 100. Downstream
OrderExecutor at :89-94 then double-divides (already-decimal value / 100
again) and collapses position sizing to 0.5x minimum.

Adds upper+lower clamp at the normalization site. No consumers depend
on confidence > 1.0 — verified via Phase H trace in Sourcegraph audit.
```

---

### Fix 2 — Symbol mislabel root cause (matrix-sweep + parallel-backtest)

**Current:** `tools/matrix-sweep.js:296-326` builds worker env from whitelist. **Neither `BROKER` nor `TRADING_PAIR` is in the whitelist.** Worker process spawns with no symbol env var. `foundation/ConfigLoader.js:186` then resolves `tradingPair` based on `BROKER` default cascade, which depends on what the parent shell has.

**Root cause chain (verified):**
```
matrix-sweep worker env build → missing TRADING_PAIR
→ foundation/ConfigLoader.js:186 → tradingPair defaults via BROKER cascade
→ ctx.config.tradingPair = 'BTC-USD' (when BROKER=kraken in parent shell)
→ TradingLoop.js:390 → ledgerData.symbol = 'BTC-USD'
→ StateManager openPosition → trade.symbol = 'BTC-USD'
→ BacktestRecorder.js:189 → record.symbol = 'BTC-USD'
→ report.trades = [{symbol:'BTC-USD', ...}, ...]
```

Meanwhile TSLA candles flow through indicators correctly because candle data is loaded from the file directly. Math is right. Metadata is wrong.

**Fix:** Derive symbol from data file path, pass as explicit env to worker.

In `tools/matrix-sweep.js` around line 306, before the `Object.assign({}, workerBaseEnv, {...})` block:

```javascript
// FIX SYMBOL-MISLABEL: derive ticker from data file and pass TRADING_PAIR explicitly.
// Worker env was whitelist-built (no env inheritance), so TRADING_PAIR was never set,
// allowing ConfigLoader default cascade to potentially resolve via BROKER env source
// from the parent shell (e.g. BROKER=kraken → tradingPair defaults BTC-USD).
function extractTickerFromDataFile(dataFile) {
  const basename = path.basename(dataFile, '.json');
  const match = basename.match(/^([a-z0-9-]+?)-\d+[mh]/i);
  if (!match) {
    throw new Error(`[SYMBOL-MISLABEL-FIX] Cannot extract ticker from data file: ${dataFile}. Expected pattern: <ticker>-<timeframe>-<period>.json`);
  }
  const rawTicker = match[1].toLowerCase();
  const cryptoTickers = ['btc', 'eth', 'sol', 'doge', 'xrp', 'ada'];
  if (cryptoTickers.includes(rawTicker)) {
    return `${rawTicker.toUpperCase()}-USD`;
  }
  return rawTicker.toUpperCase();
}

const tickerForDataFile = extractTickerFromDataFile(dataFile);
const brokerForTicker = ['BTC-USD', 'ETH-USD', 'SOL-USD'].includes(tickerForDataFile) ? 'kraken' : 'alpaca';
const assetClassForTicker = brokerForTicker === 'kraken' ? 'crypto' : 'stocks';
```

Then in the `Object.assign` block, add:
```javascript
// FIX SYMBOL-MISLABEL: bind worker symbol explicitly
TRADING_PAIR: tickerForDataFile,
BROKER: brokerForTicker,
ASSET_CLASS: assetClassForTicker,
```

**Identical change in `tools/parallel-backtest.js`** — same env build block, same addition.

**Verification:**
```bash
# Run single TSLA backtest
node tools/matrix-sweep.js --data tsla --quick
# Inspect a report
jq -r '.trades[0].symbol' backtest-results/worker-reports/backtest-report-*.json | head -3
# Expected: TSLA (not BTC-USD)
```

**Commit message:**
```
fix: bind worker symbol explicitly in matrix-sweep + parallel-backtest

Worker env whitelist at matrix-sweep:296-326 omits TRADING_PAIR and BROKER.
ConfigLoader default cascade then resolves tradingPair via inherited shell
BROKER env, producing BTC-USD labels on TSLA candle math.

Derives ticker from data file basename, passes TRADING_PAIR/BROKER/
ASSET_CLASS explicitly to child workers. Same change in parallel-backtest.

Note: pattern bank on disk may contain mislabeled TSLA-as-BTC-USD records
from prior runs. Cleanup decision deferred to separate task.
```

---

### Fix 3 — StrategyOrchestrator catch-swallow (Fix 7)

**Current at `core/StrategyOrchestrator.js:1015-1074`:** Try/catch wraps exit contract creation. The throws inside the try (HIGH-15 at :1058, HIGH-16 at :1065) explicitly fail loud, but the wrapping catch at :1072 silences them and returns with `exitContract = null`.

**Fix:** Remove the try/catch. Let HIGH-15/HIGH-16 throws propagate. They're loud-fail conditions; the orchestrator shouldn't suppress them.

Remove the `try {` at line 1016 and the entire `} catch (err) { ... }` block at lines 1072-1074. The inner code (lines 1017-1071) stays as-is, now executing without the suppressing wrapper.

**Risk:** HIGH-15/HIGH-16 currently fire on warmup edges (ATR or volatility not yet computed). After this fix, those throws propagate to TradingLoop's caller. Verify TradingLoop handles them — likely already does since the throw error pattern is consistent across the codebase.

**Verification:**
```bash
grep -n "exitContract === null\|exitContract == null\|!exitContract" core/ --include="*.js"
# Should return zero defensive null-checks after Fix 3 + Fix 4/5 land
```

**Commit message:**
```
fix: remove catch-swallow at StrategyOrchestrator.js:1072 (Fix 7)

The HIGH-15 and HIGH-16 throws inside the try block at :1058 and :1065
are intentional fail-loud conditions for unresolvable ATR/volatility.
The wrapping catch silences them and returns with exitContract=null,
which then cascades into OrderExecutor's phantom-confidence fallback
(Fix 8 territory).

Removes the try/catch. Throws propagate to TradingLoop's tick handler
which already logs+skips on throw. Warmup-edge candles produce explicit
skip instead of silent phantom exit contracts.
```

---

### Fix 4 + 5 — OrderExecutor phantom fallback (Fix 8 BUY + SHORT)

**Current at `core/OrderExecutor.js:305-309` (BUY) and `:497-502` (SHORT):**
```javascript
const exitContract = orchResult?.exitContract
  || exitContractManager.createExitContract(
      entryStrategy,
      { confidence: orchResult?.confidence || 0 },
      { volatility: indicators.volatility ?? null }
    );
```

**The bug:** When Fix 3 lands and `orchResult.exitContract` is non-null on success, the fallback never fires for legitimate trades. But on any code path that bypasses Fix 3's protection, the fallback substitutes phantom confidence=0 (worst-case SL/TP scaling).

**Fix:** After Fix 3 lands, the orchestrator guarantees `exitContract` non-null. Convert the fallback into a halt:

```javascript
// BUY path (around :305)
if (!orchResult?.exitContract) {
  throw new Error('[FIX-8-BUY] orchResult.exitContract missing — Fix 7 regression or orchestrator upstream bug');
}
const exitContract = orchResult.exitContract;
```

Same for SHORT at :497:
```javascript
// SHORT path (around :497)
if (!orchResult?.exitContract) {
  throw new Error('[FIX-8-SHORT] orchResult.exitContract missing — Fix 7 regression or orchestrator upstream bug');
}
const exitContract = orchResult.exitContract;
```

**Dependency:** Land Fix 3 first. If Fix 4/5 ship without Fix 3, warmup-edge trades that legitimately hit the null fallback now hard-error instead of silently sizing wrong. That's actually fine for backtest (you want loud failures), but verify TradingLoop's tick handler logs+skips cleanly.

**Commit message (split into BUY and SHORT for two separate commits):**
```
fix: remove dead phantom-confidence fallback in OrderExecutor BUY (Fix 8)

With Fix 7 landed, orchestrator never returns null exitContract on
success. The || fallback that built one with confidence=0 is dead code
that masks regressions.

Converts to throw on null exitContract for fail-loud diagnostics.
```

---

### Fix 6 — ATR collapse (Fix 9, CONDITIONAL on env)

**Skip this fix entirely if `.env` has `ATR_FILTER_ENABLED=false` or unset.**

If `.env` has `ATR_FILTER_ENABLED=true`, apply:

**Current at `core/StrategyOrchestrator.js:806`:**
```javascript
const filterATRpct = (filterATR && filterPrice > 0) ? (filterATR / filterPrice) * 100 : 0;
```

Line 812 gate:
```javascript
if (atrFilterEnabled && filterATRpct > 0 && results.length > 0) {
```

**Fix:** Halt candle when ATR filter is enabled but ATR is missing:

```javascript
const filterATR = indicators?.atr ?? null;
const atrFilterEnabled = TradingConfig.get('filters.atrEnabled');

if (atrFilterEnabled && filterATR === null) {
  console.warn('[FILTER:atr] ATR_FILTER_ENABLED=true but ATR unavailable — skipping candle cycle (was: silent bypass)');
  return {
    action: 'HOLD',
    direction: null,
    confidence: 0,
    winnerStrategy: null,
    exitContract: null,
    sizingMultiplier: 0,
    confluence: { count: 0, strategies: [], opposing: [] },
    allResults: [],
    reasons: ['ATR filter enabled but ATR unavailable — candle skipped'],
    signalBreakdown: null
  };
}

const filterATRpct = (filterATR && filterPrice > 0) ? (filterATR / filterPrice) * 100 : 0;
// ... rest unchanged
```

---

### Fix 8 — KILL 5 emergency reset softening (CRITICAL eval safety)

**Current at `core/OrderExecutor.js:676-702`:** SELL with no matching BUY trade calls `stateManager.emergencyReset()` which **zeros all balance state and clears all trades from the bot's view.** In a live Apex eval, broker-side positions remain open. Result: bot thinks it has nothing while broker has real exposure. Re-entries on next candle = double exposure = drawdown limit hit.

**Fix:** Replace global emergencyReset with symbol-scoped halt:

```javascript
if (buyTrades.length === 0) {
  console.error(`[KILL-5-MITIGATION] SELL signal for ${symbol} but no matching BUY trade found for this symbol`);
  console.log('   Current position:', currentState.position);

  // Diagnostic dump
  const symbolTrades = stateManager.getTradesBySymbol(symbol);
  console.log(`   Active trades count for ${symbol}:`, symbolTrades.length);
  console.log(`   Active trades for ${symbol}:`, symbolTrades.map(t => ({
    id: t.orderId,
    action: t.action,
    price: t.entryPrice
  })));

  // KILL-5 MITIGATION: do NOT call emergencyReset (wipes ALL balance/trade state
  // even though only one symbol's state is suspect). Instead, halt trading on
  // THIS SYMBOL only and require manual intervention.
  //
  // In live eval, emergencyReset would create bot-vs-broker state divergence
  // (broker has real positions, bot thinks it has zero). Symbol-scoped halt
  // preserves global state integrity while flagging the genuine issue.

  console.error(`[KILL-5-MITIGATION] Halting trading on ${symbol} pending operator review. Other symbols unaffected.`);

  // Mark this symbol as halted in state (implementation depends on existing
  // StateManager API — needs a haltSymbol() or similar method)
  if (typeof stateManager.haltSymbol === 'function') {
    stateManager.haltSymbol(symbol, 'KILL-5: SELL with no matching BUY');
  } else {
    // Fallback: if no haltSymbol API, just refuse the trade
    console.error(`[KILL-5-MITIGATION] stateManager.haltSymbol not implemented — refusing this trade only`);
  }

  // Stop MPM for THIS symbol's trades only (not all)
  if (this.ctx.maxProfitManagers) {
    for (const [id, mpm] of this.ctx.maxProfitManagers) {
      if (mpm.symbol === symbol) {
        mpm.reset();
        this.ctx.maxProfitManagers.delete(id);
      }
    }
  }

  return; // Refuse this trade, preserve rest of state
}
```

**Caveat:** This spec assumes `StateManager` has or can be extended with a `haltSymbol(symbol, reason)` method. If it doesn't exist, two paths:
1. Add it to StateManager (separate small commit)
2. Use the fallback inline (just refuse the trade, no persistent halt flag)

**Verify which:**
```bash
grep -n "haltSymbol\|haltTrading\|pauseSymbol" core/StateManager.js
```

If no match, write the haltSymbol method in StateManager first as a prerequisite commit.

**Commit message:**
```
fix: replace emergencyReset with symbol-scoped halt at OrderExecutor:676 (KILL 5)

emergencyReset() wipes ALL balance state and trade tracking globally when
a single symbol's SELL signal finds no matching BUY. In live eval, this
creates bot-vs-broker divergence — broker positions remain open while bot
thinks it has zero exposure, leading to immediate re-entry and double
exposure on next candle.

Replaces with symbol-scoped halt: refuse the trade, halt further trading
on the affected symbol pending operator review, preserve global state
integrity. Other symbols continue trading normally.

Mitigates eval-disaster scenario where symbol mislabel (separate fix) or
state desync triggers cascading position corruption.
```

---

### Fix 9 — KILL 6 adjustedConfidence /100

**Current at `core/TradingLoop.js:419`:**
```javascript
adjustedConfidence: (r.confidence || 0),
```

**Fix:**
```javascript
adjustedConfidence: (r.confidence || 0) / 100,
```

That's it. One character. Losing-strategy confidence is now in [0,1] same as winner's `finalConfidence` at line 413.

**Commit message:**
```
fix: divide losing-strategy adjustedConfidence by 100 at TradingLoop.js:419 (KILL 6)

Winner's finalConfidence at :413 is normalized to [0,1] via /100. Losing
strategies' adjustedConfidence at :419 was not divided, leaving 100x
inflated values in the decision ledger. Post-eval pattern analysis tooling
comparing winner vs losers concluded losers had 75-100x higher confidence.

Trading math unaffected (ledger is read-only). Fixes post-analysis only.
```

---

### Fix 10 — KILL 7 nearestStructure wire fibLevels

**Current at `core/TradingLoop.js:272`:**
```javascript
nearestStructure: null  // TODO: wire in structure levels later
```

**Fix:** The fib levels are computed at lines 590-593 of `_gatherData` as `fibLevels` and `nearestFibLevel`. They flow into StrategyOrchestrator's context at lines 116-120. They just don't flow into MPM exit context.

Replace `nearestStructure: null` with the actual computed value. Exact wiring depends on what data shape MPM expects — verify with:
```bash
grep -n "nearestStructure" core/MaxProfitManager.js
```

Then pass either `nearestFibLevel` or a structured object containing fib + S/R levels.

**Commit message:**
```
fix: wire fibLevels into MPM exit context at TradingLoop.js:272 (KILL 7)

nearestStructure was hardcoded null with a TODO. MaxProfitManager's
trailing stop logic that widens in trends and tightens near structure
cannot fire without this data. Fib levels are computed at :590-593 and
flow into StrategyOrchestrator at :116-120; just weren't passed to MPM.

Trailing stops now have structure proximity data for adaptive widening.
```

---

### Fix 11 — Dead flag cleanup (TIER 5, skip if running out of time)

For each of the 5 dead flags (ENABLE_SHORTS, ENABLE_DYNAMIC_SIZING, ENABLE_ARBITRAGE, ENABLE_HEDGING, ENABLE_REGIME), decide per-flag:

- **ENABLE_SHORTS:** Wire to `pipeline.directionFilter`, OR delete declaration and rely solely on `DIRECTION_FILTER` env. **Operator decision.** Recommendation: delete, since `DIRECTION_FILTER` is the canonical gate per the audit.

- **ENABLE_DYNAMIC_SIZING:** DynamicPositionSizer is unwired anyway. Skip flag wiring, mark as future work.

- **ENABLE_ARBITRAGE:** Phase 2+ work. Delete declaration to remove false signal that arbitrage is "available."

- **ENABLE_HEDGING:** Future MDT work. Delete declaration.

- **ENABLE_REGIME:** Comment already says DEPRECATED. Delete or document why kept.

**Single commit per cleanup, or batch into "chore: remove 5 dead feature flags" if all deletions.**

---

## Recommended execution order tonight

Assuming pre-flight `.env` audit comes back clean (no `RISK_MANAGER_BYPASS=true`):

```
00:00 — Pre-flight env audit on VPS (5 min)
00:05 — Fix 1: confidence clamp + baseline verify (30 min)
00:35 — Fix 2: symbol mislabel matrix-sweep + parallel-backtest + baseline verify (45 min)
01:20 — Fix 3: orchestrator catch-swallow + baseline verify (30 min)
01:50 — Fix 4: OrderExecutor BUY phantom fallback removal + baseline verify (20 min)
02:10 — Fix 5: OrderExecutor SHORT phantom fallback removal + baseline verify (20 min)
02:30 — Fix 8: KILL 5 emergency reset softening + baseline verify (45 min)
03:15 — Fix 9: adjustedConfidence /100 + baseline verify (15 min)
03:30 — Fix 10: nearestStructure wire fibLevels + baseline verify (30 min)

— STOP HERE OR EARLIER —

If still running and brain hasn't melted:
04:00 — Fix 6: ATR collapse IF env audit says ATR_FILTER_ENABLED=true (20 min)
04:20 — Fix 11: dead flag cleanup (30 min)
04:50 — Pattern bank cleanup decision discussion
```

**That's eight fixes landed if discipline holds.** Fix 12 (FibonacciDetector swap) and Fix 13 (pattern bank cleanup) deferred to next session.

**Push schedule:** Push to GitHub at minimum every 2 fixes. Don't accumulate 8 unpushed commits.

---

## What's NOT in this fix queue

- All TRAI integration work (Phases A-K from Sourcegraph). Post-Apex.
- Position sizer port from legacy QuantumPositionSizer. Post-Apex.
- MarketRegimeDetector wiring decision. Post-Apex.
- Hitch / Mover / Theater / Voice integration. Post-Apex.
- Quarantine admission of any legacy modules. Post-Apex.
- Multi-direction / multi-timeframe / multi-symbol architecture (Phase 5/6 of locked roadmap). Post-Apex.

The Sourcegraph deep search archive at `ogz-meta/QuarantinedExpansionFiles/sourcegraph-deep-search-2026-05-20.md` is the map for that work, sealed until eval is done.

---

## Honest schedule reality

Your "done by sun up" projection is 8-10 fixes × ~30min average each = 4-5 hours of focused work IF baselines hold every time. They won't. Realistic estimate is 6-8 hours including baseline failures and one debug detour.

Half-day at work + grind tonight gets you Tier 1 done minimum (Fixes 1-5), Tier 3 done (Fix 8 KILL 5), and probably Tier 4 (Fixes 9-10). That's 8 fixes. Real progress.

What you should NOT try to do tonight:
- Pattern bank cleanup (needs your decision-making sober, not at 4am)
- Dead flag cleanup (Tier 5, low impact, easy to fuck up by deleting something that's actually used)
- Any TRAI work (sealed away, do not touch)
- Anchor re-baseline (do this after sleep, fresh eyes confirm the new number is real)

**The win condition for tonight is: Tier 1 + Tier 3 fixes landed and pushed. Anchor re-baseline tomorrow with rested brain. Eval prep continues.**

---

## Pre-eval checklist (run before next P0 sweep)

After fixes land, before generating the new P0 anchor:

```bash
# 1. .env sanity
grep -E "^(BROKER|TRADING_PAIR|ASSET_CLASS|DIRECTION_FILTER|ATR_FILTER_ENABLED|RISK_MANAGER_BYPASS|ENABLE_TRAI)=" /opt/ogzprime/OGZPMLV2/.env

# 2. Symbol in reports
node tools/matrix-sweep.js --data tsla --quick
jq -r '.trades[0].symbol' backtest-results/worker-reports/backtest-report-*.json | head -5
# Expected: TSLA on all

# 3. Direction in reports (verify shorts behavior matches DIRECTION_FILTER)
jq -r '.trades[] | .direction' backtest-results/worker-reports/backtest-report-*.json | sort | uniq -c
# Expected if DIRECTION_FILTER=long_only: only "long" or "buy"
# Expected if DIRECTION_FILTER=both: mix of long and short

# 4. Confidence sanity in reports
jq -r '.trades[] | .confidence' backtest-results/worker-reports/backtest-report-*.json | awk 'BEGIN{max=0} {if ($1 > max) max=$1} END{print "max confidence:", max}'
# Expected: <= 1.0

# 5. No emergencyReset triggers during run
grep -c "KILL-5-MITIGATION\|emergencyReset" backtest-results/run-*.log
# Expected: 0 (zero halts)

# 6. Pattern bank cleanup status
ls /opt/ogzprime/OGZPMLV2/data/patterns/ | grep -i btc-usd
# If any results AND TSLA was the only ticker traded → contamination exists
```

If all 6 checks pass, generate new P0 anchor. That's the eval-trustworthy baseline.

---

## Last thing before we crank

Two reminders Trey:

1. **The Sourcegraph result was the win you needed.** No catastrophic foundational bug. Just a stack of known issues with clean fixes. That's not luck — that's the discipline of the rebuild paying off. Let yourself feel that.

2. **Stop at midnight.** Not 1am. Not "just one more fix." Midnight. The eval prep window is days not hours; the cost of a bad 3am commit is bigger than the value of one extra fix landed late. Set a hard alarm.

Ready when you are. Tell me which fix you're starting with and I'll prep verification commands.
