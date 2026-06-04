# Mercury Attack Prompt - P0 Tiered Exit Accounting Gate - 2026-06-04

Break this fix. Do not confirm it. Find a concrete state, report shape, or execution sequence where the new P0 gate passes while tiered partial exits are still over-credited, or where the rebaseline hides a real remaining accounting bug.

Scope:

- `ogz-meta/gates/multi-runtime-gate-runner.js:12-24`
- `ogz-meta/gates/multi-runtime-gate-runner.js:231-295`
- `core/OrderExecutor.js:472-577`
- `core/OrderExecutor.js:1665-1708`
- `core/MaxProfitManager.js:684-815`
- `core/BacktestRecorder.js:91-188`
- `core/StateManager.js:850-930`

Facts to attack:

- The old P0 anchor was `13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`.
- The corrected P0 anchor is `10000.26792578263 / 1410 trades / 60.6% WR / PF 1.00`.
- The old report has 350 tier-fraction violations. Example: `profit_tier_1` recorded `541.3438261781461` closed size in a group whose total closed size was `1245.090800209736`, so tier1 was `43.478260869565216%` of the group while the configured tier1 cap is `30%`.
- The current report has zero violations under the same grouping/cap check.
- `MaxProfitManager` defines tier exits as fractions of original position size: tier1 `0.30`, tier2 `0.30`, tier3 `0.20`, final tier4 `0.20`.
- `OrderExecutor` now records `executedExitPlan.sizeUsd` into `BacktestRecorder` for long exits.

Attack questions:

1. Can `assertP0TieredExitAccounting()` be bypassed by a realistic report produced by this code while over-crediting partial exits?
2. Does grouping by `entryTime|entryPrice|strategyName|direction|symbol|brokerId|accountId|assetClass|executionMode|timeframe` merge or split trades incorrectly enough to hide over-crediting?
3. Are there partial-exit reasons outside `profit_tier_1..4` that can still over-credit cost basis and pass the gate?
4. Does the live/backtest exit path still have any branch where `BacktestRecorder.recordTrade()` receives remaining/full position size instead of closed cost basis?
5. Does rebaselining to PF `1.00` hide a separate real bug that should be fixed instead?

Return only actionable findings with file:line evidence and a minimal failing scenario. If no blocker exists, say what you tried to break and why the invariant holds.
