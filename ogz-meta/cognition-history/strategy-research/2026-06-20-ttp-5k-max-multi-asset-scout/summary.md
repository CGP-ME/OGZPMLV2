# TTP 5k MAX Multi-Asset Scout - 2026-06-20

## Scope

Command shape tested:

```bash
node tools/matrix-sweep.js --data <ticker> --quick --all-strategies --profile=ttp-5k-max
```

Evidence folder:

```text
ogz-meta/cognition-history/strategy-research/2026-06-20-ttp-5k-max-multi-asset-scout/
```

Profile confirmed from `config/trading.config.json`:

- `INITIAL_BALANCE=5000`
- `MIN_TRADE_CONFIDENCE=0.5`
- `ENABLE_DYNAMIC_SIZING=true`
- `ENTRY_MIN_STOCK_SHARES=2`
- `ENTRY_MAX_STOCK_SHARES=8`
- `ATR_MIN_PERCENT=0.40`
- `FEE_MODEL=per_share_minimum`
- `FEE_PER_SHARE=0.005`
- `FEE_MIN_ORDER=0.75`
- `TTP_DAILY_LOSS_LIMIT_DOLLARS=50`
- `TTP_MAX_LOSS_THRESHOLD_EQUITY=4850`
- `TTP_PROFIT_TARGET_DOLLARS=300`

## Runtime Finding

The VPS resolves `tools/matrix-sweep.js` to one worker:

```text
Intel Core Processor (Broadwell, no TSX, IBRS) | 3 threads | 1 workers
```

That made one `--quick --all-strategies` ticker run take 4965.1 seconds. The attempted multi-ticker wrapper was stopped after TSLA completed and SPY began, to avoid blindly burning hours before inspecting the first complete report.

## Completed Run

TSLA completed:

```text
Log:  ogz-meta/cognition-history/strategy-research/2026-06-20-ttp-5k-max-multi-asset-scout/matrix-tsla-quick-all-ttp-5k-max.log
JSON: backtest-results/matrix-tsla-2y-all-quick-2026-06-20-1781947199942.json
CSV:  backtest-results/matrix-tsla-2y-all-quick-2026-06-20-1781947199942.csv
```

Matrix result:

```text
99/99 parsed in 4965.1s
```

Important caveat:

```text
--quick excluded structural-exit strategies from exit-geometry sweep:
LiquiditySweep, SmartMoneySweep, NoWickImbalance
```

Those need separate `--conf` or ATR-compatible runs if they are being evaluated.

## Structural-Exit Follow-Up Run

Command shape tested:

```bash
node tools/matrix-sweep.js --data tsla --solo=<strategy> --conf --profile=ttp-5k-max
```

Completed logs and reports:

```text
LiquiditySweep log: ogz-meta/cognition-history/strategy-research/2026-06-20-ttp-5k-max-multi-asset-scout/matrix-tsla-conf-liquiditysweep-ttp-5k-max.log
LiquiditySweep JSON: backtest-results/matrix-tsla-2y-LiquiditySweep-conf-2026-06-20-1781969916938.json

SmartMoneySweep log: ogz-meta/cognition-history/strategy-research/2026-06-20-ttp-5k-max-multi-asset-scout/matrix-tsla-conf-smartmoneysweep-ttp-5k-max.log
SmartMoneySweep JSON: backtest-results/matrix-tsla-2y-SmartMoneySweep-conf-2026-06-20-1781970532335.json

NoWickImbalance log: ogz-meta/cognition-history/strategy-research/2026-06-20-ttp-5k-max-multi-asset-scout/matrix-tsla-conf-nowickimbalance-ttp-5k-max.log
NoWickImbalance JSON: backtest-results/matrix-tsla-2y-NoWickImbalance-conf-2026-06-20-1781971090972.json
```

| Strategy | Parsed / Total | Errored | Best Net PnL | Trades | WR | PF | Max DD | Best Config | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| LiquiditySweep | 12 / 12 | 0 | -$2.62 | 1 | 0.0% | 0.00 | 0.05% | `Liqu_lockedsl2_def_c25` | Effectively inactive; only one trade in 2y TSLA under this profile. |
| SmartMoneySweep | 12 / 12 | 0 | -$164.72 | 72 | 43.1% | 0.25 | 3.29% | `Smar_lockedsl0.3_def_c80` | Actual trading result is materially negative under TTP fee/profile economics. |
| NoWickImbalance | 2 / 12 | 10 | $0.00 | 0 | n/a | n/a | n/a | `NoWi_lockedsl1.5_def_c75` | The `$0` best is no-trade. Ten lower-confidence configs produced trades but were classified failed because workers reported candle-processing errors. |

