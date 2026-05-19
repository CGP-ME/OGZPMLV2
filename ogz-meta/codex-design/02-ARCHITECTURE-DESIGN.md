# 02 - Architecture Design

Scope: backend trading bot only. This design covers the three requested pillars and makes engineering HOW decisions directly. Frontend can adapt later.

Live P0 anchor preserved for review context: `$13,213.042341608163`.

## Design Principles

1. Live trading state must be partitioned by session and account before broker switching becomes production behavior.
2. Trading decisions must be keyed by exact context: `(session, assetClass, brokerId, symbol, timeframe)`.
3. One candle path must feed both backtest and live. Root `priceHistory` is deprecated.
4. A trade must carry all identity needed to exit it: `sessionId`, `symbol`, `entryTimeframe`, `strategyName`, `direction`, and `tradeId`.
5. Pattern memory must be isolated by mode/source/session/symbol/timeframe and must be auditable from append-only events.

## Pillar 1 - SessionRouter Completion

### Target Shape

Introduce `SessionAccountContext` and `SessionTransitionCoordinator`.

`SessionAccountContext` owns:

- `sessionId`: `stocks_rth` or `crypto_overnight`.
- `assetClass`: `stocks` or `crypto`.
- Broker adapter and broker symbols.
- `StateManager` partition with its own state file.
- `RiskManager`, PnL/daily-loss counters, drawdown tracker, and kill switch namespace.
- `CandleStore` active views for its symbols and timeframes.
- Pattern bank handles for Fort-Knox.
- Per-session MPM registry and pending TRAI decisions.

Reasoning: V3 locks independent crypto/stocks balance, PnL, and daily-loss tracking. The current singleton `StateManager` cannot satisfy that because it loads one state file and exports one singleton instance (`core/StateManager.js:79-162`, `core/StateManager.js:1123-1261`, `core/StateManager.js:1430-1439`).

### Transition Atomicity

Use a transition state machine:

```text
ACTIVE
BLOCK_NEW_ENTRIES
FORCE_FLAT
SNAPSHOT_SOURCE
UNLOAD_SOURCE
LOAD_TARGET
BACKFILL_TARGET
WARM_TARGET
ACTIVE_TARGET
FAILED
```

Implementation decision:

- A single `SessionTransitionCoordinator` owns a process mutex plus a transition journal under `data/session-router/transition-state.json`.
- Every entry path checks `transitionGate.allowEntry(contextKey)`.
- During transition, exits remain allowed for source-session trades until the `FORCE_FLAT` phase finishes.
- Broker/candle events may continue buffering candles, but they cannot trigger new entries while the transition state is not active.
- On process restart, the coordinator reads the transition journal. If the last recorded phase is before `ACTIVE_TARGET`, it resumes from the last complete phase or fails closed with trading paused.

Reasoning: Session transitions touch broker subscriptions, state persistence, active positions, candle caches, and pattern-bank handles. A boolean like `transitionInProgress` exists today (`core/SessionRouter.js:27-54`) but is not durable or restart-safe.

### State Erasure On Transition

State erasure means active-context erasure, not deleting audit history.

On each session switch:

- Snapshot and flush source session state, closed-trade logs, decision ledger buffers, and pattern-bank events.
- Force-close every source-session open trade before target activation.
- Clear in-memory `priceHistory`, `timeframeHistories`, symbol contexts, indicator engines, pending TRAI decisions, and MPM maps for the outgoing session.
- Keep historical `CandleStore` data on disk by session/symbol/timeframe.
- Load target session state, candle windows, pattern banks, and MPM registry from its own partition.
- Refuse to activate if any source-session trade remains open.

Reasoning: current SessionRouter force-closes only on stocks-to-crypto and uses singleton state (`core/SessionRouter.js:169-246`). Complete erasure prevents stock indicators, crypto pattern memory, and account drawdown from bleeding across sessions.

### Session-Close Timing

Decision:

- Stocks: block new stock entries 30 minutes before regular-market close; force-flat all stock positions 5 minutes before close; snapshot immediately after flat confirmation.
- Crypto before stock session: block new crypto entries 30 minutes before stocks regular-market open; force-flat crypto 5 minutes before stock open; activate stocks only after crypto is flat and stock warmup passes.
- Crypto after stock close: activate crypto after stock force-flat, stock snapshot, crypto bank load, and crypto warmup.

Reasoning: one active session at a time is the current business model. Carrying positions across inactive broker sessions creates unmanaged overnight/market-open risk. Five minutes is enough buffer for market orders/retries without forcing exits too early; 30 minutes blocks new trades that cannot complete normal exit lifecycle before transition.

