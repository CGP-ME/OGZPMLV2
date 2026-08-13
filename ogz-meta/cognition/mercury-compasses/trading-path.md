# trading-path compass

Use this compass when a Mercury review touches entries, exits, position state,
broker routing, risk gates, strategy registration, backtest/live equivalence, or
anything that can affect a trade.

Read these first:

1. `core/StrategyOrchestrator.js`
   - `core/StrategyOrchestrator.js:11-19` states the winner-takes-all strategy
     contract: each strategy evaluates independently, the highest-confidence
     winner owns the trade, and confluence affects sizing after winner
     selection.
   - Strategy registration, enable flags, exit contracts, and public confidence
     shape live here.

2. `core/TradingConfig.js`
   - `core/TradingConfig.js:1-10` declares this file the centralized trading
     parameter source.
   - Before claiming config is wired, prove the reader and consumer path both
     exist.

3. `core/OrderExecutor.js`
   - `core/OrderExecutor.js:27-51` separates entry actions from exit actions
     and uses the singleton StateManager.
   - This is the execution planning and trade-recording area where size,
     side, broker, symbol, fees, exits, and TRAI attribution can diverge.

4. `core/StateManager.js`
   - `core/StateManager.js:20-25` lists core state invariants: USD position and
     balance semantics, total balance equation, and atomic updates.
   - `core/StateManager.js:36-44` shows immutable trade scope fields expected
     when opening a position.

5. `brokers/BrokerFactory.js`
   - `brokers/BrokerFactory.js:25-63` is the broker adapter creation boundary.
   - Do not assume broker APIs or symbol formats are equivalent across adapters.

6. `core/TtpCutoffEnforcer.js`
   - `core/TtpCutoffEnforcer.js:36-74` is the current cutoff enforcement
     decision path for TTP stock liquidation windows and missed-cutoff recovery.
   - Treat broker flatness, symbol scope, and manual reconciliation as safety
     boundaries.

Common bug classes:

- SELL/COVER state mutates active entries instead of closing a position.
- Same-direction positions stack without a current spec allowing it.
- Size semantics switch between USD notional and asset quantity.
- Public proof output disagrees with raw journal partial/full close semantics.
- Config exists without a live reader or consumer.
- Backtest path diverges from live trading path.
- Learned state, journals, or pattern memory are mode-only instead of
  asset/symbol/timeframe aware.
- Broker-specific symbol or position semantics are treated as generic.
- Risk, TTP, cutoff, or kill-switch gates warn only instead of failing closed.

Proof hints:

- Prove target path, asset class, symbol, broker, execution mode, timeframe, and
  persistence destination before claiming behavior is correct.
- A green test or gate is not enough if it ran on the wrong symbol, broker,
  mode, or data source.
- For hot-path code changes, adversarial Mercury proof is blocking before
  commit.
