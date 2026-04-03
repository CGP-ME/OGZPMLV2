# FIX 2026-04-03: Single Source of Truth for Backtest P&L

## The Bug
The 2026-03-28 "per-trade equity accounting" refactor changed `closePosition()` so `state.balance` never moves — only `realizedPnL` changes. But the BACKTEST COMPLETE output and report JSON still read `stateManager.get('balance')`.

Result: every backtest printed TWO different "Final Balance" lines:
- BacktestRunner COMPLETE block (wrong): always ~$10,000
- BacktestRecorder printSummary (correct): actual P&L

## What Changed

### `core/BacktestRunner.js` (ONLY file changed)
- Moved BacktestRecorder trade collection above the print block
- "BACKTEST COMPLETE" output uses BacktestRecorder P&L (was: stale StateManager balance)
- Report JSON `summary` now matches `metrics` (was: summary wrong, metrics right)
- Added trade count (W/L) to console output

### `run-empire-v2.js` — UNTOUCHED
The shutdown print still reads stateManager balance. Fixing that belongs in StateManager (add a getter), not in the orchestrator.

## Deploy on VPS
```bash
cd /opt/ogzprime/OGZPMLV2

# Backup original
cp core/BacktestRunner.js core/BacktestRunner.js.bak-pre-pnl-fix

# Drop in fix
cp /path/to/ogz-fix-2026-04-03/BacktestRunner.js core/BacktestRunner.js

# Test
SOLO_STRATEGY=RSI,EMASMACrossover EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json BACKTEST_MODE=true BACKTEST_FAST=true \
BACKTEST_NO_PATTERN_SAVE=true FEE_MAKER=0 FEE_TAKER=0 ENABLE_TRAI=false \
ENABLE_SHORTS=false ACCOUNT_DRAWDOWN_BYPASS=true node run-empire-v2.js 2>&1 | \
grep "Final Balance"
```

Expected: BACKTEST COMPLETE "Final Balance" now matches BacktestRecorder's "Final Balance" below it.

## Risk
Zero execution path changes. Display/reporting only. No trade logic, no position sizing, no entry/exit changes.