### Candle Backfill Cadence

Decision:

- Warm every target `(symbol,timeframe)` with 250 candles on activation.
- Do not allow entries until at least 200 candles exist for that context unless a strategy declares a smaller hard minimum and the context has explicit `ALLOW_PARTIAL_WARMUP=true`.
- Backfill source priority: broker historical API first, CandleStore cache second, then no-entry if still insufficient.
- Stream 1m candles continuously during active session and derive higher timeframes through CandleAggregator.
- Reconcile gaps every 15 minutes for `1m`, `5m`, `15m`; hourly for `30m`, `1h`, `4h`; after session close for `1d`.

Reasoning: live CandleStore keeps capped candle windows (`core/CandleStore.js:41-76`), TradingConfig timeframes include up to `4h`/`1d` (`core/TradingConfig.js:740-748`), and strategy minimums are currently up to 50 in config but indicator/MA usage and legacy windows make 200 the safer industry-standard warmup floor (`core/TradingConfig.js:650-658`). 250 gives margin without unbounded memory.

### Volume Handling

Decision:

- Treat OHLCV as the candle contract everywhere.
- Normalize missing broker volume to `v=0` plus `volumeQuality="missing"`.
- Volume-dependent strategies must no-score or hold when `volumeQuality` is missing.
- CandleStore/ContractValidator should reject `null`/`undefined` volume on persisted candles.

Reasoning: ContractValidator already requires numeric volume (`core/ContractValidator.js:208-230`), while CandleProcessor can currently preserve null volume from live events (`core/CandleProcessor.js:405-591`). Numeric plus quality flag keeps the contract stable without pretending missing volume is informative.

## Pillar 2 - Multi-Direction, Multi-Timeframe, Multi-Position Fanout

### Target Shape

Introduce `TradingFanoutEngine` and `SymbolTimeframeContext`.

`SymbolTimeframeContext`:

```text
contextKey = sessionId + ":" + symbol + ":" + timeframe
sessionId
assetClass
brokerId
symbol
timeframe
candleStoreView
indicatorEngine
strategyOrchestrator
patternBankHandle
marketData
lastSignal
perContextMutex
```

Reasoning: `SymbolTradingContext` and `CandleStore` already prove the right storage direction (`core/SymbolTradingContext.js:78-139`, `core/CandleStore.js:24-76`). The missing piece is execution fanout keyed by timeframe and session, not only symbol.

### Dispatch Mechanics

Decision:

- Market data lands in `MarketDataRouter`.
- Completed candles enqueue exactly one work item per eligible `SymbolTimeframeContext`.
- Each context has its own analysis mutex. This replaces the current global `this.analyzing` lock in TradingLoop (`core/TradingLoop.js:45-69`).
- The fanout loop is deterministic: process queued contexts by candle timestamp, then context key, with configurable concurrency.
- Backpressure drops only duplicate stale analysis tasks for the same context/candle timestamp, never candles.

Reasoning: current runtime selects one active timeframe (`run-empire-v2.js:1368-1378`) and `TradingLoop` has a single process-wide analysis lock. A quant-style scanner needs per-context isolation so TSLA 15m cannot block BTC 1h or SPY 5m.

### Multi-Timeframe Disagreement

Decision:

- Same `(symbol,timeframe)` cannot hold long and short simultaneously.
- Different timeframes on the same symbol are independent strategies and may hold opposite directions at the same time.
- Every trade stores `entryTimeframe`, `contextKey`, and `strategyInstanceId`.
- Exits always target `tradeId`; fallback "oldest trade for symbol" is removed from fanout execution.

Reasoning: V3 locks independent trades for timeframe disagreement. Current same-symbol hedge/flip logic is too broad (`core/TradingLoop.js:292-335`), and OrderExecutor still has oldest-symbol fallback risks (`core/OrderExecutor.js:671-714`).

### Global Position Gate

Decision:

- Global open-position counter spans the active session account, not one symbol.
- Positions 1-10: normal `minTradeConfidence`.
- Positions 11-15: expansion tier, require `max(0.70, baseMinConfidence + 0.15)`, RiskManager not HIGH, and either two-strategy confluence or promoted/live pattern support.
- Positions 16-18: exceptional tier, require `max(0.85, baseMinConfidence + 0.30)`, RiskManager LOW, no recovery mode, and either three-strategy confluence or Fort-Knox promoted pattern support.
- Position 19+: hard reject.
- Concentration alarm: configurable default 5 open trades for one symbol, alert only, no block.

