# Backtest Tuning Profiles - 2026-06-04

## Purpose

The current TSLA stock backtest surface had three config-drift problems:

1. Sweep workers used a clean process env for a few known fields, but unset
   trading tunables could still be filled by the child process loading `.env`.
2. `ENABLE_DYNAMIC_SIZING` existed in `TradingConfig`, but `OrderExecutor`
   always applied the confidence-size multiplier on entries.
3. `ogz-meta/anchor-runner.js` built P0 from broad `process.env` and wrote
   same-day log names, so parent-shell env could move the canonical gate and
   later runs could overwrite earlier P0 logs.

This made it hard to compare current eval sizing, old flat-sizing posture, and
wide historical target posture without changing `.env` or trusting implicit
parent-shell state. It also made P0 less deterministic than the gate name
implied.

## New Control

Sweep tools now accept an explicit profile:

```bash
node tools/parallel-backtest.js --atr --solo=RSI --stocks --data=tsla --profile=config-d-flat
node tools/matrix-sweep.js --data tsla --solo=RSI --conf --profile=config-d-flat
```

If no profile is provided, both tools use `current-eval`.

Each worker report or P0 gate detail stamps:

- `tuningProfile`
- `workerEnv.TUNING_PROFILE`
- `workerEnv.BACKTEST_TUNING_PROFILE`
- sizing fields
- exit tier fields
- stock fee/slippage fields
- instrument fields
- solo strategy and sweep fields

Config-level overrides are validated against an explicit allowlist before the
worker env is built. Current allowed config override fields are the generated
sweep dimensions and dormant strategy enable flags used by the repo sweep tools.
Profile-owned fields such as `ENABLE_DYNAMIC_SIZING` cannot be supplied through
`configEnv`.

P0 now uses the same worker-env builder with the pinned `current-eval` profile,
stock zero-fee mode, and a unique timestamped ledger log name per run.

Mercury attack result:

- Initial attack found a real bypass: `configEnv.ENABLE_DYNAMIC_SIZING=true`
  could override `config-d-flat` while the worker still stamped
  `TUNING_PROFILE=config-d-flat`.
- Patch: `tools/backtest-worker-env.js` now rejects config and instrument env
  keys outside explicit allowlists before merge.
- Recheck did not show a valid remaining bypass. It noted that a selected
  profile itself changes runtime behavior, which is intentional and visible in
  `tuningProfile` plus `workerEnv`.
- Added tests mechanically proving current generated parallel and matrix sweep
  env keys are covered by the allowlist.
- Final P0 anchor attack response:
  `ogz-meta/cognition-history/mercury/p0-anchor-profile-env-contract-final-2026-06-04.response.md`.
  Mercury's claimed parent `TUNING_PROFILE` bypass is false against the final
  code because `anchor-runner.js` passes `profileName: tuningProfile.name` into
  `buildBacktestWorkerEnv`; the builder's ambient profile default is not used
  for P0. `test/anchor-runner-env.test.js` now pollutes both `TUNING_PROFILE`
  and `BACKTEST_TUNING_PROFILE` and proves P0 still stamps `current-eval`.
- Final recheck response:
  `ogz-meta/cognition-history/mercury/p0-anchor-profile-env-contract-final-recheck-2026-06-04.response.md`.
  Mercury claimed `ENABLE_SHORTS` was allowed but absent from `workerEnv`. This
  is false against the current file: `tools/backtest-worker-env.js` includes
  `ENABLE_SHORTS` in `SUMMARY_KEYS`, and `test/anchor-runner-env.test.js`
  asserts the P0 worker env stamps `ENABLE_SHORTS=false`.

## Profiles

`current-eval`

- Current explicit TSLA stock-eval posture.
- Freezes the `.env` values workers had been inheriting implicitly.
- Dynamic confidence sizing is on.
- Max position percent is 0.05.
- Tier targets are 0.007, 0.010, 0.015, final 0.025.
- Stock sweeps run zero commission with slippage still stamped as 0.0005.

`config-d-flat`

- Restores the March Config D sizing posture as an explicit worker profile.
- Dynamic confidence sizing is off.
- Max position percent is 0.04.
- Absolute position cap is 0.04 before any existing confluence multiplier.
- Stop/take-profit globals are 2.0 and 2.5.
- Tier targets remain 0.007, 0.010, 0.015, final 0.025.
- Evidence: `core/TradingConfig.js@e9a3eca`,
  `core/OrderExecutor.js@e9a3eca`,
  `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md:66-79`.
- Limit: the old Config D note was pre-Mercury2 and says it cannot be directly
  reproduced on current code.

`legacy-wide`

