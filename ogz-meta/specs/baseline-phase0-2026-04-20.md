# Phase 0 Baseline — Config Consolidation Migration

**Date:** 2026-04-20
**Branch:** `config/consolidation` (off `broker/alpaca-integration`)
**Git SHA at baseline:** `c49c9ab667c774b51a6f171366f8f67d7ca7f956`
**Spec:** `ogz-meta/ledger/CONFIG-CONSOLIDATION-SPEC.md` §4.2
**Purpose:** Reference backtest numbers. Every migration phase must match these to the cent before advancing.

---

## Baseline command (exact)

```bash
SOLO_STRATEGY=EMASMACrossover \
ENABLE_EMA=true \
EXECUTION_MODE=backtest \
CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-2y.json \
BACKTEST_MODE=true \
BACKTEST_FAST=true \
BACKTEST_SILENT=true \
FEE_MAKER=0 \
FEE_TAKER=0 \
MIN_TRADE_CONFIDENCE=0.60 \
STOP_LOSS_PERCENT=2.5 \
ACCOUNT_DRAWDOWN_BYPASS=true \
STATE_FILE=data/state-baseline-phase0.json \
BACKTEST_NO_PATTERN_SAVE=true \
ENABLE_DASHBOARD=false \
node run-empire-v2.js
```

Additional env inherited from `.env` at time of run (relevant trading keys, redacted where sensitive):
- `DIRECTION_FILTER=long_only`
- `ENABLE_SHORTS=false`
- `ENABLE_TRAI=false`
- `BASE_POSITION_SIZE=0.01`
- `MAX_POSITION_SIZE_PCT=0.05` (implied default)
- `FEE_MAKER/FEE_TAKER=0` (command-line override beats .env Kraken values)
- `ATR_FILTER_ENABLED=true`
- `ATR_MIN_PERCENT=0.15`
- `EXIT_SYSTEM=legacy`

---

## Baseline numbers — reference state

| Metric | Value | Notes |
|---|---|---|
| Initial Balance | $10,000.00 | |
| **Final Balance** | **$17,950.589592711076** | exact float from report |
| Total P&L | +$7,950.589592711076 | |
| Total Return | +79.50589592711077% | |
| Total Trades | 1,430 | |
| Wins | 823 | |
| Losses | 607 | |
| **Win Rate** | **57.55%** | 823 / 1430 |
| **Max Drawdown** | **2.63%** | computed from running balance |
| Avg Win | $15.37 | |
| Avg Loss | -$7.75 | 2:1 asymmetric payoff |
| Total Fees | $0.00 | stock mode FEE=0 |
| Candles Processed | 15,889 | full 2y TSLA 15m dataset |
| Wall-clock Duration | 44.4s | |
| Errors | 0 | |

---

## Data file

- Path: `tuning/tsla-15m-2y.json`
- Candles: 15,889
- Range: 2024-03-19 → 2026-02-03

---

## Report artifact

- Source: `backtest-report-v14MERGED-1776675001768.json` (regenerated per run)
- Log: `/tmp/baseline-phase0.log` (ephemeral, full trade-receipts + completion line)

---

## Acceptance criteria for subsequent phases

Phase 12 baseline re-verify **must reproduce**:
- `Final Balance = $17950.589592711076` to the cent
- `Total Trades = 1430` exactly
- `Win Rate = 57.55%` exactly (823 wins)
- `Max Drawdown ≤ 2.64%` (within measurement tolerance)

Any drift in these numbers between phases signals that the migration introduced behavior change. Phase is reverted, investigated, re-proposed.

---

## Reproducer

Run the exact baseline command above on `config/consolidation` branch. Expected output matches this table to the float-level precision.

---

**Phase 0 complete. Ready for Phase 1 approval gate.**
