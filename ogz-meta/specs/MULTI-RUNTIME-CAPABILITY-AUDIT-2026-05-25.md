# Multi-Runtime Capability Audit - 2026-05-25

## Purpose

This audit answers one question: how much of OGZPrime is actually built for
multi-broker, multi-symbol, multi-position, multi-direction, and
multi-timeframe operation today, versus how much is scaffold that has not been
driven end to end.

Ground truth for this audit is current code on `/opt/ogzprime/OGZPMLV2`,
branch `rebuild/clean-from-baseline`, plus the live runtime environment checked
on 2026-05-25. No PM2 restart or broker mutation was performed.

## Live Runtime Posture

The current PM2 bot is not running the intended full multi-runtime architecture.
It is running a narrow paper-trading posture:

- Broker: `alpaca`
- Asset class: `stocks`
- Trading pair: `TSLA`
- Alpaca symbols: `TSLA`
- Session router: disabled
- Live trading: disabled
- Paper trading: enabled
- Account positions: zero
- Open orders: zero
- Persisted active trades: zero

That means current runtime behavior is effectively one broker, one stock symbol,
one configured timeframe, and paper execution. The broader architecture is not
activated by the current environment.

## Capability Verdict

| Capability | Current status | Evidence |
|---|---|---|
| Multi-broker registry | Partial scaffold | `brokers/BrokerRegistry.js` registers Kraken, Coinbase, Binance, Gemini, Alpaca, IBKR, and others, but some are TODO or incomplete. |
| Simultaneous multi-broker runtime | Not complete | `run-empire-v2.js` uses either one selected broker or `SessionRouter`; `SessionRouter` switches between crypto and stocks sequentially, not concurrent multi-broker execution. |
| Multi-symbol state storage | Partially real | `core/CandleStore.js` stores candles by `symbol -> timeframe`; `core/SymbolTradingContext.js` creates per-symbol modules. |
| Multi-symbol live dispatch | Not complete | Default live path subscribes only `resolvedConfig.config.broker.tradingPair`; symbol contexts are registered but not fully used as the live scanning dispatcher. |
| Multi-position state | Partial and leaky | `StateManager` has scoped `activeTrades`, but also maintains scalar `position`, `entryPrice`, `inPosition`, and dashboard state fields. |
| Multi-direction | Partial | BUY, SELL, SELL_SHORT, and COVER exist, but same-symbol hedging is blocked and `ENABLE_SHORTS` is not the execution gate to trust. |
| Multi-timeframe | Scaffold | Timeframe selector/config exists, but runtime and backtest still operate on one active timeframe path. |
| Dashboard transparency | Not complete | Trade/state dashboard payloads omit authoritative scope fields; `open-positions.js` infers symbol from the selected chart. |
| Backtest multi-symbol | Not complete | `BacktestRunner` pumps one candle file through one bound symbol/timeframe context. Matrix and parallel sweeps spawn separate one-symbol workers. |
| Broker adapter readiness | Uneven | Alpaca is the strongest current adapter. Kraken market path exists, but order lifecycle/reconciliation methods are incomplete. Other brokers need capability verification before use. |

## Why It Looked More Complete Than It Is

The codebase contains real architectural pieces, but several are only partially
connected:

- `BrokerFactory`, `BrokerRegistry`, and `OrderRouter` make multi-broker routing
  look available.
- `CandleStore` and `SymbolTradingContext` make multi-symbol storage and
  per-symbol analysis look available.
- `StateManager.activeTrades` makes scoped multi-position storage look
  available.
- `AdaptiveTimeframeSelector` makes multi-timeframe behavior look available.
- Dashboard panels describe multi-ticker and multi-position behavior.

The missing layer is the end-to-end contract that forces every candle, order,
trade, position, dashboard event, broker callback, and learned-state write to
carry the same immutable runtime scope:

```text
executionMode + brokerId + assetClass + symbol + timeframe + account/session
```

Without that contract enforced everywhere, the system can have multi-runtime
parts but still behave as a single active lane or silently misattribute state.

## Detailed Findings

### 1. Broker Layer

`brokers/BrokerFactory.js` can instantiate registered broker adapters and checks
for a minimal required interface. `brokers/BrokerRegistry.js` registers multiple
brokers.

However, `run-empire-v2.js` has two actual runtime modes:

- Single selected broker, based on `BROKER`.
- `SessionRouter`, which alternates between Kraken crypto and Alpaca stocks.

