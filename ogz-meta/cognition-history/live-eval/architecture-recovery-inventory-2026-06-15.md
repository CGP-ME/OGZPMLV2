# Architecture Recovery Inventory - 2026-06-15

Scope: recover the missing runtime architecture Trey has been asking for: multi-symbol, multi-timeframe, and multi-position behavior. This is an evidence inventory and execution order, not a code change.

Branch inspected: `claude/new_beginnings`

## Source Documents Checked

- `ogz-meta/Alignment/README.md`
- `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`
- `ogz-meta/GRAND-SCHEME.md`
- `ogz-meta/specs/therestofthearchitecture.md`
- `ogz-meta/ledger/branch-recovery-audit/2.md`

## North Star

`ogz-meta/GRAND-SCHEME.md` explicitly defines the trading engine as multi-broker, multi-asset, multi-direction, and multi-timeframe. Line 21 further spells out the operator-level target: scanner over 8-10 tickers, every timeframe, independent strategy pipelines, independent exits, and automatic stock/crypto session awareness.

Current live runtime does not meet that target.

## Current Runtime State

Verified from PM2/env and source inspection in this session:

- Runtime is TSLA-only: `TRADING_PAIR=TSLA`, `ALPACA_SYMBOLS=TSLA`.
- Runtime timeframe is one configured active timeframe: `CANDLE_TIMEFRAME=15m`.
- `SESSION_ROUTER_ENABLED=false`.
- `ENABLE_MTF` is not set in PM2; code default enables the `MultiTimeframe` strategy, but that is not true multi-timeframe runtime architecture.
- `ENABLE_ORB=true` and `ENABLE_NOWICK=true` are live.
- `ENABLE_DONCHIAN`, `ENABLE_SMS`, and `ENABLE_BREAKRETEST` are not live.

## What Exists In Current HEAD

### Symbol-aware storage exists

`core/CandleStore.js` stores candles as `Map<symbol, Map<timeframe, candle[]>>` and persists v2 slots as `SYMBOL__TIMEFRAME`. This is the correct storage shape for multi-symbol and multi-timeframe recovery.

### Symbol contexts exist

`core/SymbolTradingContext.js` exists and owns per-symbol indicator/signal modules. The file itself says it is inert until later wiring, but current `run-empire-v2.js` does construct `symbolContexts` for configured symbols.

### Candle routing partially exists

`core/CandleProcessor.js` can resolve a candle to a `SymbolTradingContext` by `candle.symbol`, and it updates the per-symbol indicator/signal modules.

### TradingLoop can analyze by explicit symbol

`run-empire-v2.js` requires `analyzeAndTrade(symbol)` to receive an explicit symbol and forwards that into `TradingLoop`. `TradingLoop` then uses `stateManager.getTradesBySymbol(symbol)` for open positions.

### Position cap exists, but not full multi-position semantics

`config/trading.config.json` has `positionSizing.maxPositions = 3`. `TradingLoop` blocks same-direction stacking and flips opposite direction before opening a new position. This is not the requested independent multi-position architecture.

### SessionRouter exists, but activation is intentionally locked

`core/SessionRouter.js` is built with transition safety, broker reconciliation, pattern-memory handoff, OHLC fencing, and force-close behavior. Alignment docs explicitly keep runtime activation off until a controlled paper rehearsal proves the transition store, broker snapshots, pattern handoff, OHLC fence, trace events, active scope, and dashboard scope.

## What Is Still Missing

### Gap 1 - Single-broker multi-symbol fanout is not complete

The current single-broker subscription path in `run-empire-v2.js` subscribes only to `resolvedConfig.config.broker.tradingPair`. That means even if `ALPACA_SYMBOLS` contains multiple symbols, the manual single-broker path does not clearly fan out over all configured Alpaca symbols.

Impact: eval capture remains bottlenecked to TSLA. This is the first architecture gap to close because it increases signal opportunities without enabling SessionRouter's stock/crypto handoff risk.

### Gap 2 - Global priceHistory and global indicatorEngine are still alive

`CandleProcessor` writes to per-symbol contexts, but it also still updates global `ctx.priceHistory`, global `ctx.indicatorEngine`, global `ctx.emaCrossoverSignal`, global `ctx.maDynamicSRSignal`, and other legacy fields. Some consumers use symbol contexts, but the migration is not finished.

Impact: multi-symbol mode can still suffer cross-symbol contamination unless every decision-bearing read is proven to use the per-symbol context.

### Gap 3 - Multi-timeframe is currently a strategy, not a runtime substrate

`StrategyOrchestrator` registers a `MultiTimeframe` strategy and feeds latest active candles into `MultiTimeframeAdapter`, but `run-empire-v2.js` pins allowed timeframes to `[this.candleTimeframe]` until symbol contexts and CandleStore support active multi-timeframe swaps. The broker runtime is not running independent first-class streams for 1m/5m/15m/1h/etc.

Impact: current MTF cannot be treated as the architecture Trey requested. It is a signal module over current feed behavior, not a full timeframe fanout engine.

