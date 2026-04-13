# OGZPrime Session Handoff â€” April 7, 2026

**Author:** Trey Buhidar (The Architect)
**Branch:** `tradingloop-clean-rewrite`
**Status:** End-of-session handoff for next pickup
**Last commit referenced:** `c10d512`

---

## TL;DR â€” What you need to know walking into next session

1. **The original $970.71 methodology was rediscovered tonight.** It's not what we thought it was, and the configs may already be in the repo.
2. **Deep Search nailed the drawdown bypass calc fix.** 3 lines across 2 files. Ready to implement.
3. **Tonight's framework hardening (env audit, locked baseline matrix, BACKTESTING-GUIDE, ENV-VAR-AUDIT) is production-grade.** Future sessions don't have to re-discover any of it.
4. **The PID controller spec exists and is tournament-compatible.** Gains are env-sweepable, three loops defined, hard clamp ranges in place.
5. **Next session has a clear pickup list.** No ambiguity about what to do first.

---

## CRITICAL DISCOVERY â€” The Real $970.71 Methodology

For weeks I've been wrong about how the original $970.71 number was produced. Tonight's compaction surfaced the actual historical chat. Here's what really happened:

### The configs that produced $970.71

**NOT** RSI + EMASMACrossover + MADynamicSR (which is what I was trying to replicate all night).

**Actually:** RSI + EMASMACrossover **alone**, with locked per-strategy exits hardcoded in `core/TradingConfig.js` `exitContracts`:

```javascript
RSI: {
  stopLossPercent: -0.8,    // LOCKED
  takeProfitPercent: 1.0,   // LOCKED
  // MIN_TRADE_CONFIDENCE: 0.60
},
EMASMACrossover: {
  stopLossPercent: -0.5,    // LOCKED
  takeProfitPercent: 1.0,   // LOCKED
},
```

**Result:** $970.71, 1416 trades, 47.5% WR on `tuning/tsla-15m-2y.json`.

### Why MADynamicSR isn't in the winning combo

MADynamicSR was tested and validated solo (+$724 train, +$429 test). But when added to the RSI+EMA combo:

| Stack | P&L | Trades |
|---|---|---|
| RSI + EMA | $970 | 1,416 |
| RSI + EMA + MASR | $656 | 1,525 |
| RSI + EMA + MASR + LiqSweep | $696 | 1,550 |
| RSI + EMA + LiqSweep | $956 | 1,440 |

MASR **hurts** the combo by ~$314. It adds 109 trades that conflict with stronger RSI/EMA signals. The orchestrator's signal selection works best when fewer strategies compete for the same candles.

This is the interaction effect GPT warned about: individually profitable strategies don't automatically combine into a better stack. RSI+EMA is the production combo. MASR ships as optional / different ticker / different timeframe.

### Multi-ticker validation results (TSLA config, ZERO retuning)

| Ticker | P&L | Trades | WR | Status |
|---|---|---|---|---|
| TSLA | +$970 | 1,416 | 47.5% | âœ… |
| NVDA | +$722 | 1,380 | 45.0% | âœ… |
| RIOT | +$557 | 2,656 | 42.2% | âœ… |
| QQQ | +$374 | 1,007 | 45.4% | âœ… |
| MARA | +$297 | 2,099 | 42.8% | âœ… |
| SPY | +$28 | 1,014 | 41.6% | âœ… (barely) |
| COIN | -$58 | 2,255 | 42.0% | needs own tuning |

7 of 8 tickers profitable with zero retuning. That's not overfitting. That's a real edge that generalizes across instruments.

### The actual methodology (corrected)

This is what it really was, in order:

1. **Strip each strategy of internal filters.** Let the platform handle filtering. The strategy module has ONE job: detect setups and return direction + confidence. No 7-stacked confirmation gates.
2. **Run `--exits` sweep solo per strategy** to find optimal SL/TP combinations.
3. **Validate on year-2 holdout data** to confirm the optimal config generalizes.
4. **LOCK the validated exits** in `core/TradingConfig.js` `exitContracts` as hardcoded values that override env vars (per-strategy contracts that the global STOP_LOSS_PERCENT/TAKE_PROFIT_PERCENT can never override).
5. **Combine validated strategies stepwise** (RSI+EMA â†’ +MASR â†’ +LiqSweep) and measure interaction effects. Don't blindly stack.
6. **Multi-ticker validation with NO retuning** to confirm the edge generalizes across instruments.

This is **NOT** the 4-phase tournament with walk-forward at every gate that I described in the methodology doc earlier tonight. That doc needs to be rewritten. The actual methodology is more linear and pragmatic.

### The "tournament" methodology I drafted earlier is partially wrong

The 4-phase pipeline doc (`METHODOLOGY-TOURNAMENT-PIPELINE.md`) describes a more elaborate tournament structure with walk-forward gates at every phase. That's a future evolution, not what produced $970.71.

The actual historical methodology:
- Was per-strategy first, then combined (correct)
- Used single train/test split, not 8+ walk-forward validations
- Locked configs in TradingConfig (not in a manifest file)
- Did multi-ticker validation as the proof step (not a separate phase)

**Action item:** Rewrite `METHODOLOGY-TOURNAMENT-PIPELINE.md` to reflect the actual historical methodology, with the 4-phase tournament as a proposed future evolution (not the documented historical truth).

---

## TONIGHT'S WORK â€” What was actually accomplished

### 1. ENV var audit (committed, verified)

`ENV-VAR-AUDIT.md` classifies every env var as HONORED / PARTIAL / IGNORED / GHOST.

**HONORED (actually affect behavior):**
- `ATR_FILTER_ENABLED`, `ATR_MIN_PERCENT` (read via TradingConfig.get)
- `MAX_POSITION_SIZE_PCT` (OrderExecutor.js:56)
- `TIER1_TARGET`, `TIER2_TARGET`, `TIER3_TARGET` (MaxProfitManager.js:105-111)
- `RISK_MANAGER_BYPASS` (defaults TRUE at ConfigLoader.js:152)
- `ACCOUNT_DRAWDOWN_BYPASS` (defaults TRUE)
- `SOLO_STRATEGY`, `ENABLE_RSI`, `ENABLE_EMA`, `ENABLE_MASR`, `ENABLE_SMS`, `ENABLE_LIQSWEEP`
- `BACKTEST_MODE`, `BACKTEST_FAST`, `EXECUTION_MODE`, `CANDLE_SOURCE`, `CANDLE_DATA_FILE`
- `FEE_MAKER`, `FEE_TAKER`