`SessionRouter` is not a general multi-broker execution engine. Its own header
describes one active feed at a time, with crypto active outside stock hours and
Alpaca stocks active during RTH. Current `.env` disables it.

Verdict: broker plumbing exists, but full multi-broker runtime execution is not
complete.

### 2. Symbol Layer

`core/CandleStore.js` is correctly shaped for symbol/timeframe candle storage.
`core/SymbolTradingContext.js` is correctly shaped for per-symbol market state
and indicator modules.

The live runtime still subscribes to the single configured trading pair in the
default path. `run-empire-v2.js` comments explicitly state that symbol contexts
are not yet the full active dispatcher and that multi-timeframe context swaps
are future work.

Verdict: symbol-aware storage and contexts exist, but multi-symbol scanning is
not fully wired.

### 3. Position And State Layer

`core/StateManager.js` now stores scoped active trades, including symbol,
brokerId, assetClass, executionMode, timeframe, and scopeKey. That is the right
direction.

The same file still maintains scalar state fields such as `position`,
`entryPrice`, `entryTime`, `inPosition`, and `positionCount`. Those fields are
dangerous when the system is expected to hold multiple independent positions.

`core/PositionTracker.js` also still contains global-first-position behavior:
closing and snapshot helpers select the first BUY trade globally instead of
requiring a specific scope or trade id.

Verdict: the scoped trade model has begun, but legacy scalar helpers still make
multi-position behavior unsafe to call complete.

### 4. Direction Layer

`core/OrderExecutor.js` supports BUY, SELL, SELL_SHORT, and COVER paths, and
`StateManager` can compute long and short PnL.

`core/TradingLoop.js` blocks same-direction stacking per symbol and flips
opposite-direction positions instead of allowing same-symbol hedges. That may be
an intentional risk rule, but it is not multi-position multi-direction freedom.

`ENABLE_SHORTS` exists in config, but the execution path must be treated as
controlled by the actual direction filter and trading loop gates, not by that
name alone.

Verdict: long/short mechanics exist, but hedging and stacking are intentionally
constrained, and config naming is misleading.

### 5. Timeframe Layer

There is real code for timeframe profiles and an adaptive selector. The runtime
still subscribes to one active configured timeframe in the normal path, and the
backtest runner is one timeframe per worker.

Verdict: multi-timeframe is scaffold, not proven runtime behavior.

### 6. Dashboard Truth Contract

The dashboard is not yet an authoritative view of multi-runtime state.

`StateManager` broadcasts scalar `state_update` fields. `OrderExecutor` trade
broadcasts omit symbol, broker, timeframe, and scopeKey. `open-positions.js`
works around the missing data by resolving symbol from the currently selected
chart. That is not acceptable once multiple symbols or brokers are active.

Verdict: frontend chart data is improving, but trade/position transparency is
not yet scope-authoritative.

### 7. Backtest And Sweep Path

`core/BacktestRunner.js` loads one candle file and feeds one symbol/timeframe
context. The sweep tools run many one-symbol workers. That is useful for
calibration, but it is not the same as one process scanning and managing several
symbols at once.

Verdict: backtests are currently single-symbol per worker.

## Root Cause

The root cause is not that no multi-runtime architecture exists. The problem is
that the system has multiple partially built layers without a mandatory
end-to-end scope contract.

Some code is scope-aware. Some code is still scalar. Some code routes by symbol.
Some code infers symbol from UI state. Some code has adapter registries. Some
adapters do not implement enough lifecycle behavior for production use.

Until the contract is enforced across the whole path, the bot can only be trusted
in the narrow runtime lane currently exercised.

## Required Architecture Contract

Every runtime object that can affect trading, reporting, persistence, or learned
state must carry this immutable envelope:

```text
scope = {
  executionMode,
  brokerId,
  accountId,
  assetClass,
  symbol,
  timeframe,
  sessionId or modeEpoch
}
```

That scope must exist on:

- Inbound candles
- Strategy decisions
- Order intents
- Broker order IDs and client order IDs
- Active trades
- Position snapshots
- Fills and cancels
- Reconciliation snapshots
- Dashboard state updates
- Pattern-memory writes
- Backtest reports

If scope is missing on a trading-critical object, the correct behavior is to
fail loudly, not infer from current boot config or selected UI chart.

## Build Order

### Phase 0 - Stop Misleading Surfaces

Before enabling more runtime breadth, stop surfaces from implying capability that
is not authoritative.

- Dashboard position panels must not infer symbol from the selected chart.
- State updates must not imply multi-position truth if they only contain scalar
  state.
