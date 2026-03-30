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
    const qty = opts.qty || 1;
    this.pendingEntry = { id, direction, qty };
  }

  exit(id, fromId, opts = {}) {
    const stop = opts.stop;
    const limit = opts.limit;
    this.pendingExit = { id, fromId, stop, limit };
  }

  close(id, opts = {}) {
    this.pendingClose = { id };
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

  get closedtrades() {
    return {
      profit: (idx) => this.closedTrades[idx]?.profit ?? 0,
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
