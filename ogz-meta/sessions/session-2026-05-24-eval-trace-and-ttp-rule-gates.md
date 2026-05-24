# Session 2026-05-24 - Eval Trace And TTP Rule Gates

**Branch:** `codex/ttp-eval-gates`
**Repo:** `/opt/ogzprime/OGZPMLV2`
**Session status:** Trace ladder and four TTP rule gates are committed and pushed on the branch. Eval remains NO-GO until the remaining eval-specific proof items are closed and a live/open-market signal path is observed end to end.
**Latest code head recorded in this form:** `0817cc9` (`Added TTP consistency profit cap`)
**Recorded at:** `2026-05-24T00:55:05Z`

This form fills the gap after `ogz-meta/sessions/session-2026-05-23-dashboard-eval-gate-and-runtime-handoff.md`. It captures the eval-hardening commits made on `codex/ttp-eval-gates`.

## What Changed

### 1. Eval trace spine was added

**Commit:** `3612fe9` - `Added eval trace spine`

Added structured eval trace events so order-path decisions can be joined by `traceId` and `signalId` instead of inferred from disconnected logs.

### 2. Eval trace ladder checklist was added

**Commit:** `fa11d33` - `Updated eval trace ladder checklist`

Added the working checklist for signal-through-bot visibility. This checklist is the current operator-facing proof shape: show what entered, how it normalized, what state existed before, which gates ran, what broker/order intent happened, what state mutated, and where the trace proves each step.

### 3. TTP 15:50 cutoff enforcement was added

**Commit:** `67f0204` - `Added TTP 15:50 cutoff enforcement`

Added TTP market-time cutoff enforcement for stock day-trading accounts.

### 4. TTP account loss limit gate was added

**Commit:** `927c5d5` - `Added TTP account loss limit gate`

Added pre-order account-limit checks for daily loss pause and max-loss boundaries. Config is loaded through `foundation/ConfigLoader.js`; live unsafe/bypass combinations are rejected instead of silently allowed.

### 5. Ingress-to-order trace propagation was added

**Commit:** `976aa8b` - `Added ingress-to-order trace propagation`

**Root cause:** The bot had useful local logs, but the signal path could not be proven as one joined chain from candle ingress through order decision.

**Fix:** Propagated `traceId` from candle ingress through:

- `core/BacktestRunner.js`
- `core/CandleProcessor.js`
- `core/TradingLoop.js`
- `run-empire-v2.js`

**Trace proof:** `ogz-meta/cognition-history/pipeline-trace/trace-backtest-tsla-15m-750-final-2026-05-23.log`

Observed counts in the proof run:

- `CANDLE_INGRESS`: 750
- `CANDLE_PROCESSOR_RECEIVED`: 750
- `CANDLE_ACCEPTED`: 750
- `ANALYSIS_START`: 736
- `STRATEGY_DECISION`: 736
- `DECISION_SKIP`: 385
- `EXECUTE_HANDOFF`: 110
- `ORDER_EXECUTE_START`: 110
- `ORDER_PLAN`: 50
- `EVAL_RULE_CHECK`: 50
- `STATE_MUTATION`: 110
- `EXECUTE_RETURN`: 110

Same-trace BUY chain example from the proof: `candle_1779581016298_ywrpbp`.

**Mercury outcome:** Initial Mercury pass found gap-backfill lacked trace context. The gap was fixed and the recheck came back clean.

### 6. TTP cutoff dynamic stock scope was fixed

**Commit:** `51723f0` - `Fixed TTP cutoff dynamic stock scope`

**Root cause:** Cutoff liquidation needed to sweep the actual configured stock scope, not a static or stale symbol set.

**Fix:** TTP cutoff now uses dynamic stock scope and broker-scoped pending order cancellation. During the liquidation window it re-sweeps pending orders instead of assuming the first pass handled them.

**Files touched:**

- `core/OrderRouter.js`
- `core/TtpCutoffEnforcer.js`
- `run-empire-v2.js`
- `test/order-router-cancel.test.js`
- `test/ttp-cutoff-enforcer.test.js`

**Mercury outcome:** Mercury found broker-scope and completed-key hazards. Both were fixed before commit.

### 7. TTP earnings restriction gate was added

**Commit:** `8c4cb68` - `Added TTP earnings restriction gate`

**Root cause:** TTP earnings-night restrictions were not represented as a fail-closed pre-order gate.

**Fix:** Added `TTP_EARNINGS_RESTRICTION` to `core/EvalRuleEngine.js`. The gate blocks stock entries when earnings are scheduled tonight and fails closed when status is missing, unknown, malformed, or provider lookup fails.

**Config values:**

- `TTP_EARNINGS_RESTRICTION_ENABLED`
- `TTP_EARNINGS_BLOCK_ENTRIES`
- `TTP_EARNINGS_REQUIRE_KNOWN_STATUS`

**Proof:** `ogz-meta/cognition-history/pipeline-trace/ttp-earnings-block-trace-2026-05-24T00-28-38Z.log` shows `ORDER_PLAN` then `EVAL_RULE_CHECK allowed=false failedRules=["TTP_EARNINGS_RESTRICTION"]` then `ORDER_BLOCKED` on trace `probe_ttp_earnings_2026_05_24`.

