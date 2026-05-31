# Phase 0 Baseline

**Original capture date:** 2026-05-06 (git SHA `4a6f14a`)
**Anchor revised:** 2026-05-13 after Fix 2 (P1-A `trade.size` stale after partial close)
**Current executable anchor reconciled:** 2026-05-30 after KILL 7 default adaptive trailing and multi-runtime gate adoption
**Branch:** `rebuild/clean-from-baseline`
**Purpose:** Reference backtest numbers. Current enforcement lives in `ogz-meta/anchor-runner.js` and `ogz-meta/gates/multi-runtime-gate-runner.js`; every migration phase must match the executable gate before advancing.

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

## Current executable gate — reference state

| Metric | Value | Notes |
|---|---|---|
| Initial Balance | $10,000.00 | |
| **Final Balance** | **$13,255.255799695915** | exact float from current gate report |
| Total P&L | +$3,255.2557996959144 | |
| Total Return | +32.55% | |
| Total Trades | 1,410 | |
| Wins | 855 | |
| Losses | 555 | |
| **Win Rate** | **60.6%** | 855 / 1410 |
| **Max Drawdown** | **3.17%** | $388.04 |
| Avg Win | $9.142071267535206 | |
| Avg Loss | -$8.218405646930977 | |
| Profit Factor | 1.71 | |
| Expectancy | $2.31 | |
| Total Fees | $0.00 | stock mode FEE=0 |
| Candles Processed | 15,889 | full 2y TSLA 15m dataset |
| Errors | 0 | |

Current verification command:

```bash
node ogz-meta/gates/multi-runtime-gate-runner.js --p0 --write-report
```

Current verification report:

- `ogz-meta/gates/runs/multi-runtime-latest.json`
- `ogz-meta/ledger/phase0-canonical-multi-runtime-gate-2026-05-30.log`
- `backtest-report-v14MERGED-1780122011846.json`

---

## Data file

- Path: `tuning/tsla-15m-2y.json`
- Candles: 15,889
- Range: 2024-03-19 → 2026-02-03

---

## Acceptance criteria for subsequent phases

Phase reproduction **must match**:
- `Final Balance = $13,255.255799695915` to the cent
- `Total Trades = 1,410` exactly
- `Win Rate = 60.6%` exactly (855 wins)
- `Max Drawdown ≤ 3.20%` (within measurement tolerance)

Any drift in these numbers between phases signals that the migration introduced behavior change. Phase is reverted, investigated, re-proposed.

---

## Anchor history

The current executable gate moved after KILL 7 wired the previously dormant adaptive trailing modifiers into the real P0 path. The root-cause record is `ogz-meta/sessions/session-2026-05-21-kill7-structure-aware-trailing.md`: default adaptive behavior reproduces `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`, while disabling structure, trend widen, and ratchet modifiers reproduces the old `$13213.042341608163 / 1384 trades / 60.0% WR / PF 1.72`.

**Post-Fix-2 / modifiers-off anchor (historical — do NOT use as the current default gate):**
- Final Balance: $13,213.042341608163
- Total Return: +32.13%
- Total Trades: 1,384
- Wins/Losses: 830 / 554
- Win Rate: 60.0%
- Max Drawdown: 3.19%
- Profit Factor: 1.72
- Avg Winner: $9.23
- Avg Loser: -$8.02
- Expectancy: $2.32

The 2026-05-06 baseline reported $18,497.278595001146 / +84.97% / PF 2.85 / avgWin $15.76. Those numbers were a credible-looking lie produced by the P1-A bug: `StateManager.reducePosition` updated `trade.sizeUsd` but left `trade.size` at the original full amount. Every consumer reading `trade.size` after a partial close — OrderExecutor's P&L computation, fees, console logs — got a stale, inflated value. When the residual portion of a winning trade closed at a higher tier target, P&L was computed against the original full size, double-counting the already-captured profit. Losers don't hit tier targets the same way (stops trigger full closes), so loser math was correct; only winners were inflated.

Trade count and direction were never affected by the P1-A bug (same 1,384 trades on same candles before the later adaptive-trailing default changed). Fix 2 (commit landed 2026-05-13) added `trade.size = remainingSize` next to the existing `trade.sizeUsd = remainingSize` assignment, restoring sync. The pre-fix numbers were instrumentation noise that masqueraded as alpha.

**Pre-Fix-2 anchor (for archival reference only — do NOT use as regression gate):**
- Final Balance: $18,497.278595001146
- Total Return: +84.97%
- Avg Winner: $15.76
- Profit Factor: 2.85
- Max Drawdown: 2.63%

---

## Reproducer

Run the executable gate command above. Expected output matches the current executable gate table to the float-level precision.
