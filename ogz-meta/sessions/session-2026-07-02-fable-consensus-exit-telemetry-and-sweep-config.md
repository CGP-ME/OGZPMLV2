# Session 2026-07-02 - Fable Consensus, Exit Telemetry, And Sweep Config

## What Changed

- Added default-on Fable consensus for Mercury agentic reviews through local Claude Code (`consensus.provider=claude-code`, model `claude-fable-5`).
- Added provider preflight support so Mercury and Fable can be checked before a full agentic run.
- Hardened Claude Code result parsing for JSON frames, concatenated JSON values, assistant fallback text, and trailing malformed JSON-like output.
- Made consensus failure commit-blocking in the Mercury run ledger.
- Added strategy-owned `parallel-backtest --exit-geometry` sweep configs for Donchian, TimeSeriesMomentum, RSI2MeanReversion, PropSafeEMAPullback, and EMATrendRetest.
- Removed parent-shell fee/direction inheritance from backtest worker env construction and made fee posture reporting profile-owned.
- Canonicalized profit-tier exit intent reasons in `ProfitExitPlanner` and split `BacktestRecorder.exitType` so tier exits harvest as `profit_tier`, not `take_profit`.

## Verification

- `node trai_brain/mercury-bridge/ask.js --check-providers`
  - Mercury ok: provider `mercury`, model `mercury-2`.
  - Fable consensus ok: provider `claude-code`, model `claude-fable-5`.
- `npx jest test/mercury-llm-config-contract.test.js test/mercury-provider-preflight.test.js test/mercury-consensus.test.js test/mercury-run-ledger.test.js --runInBand`
  - 4 suites, 31 tests passed.
- `npx jest test/backtest-worker-env.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js test/trading-config-profile.test.js test/profit-exit-planner.test.js test/backtest-recorder-scope.test.js --runInBand`
  - 6 suites, 134 tests passed.
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
  - PASS.
  - Final balance `10687.113526633222`.
  - Trades `1598`.
  - Win rate `70.2%`.
  - Profit factor `1.16`.

## Mercury / Fable Disposition

- Fable consensus caught two Mercury false positives during recorder/planner review:
  - synthetic `profit_tier_one` is test-only, not a runtime producer.
  - `TierA` falls through to `profit_tier_1`, not `profit_tier_A`.
- Final Mercury/Fable pass agreed no concrete current producer can deliver a non-numeric profit-tier reason to `BacktestRecorder`.
- Local producer enumeration confirmed `core/ProfitExitPlanner.js` is the only runtime profit-tier reason producer, and all branches emit numeric `profit_tier_<index>` strings.

## Notes For Next Session

- The two 2026-07-01 ledger docs are intake leads, not canonical truth. Their P0 failure claim was stale against the current executable gate.
- The exit-geometry sweep surface is infrastructure only. The first full TTP exit-geometry run produced no live-promotable config; best run was still negative.
- `BacktestRecorder.exitType` is telemetry; execution semantics remain owned by `ProfitExitPlanner` / `ExitContractManager`.
