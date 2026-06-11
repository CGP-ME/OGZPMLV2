/**
 * @fileoverview KrakenAdapterSimple - Direct Kraken Exchange Integration
 *
 * Provides direct API integration with Kraken for order execution and
 * real-time market data via WebSocket.
 *
 * @description
 * ARCHITECTURE ROLE:
 * This is the lowest-level component - it talks directly to Kraken's API.
 * All trading commands flow through here for actual exchange execution.
 *
 * DATA FLOW:
 * ```
 * Kraken WebSocket → onMessage() → emit('ohlc') → run-empire-v2.js
 * TradingBrain.openPosition() → executeOrder() → Kraken REST API
 * ```
 *
 * KEY FEATURES:
 * - WebSocket subscription for real-time OHLC (1m, 5m, 15m, 30m, 1h, 4h, 1d)
 * - Rate limiting with exponential backoff (15 req/sec limit)
 * - Automatic reconnection with heartbeat monitoring
 * - Data-level watchdog: forces reconnect if no data for 60s
 *
 * CRITICAL NOTES:
 * - Requires KRAKEN_API_KEY and KRAKEN_API_SECRET in .env
 * - Paper mode: Orders are logged but not sent to exchange
 * - Live mode: Real orders - use with extreme caution!
 *
 * @module kraken_adapter_simple
 * @requires axios
 * @requires ws
 * @requires crypto
 */

const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const WebSocket = require('ws');
const KrakenDepth = require('./server/kraken-depth-adapter');
const { ASSET_REGISTRY, normalizeAssetSymbol } = require('./core/AssetRegistry');
const authFailureGuard = require('./core/AuthFailureGuard');

function krakenAuthFailureText(error) {
  const responseErrors = error?.response?.data?.error;
  const parts = [];
  if (Array.isArray(responseErrors)) parts.push(...responseErrors);
  if (typeof responseErrors === 'string') parts.push(responseErrors);
  if (error?.message) parts.push(error.message);
  return parts.join(' | ');
}

function isKrakenAuthFailure(error) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) return true;

  const text = krakenAuthFailureText(error);
  return /\bEAPI:(Invalid key|Invalid signature|Invalid nonce)\b|\bEGeneral:Permission denied\b|\bEOrder:Permission denied\b|\b(Unauthorized|Authentication failed|Invalid token|Token expired)\b/i.test(text);
}

function recordKrakenAuthFailureIfRelevant(error, kind) {
  if (!isKrakenAuthFailure(error)) return false;
  authFailureGuard.recordFailure('kraken', kind, {
    message: krakenAuthFailureText(error) || error?.message,
    authFailure: true,
    evidence: 'kraken-auth-classifier',
  });
  return true;
}

class KrakenAdapterSimple {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = 'https://api.kraken.com';
    this.wsUrl = 'wss://ws-auth.kraken.com/v2';
    this.connected = false;
    this.assetPairs = new Map();
    this.ws = null;
    this.authToken = null;

    // Latest price storage for fallback access
    this.currentPrices = new Map(); // Store latest price per asset
    this.lastBookSnapshots = new Map();
    this.wsPairs = this.resolveWebSocketPairs(config);
    this.bookSubscriptions = new Set();
    this.depthLiveSymbolTimestamps = new Map();

    // WebSocket reconnect management
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimeout = null;

    // CHANGE 2026-01-21: Heartbeat to keep connection alive
    this.pingInterval = null;
    this.lastPong = Date.now();

    // CHANGE 2026-01-23: Data-level watchdog - force reconnect if no data even if socket "open"
    this.lastDataReceived = Date.now();
    this.dataWatchdogInterval = null;
    this.dataTimeout = 60000; // 60 seconds without data = force reconnect

    // Rate limiting (Kraken API tier 2: 15 req/sec)
    this.requestWindow = 1000; // 1 second window
    this.maxRequestsPerWindow = 15;
    this.requestTimestamps = [];
    this.rateLimitBackoff = 1000; // Start at 1s for 429 errors

    // CHANGE 2025-12-13: Step 4 - Simple queue to prevent recursion
    this.requestQueue = [];
    this.queueProcessing = false;
    this.processQueueInterval = null;

