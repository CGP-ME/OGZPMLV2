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
const authFailureGuard = require('../core/AuthFailureGuard');
const { createTraceId, emitTrace } = require('../core/TraceSpine');

const ALPACA_WS_AUTH_ERROR_CODES = new Set([401, 402, 403, 404, 406, 409]);
const ALPACA_AUTH_MESSAGE_RE = /(invalid api( |-)?key|unauthorized|authentication failed|api key not authorized|forbidden|invalid credentials|not authorized)/i;
const ALPACA_WS_TRANSPORT_AUTH_RE = /(^|\D)(401|403)($|\D)|unauthorized|authentication failed|invalid api key|not authorized/i;
const STREAM_BAR_TIMEFRAME = '1m';
const ALPACA_BROKER_TRUTH_UNAVAILABLE = 'alpaca_broker_truth_unavailable';
const ALPACA_BALANCE_TRUTH_UNAVAILABLE = 'broker_balance_truth_unavailable';
const ALPACA_POSITION_TRUTH_UNAVAILABLE = 'broker_position_truth_unavailable';
const ALPACA_OPEN_ORDERS_TRUTH_UNAVAILABLE = 'broker_open_orders_truth_unavailable';
const ALPACA_CANCEL_TRUTH_UNKNOWN = 'broker_cancel_truth_unknown';