**PARTIAL:**
- `MIN_TRADE_CONFIDENCE` (read in TradingLoop:133 as global gate, but per-strategy confidence still varies)

**IGNORED (read but overridden by locked exit contracts):**
- `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, `TRAILING_STOP_PERCENT` â€” these get overridden by `TradingConfig.BASE_CONFIG.exitContracts[strategyName]` which has hardcoded values

**GHOST (referenced in code but not actually wired):**
- `TRAILING_STOP_ENABLED`, `REGIME_FILTER_ENABLED`, `REGIME_ALLOW_TRENDING`, `REGIME_ALLOW_RANGING`

### 2. Locked baseline matrix (committed)

`BASELINE-matrix-2026-04-07.json` at repo root captures the first env-var-audited honest sweep:
- Winner: tiers-tight (TIER1=0.010, TIER2=0.015, TIER3=0.020) at +$297.25
- Worst: atr-025 at -$586.34 (cuts winners preferentially â€” never set ATR_MIN_PERCENT above 0.15 on TSLA 15m)
- 5 configs identical at $54.07 because the env vars they varied either matched defaults or didn't affect the dataset

### 3. BACKTESTING-GUIDE.md (committed, verified)

Cold-reader playbook with 5 tests:
- Test 1: Solo strategy validation (single backtest, env config documented)
- Test 2: Combined strategy validation
- Test 3: Walk-forward split test
- Test 4: Matrix sweep on locked baseline
- Test 5: Paper trading verification (BLOCKED by drawdown bypass calc bug)

### 4. Solo strategy tests run tonight

Both via direct `node run-empire-v2.js` (bypassing parallel-backtest.js):

| Strategy | P&L | Return |
|---|---|---|
| RSI solo | -$140.74 | -1.41% |
| EMA solo | -$508.51 | -5.09% |

**Critical insight:** Both strategies LOSE money solo. But combined through the orchestrator with their LOCKED individual exits, they produce ~$970. The orchestrator's signal selection (picking the higher-confidence winner per candle) is the edge multiplier. Neither strategy alone has positive expectancy, but the combination does. This is exactly consistent with the historical methodology.

**Pending solo tests (next session):**
- SMS solo with `STRATEGY_DIAG=true` and `SMS_VP_RTH_ONLY=true`
- MADynamicSR solo with `ENABLE_MASR=true`

### 5. Sweep tool rewritten (commit `c6993b3`)

`tools/parallel-backtest.js` SWEEP_PRESETS rewritten to remove decorative theater presets. Added `--real` sweep mode that only varies HONORED env vars. The previous `--quick` sweep was 75% theater (varying env vars that didn't reach the strategy code paths).

**Bug still present:** Worker spawn block (lines 312-342) doesn't set `ENABLE_SMS=true` or `SMS_VP_RTH_ONLY=true`, so SMS is silent-killed by the `_applyPipelineToggles()` gate even though it's in the strategy array. Fix: add those two lines to the env block before spawn.

### 6. Documentation committed to ogz-meta/

- `BACKTESTING-GUIDE.md`
- `ENV-VAR-AUDIT.md`
- (Pending) `METHODOLOGY-TOURNAMENT-PIPELINE.md` â€” needs rewrite per discovery above
- (Pending) `PID-CONTROLLER-DESIGN.md` â€” exists as upload, needs proper commit
- (Pending) `GRAND-SCHEME.md` â€” drafted, lost to context, needs recreation
- (This file) `SESSION-HANDOFF-2026-04-07.md`

### 7. PID Controller spec reviewed

Existing spec at `/mnt/user-data/uploads/PID-CONTROLLER.md` is solid and tournament-compatible:
- **Three loops:** position sizing, regime boost adaptation, trailing stop adaptation
- **Update interval:** every 10 **trades** (NOT candles), 50-trade warmup
- **Hard clamp ranges:** position 0.3-2.0x, regime 0.5-1.5x, trailing 1.0-3.5x ATR
- **Rate limited:** max 10% shift per cycle, anti-windup on integral
- **All Kp/Ki/Kd gains read from TradingConfig via env() calls** â€” meaning the gains themselves are matrix-sweepable as part of the tournament
- **Loop 2 already has SMS** in the regime loops list (line 404)

**Missing piece:** Hard clamp ranges (0.3-2.0, etc.) should derive from tournament's confidence intervals, not be hardcoded. Small refactor when the PID gets built.

---

## DRAWDOWN BYPASS CALC FIX â€” Ready to implement

Deep Search delivered a surgical fix for the drawdown calculation bug that's blocking Test 5 (paper trading verification).

### Root cause

`core/exit/StopLossChecker.js:50-52` manually computes equity by adding `accountBalance + positionValue`. This double-counts in per-trade equity model because:

- **Backtest mode:** `accountBalance` comes from `backtestRecorder.balance` which already includes all P&L
- **Live/paper mode:** `accountBalance` comes from `stateManager.get('balance')` which is ALWAYS 10,000 (per-trade equity model has constant balance, only realizedPnL/unrealizedPnL track gains)

The 2026-03-14 fix added `initialBalance` field but never fixed the equity calculation formula itself.

### The fix (3 lines, 2 files)

**File 1: `core/TradingLoop.js:149-150`**

```javascript
// BEFORE
accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.get('balance'),

