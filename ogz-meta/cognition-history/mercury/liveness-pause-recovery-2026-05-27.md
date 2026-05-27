Mercury adversarial attack request: data-feed liveness pause recovery.

Attack the uncommitted diff only. Do not confirm it. Find a concrete state where
this patch resumes trading when it should stay paused, fails to resume a real
recovered data-feed pause, lets config fall back to an inline runtime value, or
creates a new liveness/watchdog failure mode.

Relevant current file ranges:

- foundation/ConfigLoader.js:127-142 adds dataFeed config values.
- foundation/ConfigLoader.js:396-400 validates dataFeed values.
- core/StateManager.js:950-1079 adds pauseSource/pauseRecoverable/pauseScope
  and resumeTradingIfPausedBy().
- core/CandleProcessor.js:56-105 resolves dataFeed config and routes stale/gap
  resume through data-feed pause ownership.
- core/CandleProcessor.js:727-762 handles stale-data pause/recovery.
- core/CandleProcessor.js:828-878 handles gap-recovery pause/recovery.
- run-empire-v2.js:1114-1128 threads dataFeed into runtime config.
- run-empire-v2.js:1478-1488 uses config for REST hydration limit.
- run-empire-v2.js:2162-2215 handles active-timeframe freshness and liveness
  pause recovery.
- run-empire-v2.js:2239-2378 uses config for liveness backfill, silence
  thresholds, and tagged data-feed pauses.
- ecosystem.config.js:18-46 pins crypto paper runtime env and data-feed values.

Specific attacks:

1. Manual/safety pause bypass:
   Construct a sequence where StateManager is paused for a manual operator halt,
   ExchangeReconciler halt, SessionRouter failed-safe pause, global halt, symbol
   halt, or malformed persisted isTrading state. Can a fresh Kraken candle or
   liveness backfill call resumeTradingIfPausedBy() and clear that pause anyway?
   Cite exact lines.

2. Scope mismatch:
   Construct a sequence where TSLA/stocks/alpaca or another timeframe paused the
   bot, then BTC-USD/crypto/kraken 1m data arrives. Can scope comparison return
   true when it should be false? Include legacy unscoped pauses versus new scoped
   pauses separately.

3. Legacy recovery:
   Current live data/state.json has legacy pauseReason
   "Liveness watchdog: brokerSilent=true activeTimeframeSilent=false, backfill failed"
   with no pauseSource or pauseScope. Does this patch recover that exact legacy
   liveness pause only after fresh active-timeframe data? Or can it recover too
   early, without fresh data, or fail to recover because metadata is absent?

4. Config-only values:
   Did any liveness/backfill/stale/gap timing value remain in run-empire-v2.js
   or CandleProcessor.js as a runtime constant or fallback instead of going
   through ConfigLoader/PM2 env? Treat protocol constants and string reason
   prefixes separately from runtime tuning values.

5. Async/race:
   pauseTrading() and resumeTradingIfPausedBy() are async. Several call sites do
   not await pauseTrading(). Can an entry slip through between liveness detecting
   stale data and StateManager persisting isTrading=false? Can a resume race clear
   a newer manual pause after an older data-feed recovery promise resolves?

6. P0/backtest:
   Does the patch affect backtest path behavior or P0 anchor unexpectedly? Look
   for ConfigLoader defaults, CandleProcessor constructor changes, and
   StateManager pause field defaults.

Return:
- BLOCKER findings with file:line proof and reproduction sequence.
- NON-BLOCKER residual risks.
- False positives only if you can prove the code prevents the failure.
- Explicit answer: does this close the root mechanism or only patch the symptom?
