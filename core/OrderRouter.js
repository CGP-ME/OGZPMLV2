/**
 * OrderRouter - Multi-Broker Order Routing
 *
 * Routes orders to the correct broker based on symbol.
 * This is the multi-instrument unlock - adding a new exchange = one adapter file.
 *
 * ARCHITECTURE:
 * ```
 * ExecutionLayer.executeTrade()
 *        |
 * OrderRouter.sendOrder({ symbol: 'BTC/USD', ... })
 *        |
 *        +---> KrakenAdapter (BTC/USD, ETH/USD)
 *        +---> CoinbaseAdapter (SOL/USD, LINK/USD)
 *        +---> IBAdapter (AAPL, GOOGL)
 * ```
 *
 * @module core/OrderRouter
 */

const EventEmitter = require('events');
const { createTraceId, emitTrace } = require('./TraceSpine');

const POSITION_TRUTH_UNAVAILABLE = 'broker_position_truth_unavailable';
const CANCEL_TRUTH_UNKNOWN = 'broker_cancel_truth_unknown';
const OPEN_ORDERS_TRUTH_UNAVAILABLE = 'broker_open_orders_truth_unavailable';
const BALANCE_TRUTH_UNAVAILABLE = 'broker_balance_truth_unavailable';
const BROKER_TRUTH_UNAVAILABLE = 'broker_truth_unavailable';

class OrderRouter extends EventEmitter {
  constructor() {
    super();

    // Map symbol -> adapter
    this.symbolToAdapter = new Map();

    // Map adapter name -> adapter instance
    this.adapters = new Map();

    // Map adapter name -> normalized symbols it owns
    this.adapterSymbols = new Map();

    // Map adapter name -> latest broker truth outage event
    this.brokerTruthUnavailable = new Map();
    this.brokerTruthUnavailableHandlers = new WeakMap();

    console.log('[OrderRouter] Initialized');
  }

  /**
   * Register a broker adapter for specific symbols
   * @param {IBrokerAdapter} adapter - Broker adapter instance
   * @param {string[]} symbols - Symbols this adapter handles ['BTC/USD', 'ETH/USD']
   */
  registerBroker(adapter, symbols) {
    const name = this._normalizeBrokerName(adapter.getBrokerName ? adapter.getBrokerName() : 'unknown');

    // Store adapter reference
    this.adapters.set(name, adapter);
    this._wireBrokerTruthUnavailable(name, adapter);
    if (!this.adapterSymbols.has(name)) {
      this.adapterSymbols.set(name, new Set());
    }

    // Map each symbol to this adapter
    for (const symbol of symbols) {
      const normalized = this.normalizeSymbol(symbol);
      if (!normalized) {
        throw new Error(`[OrderRouter] ${name} attempted to register an empty symbol`);
      }
      const existingAdapter = this.symbolToAdapter.get(normalized);
      if (existingAdapter && existingAdapter !== adapter) {
        const existingName = this._normalizeBrokerName(
          existingAdapter.getBrokerName ? existingAdapter.getBrokerName() : 'unknown'
        );
        throw new Error(`[OrderRouter] Symbol ${normalized} already registered to ${existingName}; refusing to reassign to ${name}`);
      }
      this.symbolToAdapter.set(normalized, adapter);
      this.adapterSymbols.get(name).add(normalized);
      console.log(`[OrderRouter] ${normalized} -> ${name}`);
    }

    this.emit('brokerRegistered', { name, symbols });
  }

  /**
   * Default order routing is disabled. Every order symbol must be explicitly
   * registered to one broker to prevent cross-broker execution.
   * @param {IBrokerAdapter} adapter
   */
  setDefaultAdapter(adapter) {
    const name = adapter.getBrokerName ? adapter.getBrokerName() : 'unknown';
    throw new Error(`[OrderRouter] Default adapter fallback disabled; register explicit symbols for ${name}`);
  }

  /**
   * Get the adapter for a symbol
   * @param {string} symbol
   * @returns {IBrokerAdapter|null}
   */
  getBrokerForSymbol(symbol) {
    const normalized = this.normalizeSymbol(symbol);
    return this.symbolToAdapter.get(normalized) || null;
  }