- Historical wide-target posture from `.env.gates`.
- Dynamic confidence sizing is on.
- Max position percent is 0.05.
- Tier targets are 0.020, 0.040, 0.060, final 0.100.
- Useful for checking whether tight tier exits are choking strategy winners.

`balanced20-flat`

- Deprecated profile-table balanced size made explicit for testing only.
- Dynamic confidence sizing is off.
- Max position percent is 0.20.
- This is not claimed as historical worker behavior unless selected.

## Important Limits

- This does not prove old May positive TSLA artifacts used any exact profile.
  Those JSON/CSV artifacts do not include a full worker env stamp.
- Strategy exit contracts can still override global stop-loss and take-profit
  fields. The worker env stamp makes the selected profile visible, but the
  live execution path still follows `TradingConfig` and per-strategy contracts.
- `config-d-flat` disables the confidence-size multiplier. It does not remove
  the existing orchestrator confluence multiplier.
- This does not edit `.env`.

## Verification Plan

Required before committing:

```bash
node --check tools/tuning-profiles.js
node --check tools/backtest-worker-env.js
node --check tools/parallel-backtest.js
node --check tools/matrix-sweep.js
node --check tools/grid-search-confidence.js
node --check core/OrderExecutor.js
npm test -- --runInBand test/backtest-worker-env.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js test/order-executor-pause-gate.test.js test/anchor-runner-env.test.js
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "<single attack prompt>"
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "<single recheck prompt>"
node ogz-meta/gates/multi-runtime-gate-runner.js --p0 --write-report
```

Current P0 anchor from `ogz-meta/BACKTEST-OPS.md`:

```text
$10061.215823687478 / 1688 trades / 62.1% WR / PF 1.01
```

Final stamped P0 proof:

- gate report: `ogz-meta/gates/runs/multi-runtime-latest.json`
- backtest report:
  `backtest-results/worker-reports/backtest-report-1780542189823-phase0-canonical-multi-runtime-gate-2026-06-04T03-02-20-589Z.json`
- full log:
  `ogz-meta/ledger/phase0-canonical-multi-runtime-gate-2026-06-04T03-02-20-589Z.log`
- worker profile: `current-eval`
- worker instrument: `TSLA / alpaca / stocks / 15m`
- worker fees: `FEE_MAKER=0`, `FEE_TAKER=0`, `FEE_SLIPPAGE=0.0005`

Retired P0 values:

- `$13255.255799695915 / 1410 / 60.6% / PF 1.71`: over-credited tiered partial
  exits.
- `$10000.26792578263 / 1410 / 60.6% / PF 1.00`: produced before P0 used the
  scrubbed worker-env/profile contract. It is not reproducible from a stamped
  worker env because the old reports did not include full env stamps and the
  old same-day log was overwritten by a later run.

## Config-D Smoke Result

Command:

```bash
node tools/parallel-backtest.js --atr --solo=EMASMACrossover --stocks --data=tsla --profile=config-d-flat
```

Saved output:

- full log:
  `ogz-meta/cognition-history/live-eval/profile-rebaseline-2026-06-04/atr-emasmacrossover-config-d-flat.log`
- result JSON:
  `backtest-results/sweep-1780542861102.json`

Observed winner:

- config: `atr-040`
- net P&L: `$-534.70`
- trades: `2800`
- win rate: `58.0%`
- profit factor: `0.82`

The saved JSON stamps `tuningProfile=config-d-flat`,
`ENABLE_DYNAMIC_SIZING=false`, `MAX_POSITION_SIZE_PCT=0.04`,
`ABSOLUTE_POSITION_CAP=0.04`, `TRADING_PAIR=TSLA`, `BROKER=alpaca`,
`ASSET_CLASS=stocks`, zero stock fees, and `FEE_SLIPPAGE=0.0005`.

This proves the profile selection and worker-env stamping path runs end to end.
It does not reproduce the old positive May EMA artifact by itself.

## Config-D ATR Rerun Set

MarketRegime is excluded because it is a filter/multiplier, not a signal
strategy for this sweep set.

```bash
node tools/parallel-backtest.js --atr --solo=RSI --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=EMASMACrossover --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=MADynamicSR --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=LiquiditySweep --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=SmartMoneySweep --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=OGZTPO --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=OpeningRangeBreakout --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=CandlePattern --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=NoWickImbalance --stocks --data=tsla --profile=config-d-flat
node tools/parallel-backtest.js --atr --solo=BreakRetest --stocks --data=tsla --profile=config-d-flat
```

Full output logs should be saved under:

```text
ogz-meta/cognition-history/live-eval/profile-rebaseline-2026-06-04/
```
