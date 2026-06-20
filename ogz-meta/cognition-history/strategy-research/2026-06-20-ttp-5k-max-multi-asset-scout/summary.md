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

This scout does not prove that every strategy has no edge. It proves the current `--quick` matrix shape on TSLA 15m 2y, under the `ttp-5k-max` economics profile, found no profitable actual-trading config among the non-structural-exit strategies.

Next evidence step should not be another blind seven-ticker all-strategy loop on the one-worker VPS. Use targeted passes:

1. Run `--conf` for `LiquiditySweep`, `SmartMoneySweep`, and `NoWickImbalance` on TSLA so the skipped structural-exit strategies are represented.
2. Run ticker-by-ticker solo sweeps only for the nearest-to-flat candidates: `OGZTPO`, `PropSafeEMAPullback`, `RSI`, `OpeningRangeBreakout`.
3. Separately compare `ttp-5k-max` vs `current-eval` vs one-share on the same strategy/ticker command shape so fee-floor and dynamic sizing effects are isolated.
