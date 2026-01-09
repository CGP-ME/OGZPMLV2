/**
 * ============================================================================
 * CoinbaseAdapter - Universal Broker Adapter for Coinbase
 * ============================================================================
 * 
 * Implements IBrokerAdapter for Coinbase Advanced API
 * Supports: BTC, ETH, SOL, XRP, ADA and 100+ crypto pairs
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const IBrokerAdapter = require('../foundation/IBrokerAdapter');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

class CoinbaseAdapter extends IBrokerAdapter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
        this.passphrase = config.passphrase;
        this.baseUrl = 'https://api.coinbase.com/api/v3';
        this.wsUrl = 'wss://advanced-trade-ws.coinbase.com';
        this.connected = false;
        this.ws = null;
        this.subscriptions = new Map();
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================

    async connect() {
        try {
            // Verify credentials by fetching account info
            const accounts = await this.getBalance();
            if (accounts) {
                this.connected = true;
                console.log('✅ Coinbase adapter connected');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Coinbase connection failed:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        console.log('🔌 Coinbase adapter disconnected');
        return true;
    }

    isConnected() {
        return this.connected && (!this.ws || this.ws.readyState === 1);
    }

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    generateAuthHeaders(method, path, body = '') {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = timestamp + method + path + body;
        
        const hmac = crypto.createHmac('sha256', Buffer.from(this.apiSecret, 'base64'));
        hmac.update(message);
        const signature = hmac.digest('base64');

        return {
            'CB-ACCESS-KEY': this.apiKey,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': timestamp,
            'CB-ACCESS-PASSPHRASE': this.passphrase,
            'Content-Type': 'application/json'
        };
    }

    // =========================================================================
    // ACCOUNT INFO
    // =========================================================================

    async getBalance() {
        try {
            const path = '/brokerage/accounts';
            const headers = this.generateAuthHeaders('GET', path);
            
            const response = await axios.get(`${this.baseUrl}${path}`, { headers });
            
            const balances = {};
            for (const account of response.data.accounts) {
                balances[account.currency] = parseFloat(account.available_balance.value);
            }
            return balances;
        } catch (error) {
            throw new Error(`Failed to get balance: ${error.message}`);
        }
    }

    async getPositions() {
        // Coinbase doesn't support margin/futures in this adapter
        // Return only held balances
        const balance = await this.getBalance();
        const positions = [];
        
        Object.entries(balance).forEach(([asset, amount]) => {
            if (amount > 0) {
                positions.push({
                    symbol: asset,
                    size: amount,
                    side: 'long',
                    entryPrice: null
                });
            }
        });
        
        return positions;
    }

    async getOpenOrders() {
        try {
            const path = '/brokerage/orders/batch';
            const headers = this.generateAuthHeaders('GET', path);
            
            const response = await axios.get(`${this.baseUrl}${path}`, {
                headers,
                params: { limit: 100 }
            });
            
            return response.data.orders.map(order => ({
                orderId: order.order_id,
                symbol: order.product_id,
                type: order.order_type,
                side: order.side,
                price: parseFloat(order.price),
                amount: parseFloat(order.filled_size),
                status: order.status
            }));
        } catch (error) {
            throw new Error(`Failed to get open orders: ${error.message}`);
        }
    }

    // =========================================================================
    // ORDER MANAGEMENT
    // =========================================================================

    async placeOrder(order) {
        const { symbol, side, amount, price, type, options = {} } = order;

        const orderData = {
            client_order_id: `${side.toLowerCase()}-${Date.now()}`,
            product_id: this._toBrokerSymbol(symbol),
            side: side.toUpperCase(),
            order_configuration: {
                base_size: amount.toString()
            }
        };

        const isLimit = type === 'LIMIT' || (type !== 'MARKET' && price);

        if (isLimit) {
            if (!price) throw new Error('Price required for LIMIT order');
            orderData.order_configuration.limit_price = price.toString();
        } else {
            orderData.order_configuration.market_market_ioc = {};
        }

        if (options.stopLoss) {
            orderData.order_configuration.stop_loss = {
                stop_price: options.stopLoss.toString()
            };
        }

        try {
            const path = '/brokerage/orders';
            const body = JSON.stringify(orderData);
            const headers = this.generateAuthHeaders('POST', path, body);
            
            const response = await axios.post(`${this.baseUrl}${path}`, orderData, { headers });
            
            return {
                orderId: response.data.order_id,
                status: response.data.status,
                symbol: response.data.product_id,
                side: response.data.side,
                price: response.data.price,
                amount: response.data.base_size
            };
        } catch (error) {
            throw new Error(`Failed to place order: ${error.message}`);
        }
    }

    async cancelOrder(orderId) {
        try {
            const path = `/brokerage/orders/batch/cancel`;
            const body = JSON.stringify({ order_ids: [orderId] });
            const headers = this.generateAuthHeaders('POST', path, body);
            
            await axios.post(`${this.baseUrl}${path}`, { order_ids: [orderId] }, { headers });
            return true;
        } catch (error) {
            console.error(`Failed to cancel order: ${error.message}`);
            return false;
        }
    }

    async modifyOrder(orderId, modifications) {
        // Coinbase doesn't support order modification - must cancel and recreate
        await this.cancelOrder(orderId);
        // Return null - caller should place new order
        return null;
    }

    async getOrderStatus(orderId) {
        try {
            const path = `/brokerage/orders/historical/${orderId}`;
            const headers = this.generateAuthHeaders('GET', path);
            
            const response = await axios.get(`${this.baseUrl}${path}`, { headers });
            
            return {
                orderId: response.data.order_id,
                status: response.data.status,
                filledAmount: parseFloat(response.data.filled_size),
                remainingAmount: parseFloat(response.data.size) - parseFloat(response.data.filled_size)
            };
        } catch (error) {
            throw new Error(`Failed to get order status: ${error.message}`);
        }
    }

    // =========================================================================
    // MARKET DATA
    // =========================================================================

    async getTicker(symbol) {
        try {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const response = await axios.get(`${this.baseUrl}/brokerage/product/${brokerSymbol}`);
            
            return {
                bid: parseFloat(response.data.bid),
                ask: parseFloat(response.data.ask),
                last: parseFloat(response.data.price),
                volume: parseFloat(response.data.volume_24h)
            };
        } catch (error) {
            throw new Error(`Failed to get ticker: ${error.message}`);
        }
    }

    async getCandles(symbol, timeframe = '1m', limit = 100) {
        try {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const granularity = this._timeframeToGranularity(timeframe);
            
            const response = await axios.get(
                `${this.baseUrl}/brokerage/products/${brokerSymbol}/candles`,
                {
                    params: {
                        granularity: granularity,
                        limit: Math.min(limit, 300)
                    }
                }
            );
            
            return response.data.candles.map(candle => ({
                t: candle[0],
                o: parseFloat(candle[3]),
                h: parseFloat(candle[2]),
                l: parseFloat(candle[1]),
                c: parseFloat(candle[4]),
                v: parseFloat(candle[5])
            }));
        } catch (error) {
            throw new Error(`Failed to get candles: ${error.message}`);
        }
    }

    async getOrderBook(symbol, depth = 20) {
        try {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const response = await axios.get(
                `${this.baseUrl}/brokerage/product_book/${brokerSymbol}`,
                { params: { limit: depth } }
            );
            
            return {
                bids: response.data.bids.map(bid => [parseFloat(bid[0]), parseFloat(bid[1])]),
                asks: response.data.asks.map(ask => [parseFloat(ask[0]), parseFloat(ask[1])])
            };
        } catch (error) {
            throw new Error(`Failed to get order book: ${error.message}`);
        }
    }

    // =========================================================================
    // REAL-TIME SUBSCRIPTIONS
    // =========================================================================

    subscribeToTicker(symbol, callback) {
        this._ensureWebSocketConnected(() => {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const subscriptionId = `ticker-${brokerSymbol}`;
            
            this.subscriptions.set(subscriptionId, callback);
            
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                product_ids: [brokerSymbol],
                channel: 'ticker'
            }));
        });
    }

    subscribeToCandles(symbol, timeframe, callback) {
        this._ensureWebSocketConnected(() => {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const subscriptionId = `candles-${brokerSymbol}-${timeframe}`;
            
            this.subscriptions.set(subscriptionId, callback);
            
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                product_ids: [brokerSymbol],
                channel: 'candles',
                interval: this._timeframeToGranularity(timeframe)
            }));
        });
    }

    subscribeToOrderBook(symbol, callback) {
        this._ensureWebSocketConnected(() => {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const subscriptionId = `orderbook-${brokerSymbol}`;
            
            this.subscriptions.set(subscriptionId, callback);
            
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                product_ids: [brokerSymbol],
                channel: 'level2'
            }));
        });
    }

    subscribeToAccount(callback) {
        // Requires authenticated WebSocket
        if (!this.apiKey) {
            console.warn('⚠️ Account subscriptions require API credentials');
            return;
        }
        
        this._ensureWebSocketConnected(() => {
            this.subscriptions.set('account', callback);
            
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                channel: 'user',
                product_ids: ['*']
            }));
        });
    }

    unsubscribeAll() {
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({
                type: 'unsubscribe',
                channel: 'ticker'
            }));
            this.subscriptions.clear();
        }
    }

    // =========================================================================
    // ASSET INFORMATION
    // =========================================================================

    getAssetType() {
        return 'crypto';
    }

    getBrokerName() {
        return 'coinbase';
    }

    async getSupportedSymbols() {
        try {
            const response = await axios.get(`${this.baseUrl}/brokerage/products`);
            return response.data.products.map(p => p.id);
        } catch (error) {
            console.error('Failed to get supported symbols:', error.message);
            return [];
        }
    }

    getMinOrderSize(symbol) {
        // Varies by symbol - defaults to $1 minimum
        return 1;
    }

    getFees() {
        return {
            maker: 0.004,  // 0.4%
            taker: 0.006   // 0.6%
        };
    }

    isTradeableNow(symbol) {
        // Crypto trades 24/7
        return true;
    }

    // =========================================================================
    // SYMBOL NORMALIZATION
    // =========================================================================

    _toBrokerSymbol(symbol) {
        // Convert "BTC/USD" to "BTC-USD"
        return symbol.replace('/', '-').toUpperCase();
    }

    fromBrokerSymbol(brokerSymbol) {
        return brokerSymbol.replace('-', '/');
    }

    _timeframeToGranularity(timeframe) {
        const map = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '1h': 3600,
            '4h': 14400,
            '1d': 86400
        };
        return map[timeframe] || 60;
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    _ensureWebSocketConnected(callback) {
        if (!this.ws || this.ws.readyState !== 1) {
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.on('open', () => {
                callback();
            });
            
            this.ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    this._handleWebSocketMessage(msg);
                } catch (error) {
                    // Ignore non-JSON messages
                }
            });
            
            this.ws.on('error', (error) => {
                console.error('Coinbase WebSocket error:', error.message);
            });
        } else {
            callback();
        }
    }

    _handleWebSocketMessage(msg) {
        if (msg.type === 'ticker') {
            const subscriptionId = `ticker-${msg.product_id}`;
            const callback = this.subscriptions.get(subscriptionId);
            if (callback) {
                callback({
                    symbol: this.fromBrokerSymbol(msg.product_id),
                    price: parseFloat(msg.price),
                    bid: parseFloat(msg.best_bid),
                    ask: parseFloat(msg.best_ask),
                    volume: parseFloat(msg.volume_24h)
                });
            }
        } else if (msg.type === 'candles') {
            const subscriptionId = `candles-${msg.product_id}`;
            const callback = this.subscriptions.get(subscriptionId);
            if (callback) {
                callback({
                    t: msg.start,
                    o: parseFloat(msg.open),
                    h: parseFloat(msg.high),
                    l: parseFloat(msg.low),
                    c: parseFloat(msg.close),
                    v: parseFloat(msg.volume)
                });
            }
        }
    }
}

module.exports = CoinbaseAdapter;
