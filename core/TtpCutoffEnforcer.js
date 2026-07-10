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
    brokerPositionReadEnabled = brokerReconciliationEnabled,
    brokerOrderManagementEnabled = brokerReconciliationEnabled,
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
    this.brokerPositionReadEnabled = brokerPositionReadEnabled === true;
    this.brokerOrderManagementEnabled = brokerOrderManagementEnabled === true;
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
    const hasOvernightTtpStockTrades = activeTrades.some(trade => (
      this._isTtpStockTrade(trade) && this._tradeOpenedBeforeEtDate(trade, state.currentDateET)
    ));
    let initialBrokerPositions = [];
    const premarketRecoveryCheck = String(state.phase || '').toLowerCase() === 'pre';
    if (brokerPositionReadAvailable && (state.blocksNewEntries === true || premarketRecoveryCheck)) {
      initialBrokerPositions = await this._getBrokerPositions(symbolScope);
    }
    const targetBrokerPositionsForDecision = brokerPositionReadAvailable
      ? this._ttpBrokerPositions(initialBrokerPositions, symbolScope, targetAllBrokerStocks)
      : [];
    const pastCutoffClock = Number.isFinite(state.currentMinuteET)
      && Number.isFinite(state.cutoffMinute)
      && state.currentMinuteET >= state.cutoffMinute;
    const closedSessionRecovery = ['ah', 'closed', 'holiday'].includes(String(state.phase || '').toLowerCase());
    const premarketOvernightRecovery = premarketRecoveryCheck && (
      hasOvernightTtpStockTrades
      || (targetBrokerPositionsForDecision.length > 0 && !hasTrackedTtpStockTrades)
    );
    const missedCutoffRecovery = state.inLiquidationWindow !== true
      && (state.blocksNewEntries === true || premarketOvernightRecovery)
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
      const premarketTrackedStaleRecovery = premarketRecoveryCheck
        && state.blocksNewEntries !== true
        && state.inLiquidationWindow !== true;
      const expectedBrokerPositions = this._expectedBrokerPositions(activeTrades, symbolScope, state, {
        premarketTrackedStaleRecovery,
        targetAllBrokerStocks,
      });

      for (const trade of activeTrades) {
        if (!this._isTtpStockTrade(trade)) continue;
        if (premarketTrackedStaleRecovery && !this._tradeOpenedBeforeEtDate(trade, state.currentDateET)) {
          continue;
        }
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
        if (brokerPositionReadAvailable) {
          const quantityMismatch = this._brokerPositionQuantityMismatch(brokerPosition, normalizedSymbol, expectedBrokerPositions);
          if (quantityMismatch) {
            failures.push({ tradeId, symbol, reason: 'broker_position_quantity_mismatch', ...quantityMismatch });
            continue;
          }
        }

        const action = this._exitActionForTrade(trade);
        if (!action) {
          failures.push({ tradeId, symbol, reason: 'active_trade_direction_unknown_for_cutoff' });
          continue;
        }

        const price = Number(this.getExitPrice?.(symbol, trade, targetBrokerPositions));
        if (!Number.isFinite(price) || price <= 0) {
          failures.push({ tradeId, symbol, reason: 'missing_exit_price' });
          continue;
        }

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
        if (brokerPositionReadAvailable && !this.brokerOrderManagementEnabled) {
          const quarantine = await this._quarantineUnverifiedBrokerFlatness(state, closed, orphanClosed, cancelResult, failures);
          this.unverifiedKeys.add(key);
          this.completedKeys.delete(key);
          return {
            enforced: true,
            alreadyCompleted,
            state,
            cancelResult,
            closed,
            orphanClosed,
            brokerFlatVerified: false,
            requiresManualReconciliation: true,
            failures,
            quarantine,
          };
        }
        throw new Error(`[TTP_MARKET_TIME] liquidation incomplete: ${JSON.stringify(failures)}`);
      }

      const brokerFlatVerified = brokerPositionReadAvailable;
      if (!brokerFlatVerified) {
        const quarantine = await this._quarantineUnverifiedBrokerFlatness(state, closed, orphanClosed, cancelResult);
        this.unverifiedKeys.add(key);
        this.completedKeys.delete(key);
        return {
          enforced: true,
          alreadyCompleted,
          state,
          cancelResult,
          closed,
          orphanClosed,
          brokerFlatVerified,
          requiresManualReconciliation: true,
          quarantine,
        };
      }

      this.unverifiedKeys.delete(key);
      this.completedKeys.add(key);
      await this._clearVerifiedBrokerFlatnessQuarantine(state, closed, orphanClosed, cancelResult);
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

  _expectedBrokerPositions(activeTrades, symbolScope, state, options = {}) {
    const expected = new Map();
    if (!Array.isArray(activeTrades)) return expected;
    const {
      premarketTrackedStaleRecovery = false,
      targetAllBrokerStocks = false,
    } = options;

    for (const trade of activeTrades) {
      if (!this._isTtpStockTrade(trade)) continue;
      if (premarketTrackedStaleRecovery && !this._tradeOpenedBeforeEtDate(trade, state.currentDateET)) {
        continue;
      }
      const symbol = trade?.symbol;
      const normalizedSymbol = this._normalizeSymbol(symbol);
      if (!normalizedSymbol) continue;
      if (!targetAllBrokerStocks && !this._isTargetSymbol(normalizedSymbol, symbolScope)) {
        continue;
      }
      const quantity = this._remainingBrokerQuantity(trade);
      const side = this._entrySideForTrade(trade);
      const existing = expected.get(normalizedSymbol);
      const nextQuantity = quantity === null || existing?.quantity === null
        ? null
        : (existing?.quantity || 0) + quantity;
      expected.set(normalizedSymbol, {
        quantity: nextQuantity,
        side: existing?.side && side && existing.side !== side ? 'mixed' : (existing?.side || side),
      });
    }

    return expected;
  }

  _entrySideForTrade(trade) {
    const direction = String(trade?.direction || '').trim().toLowerCase();
    if (direction === 'long' || direction === 'short') return direction;
    const action = String(trade?.action || trade?.type || '').trim().toUpperCase();
    if (action === 'BUY') return 'long';
    if (action === 'SELL_SHORT') return 'short';
    return null;
  }

  _remainingBrokerQuantity(trade) {
    const unit = String(trade?.remainingOrderQuantityUnit || trade?.entryOrderQuantityUnit || '').trim().toLowerCase();
    if (unit && !['share', 'shares'].includes(unit)) {
      return null;
    }
    const quantity = Number(
      trade?.remainingOrderQuantity
      ?? trade?.entryOrderQuantity
      ?? trade?.orderQuantity
      ?? trade?.quantity
    );
    if (!Number.isFinite(quantity) || quantity < 0) {
      return null;
    }
    return Math.abs(quantity);
  }

  _brokerPositionQuantityMismatch(position, symbol, expectedPositions) {
    if (!(expectedPositions instanceof Map)) return null;
    const normalizedSymbol = this._normalizeSymbol(symbol);
    if (!normalizedSymbol || !expectedPositions.has(normalizedSymbol)) return null;

    const expectedPosition = expectedPositions.get(normalizedSymbol);
    const expectedQuantity = expectedPosition?.quantity;
    const brokerQuantity = Math.abs(Number(position?.size));
    if (!Number.isFinite(brokerQuantity) || brokerQuantity <= 0) {
      return {
        brokerPositionSize: position?.size,
        expectedRemainingQuantity: expectedQuantity,
      };
    }
    if (!Number.isFinite(expectedQuantity) || expectedQuantity < 0) {
      return {
        brokerPositionSize: brokerQuantity,
        expectedRemainingQuantity: expectedQuantity,
        expectedQuantityKnown: false,
      };
    }
    const expectedSide = expectedPosition?.side || null;
    const brokerSide = this._brokerSideForPosition(position);
    if (expectedSide && brokerSide && expectedSide !== brokerSide) {
      return {
        brokerPositionSize: brokerQuantity,
        expectedRemainingQuantity: expectedQuantity,
        brokerPositionSide: brokerSide,
        expectedPositionSide: expectedSide,
      };
    }

    if (brokerQuantity === expectedQuantity) {
      return null;
    }

    return {
      brokerPositionSize: brokerQuantity,
      expectedRemainingQuantity: expectedQuantity,
    };
  }

  _brokerSideForPosition(position) {
    const side = String(position?.side || '').trim().toLowerCase();
    if (['long', 'buy', 'bought'].includes(side)) return 'long';
    if (['short', 'sell', 'sold'].includes(side)) return 'short';
    const signedSize = Number(position?.size);
    if (Number.isFinite(signedSize)) {
      if (signedSize > 0) return 'long';
      if (signedSize < 0) return 'short';
    }
    return null;
  }

  _tradeOpenedBeforeEtDate(trade, currentDateET) {
    const openedAt = Number.isFinite(trade?.entryTime) && trade.entryTime > 0
      ? trade.entryTime
      : (Number.isFinite(trade?.timestamp) && trade.timestamp > 0 ? trade.timestamp : null);
    if (!openedAt || !currentDateET) {
      return true;
    }
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(openedAt));
    const get = (type) => (parts.find(part => part.type === type) || {}).value;
    const openedDateET = `${get('year')}-${get('month')}-${get('day')}`;
    return openedDateET < currentDateET;
  }

  _exitActionForTrade(trade) {
    const direction = String(trade?.direction || '').trim().toLowerCase();
    const action = String(trade?.action || '').trim().toUpperCase();
    const directionSide = direction === 'long' || direction === 'short' ? direction : null;
    const actionSide = action === 'BUY'
      ? 'long'
      : (action === 'SELL_SHORT' ? 'short' : null);
    if (directionSide && actionSide && directionSide !== actionSide) {
      return null;
    }
    const side = directionSide || actionSide;
    if (side === 'long') return 'SELL';
    if (side === 'short') return 'COVER';
    return null;
  }

  async _cancelOpenOrders(symbolScope) {
    if (!this.brokerOrderManagementEnabled) {
      const reason = this.brokerPositionReadEnabled
        ? 'broker_order_management_disabled'
        : 'broker_reconciliation_disabled';
      return { success: true, skipped: true, reason, cancelled: 0, failed: 0, results: [] };
    }
    if (!this.orderRouter || typeof this.orderRouter.cancelAllOpenOrders !== 'function') {
      return { success: true, skipped: true, reason: 'missing_cancel_api', cancelled: 0, failed: 0, results: [] };
    }
    return this.orderRouter.cancelAllOpenOrders(this._routerScope(symbolScope));
  }

  _brokerPositionReadAvailable() {
    return this.brokerPositionReadEnabled
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
    if (!this.brokerOrderManagementEnabled) {
      throw new Error('broker_order_management_disabled');
    }
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

  _affectedSymbolsForQuarantine(closed = [], orphanClosed = [], failures = []) {
    const symbols = new Set();
    const addSymbol = (value) => {
      const normalized = this._normalizeSymbol(value);
      if (normalized) symbols.add(normalized);
    };
    for (const entry of Array.isArray(closed) ? closed : []) {
      addSymbol(entry?.symbol);
    }
    for (const entry of Array.isArray(orphanClosed) ? orphanClosed : []) {
      addSymbol(entry?.symbol);
    }
    for (const failure of Array.isArray(failures) ? failures : []) {
      addSymbol(failure?.symbol);
      for (const position of Array.isArray(failure?.positions) ? failure.positions : []) {
        addSymbol(position?.symbol);
      }
    }
    if (symbols.size === 0) {
      for (const symbol of this._currentSymbolScope()) {
        addSymbol(symbol);
      }
    }
    return Array.from(symbols);
  }

  async _quarantineUnverifiedBrokerFlatness(state, closed, orphanClosed, cancelResult, failures = []) {
    if (!this.stateManager || typeof this.stateManager.updateState !== 'function') {
      throw new Error('[TTP_MARKET_TIME] broker flatness unverified and StateManager.updateState unavailable for quarantine record');
    }

    const createdAt = new Date(this.now()).toISOString();
    const reason = `[TTP_MARKET_TIME] broker flatness unverified after cutoff date=${state.currentDateET}; cutoff reconciliation quarantined; entries blocked for affected symbols until manual reconciliation`;
    const affectedSymbols = this._affectedSymbolsForQuarantine(closed, orphanClosed, failures);
    const quarantine = {
      source: 'ttp_cutoff_unverified_broker_flatness',
      status: 'quarantined',
      entryBlocking: true,
      manualReconciliationRequired: true,
      requiresManualReconciliation: true,
      brokerFlatVerified: false,
      reason,
      currentDateET: state.currentDateET,
      cutoffMinute: state.cutoffMinute,
      currentMinuteET: state.currentMinuteET,
      phase: state.phase || null,
      marketTimeBlocksNewEntries: state.blocksNewEntries === true,
      inLiquidationWindow: state.inLiquidationWindow === true,
      assetClass: this.assetClass || null,
      scope: {
        symbol: null,
        timeframe: null,
        brokerId: null,
        accountId: null,
        assetClass: this.assetClass || null,
        executionMode: null,
      },
      closedCount: Array.isArray(closed) ? closed.length : 0,
      orphanClosedCount: Array.isArray(orphanClosed) ? orphanClosed.length : 0,
      cancelled: Number.isFinite(cancelResult?.cancelled) ? cancelResult.cancelled : 0,
      closed,
      orphanClosed,
      failures,
      affectedSymbols,
      createdAt,
    };

    const result = await this.stateManager.updateState(
      { ttpCutoffQuarantine: quarantine },
      { action: 'TTP_CUTOFF_QUARANTINE', reason, source: quarantine.source, entryBlocking: true, affectedSymbols }
    );
    if (result && result.success === false) {
      throw new Error(`[TTP_MARKET_TIME] broker flatness quarantine record failed: ${result.error || 'unknown_error'}`);
    }
    if (typeof this.stateManager.haltSymbol === 'function') {
      for (const symbol of affectedSymbols) {
        await this.stateManager.haltSymbol(symbol, reason, {
          code: quarantine.source,
          authority: 'financial_integrity',
          financialIntegrityCritical: true,
          manualReconciliationRequired: true,
          entryBlockScope: 'symbol',
          source: quarantine.source,
          currentDateET: state.currentDateET,
          createdAt,
        });
      }
    }

    const warn = typeof this.logger.warn === 'function' ? this.logger.warn.bind(this.logger) : this.logger.log.bind(this.logger);
    warn(`[TTP_MARKET_TIME] BROKER FLATNESS QUARANTINED date=${state.currentDateET} closed=${quarantine.closedCount} orphanClosed=${quarantine.orphanClosedCount} brokerFlatVerified=false entryBlocking=true manualReconciliationRequired=true affectedSymbols=${affectedSymbols.join(',')}`);
    return quarantine;
  }

  async _clearVerifiedBrokerFlatnessQuarantine(state, closed, orphanClosed, cancelResult) {
    if (!this.stateManager || typeof this.stateManager.get !== 'function' || typeof this.stateManager.updateState !== 'function') {
      return null;
    }

    const quarantine = this.stateManager.get('ttpCutoffQuarantine');
    if (!quarantine || quarantine.source !== 'ttp_cutoff_unverified_broker_flatness') {
      return null;
    }

    const reason = `[TTP_MARKET_TIME] broker flatness verified after cutoff date=${state.currentDateET}; clearing cutoff reconciliation quarantine`;
    const result = await this.stateManager.updateState(
      { ttpCutoffQuarantine: null },
      {
        action: 'TTP_CUTOFF_QUARANTINE_CLEAR',
        reason,
        source: quarantine.source,
        brokerFlatVerified: true,
        closedCount: Array.isArray(closed) ? closed.length : 0,
        orphanClosedCount: Array.isArray(orphanClosed) ? orphanClosed.length : 0,
        cancelled: Number.isFinite(cancelResult?.cancelled) ? cancelResult.cancelled : 0,
      }
    );
    if (result && result.success === false) {
      throw new Error(`[TTP_MARKET_TIME] broker flatness quarantine clear failed: ${result.error || 'unknown_error'}`);
    }
    if (Array.isArray(quarantine.affectedSymbols) && typeof this.stateManager.resetSymbolHalt === 'function') {
      for (const symbol of quarantine.affectedSymbols) {
        const haltCode = typeof this.stateManager.getSymbolHaltCode === 'function'
          ? this.stateManager.getSymbolHaltCode(symbol)
          : null;
        if (haltCode === quarantine.source) {
          await this.stateManager.resetSymbolHalt(symbol);
        }
      }
    }

    this.logger.log(`[TTP_MARKET_TIME] broker flatness verified; cleared cutoff reconciliation quarantine date=${state.currentDateET}`);
    return { cleared: true, reason };
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