  getBrokerTruthEntryBlock(scope = {}) {
    const action = String(scope.action || '').trim().toUpperCase();
    const positionEffect = String(scope.positionEffect || '').trim().toLowerCase();
    const entryScoped = action === 'BUY'
      || action === 'SELL_SHORT'
      || positionEffect.startsWith('open');
    if (!entryScoped) {
      return { blocked: false };
    }
    const adapter = scope.symbol ? this.getBrokerForSymbol(scope.symbol) : null;
    const broker = this._normalizeBrokerName(
      scope.brokerName
      || scope.brokerId
      || (adapter && typeof adapter.getBrokerName === 'function' ? adapter.getBrokerName() : null)
    );
    if (!broker) {
      return { blocked: false };
    }
    const record = this.brokerTruthUnavailable.get(broker);
    if (!record) {
      return { blocked: false };
    }
    return {
      blocked: true,
      code: record.code || BROKER_TRUTH_UNAVAILABLE,
      reason: `[BROKER_TRUTH_UNAVAILABLE] ${broker}: ${record.reason || BROKER_TRUTH_UNAVAILABLE}`,
      brokerId: broker,
      event: record.event,
      operation: record.operation,
      at: record.at,
      entryBlockScope: 'broker',
    };
  }

  /**
   * Normalize symbol format for consistent lookup
   * Handles: BTC/USD, BTC-USD, BTCUSD, XBT/USD -> BTC-USD
   * @param {string} symbol
   * @returns {string}
   */
  normalizeSymbol(symbol) {
    const raw = String(symbol || '').trim();
    if (!raw) return '';

    // Convert XBT to BTC (Kraken legacy)
    let normalized = raw.toUpperCase().replace('XBT', 'BTC');

    // Canonical is dash form (BTC-USD)
    if (normalized.includes('-')) {
      return normalized; // Already canonical
    }
    if (normalized.includes('/')) {
      return normalized.replace('/', '-');
    }

    // Try to split 6-char symbols (BTCUSD -> BTC-USD)
    if (normalized.length === 6) {
      return normalized.slice(0, 3) + '-' + normalized.slice(3);
    }

    return normalized;
  }

  /**
   * Send an order to the appropriate broker
   * @param {Object} order - Order details
   * @param {string} order.symbol - Trading symbol
   * @param {string} order.side - 'buy' or 'sell'
   * @param {number} order.amount - Order size
   * @param {string} [order.type='market'] - Order type
   * @param {number} [order.price] - Limit price (if applicable)
   * @param {Object} [order.options] - Additional options
   * @returns {Promise<Object>} Order result
   */
  async sendOrder(order) {
    const { symbol, side, amount, type = 'market', price, options = {}, traceId, signalId, decisionId } = order;

    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      throw new Error('[OrderRouter] Order symbol is required');
    }

    const adapter = this.getBrokerForSymbol(symbol);
    if (!adapter) {
      throw new Error(`[OrderRouter] No adapter registered for symbol: ${normalizedSymbol}`);
    }

    const brokerName = adapter.getBrokerName ? adapter.getBrokerName() : 'unknown';
    const traceSuffix = traceId ? ` traceId=${traceId}` : '';
    console.log(`[OrderRouter] Routing ${side} ${amount} ${symbol} -> ${brokerName}${traceSuffix}`);

    if (side !== 'buy' && side !== 'sell') {
      throw new Error(`[OrderRouter] Invalid side: ${side}`);
    }

