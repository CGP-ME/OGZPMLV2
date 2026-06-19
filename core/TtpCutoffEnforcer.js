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
    getSymbols,
    brokerNames = [],
    brokerReconciliationEnabled = true,
    now = () => Date.now(),
    logger = console,
  } = {}) {
    this.evalRuleEngine = evalRuleEngine;
    this.stateManager = stateManager;
    this.orderRouter = orderRouter;
    this.executeTrade = executeTrade;
    this.getExitPrice = getExitPrice;
    this.assetClass = assetClass;
    this.baseSymbols = Array.isArray(symbols) ? symbols.slice() : [];
    this.getSymbols = typeof getSymbols === 'function' ? getSymbols : null;
    this.brokerNames = this._normalizeBrokerNames(brokerNames);
    this.brokerReconciliationEnabled = brokerReconciliationEnabled === true;
    this.symbols = this._buildSymbolScope(this.baseSymbols);
    this.now = now;
    this.logger = logger;
    this.completedKeys = new Set();
    this.unverifiedKeys = new Set();
    this.inFlight = false;
  }

  async enforce() {
    if (!this.evalRuleEngine || typeof this.evalRuleEngine.getTtpMarketTimeState !== 'function') {
      return { enforced: false, reason: 'missing_eval_rule_engine' };
    }

    const state = this.evalRuleEngine.getTtpMarketTimeState(new Date(this.now()));
    if (state.enabled !== true || state.liquidationEnabled !== true) {
      return { enforced: false, state };
    }
    if (!this._isTtpStockAssetClass(this.assetClass)) {
      return { enforced: false, reason: 'non_ttp_asset_class', state };
    }

    const key = `${state.currentDateET}:${state.cutoffMinute}`;
    const alreadyCompleted = this.completedKeys.has(key);
    const alreadyUnverified = this.unverifiedKeys.has(key);
    const symbolScope = this._currentSymbolScope();
    const brokerPositionReadAvailable = this._brokerPositionReadAvailable();
    const targetAllBrokerStocks = brokerPositionReadAvailable && this.brokerNames.length > 0;
    const activeTrades = this._activeTrades();
    const hasTrackedTtpStockTrades = activeTrades.some(trade => this._isTtpStockTrade(trade));
    let initialBrokerPositions = [];
    if (brokerPositionReadAvailable && state.blocksNewEntries === true) {
      initialBrokerPositions = await this._getBrokerPositions(symbolScope);
    }
    const targetBrokerPositionsForDecision = brokerPositionReadAvailable
      ? this._ttpBrokerPositions(initialBrokerPositions, symbolScope, targetAllBrokerStocks)
      : [];
    const pastCutoffClock = Number.isFinite(state.currentMinuteET)
      && Number.isFinite(state.cutoffMinute)
      && state.currentMinuteET >= state.cutoffMinute;
    const closedSessionRecovery = ['ah', 'closed', 'holiday'].includes(String(state.phase || '').toLowerCase());
    const missedCutoffRecovery = state.inLiquidationWindow !== true
      && state.blocksNewEntries === true
      && (
        hasTrackedTtpStockTrades
        || targetBrokerPositionsForDecision.length > 0
        || ((pastCutoffClock || closedSessionRecovery) && !alreadyCompleted && !alreadyUnverified)
      );

    if (alreadyUnverified && !hasTrackedTtpStockTrades && targetBrokerPositionsForDecision.length === 0) {
      return {
        enforced: false,
        alreadyUnverified: true,
        requiresManualReconciliation: true,
        brokerFlatVerified: false,
        state,
      };
    }
    if (state.inLiquidationWindow !== true && missedCutoffRecovery !== true) {
      return { enforced: false, state };
    }
    if (this.inFlight) {
      return { enforced: true, alreadyInFlight: true, state };
    }

    this.inFlight = true;
    try {
      const cancelResult = await this._cancelOpenOrders(symbolScope);
      if (cancelResult && cancelResult.success === false) {
        throw new Error(`[TTP_MARKET_TIME] pending-order cancellation failed: ${JSON.stringify(cancelResult.results)}`);
      }

      const brokerPositions = brokerPositionReadAvailable
        ? (initialBrokerPositions.length > 0 ? initialBrokerPositions : await this._getBrokerPositions(symbolScope))
        : [];
      const targetBrokerPositions = this._ttpBrokerPositions(brokerPositions, symbolScope, targetAllBrokerStocks);
      const failures = [];
      const closed = [];
      const activeTradeSymbols = new Set();

      for (const trade of activeTrades) {
        if (!this._isTtpStockTrade(trade)) continue;
        const tradeId = trade.orderId || trade.id;
        const symbol = trade.symbol;
        const normalizedSymbol = this._normalizeSymbol(symbol);
        activeTradeSymbols.add(normalizedSymbol);
        if (!targetAllBrokerStocks && !this._isTargetSymbol(normalizedSymbol, symbolScope)) {
          failures.push({ tradeId, symbol, reason: 'symbol_not_in_ttp_cutoff_scope' });
          continue;
        }

        const brokerPosition = this._findBrokerPosition(targetBrokerPositions, normalizedSymbol);
        if (brokerPositionReadAvailable && !brokerPosition) {
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

      const refreshedPositions = brokerPositionReadAvailable
        ? await this._getBrokerPositions(symbolScope)
        : [];
      const brokerOrphans = brokerPositionReadAvailable
        ? this._ttpBrokerPositions(refreshedPositions, symbolScope, targetAllBrokerStocks)
          .filter(position => !activeTradeSymbols.has(this._normalizeSymbol(position.symbol)))
        : [];
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

      const finalPositions = brokerPositionReadAvailable
        ? this._ttpBrokerPositions(await this._getBrokerPositions(symbolScope), symbolScope, targetAllBrokerStocks)
        : [];
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

      const brokerFlatVerified = brokerPositionReadAvailable;
      if (!brokerFlatVerified) {
        await this._pauseForUnverifiedBrokerFlatness(state, closed, orphanClosed);
        this.unverifiedKeys.add(key);
        this.completedKeys.delete(key);
        const warn = typeof this.logger.warn === 'function' ? this.logger.warn.bind(this.logger) : this.logger.log.bind(this.logger);
        warn(`[TTP_MARKET_TIME] cutoff enforcement pending manual reconciliation date=${state.currentDateET} closed=${closed.length} orphanClosed=${orphanClosed.length} brokerFlatVerified=false`);
        return {
          enforced: true,
          alreadyCompleted,
          state,
          cancelResult,
          closed,
          orphanClosed,
          brokerFlatVerified,
          requiresManualReconciliation: true,
        };
      }

      this.unverifiedKeys.delete(key);
      this.completedKeys.add(key);
      this.logger.log(`[TTP_MARKET_TIME] cutoff enforcement complete date=${state.currentDateET} closed=${closed.length} orphanClosed=${orphanClosed.length} cancelled=${cancelResult?.cancelled || 0} brokerFlatVerified=${brokerFlatVerified}`);
      return { enforced: true, alreadyCompleted, state, cancelResult, closed, orphanClosed, brokerFlatVerified };
    } finally {
      this.inFlight = false;
    }
  }

  _activeTradeMap() {
    const trades = this.stateManager?.get?.('activeTrades');
    if (!trades) return new Map();
    if (trades instanceof Map) return trades;
    if (Array.isArray(trades)) return new Map(trades);
    throw new Error(`[TTP_MARKET_TIME] activeTrades container invariant failed: expected Map/array, got ${Object.prototype.toString.call(trades)}`);
  }

  _activeTrades() {
    const trades = this._activeTradeMap();
    return Array.from(trades.values());
  }

  _isTtpStockTrade(trade) {
    const assetClass = String(trade?.assetClass || this.assetClass || '').trim().toLowerCase();
    return this._isTtpStockAssetClass(assetClass);
  }

  async _cancelOpenOrders(symbolScope) {
    if (!this.brokerReconciliationEnabled) {
      return { success: true, skipped: true, reason: 'broker_reconciliation_disabled', cancelled: 0, failed: 0, results: [] };
    }
    if (!this.orderRouter || typeof this.orderRouter.cancelAllOpenOrders !== 'function') {
      return { success: true, skipped: true, reason: 'missing_cancel_api', cancelled: 0, failed: 0, results: [] };
    }
    return this.orderRouter.cancelAllOpenOrders(this._routerScope(symbolScope));
  }

  _brokerPositionReadAvailable() {
    return this.brokerReconciliationEnabled
      && this.orderRouter
      && typeof this.orderRouter.getAllPositions === 'function';
  }

  async _getBrokerPositions(symbolScope) {
    if (!this.orderRouter || typeof this.orderRouter.getAllPositions !== 'function') {
      return [];
    }
    return this.orderRouter.getAllPositions({ ...this._routerScope(symbolScope), strict: true });
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

  async _pauseForUnverifiedBrokerFlatness(state, closed, orphanClosed) {
    if (!this.stateManager || typeof this.stateManager.pauseTrading !== 'function') {
      throw new Error('[TTP_MARKET_TIME] broker flatness unverified and StateManager.pauseTrading unavailable');
    }

    const reason = `[TTP_MARKET_TIME] broker flatness unverified after cutoff date=${state.currentDateET}; manual account reconciliation required before entries resume`;
    await this.stateManager.pauseTrading(reason, {
      source: 'ttp_cutoff_unverified_broker_flatness',
      recoverable: false,
      scope: {
        symbol: null,
        timeframe: null,
        brokerId: null,
        accountId: null,
        assetClass: this.assetClass || null,
        executionMode: null,
      },
      closed,
      orphanClosed,
    });

    if (typeof this.stateManager.getState === 'function') {
      const stateSnapshot = this.stateManager.getState();
      if (stateSnapshot?.isTrading !== false) {
        throw new Error('[TTP_MARKET_TIME] broker flatness unverified and pauseTrading did not confirm entries paused');
      }
    }
  }

  _ttpBrokerPositions(positions, symbolScope = this._currentSymbolScope(), targetAllBrokerStocks = this.brokerNames.length > 0) {
    if (!Array.isArray(positions)) return [];
    return positions.filter(position => {
      const size = Math.abs(Number(position?.size));
      return Number.isFinite(size)
        && size > 0
        && (targetAllBrokerStocks || this._isTargetSymbol(position?.symbol, symbolScope));
    });
  }

  _findBrokerPosition(positions, symbol) {
    const normalized = this._normalizeSymbol(symbol);
    return Array.isArray(positions)
      ? positions.find(position => this._normalizeSymbol(position.symbol) === normalized)
      : null;
  }

  _isTargetSymbol(symbol, symbolScope = this._currentSymbolScope()) {
    const normalized = this._normalizeSymbol(symbol);
    if (!normalized) return false;
    if (symbolScope.length === 0) return !normalized.includes('-');
    return symbolScope.includes(normalized);
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

  _currentSymbolScope() {
    const dynamicSymbols = this.getSymbols ? this.getSymbols() : [];
    const merged = [
      ...this.baseSymbols,
      ...(Array.isArray(dynamicSymbols) ? dynamicSymbols : []),
    ];
    return this._buildSymbolScope(merged);
  }

  _normalizeBrokerNames(brokerNames) {
    if (!Array.isArray(brokerNames)) return [];
    return [...new Set(brokerNames
      .map(name => String(name || '').trim().toLowerCase())
      .filter(Boolean))];
  }

  _routerScope(symbolScope = this._currentSymbolScope()) {
    if (this.brokerNames.length > 0) {
      return { brokerNames: this.brokerNames };
    }
    return { symbols: symbolScope };
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
