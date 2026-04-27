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
const ResilientWebSocket = require('../foundation/ResilientWebSocket');

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
        this.subscriptions = new Map();

        // Phase 9 (resilience-and-supervision spec): the per-adapter
        // reconnect/backoff/replay code from f042021 has been replaced by
        // a ResilientWebSocket instance. The library handles every
        // lifecycle concern (reconnect, backoff, replay, watchdog) — this
        // adapter only provides protocol concerns (auth message,
        // subscribe payload shape, message parsing).
        this.rws = null;

        // intentionalDisconnect retained as a guard for callers that
        // may inspect it (and for the disconnect() flow), but the actual
        // reconnect skipping is now handled by the ResilientWebSocket
        // .stop() method which sets its internal intentionalStop flag.
        this.intentionalDisconnect = false;
    }

    /**
     * Compatibility shim — pre-migration code reads this.ws.readyState in
     * a few places (e.g., unsubscribeAll()). Returning the underlying
     * raw WebSocket from the ResilientWebSocket lets those reads keep
     * working. Returns null when no socket exists.
     */
    get ws() {
        return this.rws ? this.rws.ws : null;
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
        // Phase 9 — graceful shutdown delegates to ResilientWebSocket.stop()
        // which sets its internal intentionalStop flag and prevents reconnect.
        this.intentionalDisconnect = true;
        if (this.rws) {
            this.rws.stop();
            this.rws = null;
        }
        this.connected = false;
        console.log('[Alpaca] Disconnected');
    }

    isConnected() {
        return this.connected;
    }

    /**
     * Phase 9 health protocol — combines REST account state with the
     * ResilientWebSocket's data-stream health. The library returns the
     * standardized shape; we overlay REST status (which the library has
     * no view of).
     *
     * Mercury Audit C2 adversarial re-dispatch (2026-04-27) findings + fixes:
     *
     * (CRITICAL) Consumer crash via null `details.ws`. Pre-fix: a
     *   freshly-constructed adapter (no rws built) returned `details.ws: null`.
     *   Any consumer doing `health.details.ws.reconnectAttempts` crashed
     *   with TypeError. Post-fix: details.ws is ALWAYS a real object with
     *   the same key shape as ResilientWebSocket.getHealth().details. When
     *   no rws exists, the placeholder values reflect "not started" state.
     *
     * (HIGH) Disconnect race. Pre-fix: getHealth() called between
     *   intentionalDisconnect=true (set by line 107) and rws.stop()
     *   completing returned DEAD even though wsHealth still said HEALTHY.
     *   Post-fix: the intentionalDisconnect branch checks wsHealth state
     *   and reports DEGRADED ('disconnect in progress') if the WS hasn't
     *   actually been torn down yet. Once rws is null OR wsHealth.status
     *   === DEAD, the branch reports DEAD as before.
     *
     * (MEDIUM-advisory) lastSuccessAt is the WS lastMessageAt timestamp,
     *   which includes auth-success and control frames. Watchdogs that
     *   read lastSuccessAt as "last data frame at" will be fooled.
     *   Resolution: ResilientWebSocket already runs its own dataWatchdogMs
     *   internally — that's the right layer for data-freshness detection.
     *   Future improvement: add lastDataMessageAt to RWS as a separate
     *   field. Tracked as follow-up; not blocking C2 SHIP IT.
     */
    getHealth() {
        const now = Date.now();
        const wsHealth = this.rws ? this.rws.getHealth() : null;

        let status;
        let failureReason = null;

        if (this.intentionalDisconnect) {
            // C2 HIGH fix: race-defense. If we set intentionalDisconnect=true
            // but the WS hasn't been torn down yet (still authenticated and
            // reporting HEALTHY), don't lie that it's DEAD — report
            // 'disconnect in progress' until the teardown propagates. The
            // race window is microseconds in the disconnect() flow but
            // exists. Once rws is null OR wsHealth.status reflects the
            // teardown, we report DEAD as before.
            if (wsHealth && wsHealth.status === 'HEALTHY') {
                status = 'DEGRADED';
                failureReason = 'disconnect in progress (WS not yet torn down)';
            } else {
                status = 'DEAD';
                failureReason = 'intentional disconnect';
            }
        } else if (!this.connected) {
            status = 'UNHEALTHY';
            failureReason = 'REST account-API not verified (connect() not yet succeeded)';
        } else if (!wsHealth) {
            // REST connected but WS layer not constructed yet — still degraded
            status = 'DEGRADED';
            failureReason = 'WS not yet started (subscribe a symbol to bring it up)';
        } else if (wsHealth.status === 'HEALTHY') {
            status = 'HEALTHY';
        } else {
            // Library says DEGRADED / UNHEALTHY / DEAD — pass it through.
            status = wsHealth.status;
            failureReason = wsHealth.failureReason;
        }

        // C2 CRITICAL fix: details.ws is ALWAYS an object, never null.
        // Consumers can safely read details.ws.reconnectAttempts etc. without
        // optional chaining. When no rws exists, the placeholder reflects
        // "not started" state in the same shape as rws.getHealth().details.
        const wsDetails = wsHealth ? wsHealth.details : {
            url: this.wsUrl,
            readyState: -1,
            isAuthenticated: false,
            reconnectAttempts: 0,
            msSinceMessage: null,
            msSincePong: null,
        };

        return {
            status,
            timestamp: now,
            details: {
                broker: 'alpaca',
                restConnected: this.connected,
                ws: wsDetails,
                subscriptionCount: this.subscriptions.size,
            },
            // Note (C2 MEDIUM advisory): this is "WS last message" semantic,
            // not "data-frame last seen." Real data-staleness handled by
            // ResilientWebSocket.dataWatchdogMs internally.
            lastSuccessAt: wsHealth ? wsHealth.lastSuccessAt : (this.connected ? now : 0),
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
            this.rws.send({ action: 'subscribe', trades: [sym] });
        });
    }

    subscribeToCandles(symbol, timeframe, callback) {
        this._ensureDataStream(() => {
            const sym = this.toBrokerSymbol(symbol);
            this.subscriptions.set(`bars-${sym}`, callback);
            const payload = { action: 'subscribe', bars: [sym] };
            console.log('[Alpaca] TX subscribe(bars):', JSON.stringify(payload), '| url:', this.wsUrl);
            this.rws.send(payload);
        });
    }

    subscribeToOrderBook(symbol, callback) {
        this._ensureDataStream(() => {
            const sym = this.toBrokerSymbol(symbol);
            this.subscriptions.set(`quotes-${sym}`, callback);
            this.rws.send({ action: 'subscribe', quotes: [sym] });
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
        if (this.rws && this.rws.isReady()) {
            // Collect all subscribed symbols
            const trades = [], quotes = [], bars = [];
            for (const [key] of this.subscriptions) {
                const [type, sym] = key.split('-');
                if (type === 'trades' && sym) trades.push(sym);
                if (type === 'quotes' && sym) quotes.push(sym);
                if (type === 'bars' && sym) bars.push(sym);
            }
            if (trades.length || quotes.length || bars.length) {
                this.rws.send({ action: 'unsubscribe', trades, quotes, bars });
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

    /**
     * Phase 9 (resilience-and-supervision spec): the per-adapter reconnect
     * dance from f042021 is now delegated to ResilientWebSocket. This adapter
     * provides ONLY:
     *   - protocol bits: auth message format, auth-success predicate
     *   - message parsing (trade/quote/bar handling)
     *   - subscribe replay logic (rebuilding the subscribe payload from
     *     this.subscriptions Map after reconnect)
     *
     * The library handles backoff, infinite retry, heartbeat ping, pong
     * timeout, data-silence watchdog, intentional-stop semantics. All
     * verified by tests/broker-resilience-gauntlet.js (10/10 passing).
     */
    _ensureDataStream(callback) {
        if (this.rws && this.rws.isReady()) {
            callback();
            return;
        }
        if (!this.rws) {
            this._buildResilientWS();
            this._initialSubscribeCallback = callback;
            this.rws.start();
            return;
        }
        // Already starting / reconnecting — overwrite the pending callback
        // so the latest subscribe wins on auth-success.
        this._initialSubscribeCallback = callback;
    }

    _buildResilientWS() {
        // Diagnostic: per-symbol first-bar flag (preserved from pre-Phase-9 code)
        this._firstBarLogged = this._firstBarLogged || new Set();

        this.rws = new ResilientWebSocket({
            url: this.wsUrl,
            authMessage: {
                action: 'auth',
                key: this.apiKey,
                secret: this.apiSecret,
            },
            authSuccessPredicate: (msg) => msg && msg.T === 'success' && msg.msg === 'authenticated',
            onMessage: (msg) => this._handleStreamMessage(msg),
            onAuthenticated: ({ isReconnect }) => {
                console.log(`[Alpaca] Data stream authenticated (isReconnect=${isReconnect})`);
                if (isReconnect) {
                    console.log(`[Alpaca] Replaying ${this.subscriptions.size} subscription(s)`);
                    this._replaySubscriptions();
                } else if (this._initialSubscribeCallback) {
                    const cb = this._initialSubscribeCallback;
                    this._initialSubscribeCallback = null;
                    try { cb(); }
                    catch (err) { console.error('[Alpaca] initial subscribe callback threw:', err.message); }
                }
            },
            options: {
                maxBackoffMs: 30000,    // 30s cap, matches pre-migration behavior
                heartbeatPingMs: 0,     // Alpaca doesn't require app-level pings
                pongTimeoutMs: 0,
                dataWatchdogMs: 60000,  // no message for 60s -> force reconnect
            },
            label: '[Alpaca]',
        });

        // Surface library events for diagnostics. Don't crash on unhandled.
        this.rws.on('error', (err) => {
            console.error('[Alpaca] WS error:', err.message);
        });
        this.rws.on('reconnecting', ({ attempt, delayMs }) => {
            console.log(`[Alpaca] Reconnecting in ${delayMs}ms (attempt #${attempt}, infinite, capped 30s)`);
        });
        this.rws.on('data-stale', ({ silentForMs }) => {
            console.warn(`[Alpaca] Data stream went silent for ${silentForMs}ms — forcing reconnect`);
        });
    }

    /**
     * Stream message handler — Alpaca-specific protocol parsing.
     * msg comes in already JSON-parsed by ResilientWebSocket.
     */
    _handleStreamMessage(msg) {
        // Alpaca sends arrays of messages; ResilientWebSocket parses the outer
        // array as a JSON message. If it's an array, iterate; else treat as one.
        if (Array.isArray(msg)) {
            for (const m of msg) this._handleOneStreamMessage(m);
        } else {
            this._handleOneStreamMessage(msg);
        }
    }

    _handleOneStreamMessage(msg) {
        if (!msg || !msg.T) return;
        // Diagnostic: log non-data control messages
        if (msg.T !== 't' && msg.T !== 'q' && msg.T !== 'b') {
            console.log('[Alpaca] RX ctrl:', msg.T, JSON.stringify(msg).slice(0, 240));
        }
        // Auth-success is intercepted by ResilientWebSocket via authSuccessPredicate;
        // we shouldn't see it here. But guard defensively in case predicate misses.
        if (msg.T === 'success' && msg.msg === 'authenticated') return;
        // Auth failure — surface but don't reconnect-spin (server will close
        // shortly and the library handles backoff).
        if (msg.T === 'error') {
            console.error('[Alpaca] Stream error:', msg.msg, '| code:', msg.code);
            return;
        }
        // Trade updates
        if (msg.T === 't') {
            const cb = this.subscriptions.get(`trades-${msg.S}`);
            if (cb) cb({ price: msg.p, size: msg.s, timestamp: msg.t, symbol: msg.S });
            return;
        }
        // Quote updates
        if (msg.T === 'q') {
            const cb = this.subscriptions.get(`quotes-${msg.S}`);
            if (cb) cb({ bid: msg.bp, ask: msg.ap, bidSize: msg.bs, askSize: msg.as, symbol: msg.S });
            return;
        }
        // Bar updates
        if (msg.T === 'b') {
            const bar = { o: msg.o, h: msg.h, l: msg.l, c: msg.c, v: msg.v, t: msg.t, symbol: msg.S };
            if (!this._firstBarLogged.has(msg.S)) {
                this._firstBarLogged.add(msg.S);
                console.log('[Alpaca] First bar RX for', msg.S, '@', msg.t, 'OHLCV:', msg.o, msg.h, msg.l, msg.c, msg.v);
            }
            this.emit('ohlc', { timeframe: '1m', data: bar });
            const cb = this.subscriptions.get(`bars-${msg.S}`);
            if (cb) cb(bar);
        }
    }

    /**
     * Replay every subscription in this.subscriptions to a freshly-
     * authenticated WS. Used on reconnect — the subscriptions Map is
     * not cleared on close, so it still holds every symbol the bot was
     * subscribed to before the drop.
     */
    _replaySubscriptions() {
        if (!this.rws || !this.rws.isReady()) return;
        const trades = [], quotes = [], bars = [];
        for (const [key] of this.subscriptions) {
            const [type, sym] = key.split('-');
            if (!sym) continue;
            if (type === 'trades') trades.push(sym);
            else if (type === 'quotes') quotes.push(sym);
            else if (type === 'bars')  bars.push(sym);
        }
        if (!trades.length && !quotes.length && !bars.length) {
            console.log('[Alpaca] _replaySubscriptions: nothing to replay');
            return;
        }
        const payload = { action: 'subscribe', trades, quotes, bars };
        console.log('[Alpaca] TX replay-subscribe:', JSON.stringify(payload));
        this.rws.send(payload);
    }
}

module.exports = AlpacaAdapter;