    let result;
    try {
      if (side === 'buy') {
        result = await adapter.placeBuyOrder(symbol, amount, type === 'limit' ? price : null, options);
      } else {
        result = await adapter.placeSellOrder(symbol, amount, type === 'limit' ? price : null, options);
      }
    } catch (error) {
      error.brokerRequestAttempted = true;
      error.unknownBrokerReceipt = true;
      error.brokerName = brokerName;
      throw error;
    }

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        reason: 'broker_order_result_missing',
        brokerRequestAttempted: true,
        unknownBrokerReceipt: true,
        brokerName,
        ...(traceId ? { traceId } : {}),
        ...(signalId ? { signalId } : {}),
        ...(decisionId ? { decisionId } : {}),
      };
    }

    return {
      ...result,
      brokerRequestAttempted: true,
      brokerName,
      ...(traceId ? { traceId } : {}),
      ...(signalId ? { signalId } : {}),
      ...(decisionId ? { decisionId } : {}),
    };
  }

  /**
   * Get all positions across all registered brokers
   * @returns {Promise<Object>} Aggregated positions plus per-broker completeness
   */
  async getAllPositions(options = {}) {
    const symbolSet = this._symbolSet(options.symbols);
    const brokerNameSet = this._brokerNameSet(options.brokerNames);
    const allPositions = [];
    const brokerStatuses = [];
    let matchedAdapters = 0;

    for (const [name, adapter] of this.adapters) {
      if (brokerNameSet && !brokerNameSet.has(name)) {
        continue;
      }
      if (symbolSet && !this._adapterMatchesSymbols(name, symbolSet)) {
        continue;
      }
      matchedAdapters += 1;

      try {
        if (!adapter || typeof adapter.getPositions !== 'function') {
          const status = this._positionUnavailableStatus(name, 'adapter_missing_get_positions');
          brokerStatuses.push(status);
          this._recordPositionTruthUnavailable(status, options);
          continue;
        }

        const positions = await adapter.getPositions();
        if (!Array.isArray(positions)) {
          const status = this._positionUnavailableStatus(name, 'broker_positions_not_array', {
            returnedType: Object.prototype.toString.call(positions),
          });
          brokerStatuses.push(status);
          this._recordPositionTruthUnavailable(status, options);
          continue;
        }
        let positionCount = 0;
        for (const pos of positions) {
          if (symbolSet && pos?.symbol && !symbolSet.has(this.normalizeSymbol(pos.symbol))) {
            continue;
          }
          positionCount += 1;
          allPositions.push({
            ...pos,
            broker: name
          });
        }
        brokerStatuses.push({ broker: name, status: 'complete', positionCount });
      } catch (error) {
        const status = this._positionUnavailableStatus(name, 'broker_position_read_failed', {
          error: error?.message || String(error),
        });
        brokerStatuses.push(status);
        this._recordPositionTruthUnavailable(status, options);
      }
    }

    if (matchedAdapters === 0) {
      const broker = brokerNameSet ? Array.from(brokerNameSet).join(',') : 'none';
      const status = this._positionUnavailableStatus(broker, brokerNameSet
        ? 'broker_scope_matched_no_adapters'
        : (symbolSet ? 'symbol_scope_matched_no_adapters' : 'no_adapters_registered'));
      brokerStatuses.push(status);
      this._recordPositionTruthUnavailable(status, options);
    }

    const unavailableBrokers = brokerStatuses.filter(status => status.status === 'unavailable');
    return {
      positions: allPositions,
      brokerStatuses,
      complete: unavailableBrokers.length === 0,
      unavailableBrokers,
      matchedAdapters,
      scope: this._positionScopeDescriptor(options),
    };
  }

  async cancelAllOpenOrders(options = {}) {
    const symbolSet = this._symbolSet(options.symbols);
    const brokerNameSet = this._brokerNameSet(options.brokerNames);
    const results = [];
    let matchedAdapters = 0;

    for (const [name, adapter] of this.adapters) {
      if (brokerNameSet && !brokerNameSet.has(name)) {
        results.push({ broker: name, skipped: true, reason: 'broker_not_in_scope' });
        continue;
      }
      if (symbolSet && !this._adapterMatchesSymbols(name, symbolSet)) {
        results.push({ broker: name, skipped: true, reason: 'no_matching_symbols' });
        continue;
      }
      matchedAdapters += 1;
      if (typeof adapter.getOpenOrders !== 'function' || typeof adapter.cancelOrder !== 'function') {
        results.push({ broker: name, success: false, reason: 'adapter_missing_order_cancel_api' });
        continue;
      }

      try {
        const orders = await adapter.getOpenOrders();
        for (const order of orders || []) {
          if (symbolSet && order?.symbol && !symbolSet.has(this.normalizeSymbol(order.symbol))) {
            continue;
          }
          const orderId = order.orderId || order.id;
          if (!orderId) {
            results.push({ broker: name, success: false, reason: 'missing_order_id', order });
            continue;
          }
          const cancelResult = await adapter.cancelOrder(orderId);
          const normalizedCancel = this._normalizeCancelResult(cancelResult);
          if (normalizedCancel.success === true) {
            results.push({ broker: name, orderId, success: true, ...normalizedCancel.extra });
          } else {
            const result = {
              broker: name,
              orderId,
              success: false,
              reason: normalizedCancel.reason,
              ...normalizedCancel.extra,
            };
            results.push(result);
            if (normalizedCancel.unknown === true) {
              this._recordCancelTruthUnknown(name, orderId, result, options);
            }
          }
        }
      } catch (error) {
        const result = {
          broker: name,
          success: false,
          reason: error?.code || 'open_orders_read_failed',
          code: error?.code || OPEN_ORDERS_TRUTH_UNAVAILABLE,
          error: error?.message || String(error),
        };
        results.push(result);
        this._recordOpenOrdersTruthUnavailable(name, result, options);
      }
    }
    if (matchedAdapters === 0) {
      results.push({
        broker: brokerNameSet ? Array.from(brokerNameSet).join(',') : 'none',
        success: false,
        reason: brokerNameSet
          ? 'broker_scope_matched_no_adapters'
          : (symbolSet ? 'symbol_scope_matched_no_adapters' : 'no_adapters_registered'),
      });
    }

    const failed = results.filter(r => r.success === false);
    return {
      success: failed.length === 0,
      results,
      cancelled: results.filter(r => r.success === true).length,
      failed: failed.length,
    };
  }

  _symbolSet(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) return null;
    return new Set(symbols.map(symbol => this.normalizeSymbol(symbol)).filter(Boolean));
  }

  _brokerNameSet(brokerNames) {
    if (!Array.isArray(brokerNames) || brokerNames.length === 0) return null;
    return new Set(brokerNames.map(name => this._normalizeBrokerName(name)).filter(Boolean));
  }

  _normalizeBrokerName(name) {
    return String(name || '').trim().toLowerCase();
  }

  _wireBrokerTruthUnavailable(name, adapter) {
    if (!adapter || typeof adapter !== 'object' || typeof adapter.on !== 'function') {
      return;
    }
    if (this.brokerTruthUnavailableHandlers.has(adapter)) {
      return;
    }
    const handler = (payload = {}) => {
      this._recordBrokerTruthUnavailable(name, payload);
    };
    adapter.on('broker_truth_unavailable', handler);
    this.brokerTruthUnavailableHandlers.set(adapter, handler);
  }

  _recordBrokerTruthUnavailable(name, payload = {}) {
    const broker = this._normalizeBrokerName(payload.broker || name || 'unknown');
    const record = {
      broker,
      status: 'unavailable',
      code: payload.code || BROKER_TRUTH_UNAVAILABLE,
      reason: payload.reason || BROKER_TRUTH_UNAVAILABLE,
      event: payload.event || payload.operation || BROKER_TRUTH_UNAVAILABLE,
      operation: payload.operation || null,
      at: new Date().toISOString(),
      payload,
    };
    this.brokerTruthUnavailable.set(broker, record);
    console.error(`[OrderRouter] BROKER_TRUTH_UNAVAILABLE broker=${broker} reason=${record.reason}`);
    emitTrace({}, 'ORDER_ROUTER_BROKER_TRUTH_UNAVAILABLE', {
      traceId: createTraceId('order_router_broker_truth'),
      ...record,
    });
    this.emit('brokerTruthUnavailable', record);
    return record;
  }

  _positionScopeDescriptor(options = {}) {
    return {
      symbols: Array.isArray(options.symbols)
        ? options.symbols.map(symbol => this.normalizeSymbol(symbol)).filter(Boolean)
        : [],
      brokerNames: Array.isArray(options.brokerNames)
        ? options.brokerNames.map(name => this._normalizeBrokerName(name)).filter(Boolean)
        : [],
    };
  }

  _positionUnavailableStatus(broker, reason, extra = {}) {
    return {
      broker,
      status: 'unavailable',
      code: POSITION_TRUTH_UNAVAILABLE,
      reason,
      ...extra,
    };
  }

  _recordPositionTruthUnavailable(status, options = {}) {
    const payload = {
      traceId: createTraceId('order_router_position_truth'),
      ...status,
      scope: this._positionScopeDescriptor(options),
    };
    console.error(
      `[OrderRouter] POSITION_TRUTH_UNAVAILABLE broker=${status.broker} reason=${status.reason}${status.error ? ` error=${status.error}` : ''}`
    );
    emitTrace({}, 'ORDER_ROUTER_POSITION_TRUTH_UNAVAILABLE', payload);
    this.emit('positionTruthUnavailable', payload);
  }

  _normalizeCancelResult(cancelResult) {
    if (cancelResult === true) {
      return { success: true, reason: null, extra: {} };
    }
    if (cancelResult && typeof cancelResult === 'object') {
      if (cancelResult.cancelled === true || cancelResult.status === 'cancelled') {
        return {
          success: true,
          reason: null,
          extra: {
            cancelStatus: cancelResult.status || 'cancelled',
          },
        };
      }
      if (cancelResult.status === 'unknown' || cancelResult.unknown === true || cancelResult.code === CANCEL_TRUTH_UNKNOWN) {
        return {
          success: false,
          unknown: true,
          reason: cancelResult.reason || CANCEL_TRUTH_UNKNOWN,
          extra: {
            cancelStatus: 'unknown',
            code: cancelResult.code || CANCEL_TRUTH_UNKNOWN,
            error: cancelResult.error || null,
          },
        };
      }
    }
    return {
      success: false,
      reason: cancelResult === false ? 'cancel_returned_false' : 'cancel_returned_non_true',
      extra: {},
    };
  }

  _recordCancelTruthUnknown(broker, orderId, result, options = {}) {
    const payload = {
      traceId: createTraceId('order_router_cancel_truth'),
      broker,
      orderId,
      code: result.code || CANCEL_TRUTH_UNKNOWN,
      reason: result.reason || CANCEL_TRUTH_UNKNOWN,
      error: result.error || null,
      scope: this._positionScopeDescriptor(options),
    };
    console.error(
      `[OrderRouter] CANCEL_TRUTH_UNKNOWN broker=${broker} orderId=${orderId} reason=${payload.reason}${payload.error ? ` error=${payload.error}` : ''}`
    );
    emitTrace({}, 'ORDER_ROUTER_CANCEL_TRUTH_UNKNOWN', payload);
    this.emit('cancelTruthUnknown', payload);
  }

  _recordOpenOrdersTruthUnavailable(broker, result, options = {}) {
    const payload = {
      traceId: createTraceId('order_router_open_orders_truth'),
      broker,
      code: result.code || OPEN_ORDERS_TRUTH_UNAVAILABLE,
      reason: result.reason || OPEN_ORDERS_TRUTH_UNAVAILABLE,
      error: result.error || null,
      scope: this._positionScopeDescriptor(options),
    };
    console.error(
      `[OrderRouter] OPEN_ORDERS_TRUTH_UNAVAILABLE broker=${broker} reason=${payload.reason}${payload.error ? ` error=${payload.error}` : ''}`
    );
    emitTrace({}, 'ORDER_ROUTER_OPEN_ORDERS_TRUTH_UNAVAILABLE', payload);
    this.emit('openOrdersTruthUnavailable', payload);
  }

  _recordBalanceTruthUnavailable(broker, error) {
    const payload = {
      traceId: createTraceId('order_router_balance_truth'),
      broker,
      code: error?.code || BALANCE_TRUTH_UNAVAILABLE,
      reason: error?.code || BALANCE_TRUTH_UNAVAILABLE,
      error: error?.message || String(error),
    };
    console.error(
      `[OrderRouter] BALANCE_TRUTH_UNAVAILABLE broker=${broker} reason=${payload.reason}${payload.error ? ` error=${payload.error}` : ''}`
    );
    emitTrace({}, 'ORDER_ROUTER_BALANCE_TRUTH_UNAVAILABLE', payload);
    this.emit('balanceTruthUnavailable', payload);
  }

  getBrokerNamesByAssetType(assetTypes = []) {
    const targetTypes = new Set((Array.isArray(assetTypes) ? assetTypes : [assetTypes])
      .map(type => String(type || '').trim().toLowerCase())
      .filter(Boolean));
    if (targetTypes.size === 0) return [];

    const names = [];
    for (const [name, adapter] of this.adapters) {
      const type = typeof adapter.getAssetType === 'function'
        ? String(adapter.getAssetType() || '').trim().toLowerCase()
        : '';
      if (targetTypes.has(type)) {
        names.push(name);
      }
    }
    return names;
  }

  _adapterMatchesSymbols(name, symbolSet) {
    const registered = this.adapterSymbols.get(name);
    if (!registered || registered.size === 0) return true;
    for (const symbol of symbolSet) {
      if (registered.has(symbol)) return true;
    }
    return false;
  }

  /**
   * Get all balances across all registered brokers
   * @returns {Promise<Object>} { brokerName: { currency: amount } }
   */
  async getAllBalances() {
    const balances = {};

    for (const [name, adapter] of this.adapters) {
      try {
        balances[name] = await adapter.getBalance();
      } catch (error) {
        this._recordBalanceTruthUnavailable(name, error);
        balances[name] = {
          error: error.message,
          code: error?.code || BALANCE_TRUTH_UNAVAILABLE,
          reason: error?.code || BALANCE_TRUTH_UNAVAILABLE,
          status: 'unavailable',
        };
      }
    }

    return balances;
  }

  /**
   * Check if any adapter is connected
   * @returns {boolean}
   */
  isConnected() {
    for (const [, adapter] of this.adapters) {
      if (adapter.isConnected && adapter.isConnected()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get list of registered brokers
   * @returns {string[]}
   */
  getRegisteredBrokers() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get list of registered symbols
   * @returns {string[]}
   */
  getRegisteredSymbols() {
    return Array.from(this.symbolToAdapter.keys());
  }
}

module.exports = OrderRouter;
