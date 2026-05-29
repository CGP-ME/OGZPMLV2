/**
 * ============================================================================
 * KrakenIBrokerAdapter - Kraken IBroker Implementation
 * ============================================================================
 *
 * Wraps the existing kraken_adapter_simple to conform to IBrokerAdapter interface
 * This allows Kraken to be used via the broker abstraction layer
 *
 * EMPIRE V2 IMPLEMENTATION
 *
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const IBrokerAdapter = require('./IBrokerAdapter');
const KrakenAdapterSimple = require('../kraken_adapter_simple');

class KrakenIBrokerAdapter extends IBrokerAdapter {
  constructor(options = {}) {
    super();
    this.kraken = new KrakenAdapterSimple(options);
    this.connected = false;
    this.subscriptions = new Map();
  }

  // =========================================================================
  // CONNECTION MANAGEMENT
  // =========================================================================

  async connect() {
    try {
      await this.kraken.connect();
      this.connected = true;
      console.log('[KrakenIBroker] Connected to Kraken');

      // V2 ARCHITECTURE: Emit ready event for subscribers
      this.emit('connected', { broker: 'kraken', ready: true });

      return true;
    } catch (error) {
      console.error('[KrakenIBroker] Connection failed:', error.message);
      this.connected = false;
      return false;
    }
  }

  async disconnect() {
    // V2 ARCHITECTURE: Single WebSocket managed by kraken_adapter_simple
    if (this.kraken.ws) {
      await this.kraken.disconnect();
    }
    this.connected = false;
    console.log('[KrakenIBroker] Disconnected from Kraken');
  }

  isConnected() {
    return this.connected;
  }

  /**
   * Phase 8 health protocol — supervisor-compatible shape.
   *   { status, timestamp, details, lastSuccessAt, failureReason }
   *
   * Delegates to underlying kraken_adapter_simple state. The simple adapter
   * already tracks ws.readyState, reconnectAttempts, and the heartbeat /
   * data watchdog (since 2026-01-21). Health here is a derivation of those
   * known fields into the standardized supervisor protocol.
   *
   * Spec: ogz-meta/specs/resilience-and-supervision.md (Layer 1.5)
   */
  getHealth() {
    const now = Date.now();
    const inner = this.kraken;
    const wsOpen = inner && inner.ws && inner.ws.readyState === 1; /* WebSocket.OPEN */
    const reconnectAttempts = (inner && inner.reconnectAttempts) || 0;
    const lastDataAt = (inner && inner.lastDataAt) || 0;
    const dataTimeout = (inner && inner.dataTimeout) || 60000;

    let status;
    let failureReason = null;
    if (!this.connected) {
      status = 'UNHEALTHY';
      failureReason = 'connect() not yet succeeded';
    } else if (!wsOpen) {
      status = 'UNHEALTHY';
      failureReason = `WS not OPEN (reconnectAttempts=${reconnectAttempts})`;
    } else if (lastDataAt > 0 && (now - lastDataAt) > dataTimeout) {
      status = 'DEGRADED';
      failureReason = `no data for ${now - lastDataAt}ms (timeout ${dataTimeout}ms)`;
    } else if (reconnectAttempts > 0) {
      status = 'DEGRADED';
      failureReason = `recent reconnect (attempts=${reconnectAttempts})`;
    } else {
      status = 'HEALTHY';
    }

    return {
      status,
      timestamp: now,
      details: {
        broker: 'kraken',
        wsReadyState: (inner && inner.ws) ? inner.ws.readyState : -1,
        connected: this.connected,
        reconnectAttempts,
        lastDataAt,
        msSinceData: lastDataAt ? (now - lastDataAt) : null,
        subscriptionCount: this.subscriptions.size,
      },
      lastSuccessAt: lastDataAt || (this.connected ? now : 0),
      failureReason,
    };
  }

  // =========================================================================
  // BROKER IDENTIFICATION
  // =========================================================================

  getAssetType() {
    return 'crypto';
  }

  getBrokerName() {
    return 'kraken';
  }

  // =========================================================================
  // ACCOUNT INFO
  // =========================================================================

  async getBalance() {
    return await this.kraken.getBalance();
  }

  async getPositions() {
    // Spot trading doesn't have positions, return empty
    return [];
  }

  async getOpenPositions() {
    // Required for reconciliation - spot trading has no positions
    return [];
  }

  async getOpenOrders() {
    return await this.kraken.getOpenOrders();
  }

  // =========================================================================
  // ORDER MANAGEMENT
  // =========================================================================

  async placeBuyOrder(symbol, amount, price = null, options = {}) {
    const order = {
      symbol: symbol,
      side: 'buy',
      type: price ? 'limit' : 'market',
      quantity: amount,
      price: price,
      ...options
    };

    const result = await this.kraken.placeOrder(order);
    return {
      orderId: result.orderId || result.txid?.[0],
      status: result.status || 'pending',
      ...result
    };
  }

  async placeSellOrder(symbol, amount, price = null, options = {}) {
    const order = {
      symbol: symbol,
      side: 'sell',
      type: price ? 'limit' : 'market',
      quantity: amount,
      price: price,
      ...options
    };

    const result = await this.kraken.placeOrder(order);
    return {
      orderId: result.orderId || result.txid?.[0],
      status: result.status || 'pending',
      ...result
    };
  }

  // =========================================================================
  // EMPIRE V2 EXECUTION CONTRACT (CRITICAL FOR TRAI/RECONCILER)
  // =========================================================================

  async executeTrade(params) {
    const {
      direction,
      positionSize,
      confidence,
      marketData,
      decisionId,
      meta = {}
    } = params;

    const rawSymbol = marketData?.symbol;
    if (!rawSymbol) {
      throw new Error('[KrakenIBroker] executeTrade requires marketData.symbol; refusing to default execution symbol');
    }

    const symbol = this.kraken.normalizeKrakenWsPair(rawSymbol);
    if (!symbol || !this.kraken.isCanonicalDashboardSymbol(symbol)) {
      throw new Error(`[KrakenIBroker] executeTrade received invalid marketData.symbol: ${rawSymbol}`);
    }

    const side = String(direction || '').toLowerCase();
    if (!['buy', 'sell'].includes(side)) {
      throw new Error(`[KrakenIBroker] executeTrade invalid direction: ${direction}`);
    }

    const result = await this.kraken.executeTrade({
      direction: side,
      positionSize,
      confidence,
      marketData: {
        ...marketData,
        symbol
      }
    });

    // Return V2-compatible execution result with full metadata
    return {
      orderId: result.orderId || result.txid?.[0],
      status: 'submitted',
      decisionId: decisionId,      // CRITICAL: For TRAI attribution
      broker: 'kraken',
      symbol,
      side,
      requestedQty: result.quantity ?? null,
      requestedSizeUsd: positionSize,
      confidence: confidence,
      timestamp: Date.now(),
      meta,
      raw: result
    };
  }

  // Expose underlying adapter methods for compatibility
  async placeOrder(order) {
    return await this.kraken.placeOrder(order);
  }

  async connectWebSocketStream(callback) {
    return await this.kraken.connectWebSocketStream(callback);
  }

  async cancelOrder(orderId) {
    // kraken_adapter_simple doesn't have cancelOrder, would need to add
    throw new Error('[KrakenIBroker] cancelOrder not implemented in kraken_adapter_simple');
  }

  async modifyOrder(orderId, modifications) {
    // kraken_adapter_simple doesn't have modifyOrder, would need to add
    throw new Error('[KrakenIBroker] modifyOrder not implemented in kraken_adapter_simple');
  }

  async getOrderStatus(orderId) {
    // kraken_adapter_simple doesn't have getOrderStatus, would need to add
    throw new Error('[KrakenIBroker] getOrderStatus not implemented in kraken_adapter_simple');
  }

  // =========================================================================
  // MARKET DATA
  // =========================================================================

  async getTicker(symbol) {
    const marketData = await this.kraken.getMarketData(symbol);
    return {
      bid: marketData.bid,
      ask: marketData.ask,
      last: marketData.last || marketData.price,
      volume: marketData.volume,
      timestamp: Date.now()
    };
  }

  async getCandles(symbol, timeframe = '1m', limit = 100) {
    // CHANGE 2026-01-30: Implement proper historical candle fetching via REST API
    // Convert symbol to Kraken format (BTC/USD -> XBTUSD)
    const krakenPair = this.toBrokerSymbol(symbol).replace('/', '');

    // Convert timeframe to Kraken interval (minutes)
    const timeframeToInterval = {
      '1m': 1, '5m': 5, '15m': 15, '30m': 30,
      '1h': 60, '4h': 240, '1d': 1440
    };
    const interval = timeframeToInterval[timeframe] || 1;

    console.log(`[KrakenIBroker] Fetching ${limit} historical candles for ${symbol} @ ${timeframe}`);
    return await this.kraken.getHistoricalOHLC(krakenPair, interval, limit);
  }

  async getOrderBook(symbol, depth = 20) {
    // kraken_adapter_simple doesn't have getOrderBook
    throw new Error('[KrakenIBroker] getOrderBook not implemented in kraken_adapter_simple');
  }

  // =========================================================================
  // REAL-TIME SUBSCRIPTIONS
  // =========================================================================

  subscribeToTicker(symbol, callback) {
    // Use the existing connectWebSocketStream for price updates
    this.kraken.connectWebSocketStream((data) => {
      if (data.symbol === symbol || data.asset === symbol) {
        callback({
          symbol: symbol,
          bid: data.bid,
          ask: data.ask,
          last: data.price,
          volume: data.volume,
          timestamp: data.timestamp || Date.now()
        });
      }
    });
  }

  subscribeToCandles(symbol, timeframe, callback) {
    // V2 ARCHITECTURE: Use single WebSocket from kraken_adapter_simple
    console.log('[KrakenIBroker] V2 SINGLE SOURCE: Subscribing via kraken_adapter_simple');

    // Connect to kraken_adapter_simple WebSocket if not connected
    if (!this.kraken.ws || this.kraken.ws.readyState !== WebSocket.OPEN) {
      this.kraken.connectWebSocketStream((data) => {
        // Handle both price and OHLC data from the single source
        if (data.type === 'ohlc') {
          // ohlcData format: [time, etime, open, high, low, close, vwap, volume, count]
          const ohlcData = data.data;
          const pair = data.pair;
          // CHANGE 2026-01-29: Extract timeframe from multi-timeframe subscription
          const timeframe = data.timeframe || '1m';
          const canonicalSymbol = this.fromBrokerSymbol(pair);
          this._visOhlcEmitSeen ??= new Set();
          const visKey = `${canonicalSymbol}:${timeframe}`;
          if (!this._visOhlcEmitSeen.has(visKey)) {
            this._visOhlcEmitSeen.add(visKey);
            console.log(`[VIS][OHLC][KrakenIBroker] pair=${pair} symbol=${canonicalSymbol} timeframe=${timeframe} close=${ohlcData && ohlcData[5]}`);
          }

          // V2 ARCHITECTURE: Emit raw event for subscribers (like run-empire-v2).
          // Keep the canonical symbol attached; run-empire-v2/CandleProcessor
          // need it to avoid routing Kraken candles into a stale stock context.
          this.emit('ohlc', {
            data: ohlcData,
            timeframe: timeframe,
            symbol: canonicalSymbol,
            pair,
          });

          // Also process for callback if provided
          if (callback && ohlcData) {
            const [time, etime, open, high, low, close, vwap, volume, count] = ohlcData;

            const ohlcPacket = {
              symbol: canonicalSymbol,
              o: parseFloat(open),
              h: parseFloat(high),
              l: parseFloat(low),
              c: parseFloat(close),
              v: parseFloat(volume),
              t: parseInt(time) * 1000, // Convert to milliseconds
              etime: parseInt(etime) * 1000,
              count: parseInt(count)
            };

            callback(ohlcPacket);
          }
        }
      });
    }

    // Store subscription for later cleanup
    const key = `${symbol}-${timeframe}`;
    this.subscriptions.set(key, callback);

    console.log(`[KrakenIBroker] Subscribed to ${symbol} ${timeframe} via single source`);
  }

  subscribeToOrderBook(symbol, callback) {
    throw new Error('[KrakenIBroker] subscribeToOrderBook not implemented yet');
  }

  subscribeToAccount(callback) {
    throw new Error('[KrakenIBroker] subscribeToAccount not implemented yet');
  }

  unsubscribeAll() {
    this.subscriptions.clear();
    // V2 ARCHITECTURE: WebSocket managed by kraken_adapter_simple
    console.log('[KrakenIBroker] Cleared all subscriptions');
  }

  // =========================================================================
  // ASSET INFORMATION
  // =========================================================================

  async getSupportedSymbols() {
    // Return common Kraken pairs
    return [
      'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD',
      'DOT/USD', 'AVAX/USD', 'LINK/USD', 'ATOM/USD', 'UNI/USD'
    ];
  }

  getMinOrderSize(symbol) {
    // Kraken minimums (simplified)
    const minimums = {
      'BTC/USD': 0.0001,
      'ETH/USD': 0.001,
      'SOL/USD': 0.01,
      'XRP/USD': 1,
      'ADA/USD': 1,
      'default': 0.01
    };
    return minimums[symbol] || minimums.default;
  }

  getFees() {
    return {
      maker: 0.0016,
      taker: 0.0026
    };
  }

  isTradeableNow(symbol) {
    // Crypto trades 24/7
    return true;
  }

  // =========================================================================
  // SYMBOL NORMALIZATION
  // =========================================================================

  toBrokerSymbol(symbol) {
    // Convert universal canonical (BTC-USD) to Kraken format (XBT/USD)
    return symbol.replace('BTC', 'XBT').replace('-', '/');
  }

  fromBrokerSymbol(brokerSymbol) {
    // Convert Kraken format (XBT/USD) to universal canonical (BTC-USD)
    return brokerSymbol.replace('XBT', 'BTC').replace('/', '-');
  }
}

module.exports = KrakenIBrokerAdapter;
