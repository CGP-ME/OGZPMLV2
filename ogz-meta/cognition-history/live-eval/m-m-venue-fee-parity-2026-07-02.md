# M-M Venue Fee Parity Proof - 2026-07-02

## Scope

Lane M-M made backtest and sweep economics explicit. It did not change live trading logic or restart PM2.

## Fee Profiles

- `ttp_real`: TTP venue economics confirmed 2026-07-01.
  - `FEE_MODEL=per_share_minimum`
  - `FEE_PER_SHARE=0.005`
  - `FEE_MIN_ORDER=0.75`
  - `FEE_MAKER=0`
  - `FEE_TAKER=0`
  - `FEE_TOTAL_ROUNDTRIP=0`
  - `FEE_SAFETY_BUFFER=0`
  - `FEE_SLIPPAGE=0.0005`
- `zero`: historical comparison profile only.

## Canonical P0 Before And After

| Profile | Final Balance | Trades | Win Rate | Profit Factor | Fees |
| --- | ---: | ---: | ---: | ---: | ---: |
| `zero` historical comparison | 10663.639172063286 | 1596 | 70.1% | 1.16 | 0 |
| `ttp_real` canonical | 8338.146639366509 | 1551 | 52.2% | 0.64 | 2326.5 |

## Proof Commands

Focused tests:

```bash
npx jest test/backtest-worker-env.test.js test/trading-config-profile.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js --runInBand
```

Result: 4 suites passed, 113 tests passed.

After routing `backtest.sh` through `tools/fee-profiles.js`, hardening fee-profile merge order, and adding shell-export failure guards, the focused suite was rerun.

Result: 4 suites passed, 117 tests passed.

Zero-fee comparison:

```bash
node -e "const { runP0 } = require('./ogz-meta/anchor-runner'); const r = runP0('full', 'm-m-zero-compare', { feeProfileName: 'zero' }); console.log(JSON.stringify(r.summary, null, 2)); console.log('log=' + r.log); console.log('report=' + r.report);"
```

Report:

`/opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1783003287766-3203699-14362d40-60f7-4496-a99e-a92d13c7e977-phase0-canonical-m-m-zero-compare-2026-07-02T14-39-38-036Z-TSLA.json`

TTP-real canonical gate:

```bash
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

Result: PASS.

Gate report:

`/opt/ogzprime/OGZPMLV2/ogz-meta/gates/runs/multi-runtime-latest.json`

Worker report:

`/opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1783004633739-3208035-bf005d92-4d11-4e69-87e3-5590066f78f8-phase0-canonical-multi-runtime-gate-2026-07-02T15-01-54-493Z-TSLA.json`

Missing-profile checks:

```bash
node tools/matrix-sweep.js --data tsla --quick
node tools/parallel-backtest.js --real --data=tsla --stocks
node tools/grid-search-confidence.js
```

Result: each exited 1 with `Missing required --fee-profile. Available: ttp_real, zero`.

Invalid shell-wrapper profile:

```bash
./backtest.sh baseline --fee-profile=missing
```

Result: exited 1 with `[TradingConfig] Unknown fee profile 'missing'. Available: ttp_real, zero`.

Poisoned parent/config env check:

- `configEnv: { FEE_TAKER: '0', FEE_MODEL: 'percent', FEE_PER_SHARE: '0', FEE_MIN_ORDER: '0' }` threw `Disallowed configEnv override 'FEE_TAKER'`.
- `instrumentEnv: { FEE_TAKER: '0' }` threw `Disallowed instrumentEnv override 'FEE_TAKER'`.
- Parent env with `FEE_MODEL=percent`, `FEE_PER_SHARE=0`, `FEE_MIN_ORDER=0`, `FEE_TAKER=0.99` plus `feeProfileName='ttp_real'` produced:
  - `BACKTEST_FEE_PROFILE=ttp_real`
  - `FEE_MODEL=per_share_minimum`
  - `FEE_PER_SHARE=0.005`
  - `FEE_MIN_ORDER=0.75`
  - `FEE_TAKER=0`
- Parent env with poisoned fee vars plus `./backtest.sh baseline --fee-profile=missing` exited 1 before worker launch.

## Operator Notes

- Backtest and sweep commands must pass `--fee-profile=ttp_real` for live-eval economics.
- `--fee-profile=zero` is deliberate comparison only and remains visible in reports as `BACKTEST_FEE_PROFILE=zero`.
- `backtest.sh` defaults to `ttp_real` and resolves profile env through `tools/fee-profiles.js`, which reads `config/trading.config.json`.
- In worker env construction, the resolved fee profile is applied after normalized config env so future config allowlist edits cannot make config env beat the selected fee profile.
- PM2 was not restarted for this lane.
