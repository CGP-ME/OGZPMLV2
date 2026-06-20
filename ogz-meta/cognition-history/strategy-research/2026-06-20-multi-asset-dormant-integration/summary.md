# 2026-06-20 Multi-Asset Dormant Strategy Integration

## Scope

Integrated the ledger-intake strategy candidates as dormant, config-owned strategy modules:

- `RSI2MeanReversion`
- `TimeSeriesMomentum`

Both strategies are disabled by default and only register when explicitly enabled through the pipeline toggles:

- `ENABLE_RSI2_MR=true`
- `ENABLE_TSMOM=true`

## Code Surfaces

- `modules/RSI2MeanReversion.js`
- `modules/TimeSeriesMomentum.js`
- `core/StrategyOrchestrator.js`
- `core/TradingConfig.js`
- `tools/matrix-sweep.js`
- `tools/parallel-backtest.js`
- `tools/backtest-worker-env.js`
- `test/rsi2-mean-reversion.test.js`
- `test/time-series-momentum.test.js`
- `test/parallel-backtest-solo-env.test.js`
- `test/matrix-sweep-surface.test.js`

## Edge-Case Coverage Added

- Modules fail loudly when required config keys are missing or malformed.
- Modules do not read `process.env` directly.
- Modules do not use copied ledger `??` runtime fallbacks.
- Module configs are frozen after validation.
- `invalidationConditions` are frozen and cloned into emitted exit hints.
- Solo strategy registration fails loudly when the matching dormant enable flag is false.
- Matrix and parallel sweep tools inject the explicit enable flags for solo runs.
- Worker env allowlists include the new enable flags.
- Orchestrator symbol-scoped cache keeps distinct module instances per symbol.

## Focused Tests

Command:

```bash
npx jest test/rsi2-mean-reversion.test.js test/time-series-momentum.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js test/propsafe-ema-pullback.test.js test/ema-trend-retest.test.js test/donchian-breakout.test.js --runInBand
```

Result:

- 7 suites passed
- 95 tests passed

## Mercury

Command:

```bash
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Break means find correctness failures, runtime failures, edge cases, missing wiring, or unsafe assumptions; do not revert the code. The uncommitted fix diff is saved at review-artifacts/codex-multi-asset-dormant/uncommitted-fix.diff."
```

Result:

- Mercury inspected the diff artifact after two earlier dispatches failed to inspect uncommitted work.
- Reported findings centered on `tools/parallel-backtest.js` dormant env generation.
- Manual verification found the primary findings were not defects in this slice:
  - `assertDormantStrategyEnvCompatible` intentionally checks explicit config conflicts before generated solo dormant env is merged.
  - Generated solo dormant env intentionally enables the selected dormant strategy in backtest/sweep workers.
  - `SMS_VP_RTH_ONLY` was pre-existing and outside this change.

## P0

Command:

```bash
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

Result:

- PASS
- Report: `ogz-meta/gates/runs/multi-runtime-latest.json`
- Anchor matched: `10710.667785934895 / 1692 trades / 62.8% WR / PF 1.15`

## Backtest/Sweep Smoke Results

All commands used `--profile=ttp-5k-max`.

### TSLA Confidence Sweep

Command:

```bash
node tools/matrix-sweep.js --data tsla --solo=RSI2MeanReversion --conf --profile=ttp-5k-max
```

Result:

- Parsed: 12/12
- Best: `conf=25% tiers=default lockedSL=1%`
- P&L: `-$133.44`
- Trades: `53`
- WR: `47.2%`
- PF: `0.39`
- JSON: `backtest-results/matrix-tsla-2y-RSI2MeanReversion-conf-2026-06-20-1781978356853.json`
- CSV: `backtest-results/matrix-tsla-2y-RSI2MeanReversion-conf-2026-06-20-1781978356853.csv`

Command:

```bash
node tools/matrix-sweep.js --data tsla --solo=TimeSeriesMomentum --conf --profile=ttp-5k-max
```

Result:

- Parsed: 12/12
- Best: `conf=80% tiers=default lockedSL=2%`
- P&L: `-$361.26`
- Trades: `291`
- WR: `57.0%`
- PF: `0.56`
- JSON: `backtest-results/matrix-tsla-2y-TimeSeriesMomentum-conf-2026-06-20-1781978413413.json`
- CSV: `backtest-results/matrix-tsla-2y-TimeSeriesMomentum-conf-2026-06-20-1781978413413.csv`

### NVDA Quick Sweep

Command:

```bash
node tools/matrix-sweep.js --data nvda --solo=RSI2MeanReversion --quick --profile=ttp-5k-max
```

Result:

- Parsed: 9/9
- Best: `conf=40% tiers=wide(0.01/0.015/0.02) lockedSL=1%`
- P&L: `-$252.86`
- Trades: `129`
- WR: `47.3%`
- PF: `0.40`
- JSON: `backtest-results/matrix-nvda-2y-RSI2MeanReversion-quick-2026-06-20-1781978788837.json`
- CSV: `backtest-results/matrix-nvda-2y-RSI2MeanReversion-quick-2026-06-20-1781978788837.csv`

Command:

```bash
node tools/matrix-sweep.js --data nvda --solo=TimeSeriesMomentum --quick --profile=ttp-5k-max
```

Result:

- Parsed: 9/9
- Best: `conf=70% tiers=wide(0.01/0.015/0.02) lockedSL=2%`
- P&L: `-$173.58`
- Trades: `77`
- WR: `44.2%`
- PF: `0.36`
- JSON: `backtest-results/matrix-nvda-2y-TimeSeriesMomentum-quick-2026-06-20-1781978782717.json`
- CSV: `backtest-results/matrix-nvda-2y-TimeSeriesMomentum-quick-2026-06-20-1781978782717.csv`

## Verdict

The new strategies are integrated, dormant, config-owned, solo-runnable, matrix-runnable, and symbol-isolated.

They are not profitable under the current `ttp-5k-max` smoke tests. They should remain disabled for live eval until strategy-level edge work proves otherwise.

## Runtime Blocker

`pm2 describe ogz-prime-v2` showed `ogz-prime-v2` is stopped. The active alignment note says the trading engine must not be restarted until the TTP dashboard/broker account is reconciled against the preserved TSLA active trade. This slice does not restart PM2.
