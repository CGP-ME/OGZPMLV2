/**
 * Uphold Adapter for Empire V2
 *
 * Uphold is unique - supports crypto, forex, AND precious metals!
 *
 * Features:
 * - 200+ currencies including crypto, fiat, and metals
 * - Instant currency conversion
 * - REST API v2
 * - OAuth2 authentication
 * - Low fees (0.8% - 1.95%)
 */

const IBrokerAdapter = require('./IBrokerAdapter');
const axios = require('axios');
const crypto = require('crypto');

class UpholdAdapter extends IBrokerAdapter {
  constructor(config) {
    super();
    this.config = {
      clientId: config.clientId || process.env.UPHOLD_CLIENT_ID,
      clientSecret: config.clientSecret || process.env.UPHOLD_CLIENT_SECRET,
      accessToken: config.accessToken || process.env.UPHOLD_ACCESS_TOKEN,
      sandbox: config.sandbox || false,
      ...config
    };

    // API endpoints
    this.baseUrl = this.config.sandbox
      ? 'https://api-sandbox.uphold.com'
      : 'https://api.uphold.com';

    this.connected = false;
    this.accountInfo = null;
    this.cards = []; // Uphold uses "cards" as wallets

    // Rate limiting (Uphold: 500 requests per 5 minutes)
    this.requestQueue = [];
    this.requestsPerMinute = 100;
    this.lastRequestTime = 0;

    console.log('🌐 Uphold adapter initialized' + (this.config.sandbox ? ' (SANDBOX)' : ''));
  }

