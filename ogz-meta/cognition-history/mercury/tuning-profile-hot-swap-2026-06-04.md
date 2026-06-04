# Mercury Attack Prompt - Tuning Profile Hot Swap - 2026-06-04

Break this hot-swap tuning profile implementation.

Target invariant:

A backtest worker must not claim it ran one tuning profile while
`TradingConfig` or `OrderExecutor` actually used another sizing or exit-tunable
posture. A flat profile must disable confidence-size scaling in the execution
path. Sweep dimensions may override intentional sweep fields, but parent shell
or `.env` drift must not silently change baseline profile tunables. Reports must
stamp enough worker env to audit the run.

Inspect these exact ranges:

- `tools/tuning-profiles.js:1-176`
- `tools/backtest-worker-env.js:120-157`
- `tools/parallel-backtest.js:350-431`
- `tools/parallel-backtest.js:550-633`
- `tools/parallel-backtest.js:667-785`
- `tools/matrix-sweep.js:317-361`
- `tools/matrix-sweep.js:517-660`
- `tools/matrix-sweep.js:720-844`
- `tools/grid-search-confidence.js:28-125`
- `core/OrderExecutor.js:789-830`
- `core/OrderExecutor.js:1187-1212`

Question:

Find a concrete state or input sequence where this implementation violates the
target invariant, produces misleading backtest/profile evidence, leaves a
worker vulnerable to `.env` or parent-shell drift, or only fixes the symptom
instead of the underlying config mechanism. Include file:line evidence, whether
the change closes the underlying mechanism or only the symptom, and what new
failure modes it introduces.
