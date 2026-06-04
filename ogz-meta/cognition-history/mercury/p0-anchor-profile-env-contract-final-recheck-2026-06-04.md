Recheck the P0 anchor profile/env contract after the final attack response.

Prior Mercury claimed parent `TUNING_PROFILE` pollution can change P0 while it still stamps `current-eval`.

Relevant code evidence to verify or break:

- `ogz-meta/anchor-runner.js:96-109` derives `tuningProfile = resolveTuningProfile(P0_TUNING_PROFILE)` and passes `profileName: tuningProfile.name` into `buildBacktestWorkerEnv`.
- `tools/backtest-worker-env.js:170-183` only uses ambient `sourceEnv.TUNING_PROFILE || sourceEnv.BACKTEST_TUNING_PROFILE` as the default value when `profileName` is omitted.
- `test/anchor-runner-env.test.js:13-54` now pollutes `TUNING_PROFILE=legacy-wide`, `BACKTEST_TUNING_PROFILE=config-d-flat`, `TRADING_PAIR=BTC-USD`, and `FEE_MAKER=0.99`, then asserts P0 still stamps `current-eval`, TSLA/alpaca/stocks/15m, and zero stock fees.
- `ogz-meta/gates/multi-runtime-gate-runner.js:339-345` now returns both `tuningProfile` and exact `workerEnv` in the passing gate detail.

Question:

Find a remaining practical bypass where an operator can run `node ogz-meta/gates/multi-runtime-gate-runner.js --p0 --write-report` and get a passing gate whose stamped `workerEnv` lies about the actual env used by `run-empire-v2.js`.

Do not re-raise a profile pollution finding unless you can explain how it bypasses the explicit `profileName` argument. Give file:line evidence.
