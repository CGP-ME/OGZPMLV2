# Codex-1 Summary: Lane 5 Exit-Family Contracts

Date: 2026-07-18
Lane: Phase C Lane 5 — exit-family contracts
Status: DIFF READY FOR TREY REVIEW; code not committed

## Prior Art

Existing exit ownership before this lane:
- `core/ExitContractManager.js` already owned stop/max-hold/invalidation/profit-planner ordering.
- `core/PolicyBuilder.js` already normalized frozen exit policies at trade birth.
- `core/ProfitExitPlanner.js` already owned stateless partial/tier/profit intent planning.

Lane 5 extends that ownership shape instead of adding a parallel exit path.

## Scope

Tracked runtime/test diff:
- `config/trading.config.json`
- `foundation/ConfigLoader.js`
- `modules/DonchianBreakout.js`
- `modules/TimeSeriesMomentum.js`
- `core/ExitContractManager.js`
- `core/PolicyBuilder.js`
- `core/ProfitExitPlanner.js`
- `core/StrategyOrchestrator.js`
- `core/exit/StopLossChecker.js`
- `core/exit/TakeProfitChecker.js`
- `core/exit/MaxHoldChecker.js`
- `test/donchian-breakout.test.js`
- `test/time-series-momentum.test.js`
- `test/exit-contract-manager-ownership.test.js`
- `test/strategy-orchestrator-orb-exit-hint.test.js`

Oscillator family contracts were not retuned in this lane. Existing percent/minutes behavior was preserved with explicit schema fields.

## Implemented Shape

Donchian:
- `stopType: structural`
- `trailType: channel`
- `tpMode: off`
- `maxHoldMode: off`
- `trailChannelBars: 10`
- structural invalidation: `donchian_channel_reentry`

TSM:
- `stopType: atr`
- `trailType: atr`
- `tpMode: off`
- `maxHoldMode: off`
- invalidation: `tsm_return_flip`

All configured exit contracts now explicitly carry:
- `stopType`
- `trailType`
- `tpMode`
- `maxHoldMode`
- `partialExit`

## Code Evidence

- Runtime contract overrides now normalize through `PolicyBuilder.normalizeContract`, then enforce Donchian/TSM family shape before becoming defaults or trade-birth contracts: `core/ExitContractManager.js:165`.
- Donchian channel trail is an ECM-owned exit check and only applies to `trailType: channel`: `core/ExitContractManager.js:524`.
- Legacy ATR trailing now treats `trailAtrMult: null` as no contract override, not zero: `core/ExitContractManager.js:678`.
- Signal-level exit hints validate stop/trail/TP/max-hold enums and family shape before candidate output: `core/StrategyOrchestrator.js:603`, `core/StrategyOrchestrator.js:611`, `core/StrategyOrchestrator.js:656`.
- Exit hints are normalized before winner output becomes trade-birth signal overrides: `core/StrategyOrchestrator.js:2673`.
- `tpMode: off` suppresses the legacy take-profit checker: `core/exit/TakeProfitChecker.js:21`.
- `stopType: structural` suppresses the percent stop checker so structural/channel logic owns Donchian exits: `core/exit/StopLossChecker.js:67`.
- `maxHoldMode: off` suppresses max-hold exits: `core/exit/MaxHoldChecker.js`.
- Contract `partialExit` is planned through the existing BE scaleout lifecycle machinery, not a new execution path: `core/ProfitExitPlanner.js:152`.

## Red Proof

The new behavior tests failed before implementation:
- Donchian structural stop test returned `stop_loss` instead of invalidation.
- TSM max-hold-off test returned a max-hold exit.
- Contract partial-exit test returned no exit instead of `partial_exit_1r`.

Those failures were the expected parent behavior and are now green.

## Mercury

First Mercury attack found real issues:
- runtime exit-contract overrides were not normalized through the same schema;
- `tpMode: off` could be contradicted by a stale `takeProfitPercent`;
- malformed strategy exit hints could pass numeric-only normalization.

Fixes added:
- runtime contract normalization + family enforcement in `ExitContractManager`;
- TP checker mode ownership;
- enum/family/partial validation in `StrategyOrchestrator.normalizeExitContractHint`.

Final Mercury recheck:
- run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-18.jsonl:4`
- verdict: prior malformed-hint mechanism closed
- caveat: one malformed tool-call parse occurred, but relevant files were opened and cited; evidence classified as usable with telemetry caveat.

## Tests

Green:
- `npx jest test/exit-contract-manager-ownership.test.js test/donchian-breakout.test.js test/time-series-momentum.test.js test/policy-builder.test.js test/profit-exit-planner.test.js test/strategy-orchestrator-symbol-state.test.js test/strategy-orchestrator-contract-confidence.test.js test/strategy-orchestrator-orb-exit-hint.test.js test/matrix-sweep-surface.test.js --runInBand --silent`
- Result: 9 suites passed, 126 tests passed.
- `git diff --check`
- `node --check core/ExitContractManager.js`
- `node --check core/StrategyOrchestrator.js`
- `node --check core/PolicyBuilder.js`
- `node --check core/exit/TakeProfitChecker.js`
- `node --check foundation/ConfigLoader.js`
- `config/trading.config.json` parses as JSON.

## P0

First P0 failed:
- actual: `8422.111921155372`
- expected: `8338.146639366509`
- root cause: `contract.trailAtrMult === null` was passed through `finiteOrNull`, and `Number(null) === 0`; that disabled legacy ATR trailing for EMASMA and removed all `trailing_stop` exits.

Root fix:
- `core/ExitContractManager.js:678` now treats `null`/`undefined` as no contract override and falls back to the global trail config.
- Added regression: `uses global ATR trail multiplier when contract trailAtrMult is explicitly null`.

Final P0:
- status: PASS
- final balance: `8338.146639366509`
- trades: `1551`
- win rate: `52.2`
- profit factor: `0.64`
- report: `/opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1784341767013-33405-phase0-canonical-multi-runtime-gate-2026-07-18T02-27-37-784Z-0cd218c8-6cc5-48de-9c9e-81cd9d984f6c-phase0-canonical-multi-runtime-gate-2026-07-18T02-27-37-784Z-TSLA.json`

## Review Status

The report is ready for Fable/Trey. The code diff is intentionally held uncommitted pending review/approval.
