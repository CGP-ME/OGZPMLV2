// Simplified Kraken Adapter for direct integration with trading bot
// Bypasses complex broker system due to permission issues

const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const WebSocket = require('ws');

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

    // WebSocket reconnect management
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimeout = null;

    // Rate limiting (Kraken API tier 2: 15 req/sec)
    this.requestWindow = 1000; // 1 second window
    this.maxRequestsPerWindow = 15;
    this.requestTimestamps = [];
    this.rateLimitBackoff = 1000; // Start at 1s for 429 errors

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
      // Test API credentials first
      await this.testCredentials();

      // Load asset pairs
      await this.loadAssetPairs();

      // Get WebSocket auth token
      await this.getAuthToken();

      this.connected = true;
      console.log('✅ Kraken adapter connected successfully');
      return true;
    } catch (error) {
      console.error('❌ Kraken connection failed:', error.message);
      return false;
    }
  }

  async testCredentials() {
    const response = await this.makePrivateRequest('/0/private/Balance');
    if (response.error && response.error.length > 0) {
      throw new Error(`API Error: ${response.error.join(', ')}`);
    }
    return response.result;
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

      console.log(`✅ Loaded ${this.assetPairs.size} asset pairs`);
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
      console.log('✅ WebSocket auth token obtained');
    } catch (error) {
      throw new Error(`Failed to get auth token: ${error.message}`);
    }
  }

  async makePrivateRequest(endpoint, data = {}) {
    // FIX #11: Rate limit enforcement (Kraken tier 2: 15 req/sec)
    await this.enforceRateLimit();

    const nonce = Date.now() * 1000;
    const postData = querystring.stringify({ nonce, ...data });

    // Create signature
    const secret = Buffer.from(this.apiSecret, 'base64');
    const hash = crypto.createHash('sha256').update(nonce + postData).digest();
    const hmac = crypto.createHmac('sha512', secret);
    hmac.update(endpoint, 'utf8');
    hmac.update(hash);
    const signature = hmac.digest('base64');

    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, postData, {
        headers: {
          'API-Key': this.apiKey,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Success - reset backoff
      this.rateLimitBackoff = 1000;
      return response.data;

    } catch (error) {
      // Handle 429 rate limit errors with exponential backoff
      if (error.response?.status === 429) {
        console.log(`⚠️ RATE_LIMIT_429: Waiting ${this.rateLimitBackoff}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, this.rateLimitBackoff));
        this.rateLimitBackoff = Math.min(this.rateLimitBackoff * 2, 8000); // Cap at 8s
        return this.makePrivateRequest(endpoint, data); // Retry
      }
      throw error;
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
        console.log(`⚠️ RATE_LIMIT_DELAY: ${waitTime}ms (${this.requestTimestamps.length}/${this.maxRequestsPerWindow} requests in window)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Add current request timestamp
    this.requestTimestamps.push(Date.now());
  }

  async getAccountBalance() {
    const response = await this.makePrivateRequest('/0/private/Balance');
    if (response.error && response.error.length > 0) {
      throw new Error(`Balance error: ${response.error.join(', ')}`);
    }
    return response.result;
  }

  async getPositions() {
    // Kraken doesn't have a direct positions endpoint for spot trading
    // Use balance to determine holdings
    const balance = await this.getAccountBalance();
    const positions = [];

    Object.entries(balance).forEach(([asset, amount]) => {
      if (parseFloat(amount) > 0) {
        positions.push({
          symbol: asset,
          quantity: parseFloat(amount),
          side: 'long'
        });
      }
    });

    return positions;
  }

  convertToKrakenSymbol(symbol) {
    // Convert standard format to Kraken format
    if (symbol === 'BTC-USD' || symbol === 'BTC/USD') {
      return 'XXBTZUSD';
    }
    // Add more conversions as needed
    return symbol.replace('-', '').replace('/', '');
  }

  validateOrder(order) {
    const errors = [];

    if (!order.symbol) errors.push('Symbol is required');
    if (!order.side || !['buy', 'sell'].includes(order.side)) {
      errors.push('Side must be "buy" or "sell"');
    }
    if (!order.type || !this.capabilities.orderTypes.includes(order.type)) {
      errors.push(`Order type must be one of: ${this.capabilities.orderTypes.join(', ')}`);
    }
    if (!order.quantity || order.quantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    // Check if symbol exists
    const krakenSymbol = this.convertToKrakenSymbol(order.symbol);
    const pair = this.assetPairs.get(krakenSymbol);
    if (!pair) {
      errors.push(`Symbol ${order.symbol} not found in Kraken asset pairs`);
    } else {
      // Check minimum order size
      const minOrder = parseFloat(pair.ordermin || 0);
      if (order.quantity < minOrder) {
        errors.push(`Order quantity ${order.quantity} below minimum ${minOrder}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async placeOrder(order) {
    // Validate order first
    const validation = this.validateOrder(order);
    if (!validation.valid) {
      throw new Error(`Order validation failed: ${validation.errors.join(', ')}`);
    }

    // Convert to Kraken format
    const krakenSymbol = this.convertToKrakenSymbol(order.symbol);

    const orderData = {
      pair: krakenSymbol,
      type: order.side,
      ordertype: order.type,
      volume: order.quantity.toString()
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
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price
      };
    } catch (error) {
      throw new Error(`Failed to place order: ${error.message}`);
    }
  }

  // Execute trade method called by bot - translates bot format to Kraken format
  async executeTrade(params) {
    const { direction, positionSize, confidence, marketData } = params;

    // Determine symbol from market data or use BTC-USD as default
    const symbol = marketData?.symbol || 'BTC-USD';

    // Convert direction to Kraken side (buy/sell)
    const side = direction === 'buy' ? 'buy' : 'sell';

    // Use market orders for live trading
    const orderType = 'market';

    // Calculate quantity based on position size and current price
    const price = marketData?.price || this.currentPrices.get(symbol);
    if (!price) {
      throw new Error(`No price available for ${symbol}`);
    }

    const quantity = positionSize / price; // Convert position size to coin quantity

    // Validate quantity
    if (isNaN(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity calculated: ${quantity} for position size ${positionSize} at price ${price}`);
    }

    console.log(`🔥 EXECUTING LIVE ${side.toUpperCase()} ORDER: ${quantity.toFixed(8)} ${symbol.split('-')[0]} at market price`);

    // Place the order
    const order = {
      symbol,
      side,
      type: orderType,
      quantity
    };

    const result = await this.placeOrder(order);

    console.log(`✅ LIVE ORDER PLACED: ${result.orderId} - ${side} ${quantity.toFixed(8)} ${symbol.split('-')[0]}`);

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

      return {
        symbol,
        price, // Last trade price
        bid,   // Bid price
        ask,   // Ask price
        volume, // 24h volume
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Failed to get market data: ${error.message}`);
    }
  }

  supportsSymbol(symbol) {
    const krakenSymbol = this.convertToKrakenSymbol(symbol);
    return this.assetPairs.has(krakenSymbol);
  }

  isCryptoSymbol(symbol) {
    return this.capabilities.crypto; // All Kraken symbols are crypto
  }

  // Add WebSocket streaming for real-time price data
  async connectWebSocketStream(onPriceUpdate) {
    try {
      // Public WebSocket for market data (no auth needed for public feeds)
      this.ws = new WebSocket('wss://ws.kraken.com');

      this.ws.on('open', () => {
        console.log('✅ Kraken WebSocket connected');

        // Subscribe to BTC-USD ticker
        const subscription = {
          event: 'subscribe',
          pair: ['XBT/USD'],  // Kraken uses XBT for Bitcoin
          subscription: {
            name: 'ticker'
          }
        };

        this.ws.send(JSON.stringify(subscription));
        console.log('📊 Subscribed to BTC-USD ticker stream');
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          // Kraken sends various message types, filter for ticker updates
          if (Array.isArray(msg) && msg[2] === 'ticker') {
            const tickerData = msg[1];

            // FIX #2: Validate price message shape and value
            const price = parseFloat(tickerData?.c?.[0]);
            if (isNaN(price) || price <= 0) {
              console.log('⚠️ WS_PRICE_INVALID: Ignoring malformed Kraken message');
              return;
            }

            // Store latest price for fallback access
            this.currentPrices.set('BTC-USD', {
              price: price,
              timestamp: Date.now(),
              volume: parseFloat(tickerData?.v?.[1]) || 0, // 24h volume
              source: 'kraken'
            });

            // Call the callback with price update
            if (onPriceUpdate) {
              onPriceUpdate({
                type: 'price',
                data: {
                  asset: 'BTC--USD',
                  price: price,
                  timestamp: Date.now(),
                  source: 'kraken'
                }
              });
            }
          }
        } catch (err) {
          // Ignore non-JSON messages (Kraken sends heartbeats)
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ Kraken WebSocket error:', error.message);
      });

      this.ws.on('close', () => {
        console.log('🔌 Kraken WebSocket disconnected');

        // FIX #1: Cleanup and exponential backoff reconnect with max attempts
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts && this.connected) {
          this.reconnectAttempts++;

          // Exponential backoff: 5s, 10s, 20s, 40s, capped at 60s
          const baseDelay = 5000;
          const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 60000);

          console.log(`🔄 WS_RECONNECT delay=${delay}ms attempt=${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

          this.reconnectTimeout = setTimeout(() => {
            // Cleanup old websocket
            if (this.ws) {
              this.ws.removeAllListeners();
              this.ws.close();
              this.ws.terminate();
              this.ws = null;
            }
            if (this.reconnectTimeout) {
              this.reconnectTimeout = null;
            }
            this.connectWebSocketStream(onPriceUpdate);
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log(`🚫 WS_RECONNECT max attempts (${this.maxReconnectAttempts}) reached, stopping reconnect`);
        }
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to connect Kraken WebSocket:', error.message);
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    console.log('🔌 Kraken adapter disconnected');
    return true;
  }
}

module.exports = KrakenAdapterSimple;