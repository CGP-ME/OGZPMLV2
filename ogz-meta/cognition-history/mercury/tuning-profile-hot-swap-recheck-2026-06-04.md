# Mercury Recheck Prompt - Tuning Profile Hot Swap - 2026-06-04

Re-attack the patched tuning-profile worker env contract.

The first attack found this concrete bypass:

- Run `--profile=config-d-flat`.
- Put `ENABLE_DYNAMIC_SIZING=true` in `config.env`.
- Because `configEnv` merged after `profile.env`, the worker could stamp
  `TUNING_PROFILE=config-d-flat` while `OrderExecutor` used dynamic confidence
  sizing.

The patch adds explicit env-key allowlists before merge:

- `tools/backtest-worker-env.js:62-93`
- `tools/backtest-worker-env.js:153-201`
- `test/backtest-worker-env.test.js:111-151`

Call sites still pass generated sweep config env:

- `tools/parallel-backtest.js:350-374`
- `tools/matrix-sweep.js:317-337`
- `tools/grid-search-confidence.js:28-45`

Execution still reads the actual dynamic-sizing flag here:

- `core/OrderExecutor.js:789-830`
- `core/OrderExecutor.js:1187-1212`

Question:

Find a concrete remaining state or input sequence where a profile-owned
sizing/exit/fee/runtime key can still override the selected tuning profile
without being visible as an intentional sweep dimension, or where the new
allowlist blocks an existing generated sweep key that should still run. Include
file:line evidence and whether the patch closes the original mechanism or only
the symptom.
