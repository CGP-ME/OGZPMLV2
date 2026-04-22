/**
 * ============================================================================
 * AlpacaAdapter - Universal Broker Adapter for Alpaca Markets
 * ============================================================================
 *
 * Implements IBrokerAdapter for Alpaca's REST + WebSocket APIs
 * Supports: US equities via paper or live trading
 * Primary target for Apex evaluation extraction
 *
 * Template: CoinbaseAdapter.js (cleanest spot-market REST + WS pattern)
 *
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const IBrokerAdapter = require('../foundation/IBrokerAdapter');
const axios = require('axios');
const WebSocket = require('ws');

class AlpacaAdapter extends IBrokerAdapter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.apiKey = config.apiKey || process.env.ALPACA_API_KEY;
        this.apiSecret = config.apiSecret || process.env.ALPACA_API_SECRET;

        // Paper vs live — paper is ALWAYS the default, live is opt-in
        const mode = (config.mode || process.env.ALPACA_MODE || 'paper').toLowerCase();
        if (mode === 'live') {
            this.baseUrl = 'https://api.alpaca.markets';
            this.dataUrl = 'https://data.alpaca.markets';
            this.wsUrl = 'wss://stream.data.alpaca.markets/v2/iex';
            console.log('[Alpaca] LIVE MODE - real money at risk');
        } else {
            this.baseUrl = 'https://paper-api.alpaca.markets';
            this.dataUrl = 'https://data.alpaca.markets'; // Data API is same for paper
            this.wsUrl = 'wss://stream.data.alpaca.markets/v2/iex';
            console.log('[Alpaca] Paper trading mode');
        }

        this.connected = false;
        this.ws = null;
        this.subscriptions = new Map();
    }

    // =========================================================================
    // AUTHENTICATION — Alpaca uses simple header-based auth, no HMAC
    // =========================================================================

    _authHeaders() {
        return {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
            'Content-Type': 'application/json'
        };
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================

    async connect() {
        try {
            const account = await this.getBalance();
            if (account) {
                this.connected = true;
                console.log('[Alpaca] Connected - account verified');
                this.emit('connected', { broker: 'alpaca', ready: true });
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Alpaca] Connection failed:', error.message);
            this.connected = false;
            return false;
        }
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        console.log('[Alpaca] Disconnected');
    }

    isConnected() {
        return this.connected;
    }

    // =========================================================================
    // ACCOUNT INFO
    // =========================================================================

    async getBalance() {
        try {
            const response = await axios.get(`${this.baseUrl}/v2/account`, {
                headers: this._authHeaders()
            });
            const acct = response.data;
            return {
                USD: parseFloat(acct.cash),
                equity: parseFloat(acct.equity),
                buyingPower: parseFloat(acct.buying_power),
                portfolioValue: parseFloat(acct.portfolio_value),
                status: acct.status
            };
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get balance: ${error.message}`);
        }
    }

    async getPositions() {
        try {
            const response = await axios.get(`${this.baseUrl}/v2/positions`, {
                headers: this._authHeaders()
            });
            return response.data.map(pos => ({
                symbol: pos.symbol,
                size: parseFloat(pos.qty),
                side: pos.side === 'long' ? 'long' : 'short',
                entryPrice: parseFloat(pos.avg_entry_price),
                currentPrice: parseFloat(pos.current_price),
                pnl: parseFloat(pos.unrealized_pl),
                pnlPercent: parseFloat(pos.unrealized_plpc) * 100
            }));
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get positions: ${error.message}`);
        }
    }

    async getOpenOrders() {
        try {
            const response = await axios.get(`${this.baseUrl}/v2/orders?status=open`, {
                headers: this._authHeaders()
            });
            return response.data.map(order => ({
                orderId: order.id,
                symbol: order.symbol,
                type: order.type,
                side: order.side,
                price: parseFloat(order.limit_price || order.filled_avg_price || 0),
                amount: parseFloat(order.qty),
                filledAmount: parseFloat(order.filled_qty || 0),
                status: order.status
            }));
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get open orders: ${error.message}`);
        }
    }

    // =========================================================================
    // ORDER MANAGEMENT
    // =========================================================================

    async placeBuyOrder(symbol, amount, price = null, options = {}) {
        return this._placeOrder(symbol, amount, 'buy', price, options);
    }

    async placeSellOrder(symbol, amount, price = null, options = {}) {
        return this._placeOrder(symbol, amount, 'sell', price, options);
    }

    async _placeOrder(symbol, qty, side, price = null, options = {}) {
        try {
            const orderData = {
                symbol: this.toBrokerSymbol(symbol),
                qty: qty.toString(),
                side: side,
                type: price ? 'limit' : 'market',
                time_in_force: options.timeInForce || 'day'
            };

            if (price) {
                orderData.limit_price = price.toString();
            }

            // Bracket order support (SL + TP)
            if (options.stopLoss && options.takeProfit) {
                orderData.order_class = 'bracket';
                orderData.stop_loss = { stop_price: options.stopLoss.toString() };
                orderData.take_profit = { limit_price: options.takeProfit.toString() };
            } else if (options.stopLoss) {
                orderData.order_class = 'oto';
                orderData.stop_loss = { stop_price: options.stopLoss.toString() };
            }

            const response = await axios.post(`${this.baseUrl}/v2/orders`, orderData, {
                headers: this._authHeaders()
            });

            return {
                orderId: response.data.id,
                status: response.data.status,
                symbol: response.data.symbol,
                side: response.data.side,
                price: parseFloat(response.data.limit_price || response.data.filled_avg_price || 0),
                amount: parseFloat(response.data.qty)
            };
        } catch (error) {
            throw new Error(`[Alpaca] Failed to place ${side} order: ${error.response?.data?.message || error.message}`);
        }
    }

    async cancelOrder(orderId) {
        try {
            await axios.delete(`${this.baseUrl}/v2/orders/${orderId}`, {
                headers: this._authHeaders()
            });
            return true;
        } catch (error) {
            console.error(`[Alpaca] Failed to cancel order: ${error.message}`);
            return false;
        }
    }

    async modifyOrder(orderId, modifications) {
        try {
            const patchData = {};
            if (modifications.amount) patchData.qty = modifications.amount.toString();
            if (modifications.price) patchData.limit_price = modifications.price.toString();
            if (modifications.stopLoss) patchData.stop_price = modifications.stopLoss.toString();

            const response = await axios.patch(
                `${this.baseUrl}/v2/orders/${orderId}`,
                patchData,
                { headers: this._authHeaders() }
            );

            return {
                orderId: response.data.id,
                status: response.data.status
            };
        } catch (error) {
            throw new Error(`[Alpaca] Failed to modify order: ${error.message}`);
        }
    }

    async getOrderStatus(orderId) {
        try {
            const response = await axios.get(`${this.baseUrl}/v2/orders/${orderId}`, {
                headers: this._authHeaders()
            });
            return {
                orderId: response.data.id,
                status: response.data.status,
                filledAmount: parseFloat(response.data.filled_qty || 0),
                remainingAmount: parseFloat(response.data.qty) - parseFloat(response.data.filled_qty || 0)
            };
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get order status: ${error.message}`);
        }
    }

    // =========================================================================
    // DUAL-MODE CRITICAL: Liquidate all positions before broker swap
    // =========================================================================

    async liquidateAllPositions() {
        try {
            // Alpaca has a DELETE /v2/positions endpoint that closes everything
            const response = await axios.delete(`${this.baseUrl}/v2/positions`, {
                headers: this._authHeaders()
            });
            console.log('[Alpaca] All positions liquidated');
            return response.data || [];
        } catch (error) {
            // 404 means no positions to close — that's success
            if (error.response?.status === 404) {
                console.log('[Alpaca] No positions to liquidate - already flat');
                return [];
            }
            throw new Error(`[Alpaca] Failed to liquidate positions: ${error.message}`);
        }
    }

    // =========================================================================
    // MARKET DATA
    // =========================================================================

    async getTicker(symbol) {
        try {
            const sym = this.toBrokerSymbol(symbol);
            const response = await axios.get(
                `${this.dataUrl}/v2/stocks/${sym}/snapshot`,
                { headers: this._authHeaders() }
            );
            const snap = response.data;
            return {
                bid: parseFloat(snap.latestQuote?.bp || 0),
                ask: parseFloat(snap.latestQuote?.ap || 0),
                last: parseFloat(snap.latestTrade?.p || 0),
                volume: parseFloat(snap.dailyBar?.v || snap.minuteBar?.v || 0)
            };
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get ticker for ${symbol}: ${error.message}`);
        }
    }

    async getCandles(symbol, timeframe = '1m', limit = 100) {
        try {
            const sym = this.toBrokerSymbol(symbol);
            const tf = this._mapTimeframe(timeframe);

            const response = await axios.get(
                `${this.dataUrl}/v2/stocks/${sym}/bars`,
                {
                    headers: this._authHeaders(),
                    params: {
                        timeframe: tf,
                        limit: Math.min(limit, 10000),
                        adjustment: 'raw',
                        feed: 'iex'
                    }
                }
            );

            return (response.data.bars || []).map(bar => ({
                t: new Date(bar.t).getTime(),
                o: parseFloat(bar.o),
                h: parseFloat(bar.h),
                l: parseFloat(bar.l),
                c: parseFloat(bar.c),
                v: parseFloat(bar.v)
            }));
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get candles for ${symbol}: ${error.message}`);
        }
    }

    async getOrderBook(symbol, depth = 20) {
        try {
            // Alpaca IEX feed provides L1 quotes (best bid/ask), not full L2
            const ticker = await this.getTicker(symbol);
            return {
                bids: [[ticker.bid, 0]], // L1 only — size not available from snapshot
                asks: [[ticker.ask, 0]]
            };
        } catch (error) {
            throw new Error(`[Alpaca] Failed to get order book for ${symbol}: ${error.message}`);
        }
    }

    // =========================================================================
    // REAL-TIME SUBSCRIPTIONS via Alpaca Data Stream
    // =========================================================================

    subscribeToTicker(symbol, callback) {
        this._ensureDataStream(() => {
            const sym = this.toBrokerSymbol(symbol);
            this.subscriptions.set(`trades-${sym}`, callback);
            this.ws.send(JSON.stringify({
                action: 'subscribe',
                trades: [sym]
            }));
        });
    }

    subscribeToCandles(symbol, timeframe, callback) {
        this._ensureDataStream(() => {
            const sym = this.toBrokerSymbol(symbol);
            this.subscriptions.set(`bars-${sym}`, callback);
            this.ws.send(JSON.stringify({
                action: 'subscribe',
                bars: [sym]
            }));
        });
    }

    subscribeToOrderBook(symbol, callback) {
        this._ensureDataStream(() => {
            const sym = this.toBrokerSymbol(symbol);
            this.subscriptions.set(`quotes-${sym}`, callback);
            this.ws.send(JSON.stringify({
                action: 'subscribe',
                quotes: [sym]
            }));
        });
    }

    subscribeToAccount(callback) {
        // Alpaca account updates come via a separate trading stream
        // wss://paper-api.alpaca.markets/stream or wss://api.alpaca.markets/stream
        // For now, store the callback — full implementation in next commit
        this.subscriptions.set('account', callback);
        console.log('[Alpaca] Account stream subscription stored - wire in next commit');
    }

    unsubscribeAll() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Collect all subscribed symbols
            const trades = [], quotes = [], bars = [];
            for (const [key] of this.subscriptions) {
                const [type, sym] = key.split('-');
                if (type === 'trades' && sym) trades.push(sym);
                if (type === 'quotes' && sym) quotes.push(sym);
                if (type === 'bars' && sym) bars.push(sym);
            }
            if (trades.length || quotes.length || bars.length) {
                this.ws.send(JSON.stringify({
                    action: 'unsubscribe',
                    trades, quotes, bars
                }));
            }
            this.subscriptions.clear();
        }
    }

    // =========================================================================
    // ASSET INFORMATION
    // =========================================================================

    getAssetType() {
        return 'stocks';
    }

    getBrokerName() {
        return 'alpaca';
    }

    async getSupportedSymbols() {
        try {
            const response = await axios.get(`${this.baseUrl}/v2/assets?status=active&asset_class=us_equity`, {
                headers: this._authHeaders()
            });
            return response.data
                .filter(a => a.tradable)
                .map(a => a.symbol);
        } catch (error) {
            console.error('[Alpaca] Failed to get supported symbols:', error.message);
            return [];
        }
    }

    getMinOrderSize(symbol) {
        // Alpaca supports fractional shares — minimum is 1 share or $1
        return 1;
    }

    getFees() {
        // Alpaca is commission-free for US equities
        return { maker: 0, taker: 0 };
    }

    isTradeableNow(symbol) {
        // US market hours: 9:30 AM - 4:00 PM ET, Mon-Fri
        const now = new Date();
        const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = et.getDay();
        const hours = et.getHours();
        const minutes = et.getMinutes();
        const decimalTime = hours + minutes / 60;

        // Weekend check
        if (day === 0 || day === 6) return false;
        // Market hours: 9:30 - 16:00 ET
        return decimalTime >= 9.5 && decimalTime < 16;
    }

    // =========================================================================
    // SYMBOL NORMALIZATION
    // =========================================================================

    toBrokerSymbol(symbol) {
        // Stocks are just ticker symbols — strip any slash format
        // "AAPL" → "AAPL", "AAPL/USD" → "AAPL"
        return symbol.split('/')[0].toUpperCase();
    }

    fromBrokerSymbol(brokerSymbol) {
        return brokerSymbol;
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    _mapTimeframe(tf) {
        const map = {
            '1m': '1Min', '5m': '5Min', '15m': '15Min',
            '30m': '30Min', '1h': '1Hour', '4h': '4Hour', '1d': '1Day'
        };
        return map[tf] || '1Min';
    }

    _ensureDataStream(callback) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            callback();
            return;
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            // Alpaca requires auth message first
            this.ws.send(JSON.stringify({
                action: 'auth',
                key: this.apiKey,
                secret: this.apiSecret
            }));
        });

        this.ws.on('message', (data) => {
            try {
                const messages = JSON.parse(data.toString());
                for (const msg of Array.isArray(messages) ? messages : [messages]) {
                    // Auth success
                    if (msg.T === 'success' && msg.msg === 'authenticated') {
                        console.log('[Alpaca] Data stream authenticated');
                        callback();
                        continue;
                    }
                    // Auth failure
                    if (msg.T === 'error') {
                        console.error('[Alpaca] Stream error:', msg.msg);
                        continue;
                    }
                    // Trade updates
                    if (msg.T === 't') {
                        const cb = this.subscriptions.get(`trades-${msg.S}`);
                        if (cb) cb({ price: msg.p, size: msg.s, timestamp: msg.t, symbol: msg.S });
                    }
                    // Quote updates
                    if (msg.T === 'q') {
                        const cb = this.subscriptions.get(`quotes-${msg.S}`);
                        if (cb) cb({ bid: msg.bp, ask: msg.ap, bidSize: msg.bs, askSize: msg.as, symbol: msg.S });
                    }
                    // Bar updates
                    if (msg.T === 'b') {
                        const cb = this.subscriptions.get(`bars-${msg.S}`);
                        if (cb) cb({ o: msg.o, h: msg.h, l: msg.l, c: msg.c, v: msg.v, t: msg.t, symbol: msg.S });
                    }
                }
            } catch (e) {
                // Non-JSON messages or parse errors — ignore
            }
        });

        this.ws.on('close', () => {
            console.log('[Alpaca] Data stream closed');
        });

        this.ws.on('error', (err) => {
            console.error('[Alpaca] Data stream error:', err.message);
        });
    }
}

module.exports = AlpacaAdapter;