**Verification:**

- `node --check core/EvalRuleEngine.js foundation/ConfigLoader.js`
- Focused Jest gate suite: 66 passed at the time of commit
- `npm run test:smoke`: 13 passed, 0 failed, known Bombardier cache warning
- Mercury re-attack clean after missing-block fail-closed fix
- Full P0: `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`

### 8. TTP consistency profit cap was added

**Commit:** `0817cc9` - `Added TTP consistency profit cap`

**Root cause:** TTP consistency/profit-concentration risk is not a pre-order-only problem. A position can become disqualifying while open, so the rule belongs in exit/profit management.

**Fix:** Added a TTP stock position profit-cap exit guard to `core/TradingLoop.js`.

Behavior:

- Runs only when eval rules and TTP rules are enabled.
- Applies to stock/equity/ETF runtimes.
- Leaves explicit non-stock runtimes outside this stock-only TTP rule.
- Forces full `SELL`/`COVER` when unrealized profit reaches `profitTargetDollars * maxPositionProfitRatio`.
- Runs in both `checkExitsOnly` and the normal candle-close exit path.
- Uses normalized close-side detection for long/short.
- Does not re-filter `StateManager.getTradesBySymbol(symbol)` results by action/direction, so malformed active trades cannot disappear before the cap check.
- Throws on missing runtime asset class, mismatched active-trade asset class, missing close side, invalid entry price, invalid size, invalid current price, or missing consistency config while TTP rules are enabled.

Config values:

- `TTP_CONSISTENCY_ENABLED`
- `TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO`
- `TTP_PROFIT_TARGET_DOLLARS`
- `TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO`

Config guardrails:

- Consistency cannot be disabled while TTP eval rules are enabled.
- Position profit ratio must be finite and in `(0, 1]`.
- Profit target must be explicit and positive.
- Profit target must be inside `INITIAL_BALANCE * TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO`.
- The max target ratio cannot loosen past `0.10`.

**Files touched:**

- `CHANGELOG.md`
- `core/TradingLoop.js`
- `foundation/ConfigLoader.js`
- `run-empire-v2.js`
- `test/config-loader-live-guard.test.js`
- `test/trading-loop-trace-spine.test.js`

**Mercury outcome:** Multiple adversarial passes were used. Mercury found and drove fixes for:

- case-sensitive short close detection
- missing runtime asset class silent skip
- cap not wired into the normal candle-close exit path
- extra action/direction filtering hiding malformed active trades
- absurd profit-target config disabling the cap

Final Mercury result found no practical bypass under stock runtime, validated config, and active trade returned by `StateManager.getTradesBySymbol(symbol)`. It flagged the remaining hard-error path for mismatched active-trade asset class; this is intentional fail-loud behavior for corrupted stock state, not a silent bypass.

**Verification:**

- `node --check core/TradingLoop.js foundation/ConfigLoader.js run-empire-v2.js`
- Focused Jest suite: 79 passed across eval gate, config guard, pause gate, cutoff, and trace-spine tests
- `npm run test:smoke`: 13 passed, 0 failed, known Bombardier cache warning
- Final Mercury re-attack clean on bypass conditions
- Full P0: `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`
- P0 log: `ogz-meta/ledger/phase0-canonical-ttp-consistency-profit-cap-final-2026-05-24.log`
- P0 report: `backtest-report-v14MERGED-1779584043196.json`

## Current Branch Head

```text
0817cc9 Added TTP consistency profit cap
8c4cb68 Added TTP earnings restriction gate
51723f0 Fixed TTP cutoff dynamic stock scope
976aa8b Added ingress-to-order trace propagation
927c5d5 Added TTP account loss limit gate
3612fe9 Added eval trace spine
fa11d33 Updated eval trace ladder checklist
67f0204 Added TTP 15:50 cutoff enforcement
```

## Current Eval Status

Still NO-GO for flipping eval.

What is now materially stronger:

- The trace spine can show a signal/candle moving through the core path instead of relying on disconnected logs.
- TTP volume, market-time cutoff, account loss limits, earnings restriction, and consistency profit cap have committed enforcement paths.
- Every trading-path commit in this batch had focused tests, Mercury attack, smoke, and full P0 preservation.

Remaining blockers to close next:

- Live/open-market signal path proof from ingress through broker response and state mutation or explicit skip.
- Valid-position/profit-validation rules if TTP requires duration/tick constraints for positions to count.
- Runtime env review before eval posture: `LIVE_TRADING`, `PAPER_TRADING`, `WEBHOOK_DRY_RUN`, drawdown bypass flags, TTP equity/target values, and broker destination.
- Broker truth reconciliation immediately before go: account, buying power, open orders, open positions, and symbol destination.
- Session router remains intentionally off until its stock/BTC persistence and broker boundaries are fully landed.

## Dirty Worktree Notes

At recording time, unrelated dirty/untracked files still exist from cowork/operator ledger/frontend work. The eval gate code commits did not stage those paths.

The Mercury prompt/response files for the TTP consistency pass remain under `ogz-meta/cognition-history/mercury/` as local evidence intake and were not bundled into the code commit.
