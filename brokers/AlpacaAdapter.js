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
            this.accountStreamUrl = 'wss://api.alpaca.markets/stream';
            console.log('[Alpaca] LIVE MODE - real money at risk');
        } else {
            this.baseUrl = 'https://paper-api.alpaca.markets';
            this.dataUrl = 'https://data.alpaca.markets'; // Data API is same for paper
            this.wsUrl = 'wss://stream.data.alpaca.markets/v2/iex';
            this.accountStreamUrl = 'wss://paper-api.alpaca.markets/stream';
            console.log('[Alpaca] Paper trading mode');
        }

        this.connected = false;
        this.ws = null;
        this.accountWs = null;
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

    /**
     * Phase 8 health protocol — supervisor-compatible shape.
     *   { status, timestamp, details, lastSuccessAt, failureReason }
     *
     * Status reflects BOTH the REST account-API connection (this.connected,
     * set by connect()) and the data-stream WS connection (this.ws state +
     * reconnect counters). DEGRADED if the REST is OK but the WS is mid-
     * reconnect; UNHEALTHY if neither is up.
     *
     * Spec: ogz-meta/specs/resilience-and-supervision.md (Layer 1.5)
     */
    getHealth() {
        const now = Date.now();
        const wsOpen = this.ws && this.ws.readyState === 1; /* WebSocket.OPEN */
        const wsReconnecting = this.reconnectAttempts > 0;

        let status;
        let failureReason = null;
        if (this.intentionalDisconnect) {
            status = 'DEAD';
            failureReason = 'intentional disconnect';
        } else if (!this.connected) {
            status = 'UNHEALTHY';
            failureReason = 'REST account-API not verified (connect() not yet succeeded)';
        } else if (!wsOpen) {
            status = 'UNHEALTHY';
            failureReason = `WS not OPEN (readyState=${this.ws ? this.ws.readyState : 'null'}, reconnectAttempts=${this.reconnectAttempts})`;
        } else if (wsReconnecting) {
            status = 'DEGRADED';
            failureReason = `WS recently reconnected (attempts=${this.reconnectAttempts})`;
        } else {
            status = 'HEALTHY';
        }

        return {
            status,
            timestamp: now,
            details: {
                broker: 'alpaca',
                wsReadyState: this.ws ? this.ws.readyState : -1,
                restConnected: this.connected,
                reconnectAttempts: this.reconnectAttempts,
                subscriptionCount: this.subscriptions.size,
            },
            lastSuccessAt: this.connected ? now : 0,
            failureReason,
        };
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
            const end = new Date();
            const start = new Date(end.getTime() - this._historicalLookbackMs(timeframe, limit));

            const response = await axios.get(
                `${this.dataUrl}/v2/stocks/${sym}/bars`,
                {
                    headers: this._authHeaders(),
                    params: {
                        start: start.toISOString(),
                        end: end.toISOString(),
                        timeframe: tf,
                        limit: Math.min(limit, 10000),
                        adjustment: 'raw',
                        feed: 'iex',
                        sort: 'desc'
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
            })).sort((a, b) => a.t - b.t);
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
            const payload = { action: 'subscribe', bars: [sym] };
            console.log('[Alpaca] TX subscribe(bars):', JSON.stringify(payload), '| url:', this.wsUrl);
            this.ws.send(JSON.stringify(payload));
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
        // ALPACA-HIGH-01: wire account-stream WebSocket. Alpaca trading-stream
        // connection is separate from the data-stream (data WS is at line 542).
        // Authenticates with same key/secret, then `listen` for trade_updates +
        // account_updates. Callback fires on every account-update message with
        // the new equity/buying-power/cash so StateManager.balance reconciles
        // from broker truth instead of staying at the locally-cached value.
        this.subscriptions.set('account', callback);

        if (this.accountWs && this.accountWs.readyState === WebSocket.OPEN) {
            return;
        }

        this.accountWs = new WebSocket(this.accountStreamUrl);

        this.accountWs.on('open', () => {
            console.log('[Alpaca] Account stream connected:', this.accountStreamUrl);
            this.accountWs.send(JSON.stringify({
                action: 'authenticate',
                data: { key_id: this.apiKey, secret_key: this.apiSecret }
            }));
        });

        this.accountWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.stream === 'authorization' && msg.data?.status === 'authorized') {
                    console.log('[Alpaca] Account stream authenticated — subscribing to account_updates + trade_updates');
                    this.accountWs.send(JSON.stringify({
                        action: 'listen',
                        data: { streams: ['account_updates', 'trade_updates'] }
                    }));
                    return;
                }
                if (msg.stream === 'authorization' && msg.data?.status !== 'authorized') {
                    console.error('[Alpaca] Account stream auth failed:', msg.data);
                    return;
                }
                if (msg.stream === 'account_updates' && msg.data) {
                    const cb = this.subscriptions.get('account');
                    if (cb) cb({
                        equity: parseFloat(msg.data.equity),
                        buyingPower: parseFloat(msg.data.buying_power),
                        cash: parseFloat(msg.data.cash),
                        rawEvent: msg.data
                    });
                }
                if (msg.stream === 'trade_updates' && msg.data) {
                    const cb = this.subscriptions.get('account');
                    if (cb) cb({ tradeUpdate: msg.data, event: msg.data.event });
                }
            } catch (err) {
                console.error('[Alpaca] Account stream parse error:', err.message);
            }
        });

        this.accountWs.on('error', (err) => {
            console.error('[Alpaca] Account stream error:', err.message);
        });

        this.accountWs.on('close', () => {
            console.log('[Alpaca] Account stream disconnected');
            this.accountWs = null;
        });
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

    _historicalLookbackMs(timeframe, limit) {
        const map = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        const intervalMs = map[timeframe] || map['1m'];
        const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
        const requestedWindowMs = intervalMs * safeLimit * 3;
        const minimumIntradayWindowMs = 7 * 24 * 60 * 60 * 1000;
        return timeframe === '1d'
            ? requestedWindowMs
            : Math.max(requestedWindowMs, minimumIntradayWindowMs);
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

        // Diagnostic: per-symbol first-bar flag so we log the first bar
        // of each subscribed symbol once (reveals whether bars arrive at
        // all and at what cadence).
        this._firstBarLogged = this._firstBarLogged || new Set();

        this.ws.on('message', (data) => {
            try {
                const messages = JSON.parse(data.toString());
                for (const msg of Array.isArray(messages) ? messages : [messages]) {
                    // Diagnostic: dump every non-bar/non-trade/non-quote
                    // message so we see subscribe confirmations and any
                    // errors verbatim. Bars/trades/quotes would spam the
                    // log, so only the control-plane messages land here.
                    if (msg.T !== 't' && msg.T !== 'q' && msg.T !== 'b') {
                        console.log('[Alpaca] RX ctrl:', msg.T, JSON.stringify(msg).slice(0, 240));
                    }
                    // Auth success
                    if (msg.T === 'success' && msg.msg === 'authenticated') {
                        console.log('[Alpaca] Data stream authenticated');
                        callback();
                        continue;
                    }
                    // Auth failure
                    if (msg.T === 'error') {
                        console.error('[Alpaca] Stream error:', msg.msg, '| code:', msg.code);
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
                        const bar = { o: msg.o, h: msg.h, l: msg.l, c: msg.c, v: msg.v, t: msg.t, symbol: msg.S };
                        // Diagnostic: log the first bar per symbol so we
                        // can confirm bars are flowing. Subsequent bars
                        // are silent to avoid log spam.
                        if (!this._firstBarLogged.has(msg.S)) {
                            this._firstBarLogged.add(msg.S);
                            console.log('[Alpaca] First bar RX for', msg.S, '@', msg.t, 'OHLCV:', msg.o, msg.h, msg.l, msg.c, msg.v);
                        }
                        // Emit on the EventEmitter surface so run-empire-v2's
                        // `this.kraken.on('ohlc', ...)` listener (registered
                        // regardless of broker id; var name preserved) actually
                        // receives Alpaca bars. Without this the bars arrive
                        // and die in the adapter — no callback was registered,
                        // no event was emitted. Matches Kraken's payload shape
                        // and carries explicit symbol for SessionRouter routing.
                        this.emit('ohlc', { timeframe: '1m', data: bar, symbol: bar.symbol });
                        const cb = this.subscriptions.get(`bars-${msg.S}`);
                        if (cb) cb(bar);
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
