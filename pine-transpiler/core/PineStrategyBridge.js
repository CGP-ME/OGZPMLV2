// core/PineStrategyBridge.js
class PineStrategyBridge {
  constructor() {
    this.positionSize = 0;
    this.positionAvgPrice = null;
    this._equity = 10000; // default - can be overridden by the orchestrator
    this.closedTrades = []; // {profit: number}
    this.pendingEntry = null;
    this.pendingExit = null;
    this.pendingClose = null;
  }

  // -----------------------------------------------------------------
  // API used by the transpiled script
  // -----------------------------------------------------------------
  entry(id, direction, opts = {}) {
    // direction is either strategy.long (1) or strategy.short (-1)
    // TradingView behavior:
    //   Already long + long entry = ignore
    //   Already long + short entry = flip (close long, open short)
    //   Already short + short entry = ignore
    //   Already short + long entry = flip (close short, open long)
    //   Flat + any entry = open position

    if (this.positionSize > 0 && direction === 1) return;  // Already long, ignore
    if (this.positionSize < 0 && direction === -1) return; // Already short, ignore

    const qty = opts.qty || 1;
    // stop/oca fields ride along so strategy.cancel() can target the order.
    // Stop-entry fill simulation (order waits until price crosses stop) is
    // output-parity phase work - entries still flush as market entries.
    this.pendingEntry = {
      id,
      direction,
      qty,
      stop: opts.stop,
      ocaName: opts.oca_name,
      ocaType: opts.oca_type,
    };
  }

  exit(id, fromId, opts = {}) {
    const stop = opts.stop;
    const limit = opts.limit;
    this.pendingExit = { id, fromId, stop, limit };
  }

  close(id, opts = {}) {
    this.pendingClose = { id };
    // Go flat immediately (TradingView behavior)
    this.positionSize = 0;
    this.positionAvgPrice = null;
  }

  close_all(opts = {}) {
    // TV: market-closes the whole position regardless of entry id.
    this.pendingClose = { id: null };
    this.positionSize = 0;
    this.positionAvgPrice = null;
  }

  cancel(id) {
    // TV: cancels pending (unfilled) orders by id. In this bridge an entry
    // that has not been flushed yet is exactly an unfilled order.
    if (this.pendingEntry && this.pendingEntry.id === id) {
      this.pendingEntry = null;
    }
  }

  // -----------------------------------------------------------------
  // Runtime helpers (read-only) - Pine script property access
  // -----------------------------------------------------------------
  get position_size() {
    return this.positionSize;
  }

  get position_avg_price() {
    return this.positionAvgPrice;
  }

  get equity() {
    return this._equity;
  }

  get long() {
    return 1;
  }

  get short() {
    return -1;
  }

  // TV constants: the full qty-type trio and the strategy.oca.*
  // one-cancels-all group constants - verbatim TV reference values.
  get cash() {
    return 'cash';
  }

  get percent_of_equity() {
    return 'percent_of_equity';
  }

  get fixed() {
    return 'fixed';
  }

  get oca() {
    return { cancel: 'cancel', none: 'none', reduce: 'reduce' };
  }

  get closedtrades() {
    return {
      profit: (idx) => this.closedTrades[idx]?.profit ?? null,
      length: this.closedTrades.length,
    };
  }

  // -----------------------------------------------------------------
  // Called by the orchestrator after each candle to convert pending
  // actions into a concrete signal object.
  // -----------------------------------------------------------------
  flushSignal() {
    const signal = {
      direction: null,
      confidence: 0.75,
      overrideLevels: {},
      sizingMultiplier: 1,
      reason: '',
    };

    // ENTRY
    if (this.pendingEntry) {
      const { direction, qty } = this.pendingEntry;
      signal.direction = direction === 1 ? 'buy' : 'sell';
      signal.sizingMultiplier = qty; // qty is already a % of equity in the original script
      signal.reason = `Pine ${signal.direction === 'buy' ? 'Long' : 'Short'} entry`;
      signal.confidence = 0.75;

      // Update position state (TradingView behavior)
      // Opposite direction entry = flip position
      this.positionSize = direction; // 1 for long, -1 for short
    }

    // EXIT / CLOSE - we expose stopLoss / takeProfit via overrideLevels
    if (this.pendingExit) {
      const { stop, limit } = this.pendingExit;
      if (stop !== undefined) signal.overrideLevels.stopLoss = stop;
      if (limit !== undefined) signal.overrideLevels.takeProfit = limit;
    }
    if (this.pendingClose && !this.pendingEntry) {
      // closing a position is equivalent to a market exit - but entry takes priority
      signal.direction = null;
    }

    // reset pending actions for next candle
    this.pendingEntry = null;
    this.pendingExit = null;
    this.pendingClose = null;

    return signal;
  }

  // -----------------------------------------------------------------
  // Helper used by the orchestrator to update equity / position after a trade
  // -----------------------------------------------------------------
  updatePosition({ size, avgPrice, equity, closedTrade }) {
    this.positionSize = size;
    this.positionAvgPrice = avgPrice;
    this._equity = equity;
    if (closedTrade) this.closedTrades.push({ profit: closedTrade.profit });
  }
}

module.exports = PineStrategyBridge;
