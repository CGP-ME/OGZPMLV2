# Session 2026-05-21 - KILL 7 Structure-Aware Trailing

## Scope

Finished KILL 7 from `ogz-meta/specs/pre-eval-master-fix-plan-2026-05-20_1.md`: `TradingLoop` was passing `nearestStructure: null` into `MaxProfitManager`, leaving the trailing-stop structure logic blind.

## Files Changed

- `core/TradingLoop.js`
- `core/MaxProfitManager.js`
- `CHANGELOG.md`
- `ogz-meta/sessions/session-2026-05-21-kill7-structure-aware-trailing.md`

## Implementation

- `TradingLoop._gatherData()` now computes `nearestStructure` from the nearest Fibonacci level plus current support/resistance state from `IndicatorEngine.getRawState().sr`.
- `TradingLoop` passes that structure into `mpm.update(...)` instead of the hardcoded null.
- `MaxProfitManager.updateTrailingStop()` now reads the active `TradingConfig.exitLogic.trail` field names, including trend widen, structure tighten, profit ratchet, and trail min/max.
- Guardrails reject invalid current price, invalid profit, unexpected direction, missing/non-positive ATR or volatility fallback, invalid trail distance, and invalid new stop.
- `trailingActive` is set only after a valid stop improvement is written.
- If `nearestStructure.price` is available, structure distance is recomputed as percent from current price, so a bad caller-provided absolute `distance` cannot tighten the trail incorrectly.

## Verification

- `node --check core/MaxProfitManager.js` passed.
- `node --check core/TradingLoop.js` passed.
- `git diff --check -- core/MaxProfitManager.js core/TradingLoop.js` passed.
- Focused `MaxProfitManager` smoke passed:
  - missing ATR does not activate trailing;
  - first valid finite stop is accepted for long and short;
  - positive volatility fallback can stand in when ATR is absent;
  - invalid computed stop is rejected without setting `trailingActive`.
- Focused `TradingLoop._nearestStructure()` smoke passed with isolated backtest state.
- Mercury attack passed clean on the patched ranges:
  - invalid stop writes;
  - false `trailingActive`;
  - structure distance units;
  - ATR fallback behavior;
  - direction normalization;
  - KILL 7 architecture closure.

## P0 Evidence

Full P0 default adaptive behavior:

- Log: `ogz-meta/ledger/phase0-canonical-kill7-trailing-structure-2026-05-21.log`
- Report: `backtest-report-v14MERGED-1779401941095.json`
- Result: `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`

Full P0 with structure, trend widen, and ratchet modifiers disabled:

- Log: `ogz-meta/ledger/phase0-canonical-kill7-modifiers-off-2026-05-21.log`
- Report: `backtest-report-v14MERGED-1779402036596.json`
- Result: `$13213.042341608163 / 1384 trades / 60.0% WR / PF 1.72`

Full P0 with only trend widen and ratchet disabled, leaving structure tightening active:

- Log: `ogz-meta/ledger/phase0-canonical-kill7-structure-only-2026-05-21.log`
- Report: `backtest-report-v14MERGED-1779402110076.json`
- Result: `$13218.16539826962 / 1411 trades / 60.7% WR / PF 1.70`

Root cause of anchor movement: the guard/wiring itself is baseline-preserving when adaptive trail modifiers are disabled. Default behavior changes because the previously stale trail config fields now execute.

## Open Items

- Do not treat this as live-restart approval while the KILL 5 runbook blocker remains: the current live `data/state.json` active trade is legacy state without immutable scope fields.
- The unrelated dirty proof data and untracked ledger/spec intake were intentionally left unstaged.