- Broker registry docs should distinguish implemented, scaffolded, and verified
  adapters.

### Phase 1 - Scope Contract Everywhere

Make the scope envelope mandatory at the DTO boundary.

Affected paths:

- Candle ingress
- Strategy decision output
- TradingLoop decision handling
- OrderExecutor entry and exit plans
- StateManager active trades
- Broker adapter order intents
- Dashboard trade and state events
- Backtest report rows

Acceptance gate:

- A trade emitted without symbol, brokerId, assetClass, executionMode, timeframe,
  and scopeKey must fail before execution or persistence.

### Phase 2 - Replace Scalar Position Truth

Demote scalar fields in `StateManager` to compatibility projections only, or
remove them from authoritative behavior.

Required:

- Authoritative positions indexed by scope and trade id.
- Close paths require a trade id or exact scope.
- `PositionTracker` must stop selecting the first global BUY.
- `state_update` must expose scoped positions array.

Acceptance gate:

- Two symbols can have independent positions and closing one cannot mutate or
  report the other.

### Phase 3 - Dashboard Projection Contract

Make the dashboard consume backend truth, not chart-local guesses.

Required:

- Trade events include full scope.
- Position events include full scope.
- State updates include scoped positions and account-level aggregates.
- Open positions panel renders backend-provided positions only.

Acceptance gate:

- Change selected chart symbol while two positions exist; open positions table
  must remain correct.

### Phase 4 - Multi-Symbol Single-Broker Vertical Slice

Enable one broker to scan and manage multiple symbols in one process.

Recommended first slice:

- Alpaca paper
- Stocks
- TSLA + SPY
- One timeframe
- Paper only

Required:

- Subscribe to all configured `ALPACA_SYMBOLS`.
- Dispatch every candle by symbol.
- Analyze each symbol against its own context.
- Maintain per-symbol active trades.
- Dashboard displays both.

Acceptance gate:

- One process sees TSLA and SPY candles, can hold independent scoped positions,
  and dashboard state remains correct.

### Phase 5 - Multi-Timeframe Per Symbol

After multi-symbol state is safe, wire multi-timeframe ingestion.

Required:

- CandleStore stores multiple timeframes per symbol.
- Strategy context selects the intended timeframe explicitly.
- Backtest/sweep commands declare the timeframe they are testing.
- Dashboard timeframe switching reads matching historical/live candles.

Acceptance gate:

- One symbol can maintain 1m and 15m candle stores without overwriting or
  mislabeling either.

### Phase 6 - Broker Capability Matrix

Before enabling any broker beyond Alpaca/Kraken market data, add a verified
capability matrix.

Capabilities must include:

- Market data
- Account balance
- Positions
- Open orders
- Place order
- Cancel order
- Replace/modify order
- Order status
- Fill stream
- REST reconciliation
- Client order ID/idempotency support

Acceptance gate:

- Router refuses to send a command to a broker that has not proven the required
  capability.

### Phase 7 - Multi-Broker Runtime

Only after scope, state, dashboard, and broker capabilities are enforced should
the system run multiple brokers in one process.

Required:

- Account-specific scope keys.
- Broker-specific reconciliation.
- No shared scalar active state.
- No global candle history.
- No UI inference.

Acceptance gate:

- One crypto broker and one stock broker can be active without sharing state,
  positions, order IDs, pattern memory, or dashboard labels.

## Immediate Next Work

These are the highest-value concrete fixes before expanding runtime breadth:

1. Add full scope fields to `OrderExecutor` dashboard trade broadcasts.
2. Add scoped active positions array to `StateManager` `state_update`.
3. Change `open-positions.js` to render backend scoped positions, not selected
   chart symbol guesses.
4. Fix `PositionTracker` close/snapshot helpers so they require trade id or
   exact scope instead of first global BUY.
5. Wire live Alpaca subscription to every configured `ALPACA_SYMBOLS` entry,
   not only the selected trading pair.
6. Add a multi-symbol paper smoke test with two symbols and two independent
   positions.
7. Add broker adapter capability matrix and fail-closed router checks.

## Final Verdict

OGZPrime has important multi-runtime building blocks, but the current product is
not yet the full multi-broker, multi-symbol, multi-position, multi-direction,
multi-timeframe platform.

The correct path is not another bandaid around the current single-lane runtime.
The correct path is to finish the scope contract, replace scalar state as
authority, make the dashboard projection honest, and then enable breadth one
vertical slice at a time with proof gates.
