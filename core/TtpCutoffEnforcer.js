'use strict';

class TtpCutoffEnforcer {
  constructor({
    evalRuleEngine,
    stateManager,
    orderRouter,
    executeTrade,
    getExitPrice,
    assetClass,
    symbols = [],
    now = () => Date.now(),
    logger = console,
  } = {}) {
    this.evalRuleEngine = evalRuleEngine;
    this.stateManager = stateManager;
    this.orderRouter = orderRouter;
    this.executeTrade = executeTrade;
    this.getExitPrice = getExitPrice;
    this.assetClass = assetClass;
    this.symbols = this._buildSymbolScope(symbols);
    this.now = now;
    this.logger = logger;
    this.completedKeys = new Set();
    this.inFlight = false;
  }

  async enforce() {
    if (!this.evalRuleEngine || typeof this.evalRuleEngine.getTtpMarketTimeState !== 'function') {
      return { enforced: false, reason: 'missing_eval_rule_engine' };
    }

    const state = this.evalRuleEngine.getTtpMarketTimeState(new Date(this.now()));
    if (state.enabled !== true || state.liquidationEnabled !== true || state.inLiquidationWindow !== true) {
      return { enforced: false, state };
    }
    if (!this._isTtpStockAssetClass(this.assetClass)) {
      return { enforced: false, reason: 'non_ttp_asset_class', state };
    }

    const key = `${state.currentDateET}:${state.cutoffMinute}`;
    if (this.completedKeys.has(key)) {
      return { enforced: true, alreadyCompleted: true, state };
    }
    if (this.inFlight) {
      return { enforced: true, alreadyInFlight: true, state };
    }

    this.inFlight = true;
    try {
      const cancelResult = await this._cancelOpenOrders();
      if (cancelResult && cancelResult.success === false) {
        throw new Error(`[TTP_MARKET_TIME] pending-order cancellation failed: ${JSON.stringify(cancelResult.results)}`);
      }

      const brokerPositions = await this._getBrokerPositions();
      const targetBrokerPositions = this._ttpBrokerPositions(brokerPositions);
      const activeTrades = this._activeTrades();
      const failures = [];
      const closed = [];
      const activeTradeSymbols = new Set();

      for (const trade of activeTrades) {
        if (!this._isTtpStockTrade(trade)) continue;
        const tradeId = trade.orderId || trade.id;
        const symbol = trade.symbol;
        const normalizedSymbol = this._normalizeSymbol(symbol);
        activeTradeSymbols.add(normalizedSymbol);
        if (!this._isTargetSymbol(normalizedSymbol)) {
          failures.push({ tradeId, symbol, reason: 'symbol_not_in_ttp_cutoff_scope' });
          continue;
        }

        const brokerPosition = this._findBrokerPosition(targetBrokerPositions, normalizedSymbol);
        if (!brokerPosition) {
          failures.push({ tradeId, symbol, reason: 'state_trade_open_without_broker_position' });
          continue;
        }

        const price = Number(this.getExitPrice?.(symbol, trade, targetBrokerPositions));
        if (!Number.isFinite(price) || price <= 0) {
          failures.push({ tradeId, symbol, reason: 'missing_exit_price' });
          continue;
        }

        const action = trade.action === 'SELL_SHORT' || trade.direction === 'short' ? 'COVER' : 'SELL';
        await this.executeTrade(
          { action, confidence: 100, tradeId, exitReason: 'ttp_1550_liquidation' },
          { totalConfidence: 100 },
          price,
          {},
          [],
          null,
          null,
          symbol
        );

        const stillOpen = this._activeTradeMap()?.has(tradeId);
        if (stillOpen) {
          failures.push({ tradeId, symbol, reason: 'state_trade_still_open_after_liquidation' });
        } else {
          closed.push({ tradeId, symbol, action, price });
        }
      }

      const refreshedPositions = await this._getBrokerPositions();
      const brokerOrphans = this._ttpBrokerPositions(refreshedPositions)
        .filter(position => !activeTradeSymbols.has(this._normalizeSymbol(position.symbol)));
      const orphanClosed = [];
      for (const position of brokerOrphans) {
        try {
          const closeResult = await this._closeBrokerPosition(position);
          orphanClosed.push(closeResult);
        } catch (error) {
          failures.push({
            symbol: position.symbol,
            broker: position.broker,
            reason: 'broker_orphan_close_failed',
            error: error.message,
          });
        }
      }

      const finalPositions = this._ttpBrokerPositions(await this._getBrokerPositions());
      if (finalPositions.length > 0) {
        failures.push({
          reason: 'broker_positions_still_open_after_cutoff',
          positions: finalPositions.map(position => ({
            broker: position.broker,
            symbol: position.symbol,
            side: position.side,
            size: position.size,
          })),
        });
      }

      if (failures.length > 0) {
        throw new Error(`[TTP_MARKET_TIME] liquidation incomplete: ${JSON.stringify(failures)}`);
      }

      this.completedKeys.add(key);
      this.logger.log(`[TTP_MARKET_TIME] cutoff enforcement complete date=${state.currentDateET} closed=${closed.length} orphanClosed=${orphanClosed.length} cancelled=${cancelResult?.cancelled || 0}`);
      return { enforced: true, state, cancelResult, closed, orphanClosed };
    } finally {
      this.inFlight = false;
    }
  }

