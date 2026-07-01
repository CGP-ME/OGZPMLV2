# MPM Replacement Cleanup Deferred Mercury Attack - 2026-07-01

Mercury was unavailable during this cleanup because the bridge returned quota exhaustion earlier in the session. Run this before commit promotion if Mercury is back.

## Current Evidence

- Runtime callers no longer import or instantiate `core/MaxProfitManager.js`.
- Entry policy is built through `PolicyBuilder.buildForTrade` in `core/OrderExecutor.js`.
- Profit-side exit intent is emitted by `ProfitExitPlanner.plan` through `core/ExitContractManager.js`.
- State mutation remains fill-owned: `StateManager.reserveExitSlot` reserves intent, and `StateManager.applyFill` mutates active-trade quantity from confirmed fill facts.
- Focused proof run passed: `npx jest test/policy-builder.test.js test/profit-exit-planner.test.js test/exit-contract-manager-ownership.test.js test/order-executor-pause-gate.test.js test/session-router-runtime-scope.test.js test/eval-signal-path-proof.test.js test/order-executor-trai-learning-payload.test.js test/trading-loop-trace-spine.test.js test/mercury-index-scope.test.js --runInBand`.

## Prompt

Mercury, break my fix.

Attack the MaxProfitManager replacement cleanup only. Current intended architecture is:

- `PolicyBuilder.buildForTrade` freezes per-trade exit policy at entry.
- `ExitContractManager.checkExitConditions` is the exit coordinator.
- `ProfitExitPlanner.plan` emits profit exit intent only.
- `OrderExecutor` executes the intent.
- `StateManager.reserveExitSlot` reserves pending intent.
- `StateManager.applyFill` is the only path that mutates remaining quantity after confirmed fill facts.
- `core/MaxProfitManager.js` has been removed and must not remain reachable from active runtime, tests, or tooling.

Find any concrete current-code path where:

1. A legacy MaxProfitManager import, constructor, map, or fixture is still reachable outside historical docs.
2. ProfitExitPlanner mutates trade state instead of returning intent.
3. ExitContractManager bypasses the planner for profit-side BE/tier exits.
4. OrderExecutor or TradingLoop still expects old MPM fields like `exitSize`, `maxProfitManagers`, or pre-mutated tier state.
5. StateManager can apply partial-exit state without a reserved intent or confirmed fill.
6. The cleanup removed a live behavior that was not replaced by the frozen-policy/planner/fill path.

Use file:line evidence. Do not verify softly. State whether the cleanup closes the old MPM authority mechanism or only hides the symbol.