    // Capabilities
    this.capabilities = {
      markets: ['crypto'],
      orderTypes: ['market', 'limit', 'stop-loss', 'take-profit'],
      timeInForce: ['GTC', 'GTD', 'IOC'],
      crypto: true
    };
  }

  async connect() {
    try {
      // Test API credentials first. testCredentials owns auth-failure
      // classification so direct calls and connect() share one guard path.
      await this.testCredentials();

      // Load asset pairs
      await this.loadAssetPairs();

      // Get WebSocket auth token
      await this.getAuthToken();

      this.connected = true;
      console.log('[Kraken] adapter connected successfully');
      return true;
    } catch (error) {
      console.error('[Kraken] connection failed:', error.message);
      return false;
    }
  }

  async testCredentials() {
    try {
      const response = await this.makePrivateRequest('/0/private/Balance');
      if (response.error && response.error.length > 0) {
        throw new Error(`API Error: ${response.error.join(', ')}`);
      }
      return response.result;
    } catch (error) {
      recordKrakenAuthFailureIfRelevant(error, 'rest-credentials');
      throw error;
    }
  }

  async loadAssetPairs() {
    try {
      const response = await axios.get(`${this.baseUrl}/0/public/AssetPairs`);
      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Asset pairs error: ${response.data.error.join(', ')}`);
      }

      const pairs = response.data.result;
      Object.entries(pairs).forEach(([key, value]) => {
        this.assetPairs.set(key, value);
      });

      console.log(`[Kraken] Loaded ${this.assetPairs.size} asset pairs`);
    } catch (error) {
      throw new Error(`Failed to load asset pairs: ${error.message}`);
    }
  }

  async getAuthToken() {
    try {
      const response = await this.makePrivateRequest('/0/private/GetWebSocketsToken');
      if (response.error && response.error.length > 0) {
        throw new Error(`Token error: ${response.error.join(', ')}`);
      }

      this.authToken = response.result.token;
      console.log('[Kraken] WebSocket auth token obtained');
    } catch (error) {
      recordKrakenAuthFailureIfRelevant(error, 'rest-token');
      throw new Error(`Failed to get auth token: ${error.message}`);
    }
  }

  // CHANGE 2025-12-13: Step 4 - Queue-based request handling (no recursion)
  async makePrivateRequest(endpoint, data = {}) {
    return new Promise((resolve, reject) => {
      // Add request to queue
      this.requestQueue.push({
        endpoint,
        data,
        resolve,
        reject,
        retries: 0
      });

      // Start queue processor if not running
      this.startQueueProcessor();
    });
  }

  // Process queued requests without recursion
  startQueueProcessor() {
    if (this.queueProcessing) return;

    this.queueProcessing = true;
    this.processQueueInterval = setInterval(() => this.processQueue(), 100);
  }

  async processQueue() {
    if (this.requestQueue.length === 0) {
      // Stop processor when queue is empty
      clearInterval(this.processQueueInterval);
      this.queueProcessing = false;
      return;
    }

    // Check rate limit
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < this.requestWindow);

    if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
      // Still rate limited, wait for next interval
      return;
    }

    // Process next request
    const request = this.requestQueue.shift();
    if (!request) return;

    try {
      // Rate limit enforcement
      this.requestTimestamps.push(now);

      const nonce = Date.now() * 1000;
      const postData = querystring.stringify({ nonce, ...request.data });

      // Create signature
      const secret = Buffer.from(this.apiSecret, 'base64');
      const hash = crypto.createHash('sha256').update(nonce + postData).digest();
      const hmac = crypto.createHmac('sha512', secret);
      hmac.update(request.endpoint, 'utf8');
      hmac.update(hash);
      const signature = hmac.digest('base64');

      const response = await axios.post(`${this.baseUrl}${request.endpoint}`, postData, {
        headers: {
          'API-Key': this.apiKey,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Success - reset backoff
      this.rateLimitBackoff = 1000;
      request.resolve(response.data);

    } catch (error) {
      // Handle 429 rate limit errors
      if (error.response?.status === 429) {
        console.log(`[Kraken] RATE_LIMIT_429: Re-queuing request after ${this.rateLimitBackoff}ms`);

        // Put request back at front of queue
        this.requestQueue.unshift(request);

        // Pause queue processing
        clearInterval(this.processQueueInterval);
        this.queueProcessing = false;

        // Resume after backoff
        setTimeout(() => {
          this.rateLimitBackoff = Math.min(this.rateLimitBackoff * 2, 8000);
          this.startQueueProcessor();
        }, this.rateLimitBackoff);
      } else {
        // Other errors - reject promise
        request.reject(error);
      }
    }
  }

  async enforceRateLimit() {
    const now = Date.now();

    // Remove timestamps older than 1 second
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < this.requestWindow);

    // If at limit, wait until oldest request expires
    if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = this.requestWindow - (now - oldestRequest);
      if (waitTime > 0) {
        console.log(`[Kraken] RATE_LIMIT_DELAY: ${waitTime}ms (${this.requestTimestamps.length}/${this.maxRequestsPerWindow} requests in window)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Add current request timestamp
    this.requestTimestamps.push(Date.now());
  }

  /**
   * CHANGE 2026-01-30: Fetch historical OHLC candles from Kraken REST API
   * This provides actual historical data, not just real-time WebSocket updates
   * @param {string} pair - Trading pair (e.g., 'XBTUSD', 'ETHUSD')
   * @param {number} interval - Candle interval in minutes (1, 5, 15, 30, 60, 240, 1440)
   * @param {number} count - Number of candles to fetch (max ~720)
   * @returns {Array} Array of OHLC candles
   */
  async getHistoricalOHLC(pair = 'XBTUSD', interval = 1, count = 200) {
    try {
      // Calculate 'since' timestamp to get approximately 'count' candles
      const intervalMs = interval * 60 * 1000;
      const since = Math.floor((Date.now() - (count * intervalMs)) / 1000);

      const url = `${this.baseUrl}/0/public/OHLC?pair=${pair}&interval=${interval}&since=${since}`;
      console.log(`[Kraken REST] Fetching ${count} historical ${interval}m candles for ${pair}`);

      const response = await axios.get(url);

      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`OHLC error: ${response.data.error.join(', ')}`);
      }

      // Kraken returns { result: { XXBTZUSD: [[time, open, high, low, close, vwap, volume, count], ...], last: ... } }
      const result = response.data.result;
      const pairKey = Object.keys(result).find(k => k !== 'last');

      if (!pairKey || !result[pairKey]) {
        console.warn(`[Kraken REST] No OHLC data for ${pair}`);
        return [];
      }

      const candles = result[pairKey];
      console.log(`[Kraken REST] Received ${candles.length} historical candles for ${pair} @ ${interval}m`);

      // Convert to our standard format: { t, etime, o, h, l, c, v }
      // Kraken format: [time, open, high, low, close, vwap, volume, count]
      return candles.map(c => ({
        t: parseFloat(c[0]) * 1000,       // Start time in ms
        etime: (parseFloat(c[0]) + interval * 60) * 1000, // End time in ms
        o: parseFloat(c[1]),
        h: parseFloat(c[2]),
        l: parseFloat(c[3]),
        c: parseFloat(c[4]),
        v: parseFloat(c[6])
      }));

    } catch (error) {
      console.error(`[Kraken REST] Failed to fetch OHLC: ${error.message}`);
      return [];
    }
  }

  async getAccountBalance() {
    try {
      const response = await this.makePrivateRequest('/0/private/Balance');
      if (response.error && response.error.length > 0) {
        throw new Error(`Balance error: ${response.error.join(', ')}`);
      }
      return response.result;
    } catch (error) {
      recordKrakenAuthFailureIfRelevant(error, 'rest-balance');
      throw error;
    }
  }

  async getPositions() {
    // Kraken doesn't have a direct positions endpoint for spot trading
    // Use balance to determine holdings
    const balance = await this.getAccountBalance();
    const positions = [];
    const fiatAssets = new Set(['ZUSD', 'USD', 'ZEUR', 'EUR', 'ZGBP', 'GBP', 'ZCAD', 'CAD', 'ZAUD', 'AUD', 'ZJPY', 'JPY', 'ZCHF', 'CHF']);

    Object.entries(balance).forEach(([asset, amount]) => {
      if (!fiatAssets.has(String(asset).toUpperCase()) && parseFloat(amount) > 0) {
        positions.push({
          symbol: asset,
          quantity: parseFloat(amount),
          side: 'long'
        });
      }
    });

    return positions;
  }

  // Alias for compatibility with ExchangeReconciler
  async getBalance() {
    const balances = await this.getAccountBalance();
    let totalUSD = 0;

    // Calculate total balance in USD
    Object.entries(balances).forEach(([asset, amount]) => {
      if (asset === 'ZUSD' || asset === 'USD') {
        totalUSD += parseFloat(amount);
      }
      // Add conversion for other assets if needed
    });

    return {
      total: totalUSD,
      available: totalUSD,
      currencies: balances
    };
  }

  // Alias for compatibility - KrakenAdapterSimple uses getPositions
  async getOpenPositions() {
    return await this.getPositions();
  }

  // Get open orders through Kraken private REST. SessionRouter reconciliation
  // treats this as broker truth before switching sessions.
  async getOpenOrders() {
    try {
      const response = await this.makePrivateRequest('/0/private/OpenOrders');
      if (response.error && response.error.length > 0) {
        throw new Error(`OpenOrders error: ${response.error.join(', ')}`);
      }

      const open = response.result && response.result.open ? response.result.open : {};
      return Object.entries(open).map(([orderId, order]) => {
        const descr = order.descr || {};
        const pair = descr.pair || order.pair || '';
        return {
          orderId,
          symbol: this.normalizeKrakenWsPair(pair) || pair || '(missing)',
          type: descr.ordertype || order.ordertype || '(missing)',
          side: descr.type || order.type || '(missing)',
          price: parseFloat(descr.price || order.price || 0),
          amount: parseFloat(order.vol || order.volume || 0),
          filledAmount: parseFloat(order.vol_exec || 0),
          status: order.status || 'open'
        };
      });
    } catch (error) {
      recordKrakenAuthFailureIfRelevant(error, 'rest-open-orders');
      throw error;
    }
  }

  convertToKrakenSymbol(symbol) {
    const canonical = normalizeAssetSymbol(symbol);
    const metadata = canonical ? ASSET_REGISTRY[canonical] : null;
    if (!metadata || metadata.broker !== 'kraken' || !metadata.krakenRest) {
      throw new Error(`[Kraken] Invalid Kraken REST symbol: ${symbol}`);
    }
    return metadata.krakenRest;
  }

  normalizeKrakenWsPair(pair) {
    const raw = String(pair || '').trim().toUpperCase();
    if (!raw) return null;
    return normalizeAssetSymbol(raw);
  }

  extractKrakenBookPair(msg) {
    if (!this.isKrakenBookMessage(msg)) return null;
    for (let i = msg.length - 1; i >= 0; i--) {
      const part = msg[i];
      const pair = typeof part === 'string'
        ? part
        : (part && typeof part === 'object' && typeof part.pair === 'string' ? part.pair : null);
      if (pair && this.normalizeKrakenWsPair(pair)) return pair;
    }
    return null;
  }

  isKrakenBookMessage(msg) {
    if (!Array.isArray(msg) || msg.length < 4) return false;
    const channelName = msg[msg.length - 2];
    return typeof channelName === 'string' && /^book-\d+$/.test(channelName);
  }

  extractKrakenBookLevels(msg) {
    const result = {
      bids: [],
      asks: [],
      hasBookPayload: false
    };

    if (!this.isKrakenBookMessage(msg)) return result;

    for (let i = 1; i < msg.length - 2; i++) {
      const part = msg[i];
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue;

      const bidLevels = [];
      const askLevels = [];
      if (Array.isArray(part.bs)) bidLevels.push(...part.bs);
      if (Array.isArray(part.b)) bidLevels.push(...part.b);
      if (Array.isArray(part.as)) askLevels.push(...part.as);
      if (Array.isArray(part.a)) askLevels.push(...part.a);

      if (bidLevels.length > 0 || askLevels.length > 0) {
        result.hasBookPayload = true;
      }
      result.bids.push(...bidLevels);
      result.asks.push(...askLevels);
    }

    return result;
  }

  toKrakenWsPair(symbol) {
    const normalized = this.normalizeKrakenWsPair(symbol);
    if (!normalized || !this.isCanonicalDashboardSymbol(normalized)) return null;

    return ASSET_REGISTRY[normalized]?.krakenWs || null;
  }

  _collectConfiguredSymbols(value, out) {
    if (Array.isArray(value)) {
      for (const item of value) this._collectConfiguredSymbols(item, out);
      return;
    }
    if (typeof value !== 'string') return;
    for (const token of value.split(',')) {
      const trimmed = token.trim();
      if (trimmed) out.push(trimmed);
    }
  }

  resolveWebSocketPairs(config = {}) {
    const symbols = [];
    this._collectConfiguredSymbols(config.wsPairs, symbols);
    this._collectConfiguredSymbols(config.tradingPairs, symbols);
    this._collectConfiguredSymbols(config.symbols, symbols);
    this._collectConfiguredSymbols(config.tradingPair, symbols);

    const pairs = [];
    const seen = new Set();
    for (const symbol of symbols) {
      const pair = this.toKrakenWsPair(symbol);
      if (!pair) {
        throw new Error(`[Kraken] Invalid configured websocket symbol: ${symbol}`);
      }
      if (seen.has(pair)) continue;
      seen.add(pair);
      pairs.push(pair);
    }
    return pairs;
  }

  getWebSocketPairs(overrideSymbols = null) {
    const pairs = overrideSymbols
      ? this.resolveWebSocketPairs({ symbols: overrideSymbols })
      : this.wsPairs;

    if (!Array.isArray(pairs) || pairs.length === 0) {
      throw new Error('[Kraken] WebSocket stream requires config.tradingPair, config.symbols, config.tradingPairs, or explicit subscribe symbol');
    }
    return pairs;
  }

  resolveKrakenDashboardSymbol(symbol) {
    const canonical = normalizeAssetSymbol(symbol);
    const metadata = canonical ? ASSET_REGISTRY[canonical] : null;
    return metadata?.broker === 'kraken' ? canonical : null;
  }

  isCanonicalDashboardSymbol(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    return this.resolveKrakenDashboardSymbol(raw) === raw;
  }

  buildPriceCallbackFrame(symbol, price, volume, timestamp) {
    const canonicalSymbol = this.resolveKrakenDashboardSymbol(symbol);
    if (!canonicalSymbol) {
      console.error(`[Kraken] BUILD_PRICE_INVALID_SYMBOL: ${symbol || 'missing'}`);
      return null;
    }

    return {
      type: 'price',
      symbol: canonicalSymbol,
      asset: canonicalSymbol,
      price,
      close: price,
      volume,
      timestamp,
      source: 'kraken',
      data: {
        symbol: canonicalSymbol,
        asset: canonicalSymbol,
        price,
        close: price,
        volume,
        timestamp,
        source: 'kraken'
      }
    };
  }

  buildDepthCallbackFrame(symbol, bids, asks, timestamp = Date.now()) {
    const canonicalSymbol = this.resolveKrakenDashboardSymbol(symbol);
    if (!canonicalSymbol) {
      console.error(`[Kraken] BUILD_DEPTH_INVALID_SYMBOL: ${String(symbol)}`);
      return null;
    }

    const hasDepthSnapshot = (Array.isArray(bids) && bids.length > 10)
      || (Array.isArray(asks) && asks.length > 10);
    const depthTimestamp = Number(timestamp);
    const now = Number.isFinite(depthTimestamp) ? depthTimestamp : Date.now();
    const previousLiveAt = this.depthLiveSymbolTimestamps.get(canonicalSymbol);
    const stillFresh = Number.isFinite(previousLiveAt) && (now - previousLiveAt) <= this.dataTimeout;
    const isLive = hasDepthSnapshot || stillFresh;
    if (isLive) {
      this.depthLiveSymbolTimestamps.set(canonicalSymbol, now);
    } else {
      this.depthLiveSymbolTimestamps.delete(canonicalSymbol);
    }

    const frame = KrakenDepth.process({
      bids,
      asks,
      timestamp,
      source: 'kraken',
      isLive
    }, {
      symbol: canonicalSymbol,
      timestamp,
      source: 'kraken',
      isLive
    });
    if (!frame) {
      console.warn(`[Kraken] WS_BOOK_INVALID_LEVELS: no usable bid/ask levels for ${canonicalSymbol}`);
    }
    return frame;
  }

  subscribeOrderBookPair(symbol) {
    const pair = this.toKrakenWsPair(symbol);
    if (!pair) {
      throw new Error(`[Kraken] subscribeOrderBookPair requires valid symbol: ${String(symbol)}`);
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    if (this.bookSubscriptions.has(pair)) return true;

    this.ws.send(JSON.stringify({
      event: 'subscribe',
      pair: [pair],
      subscription: { name: 'book', depth: 25 }
    }));
    this.bookSubscriptions.add(pair);
    return true;
  }

  validateOrder(order) {
    const errors = [];
    let symbol = null;
    let quantity = null;

    if (!order.symbol) {
      errors.push('Symbol is required');
    } else {
      symbol = this.normalizeKrakenWsPair(order.symbol);
      if (!symbol || !this.isCanonicalDashboardSymbol(symbol)) {
        errors.push(`Invalid order symbol: ${order.symbol}`);
      }
    }
    if (!order.side || !['buy', 'sell'].includes(order.side)) {
      errors.push('Side must be "buy" or "sell"');
    }
    if (!order.type || !this.capabilities.orderTypes.includes(order.type)) {
      errors.push(`Order type must be one of: ${this.capabilities.orderTypes.join(', ')}`);
    }
    const rawQuantity = Number(order.quantity);
    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    if (symbol) {
      // Check if symbol exists
      const krakenSymbol = this.convertToKrakenSymbol(symbol);
      const pair = this.assetPairs.get(krakenSymbol);
      if (!pair) {
        errors.push(`Symbol ${symbol} not found in Kraken asset pairs`);
      } else {
        const lotDecimals = Number(pair.lot_decimals);
        if (!Number.isInteger(lotDecimals) || lotDecimals < 0) {
          errors.push(`Kraken lot_decimals missing for ${symbol}`);
        } else if (Number.isFinite(rawQuantity) && rawQuantity > 0) {
          const precisionFactor = 10 ** lotDecimals;
          quantity = Math.floor(rawQuantity * precisionFactor) / precisionFactor;
          if (!Number.isFinite(quantity) || quantity <= 0) {
            errors.push(`Order quantity ${rawQuantity} rounds below precision for ${symbol}`);
          }
        }

        // Check minimum order size
        const minOrder = parseFloat(pair.ordermin || 0);
        if (quantity !== null && quantity < minOrder) {
          errors.push(`Order quantity ${quantity} below minimum ${minOrder}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      symbol,
      quantity
    };
  }

  async placeOrder(order) {
    // Validate order first
    const validation = this.validateOrder(order);
    if (!validation.valid) {
      throw new Error(`Order validation failed: ${validation.errors.join(', ')}`);
    }

    const symbol = validation.symbol;
    const quantity = validation.quantity;
    // Convert to Kraken format
    const krakenSymbol = this.convertToKrakenSymbol(symbol);

    const orderData = {
      pair: krakenSymbol,
      type: order.side,
      ordertype: order.type,
      volume: quantity.toString()
    };

    if (order.type === 'limit' && order.price) {
      orderData.price = order.price.toString();
    }

    try {
      const response = await this.makePrivateRequest('/0/private/AddOrder', orderData);

      if (response.error && response.error.length > 0) {
        throw new Error(`Order error: ${response.error.join(', ')}`);
      }

      return {
        orderId: response.result.txid[0],
        status: 'pending',
        symbol,
        side: order.side,
        type: order.type,
        quantity,
        price: order.price
      };
    } catch (error) {
      recordKrakenAuthFailureIfRelevant(error, 'rest-place-order');
      throw new Error(`Failed to place order: ${error.message}`);
    }
  }

  // Execute trade method called by bot - translates bot format to Kraken format
  async executeTrade(params) {
    const { direction, positionSize, confidence, marketData } = params;

    const rawSymbol = marketData?.symbol;
    if (!rawSymbol) {
      throw new Error('Kraken executeTrade requires marketData.symbol; refusing to default execution symbol');
    }

    const symbol = this.normalizeKrakenWsPair(rawSymbol);
    if (!symbol || !this.isCanonicalDashboardSymbol(symbol)) {
      throw new Error(`Kraken executeTrade received invalid marketData.symbol: ${rawSymbol}`);
    }

    // Convert direction to Kraken side (buy/sell)
    const side = String(direction || '').toLowerCase();
    if (!['buy', 'sell'].includes(side)) {
      throw new Error(`Kraken executeTrade invalid direction: ${direction}`);
    }

    // Use market orders for live trading
    const orderType = 'market';

    // Calculate quantity from the explicit decision price. Do not size a live
    // order from cached adapter state; stale cache can mis-size execution.
    const marketPrice = Number(marketData?.price?.price ?? marketData?.price);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new Error(`Kraken executeTrade requires positive marketData.price for ${symbol}`);
    }

    const numericPositionSize = Number(positionSize);
    if (!Number.isFinite(numericPositionSize) || numericPositionSize <= 0) {
      throw new Error(`Invalid position size for ${symbol}: ${positionSize}`);
    }

    const quantity = numericPositionSize / marketPrice; // Convert position size to coin quantity

    // Validate quantity
    if (isNaN(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity calculated: ${quantity} for position size ${numericPositionSize} at price ${marketPrice}`);
    }

    console.log(`[Kraken] EXECUTING LIVE ${side.toUpperCase()} ORDER: ${quantity.toFixed(8)} ${symbol.split('-')[0]} at market price`);

    // Place the order
    const order = {
      symbol,
      side,
      type: orderType,
      quantity
    };

    const result = await this.placeOrder(order);

    console.log(`[Kraken] LIVE ORDER PLACED: ${result.orderId} - ${side} ${quantity.toFixed(8)} ${symbol.split('-')[0]}`);

    return result;
  }

  async getMarketData(symbol) {
    const krakenSymbol = this.convertToKrakenSymbol(symbol);

    try {
      const response = await axios.get(`${this.baseUrl}/0/public/Ticker?pair=${krakenSymbol}`);

      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Market data error: ${response.data.error.join(', ')}`);
      }

      const ticker = response.data.result[krakenSymbol];
      if (!ticker) {
        throw new Error(`No market data found for ${symbol}`);
      }

      // FIX: Validate Kraken message data before returning
      const price = parseFloat(ticker.c[0]);
      const bid = parseFloat(ticker.b[0]);
      const ask = parseFloat(ticker.a[0]);
      const volume = parseFloat(ticker.v[1]);

      if (isNaN(price) || price <= 0 ||
          isNaN(bid) || bid <= 0 ||
          isNaN(ask) || ask <= 0 ||
          isNaN(volume) || volume < 0) {
        throw new Error(`Invalid market data received from Kraken: price=${price}, bid=${bid}, ask=${ask}, volume=${volume}`);
      }

      // FIX: Extract 24h high/low/open for accurate market context
      const high24h = parseFloat(ticker.h?.[1] || ticker.h?.[0] || 0);
      const low24h = parseFloat(ticker.l?.[1] || ticker.l?.[0] || 0);
      const open24h = parseFloat(ticker.o || 0);

      return {
        symbol,
        price, // Last trade price
        bid,   // Bid price
        ask,   // Ask price
        volume, // 24h volume
        high24h,  // 24h high
        low24h,   // 24h low
        open24h,  // 24h open (today's open)
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Failed to get market data: ${error.message}`);
    }
  }

  supportsSymbol(symbol) {
    try {
      const krakenSymbol = this.convertToKrakenSymbol(symbol);
      return this.assetPairs.has(krakenSymbol);
    } catch {
      return false;
    }
  }

  isCryptoSymbol(symbol) {
    return this.capabilities.crypto; // All Kraken symbols are crypto
  }

  // Add WebSocket streaming for real-time price data
  async connectWebSocketStream(symbolOrCallback, maybeCallback) {
    const explicitSymbols = typeof symbolOrCallback === 'string'
      ? [symbolOrCallback]
      : Array.isArray(symbolOrCallback)
        ? symbolOrCallback
        : null;
    const onPriceUpdate = typeof symbolOrCallback === 'function'
      ? symbolOrCallback
      : typeof maybeCallback === 'function'
        ? maybeCallback
        : null;

    try {
      // Public WebSocket for market data (no auth needed for public feeds)
      this.ws = new WebSocket('wss://ws.kraken.com');

      this.ws.on('open', () => {
        console.log('[Kraken] WebSocket connected');
        let wsPairs;
        try {
          wsPairs = this.getWebSocketPairs(explicitSymbols);
        } catch (error) {
          console.error(`[Kraken] WebSocket subscription refused: ${error.message}`);
          this.connected = false;
          try {
            this.ws.close();
          } catch (closeError) {
            console.error(`[Kraken] WebSocket close after subscription refusal failed: ${closeError.message}`);
          }
          return;
        }

        // FIX 2026-02-04: Set connected flag so onclose handler will auto-reconnect
        // THIS WAS THE BUG: connectWebSocketStream() never set this.connected = true
        // So when WebSocket closed, reconnect logic was skipped (if this.connected check failed)
        this.connected = true;

        // CHANGE 2026-01-16: Reset reconnect counter on successful connection
        // Without this, counter accumulates across disconnects and eventually hits max
        if (this.reconnectAttempts > 0) {
          console.log(`[Kraken] Reconnect successful after ${this.reconnectAttempts} attempts - resetting counter`);
          this.reconnectAttempts = 0;
        }

        // V2 ARCHITECTURE FIX: Single source subscribes to ALL data types
        // Subscribe to both ticker AND OHLC data
        const tickerSub = {
          event: 'subscribe',
          pair: wsPairs,
          subscription: {
            name: 'ticker'
          }
        };

        // CHANGE 2026-01-29: Subscribe to multiple OHLC timeframes for dashboard
        // Kraken intervals: 1=1m, 5=5m, 15=15m, 30=30m, 60=1h, 240=4h, 1440=1d
        const ohlcIntervals = [1, 5, 15, 30, 60, 240, 1440];

        this.ws.send(JSON.stringify(tickerSub));

        for (const interval of ohlcIntervals) {
          const ohlcSub = {
            event: 'subscribe',
            pair: wsPairs,
            subscription: {
              name: 'ohlc',
              interval: interval
            }
          };
          this.ws.send(JSON.stringify(ohlcSub));
        }
        // Subscribe to order book for depth/whale wall detection
        const bookSub = {
          event: 'subscribe',
          pair: wsPairs,
          subscription: { name: 'book', depth: 25 }
        };
        this.ws.send(JSON.stringify(bookSub));
        this.bookSubscriptions.clear();
        this.depthLiveSymbolTimestamps.clear();
        for (const pair of wsPairs) this.bookSubscriptions.add(pair);
        console.log(`[Kraken] Multi-timeframe subscribed to ticker + OHLC (1m, 5m, 15m, 30m, 1h, 4h, 1d) + book (depth 25) for ${wsPairs.join(',')}`);

        // CHANGE 2026-01-21: Start heartbeat ping interval to keep connection alive
        // Kraken closes idle connections - this prevents that
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30000); // Ping every 30 seconds
        console.log('[Kraken] Heartbeat started (30s ping interval)');

        // CHANGE 2026-01-23: Data watchdog - force reconnect if no data even if socket "open"
        // This catches silent failures where TCP stays alive but Kraken stops sending
        if (this.dataWatchdogInterval) clearInterval(this.dataWatchdogInterval);
        this.lastDataReceived = Date.now(); // Reset on fresh connection
        this.dataWatchdogInterval = setInterval(() => {
          const timeSinceData = Date.now() - this.lastDataReceived;
          if (timeSinceData > this.dataTimeout) {
            console.error(`[Kraken] DATA WATCHDOG: No data for ${Math.round(timeSinceData/1000)}s - forcing reconnect`);
            // Force close to trigger reconnect logic
            if (this.ws) {
              this.ws.terminate(); // Hard close, don't wait for graceful
            }
          }
        }, 30000); // Check every 30 seconds
        console.log('[Kraken] Data watchdog started (60s timeout)');
      });

      // CHANGE 2026-01-21: Respond to server pings to prevent timeout
      this.ws.on('ping', () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.pong();
        }
      });

      // CHANGE 2026-01-21: Track pong responses for connection health
      this.ws.on('pong', () => {
        this.lastPong = Date.now();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          // Kraken sends various message types, filter for ticker updates
          if (Array.isArray(msg) && msg[2] === 'ticker') {
            const tickerData = msg[1];

            // CHANGE 2026-01-23: Update data watchdog timestamp
            this.lastDataReceived = Date.now();

            // FIX #2: Validate price message shape and value
            const price = parseFloat(tickerData?.c?.[0]);
            if (isNaN(price) || price <= 0) {
              console.log('[Kraken] WS_PRICE_INVALID: Ignoring malformed Kraken message');
              return;
            }

            const symbol = this.normalizeKrakenWsPair(msg[3]);
            if (!symbol) {
              console.error(`[Kraken] WS_PRICE_UNATTRIBUTED: missing/unmapped ticker pair (${msg[3] || 'missing'})`);
              return;
            }
            if (!this.isCanonicalDashboardSymbol(symbol)) {
              console.error(`[Kraken] WS_PRICE_INVALID_SYMBOL: ${symbol}`);
              return;
            }

            const timestamp = Date.now();
            const volume = parseFloat(tickerData?.v?.[1]) || 0;

            // Store latest price for fallback access
            this.currentPrices.set(symbol, {
              price: price,
              timestamp,
              volume, // 24h volume
              source: 'kraken'
            });

            // Call the callback with price update
            if (onPriceUpdate) {
              const frame = this.buildPriceCallbackFrame(symbol, price, volume, timestamp);
              if (!frame) return;
              onPriceUpdate(frame);
            }
          }

          // V2 ARCHITECTURE: Handle OHLC data for ALL timeframes
          // CHANGE 2026-01-29: Support multi-timeframe (ohlc-1, ohlc-5, ohlc-15, ohlc-30, ohlc-60, ohlc-1440)
          if (Array.isArray(msg) && typeof msg[2] === 'string' && msg[2].startsWith('ohlc-')) {
            // CHANGE 2026-01-23: Update data watchdog timestamp
            this.lastDataReceived = Date.now();

            // OHLC data format: [channelID, ohlcArray, channelName, pair]
            const ohlcData = msg[1];
            const channelName = msg[2];  // e.g., 'ohlc-1', 'ohlc-5', 'ohlc-15'
            const pair = msg[3];
            const symbol = this.normalizeKrakenWsPair(pair);
            if (!symbol) {
              console.error(`[Kraken] WS_OHLC_UNATTRIBUTED: missing/unmapped OHLC pair (${pair || 'missing'})`);
              return;
            }
            if (!this.isCanonicalDashboardSymbol(symbol)) {
              console.error(`[Kraken] WS_OHLC_INVALID_SYMBOL: ${symbol}`);
              return;
            }

            // Extract interval from channel name (ohlc-1 → 1, ohlc-60 → 60)
            const interval = parseInt(channelName.split('-')[1], 10);

            // Map Kraken intervals to readable timeframes
            const intervalToTimeframe = {
              1: '1m', 5: '5m', 15: '15m', 30: '30m',
              60: '1h', 240: '4h', 1440: '1d'
            };
            const timeframe = intervalToTimeframe[interval] || `${interval}m`;

            // Emit raw OHLC for KrakenIBrokerAdapter with timeframe info
            if (onPriceUpdate) {
              onPriceUpdate({
                type: 'ohlc',
                data: ohlcData,
                pair: pair,
                symbol,
                timeframe: timeframe,
                interval: interval,
                timestamp: Date.now()
              });
            }
          }

          // Handle order book data for depth/whale wall detection
          if (this.isKrakenBookMessage(msg)) {
            const bookLevels = this.extractKrakenBookLevels(msg);
            if (!bookLevels.hasBookPayload) return;
            const bids = bookLevels.bids;
            const asks = bookLevels.asks;
            const pair = this.extractKrakenBookPair(msg);
            const symbol = this.normalizeKrakenWsPair(pair);
            if (!symbol) {
              console.error(`[Kraken] WS_BOOK_UNATTRIBUTED: missing/unmapped book pair (${String(pair)})`);
              return;
            }
            if (!this.isCanonicalDashboardSymbol(symbol)) {
              console.error(`[Kraken] WS_BOOK_INVALID_SYMBOL: ${symbol}`);
              return;
            }
            if (bids.length > 0 || asks.length > 0) {
              const timestamp = Date.now();
              const depthFrame = this.buildDepthCallbackFrame(symbol, bids, asks, timestamp);
              if (!depthFrame) return;

              // Store latest book frame per symbol for direct inspection.
              this.lastBookSnapshots.set(symbol, depthFrame);
              this.lastBookSnapshot = depthFrame;

              if (onPriceUpdate) {
                onPriceUpdate(depthFrame);
              }
              if (this.onBookUpdate) {
                this.onBookUpdate(depthFrame);
              }
            }
          }
        } catch (err) {
          console.warn(`[Kraken] WS_MESSAGE_PARSE_FAILED: ${err.message}`);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[Kraken] WebSocket error:', error.message);
      });

      this.ws.on('close', () => {
        console.log('[Kraken] WebSocket disconnected');
        this.depthLiveSymbolTimestamps.clear();
        this.bookSubscriptions.clear();

        // CHANGE 2026-01-21: Clear heartbeat interval on disconnect
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        // CHANGE 2026-01-23: Clear data watchdog on disconnect
        if (this.dataWatchdogInterval) {
          clearInterval(this.dataWatchdogInterval);
          this.dataWatchdogInterval = null;
        }

        // CHANGE 2026-01-21: Never give up on reconnects - keep trying forever
        // This is critical for stability - a trading bot must stay connected
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }

        // Only reconnect if we were intentionally connected (not manually disconnected)
        if (this.connected) {
          this.reconnectAttempts++;

          // Exponential backoff: 5s, 10s, 20s, 40s... capped at 5 minutes
          const baseDelay = 5000;
          const maxDelay = 300000; // 5 minutes max
          const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);

          // Log warning at certain thresholds but NEVER stop trying
          if (this.reconnectAttempts === 10) {
            console.warn('[Kraken] WS_RECONNECT: 10 attempts failed - will keep trying (check network?)');
          } else if (this.reconnectAttempts === 50) {
            console.error('[Kraken] WS_RECONNECT: 50 attempts failed - serious connectivity issue');
          }

          console.log(`[Kraken] WS_RECONNECT delay=${Math.round(delay/1000)}s attempt=${this.reconnectAttempts}`);

          this.reconnectTimeout = setTimeout(() => {
            // Cleanup old websocket
            if (this.ws) {
              this.ws.removeAllListeners();
              try { this.ws.close(); } catch(e) {}
              try { this.ws.terminate(); } catch(e) {}
              this.ws = null;
            }
            this.reconnectTimeout = null;
            this.connectWebSocketStream(onPriceUpdate);
          }, delay);
        }
      });

      return true;
    } catch (error) {
      recordKrakenAuthFailureIfRelevant(error, 'ws-auth-connect');
      console.error('[Kraken] Failed to connect Kraken WebSocket:', error.message);
      return false;
    }
  }

  /**
   * Get current price for an asset (used for fallback when WebSocket unavailable)
   */
  getCurrentPrice(asset = 'BTC-USD') {
    const priceData = this.currentPrices.get(asset);
    if (!priceData) {
      return null;
    }

    // Check if price is fresh (within last 60 seconds)
    const age = Date.now() - priceData.timestamp;
    if (age > 60000) {
      return null;
    }

    return priceData;
  }

  async disconnect() {
    // CHANGE 2026-01-21: Clear heartbeat interval on disconnect
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    // CHANGE 2026-01-23: Clear data watchdog on disconnect
    if (this.dataWatchdogInterval) {
      clearInterval(this.dataWatchdogInterval);
      this.dataWatchdogInterval = null;
    }
    this.depthLiveSymbolTimestamps.clear();
    this.bookSubscriptions.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    console.log('[Kraken] adapter disconnected');
    return true;
  }
}

module.exports = KrakenAdapterSimple;
module.exports.isKrakenAuthFailure = isKrakenAuthFailure;
module.exports.krakenAuthFailureText = krakenAuthFailureText;
