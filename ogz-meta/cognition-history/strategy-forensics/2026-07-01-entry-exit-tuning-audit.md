# Strategy Entry/Exit Tuning Audit - 2026-07-01

## Verified Sweep Finding

Source artifact:
`backtest-results/tsla-conf-online-strategy-summary-1782909319676-deduped.json`

The artifact explicitly states:

> matrix-sweep conf phase uses locked/current stopLossPercent metadata; it does not sweep SL values.

That means the confidence sweep did not test stop, target, trailing, or max-hold geometry. It only changed entry confidence thresholds while the current strategy exit geometry stayed in place.

## Fee-Pressure Evidence

Profile/fee context from the artifact: TSLA, confidence phase, `ttp-5k-max`, per-share minimum fee model.

Selected best confidence results:

| Strategy | Best Net P&L | Trades | Win Rate | PF | Fees |
| --- | ---: | ---: | ---: | ---: | ---: |
| RSI | 36.26 | 63 | 36.5% | 1.31 | 94.50 |
| EMASMACrossover | -230.07 | 157 | 61.1% | 0.52 | 235.50 |
| MADynamicSR | -261.43 | 188 | 61.2% | 0.57 | 282.00 |
| DonchianBreakout | -71.07 | 108 | 71.3% | 0.67 | 162.00 |
| TimeSeriesMomentum | -315.20 | 282 | 69.5% | 0.57 | 423.00 |
| RSI2MeanReversion | -168.61 | 77 | 62.34% | 0.37 | 115.50 |
| EMATrendRetest | -195.22 | 115 | 49.57% | 0.40 | 172.50 |
| PropSafeEMAPullback | -39.36 | 15 | 40.0% | 0.25 | 22.50 |

Interpretation: several strategies can win often and still lose under eval fees because the exit geometry is not paying enough per trade, stops/holds are mismatched, or both. Entry confidence alone is not the complete problem.

## Live Code Inputs Already Exist

These are strategy-owned knobs that current code already reads:

- `core/TradingConfig.js` reads Donchian exit geometry from `DONCHIAN_ATR_STOP_MULT`, `DONCHIAN_TAKE_PROFIT_PERCENT`, `DONCHIAN_TRAILING_STOP_PERCENT`, `DONCHIAN_TRAILING_ACTIVATION`, and `DONCHIAN_MAX_HOLD_MINUTES`.
- `core/TradingConfig.js` reads TimeSeriesMomentum exit geometry from `TSMOM_MIN_RETURN`, `TSMOM_STOP_LOSS_PERCENT`, `TSMOM_TAKE_PROFIT_PERCENT`, `TSMOM_TRAILING_STOP_PERCENT`, `TSMOM_TRAILING_ACTIVATION`, and `TSMOM_MAX_HOLD_MINUTES`.
- `core/TradingConfig.js` reads RSI2MeanReversion exit geometry from `RSI2_MR_STOP_LOSS_PERCENT`, `RSI2_MR_TAKE_PROFIT_PERCENT`, `RSI2_MR_TRAILING_STOP_PERCENT`, `RSI2_MR_TRAILING_ACTIVATION`, and `RSI2_MR_MAX_HOLD_MINUTES`.
- `core/TradingConfig.js` reads PropSafeEMAPullback and EMATrendRetest R-based geometry from their `*_ATR_STOP_MULT`, `*_TARGET_RR`, `*_TRAIL_ACTIVATION_R`, `*_TRAIL_DISTANCE_R`, and `*_MAX_HOLD_MINUTES` keys.
- `modules/DonchianBreakout.js`, `modules/TimeSeriesMomentum.js`, `modules/RSI2MeanReversion.js`, `modules/PropSafeEMAPullback.js`, and `modules/EMATrendRetest.js` emit `exitContractHint` from those strategy configs.

## Current Change

Add a `parallelBacktest.sweepPresets.exitGeometry` surface and expose it as:

```bash
node tools/parallel-backtest.js --exit-geometry --data tsla --stocks --profile ttp-5k-max
```

This is a backtest/tuning surface only. It does not alter live strategy defaults. It also does not reopen generic `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, or `TRAILING_STOP_PERCENT` overrides; those remain rejected because they do not represent the locked strategy-owned exit contract path.

## Next Proof Step

Run the exit-geometry sweep, rank the winners, then only promote a config after a focused repeat run and P0/backtest parity checks.

## Exit Geometry Sweep Result

Command:

```bash
node tools/parallel-backtest.js --exit-geometry --data tsla --stocks --profile ttp-5k-max
```

Result artifact:
`backtest-results/sweep-1782942797697.json`

Sweep outcome:

- 17 configs completed.
- 17 configs parsed.
- 0 configs reported worker errors.
- Best config was still negative: `propema-tight-r`, `-13.67` net P&L, 12 trades, 58.3% win rate, PF 0.55, 18.00 fees.
- PropSafe improved from current `-39.36` / 15 trades / 40.0% WR to tight-R `-13.67` / 12 trades / 58.3% WR.
- Donchian tight geometry was harmful: `donchian-fee-tight` produced 488 trades and `-675.08`.
- TimeSeriesMomentum and RSI2MeanReversion tighter variants increased churn and stayed fee-negative.

Conclusion: the new sweep surface is real and changes behavior, but no config from this coarse pass is safe to promote. The next tuning target should narrow around PropSafe and the already-profitable RSI confidence result instead of enabling the exit-geometry winner live.

## Mercury Review - 2026-07-02

Command:

```bash
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix..."
```

Provider status:

- Mercury passed provider preflight once `.env` was loaded for the command.
- The later Fable consensus bridge switched to local Claude Code (`consensus.provider=claude-code`), and `node trai_brain/mercury-bridge/ask.js --check-providers` passed for both Mercury and Fable on 2026-07-02.

Mercury findings:

- Valid: `parallel-backtest --match` used raw `new RegExp(pattern, 'i')`, so malformed input such as `--match "(unclosed"` crashed the runner before producing a controlled no-match result.
- False against current code: the claim that tuning profiles can inject generic locked-exit env keys. Current `TradingConfig` validates profile definitions through `assertProfileEnvIsHonest`, rejects `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, `TRAILING_STOP_PERCENT`, and `TRAILING_ACTIVATION`, and requires every profile env key to map through `PROFILE_ENV_CONFIG_PATHS`.
- False against current code: the claim that solo mode discards explicit strategy-owned exit-geometry overrides. `applySoloStrategyToConfigs` preserves existing `config.env` and only adds `SOLO_STRATEGY` when missing.

Patch after Mercury:

- `filterConfigsByName` now falls back to a literal case-insensitive match when the user supplies invalid regex text.
- Added tests proving invalid regex text is handled literally and solo mode preserves explicit strategy-owned exit geometry.
