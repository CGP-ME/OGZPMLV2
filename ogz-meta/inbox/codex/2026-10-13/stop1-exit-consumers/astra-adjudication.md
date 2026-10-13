# Astra adversarial adjudication — exit volatility lookback

Candidate: `0e5964375b6b80b7c34b070212b733bcefdd67bb`; base: `23b199486aa7d5a77da3ddc340417a0bad4f9696`.
Date: 2026-10-13. Reviewer: `/root/pid_entry_adversarial` (Astra; review only).

No reachable introduced regression established. This does not change Mercury's recorded `found_break` verdict or authorize delivery without Trey's exception.

- Runner is injected at `run-empire-v2.js:1381–1404`; frame getter is at `3107–3108`. TradingLoop resolves that frame before analysis (`1227–1231`), dispatches its timeframe (`1888–1897`), and the runner forwards it (`3239`). OrderExecutor passes that execution-scope timeframe into the entry producer (`3155–3156`).
- ECM clones strategy profitManagement (`ExitContractManager.js:109–111`) and already reads it during contract production (`1049`); PolicyBuilder requires the same volatility group (`544–551`). No reachable absent-owner producer was established.
- IndicatorCalculator returns population standard deviation (`465–468`): zero is valid and a finite negative result is impossible. Accepting zero corrects the prior positive-only rejection.
- Scope, hedge, flatten, and share-range allegations concern unchanged code. Mercury's claim that shareRange.blockReason is unused is contradicted by OrderExecutor (`3168–3169`).

Reviewer inspected exact candidate/base diff and production callers. No edits or execution. Supplied behavior proof runs the entry producer excerpt with a fixture runner, not full broker execution.
