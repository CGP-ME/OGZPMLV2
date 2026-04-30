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

    async _placeOrder(symbol, amount, side, price = null, options = {}) {
        // Mercury Round 1 attacks B/F: defensive amount validation. NaN slips
        // past Math.floor (NaN <= 0 is false), strings/undefined throw on
        // toFixed mid-call. Validate at function entry so all downstream
        // arithmetic and formatting see a clean Number.
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error(`[Alpaca] Invalid amount: ${amount} (must be finite positive number)`);
        }
        // Mercury Round 4 attack H: price finiteness validation when present.
        // `price && price > 0` truthy-check accepts Infinity (Infinity > 0 is
        // true). Symmetric guard with amount: if price is supplied, it must
        // be a finite positive Number. null/undefined skip the limit branch
        // entirely (market order path).
        if (price != null && (!Number.isFinite(price) || price <= 0)) {
            throw new Error(`[Alpaca] Invalid price: ${price} (must be null or finite positive number)`);
        }
        // Mercury Round 3 attack E + Round 4 attack B: symbol validation.
        // Empty string passes toBrokerSymbol() and produces a malformed
        // payload; null/undefined throws a confusing TypeError mid-call.
        // Internal whitespace (' tsla ', 'TS LA') survives toBrokerSymbol's
        // simple split('/').toUpperCase() and reaches Alpaca, which rejects.
        // Clear diagnostic at the adapter boundary.
        if (!symbol || typeof symbol !== 'string' || symbol !== symbol.trim() || /\s/.test(symbol)) {
            throw new Error(`[Alpaca] Invalid symbol: '${symbol}' (must be non-empty string without whitespace)`);
        }
        try {
            // Wolf CC-SPEC-POST-PHASE3-EXECUTION-QUEUE Commit 2 (2026-04-30):
            // 3-branch USD/shares dispatch. Prior code did `qty: amount.toString()`
            // unconditionally, so callers passing USD ($500) sent it as share
            // count to Alpaca's REST API ($500 → 500 shares = $187.5K). This
            // method now interprets `amount` according to options.isShareQty:
            //   - isShareQty=true: amount IS shares (close paths, Commit 4)
            //   - limit order: convert USD→shares via floor(amount / price)
            //     (Alpaca limit orders cannot use `notional`)
            //   - default (market open): use Alpaca's `notional` field (USD)
            //
            // Mercury Round 1 attacks C/D: tighten `price ? 'limit' : 'market'`
            // truthy check to `price > 0`. Negative or zero price was previously
            // treated as a limit order at the type-selector but excluded from
            // the limit-conversion branch, producing a malformed payload with
            // both notional AND limit_price. Both checks now agree on `> 0`.
            const orderData = {
                symbol: this.toBrokerSymbol(symbol),
                side: side,
                type: (price && price > 0) ? 'limit' : 'market',
                time_in_force: options.timeInForce || 'day'
            };

            if (options.isShareQty) {
                // Close orders pass actual share count (Commit 4 wires this)
                orderData.qty = Math.abs(amount).toString();
                console.log(`[Alpaca] Share-qty order: ${amount} shares ${side} ${symbol}`);
            } else if (price && price > 0) {
                // Limit order with USD: Alpaca limit orders require `qty`.
                // Floor-convert USD to whole shares at the limit price.
                // Mercury Round 2 attack A: extremely small price (e.g.
                // Number.EPSILON) makes amount/price overflow to Infinity,
                // which floor returns unchanged; `Infinity <= 0` is false
                // so the prior guard didn't catch it, and the adapter sent
                // qty="Infinity" to Alpaca. Number.isFinite() rejects both
                // Infinity and NaN.
                const shares = Math.floor(amount / price);
                if (!Number.isFinite(shares) || shares <= 0) {
                    throw new Error(`Invalid share count: ${shares} (amount=$${amount.toFixed(2)}, price=$${price.toFixed(2)})`);
                }
                orderData.qty = shares.toString();
                console.log(`[Alpaca] USD→shares: $${amount.toFixed(2)} / $${price.toFixed(2)} = ${shares} shares ${side} ${symbol}`);
            } else {
                // Market order with USD amount: notional is Alpaca's USD field.
                // Mercury Round 4 attack C: Alpaca's documented minimum notional
                // is $1. Sub-$1 amounts pass the positive-finite guard but get
                // rejected by Alpaca with a cryptic error. Fail-fast at the
                // adapter for a clear diagnostic.
                if (amount < 1) {
                    throw new Error(`[Alpaca] Notional below $1 minimum: $${amount.toFixed(2)} (Alpaca rejects sub-$1 notional orders)`);
                }
                orderData.notional = amount.toFixed(2);
                console.log(`[Alpaca] Notional order: $${amount.toFixed(2)} ${side} ${symbol}`);
            }

            if (price && price > 0) {
                orderData.limit_price = price.toString();
            }

            // Bracket order support (SL + TP).
            // Mercury Round 1 attack E: bracket and OTO orders REQUIRE `qty` —
            // Alpaca rejects payloads that combine `notional` with bracket/OTO
            // class. Fail-fast if a caller passes SL/TP for a market+USD
            // (notional) order; the caller must supply isShareQty=true with
            // actual share count. This keeps a malformed REST call from ever
            // hitting the wire.
            //
            // Mercury Round 2 attack D: validate stopLoss/takeProfit are
            // finite positive numbers before .toString(). Same defense as
            // amount — NaN/Infinity/string at boundary would produce a
            // malformed payload Alpaca rejects.
            if (options.stopLoss && options.takeProfit) {
                if (!Number.isFinite(options.stopLoss) || options.stopLoss <= 0) {
                    throw new Error(`[Alpaca] Invalid stopLoss: ${options.stopLoss} (must be finite positive number)`);
                }
                if (!Number.isFinite(options.takeProfit) || options.takeProfit <= 0) {
                    throw new Error(`[Alpaca] Invalid takeProfit: ${options.takeProfit} (must be finite positive number)`);
                }
                if (orderData.notional) {
                    throw new Error(`[Alpaca] Bracket orders require qty, not notional. Pass options.isShareQty=true with share count for bracket+market USD orders.`);
                }
                orderData.order_class = 'bracket';
                orderData.stop_loss = { stop_price: options.stopLoss.toString() };
                orderData.take_profit = { limit_price: options.takeProfit.toString() };
            } else if (options.stopLoss) {
                if (!Number.isFinite(options.stopLoss) || options.stopLoss <= 0) {
                    throw new Error(`[Alpaca] Invalid stopLoss: ${options.stopLoss} (must be finite positive number)`);
                }
                if (orderData.notional) {
                    throw new Error(`[Alpaca] OTO orders require qty, not notional. Pass options.isShareQty=true with share count for OTO+market USD orders.`);
                }
                orderData.order_class = 'oto';
                orderData.stop_loss = { stop_price: options.stopLoss.toString() };
            }

            const response = await axios.post(`${this.baseUrl}/v2/orders`, orderData, {
                headers: this._authHeaders()
            });

            // Mercury Round 5 attack G: defensive response parsing.
            // For notional orders, Alpaca's response populates `notional`
            // and `qty` may be empty/pending until fill. Prior code did
            // `parseFloat(response.data.qty)` only — returned NaN for
            // notional orders, propagating upstream as activeTrade.amount=NaN.
            // Fallback chain mirrors the price field's existing defensive
            // pattern: try qty → filled_qty → notional → 0.
            //
            // Mercury Round 6 attack E: output finiteness symmetric with
            // input validation. parseFloat of malformed strings (e.g. "1e309")
            // returns Infinity. Clamp to 0 with warning so caller always
            // gets a finite non-negative Number.
            const rawRespAmount = parseFloat(
                response.data.qty ||
                response.data.filled_qty ||
                response.data.notional ||
                0
            );
            let respAmount = rawRespAmount;
            if (!Number.isFinite(respAmount) || respAmount < 0) {
                console.warn(`[Alpaca] Malformed response amount: ${rawRespAmount} (qty=${response.data.qty}, filled_qty=${response.data.filled_qty}, notional=${response.data.notional}); defaulting to 0`);
                respAmount = 0;
            }
            return {
                orderId: response.data.id,
                status: response.data.status,
                symbol: response.data.symbol,
                side: response.data.side,
                price: parseFloat(response.data.limit_price || response.data.filled_avg_price || 0),
                amount: respAmount,
                notional: parseFloat(response.data.notional || 0)
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

            // BUG FIX 2026-04-28: without an explicit `start` param Alpaca's
            // IEX endpoint returns whatever's most-recent — at 11 AM EDT
            // that's only ~13 15m bars from RTH open. Trey asked for 200
            // prior candles to warm RSI/EMA/ATR from yesterday's close.
            // Compute `start` going back enough trading-time to cover the
            // requested limit. We pad ×3 to absorb weekends, holidays, and
            // overnight gaps where stock data doesn't exist.
            const tfMinutes = this._timeframeMinutes(timeframe);
            const lookbackMs = tfMinutes * 60 * 1000 * limit * 3;
            const start = new Date(Date.now() - lookbackMs).toISOString();

            const response = await axios.get(
                `${this.dataUrl}/v2/stocks/${sym}/bars`,
                {
                    headers: this._authHeaders(),
                    params: {
                        timeframe: tf,
                        start,
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

    // Helper: timeframe string → minutes for `start` window math above.
    _timeframeMinutes(timeframe) {
        const map = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
        return map[timeframe] || 1;
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
        // BUG FIX 2026-04-27: previously stored ONE _initialSubscribeCallback,
        // overwritten on each call. SessionRouter loops 7 stockSymbols
        // (TSLA, SPY, QQQ, NVDA, COIN, MARA, RIOT) calling subscribeToCandles
        // per-symbol — only RIOT (last) ever subscribed. TSLA bars never flowed.
        // Now accumulates all callbacks and drains them in onAuthenticated.
        if (!this._pendingSubscribeCallbacks) this._pendingSubscribeCallbacks = [];
        this._pendingSubscribeCallbacks.push(callback);
        if (!this.rws) {
            this._buildResilientWS();
            this.rws.start();
        }
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
            // BUG FIX 2026-04-27: Alpaca sends auth-success wrapped in a
            // 1-element array: [{T:"success",msg:"authenticated"}]. The
            // bare-object check failed on arrays, predicate never matched,
            // _fireAuthenticated() never fired, callbacks never drained.
            // Now handles both array + bare-object forms.
            authSuccessPredicate: (msg) => {
                const isAuth = (m) => m && m.T === 'success' && m.msg === 'authenticated';
                if (Array.isArray(msg)) return msg.some(isAuth);
                return isAuth(msg);
            },
            onMessage: (msg) => this._handleStreamMessage(msg),
            onAuthenticated: ({ isReconnect }) => {
                console.log(`[Alpaca] Data stream authenticated (isReconnect=${isReconnect})`);
                if (isReconnect) {
                    console.log(`[Alpaca] Replaying ${this.subscriptions.size} subscription(s)`);
                    this._replaySubscriptions();
                } else if (this._pendingSubscribeCallbacks?.length) {
                    const callbacks = this._pendingSubscribeCallbacks;
                    this._pendingSubscribeCallbacks = [];
                    console.log(`[Alpaca] Draining ${callbacks.length} pending subscribe callback(s)`);
                    for (const cb of callbacks) {
                        try { cb(); }
                        catch (err) { console.error('[Alpaca] initial subscribe callback threw:', err.message); }
                    }
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
