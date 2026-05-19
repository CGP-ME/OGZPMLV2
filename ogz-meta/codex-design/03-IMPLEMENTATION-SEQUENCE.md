# 03 - Implementation Sequence

Scope: backend trading bot only. This sequence is ordered to protect the live P0 anchor `$13,213.042341608163` while moving toward the requested architecture.

## Re-verification Commands

Run before starting any implementation phase:

```bash
git status --short
git diff --stat
rg -n "priceHistory|SymbolTradingContext|CandleStore|SessionRouter|StateManager|getInstance|analyzeAndTrade|run15mTradingCycle" run-empire-v2.js core
rg -n "PatternMemoryBank|UnifiedPatternMemory|TRAIPatternIntegration|pattern-pack|PROMOTED|QUARANTINED" core
rg -n "maxPositions|getTradesBySymbol|activeTrades|entryTimeframe|timeframe|tradeId" core/TradingLoop.js core/OrderExecutor.js core/StateManager.js
```

## Phase 0 - Freeze Baseline And Guard Rails

Goal: make implementation reviewable without moving the benchmark.

Work:

- Record the current dirty tree and identify unrelated user/CC changes.
- Preserve the P0 anchor in implementation notes and test output comparisons.
- Add no source changes until the open Fix 37a / fix-queue work is dispositioned or explicitly allowed.
- Define test fixtures for one stock session, one crypto session, and one mixed fanout replay.

Verification:

- `git diff --stat` captured before edits.
- Existing backtest command still reproduces the current known baseline before architecture changes.
- No source edits happen in this design-only step.

Bot capability after phase:

- No new runtime capability. The value is a clean review boundary.

Operator dependency:

- None for engineering mechanics. Operator may still veto implementation timing.

## Phase 1 - Fort-Knox Storage In Shadow Mode

Goal: build the new pattern substrate without affecting trades.

Work:

- Add `FortKnoxPatternService`.
- Add event schema, manifest schema, signature verification, and derived snapshot builder.
- Add bank layout under `data/pattern-banks/v1`.
- Add read-only adapter that mirrors current PatternMemoryBank/UnifiedPatternMemory writes into append-only Fort-Knox events.
- Add import verifier for starter/premium packs but keep imports disabled by default.
- Add watchdog in observe-only mode.

Verification:

- Unit tests rebuild a snapshot from events byte-for-byte deterministically.
- Corrupt event line produces a watchdog alert and does not enter hot-path trading.
- Unsigned pack import is rejected.
- Existing PatternMemoryBank/UnifiedPatternMemory behavior remains unchanged.

Bot capability after phase:

- Bot still trades exactly as before.
- Fort-Knox produces audit-grade shadow records beside existing pattern memory.

Rollback:

- Disable Fort-Knox mirror env flag. Existing pattern memory remains source of truth.

Operator dependency:

- None.

## Phase 2 - Session State Partition Foundation

Goal: make independent crypto/stocks account state possible before enabling SessionRouter.

Work:

- Refactor `StateManager` from singleton-only to a factory-backed partition:
  - `StateManager.forSession(sessionId, { stateFile })`
  - Keep `getInstance()` as compatibility alias for legacy single-session code.
- Create `SessionAccountContext`.
- Partition RiskManager, DrawdownTracker, PnLTracker, pending TRAI decisions, and MPM maps by session.
- Add session-scoped state files:
  - `data/state.stocks_rth.json`
  - `data/state.crypto_overnight.json`
- Add migration guard: if legacy state has open trades, refuse automatic split and require explicit flat state.

Verification:

- Two StateManager partitions can open/close trades without shared balance, PnL, activeTrades, or daily counts.
- Legacy `getInstance()` tests still pass.
- Session partition refuses symbol-less or session-less open trades.

Bot capability after phase:

- Runtime can represent independent stock and crypto accounts safely, but SessionRouter remains disabled.

Rollback:

- Keep legacy singleton alias and route config back to original state file.

Operator dependency:

- None.

## Phase 3 - SessionTransitionCoordinator

Goal: complete SessionRouter safely before fanout complexity.

Work:

- Implement durable transition journal.
- Add transition gate to block entries but allow required exits.
- Implement full transition state machine:
  - `ACTIVE`
  - `BLOCK_NEW_ENTRIES`
  - `FORCE_FLAT`
  - `SNAPSHOT_SOURCE`
  - `UNLOAD_SOURCE`
  - `LOAD_TARGET`
  - `BACKFILL_TARGET`
  - `WARM_TARGET`
  - `ACTIVE_TARGET`
  - `FAILED`
- Implement symmetric force-flat:
  - stock positions before crypto activation.
  - crypto positions before stock activation.
- Add session-close timing:
  - block new entries 30 minutes before transition.
  - force-flat 5 minutes before transition.
- Add 250-candle backfill and 200-candle no-entry warmup gate per `(session,symbol,timeframe)`.
- Add volume quality normalization.

Verification:

- Paper-mode transition from crypto to stocks leaves zero crypto active trades.
- Paper-mode transition from stocks to crypto leaves zero stock active trades.
- Crash/restart during transition resumes or fails closed from transition journal.
- Target session cannot enter trades until warmup passes.

Bot capability after phase:

- Sequential autonomous crypto/stocks switching is safe in paper mode with independent state.

Rollback:

- Set `SESSION_ROUTER_ENABLED=false`.
- Session partitions remain usable for later phases.

Operator dependency:

- None.

## Phase 4 - SymbolTimeframeContext And Root PriceHistory Extraction

Goal: remove the root-state shape that blocks fanout.

Work:

- Expand `SymbolTradingContext` into `SymbolTimeframeContext`.
- Move indicator engines, strategy orchestrator context, market data, and candle views into context instances.
- Replace root `this.priceHistory` reads/writes with CandleStore context views.
- Keep compatibility shims only for dashboard/backtest consumers during this phase.
- Remove MultiAssetManager responsibilities by moving symbol metadata into `AssetConfigManager`/context construction.

Verification:

- `rg -n "this.priceHistory|ctx.priceHistory|priceHistory =" run-empire-v2.js core` only finds compatibility shims or tests.
- TSLA 15m replay matches pre-phase baseline within declared tolerance.
- BTC 15m replay uses BTC candles only and does not touch TSLA candles.

Bot capability after phase:

- Bot can hold clean per-symbol/timeframe analysis state, still with one executing context at a time.

Rollback:

- Compatibility shim can route legacy calls back to root history until Phase 5.

Operator dependency:

- None.

## Phase 5 - TradingFanoutEngine In Shadow Mode

Goal: run the scanner matrix without executing fanout trades.

Work:

- Add `MarketDataRouter`.
- Add `TradingFanoutEngine`.
- Build active matrix from session symbols and configured timeframes.
- Queue one analysis job per completed candle/context.
- Run StrategyOrchestrator per context.
- Emit shadow decisions to logs with `contextKey`, but do not execute.
- Add per-context mutex and bounded concurrency.

Verification:

- One live candle can create multiple context decisions without global lock blockage.
- Opposite decisions on same symbol but different timeframes appear as separate shadow records.
- Same context never analyzes the same candle twice.
- Shadow logs contain no source mismatch across symbol/timeframe.

Bot capability after phase:

- Bot sees the full multi-symbol/multi-timeframe opportunity set but still executes the legacy single-context path.

Rollback:

- Disable fanout shadow env flag.

Operator dependency:

- None.

## Phase 6 - Fanout Execution And Global Position Gate

Goal: execute real multi-direction, multi-timeframe, multi-position trades safely.

Work:

- Add `TradeIdentity` to every open trade:
  - `tradeId`
  - `sessionId`
  - `assetClass`
  - `brokerId`
  - `symbol`
  - `entryTimeframe`
  - `contextKey`
  - `strategyName`
  - `direction`
- Remove oldest-symbol fallback exits from fanout execution.
- Exit by `tradeId`.
- Enforce same-context no-hedge only for identical `(symbol,timeframe)`.
- Allow independent long/short on different timeframes.
- Add global 10/15/18 gate:
  - 1-10 normal.
  - 11-15 expansion tier.
  - 16-18 exceptional tier.
  - 19+ hard reject.
- Add concentration alarm at default 5 per symbol, configurable, alert-only.

Verification:

- Test same symbol:
  - TSLA 5m long and TSLA 1h short can coexist.
  - TSLA 5m long and TSLA 5m short cannot coexist.
