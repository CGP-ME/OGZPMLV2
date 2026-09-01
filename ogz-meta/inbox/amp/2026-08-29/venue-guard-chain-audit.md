# TTP Venue-Guard Chain Audit

Date: 2026-08-29
Executor: Amp on the trusted VPS runner
Authority: Trey ruling 3 — account-level loss protection is TTP venue guards only; the six dead env caps are deleted, not rebuilt.

## Scope and method

This is a read-only producer-to-consumer audit of every key under `launchProfiles.*.venueGuards.ttp` in `config/trading.config.json`. The seven launch profiles repeat the same key shape at lines 56-93, 185-222, 314-351, 443-480, 574-611, 705-742, and 834-871. Values can differ by profile; the runtime mapping is common.

No runtime reader exists for `RISK_MANAGER_BYPASS`, `ACCOUNT_DRAWDOWN_BYPASS`, `MAX_DRAWDOWN`, `MAX_DAILY_LOSS`, `MAX_WEEKLY_LOSS`, or `MAX_MONTHLY_LOSS` in `core/`, `foundation/`, `brokers/`, `modules/`, `src/`, `server/`, or `run-empire-v2.js`. `scripts/generate-live-proof.js` was the only executable reader found (`MAX_DRAWDOWN`); it is a public-proof generator, not trading runtime, and Part C removes that false proof surface.

## Common translation and startup validation

- `foundation/ConfigLoader.js:913-950` maps every launch-profile TTP key into `config.evalRules.ttp` and records its source.
- `foundation/ConfigLoader.js:1250-1254` rejects live startup if the overall TTP engine is disabled.
- `foundation/ConfigLoader.js:1310-1417` validates each enabled guard's required shape and bounds.
- `run-empire-v2.js:1293-1296` constructs `EvalRuleEngine` from the resolved config; `run-empire-v2.js:1331` injects it into `OrderExecutor`; `run-empire-v2.js:1356-1372` constructs the cutoff enforcer with StateManager and the existing execution/flatten route.
- `core/OrderExecutor.js:3245-3278` runs the pre-order guard before broker, webhook, or StateManager entry side effects; it emits `EVAL_RULE_CHECK`, then `ORDER_BLOCKED` and returns `eval_rule_gate` on refusal.

## Key-by-key chain

### `ttp.enabled`

- Reader: `foundation/ConfigLoader.js:913-915`; startup validation at `foundation/ConfigLoader.js:1250-1254`.
- Breach/action: disabled live posture is a startup validation error. If disabled outside that posture, `core/EvalRuleEngine.js:22-28` allows entries (`eval_rules_disabled` / `ttp_rules_disabled`).
- Entry blocking: only guaranteed by live startup validation; the engine itself fails open when disabled.
- Flatten: none from this key.
- StateManager accounting: none.
- Trace: no per-order failure trace when disabled because the engine returns allowed; startup validation reports the error.
- Gap: non-live/paper/backtest profiles can disable the engine and fail open by design.

### `volumeCap.enabled`, `percent`, `timeframe`, `fallbackToMostRecentVolume`, `maxReferenceAgeMs`

- Readers: `foundation/ConfigLoader.js:916-923`; runtime `core/EvalRuleEngine.js:491-574`.
- Breach/action: malformed config or missing/stale one-minute volume, non-share quantity, invalid quantity, or projected reserved shares above the percentage cap returns `action: BLOCK_ORDER` through `core/EvalRuleEngine.js:501-568,731-744`.
- Entry blocking: `core/OrderExecutor.js:3245-3278` blocks before external order or state mutation.
- Flatten: none; this is an opening-volume rule.
- StateManager accounting: none. Opening-volume reservations are process-memory state in `EvalRuleEngine.openingVolumeReservations` (`core/EvalRuleEngine.js:12,551-574`), not StateManager state.
- Trace: `EVAL_RULE_CHECK` records inputs/passed/failed rules and `ORDER_BLOCKED` records the refusal (`core/OrderExecutor.js:3260-3278`).
- Gap: reservation state does not survive restart. This audit did not prove broker-side aggregate fills are reconciled back into the in-memory reservation map.

### `marketTime.enabled`, `blockEntriesAfterCutoff`, `liquidationEnabled`, `cutoffMinutesBeforeClose`, `entryBufferMinutesBeforeCutoff`

- Readers: `foundation/ConfigLoader.js:924-930`; entry state and refusal in `core/EvalRuleEngine.js:109-213`; flatten state in `core/TtpCutoffEnforcer.js:41-135`.
- Entry breach/action: entry-buffer, liquidation-window, after-cutoff, and outside-session states return `BLOCK_ORDER` (`core/EvalRuleEngine.js:179-210`).
- Entry blocking: pre-order path at `core/OrderExecutor.js:3245-3278`.
- Flatten: `run-empire-v2.js:2435-2443` invokes `TtpCutoffEnforcer.enforce()` on the exit-monitor interval. Tracked positions use the existing `executeTrade` exit path (`core/TtpCutoffEnforcer.js:208-236`); broker orphans use the existing `OrderRouter.sendOrder` market-exit path (`core/TtpCutoffEnforcer.js:250-260,681-712`). The enforcer then re-reads broker positions and requires verified flatness (`core/TtpCutoffEnforcer.js:264-342`).
- StateManager accounting: tracked exits pass through normal `executeTrade`, which owns trade accounting. Failed/unverified flatness persists `ttpCutoffQuarantine`, and affected symbols are halted for entry (`core/TtpCutoffEnforcer.js:741-837`). StateManager persists/exposes the quarantine (`core/StateManager.js:527,632,2700-2701,4969-4997`).
- Trace: entry refusal emits `EVAL_RULE_CHECK` and `ORDER_BLOCKED`. Consistent cutoff completion and quarantine emit named logs (`core/TtpCutoffEnforcer.js:341,835-837`); escaped interval failure emits `TTP_CUTOFF_ENFORCEMENT_HALT` (`run-empire-v2.js:2585-2665`). Normal successful cutoff completion has no dedicated structured trace event in `TtpCutoffEnforcer`; individual existing execution traces are the structured evidence for tracked exits.
- Gap: successful cutoff reconciliation has a named log but no single structured completion trace. Webhook execution disables broker order management (`run-empire-v2.js:1351-1371`), so broker-orphan closure cannot be performed by the enforcer on that route; failures quarantine rather than infer flatness.

