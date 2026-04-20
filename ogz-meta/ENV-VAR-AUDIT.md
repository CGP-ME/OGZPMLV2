# OGZPrime Environment Variable Audit

**Date:** 2026-04-07
**Branch:** `tradingloop-clean-rewrite`
**Author:** Trey Buhidar (The Architect)
**Status:** Active reference — DO NOT delete without replacement

---

## Why this document exists

For weeks, parallel-backtest sweeps were producing duplicate results across configs that should have produced distinct numbers. Multiple sessions noticed it. Multiple sessions waved it off as "those parameter ranges don't matter." That was wrong.

This audit traces every environment variable referenced by `tools/parallel-backtest.js` SWEEP_PRESETS through the actual codebase to determine whether each env var:

- **HONORED** — read in a code path that affects trading behavior
- **PARTIAL** — read but partially overridden by per-strategy locked values
- **IGNORED** — set by sweep presets but never read, or overridden everywhere by locked exit contracts

The result: most of the "quick" sweep is theater. Half of "full" is theater. The strategy edge does not live where we were sweeping it.

---

## TL;DR

**Real knobs (tune these):**
- `ATR_FILTER_ENABLED` / `ATR_MIN_PERCENT`
- `MAX_POSITION_SIZE_PCT`
- `TIER1_TARGET` / `TIER2_TARGET` / `TIER3_TARGET`
- `RISK_MANAGER_BYPASS`
- `ACCOUNT_DRAWDOWN_BYPASS`
- `MIN_TRADE_CONFIDENCE` (partial — entry gate only)

**Theater knobs (do not sweep):**
- `STOP_LOSS_PERCENT`
- `TAKE_PROFIT_PERCENT`
- `TRAILING_STOP_PERCENT`
- `TRAILING_STOP_ENABLED`

The locked per-strategy exit contracts in `core/TradingConfig.js` (`BASE_CONFIG.exitContracts`) override every stop/take-profit/trailing env var for any strategy that has its own validated contract — which is all of them.

---

## Full audit table

| Env Var | Where Read | Trading Impact | Status |
|---|---|---|---|
| `STOP_LOSS_PERCENT` | `TradingConfig.js:216` (global) + `MaxProfitManager.js:118` (MPM initialStopLossPercent) | **PARTIAL** — IGNORED by locked exit contracts (primary strategy SL). HONORED by MaxProfitManager's initialStopLossPercent at MPM:118 which reads `exits.stopLossPercent` via TradingConfig.get(). |
| `TAKE_PROFIT_PERCENT` | `TradingConfig.js:217` (global) — no direct MPM consumer found | **IGNORED by all verified consumers**. Profit-side tuning uses TIER1_TARGET/TIER2_TARGET/TIER3_TARGET/FINAL_TARGET via exits.profitTiers.* at MPM:106,108,110,112. |
| `TRAILING_STOP_PERCENT` | `TradingConfig.js:218` (global) — no direct MPM consumer found | **IGNORED by verified consumers**. Trail tuning via TRAIL_* env vars via exitLogic.trail bundle at MPM:228. |
| `TRAILING_STOP_ENABLED` | NOT FOUND in trading code | Ghost var — referenced nowhere that affects behavior | **IGNORED** |
| `MIN_TRADE_CONFIDENCE` | `TradingLoop.js:133` | PARTIAL — Used at entry gate, but per-strategy `exitContract.minConfidence` (e.g., RSI: 0.60) may override downstream | **PARTIAL** |
| `ATR_FILTER_ENABLED` | `StrategyOrchestrator.js:725` | YES — Checked before allowing trades | **HONORED** |
| `ATR_MIN_PERCENT` | `StrategyOrchestrator.js:727` | YES — Filters low-volatility trades | **HONORED** |
| `RISK_MANAGER_BYPASS` | `RiskManager.js:88,159` | YES — Short-circuits all risk checks | **HONORED** |
| `ACCOUNT_DRAWDOWN_BYPASS` | `StopLossChecker.js:48` | YES — Disables drawdown circuit breaker | **HONORED** |
| `MAX_POSITION_SIZE_PCT` | `OrderExecutor.js:57,71` | YES — Directly affects position sizing | **HONORED** |
| `TIER1_TARGET` / `TIER2_TARGET` / `TIER3_TARGET` | `MaxProfitManager.js:105-111` | YES — Controls profit-taking tiers | **HONORED** |

---

## Why locked exit contracts override env vars

In `core/ExitContractManager.js:41`:

```js
this.defaultContracts = TradingConfig.BASE_CONFIG.exitContracts;
```

`TradingConfig.BASE_CONFIG.exitContracts` is a per-strategy object containing locked, walk-forward-validated values. Each strategy has its own block:

| Strategy | SL | TP | minConfidence | _validated |
|---|---|---|---|---|
| RSI | -0.8% | 1.0% | 0.60 | 2026-03-20 |
| EMASMACrossover | -0.5% | 1.0% | — | locked |
| LiquiditySweep | -2.0% | 2.5% | — | locked |
| MADynamicSR | -0.8% | 1.0% | — | locked |
| CandlePattern | -0.8% | 1.0% | — | locked |
| MarketRegime | -0.8% | 1.0% | — | locked |

When `ExitContractManager.createExitContract(strategyName, ...)` is called, it pulls the strategy's locked contract first, then layers signal-level overrides (e.g., LiquiditySweep structural stops, ORB FVG levels) on top. The `STOP_LOSS_PERCENT` / `TAKE_PROFIT_PERCENT` env vars only affect `TradingConfig.exits.*` — a global default block that no strategy with its own contract ever reads.

**Implication:** The only way to change a strategy's stop loss is to modify its locked contract block in `TradingConfig.js` and re-validate. Sweeping env vars to find a better stop loss is fundamentally impossible for any strategy with a `_validated` fingerprint.

---

## SWEEP_PRESETS verdict

| Preset | Env Vars Set | Status | Should Stay? |
|---|---|---|---|
| `baseline` | (none) | Control — produces strategy default | ✅ Keep |
| `wide-stops` | `STOP_LOSS_PERCENT=2.0`, `TAKE_PROFIT_PERCENT=2.5` | **IGNORED** — locked contracts override | ❌ Delete |
| `tight-stops` | `STOP_LOSS_PERCENT=0.5`, `TAKE_PROFIT_PERCENT=1.0` | **IGNORED** — locked contracts override | ❌ Delete |
| `high-conf` | `MIN_TRADE_CONFIDENCE=0.60` | **PARTIAL** — entry gate only | ⚠️ Keep but rename |
| `low-conf` | `MIN_TRADE_CONFIDENCE=0.25` | **PARTIAL** — entry gate only | ⚠️ Keep but rename |
| `atr-*` | `ATR_FILTER_ENABLED`, `ATR_MIN_PERCENT` | **HONORED** | ✅ Keep |
| `risk-mgr-*` | `RISK_MANAGER_BYPASS` | **HONORED** | ✅ Keep |
| `drawdown-*` | `ACCOUNT_DRAWDOWN_BYPASS` | **HONORED** | ✅ Keep |
| `size-*` | `MAX_POSITION_SIZE_PCT` | **HONORED** | ✅ Keep |
| `tiers-*` | `TIER1/2/3_TARGET` | **HONORED** | ✅ Keep |
| `trail-*` | `TRAILING_STOP_PERCENT`, `TRAILING_STOP_ENABLED` | **IGNORED** | ❌ Delete |

### Why tight-stops appeared to "work"

The mystery: `tight-stops` produced +$201.07 while `baseline`, `wide-stops`, and `low-conf` all produced identical +$54.07. If the env vars are ignored, all five should have produced the same number.

**Likely explanation:** `EMASMACrossover` has its locked stop loss at -0.5%, which exactly matches `tight-stops`'s `STOP_LOSS_PERCENT=0.5`. The env var is still ignored — but the coincidence may have caused different behavior in a downstream code path that DOES read `TradingConfig.exits.stopLossPercent` (logging, dashboard, fallback paths). Worth confirming by running `tight-stops` with `STOP_LOSS_PERCENT=0.51` (one basis point off) and checking if the result reverts to $54.07.

If the result reverts, the env var has zero effect on actual trades and the +$201 was a logging-path coincidence. If it doesn't revert, there's a code path we haven't found yet that genuinely reads `STOP_LOSS_PERCENT`.

---

## Two-loop mental model

This audit reveals that "tuning OGZPrime" is actually two separate optimization loops, not one:

### Loop 1: Environmental sweep (automated, fast)
Run `parallel-backtest.js` with HONORED-only presets. Tunes:
- ATR filter threshold (which volatility regimes to trade in)
- Position sizing percentages
- Profit tier targets (when to scale out)
- Risk manager / drawdown bypasses (for testing in isolation)

Output: which environment is friendliest to the current strategy mix.

