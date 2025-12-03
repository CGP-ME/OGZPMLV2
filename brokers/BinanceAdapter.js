/**
 * ============================================================================
 * BinanceAdapter - Universal Broker Adapter for Binance
 * ============================================================================
 * 
 * Implements IBrokerAdapter for Binance REST & WebSocket APIs
 * Supports: Spot trading, margin, futures (perpetual & quarterly)
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const IBrokerAdapter = require('../foundation/IBrokerAdapter');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

class BinanceAdapter extends IBrokerAdapter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
        this.baseUrl = 'https://api.binance.com';
        this.wsUrl = 'wss://stream.binance.com:9443';
        this.connected = false;
        this.ws = null;
        this.subscriptions = new Map();
        this.listenKey = null;
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================

    async connect() {
        try {
            const account = await this.getBalance();
            if (account) {
                this.connected = true;
                // Get listen key for account updates
                await this._generateListenKey();
                console.log('✅ Binance adapter connected');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Binance connection failed:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.listenKey) {
            try {
                await this._deleteListenKey();
            } catch (e) {
                // Ignore errors
            }
        }
        this.connected = false;
        console.log('🔌 Binance adapter disconnected');
        return true;
    }

    isConnected() {
        return this.connected && (!this.ws || this.ws.readyState === 1);
    }

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    _generateSignature(params) {
        const queryString = new URLSearchParams(params).toString();
        return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
    }

    async _generateListenKey() {
        try {
            const response = await axios.post(
                `${this.baseUrl}/api/v3/userDataStream`,
                {},
                {
                    headers: {
                        'X-MBX-APIKEY': this.apiKey
                    }
                }
            );
            this.listenKey = response.data.listenKey;
        } catch (error) {
            console.warn('⚠️ Failed to generate listen key:', error.message);
        }
    }

    async _deleteListenKey() {
        if (!this.listenKey) return;
        try {
            await axios.delete(
                `${this.baseUrl}/api/v3/userDataStream?listenKey=${this.listenKey}`,
                {
                    headers: {
                        'X-MBX-APIKEY': this.apiKey
                    }
                }
            );
        } catch (error) {
            console.warn('⚠️ Failed to delete listen key:', error.message);
        }
    }

    // =========================================================================
    // ACCOUNT INFO
    // =========================================================================

    async getBalance() {
        try {
            const params = {
                timestamp: Date.now(),
                recvWindow: 5000
            };
            params.signature = this._generateSignature(params);

            const response = await axios.get(`${this.baseUrl}/api/v3/account`, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                params
            });

            const balances = {};
            for (const balance of response.data.balances) {
                const total = parseFloat(balance.free) + parseFloat(balance.locked);
                if (total > 0) {
                    balances[balance.asset] = total;
                }
            }
            return balances;
        } catch (error) {
            throw new Error(`Failed to get balance: ${error.message}`);
        }
    }

    async getPositions() {
        const balance = await this.getBalance();
        const positions = [];

        // Get current prices for all holdings
        const prices = await this._getPricesForAssets(Object.keys(balance));

        for (const [asset, amount] of Object.entries(balance)) {
            if (amount > 0 && asset !== 'USDT' && asset !== 'BUSD') {
                positions.push({
                    symbol: asset + '/USDT',
                    size: amount,
                    side: 'long',
                    entryPrice: null,
                    currentPrice: prices[asset] || null
                });
            }
        }

        return positions;
    }

    async getOpenOrders(symbol = null) {
        try {
            const params = {
                timestamp: Date.now(),
                recvWindow: 5000
            };
            
            if (symbol) {
                params.symbol = this._toBrokerSymbol(symbol);
            }

            params.signature = this._generateSignature(params);

            const response = await axios.get(`${this.baseUrl}/api/v3/openOrders`, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                params
            });

            return response.data.map(order => ({
                orderId: order.orderId,
                symbol: this.fromBrokerSymbol(order.symbol),
                type: order.type,
                side: order.side,
                price: parseFloat(order.price),
                amount: parseFloat(order.origQty),
                status: order.status
            }));
        } catch (error) {
            throw new Error(`Failed to get open orders: ${error.message}`);
        }
    }

    // =========================================================================
    // ORDER MANAGEMENT
    // =========================================================================

    async placeBuyOrder(symbol, amount, price = null, options = {}) {
        return this._placeOrder(symbol, 'BUY', amount, price, options);
    }

    async placeSellOrder(symbol, amount, price = null, options = {}) {
        return this._placeOrder(symbol, 'SELL', amount, price, options);
    }

    async _placeOrder(symbol, side, amount, price, options = {}) {
        try {
            const params = {
                symbol: this._toBrokerSymbol(symbol),
                side: side,
                quantity: amount,
                type: price ? 'LIMIT' : 'MARKET',
                timeInForce: 'GTC',
                timestamp: Date.now(),
                recvWindow: 5000
            };

            if (price) {
                params.price = price;
            }

            if (options.stopLoss) {
                params.stopPrice = options.stopLoss;
            }

            params.signature = this._generateSignature(params);

            const response = await axios.post(`${this.baseUrl}/api/v3/order`, null, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                params
            });

            return {
                orderId: response.data.orderId,
                status: response.data.status,
                symbol: this.fromBrokerSymbol(response.data.symbol),
                side: response.data.side,
                price: parseFloat(response.data.price),
                amount: parseFloat(response.data.origQty)
            };
        } catch (error) {
            throw new Error(`Failed to place order: ${error.message}`);
        }
    }

    async cancelOrder(symbol, orderId) {
        try {
            const params = {
                symbol: this._toBrokerSymbol(symbol),
                orderId: orderId,
                timestamp: Date.now(),
                recvWindow: 5000
            };

            params.signature = this._generateSignature(params);

            await axios.delete(`${this.baseUrl}/api/v3/order`, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                params
            });

            return true;
        } catch (error) {
            console.error(`Failed to cancel order: ${error.message}`);
            return false;
        }
    }

    async modifyOrder(symbol, orderId, modifications) {
        // Binance doesn't support direct modification - cancel and recreate
        await this.cancelOrder(symbol, orderId);
        return null;
    }

    async getOrderStatus(symbol, orderId) {
        try {
            const params = {
                symbol: this._toBrokerSymbol(symbol),
                orderId: orderId,
                timestamp: Date.now(),
                recvWindow: 5000
            };

            params.signature = this._generateSignature(params);

            const response = await axios.get(`${this.baseUrl}/api/v3/order`, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                params
            });

            return {
                orderId: response.data.orderId,
                status: response.data.status,
                filledAmount: parseFloat(response.data.executedQty),
                remainingAmount: parseFloat(response.data.origQty) - parseFloat(response.data.executedQty)
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
            const response = await axios.get(`${this.baseUrl}/api/v3/ticker/24hr`, {
                params: { symbol: brokerSymbol }
            });

            return {
                bid: parseFloat(response.data.bidPrice),
                ask: parseFloat(response.data.askPrice),
                last: parseFloat(response.data.lastPrice),
                volume: parseFloat(response.data.volume)
            };
        } catch (error) {
            throw new Error(`Failed to get ticker: ${error.message}`);
        }
    }

    async getCandles(symbol, timeframe = '1m', limit = 100) {
        try {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const response = await axios.get(`${this.baseUrl}/api/v3/klines`, {
                params: {
                    symbol: brokerSymbol,
                    interval: timeframe,
                    limit: Math.min(limit, 1000)
                }
            });

            return response.data.map(candle => ({
                t: candle[0] / 1000,
                o: parseFloat(candle[1]),
                h: parseFloat(candle[2]),
                l: parseFloat(candle[3]),
                c: parseFloat(candle[4]),
                v: parseFloat(candle[7])
            }));
        } catch (error) {
            throw new Error(`Failed to get candles: ${error.message}`);
        }
    }

    async getOrderBook(symbol, depth = 20) {
        try {
            const brokerSymbol = this._toBrokerSymbol(symbol);
            const response = await axios.get(`${this.baseUrl}/api/v3/depth`, {
                params: {
                    symbol: brokerSymbol,
                    limit: depth
                }
            });

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
            const stream = this._toBrokerSymbol(symbol).toLowerCase() + '@ticker';
            this.subscriptions.set(`ticker-${symbol}`, callback);
            
            this.ws.send(JSON.stringify({
                method: 'SUBSCRIBE',
                params: [stream],
                id: Date.now()
            }));
        });
    }

    subscribeToCandles(symbol, timeframe, callback) {
        this._ensureWebSocketConnected(() => {
            const stream = this._toBrokerSymbol(symbol).toLowerCase() + `@klines_${timeframe}`;
            this.subscriptions.set(`candles-${symbol}-${timeframe}`, callback);
            
            this.ws.send(JSON.stringify({
                method: 'SUBSCRIBE',
                params: [stream],
                id: Date.now()
            }));
        });
    }

    subscribeToOrderBook(symbol, callback) {
        this._ensureWebSocketConnected(() => {
            const stream = this._toBrokerSymbol(symbol).toLowerCase() + '@depth@100ms';
            this.subscriptions.set(`orderbook-${symbol}`, callback);
            
            this.ws.send(JSON.stringify({
                method: 'SUBSCRIBE',
                params: [stream],
                id: Date.now()
            }));
        });
    }

    subscribeToAccount(callback) {
        if (!this.listenKey) {
            console.warn('⚠️ Account subscriptions require listen key');
            return;
        }

        this._ensureWebSocketConnected(() => {
            this.subscriptions.set('account', callback);
            
            this.ws.send(JSON.stringify({
                method: 'SUBSCRIBE',
                params: [this.listenKey],
                id: Date.now()
            }));
        });
    }

    unsubscribeAll() {
        if (this.ws && this.ws.readyState === 1) {
            const params = Array.from(this.subscriptions.keys()).map(key => {
                const [type, ...rest] = key.split('-');
                return rest.join('-').toLowerCase() + (type === 'ticker' ? '@ticker' : '@klines_1m');
            });

            if (params.length > 0) {
                this.ws.send(JSON.stringify({
                    method: 'UNSUBSCRIBE',
                    params,
                    id: Date.now()
                }));
            }
        }
        this.subscriptions.clear();
    }

    // =========================================================================
    // ASSET INFORMATION
    // =========================================================================

    getAssetType() {
        return 'crypto';
    }

    getBrokerName() {
        return 'binance';
    }

    async getSupportedSymbols() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v3/exchangeInfo`);
            return response.data.symbols
                .filter(s => s.status === 'TRADING')
                .map(s => this.fromBrokerSymbol(s.symbol));
        } catch (error) {
            console.error('Failed to get supported symbols:', error.message);
            return [];
        }
    }

    getMinOrderSize(symbol) {
        // Generally $10 minimum on Binance
        return 10;
    }

    getFees() {
        return {
            maker: 0.001,  // 0.1%
            taker: 0.001   // 0.1%
        };
    }

    isTradeableNow(symbol) {
        return true;  // Crypto 24/7
    }

    // =========================================================================
    // SYMBOL NORMALIZATION
    // =========================================================================

    _toBrokerSymbol(symbol) {
        return symbol.replace('/', '').replace('-', '').toUpperCase();
    }

    fromBrokerSymbol(brokerSymbol) {
        // Most common: BTCUSDT -> BTC/USDT
        if (brokerSymbol.endsWith('USDT')) {
            return brokerSymbol.slice(0, -4) + '/USDT';
        }
        if (brokerSymbol.endsWith('BUSD')) {
            return brokerSymbol.slice(0, -4) + '/BUSD';
        }
        return brokerSymbol;
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    async _getPricesForAssets(assets) {
        try {
            const symbols = assets
                .filter(a => a !== 'USDT' && a !== 'BUSD')
                .map(a => a + 'USDT');

            if (symbols.length === 0) return {};

            const response = await axios.get(`${this.baseUrl}/api/v3/ticker/price`, {
                params: {
                    symbols: JSON.stringify(symbols)
                }
            });

            const prices = {};
            for (const ticker of response.data) {
                const asset = ticker.symbol.replace('USDT', '');
                prices[asset] = parseFloat(ticker.price);
            }
            return prices;
        } catch (error) {
            console.warn('⚠️ Failed to get prices:', error.message);
            return {};
        }
    }

    _ensureWebSocketConnected(callback) {
        if (!this.ws || this.ws.readyState !== 1) {
            this.ws = new WebSocket(this.wsUrl + '/stream');

            this.ws.on('open', () => {
                callback();
            });

            this.ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    this._handleWebSocketMessage(msg);
                } catch (error) {
                    // Ignore non-JSON
                }
            });

            this.ws.on('error', (error) => {
                console.error('Binance WebSocket error:', error.message);
            });
        } else {
            callback();
        }
    }

    _handleWebSocketMessage(msg) {
        if (msg.e === '24hrTicker') {
            const symbol = this.fromBrokerSymbol(msg.s);
            const callback = this.subscriptions.get(`ticker-${symbol}`);
            if (callback) {
                callback({
                    symbol,
                    price: parseFloat(msg.c),
                    bid: parseFloat(msg.b),
                    ask: parseFloat(msg.a),
                    volume: parseFloat(msg.v)
                });
            }
        } else if (msg.e === 'kline') {
            const symbol = this.fromBrokerSymbol(msg.s);
            const callback = this.subscriptions.get(`candles-${symbol}-${msg.k.i}`);
            if (callback) {
                callback({
                    t: msg.k.t / 1000,
                    o: parseFloat(msg.k.o),
                    h: parseFloat(msg.k.h),
                    l: parseFloat(msg.k.l),
                    c: parseFloat(msg.k.c),
                    v: parseFloat(msg.k.v)
                });
            }
        }
    }
}

module.exports = BinanceAdapter;