class AlpacaAdapter extends IBrokerAdapter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
        if (!this.apiKey) {
            throw new Error('[Alpaca] apiKey is required');
        }
        if (!this.apiSecret) {
            throw new Error('[Alpaca] apiSecret is required');
        }

        const mode = String(config.mode || '').toLowerCase();
        if (mode !== 'paper' && mode !== 'live') {
            throw new Error(`[Alpaca] mode must be explicitly set to paper or live, got ${mode || '(missing)'}`);
        }
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
        this.rws = null;
        this.accountWs = null;
        this.subscriptions = new Map();
        this.barSubscriptions = new Map();
        this.intentionalDisconnect = false;
        this._pendingSubscribeCallbacks = [];
        this.accountId = this._cleanAccountId(config.accountId);
        this.accountIdSource = this.accountId ? 'config' : null;
    }

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

    _cleanAccountId(value) {
        if (value === null || value === undefined) return null;
        const cleaned = String(value).trim();
        return cleaned && cleaned !== 'default' ? cleaned : null;
    }

    _captureAccountIdentity(accountPayload = {}) {
        const id = this._cleanAccountId(accountPayload.id);
        const accountNumber = this._cleanAccountId(accountPayload.account_number || accountPayload.accountNumber);
        const accountId = id || accountNumber;
        if (!accountId) {
            return null;
        }

        this.accountId = accountId;
        this.accountIdSource = id ? 'broker:id' : 'broker:account_number';
        return this.getAccountIdentity();
    }

    // Centralized auth-failure detection. Records into the shared
    // AuthFailureGuard when the axios error indicates an Alpaca auth failure
    // so repeated dead-credential calls escalate the KillSwitch instead of
    // being logged-and-retried forever. Non-auth errors are ignored so
    // caller-side error handling stays unchanged.
    //
    // Detection scope:
    //   - HTTP 401 (Unauthorized) and 403 (Forbidden): canonical auth status.
    //   - HTTP 400 with a body message matching the Alpaca-specific
    //     auth-error vocabulary (e.g. "Invalid API key", "credential").
    //     Alpaca returns 400 for malformed-credential cases that other
    //     brokers would have returned 401 for; the body string distinguishes
    //     auth-related 400 from generic validation 400.
    //
    // Out of scope:
    //   - Network-level errors (ECONNRESET, ETIMEDOUT, TLS): not auth signals.
    //   - 422/423: not auth signals on Alpaca.
    _authFailureText(error) {
        const data = error && error.response && error.response.data;
        const parts = [];
        if (typeof data?.message === 'string') parts.push(data.message);
        if (typeof data?.error === 'string') parts.push(data.error);
        if (Array.isArray(data?.error)) parts.push(...data.error.filter((item) => typeof item === 'string'));
        if (Array.isArray(data?.errors)) parts.push(...data.errors.filter((item) => typeof item === 'string'));
        if (typeof data?.code === 'string') parts.push(data.code);
        return parts.join(' | ');
    }

    _recordAuthFailureIfRelevant(error, kind) {
        const status = error && error.response && error.response.status;
        if (!status) return;
        const message = this._authFailureText(error);
        const isAuthStatus = status === 401 || status === 403;
        const isAuthBody400 = status === 400
            && typeof message === 'string'
            && ALPACA_AUTH_MESSAGE_RE.test(message);
        if (isAuthStatus || isAuthBody400) {
            authFailureGuard.recordFailure('alpaca', kind, {
                status,
                message,
                authFailure: true,
                evidence: isAuthStatus ? 'alpaca-http-auth-status' : 'alpaca-auth-body',
            });
        }
    }

    _recordDataStreamAuthErrorIfRelevant(msg) {
        if (!msg || msg.T !== 'error') return false;
        const numericCode = Number(msg.code);
        const code = Number.isFinite(numericCode) ? numericCode : msg.code;
        const message = typeof msg.msg === 'string' ? msg.msg : '';
        const isAuthCode = Number.isFinite(numericCode) && ALPACA_WS_AUTH_ERROR_CODES.has(numericCode);
        const isAuthMessage = ALPACA_AUTH_MESSAGE_RE.test(message);
        if (!isAuthCode && !isAuthMessage) return false;
        authFailureGuard.recordFailure('alpaca', 'ws-data-stream-auth', {
            code,
            message,
            authFailure: true,
            evidence: isAuthCode ? 'alpaca-ws-data-error-code' : 'alpaca-ws-data-auth-body',
        });
        this._emitBrokerTruthUnavailable('ALPACA_DATA_STREAM_AUTH_UNAVAILABLE', {
            code: ALPACA_BROKER_TRUTH_UNAVAILABLE,
            reason: 'alpaca_data_stream_auth_unavailable',
            operation: 'dataStreamAuth',
            authCode: code,
            error: message || 'Alpaca data stream authentication failed',
        });
        return true;
    }

    _recordWsTransportAuthFailureIfRelevant(error, kind, evidence) {
        const message = error && typeof error.message === 'string' ? error.message : '';
        if (!ALPACA_WS_TRANSPORT_AUTH_RE.test(message)) return;
        authFailureGuard.recordFailure('alpaca', kind, {
            message,
            authFailure: true,
            evidence,
        });
        this._emitBrokerTruthUnavailable('ALPACA_WS_TRANSPORT_AUTH_UNAVAILABLE', {
            code: ALPACA_BROKER_TRUTH_UNAVAILABLE,
            reason: 'alpaca_ws_transport_auth_unavailable',
            operation: kind,
            evidence,
            error: message || 'Alpaca WebSocket transport authentication failed',
        });
    }

    _recordStreamTruthUnavailable(event, reason, fields = {}) {
        return this._emitBrokerTruthUnavailable(event, {
            code: ALPACA_BROKER_TRUTH_UNAVAILABLE,
            reason,
            ...fields,
        });
    }

    _recordWsTransportFailure(error, kind, evidence) {
        const message = error && typeof error.message === 'string' ? error.message : this._errorMessage(error);
        const authFailure = ALPACA_WS_TRANSPORT_AUTH_RE.test(message || '');
        if (authFailure) {
            this._recordWsTransportAuthFailureIfRelevant(error, kind, evidence);
            return;
        }
        this._recordStreamTruthUnavailable('ALPACA_WS_TRANSPORT_UNAVAILABLE', 'alpaca_ws_transport_unavailable', {
            operation: kind,
            evidence,
            error: message || 'Alpaca WebSocket transport unavailable',
        });
    }

    _errorMessage(error) {
        if (!error) return null;
        return error.response?.data?.message || error.message || String(error);
    }

    _emitBrokerTruthUnavailable(event, fields = {}) {
        const payload = {
            traceId: createTraceId('alpaca_broker_truth'),
            broker: 'alpaca',
            mode: this.config?.mode || null,
            baseUrl: this.baseUrl,
            ...fields,
        };
        console.error(
            `[Alpaca] ${event}: reason=${payload.reason || '(missing)'}${payload.error ? ` error=${payload.error}` : ''}`
        );
        emitTrace({}, event, payload);
        this.emit('broker_truth_unavailable', payload);
        return payload;
    }

    _typedBrokerTruthError(reason, error, fields = {}) {
        const message = this._errorMessage(error) || reason;
        this._emitBrokerTruthUnavailable(fields.event || 'ALPACA_BROKER_TRUTH_UNAVAILABLE', {
            code: fields.code || ALPACA_BROKER_TRUTH_UNAVAILABLE,
            reason,
            operation: fields.operation || null,
            error: message,
            ...fields,
            event: undefined,
        });
        const typedError = new Error(`[Alpaca] ${reason}: ${message}`);
        typedError.code = fields.code || ALPACA_BROKER_TRUTH_UNAVAILABLE;
        typedError.reason = reason;
        typedError.broker = 'alpaca';
        typedError.operation = fields.operation || null;
        typedError.cause = error;
        return typedError;
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
            this.connected = false;
            throw this._typedBrokerTruthError('alpaca_connect_account_unverified', null, {
                code: ALPACA_BROKER_TRUTH_UNAVAILABLE,
                operation: 'connect',
                event: 'ALPACA_CONNECT_TRUTH_UNAVAILABLE',
            });
        } catch (error) {
            this.connected = false;
            if (error?.code === ALPACA_BROKER_TRUTH_UNAVAILABLE) throw error;
            throw this._typedBrokerTruthError('alpaca_connect_failed', error, {
                code: ALPACA_BROKER_TRUTH_UNAVAILABLE,
                operation: 'connect',
                event: 'ALPACA_CONNECT_TRUTH_UNAVAILABLE',
            });
        }
    }

    async disconnect() {
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
     * Phase 8 health protocol — supervisor-compatible shape.
     *   { status, timestamp, details, lastSuccessAt, failureReason }
     *
     * Status reflects BOTH the REST account-API connection (this.connected,
     * set by connect()) and the ResilientWebSocket-owned data stream health.
     * DEGRADED if REST is OK but the data stream has not started or is in a
     * controlled teardown; UNHEALTHY if REST is not verified or RWS says the
     * active stream is unhealthy.
     *
     * Spec: ogz-meta/specs/resilience-and-supervision.md (Layer 1.5)
     */
    getHealth() {
        const now = Date.now();
        const wsHealth = this.rws ? this.rws.getHealth() : null;

        let status;
        let failureReason = null;
        if (this.intentionalDisconnect) {
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
            status = 'DEGRADED';
            failureReason = 'WS not yet started (subscribe a symbol to bring it up)';
        } else if (wsHealth.status === 'HEALTHY') {
            status = 'HEALTHY';
        } else {
            status = wsHealth.status;
            failureReason = wsHealth.failureReason;
        }

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
            const identity = this._captureAccountIdentity(acct);
            return {
                USD: parseFloat(acct.cash),
                equity: parseFloat(acct.equity),
                buyingPower: parseFloat(acct.buying_power),
                portfolioValue: parseFloat(acct.portfolio_value),
                status: acct.status,
                accountId: identity?.accountId || null,
                accountIdSource: identity?.accountIdSource || null,
            };
        } catch (error) {
            this._recordAuthFailureIfRelevant(error, 'rest-balance');
            throw this._typedBrokerTruthError('alpaca_balance_unavailable', error, {
                code: ALPACA_BALANCE_TRUTH_UNAVAILABLE,
                operation: 'getBalance',
                event: 'ALPACA_BALANCE_TRUTH_UNAVAILABLE',
            });
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
            this._recordAuthFailureIfRelevant(error, 'rest-positions');
            throw this._typedBrokerTruthError('alpaca_positions_unavailable', error, {
                code: ALPACA_POSITION_TRUTH_UNAVAILABLE,
                operation: 'getPositions',
                event: 'ALPACA_POSITION_TRUTH_UNAVAILABLE',
            });
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
            this._recordAuthFailureIfRelevant(error, 'rest-open-orders');
            throw this._typedBrokerTruthError('alpaca_open_orders_unavailable', error, {
                code: ALPACA_OPEN_ORDERS_TRUTH_UNAVAILABLE,
                operation: 'getOpenOrders',
                event: 'ALPACA_OPEN_ORDERS_TRUTH_UNAVAILABLE',
            });
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
            this._recordAuthFailureIfRelevant(error, 'rest-place-order');
            throw new Error(`[Alpaca] Failed to place ${side} order: ${error.response?.data?.message || error.message}`);
        }
    }

    async cancelOrder(orderId) {
        try {
            await axios.delete(`${this.baseUrl}/v2/orders/${orderId}`, {
                headers: this._authHeaders()
            });
            return {
                cancelled: true,
                status: 'cancelled',
                orderId,
                broker: 'alpaca',
            };
        } catch (error) {
            this._recordAuthFailureIfRelevant(error, 'rest-cancel-order');
            const message = this._errorMessage(error) || 'cancel order failed';
            this._emitBrokerTruthUnavailable('ALPACA_CANCEL_TRUTH_UNKNOWN', {
                code: ALPACA_CANCEL_TRUTH_UNKNOWN,
                reason: 'alpaca_cancel_order_unknown',
                operation: 'cancelOrder',
                orderId,
                error: message,
            });
            return {
                cancelled: false,
                status: 'unknown',
                code: ALPACA_CANCEL_TRUTH_UNKNOWN,
                reason: 'alpaca_cancel_order_unknown',
                orderId,
                broker: 'alpaca',
                error: message,
            };
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
            this._recordAuthFailureIfRelevant(error, 'rest-modify-order');
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
            this._recordAuthFailureIfRelevant(error, 'rest-order-status');
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
            this._recordAuthFailureIfRelevant(error, 'rest-liquidate');
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
            this._recordAuthFailureIfRelevant(error, 'rest-ticker');
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
            this._recordAuthFailureIfRelevant(error, 'rest-candles');
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
            this._recordAuthFailureIfRelevant(error, 'rest-orderbook');
            throw new Error(`[Alpaca] Failed to get order book for ${symbol}: ${error.message}`);
        }
    }

    // =========================================================================
    // REAL-TIME SUBSCRIPTIONS via Alpaca Data Stream
    // =========================================================================

    subscribeToTicker(symbol, callback) {
        const sym = this.toBrokerSymbol(symbol);
        const key = `trades-${sym}`;
        this._ensureDataStream(() => {
            this.rws.send({ action: 'subscribe', trades: [sym] });
            this.subscriptions.set(key, callback);
        }, key);
    }

    subscribeToCandles(symbol, timeframe, callback) {
        const sym = this.toBrokerSymbol(symbol);
        const key = `bars-${sym}`;
        const intervalMs = this._timeframeIntervalMs(STREAM_BAR_TIMEFRAME);
        this._ensureDataStream(() => {
            const payload = { action: 'subscribe', bars: [sym] };
            console.log('[Alpaca] TX subscribe(bars):', JSON.stringify(payload), '| url:', this.wsUrl);
            this.rws.send(payload);
            this.subscriptions.set(key, callback);
            this.barSubscriptions.set(sym, {
                requestedTimeframe: timeframe,
                streamTimeframe: STREAM_BAR_TIMEFRAME,
                intervalMs,
            });
        }, key);
    }

    subscribeToOrderBook(symbol, callback) {
        const sym = this.toBrokerSymbol(symbol);
        const key = `quotes-${sym}`;
        this._ensureDataStream(() => {
            this.rws.send({ action: 'subscribe', quotes: [sym] });
            this.subscriptions.set(key, callback);
        }, key);
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
                    authFailureGuard.recordFailure('alpaca', 'ws-auth', {
                        authFailure: true,
                        evidence: 'alpaca-ws-authorization-status',
                        payload: msg.data,
                    });
                    this._recordStreamTruthUnavailable('ALPACA_ACCOUNT_STREAM_AUTH_UNAVAILABLE', 'alpaca_account_stream_auth_unavailable', {
                        operation: 'accountStreamAuth',
                        error: JSON.stringify(msg.data || {}),
                    });
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
                this._recordStreamTruthUnavailable('ALPACA_ACCOUNT_STREAM_PARSE_UNAVAILABLE', 'alpaca_account_stream_parse_unavailable', {
                    operation: 'accountStreamParse',
                    error: this._errorMessage(err) || 'account stream parse failed',
                });
            }
        });

        this.accountWs.on('error', (err) => {
            console.error('[Alpaca] Account stream error:', err.message);
            this._recordWsTransportFailure(err, 'ws-account-upgrade-auth', 'alpaca-ws-upgrade-error');
        });

        this.accountWs.on('close', () => {
            console.error('[Alpaca] Account stream disconnected');
            this._recordStreamTruthUnavailable('ALPACA_ACCOUNT_STREAM_UNAVAILABLE', 'alpaca_account_stream_disconnected', {
                operation: 'accountStreamClose',
                error: 'account stream disconnected',
            });
            this.accountWs = null;
        });
    }

    unsubscribeAll() {
        const trades = [], quotes = [], bars = [];
        for (const [key] of this.subscriptions) {
            const [type, sym] = key.split('-');
            if (type === 'trades' && sym) trades.push(sym);
            if (type === 'quotes' && sym) quotes.push(sym);
            if (type === 'bars' && sym) bars.push(sym);
        }
        this._pendingSubscribeCallbacks = [];
        if (this.rws && this.rws.isReady() && (trades.length || quotes.length || bars.length)) {
            this.rws.send({ action: 'unsubscribe', trades, quotes, bars });
        }
        this.subscriptions.clear();
        this.barSubscriptions.clear();
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

    getAccountIdentity() {
        if (!this.accountId) {
            return null;
        }
        return {
            brokerId: 'alpaca',
            accountId: this.accountId,
            accountIdSource: this.accountIdSource || 'broker',
        };
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
            this._recordAuthFailureIfRelevant(error, 'rest-supported-symbols');
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

    supportsFractionalShares() {
        return true;
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

    _timeframeIntervalMs(timeframe) {
        const map = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
        };
        const intervalMs = map[timeframe];
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
            throw new Error(`[Alpaca] unsupported candle timeframe ${timeframe}`);
        }
        return intervalMs;
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

    _ensureDataStream(callback, subscriptionKey = null) {
        if (typeof callback !== 'function') {
            throw new Error('[Alpaca] _ensureDataStream requires a subscribe callback');
        }
        if (!subscriptionKey) {
            throw new Error('[Alpaca] _ensureDataStream requires a stable subscription key');
        }
        if (this.rws && this.rws.isReady()) {
            callback();
            return;
        }

        this._pendingSubscribeCallbacks = this._pendingSubscribeCallbacks
            .filter((pending) => pending.key !== subscriptionKey);
        this._pendingSubscribeCallbacks.push({ key: subscriptionKey, callback });
        if (!this.rws) {
            this._buildResilientWS();
            this.rws.start();
        }
    }

    _buildResilientWS() {
        this._firstBarLogged = this._firstBarLogged || new Set();
        this.intentionalDisconnect = false;

        this.rws = new ResilientWebSocket({
            url: this.wsUrl,
            authMessage: {
                action: 'auth',
                key: this.apiKey,
                secret: this.apiSecret,
            },
            authSuccessPredicate: (msg) => {
                const isAuth = (m) => m && m.T === 'success' && m.msg === 'authenticated';
                return Array.isArray(msg) ? msg.some(isAuth) : isAuth(msg);
            },
            onMessage: (msg) => this._handleStreamMessage(msg),
            onAuthenticated: ({ isReconnect }) => {
                console.log(`[Alpaca] Data stream authenticated (isReconnect=${isReconnect})`);
                const pending = this._pendingSubscribeCallbacks.splice(0);
                const pendingKeys = new Set(pending.map((item) => item.key).filter(Boolean));
                const replayKeys = isReconnect
                    ? new Set([...this.subscriptions.keys()].filter((key) => !pendingKeys.has(key)))
                    : null;
                if (pending.length) {
                    console.log(`[Alpaca] Draining ${pending.length} pending subscribe callback(s)`);
                    for (const { key, callback: cb } of pending) {
                        try {
                            cb();
                        } catch (err) {
                            this._emitBrokerTruthUnavailable('ALPACA_INITIAL_SUBSCRIBE_FAILED', {
                                code: ALPACA_BROKER_TRUTH_UNAVAILABLE,
                                reason: 'alpaca_initial_subscribe_failed',
                                operation: 'initialSubscribe',
                                subscriptionKey: key || null,
                                isReconnect,
                                error: this._errorMessage(err) || 'initial subscribe callback failed',
                            });
                        }
                    }
                }
                if (isReconnect && replayKeys.size > 0) {
                    if (this._firstBarLogged) this._firstBarLogged.clear();
                    console.log(`[Alpaca] Replaying ${replayKeys.size} pre-existing subscription(s)`);
                    this._replaySubscriptions(replayKeys);
                }
            },
            options: {
                maxBackoffMs: 30000,
                heartbeatPingMs: 0,
                pongTimeoutMs: 0,
                dataWatchdogMs: 60000,
            },
            label: '[Alpaca]',
        });

        this.rws.on('error', (err) => {
            console.error('[Alpaca] WS error:', err.message);
            this._recordWsTransportFailure(err, 'ws-data-upgrade-auth', 'alpaca-ws-upgrade-error');
        });
        this.rws.on('reconnecting', ({ attempt, delayMs }) => {
            console.log(`[Alpaca] Reconnecting in ${delayMs}ms (attempt #${attempt}, infinite, capped 30s)`);
        });
        this.rws.on('data-stale', ({ silentForMs }) => {
            console.warn(`[Alpaca] Data stream went silent for ${silentForMs}ms - forcing reconnect`);
            this._recordStreamTruthUnavailable('ALPACA_DATA_STREAM_STALE', 'alpaca_data_stream_stale', {
                operation: 'dataStreamWatchdog',
                silentForMs,
                error: `data stream silent for ${silentForMs}ms`,
            });
        });
    }

    _handleStreamMessage(msg) {
        if (Array.isArray(msg)) {
            for (const item of msg) this._handleOneStreamMessage(item);
            return;
        }
        this._handleOneStreamMessage(msg);
    }

    _handleOneStreamMessage(msg) {
        if (!msg || !msg.T) {
            this._recordStreamTruthUnavailable('ALPACA_DATA_STREAM_MESSAGE_UNAVAILABLE', 'alpaca_data_stream_message_unavailable', {
                operation: 'dataStreamMessage',
                error: 'data stream message missing type',
            });
            return;
        }
        if (msg.T !== 't' && msg.T !== 'q' && msg.T !== 'b') {
            console.log('[Alpaca] RX ctrl:', msg.T, JSON.stringify(msg).slice(0, 240));
        }
        if (msg.T === 'success' && msg.msg === 'authenticated') return;
        if (msg.T === 'error') {
            console.error('[Alpaca] Stream error:', msg.msg, '| code:', msg.code);
            const authError = this._recordDataStreamAuthErrorIfRelevant(msg);
            if (!authError) {
                this._recordStreamTruthUnavailable('ALPACA_DATA_STREAM_ERROR', 'alpaca_data_stream_error', {
                    operation: 'dataStreamError',
                    streamCode: msg.code ?? null,
                    error: msg.msg || 'Alpaca data stream error',
                });
            }
            if (authError && this.rws && this.rws.ws && typeof this.rws.ws.close === 'function') {
                try { this.rws.ws.close(); }
                catch (err) { console.error('[Alpaca] Failed to close auth-failed data stream:', err.message); }
            }
            return;
        }
        if (msg.T === 't') {
            const cb = this.subscriptions.get(`trades-${msg.S}`);
            if (cb) cb({ price: msg.p, size: msg.s, timestamp: msg.t, symbol: msg.S });
            return;
        }
        if (msg.T === 'q') {
            const cb = this.subscriptions.get(`quotes-${msg.S}`);
            if (cb) cb({ bid: msg.bp, ask: msg.ap, bidSize: msg.bs, askSize: msg.as, symbol: msg.S });
            return;
        }
        if (msg.T === 'b') {
            const barSubscription = this.barSubscriptions.get(msg.S);
            if (!barSubscription) {
                console.error(`[Alpaca] Received bar for unsubscribed symbol ${msg.S || '(missing)'}`);
                return;
            }
            const barStartMs = Date.parse(msg.t);
            if (!Number.isFinite(barStartMs)) {
                console.error(`[Alpaca] Received bar with invalid timestamp for ${msg.S}: ${msg.t}`);
                return;
            }
            if (barStartMs % barSubscription.intervalMs !== 0) {
                console.error(`[Alpaca] Received unaligned ${barSubscription.streamTimeframe} bar timestamp for ${msg.S}: ${msg.t}`);
                return;
            }
            const bar = {
                o: msg.o,
                h: msg.h,
                l: msg.l,
                c: msg.c,
                v: msg.v,
                t: msg.t,
                etime: barStartMs + barSubscription.intervalMs,
                symbol: msg.S
            };
            if (!this._firstBarLogged.has(msg.S)) {
                this._firstBarLogged.add(msg.S);
                console.log('[Alpaca] First bar RX for', msg.S, '@', msg.t, 'OHLCV:', msg.o, msg.h, msg.l, msg.c, msg.v);
            }
            this.emit('ohlc', { timeframe: barSubscription.streamTimeframe, data: bar, symbol: bar.symbol });
            const cb = this.subscriptions.get(`bars-${msg.S}`);
            if (cb) cb(bar);
        }
    }

    _replaySubscriptions(subscriptionKeys = null) {
        if (!this.rws || !this.rws.isReady()) return;
        const trades = [], quotes = [], bars = [];
        const keys = subscriptionKeys || this.subscriptions.keys();
        for (const key of keys) {
            const [type, sym] = key.split('-');
            if (!sym) continue;
            if (type === 'trades') trades.push(sym);
            if (type === 'quotes') quotes.push(sym);
            if (type === 'bars') bars.push(sym);
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
