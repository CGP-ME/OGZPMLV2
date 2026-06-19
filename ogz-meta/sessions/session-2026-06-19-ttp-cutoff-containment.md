# Session 2026-06-19 - TTP Cutoff Containment

## Scope

Live eval cutoff safety failure: the bot did not reliably force-close, stop new entries, and preserve reconciliation state after the TTP cutoff path failed.

## Runtime Containment

- Stopped `ogz-prime-v2` with PM2 after confirming the trading engine was still online.
- Persisted `data/state.json` entry pause:
  - `isTrading=false`
  - `pauseSource=operator_ttp_cutoff_containment`
  - `pauseRecoverable=false`
  - active TSLA trade record preserved for reconciliation.
- Did not delete or flatten the active trade record, because clearing local state while the TTP dashboard showed an open position would hide real exposure.

## Root Cause

`core/TtpCutoffEnforcer.js` only ran liquidation when `EvalRuleEngine.getTtpMarketTimeState().inLiquidationWindow === true`. If the bot missed the 15:50-16:00 ET window, restarted after close, or entered a closed/holiday phase, the enforcer returned without running the close/reconciliation path.

In webhook-routed mode, broker reconciliation is disabled, so broker flatness cannot be proven from the bot. That path must not be labeled broker-verified complete.

## Code Change

- `core/TtpCutoffEnforcer.js`
  - Runs cutoff enforcement after missed windows when tracked TTP stock trades or broker positions exist.
  - Runs a one-pass closed/after-cutoff recovery when the cutoff key has not been handled.
  - Keeps broker-verified cutoff completions in `completedKeys`.
  - Keeps broker-unverified webhook completions in `unverifiedKeys`.
  - Pauses entries with `pauseSource=ttp_cutoff_unverified_broker_flatness` when broker flatness cannot be verified.
  - Fails loud if broker flatness is unverified and `StateManager.pauseTrading` is unavailable.

- `test/ttp-cutoff-enforcer.test.js`
  - Added missed-window tracked-state close coverage.
  - Added broker-orphan close coverage after the window is missed.
  - Added late broker exposure coverage after an already completed key.
  - Added webhook/no-broker-read manual reconciliation coverage.
  - Added repeated unverified-key coverage so pending manual reconciliation is not relabeled complete.

## Verification

- `npx jest test/ttp-cutoff-enforcer.test.js --runInBand`
  - PASS, 21 tests.
- `npx jest test/eval-rule-engine.test.js test/order-executor-pause-gate.test.js --runInBand`
  - PASS, 82 tests.
- `npx jest test/ttp-cutoff-enforcer.test.js test/eval-rule-engine.test.js test/order-executor-pause-gate.test.js --runInBand`
  - PASS, 103 tests.
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
  - PASS.
  - Anchor: final balance `10710.667785934895`, `1692` trades, `62.8%` win rate, PF `1.15`.
  - Report: `ogz-meta/gates/runs/multi-runtime-latest.json`.

## Mercury

Prompt frame used: `Mercury, break my fix.`

- First valid Mercury pass found a real webhook/no-broker-read issue: broker-unverified cutoffs were being treated as complete.
- Fix added `unverifiedKeys` and manual-reconciliation pause behavior.
- Final Mercury pass repeated a stale false-positive claim that broker-unverified paths still add `completedKeys`; current code returns from the `!brokerFlatVerified` branch before `completedKeys.add(key)`, and focused tests assert `completedKeys.size === 0` for webhook/no-broker-read paths.

## Current Live State

- `ogz-prime-v2` remains stopped.
- `ogz-websocket` remains online.
- `ogz-stripe` remains online.
- Do not restart the trading engine until the TTP dashboard/broker account is manually reconciled against the preserved TSLA active trade and the paused state is intentionally cleared.