  /**
   * Make authenticated request to Uphold
   */
  async _request(endpoint, method = 'GET', data = null) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`❌ Uphold API error: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  /**
   * Make public request (no auth needed)
   */
  async _publicRequest(endpoint) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Uphold public API error: ${error.message}`);
      throw error;
    }
  }

  // CONNECTION MANAGEMENT
  async connect() {
    try {
      // Test connection and get user info
      this.accountInfo = await this._request('/v0/me');

      // Get all cards (wallets)
      this.cards = await this._request('/v0/me/cards');

      console.log(`✅ Connected to Uphold as ${this.accountInfo.username}`);
      console.log(`   Found ${this.cards.length} cards (wallets)`);

      this.connected = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Uphold:', error.message);
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    console.log('📴 Disconnected from Uphold');
  }

  isConnected() {
    return this.connected;
  }

  // ACCOUNT INFO
  async getBalance() {
    try {
      // Refresh cards to get latest balances
      this.cards = await this._request('/v0/me/cards');

      const balance = {
        total: 0,
        free: 0,
        used: 0,
        currencies: {}
      };

      // Aggregate balances from all cards
      for (const card of this.cards) {
        const currency = card.currency;
        const available = parseFloat(card.available || 0);
        const cardBalance = parseFloat(card.balance || 0);

        if (!balance.currencies[currency]) {
          balance.currencies[currency] = {
            total: 0,
            free: 0,
            used: 0
          };
        }

        balance.currencies[currency].total += cardBalance;
        balance.currencies[currency].free += available;
        balance.currencies[currency].used += (cardBalance - available);

        // Convert to USD for total (simplified)
        if (currency === 'USD') {
          balance.total += cardBalance;
          balance.free += available;
          balance.used += (cardBalance - available);
        }
      }

      return balance;
    } catch (error) {
      console.error('❌ Failed to get balance:', error);
      return null;
    }
  }

  async getPositions() {
    // Uphold doesn't have "positions" - just balances in different currencies
    const balances = await this.getBalance();
    const positions = [];

    for (const [currency, data] of Object.entries(balances.currencies)) {
      if (data.total > 0 && currency !== 'USD') {
        positions.push({
          symbol: `${currency}/USD`,
          side: 'long',
          amount: data.total,
          entryPrice: 0, // Would need transaction history
          currentPrice: 0, // Would need ticker data
          pnl: 0,
          pnlPercent: 0
        });
      }
    }

    return positions;
  }

  async getOpenOrders(symbol = null) {
    // Uphold executes trades instantly, no open orders
    return [];
  }

  // ORDER MANAGEMENT (Uphold uses "transactions")
  async placeOrder(order) {
    const { symbol, side, amount, price, type, options = {} } = order;

    // Uphold only supports market orders
    if (type === 'LIMIT' || (price && type !== 'MARKET')) {
        throw new Error('Uphold only supports market orders (instant conversion)');
    }

    try {
      const [fromCurrency, toCurrency] = side.toLowerCase() === 'buy'
        ? ['USD', symbol.split('/')[0]]  // Buying crypto with USD
        : [symbol.split('/')[0], 'USD']; // Selling crypto for USD

      // Find source card
      const sourceCard = this.cards.find(c => c.currency === fromCurrency);
      if (!sourceCard) {
        throw new Error(`No ${fromCurrency} card found`);
      }

      // Create quote first
      const quote = await this._request(`/v0/me/cards/${sourceCard.id}/transactions/quote`, 'POST', {
        denomination: {
          amount: amount.toString(),
          currency: fromCurrency
        },
        destination: toCurrency
      });

      // Commit the transaction
      const transaction = await this._request(
        `/v0/me/cards/${sourceCard.id}/transactions/${quote.id}/commit`,
        'POST'
      );

      return {
        id: transaction.id,
        symbol: symbol,
        type: 'market', // Uphold only does market orders
        side: side,
        price: parseFloat(transaction.destination.rate || 0),
        amount: parseFloat(transaction.destination.amount || amount),
        status: transaction.status,
        timestamp: new Date(transaction.createdAt).getTime()
      };
    } catch (error) {
      console.error(`❌ Failed to place ${side} order:`, error);
      return null;
    }
  }

  async cancelOrder(orderId) {
    // Uphold transactions are instant, can't be cancelled
    return false;
  }

  async getOrderStatus(orderId) {
    try {
      const transaction = await this._request(`/v0/me/transactions/${orderId}`);

      return {
        id: transaction.id,
        symbol: `${transaction.origin.currency}/${transaction.destination.currency}`,
        status: transaction.status,
        filled: parseFloat(transaction.destination.amount || 0),
        remaining: 0, // Always 0 for Uphold
        avgPrice: parseFloat(transaction.destination.rate || 0)
      };
    } catch (error) {
      console.error('❌ Failed to get order status:', error);
      return null;
    }
  }

  // MARKET DATA
  async getTicker(symbol) {
    try {
      const [base, quote] = symbol.split('/');
      const ticker = await this._publicRequest(`/v0/ticker/${base}-${quote}`);

      return {
        symbol: symbol,
        bid: parseFloat(ticker.bid),
        ask: parseFloat(ticker.ask),
        last: parseFloat(ticker.ask), // Uphold doesn't provide last price
        volume: 0 // Uphold doesn't provide volume
      };
    } catch (error) {
      console.error('❌ Failed to get ticker:', error);
      return null;
    }
  }

  async getCandles(symbol, timeframe = '1h', limit = 100) {
    // Uphold doesn't provide historical data
    console.warn('⚠️ Candles not available for Uphold API');
    return [];
  }

  async getOrderBook(symbol, depth = 10) {
    // Uphold doesn't provide order book
    console.warn('⚠️ Order book not available for Uphold API');
    return {
      bids: [],
      asks: [],
      timestamp: Date.now()
    };
  }

  // REAL-TIME SUBSCRIPTIONS
  subscribeToTicker(symbol, callback) {
    // Uphold doesn't have WebSocket API - would need to poll
    console.warn('⚠️ Real-time subscriptions not available for Uphold');

    // Set up polling as fallback
    const pollInterval = setInterval(async () => {
      const ticker = await this.getTicker(symbol);
      if (ticker) {
        callback(ticker);
      }
    }, 5000); // Poll every 5 seconds

    // Store interval for cleanup
    if (!this.pollingIntervals) {
      this.pollingIntervals = [];
    }
    this.pollingIntervals.push(pollInterval);
  }

  unsubscribeAll() {
    if (this.pollingIntervals) {
      this.pollingIntervals.forEach(interval => clearInterval(interval));
      this.pollingIntervals = [];
    }
  }

  // ASSET INFO
  getAssetType() {
    return 'multi'; // Crypto, forex, and metals
  }

  getBrokerName() {
    return 'Uphold';
  }

  async getSupportedSymbols() {
    try {
      const assets = await this._publicRequest('/v0/assets');

      // Get all tradeable pairs
      const symbols = [];
      const cryptos = assets.filter(a => a.type === 'crypto');
      const fiats = assets.filter(a => a.type === 'fiat');
      const metals = assets.filter(a => a.type === 'commodity');

      // Add crypto/USD pairs
      cryptos.forEach(crypto => {
        symbols.push(`${crypto.code}/USD`);
      });

      // Add forex pairs
      symbols.push('EUR/USD', 'GBP/USD', 'JPY/USD', 'CHF/USD', 'AUD/USD');

      // Add metal pairs
      symbols.push('XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD'); // Gold, Silver, Platinum, Palladium

      return symbols;
    } catch (error) {
      console.error('❌ Failed to get supported symbols:', error);
      return [];
    }
  }

  async getMinOrderSize(symbol) {
    // Uphold minimums vary by asset
    const minimums = {
      'BTC/USD': 0.0001,
      'ETH/USD': 0.001,
      'XAU/USD': 0.001,  // Gold (troy ounces)
      'XAG/USD': 0.1,    // Silver (troy ounces)
      'EUR/USD': 1,      // Euros
      'GBP/USD': 1       // Pounds
    };

    // Default minimum $1
    return minimums[symbol] || 1;
  }

  getFees() {
    return {
      crypto: 0.0195,    // 1.95% for US
      forex: 0.008,      // 0.8% for major pairs
      metals: 0.008      // 0.8% for metals
    };
  }

  isTradeableNow(symbol) {
    // Uphold is 24/7 for crypto
    // Forex/metals follow traditional market hours
    if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('LTC')) {
      return true; // Crypto is 24/7
    }

    const now = new Date();
    const day = now.getDay();

    // Forex: Sunday 5 PM - Friday 5 PM ET
    // Metals: Similar hours
    if (day === 6) return false; // Saturday closed

    return true; // Simplified - should check specific hours
  }

  // SYMBOL NORMALIZATION
  _toBrokerSymbol(symbol) {
    // Convert BTC/USD to BTC-USD
    return symbol.replace('/', '-');
  }

  fromBrokerSymbol(brokerSymbol) {
    // Convert BTC-USD to BTC/USD
    return brokerSymbol.replace('-', '/');
  }

  // UPHOLD SPECIFIC FEATURES
  /**
   * Get available currencies and their networks
   */
  async getCurrencies() {
    return await this._publicRequest('/v0/assets');
  }

  /**
   * Create a new card (wallet) for a specific currency
   */
  async createCard(currency, label = null) {
    try {
      const card = await this._request('/v0/me/cards', 'POST', {
        currency: currency,
        label: label || `${currency} Card`
      });

      this.cards.push(card);
      console.log(`✅ Created new ${currency} card: ${card.id}`);
      return card;
    } catch (error) {
      console.error('❌ Failed to create card:', error);
      return null;
    }
  }
}

module.exports = UpholdAdapter;