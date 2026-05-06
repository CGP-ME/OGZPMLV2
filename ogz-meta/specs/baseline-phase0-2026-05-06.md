# Phase 0 Baseline

**Date:** 2026-05-06
**Branch:** `rebuild/clean-from-baseline`
**Git SHA at baseline:** `4a6f14a`
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
| **Final Balance** | **$18,497.278595001146** | exact float from report |
| Total P&L | +$8,497.278595001146 | |
| Total Return | +84.97% | |
| Total Trades | 1,384 | |
| Wins | 830 | |
| Losses | 554 | |
| **Win Rate** | **60.0%** | 830 / 1384 |
| **Max Drawdown** | **2.63%** | $389.26 |
| Avg Win | $15.76 | |
| Avg Loss | -$8.27 | |
| Profit Factor | 2.85 | |
| Expectancy | $6.14 | |
| Total Fees | $0.00 | stock mode FEE=0 |
| Candles Processed | 15,889 | full 2y TSLA 15m dataset |
| Errors | 0 | |

---

## Data file

- Path: `tuning/tsla-15m-2y.json`
- Candles: 15,889
- Range: 2024-03-19 → 2026-02-03

---

## Acceptance criteria for subsequent phases

Phase reproduction **must match**:
- `Final Balance = $18,497.278595001146` to the cent
- `Total Trades = 1,384` exactly
- `Win Rate = 60.0%` exactly (830 wins)
- `Max Drawdown ≤ 2.64%` (within measurement tolerance)

Any drift in these numbers between phases signals that the migration introduced behavior change. Phase is reverted, investigated, re-proposed.

---

## Reproducer

Run the exact baseline command above. Expected output matches this table to the float-level precision.