  _activeTradeMap() {
    const trades = this.stateManager?.get?.('activeTrades');
    return trades instanceof Map ? trades : null;
  }

  _activeTrades() {
    const trades = this._activeTradeMap();
    return trades ? Array.from(trades.values()) : [];
  }

  _isTtpStockTrade(trade) {
    const assetClass = String(trade?.assetClass || this.assetClass || '').trim().toLowerCase();
    return this._isTtpStockAssetClass(assetClass);
  }

  async _cancelOpenOrders() {
    if (!this.orderRouter || typeof this.orderRouter.cancelAllOpenOrders !== 'function') {
      return { success: true, skipped: true, reason: 'missing_cancel_api', cancelled: 0, failed: 0, results: [] };
    }
    return this.orderRouter.cancelAllOpenOrders({ symbols: this.symbols });
  }

  async _getBrokerPositions() {
    if (!this.orderRouter || typeof this.orderRouter.getAllPositions !== 'function') {
      return [];
    }
    return this.orderRouter.getAllPositions({ symbols: this.symbols, strict: true });
  }

  async _closeBrokerPosition(position) {
    if (!this.orderRouter || typeof this.orderRouter.sendOrder !== 'function') {
      throw new Error('missing_send_order_api');
    }

    const size = Math.abs(Number(position.size));
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`invalid_broker_position_size:${position.size}`);
    }

    const side = position.side === 'short' ? 'buy' : 'sell';
    const result = await this.orderRouter.sendOrder({
      symbol: position.symbol,
      side,
      amount: size,
      type: 'market',
      options: {
        quantityUnit: 'shares',
        exitReason: 'ttp_1550_broker_reconciliation',
      },
    });

    return {
      broker: position.broker,
      symbol: position.symbol,
      side,
      amount: size,
      orderId: result?.orderId || result?.id || null,
    };
  }

  _ttpBrokerPositions(positions) {
    if (!Array.isArray(positions)) return [];
    return positions.filter(position => {
      const size = Math.abs(Number(position?.size));
      return Number.isFinite(size)
        && size > 0
        && this._isTargetSymbol(position?.symbol);
    });
  }

  _findBrokerPosition(positions, symbol) {
    const normalized = this._normalizeSymbol(symbol);
    return Array.isArray(positions)
      ? positions.find(position => this._normalizeSymbol(position.symbol) === normalized)
      : null;
  }

  _isTargetSymbol(symbol) {
    const normalized = this._normalizeSymbol(symbol);
    if (!normalized) return false;
    if (this.symbols.length === 0) return !normalized.includes('-');
    return this.symbols.includes(normalized);
  }

  _isTtpStockAssetClass(assetClass) {
    const normalized = String(assetClass || '').trim().toLowerCase();
    return ['stocks', 'stock', 'equities', 'equity', 'etfs', 'etf'].includes(normalized);
  }

  _buildSymbolScope(symbols) {
    if (!Array.isArray(symbols)) return [];

    const scope = new Set();
    for (const symbol of symbols) {
      const normalized = this._normalizeSymbol(symbol);
      if (normalized) scope.add(normalized);

      if (this._isTtpStockAssetClass(this.assetClass)) {
        const stockSymbol = this._normalizeStockSymbol(symbol);
        if (stockSymbol) scope.add(stockSymbol);
      }
    }
    return Array.from(scope);
  }

  _normalizeStockSymbol(symbol) {
    if (typeof symbol !== 'string' || !symbol.trim()) return null;
    let normalized = symbol.trim().toUpperCase();
    if (normalized.includes('/')) {
      normalized = normalized.split('/')[0];
    }
    if (normalized.endsWith('-USD')) {
      normalized = normalized.slice(0, -4);
    }
    return normalized || null;
  }

  _normalizeSymbol(symbol) {
    if (typeof symbol !== 'string' || !symbol.trim()) return null;
    let normalized = symbol.trim().toUpperCase().replace('XBT', 'BTC');
    if (normalized.includes('/')) normalized = normalized.replace('/', '-');
    if (!normalized.includes('-') && normalized.endsWith('USD') && normalized.length === 6) {
      normalized = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
    }
    return normalized;
  }
}

module.exports = TtpCutoffEnforcer;