### Gap 4 - Multi-position is constrained to one position per direction per symbol

`TradingLoop` checks `hasPositionInDirection` and blocks same-direction entries. Opposite direction is treated as close-first/flip-next-signal. The `maxPositions` cap is therefore not full independent multi-position behavior.

Impact: strategies do not get independent positions/exits on the same symbol. One strategy's active long can block another strategy's independent long setup.

### Gap 5 - SessionRouter is not the first fix

SessionRouter must stay off until paper rehearsal proof exists. Enabling it before multi-symbol single-broker fanout is proven would widen the blast radius while the current single-broker path still has unresolved global-state migration.

Impact: do not flip `SESSION_ROUTER_ENABLED=true` as the architecture recovery shortcut.

## Branch Recovery Relationship

`alpaca/multi-symbol-phased` and `alpaca/stocks-paper-flip` contain older multi-symbol/session-router work. Current HEAD includes many stronger safety gates and symbol-scope pieces, so direct merge/port is unsafe.

Actionable branch lessons:

- Do not port the old `SESSION_ROUTER_ENABLED=true` flip.
- Do not port old candle-history wipe behavior; current CandleStore v2 is safer.
- Use branch commits as archaeological evidence for intent, not as a direct merge source.
- Rebuild missing behavior against current HEAD's safety boundaries.

## Recommended Atomic Execution Order

### Slice 1 - Single-broker Alpaca multi-symbol fanout

Goal: With `SESSION_ROUTER_ENABLED=false`, make the Alpaca single-broker path subscribe to every configured `ALPACA_SYMBOLS` symbol and run candle-close analysis for each symbol independently.

Required proof:

- `ALPACA_SYMBOLS=TSLA,NVDA,SPY` creates symbol contexts for all three.
- Alpaca `subscribeToCandles` is called once per configured symbol.
- Each OHLC event carries the correct symbol into `CandleProcessor.handleMarketData`.
- `CandleStore` gets separate `TSLA__15m`, `NVDA__15m`, and `SPY__15m` slots.
- `TradingLoop.analyzeAndTrade(symbol)` runs with the event symbol, not `this.tradingPair`.
- Existing TSLA-only behavior remains unchanged when `ALPACA_SYMBOLS=TSLA`.

Focused tests to add/run:

- A single-broker subscription fanout test around `subscribeToMarketData`.
- A no-cross-symbol decision test proving TSLA candles cannot trigger NVDA analysis.
- Existing `test/symbol-routing.test.js`.
- Existing `test/alpaca-data-stream-resilience.test.js`.
- Current P0 gate after trade-path changes.

### Slice 2 - Decision-bearing per-symbol state audit

Goal: Remove or prove harmless every decision-bearing read from global `priceHistory`, global `indicatorEngine`, and global strategy signal fields.

Required proof:

- Strategy inputs for each analyzed symbol come from `symbolContexts.get(symbol)` or `CandleStore`, not the last global candle.
- Exit checks use the trade symbol's candle/market data.
- Dashboard/global telemetry may remain global only if it is explicitly non-decision-bearing and labeled as selected-symbol state.

### Slice 3 - True multi-timeframe substrate

Goal: Store and evaluate independent timeframes per symbol through CandleStore, not just the `MultiTimeframe` strategy wrapper.

Required proof:

- Broker/rest/websocket path can hydrate and store multiple timeframes for the same symbol.
- `SymbolTradingContext` can either host timeframe-specific indicator engines or a `Map<timeframe, context>`.
- MultiTimeframe strategy consumes real per-timeframe candle streams from CandleStore.
- Active entry timeframe remains explicit and trace-stamped.

### Slice 4 - Multi-position semantics

Goal: Allow multiple independent same-direction positions only when they have distinct strategy/entry identity and independent exit contracts.

Required proof:

- No unbounded stacking.
- Same strategy cannot duplicate-enter the same setup unless explicitly allowed.
- Each active trade has strategyName, signalId, traceId, entry candle, exit contract, and remaining quantity.
- Partial exits, MPM, TradeJournal, StateManager, dashboard, and broker reconciliation all agree per trade.

### Slice 5 - SessionRouter paper rehearsal

Goal: Only after slices 1-4, rehearse SessionRouter in paper with explicit symbols and proof artifacts.

Required proof:

- Transition-store status.
- Broker REST snapshots before and after transition.
- Pattern-memory handoff target.
- OHLC fence behavior.
- Trace events.
- Active scope.
- Dashboard/live-report scope.
- Force-close/cutoff behavior with no stale state.

## Immediate Next Slice

Start with Slice 1. It is the highest-leverage, lowest-blast-radius path to more eval substance because it lets the bot watch multiple stock tickers without enabling stock/crypto SessionRouter handoff.

Do not start by enabling SessionRouter. Do not start by changing strategy logic. Do not start by tuning confidence. The runtime architecture bottleneck is symbol fanout and per-symbol decision isolation.
