Mercury adversarial recheck: data-feed liveness pause recovery after local fixes.

Prior attack flagged:
- legacy unscoped liveness pause could be recovered too broadly,
- pause owner check and resume write were not atomic,
- stored pauseScope with null fields could match any recovery scope,
- manual pause with spoofed data_feed_liveness source might resume.

Recheck the current uncommitted diff. Attack it, do not confirm it.

Relevant file ranges:

- core/StateManager.js:289-349 refactors updateState through
  _applyStateUpdatesLocked().
- core/StateManager.js:950-1088 stores pause ownership and performs
  resumeTradingIfPausedBy() under the StateManager lock.
- run-empire-v2.js:2188-2210 passes allowLegacyUnscoped only from the
  active-timeframe freshness recovery path.
- core/CandleProcessor.js:86-105 uses resumeTradingIfPausedBy() without
  allowLegacyUnscoped.
- core/CandleProcessor.js:727-762 and 828-878 tag stale/gap pauses with
  data_feed_liveness scope and do not call resumeTrading() directly.
- foundation/ConfigLoader.js:127-142 and ecosystem.config.js:18-46 carry the
  runtime data-feed/watchdog values.

Attack questions:

1. Can any manual/operator/reconciler/session-router/global/symbol halt still be
   cleared by a fresh data-feed candle?
2. Can a recoverable data-feed pause with missing stored symbol/timeframe/broker
   fields now match an arbitrary recovery candle?
3. Can a legacy unscoped liveness pause still be recovered from CandleProcessor
   or any non-active-timeframe path, or is allowLegacyUnscoped limited to the
   active-timeframe watchdog recovery?
4. Can a pause/resume race still clear a newer manual pause after an older
   data-feed recovery check?
5. Did any liveness/backfill/stale/gap runtime value remain outside config?
6. Did the fix create a backtest/P0 behavior change?

Return BLOCKER findings only with file:line proof and a concrete reproduction.
If no blocker remains, list non-blocker residual risks and explicitly say whether
the root mechanism is now closed for this slice.
