Mercury adversarial recheck - data-feed liveness pause recovery final diff.

Attack the current uncommitted patch. Do not confirm it. Try to break it.

Scope:
- foundation/ConfigLoader.js:127-143
- core/CandleProcessor.js:56-85, 720-766, 790-835
- core/StateManager.js pause/resume helpers and symbol normalization
- run-empire-v2.js:2147-2385
- ecosystem.config.js:33-47

Questions:
1. Can any liveness/backfill/stale/gap runtime threshold or limit still bypass ConfigLoader dataFeed config and live as a hardcoded value in hot code?
2. Can a fresh candle from the wrong symbol, timeframe, brokerId, accountId, assetClass, or executionMode clear a persisted data-feed liveness pause?
3. Can a legacy unscoped liveness pause be cleared from a passive CandleProcessor stale/gap recovery path instead of the active-timeframe watchdog freshness path?
4. Can a manual/operator/session-router/reconciler/global halt be cleared by the data-feed recovery path?
5. Can an async race clear a newer pause after the recovery path observed an older pause?
6. Did the latest config-only cleanup introduce a new failure mode, especially missing dataFeed config, bad env values, or P0 drift?

Return blockers only. For each blocker cite exact file:line evidence and the concrete failure sequence. Also state whether this patch closes the root mechanism or only patches the visible symptom.