Reasoning: multiplying confidence thresholds is mathematically unstable because existing thresholds can exceed practical probability ranges. Additive floors produce a predictable cap ladder while respecting the locked 10/15/18 shape.

### DynamicPositionSizer

Decision:

- Keep DynamicPositionSizer disabled until fanout identity and global caps are in place.
- Wire it after `TradeIdentity` exists so sizing can consume session/account balance, context volatility, confluence, and Fort-Knox pattern status.
- DPS cannot override hard cap, daily-loss gates, or session transition gates.

Reasoning: DPS exists but is explicitly not wired (`core/DynamicPositionSizer.js:1-41`, `run-empire-v2.js:735`, `run-empire-v2.js:999`). Wiring it before context identity would multiply current state-contamination risk.

### Backtest/Live Convergence

Decision:

- Backtests instantiate the same `TradingFanoutEngine` with a replay broker adapter.
- Historical candles enter the same `MarketDataRouter` as live candles.
- Reports group metrics by `sessionId`, `symbol`, `timeframe`, `strategyName`, and `patternBankScope`.

Reasoning: BacktestRunner currently feeds `handleMarketData` and `analyzeAndTrade`, but still relies on root `priceHistory` and custom report flow (`core/BacktestRunner.js:24-99`, `run-empire-v2.js:1780`). This keeps P0 comparison honest.

## Pillar 3 - Fort-Knox Pattern Subsystem

### Target Shape

Introduce `FortKnoxPatternService` as the only pattern-bank API used by StrategyOrchestrator, TRAI, DynamicPositionSizer, and backtests.

It replaces direct hot-path reads/writes to `PatternMemoryBank`, `UnifiedPatternMemory`, and unsigned JSON pattern packs with:

- Append-only event logs.
- Derived snapshots.
- Per-context bank handles.
- Signed imported packs.
- Promotion watchdog outside the trading hot path.
- Operator-only rollback tooling.

### Bank Layout

Decision:

```text
data/pattern-banks/v1/
  {mode}/
    {assetClass}/
      {sessionId}/
        {symbol}/
          {timeframe}/
            live/
              events.jsonl.gz
              snapshot.current.json
              manifest.json
            premium/
              pack.json.gz
              manifest.json
              signature.ed25519
            starter/
              pack.json.gz
              manifest.json
              signature.ed25519
```

Load order:

1. Exact live bank.
2. Exact premium pack.
3. Exact starter pack.
4. Aggregate fallback within same assetClass/session/timeframe only if exact bank has fewer than the configured minimum samples.

No cross-state compatibility flag exists. Cross-mode, cross-asset, cross-session, and cross-timeframe reads are blocked by path construction.

Reasoning: UnifiedPatternMemory currently buckets live/paper by asset class and backtest by ticker (`core/UnifiedPatternMemory.js:147-193`). Fort-Knox needs tighter per-context isolation to support fanout and broker/session switching.

### Provenance Contract

Every pattern event includes:

- `patternId`
- `eventType`
- `mode`
- `assetClass`
- `sessionId`
- `brokerId`
- `symbol`
- `timeframe`
- `strategyName`
- `direction`
- `featureSchemaVersion`
- `configFingerprint`
- `botVersionSha`
- `botVersionSemver`
- `marketRegime`
- `dataSourceId`
- `source`: `live`, `premium`, `starter`, `backtest`, `manual_import`
- `captureSessionId`
- `packSignatureId`
- `createdAt`

Reasoning: current PatternMemoryBank outcome telemetry has mode, symbol, pattern status, and broker hardcoded to Kraken in places (`core/PatternMemoryBank.js:319-348`). Fort-Knox needs enough provenance to prove where an edge came from and where it is allowed to act.

### Append-Only Events

Decision:

Pattern writes are immutable events:

- `PATTERN_OBSERVED`
- `TRADE_OUTCOME_RECORDED`
- `STATUS_TRANSITION_REQUESTED`
- `STATUS_TRANSITION_APPLIED`
- `PACK_IMPORTED`
- `PACK_REJECTED`
- `ROLLBACK_APPLIED`
- `WATCHDOG_ALERTED`

Snapshots are rebuildable caches. If event log and snapshot disagree, event log wins.

Reasoning: current JSON stores mutate pattern records in place (`core/PatternMemoryBank.js:245-354`, `core/UnifiedPatternMemory.js:259-305`). In-place mutation is convenient but weak for rollback, proof, and corruption audits.

### Promotion Mechanics

Decision:

- `LEARNING`: default for new observed patterns.
- `CANDIDATE`: enough observations to evaluate, not trusted for boost.
- `PROMOTION_QUARANTINE`: pattern has at least 30 outcomes, at least 55 percent win rate, positive average R/PnL, and no provenance violation. It is frozen for checkpoint review.
- `PROMOTED`: applied only at checkpoint after two keys pass.
- `NEGATIVE_QUARANTINED`: bad pattern; auto-penalty allowed.
- `DEAD`: pruned from hot snapshots but retained in archive events.

Two keys:

1. Statistical key: samples, win rate, avg R/PnL, variance, recency, and profit factor pass thresholds.
2. Governance key: TRAI/watchdog confirms no data leak, no source mismatch, no version incompatibility, and no session contamination.

Default checkpoint: end of session.

Config:

```text
PROMOTION_CHECKPOINT_CADENCE=end_of_session | every_4h | daily | hourly
```

TRAI can recommend early lift only for exceptional candidates, but the early-lift threshold is stricter: at least 50 outcomes, at least 65 percent win rate, positive profit factor, and clean provenance. Early lift still writes both key events.

Reasoning: current PatternMemoryBank can promote immediately after threshold (`core/PatternMemoryBank.js:397-429`) and UnifiedPatternMemory can promote after default 10 samples (`core/UnifiedPatternMemory.js:417-443`). Fort-Knox should avoid hot-path self-promotion.

### Signed Packs

Decision:

- Premium and starter packs use detached Ed25519 signatures.
- `manifest.json` includes pack semver, bot compatibility range, SHA-256 digest, feature schema version, source dataset ID, generated timestamp, and signer key ID.
- Import rejects unsigned packs, digest mismatches, incompatible schema, and incompatible bot version.
- Accepted imports are still read-only; live outcomes never mutate imported pack bytes.

Reasoning: `TRAIPatternIntegration` currently loads unsigned JSON directly (`core/TRAIPatternIntegration.js:37-64`). That is acceptable for local experiments, not for Fort-Knox-grade live pattern provenance.

### Snapshot Retention And Rollback

Decision:

- Keep hourly change snapshots for 48 hours.
- Keep daily snapshots for 7 days.
- Keep weekly snapshots for 4 weeks.
- Keep monthly snapshots for 6 months.
- Archive event logs indefinitely with compression.
- Rollback is operator-only through a CLI that creates a `ROLLBACK_APPLIED` event and never deletes the original events.

Reasoning: UnifiedPatternMemory has a one-shot forceBackup helper and says retention is future concern (`core/UnifiedPatternMemory.js:607-643`). Fort-Knox makes retention and rollback first-class.

### Watchdog And Alerts

Decision:

- Watchdog runs outside the trading hot path.
- Small auto-actions: demote to candidate, move to negative quarantine, disable pattern boost, throttle import.
- Big actions: alert and wait. Examples include source mismatch, signature failure, event-log corruption, cross-session contamination, or live bank unavailable.
- Escalation cadence:
  - Discord immediately.
  - Email if unresolved after 1 hour.
  - Dashboard banner after 4 hours.
  - Nag every 30 minutes after banner.
  - SMS only after 12 hours unresolved or if live trading is blocked.

Reasoning: promotion, pack import, and corruption handling are operational controls. They should not block candle processing unless the active bank is unsafe.

## Integration Boundaries

Backend owns:

- Session/account partitioning.
- Trading fanout.
- Trade identity.
- Pattern bank isolation and promotion.
- Risk/position gates.
- Backtest/live execution parity.

Downstream observability can later read internal status fields such as session, fanout, position gate, pattern bank, and promotion-watchdog status. No consumer contract is defined here.

## WHAT I DID DO

Designed the backend-only architecture for SessionRouter completion, multi-direction/multi-timeframe/multi-position fanout, and Fort-Knox Pattern Subsystem. Made engineering HOW decisions for bank switching, transition atomicity, state erasure, backfill cadence, volume handling, session-close timing, promotion, signing, retention, and alerts.

## WHAT I DID NOT DO

I did not implement code, change source files, design UI adoption, define public-facing schemas, change infrastructure stack, or ask the operator to decide engineering mechanics.

## WHAT I ASSUMED

One active market session remains the intended business behavior for now. Crypto and stocks must have independent account/risk/PnL state. Multi-timeframe disagreement is allowed as independent trades across different timeframe contexts. The live P0 anchor is `$13,213.042341608163`.

## OPEN QUESTIONS FOR OPERATOR

None. No product-level WHAT decision surfaced; all remaining choices are implementation details covered above.