### Loop 2: Exit contract tuning (manual, slow, deliberate)
For each strategy, modify its locked `exitContract` block in `TradingConfig.js`, run walk-forward validation across train/test splits, re-lock with new `_validated` date. Tunes:
- Per-strategy stop loss
- Per-strategy take profit
- Per-strategy minimum confidence
- Per-strategy trailing stop activation/distance
- Per-strategy max hold time

Output: a per-strategy edge that survives out-of-sample testing.

**Critical:** Loop 2 cannot be automated as a sweep. The locked contracts exist because walk-forward-validated values were proven to work and unlocking them at sweep speed is how you overfit to historical noise. Loop 2 happens one strategy at a time, with intent.

---

## Action items (in priority order)

### Immediate (this session)
1. **Rewrite `SWEEP_PRESETS` in `tools/parallel-backtest.js`** — delete every preset whose env vars are IGNORED. Keep only HONORED presets. Add a new sweep category `--real` that runs only the honored set.
2. **Delete the wrong baseline matrix** — `BASELINE-matrix-2026-04-07.json` was generated with theater presets. Re-run the matrix using only honored presets and replace.
3. **Confirm the tight-stops mystery** — run with `STOP_LOSS_PERCENT=0.51` and see if the result drops back to $54.07. If yes, document the logging-path coincidence. If no, find the code path that reads `STOP_LOSS_PERCENT` and add it to this table.

### Near-term
4. **Resolve the two-config-loader problem** — `core/TradingConfig.js` and `foundation/ConfigLoader.js` both define defaults for the same env vars with different values. Identify which is the source of truth, migrate all consumers to it, delete the other. This is a separate audit.
5. **Add `SmartMoneySweep` to default sweep strategy list** — line 64 of `parallel-backtest.js` is missing it.
6. **Audit `TRAI` env vars** — `ENABLE_TRAI`, `TRAI_ENABLE_LLM`, `TRAI_ENABLE_BACKTEST` need the same HONORED/IGNORED check before any tuning that involves the LLM decision module.

### Strategic
7. **Document each strategy's locked exit contract values** in a `EXIT-CONTRACTS.md` file. Include the `_validated` date, the train/test results that justified the values, and the conditions under which they should be re-validated. No more locked values without provenance.
8. **Establish a Loop 2 protocol** — when a strategy's exit contract gets tuned, the workflow must be: unlock → modify → walk-forward validate on train/test split → confirm cross-ticker consistency → re-lock with new `_validated` date and updated provenance. Never sweep locked contracts. Never modify them in a single backtest run.

---

## Lessons

1. **Duplicate output is never normal in a sweep.** If two configs produce byte-identical results, the tool isn't varying what it claims to vary. Investigate immediately. Do not wave off as "those ranges don't matter."

2. **Trust the code, not the config.** Env vars in a sweep preset only matter if the code actually reads them in a path that affects trading. Always grep before sweeping.

3. **Locked is locked for a reason.** The validated exit contracts exist because they survived walk-forward testing. Unlocking them at sweep speed re-introduces overfitting. Tune them deliberately or not at all.

4. **AI sessions don't have memory.** Every AI assistant looking at the same sweep output will independently dismiss the duplicates as "edge cases" because there's no continuity of "we noticed this last week and the week before." Document findings in files like this one so future sessions inherit the institutional knowledge.

5. **Your gut is data.** The Architect noticed duplicate sweep results for weeks before this audit confirmed why. Pattern-recognition over many sessions is a real signal even when individual sessions can't see it.

---

## Appendix: How to verify any env var

```bash
# Step 1: Find every place the env var is read
grep -rn "process\.env\.STOP_LOSS_PERCENT" --include="*.js" /opt/ogzprime/OGZPMLV2/

# Step 2: For each result, trace what reads the resulting value
grep -rn "exits\.stopLossPercent" --include="*.js" /opt/ogzprime/OGZPMLV2/

# Step 3: Confirm whether per-strategy contracts override it
grep -rn "exitContract\.stopLossPercent" --include="*.js" /opt/ogzprime/OGZPMLV2/

# Step 4: If per-strategy contracts win, the env var is IGNORED
```

If steps 1-3 lead to a code path that ends in `BacktestRecorder.recordTrade` or `StateManager.closePosition` without being overridden, the env var is HONORED. Otherwise it's IGNORED or PARTIAL.

---

**End of audit. Update this document any time a new env var is added, removed, or its read path changes.**