### `accountLimits.enabled`, `enforceDailyLossPause`, `enforceMaxLoss`, `accountStartOfDayDate`, `accountStartOfDayEquity`, `dailyLossDollars`, `maxLossThresholdEquity`

- Readers: `foundation/ConfigLoader.js:931-939`; runtime `core/EvalRuleEngine.js:384-488`.
- State source: `core/OrderExecutor.js:3050` obtains current equity from `StateManager.getEquity(price)` and carries it into the entry plan at `core/OrderExecutor.js:2374-2435`.
- Breach/action: missing/invalid current equity, configured max-loss threshold reached, invalid daily-loss configuration, or daily pause threshold reached returns `BLOCK_ORDER` (`core/EvalRuleEngine.js:413-425,479-484`).
- Entry blocking: pre-order path at `core/OrderExecutor.js:3245-3278`.
- Flatten: none. The account-limit guard blocks new openings but does not flatten positions.
- StateManager accounting: StateManager supplies current equity; the guard writes no breach state or daily-loss latch back to StateManager. A stale start-of-day date is quarantined and explicitly allows trading (`core/EvalRuleEngine.js:428-478`).
- Trace: `EVAL_RULE_CHECK` and `ORDER_BLOCKED`; stale operational inputs also become `TTP_STALE_DATA_QUARANTINE` where stale fields are surfaced (`core/OrderExecutor.js:481-579,3247-3270`).
- Gap: ruling 3 calls venue guards the sole account-level loss protection, but account-limit breach does not flatten. Stale start-of-day data disables daily-loss contribution while trading continues. These are findings only; Part C makes no runtime fix.

### `earningsRestriction.enabled`, `blockEntries`, `manualStatus`

- Readers: `foundation/ConfigLoader.js:940-944`; runtime `core/EvalRuleEngine.js:243-347,577-659`.
- Breach/action: a trusted `hasEarningsTonight=true` returns `BLOCK_ORDER` (`core/EvalRuleEngine.js:313-315`). Disabled, unknown, errored, or stale calendar data is quarantined and does not block the bot (`core/EvalRuleEngine.js:254-310,320-331`).
- Entry blocking: pre-order path at `core/OrderExecutor.js:3245-3278` only when status is known and positive.
- Flatten: none.
- StateManager accounting: none; no calendar result is written to StateManager.
- Trace: every check reaches `EVAL_RULE_CHECK`; stale-field quarantine can emit `TTP_STALE_DATA_QUARANTINE`. Unknown calendar status has no stale-field risk gate and therefore only the general eval trace.
- Gap: `run-empire-v2.js:1293-1296` does not inject `getEarningsStatus`; runtime proof therefore depends on manual status or fields already present on the entry plan. Unknown status allows trading with the calendar lane quarantined.

### `consistency.enabled`, `maxPositionProfitRatio`, `profitTargetDollars`, `maxProfitTargetInitialBalanceRatio`

- Readers/validation: `foundation/ConfigLoader.js:945-950,1405-1417`.
- Entry influence: `core/OrderExecutor.js:2278-2302` uses the ratio and profit target to cap share quantity; the daily-loss guard also caps risk-sized shares. An impossible share range blocks the entry before the eval rule call (`core/OrderExecutor.js:2305-2313,3200-3213`).
- Exit action: `core/TradingLoop.js:858-956` computes per-position profit and creates a normal `SELL`/`COVER` exit decision at the consistency cap.
- Entry blocking: quantity zero/impossible range is refused in OrderExecutor; otherwise the bounded quantity continues.
- Flatten: not an account flatten. It closes an individual profitable position through the normal execution path when its consistency cap is reached.
- StateManager accounting: normal entry/exit execution owns StateManager trade accounting; this rule writes no separate consistency ledger state.
- Trace: `TTP_CONSISTENCY_CHECK` records inputs and exit decision (`core/TradingLoop.js:928-942`); normal order traces record execution.
- Gap: `maxProfitTargetInitialBalanceRatio` is startup validation only; no direct runtime consumer was found beyond bounding `profitTargetDollars` at configuration validation.

## Final conclusion

Translation from launch profile to runtime is proven for every key. Entry refusal is proven through the single pre-order gate, and market-time flatten is wired through existing exit/order routes with broker-flatness verification and persistent quarantine on failure. The venue-guard chain is not equivalent to a universal account-level flatten guard: account-limit breaches block new entries but do not flatten, stale daily anchors continue trading without that guard's contribution, and successful cutoff completion lacks one dedicated structured completion trace. These gaps are reported to Trey and are not repaired in Part C.

## Named absences

- No broker call, order, PM2 action, paper/live activation, or runtime mutation was performed.
- No live venue-guard breach was induced.
- No proof that account-limit breach flattens exists; live code shows it does not.
- No proof that stale account/calendar operational data blocks trading exists; live code shows quarantine-and-continue.
- No proof of a dedicated structured successful-cutoff completion event exists.