NoWickImbalance failure detail from worker log `backtest-results/worker-logs/matrix-1781970532379-xeee.log`:

```text
[StateManager.updateState] active trade quantity invariant failed: invalid open sizeUsd=2.842170943040401e-14
MaxProfitManager.start: exitContract.stopLossPercent must be negative risk distance (got 0.09882884967611491)
[StateManager.updateState] active trade quantity invariant failed: invalid open sizeUsd=1.4210854715202004e-14
MaxProfitManager.start: exitContract.stopLossPercent must be negative risk distance (got 17.343530716856257)
```

The failed NoWick worker reports still contain usable performance data. Example `NoWi_lockedsl1.5_def_c25` wrote a report with:

```text
64 trades, 32.8% WR, -$165.20 net PnL, $96.00 fees, PF 0.31, max DD 3.51%, errors=2
```

Interpretation: NoWick is not merely losing in this pass; it is also violating the MPM exit-contract sign contract in some entry paths and hitting near-zero residual active-trade size invariants. That is a separate fix/audit item before treating its matrix results as clean.

## TSLA Result, Trade-Count Filtered

The raw matrix selected `$0.00` no-trade configs as the overall best for some strategies. Those are not edge. Filtering out null/zero-trade results, every actual trading config was negative under `ttp-5k-max`.

| Rank | Strategy | Best Net PnL | Trades | WR | PF | Max DD | Best Config |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | OGZTPO | -$5.67 | 9 | 66.7% | 0.62 | 0.3% | `OGZT_lockedsl2_tight_c70` |
| 2 | PropSafeEMAPullback | -$28.26 | 13 | 53.8% | 0.37 | 0.83% | `Prop_lockedsl1.1_default_c40` |
| 3 | RSI | -$28.86 | 7 | 0.0% | 0.00 | 0.58% | `RSI_lockedsl0.8_tight_c70` |
| 4 | OpeningRangeBreakout | -$76.02 | 64 | 59.4% | 0.42 | 1.75% | `Open_lockedsl2_wide_c55` |
| 5 | DonchianBreakout | -$157.08 | 71 | 32.4% | 0.23 | 3.14% | `Donc_lockedsl2.5_default_c40` |
| 6 | EMASMACrossover | -$243.53 | 181 | 53.0% | 0.58 | 5.19% | `EMAS_lockedsl0.5_wide_c70` |
| 7 | EMATrendRetest | -$277.29 | 168 | 43.5% | 0.41 | 6.43% | `EMAT_lockedsl1_wide_c40` |
| 8 | MADynamicSR | -$313.73 | 213 | 50.2% | 0.60 | 8.37% | `MADy_lockedsl0.8_wide_c70` |
| 9 | CandlePattern | -$390.76 | 456 | 41.9% | 0.70 | 7.82% | `Cand_lockedsl0.8_wide_c40` |

## Interrupted Run

SPY started after TSLA and was interrupted before batch 1 returned:

```text
Log: ogz-meta/cognition-history/strategy-research/2026-06-20-ttp-5k-max-multi-asset-scout/matrix-spy-quick-all-ttp-5k-max.log
State: no usable report
```

## Interpretation

This scout does not prove that every strategy has no edge. It proves the current matrix shapes on TSLA 15m 2y, under the `ttp-5k-max` economics profile, found no profitable clean actual-trading config among the tested strategies.

Next evidence step should not be another blind seven-ticker all-strategy loop on the one-worker VPS. Use targeted passes:

1. Investigate NoWickImbalance's positive `exitContract.stopLossPercent` path and near-zero residual active-trade size invariant.
2. Run ticker-by-ticker solo sweeps only for the nearest-to-flat clean candidates: `OGZTPO`, `LiquiditySweep`, `PropSafeEMAPullback`, `RSI`, `OpeningRangeBreakout`.
3. Separately compare `ttp-5k-max` vs `current-eval` vs one-share on the same strategy/ticker command shape so fee-floor and dynamic sizing effects are isolated.