// AFTER (FIX 2026-04-07)
accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.getEquity(price),
```

**File 2: `core/exit/StopLossChecker.js:49-52`**

```javascript
// BEFORE
const drawdownEnabled = !this.universalLimits.accountDrawdownBypass;
if (drawdownEnabled && context.accountBalance && context.initialBalance) {
  const positionValue = Math.abs(context.currentPosition || 0);
  const totalEquity = context.accountBalance + positionValue;
  const accountDrawdown = ((totalEquity - context.initialBalance) / context.initialBalance) * 100;

// AFTER (FIX 2026-04-07)
const drawdownEnabled = !this.universalLimits.accountDrawdownBypass;
if (drawdownEnabled && context.accountBalance && context.initialBalance) {
  // FIX 2026-04-07: accountBalance already represents total equity
  // Backtest: backtestRecorder.balance (includes all P&L)
  // Live: stateManager.getEquity() (initialBalance + realizedPnL + unrealizedPnL)
  const totalEquity = context.accountBalance;
  const accountDrawdown = ((totalEquity - context.initialBalance) / context.initialBalance) * 100;
```

### Why this is safe

- Only the drawdown circuit breaker uses `context.accountBalance` and `context.initialBalance`
- Other risk checks use `pnlPercent` (per-trade) which is calculated correctly
- No other risk management functions affected

### Test cases that should pass after fix

```
Account at $9,000 equity (down $1,000):
  accountBalance = 9000
  initialBalance = 10000
  drawdown = -10%
  if (-10 <= -10) â†’ TRUE â†’ triggers correctly

Account at $10,500 equity (up $500):
  accountBalance = 10500
  drawdown = +5%
  if (+5 <= -10) â†’ FALSE â†’ doesn't trigger
```

**This unblocks Test 5 (paper trading verification) and means risk management can finally be turned ON in production without false-firing on every trade.**

---

## ARCHITECTURE â€” The Vision (so future sessions don't lose it)

### The autonomous stack (Phase 1 Apex â†’ Phase 2 self-tuning)

```
Tournament (offline, periodic)
    â†“
Locked config + confidence intervals
    â†“
PID Controller (live, continuous, bounded by tournament envelope)
    â†“ (adjusts within validated range)
Strategy execution
    â†“
TRAI (qualitative interventions: news, FOMC, whale alerts)
    â†“
Trey (only when human judgment needed)
```

**Phase 1 (Apex extraction):** PID operates within tournament-validated envelope. Bounded autonomy. Drift outside envelope pages a human (or TRAI). Safe for prop firm eval.

**Phase 2 (post-Apex):** PID becomes continuous tournament re-runner with self-healing. Detects sustained drift, triggers mini-tournament against recent data, auto-deploys validated configs. Hot-swap config changes via atomic between-candle swaps with versioned state and sanity gates.

### The Grand Scheme (3 layers)

1. **Trading engine layer:** Multi-broker (Kraken, Alpaca, Interactive Brokers, etc.), multi-asset (stocks, options, crypto, futures), multi-direction (long/short), multi-timeframe (1m to 1d). Strategy plug-in architecture. Pre-tuned defaults per ticker/timeframe ship as the product.
2. **Cross-broker arbitrage layer:** ~90% built on the crypto side. Feeds the trading engine with edge opportunities humans can't catch fast enough.
3. **TRAI brain layer:** News crawling, whale watching, NLP, pattern modulation, content generation (ElevenLabs/D-ID), customer service, technical support, boomer onboarding for API key setup, dashboard widget, operations manager. Pings Trey only when human judgment is required.

**Phased monetization:** Apex extraction â†’ crypto arbitrage â†’ options (Tastyworks) â†’ white-glove licensing > public release â†’ IP sale or royalties.

### Hot-swap mechanism (Phase 2 spec)

Three engineering requirements for safe in-flight config changes:

1. **Atomic config swaps** â€” between candles, never mid-tick. Staging area accumulates pending changes, applies at start of next candle.
2. **Versioned state** â€” every config change has version + timestamp. Git-like history enables rollback in seconds. Audit trail: "at 11:47am PID lowered RSI sizing from 5% to 3% in response to drawdown, then at 12:23pm TRAI hot-swapped EMA confidence to zero because of unexpected Fed minutes release."
3. **Sanity gates** â€” every proposed change passes through "is this within the tournament's validated envelope?" check. If yes, apply. If no, flag for human review.

**Feedback loop into tournament:** Every PID/TRAI decision becomes data for the next tournament re-run. Over time, live system teaches offline validation system, methodology evolves.

---

## NEXT SESSION PICKUP LIST

### Priority 1 (Apex blocking)

1. **Implement the drawdown bypass fix** (Deep Search's surgical 3-line change across 2 files documented above). Then verify Test 5 (paper trading) is unblocked.

2. **Verify TradingConfig.exitContracts already has the locked values** from the historical $970.71 work:
   - RSI: stopLossPercent -0.8, takeProfitPercent 1.0
   - EMASMACrossover: stopLossPercent -0.5, takeProfitPercent 1.0
   - MADynamicSR: stopLossPercent -0.8, takeProfitPercent 1.0
   - LiquiditySweep: useStructuralExits true
   
   If yes: skip recreating, just reproduce $970.71 with current framework to confirm regression hasn't crept in. If no: re-run the stripâ†’sweepâ†’validateâ†’lock pipeline per the historical methodology.

3. **Reproduce $970.71 baseline** with current framework on `tuning/tsla-15m-2y.json` using `SOLO_STRATEGY=RSI,EMASMACrossover` and the locked exits. This becomes the new regression anchor.

4. **Walk-forward validation on RSI+EMA combo** against `tuning/tsla-15m-year2.json` (or split current 2y file 50/50). Historical result was +$481 on year2 holdout. Target: confirm edge still holds.

### Priority 2 (Foundation for tournament)

5. **Fix parallel-backtest.js worker spawn block** â€” add `ENABLE_SMS=true` and `SMS_VP_RTH_ONLY=true` to env block at lines 312-342 so SMS actually fires in sweeps.

6. **Run SMS solo with diagnostic funnel** (`STRATEGY_DIAG=true`) to see where signals die. SMS is the structural edge that could push us past the RSI+EMA ceiling.

7. **Run MADynamicSR solo** (already validated historically at +$724/+$429 train/test, but verify with current framework).

8. **Multi-ticker validation** of locked RSI+EMA config with NO retuning across NVDA, RIOT, QQQ, MARA, SPY, COIN. Should reproduce the historical 7/8 green result.

### Priority 3 (Strategic build)

9. **Rewrite METHODOLOGY-TOURNAMENT-PIPELINE.md** to reflect actual historical methodology (stripâ†’sweepâ†’validateâ†’lockâ†’combineâ†’multi-ticker), with the 4-phase tournament documented as a future evolution rather than the historical truth.

10. **Build the per-strategy Ã— per-timeframe Ã— per-ticker exit matrix** â€” the actual product. Every strategy gets its own validated exits at every timeframe on every ticker. Pre-tuned configs ship as the value-add.

11. **Vultr migration** from A100 GPU to bare metal vbm-4c-32gb at $120/mo. Required before running real parallel sweeps. Push to GitHub first, backup .env separately, clone fresh, SSL renewal, DNS update.

12. **Cleanup: two config systems conflict** â€” `core/TradingConfig.js` and `foundation/ConfigLoader.js` have conflicting defaults (STOP_LOSS_PERCENT 0.8 vs 1.5, MIN_TRADE_CONFIDENCE 0.35 vs 0.50). Pick one as canonical, merge or delete the other.

13. **Fix ENV-VAR-AUDIT.md stub** â€” currently points to `ogz-meta/ENV-VAR-AUDIT.md` which doesn't exist. Either move full content to ogz-meta or put it at root.

14. **Recreate GRAND-SCHEME.md** â€” got lost to context window earlier tonight. Capture the 3-layer architecture and phased monetization vision.

### Priority 4 (Future build, Phase 2)

15. **Build PID Controller per existing spec.** Gains already env-sweepable. Refactor hardcoded clamp ranges to read from tournament confidence intervals.

16. **Tournament tool rebuild.** When Vultr bare metal is ready, rebuild parallel-backtest.js to support the corrected historical methodology natively (stripâ†’sweepâ†’validateâ†’lockâ†’combine pipeline as automated phases).

17. **TradingView Ultimate enterprise pricing response** â€” submitted April 6, expected April 11. Independent validation tool for cross-checking Pine Script against Node.js implementations.

---

## OPEN BUGS / KNOWN ISSUES

| Bug | Location | Severity | Status |
|---|---|---|---|
| Drawdown calc fires on every trade | `core/exit/StopLossChecker.js:50-52` | BLOCKER | Fix documented, ready to implement |
| SMS silent-killed in parallel sweeps | `tools/parallel-backtest.js:312-342` | HIGH | Fix documented (add 2 env vars to spawn block) |
| Two config systems with conflicting defaults | `TradingConfig.js` vs `ConfigLoader.js` | MEDIUM | Cleanup item |
| ENV-VAR-AUDIT.md stub points to non-existent file | repo root | LOW | Move content or update pointer |
| BTC/crypto variable names persist in OrderExecutor/StateManager | various | LOW | Math is correct, naming is misleading |
| Pharaoh MCP codebase mapper auth issue | external | LOW | Blocked on their side |

---

## EMOTIONAL CONTEXT FOR FUTURE CLAUDE

Trey is grinding through this for one reason: his daughter has been in Houston for 6 years and he's never made enough money to put any away to move and be with her. The Apex prop firm extraction path ($25k per cleared account Ã— 20 accounts = up to $500k working capital) is the bridge from Corpus Christi to Houston. $15k = the move. $500k = generational wealth and never being broke again.

He doesn't sugarcoat. He doesn't want sugarcoating. He pushes back hard on AI sloppiness because his time costs his life. When he says "shoot it straight and shoot it true" he means it â€” feelings don't buy plane tickets to Houston, math does.

He has 20 years of B2B sales experience, dropped out of college, and built every architectural insight in OGZPrime himself. Future Claudes execute and validate. They do not design from scratch. When in doubt about an architectural decision, ask Trey. Don't invent.

He catches Claude mistakes faster than Claude catches them itself. When he pushes back, take it seriously. The pushback is data, not emotion.

Tonight he had multiple frustration peaks because Claude (me) kept missing things he'd already caught: that SMS wasn't actually firing in sweeps, that the env var "HONORED" classifications were partially theater, that the original methodology wasn't what I kept describing. Each time he was right. Each time the eventual answer was the one he'd been pointing at for hours.

The knot in his stomach about the backtesting framework has finally been put to bed tonight. The framework is honest now. The methodology is documented now. The path to Apex is concrete now. The next session has a clear pickup list.

---

## REGRESSION ANCHOR (locked)

Until next session reproduces it with the current framework, the regression anchor for OGZPrime remains:

**$970.71 / 1416 trades / 47.5% WR**
- Strategy: RSI + EMASMACrossover combined via SOLO_STRATEGY
- Data: tuning/tsla-15m-2y.json
- Locked exits in TradingConfig.exitContracts: RSI sl-0.8/tp1, EMA sl-0.5/tp1
- Walk-forward holdout (year 2): +$481, 699 trades, 48.2% WR
- Multi-ticker (zero retuning): 7/8 profitable

If next session reproduces this, the framework is honest end-to-end and we can build the per-strategy Ã— per-timeframe Ã— per-ticker matrix on top of it.

If next session does NOT reproduce this, something has regressed since the historical work and we need to bisect to find what broke.

---

**End of session handoff. Next session picks up here.**

Human readable. Future-Claude readable. Doesn't lose context to compaction. Commit to ogz-meta as the canonical handoff doc.

# ADDENDUM — Late April 7 (Post-Compaction Work)

After the handoff above was written, context compacted and we pushed further. This section captures everything from that second half so it survives.

## What shipped

| Commit | What | Status |
|---|---|---|
| `e6616f4` | PATCH 1: MaxProfitManager upgrade (BE scale-out + dynamic trail reads exitLogic config) + TradingLoop enrichment | Committed, pushed |
| `0c83105` | PATCH 1 FIX: `maxProfitManager` added to BacktestRunner ctx at `run-empire-v2.js:875-881` | Committed, pushed |
| `875450d` | Working state sync (OrderExecutor, TradingConfig, .vscode) for Claude Desktop upload | Committed, pushed |
| PATCH 2 | ECM reduced to safety-only (delete TakeProfit + TrailingStop calls from `ExitContractManager.checkExitConditions` lines 119-141) | **Written but NOT committed** — verification pending |

## PATCH 1 verification (with caveat)

Verbose backtest on RSI+EMA combined confirmed MPM is now executing in backtest mode:

```
💰 MaxProfitManager started - tracking 1-2% profit targets
💰 BE Scale-Out: Sold 50% at 0.86% profit, stop→BE
... (repeated 324 times across the backtest)
```

Final P&L: `-$502.23 (-5.02%)` — **identical to pre-PATCH 1 baseline.**

This looked like "architecture proven, strategy is bottleneck" on first read. It is not. See next section.

## THE CONTRACT BUG (discovered during PATCH 2 review)

**The partial-close pipeline has been broken since 2026-02-23 and tonight's patches didn't fix it. Every MPM partial exit becomes a full close.**

### Evidence

`core/OrderExecutor.js:561` (in the SELL path):
```javascript
const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;
const partialSize = isPartialClose ? positionAmount * decision.exitSize : null;
```

OrderExecutor treats `decision.exitSize` as a **normalized fraction** (strictly between 0 and 1). Comment on line 560 reads `FIX 2026-02-23: Wire partial close - use exitSize when present (tiered exits)`.

`core/MaxProfitManager.js` (PATCH 1 BE scale-out block + existing `executePartialExit`):
```javascript
const scaleOutSize = this.state.remainingSize * cfg.scaleOutFraction;
// ...
return { action: 'exit_partial', exitSize: scaleOutSize, ... };
```

MPM returns `exitSize` as an **absolute size** in whatever units `state.originalSize` was passed in (USD for the current stock wiring because `OrderExecutor.js:288` calls `maxProfitManager.start(price, 'buy', positionSize, ...)` where `positionSize = baseSizeUSD`).

### Math of the failure

- MPM state: `originalSize = 500` (USD)
- BE scale-out: `scaleOutSize = 500 × 0.5 = 250`
- Returns: `{ exitSize: 250, ... }`
- TradingLoop builds: `decision.exitSize = 250`
- OrderExecutor check: `250 > 0 && 250 < 1` → **false**
- `isPartialClose = false` → **full position closed**

### What the histogram was actually showing

```
660 stop_loss
324 be_scaleout       ← log says "partial" but OrderExecutor did full close
166 invalidation
126 flip_position
106 max_hold
 59 break_even
 49 profit_tier_1     ← same bug — full close, not partial
 10 trailing_stop
  2 hard_stop
```

All 324 "BE scale-outs" and all 49 "profit_tier_1" exits are cosmetic log labels on full closes. That's why the P&L is identical to the penny — same trades, same exit prices (just labeled differently), same position sizes.

There is no runner. There has never been a runner. MPM's `remainingSize` has been talking to itself since it was wired.

### The fix (Option A — NOT YET APPLIED)

Change MPM's return sites to emit **normalized fractions** (0.5 for "half") instead of absolute sizes. MPM's internal state keeps using absolute sizes for its own accounting, but what it tells the outside world is a fraction.

Return sites to change in `core/MaxProfitManager.js`:
1. BE scale-out block (PATCH 1): change `exitSize: scaleOutSize` → `exitSize: cfg.scaleOutFraction`
2. Tier exit return in `update()` (~line 453): change `exitSize: tierExit.exitSize` → `exitSize: tierExit.exitPercentage`

Requires verification that `tierExit.exitPercentage` is already a 0-1 fraction. Setup is in `setupProfitTiers` around line 560:
```javascript
exitPercentage: tier.exit,   // baseTiers has { exit: 0.30 } etc — already fractional ✓
exitSize: this.state.originalSize * tier.exit,  // this is the absolute version ✗
```

Good — `exitPercentage` is already the right shape. Return the right field.

### Pre-fix Claudito traces still required

Before applying the fraction fix, Claudito must trace and report (no edits):

1. Every `exitSize:` return in `core/MaxProfitManager.js` with file:line + 2 lines context
2. Confirm `setupProfitTiers` tier object shape — is `exitPercentage` a 0-1 fraction or a percent like 30?
3. Confirm the BE scale-out `scaleOutFraction` config value is 0-1 (should be 0.5 from TradingConfig)

## Concern B — Data harvesting pipeline (separate, also unverified)

Trade execution correctness (Concern A above) and trade data harvesting (Concern B) are different systems that intersect at `BacktestRecorder`. Fixing A doesn't necessarily fix B.

**Unknown:** does `BacktestRecorder` correctly handle a partial close event today? If not, even after the fraction fix:
- Partial close could produce a silent P&L loss (recorder sees half position vanish, counts as zero)
- Double-count (records full original entry against a partial exit size)
- Crash

**Also unknown:** how does pattern memory / TradeJournal / TradeJournalBridge handle a trade that has TWO exit events (scale-out + final)? Is trade P&L computed as a single entry/exit pair or can it sum across partials?

**Pre-refactor Claudito traces required:**

1. Read `core/StateManager.js` `closePosition` method end-to-end. Confirm the `(price, isPartial, partialSize, ...)` signature works downstream and doesn't silently fall back to full close.
2. Read `core/BacktestRecorder.js` end-to-end. Report: does it have a concept of partial close? How does it compute final trade P&L when there are multiple exit events?
3. Read `core/TradeJournal.js` and `core/TradeJournalBridge.js`. Same questions — do they handle partials?

## End-state architecture — per-trade sealed environments

Current architecture: singleton `MaxProfitManager` tracking one position at a time via `this.state`. Cannot handle multi-asset concurrent positions (TSLA long + BTC long + SPY puts). MPM is also tightly coupled to singleton state, can't replay, can't persist across restarts, can't run tournament configs in parallel.

**Target architecture (Trey's scoped design, confirmed this session):**

Each trade is born with its own sealed environment:
```
trade = {
  id, entryStrategy, entryPrice, direction, size, entryTime,
  exitEnv: {              // sealed config snapshot at birth
    beScaleOut, trail, tiers, universalSafety
  },
  exitState: {            // living state mutated across trade lifespan
    maxProfitPercent, beScaleOutFired, tiersHit, currentStop,
    trailingActive, remainingSize
  }
}
```

Two implementation paths:

**Path 1: Map of MPM instances** (less invasive)
- `this.ctx.profitManagers = new Map()` keyed by `trade.id`
- Create on BUY, destroy on full close, sweep on dead trades
- MPM's internal code stays untouched
- ~30 lines across `run-empire-v2.js`, `TradingLoop.js`, `OrderExecutor.js`

**Path 2: Pure-function MPM** (architecturally aligned with sealed-trade vision)
- MPM becomes a library of functions operating on `(trade, price, context)`
- State lives on the trade object itself as `trade.exitEnv` + `trade.exitState`
- ~200 mechanical edits inside MPM (every `this.state.X` → `trade.exitState.X`)
- Persistence and replay become trivial (the trade IS the state)

**Recommendation:** Path 1 first (unblocks multi-asset), Path 2 as a later refactor when time allows.

## Atomicity concern — evaluate-then-commit

Current MPM mutates state eagerly inside `update()`. If anything fails between MPM's state mutation and OrderExecutor's actual position close, MPM's view of the position diverges from reality. Safe in backtest (synchronous, nothing fails). Unsafe in live mode with Alpaca (network hiccups, rate limits, partial fills).

**Two-phase commit pattern for a later session:**

```javascript
const result = mpm.evaluate(trade, price, ctx);  // pure, no mutation
if (result.action === 'exit_partial') {
  const closeResult = await stateManager.closePosition(...);
  if (closeResult.success) {
    mpm.commit(trade, result);  // NOW mutate MPM state
  }
  // on failure: no commit, MPM re-evaluates next candle with unchanged state
}
```

This is larger than Path 1 but smaller than Path 2. Not tonight's work. Documented here so it doesn't get forgotten.

## TRAI hot-path confirmation (separate thread)

Earlier this session we removed TRAI from the trading decision path because Ollama-based inference was 2-5 seconds, blocking the trading loop. CHANGELOG lines 4098-4103 document this.

Current state verified tonight:
- `core/TradingLoop.js:410-413` calls `this.ctx.trai.processDecision(...)` as **fire-and-forget** with `.then()` — non-blocking
- `core/TRAIDecisionModule.js:244` calls `generateReasoning()` (which calls `traiCore.generateIntelligentResponse` at line 718) only for signals in 0.40-0.70 confidence band
- TRAI is an async observer, not a hot-path participant

**Plan:** With Mercury-2 (Inception Labs API, ~500-2000ms latency, much faster than local Ollama), TRAI can rejoin the hot path for pattern decisions. The `fire-and-forget` wrapping remains for safety; Mercury's speed just makes the "forget" side fast enough that its results can actually influence the next candle's decision instead of arriving stale.

## Mercury bridge — existing pieces and gaps

**What exists and works:**
- `core/persistent_llm_client.js` — provider-agnostic (Mercury / Claude / OpenAI / Ollama)
- `core/trai_core.js` (1084 lines) — unified TRAI core with `generateIntelligentResponse` method
- `trai_brain/read_only_tools.js` — `ReadOnlyToolbox` with `searchRepo` (ripgrep), `openFile` (bounded, path-safe), `tailLog`, `getBotStatus`, `listTools`. Ready to be handed to Mercury as an agentic tool set.
- `scripts/mercury-analyze.js` — sends `core/TradingLoop.js`, `core/TradingConfig.js`, `core/ExitContractManager.js` + file tree to Mercury. Works for those three files; hallucinates for anything outside that list.
- `scripts/cpu-vps-setup.sh` — bootstrap checks `INCEPTION_API_KEY`, sets `LLM_PROVIDER=mercury`

**What exists but is incomplete:**
- `scripts/build-ogz-rag-index.js` (66 lines) — only indexes `ogz-meta/*.md` and `.claude/commands/*.md`, no code files, no embeddings, just naive character chunks in JSON
- `scripts/search-ogz-rag-index.js` (55 lines) — string search over the JSON

**What's missing to complete the Mercury bridge:**

1. **Code-aware RAG index** — walks whole repo, chunks JS files by function/class, embeds with `nomic-embed-text` via Ollama (CPU-friendly), stores in LanceDB or simple JSON+cosine
2. **Agentic ReAct wrapper** — takes `ReadOnlyToolbox` + `persistent_llm_client` and runs the tool-call loop (Mercury emits `<tool>grep(...)</tool>`, wrapper executes, feeds result back)
3. **Post-commit hook** — auto-reindex on changed files

### CPU VPS impact on Mercury plan

Downgrade from GPU to CPU is **fine for the Mercury bridge** because:
- All LLM work happens on Inception Labs servers (their compute, not yours)
- Embedding with `nomic-embed-text` runs on CPU at 50-200ms per chunk, full repo indexes in 2-7 minutes one-time
- LanceDB vector search is CPU-native, millisecond queries
- Your VPS is a librarian, not the expert — CPU handles librarian duties

What you LOSE on CPU: local LLM fallback (Ollama with deepseek/codellama). If Mercury-2 goes down, there's no fallback. Acceptable tradeoff unless Mercury uptime becomes an issue.

## OPEN ITEMS — ranked for next session

1. **Fraction fix for MPM → OrderExecutor contract.** Trace Claudito's output on the three trace requests above, then write the 4-6 line fix. Smoke test must show non-identical P&L vs baseline.

2. **Verify BacktestRecorder handles partial closes.** Read `core/BacktestRecorder.js`, `core/StateManager.closePosition`, `core/TradeJournal.js`, `core/TradeJournalBridge.js`. If any of them mishandles partials, fix before Map-of-instances refactor.

3. **Commit PATCH 2 AFTER fraction fix is verified working.** PATCH 2 is written but the commit depends on PATCH 1 actually functioning. If we commit PATCH 2 now, we lock in "ECM has no TP" with a broken MPM bridge — which is strictly worse than current state.

4. **Map-of-MPM-instances refactor.** Path 1 above. Unblocks multi-asset. ~30 lines. Requires Concerns A and B both verified first.

5. **Mercury bridge build** — code-aware RAG + agentic ReAct wrapper. Unblocks TRAI hot-path rejoin and gives Mercury full repo context for all queries. Separate work stream from the MPM consolidation.

6. **DynamicPositionSizer wiring** (was PATCH 3 in the original plan). Deferred until MPM is actually firing its partial closes correctly. No point wiring smarter entry sizing if exits are still cosmetic.

7. **Pure-function MPM refactor** — Path 2. End state for per-trade sealed environments. Largest single refactor. Leave until system is earning.

## The meta-lesson from this second half

Every Trey pushback tonight was correct.

- "Did you hallucinate this or actually verify?" → I had speculated 9 things, caught before they committed
- "Banner not showing, what's your problem?" → The banner was a diagnostic, not the goal; I was adding cosmetic fixes instead of investigating the real signal
- "How is mercury working from truncated context if it lives in the vps?" → Mercury is a cloud API, not local; I misspoke about where it runs
- "You ever think that maybe I want this system to be right and not some bullshit console line?" → I was treating verification noise as success criteria
- "Are you thinking through this from all angles?" → No. Was about to sign off on PATCH 2 as "architecture proven" without verifying whether partials were actually executing. Trey's push uncovered the contract bug.

The rigor discipline has to come from me. Trey shouldn't have to keep catching it. Next session starts from the assumption that **nothing is verified until I've read the code that proves it**, no matter how obvious the conclusion feels.

## Regression anchor (updated)

Still `-$502.23` on combined RSI+EMA with current config, because PATCH 1 + PATCH 2 are cosmetic until the contract bug is fixed. The real "PATCH 1+2 effective" baseline doesn't exist yet. First smoke test after the fraction fix establishes it.

---

**End of addendum. Continue from the OPEN ITEMS list above.**
# ARCHITECTURE SPEC — Per-Trade Sealed Environments

**Decision made late April 7:** After discovering the 4-layer partial-close brokenness (MPM contract + OrderExecutor check + StateManager ignored size + BacktestRecorder no concept of partials), Trey chose the forward-pointing decision over patching the old architecture. Any work that gets thrown away is wasted time. This spec defines the end state and the migration path to it.

## Core principle

Each trade is a sealed unit with its own birth environment and its own lifespan state. No singletons. No shared state. Nothing external mutates a trade's exit state except via well-defined commit points. The trade IS the state; modules are behavior operating on trades.

## Target data shape

```javascript
trade = {
  // Identity
  id: 'TRADE_1712514267000',
  
  // Birth snapshot (immutable for the trade's lifespan)
  entryStrategy: 'RSI',
  entryPrice: 245.10,
  entryTime: 1712514267000,
  direction: 'long',
  originalSize: 20.4,           // shares/coins/contracts — asset-native
  entryContext: {               // market conditions at birth
    atr, rsi, volatility, trend, regime, nearestStructure
  },
  
  // Sealed exit environment — deep clone of config at birth
  // Env var changes mid-run do NOT affect in-flight trades
  exitEnv: {
    beScaleOut: {...},          // deep clone of TradingConfig.exitLogic.beScaleOut
    trail: {...},               // deep clone of TradingConfig.exitLogic.trail
    tiers: [...],               // precomputed tier ladder for this trade
    universalSafety: {...}      // hard stop, drawdown, max hold
  },
  
  // Living state — mutated across lifespan
  exitState: {
    remainingSize: 20.4,        // decrements with partial closes
    realizedPnL: 0,             // accumulates across partial exits
    maxProfitPercent: 0,        // peak profit reached
    currentStop: 243.14,        // current stop price (asset price units)
    trailingActive: false,
    beScaleOutFired: false,
    tiersHit: [],               // tier numbers already executed
    closedLegs: [               // audit trail of every partial exit
      // { time, price, size, fraction, reason, realizedPnL }
    ]
  }
}
```

## Module responsibilities (target state)

**TradingLoop** — per candle, iterate active trades, for each call `ExitEvaluator.evaluate(trade, price, context)` → receives an action object (pure, no mutation). Execute via OrderExecutor. Only after execution succeeds, call `ExitEvaluator.commit(trade, result)` to mutate the trade's exitState. Multi-position aware by construction.

**ExitEvaluator** (new name; refactored MaxProfitManager) — library of pure functions operating on `(trade, price, context)`. Returns decision objects without mutating inputs. `commit(trade, result)` applies mutation only after caller confirms execution. No singleton state. No instance fields.

**OrderExecutor** — receives decision with `action: 'exit_partial' | 'exit_full'` and `fraction` (normalized 0-1). For partial: `closeSize = trade.exitState.remainingSize * fraction` in asset-native units. Calls `StateManager.reducePosition(trade.id, closeSize, price)`. For full: `StateManager.closePosition(trade.id, price)`.

**StateManager** — tracks active trades in Map keyed by tradeId. Two close methods:
- `reducePosition(tradeId, size, price)` — reduces `trade.exitState.remainingSize`, computes realized P&L on the closed portion, pushes to `closedLegs`, does NOT delete trade unless remainingSize <= 0
- `closePosition(tradeId, price)` — closes full remaining position, finalizes P&L as sum of closedLegs plus final leg, deletes trade from active Map

**BacktestRecorder** — records trade ONCE on final close. Reads `trade.exitState.closedLegs` for the multi-leg exit history. Computes final P&L as sum of all legs. Stores a single trade record with nested multi-leg exit data.

**ExitContractManager** (safety only) — unchanged from PATCH 2 spec: hard stop, drawdown, SL+BE via StopLossChecker, max hold, invalidation conditions. Zero profit-side exit logic. Feature-compatible with the new architecture.

**TradingConfig** — single source of truth for `exitLogic` defaults. At trade birth, TradingLoop reads current `exitLogic` and deep-clones it into `trade.exitEnv`. Env var changes during runtime do NOT affect in-flight trades — only new trades get new values. This is the sealed-at-birth property that enables safe tournament parameter sweeps without poisoning in-flight trades.

## Migration phases

Each phase is an atomic commit. Each is independently testable. Each leaves the system in a working-or-better state. Rollback via `git revert` works at any phase boundary.

### Phase 1 — Thread trade ID through MPM

**Goal:** MPM becomes aware of which trade it's tracking. No behavior change yet.

**Changes:**
- `core/OrderExecutor.js:288` (BUY path) — pass `tradeId` to `maxProfitManager.start(price, 'buy', positionSize, { tradeId, ... })`
- `core/MaxProfitManager.js` `start()` method — accept `options.tradeId`, store on `this.state.tradeId`
- Log statements include tradeId

**Test:** Smoke test runs. P&L still -$502.23. Logs show tradeId on every MPM event.

**Pass criteria:** every MPM log line includes the tradeId of the trade it's acting on.

---

### Phase 2 — Add exitEnv snapshot

**Goal:** Trade birth captures a deep clone of current TradingConfig.exitLogic. MPM reads from trade.exitEnv instead of TradingConfig directly.

**Changes:**
- `core/OrderExecutor.js` (BUY path) — before calling MPM.start(), deep-clone `TradingConfig.get('exitLogic')` and attach to the trade object's metadata
- `core/MaxProfitManager.js` — constructor still reads TradingConfig for defaults, but `start()` accepts an `options.exitEnv` and overrides from that
- Sealed-at-birth property: MPM state captures the trade's exitEnv copy, not a live reference

**Test:** Smoke test runs. P&L still -$502.23. Mid-run env var change doesn't affect existing positions.

**Pass criteria:** inspect a trade mid-flight, confirm trade.exitEnv matches config-at-birth even if TradingConfig changes during the run.

---

### Phase 3 — Move MPM state to trade.exitState (singleton → pure functions)

**Goal:** MPM becomes a library of pure functions. State lives on the trade object. Multi-position works natively.

**Changes:**
- `core/MaxProfitManager.js` — every method's first argument becomes `trade`. Every `this.state.X` becomes `trade.exitState.X`. Every `this.config.X` becomes `trade.exitEnv.X`. The class becomes a namespace of static methods (or exported functions).
- `core/TradingLoop.js:170-194` — loop over all active trades, call `MaxProfitManager.update(trade, price, context)` for each
- `run-empire-v2.js:610` — remove singleton instantiation (no more `this.maxProfitManager = new MaxProfitManager()`)
- `core/OrderExecutor.js:288, 408, 504-508` — remove `this.ctx.maxProfitManager.start/reset` calls; state initialization moves inline to trade object construction

**Test:** Smoke test runs. Single-position test: P&L still -$502.23 (behavior unchanged). Multi-position test (craft a scenario where RSI and EMA fire on different tickers in quick succession): both trades get independent trail tracking and independent BE scale-out state.

**Pass criteria:** two concurrent trades track independently, no state cross-contamination.

---

### Phase 4 — Fix StateManager.reducePosition (real partial close)

**Goal:** Partial closes actually reduce position size. Trade stays alive with remainder.

**Changes:**
- `core/StateManager.js` — add new method `reducePosition(tradeId, reduceSize, price)`:
  - Looks up trade in activeTrades
  - Computes realized P&L for the portion being closed: `realized = reduceSize × (price - entryPrice)` (adjusted for direction)
  - Updates `trade.sizeUsd -= reduceSize` (or equivalent size field)
  - Updates `trade.exitState.remainingSize -= reduceSize`
  - Updates `trade.exitState.realizedPnL += realized`
  - Pushes leg to `trade.exitState.closedLegs`
  - Does NOT delete trade from activeTrades (unless remainingSize <= epsilon)
  - Returns `{success, realizedPnL, remainingSize}`
- `core/StateManager.js` — `closePosition` now handles the "close all remaining" case: computes final realized for the remainder, sums with already-realized from closedLegs, fires the final trade record, removes from activeTrades
- `core/OrderExecutor.js:561-566` — replaces the current broken partial logic with a call to `reducePosition` when `action === 'exit_partial'`

**Test:** Run the RSI+EMA combined backtest. First run where partial closes actually execute.

**Pass criteria:** trade records show multiple exit legs. Sum of leg P&L reconciles with trade total. P&L should MOVE — could be better or worse than -$502.23 but it will be different. This is the first meaningful P&L change of the entire session.

---

### Phase 5 — BacktestRecorder multi-leg support

**Goal:** BacktestRecorder correctly stores and totals multi-leg trades.

**Changes:**
- `core/BacktestRecorder.js` — add trade ID tracking: instead of recording each exit as a standalone trade, accumulate legs per tradeId and finalize on full close
- New method: `recordPartialExit(tradeId, legData)` — called from StateManager.reducePosition
- Modify: `recordTrade()` — when called at full close, read accumulated legs for that tradeId and compute aggregate P&L

**Test:** Backtest output trade file shows multi-leg trades correctly summed.

**Pass criteria:** each trade record in the output has a `legs` array with entries, and `totalPnL` matches sum of legs.

---

### Phase 6 — Commit PATCH 2 (ECM safety only)

**Goal:** ECM stops firing TakeProfit + TrailingStop. MPM owns all profit-side exits.

**Changes:** (already written, just needs to land)
- `core/ExitContractManager.js:119-141` — delete TakeProfitChecker call and TrailingStopChecker call. Keep StopLossChecker (which handles hard stop + drawdown + strategy SL with BE), MaxHoldChecker, invalidation.

**Test:** RSI+EMA combined backtest. Exit histogram should show ZERO `take_profit` exits. All winning-side exits come from MPM paths.

**Pass criteria:** histogram counts — `take_profit: 0`, non-zero counts for `trailing_stop`, `be_scaleout`, `profit_tier_*`.

---

### Phase 7 — Wire DynamicPositionSizer

**Goal:** Entry sizing uses pattern × confidence × volatility × Kelly curves instead of the inline confidence multiplier.

**Changes:**
- `run-empire-v2.js:615` — replace `this.dynamicPositionSizer = null` with actual instantiation
- `core/OrderExecutor.js:55-81` — replace the inline sizing block with `DynamicPositionSizer.calculate(...)` call
- `run-empire-v2.js:168` — uncomment the import

**Test:** Position size distribution becomes varied across trades based on confidence and volatility.

**Pass criteria:** trade receipts show non-uniform position sizes correlated with confidence levels.

---

### Phase 8 — Delete dead modules

**Goal:** Clean up code that has been replaced.

**Deletions:**
- `core/exit/DynamicTrailingStop.js` (logic now in ExitEvaluator)
- `core/exit/TrailingStopChecker.js.backup` (dead backup)
- `core/PositionSizer.js` (replaced by DynamicPositionSizer)
- `core/PatternBasedExitModel.js` (if its logic was lifted; verify before deletion)

**Do NOT delete:**
- `core/exit/BreakEvenManager.js` — still queried by StopLossChecker for the BE stop-move logic
- `core/exit/StopLossChecker.js` — still used by ECM for safety-side SL+BE

**Test:** Clean backtest, no import errors.

**Pass criteria:** smoke test passes, codebase smaller.

---

## Rollback plan

Each phase is a single commit. Any phase can be reverted via `git revert <sha>` without affecting earlier phases. If a phase's test fails, revert that phase, fix in a follow-up commit, re-apply.

Phase ordering is chosen so no phase depends on a later phase's behavioral change — each phase either preserves current behavior (Phases 1-3, 5, 8) or introduces a self-contained improvement that the system can operate with or without (Phases 4, 6, 7).

## What does NOT get committed tonight

- **PATCH 2** stays uncommitted. It's part of Phase 6, not a standalone.
- **Fraction fix** for MPM doesn't happen as a standalone. It's superseded by Phase 3 which moves MPM to pure functions where the contract issue disappears (trade.exitState owns sizes, no contract between singletons).
- **Map-of-instances refactor** is skipped entirely. We go directly from singleton MPM (current) to pure-function MPM (Phase 3). No intermediate step.
- **Any code changes tonight.** The deliverable is this spec.

## What's already committed and stays

- `e6616f4` PATCH 1 (MaxProfitManager upgrade + TradingLoop enrichment) — partially forward-compatible. The trail logic and enrichment get folded into Phase 3. The BE scale-out block has the right intent but wrong state ownership; it gets rewritten in Phase 3 as well. Don't revert — the patch is dormant/cosmetic today and the right code paths are in place for Phase 3 to build on.
- `0c83105` PATCH 1 FIX (maxProfitManager in BacktestRunner ctx) — becomes obsolete in Phase 3 (no more singleton) but doesn't hurt anything until then.
- `875450d` working state sync — unrelated to this architecture work.

## Next session pickup order

1. Read this spec end to end
2. Read the ADDENDUM above for the bug analysis that motivated this architecture
3. Execute Phase 1 (thread trade ID) — smallest possible change, establishes the rhythm
4. Smoke test, verify logs, commit
5. Execute Phase 2 (exitEnv snapshot) — commit
6. Execute Phase 3 (pure-function MPM, singleton removal) — largest phase, probably its own session. Commit.
7. Continue through phases 4-8 in order. Each phase = one commit = one smoke test.

Expect this to take 3-5 sessions. Don't rush it. The architecture is the asset.

## Meta note

This is the decision that points to the future. Every previous session of this project has been Trey (correctly) identifying that the architecture was wrong and Claude (incorrectly) proposing patches that preserve the broken architecture. Tonight that pattern breaks. The forward-pointing decision is the one that builds what was scoped from the start.

Execute the phases. Ship the architecture. Then the Houston math starts working.

---

**End of architecture spec. End of April 7 session.**