- Open-position count 18 allows no additional entry.
- Position 11 requires expansion-tier evidence.
- Position 16 requires exceptional-tier evidence.
- Exits close the intended `tradeId`, not the oldest trade for a symbol.

Bot capability after phase:

- Bot can scan and trade multiple symbols, timeframes, directions, and positions under one session account.

Rollback:

- Disable fanout execution and keep shadow fanout.
- Existing trade identities still improve exits for legacy path.

Operator dependency:

- None.

## Phase 7 - Fort-Knox Becomes Source Of Pattern Truth

Goal: use Fort-Knox pattern banks for live decisions.

Work:

- Route StrategyOrchestrator, TRAI, and DynamicPositionSizer pattern lookups through `FortKnoxPatternService`.
- Enable exact live/premium/starter load order.
- Enable aggregate fallback only within same asset/session/timeframe.
- Enable promotion checkpoint default `end_of_session`.
- Enable `PROMOTION_CHECKPOINT_CADENCE`.
- Enable signed pack import.
- Enable negative quarantine penalties.
- Keep old PatternMemoryBank/UnifiedPatternMemory as compatibility readers until migrations are complete.

Verification:

- Same pattern in BTC 15m and TSLA 15m produces different bank handles.
- Paper and live modes cannot read each other's banks.
- Unsigned or mismatched pack cannot load.
- Candidate with clean stats enters `PROMOTION_QUARANTINE`, then promotes only after checkpoint and two-key pass.
- Bad pattern enters negative quarantine and receives penalty without operator action.

Bot capability after phase:

- Bot uses isolated, signed, auditable pattern memory for live decisions.

Rollback:

- Route pattern reads back to legacy memory and keep Fort-Knox mirror events.

Operator dependency:

- None.

## Phase 8 - Backtest/Live Unified Replay

Goal: make future performance claims comparable across backtest and live.

Work:

- Replace BacktestRunner's root-history flow with replay broker adapter feeding MarketDataRouter.
- Run fanout engine in replay mode.
- Report metrics by session, symbol, timeframe, strategy, direction, and pattern-bank scope.
- Add regression fixtures for the P0 anchor and for one mixed stocks/crypto replay.

Verification:

- Backtest and live-mode paper replay share the same engine path after broker adapter boundary.
- P0 fixture remains explainable against `$13,213.042341608163`.
- Report includes trade identity fields for every entry and exit.

Bot capability after phase:

- Bot has a single scanner/execution path for live, paper, and backtest.

Rollback:

- Keep old BacktestRunner behind a legacy env flag for one release window.

Operator dependency:

- None.

## Phase 9 - Cleanup And Deletion Pass

Goal: remove compatibility debt after the new system is proven.

Work:

- Delete root `priceHistory` compatibility shims.
- Remove MultiAssetManager if no live references remain.
- Remove direct PatternMemoryBank/UnifiedPatternMemory hot-path access.
- Remove old SessionRouter force-close branches replaced by SessionTransitionCoordinator.
- Delete stale docs/comments that claim single active symbol/timeframe behavior.

Verification:

- `rg -n "priceHistory|MultiAssetManager|PatternMemoryBank|getInstance\\(\\).*StateManager"` has only expected legacy tests/docs.
- Full replay suite passes.
- Paper session transition and fanout execution soak without state contamination.

Bot capability after phase:

- Backend architecture matches the target design and is ready for downstream consumers later.

Rollback:

- By this phase rollback should be through git/release artifact only, not runtime flags.

Operator dependency:

- None.

## WHAT I DID DO

Sequenced the backend implementation so state isolation lands before SessionRouter activation, context identity lands before fanout execution, and Fort-Knox shadowing lands before pattern memory affects live trades.

## WHAT I DID NOT DO

I did not implement code, edit source files, run pipelines, create commits, define downstream contracts, or ask engineering HOW questions.

## WHAT I ASSUMED

Implementation will happen after current vulnerable fix-queue work is stabilized or explicitly approved. The correct P0 anchor is `$13,213.042341608163`. Rollback flags are acceptable during migration, but final architecture should remove compatibility shims after proof.

## OPEN QUESTIONS FOR OPERATOR

None. No strategic product-level WHAT decision is blocking implementation.
