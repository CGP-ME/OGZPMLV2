/**
 * websocket.js - OGZPrime Data Pipe
 * WebSocket connection with auth, heartbeat, reconnect, and God Mode delta merge
 */
(function(OGZ) {
    'use strict';

    let ws = null;
    let handlers = new Map();
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let dataWatchdogTimer = null;
    let authenticated = false;
    let lastPongAt = 0;
    let lastDataAt = 0;
    let operatorDashboardToken = '';
    let dashboardSessionTicket = '';
    let dashboardSessionBootstrap = null;

    const WS_PATH = '/ws';
    const DASHBOARD_WS_STORAGE_NAME = 'ogz.dashboard.wsToken';
    const DASHBOARD_WS_FRAGMENT_KEYS = ['dashboardToken', 'ogzDashboardToken', 'ogz_ws_token'];
    const DASHBOARD_SESSION_AUTH_TOKEN = '__OGZ_DASHBOARD_SESSION__';
    const HEARTBEAT_INTERVAL_MS = 15000;
    const PONG_TIMEOUT_MS = 30000;
    const DATA_TIMEOUT_MS = 60000;
    const DATA_WATCHDOG_INTERVAL_MS = 30000;
    const OPEN = 1;
    const CONNECTING = 0;
    const DASHBOARD_DATA_FRAME_TYPES = new Set([
        'asset_switched',
        'balance_update',
        'bot_state',
        'bot_thinking',
        'broker_ack',
        'broker_reject',
        'candle',
        'cvd_update',
        'delta',
        'depth_update',
        'divergence',
        'fear_greed',
        'funding_rate',
        'gate_event',
        'historical_candles',
        'journal_snapshot',
        'liquidation_data',
        'market_internals',
        'narrator_event',
        'news_event',
        'pattern_analysis',
        'price',
        'signal_analysis',
        'smart_money',
        'state_update',
        'ticker_price',
        'trace_event',
        'trade',
        'trade_closed_replay',
        'whale_trade',
    ]);

    function socketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}${WS_PATH}`;
    }

    function stopHealthChecks() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        if (dataWatchdogTimer) {
            clearInterval(dataWatchdogTimer);
            dataWatchdogTimer = null;
        }
    }

    function clearReconnectTimer() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function isDataFrame(type) {
        return DASHBOARD_DATA_FRAME_TYPES.has(type);
    }

    function cleanSelectorValue(value) {
        const selected = typeof value === 'string' ? value.trim() : '';
        if (!selected || selected.toLowerCase() === 'none') return '';
        return selected;
    }

    function selectedDashboardAsset() {
        return cleanSelectorValue(document.getElementById('cp-assetSelector')?.value)
            || cleanSelectorValue(document.getElementById('assetSelector')?.value)
            || 'TSLA';
    }

    function selectedDashboardTimeframe() {
        return cleanSelectorValue(document.getElementById('cp-timeframeSelector')?.value)
            || cleanSelectorValue(document.getElementById('timeframeSelector')?.value)
            || '15m';
    }

    function storedDashboardToken() {
        if (dashboardSessionTicket) return DASHBOARD_SESSION_AUTH_TOKEN;
        const fragmentToken = dashboardTokenFromFragment();
        if (fragmentToken) return fragmentToken;
        if (operatorDashboardToken) return operatorDashboardToken;
        try {
            const stored = window.localStorage ? window.localStorage.getItem(DASHBOARD_WS_STORAGE_NAME) : '';
            const trimmed = typeof stored === 'string' ? stored.trim() : '';
            if (trimmed) {
                operatorDashboardToken = trimmed;
                return trimmed;
            }
        } catch (_) {
        }
        return '';
    }

    function dashboardTokenFromFragment() {
        const hash = window.location && typeof window.location.hash === 'string'
            ? window.location.hash.replace(/^#/, '')
            : '';
        if (!hash) return '';

        let params;
        try {
            params = new URLSearchParams(hash);
        } catch (_) {
            return '';
        }

        for (const key of DASHBOARD_WS_FRAGMENT_KEYS) {
            const token = params.get(key);
            if (storeDashboardToken(token)) {
                if (!stripDashboardTokenFragment(params)) {
                    operatorDashboardToken = '';
                    removePersistedDashboardToken();
                    console.warn('[Socket] Dashboard token fragment could not be stripped. Token was not stored.');
                    return '';
                }
                return operatorDashboardToken;
            }
        }

        return '';
    }

    function stripDashboardTokenFragment(existingParams) {
        const hash = window.location && typeof window.location.hash === 'string'
            ? window.location.hash.replace(/^#/, '')
            : '';
        if (!hash) return true;

        let params = existingParams;
        if (!params) {
            try {
                params = new URLSearchParams(hash);
            } catch (_) {
                return true;
            }
        }

        let removed = false;
        for (const key of DASHBOARD_WS_FRAGMENT_KEYS) {
            if (params.has(key)) {
                params.delete(key);
                removed = true;
            }
        }
        if (!removed) return true;

        const nextHash = params.toString();
        const nextUrl = `${window.location.pathname || ''}${window.location.search || ''}${nextHash ? `#${nextHash}` : ''}`;
        try {
            if (window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, document.title, nextUrl || window.location.pathname || '/');
            } else {
                window.location.hash = nextHash;
            }
            return true;
        } catch (_) {
        }

        try {
            window.location.hash = nextHash;
            return true;
        } catch (_) {
        }

        try {
            if (window.location && typeof window.location.replace === 'function') {
                window.location.replace(nextUrl || window.location.pathname || '/');
                return true;
            }
        } catch (_) {
        }

        return false;
    }

    function storeDashboardToken(token) {
        const trimmed = typeof token === 'string' ? token.trim() : '';
        if (!trimmed) return false;
        operatorDashboardToken = trimmed;
        return true;
    }

    function removePersistedDashboardToken() {
        try {
            if (window.localStorage) window.localStorage.removeItem(DASHBOARD_WS_STORAGE_NAME);
        } catch (_) {
        }
    }

    function clearStoredDashboardToken() {
        operatorDashboardToken = '';
        removePersistedDashboardToken();
        const stripped = stripDashboardTokenFragment();
        if (!stripped) {
            console.warn('[Socket] Dashboard token fragment could not be stripped during token clear.');
        }
        return stripped;
    }

    function dashboardAuthToken() {
        return storedDashboardToken();
    }

    async function requestDashboardSessionTicket() {
        if (typeof fetch !== 'function') return false;
        try {
            const response = await fetch('/api/dashboard/session-ticket', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });
            if (!response || !response.ok) return false;
            const payload = await response.json();
            const ticket = payload && typeof payload.ticket === 'string' ? payload.ticket.trim() : '';
            if (!ticket) return false;
            dashboardSessionTicket = ticket;
            operatorDashboardToken = '';
            removePersistedDashboardToken();
            return true;
        } catch (err) {
            console.warn('[Socket] Dashboard session ticket request failed:', err && err.message ? err.message : err);
            return false;
        }
    }

    function bootstrapDashboardSession() {
        if (dashboardSessionBootstrap) return true;
        dashboardSessionBootstrap = requestDashboardSessionTicket()
            .then((ok) => {
                dashboardSessionBootstrap = null;
                if (ok) {
                    removeDashboardTokenPrompt();
                    Socket.connect();
                } else {
                    showDashboardTokenPrompt();
                }
                return ok;
            });
        return true;
    }

    async function enrollDashboardSession(rawToken) {
        const submitted = typeof rawToken === 'string' ? rawToken.trim() : '';
        if (!submitted) {
            console.warn('[Socket] Refusing empty dashboard token');
            return false;
        }
        if (typeof fetch !== 'function') {
            console.warn('[Socket] Dashboard session enrollment unavailable in this browser.');
            return false;
        }
        try {
            const response = await fetch('/api/dashboard/session', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: submitted })
            });
            if (!response || !response.ok) {
                console.warn('[Socket] Dashboard session enrollment rejected.');
                return false;
            }
            const payload = await response.json();
            const ticket = payload && typeof payload.ticket === 'string' ? payload.ticket.trim() : '';
            if (!ticket) {
                console.warn('[Socket] Dashboard session enrollment did not return a WebSocket ticket.');
                return false;
            }
            dashboardSessionTicket = ticket;
            operatorDashboardToken = '';
            removePersistedDashboardToken();
            if (!stripDashboardTokenFragment()) {
                dashboardSessionTicket = '';
                console.warn('[Socket] Dashboard token fragment could not be stripped. Session was not used.');
                return false;
            }
            return true;
        } catch (err) {
            console.warn('[Socket] Dashboard session enrollment failed:', err && err.message ? err.message : err);
            return false;
        }
    }

    function removeDashboardTokenGate() {
        const existing = document.getElementById('ogz-dashboard-token-gate');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    }

    function removeDashboardTokenPrompt() {
        const existing = document.getElementById('ogz-dashboard-token-prompt');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    }

    function showDashboardTokenPrompt() {
        if (!document.body) return null;
        const existing = document.getElementById('ogz-dashboard-token-prompt');
        if (existing) return existing;

        const panel = document.createElement('div');
        panel.id = 'ogz-dashboard-token-prompt';
        panel.className = 'ogz-dashboard-token-prompt';
        panel.style.cssText = [
            'position:fixed',
            'z-index:2147483647',
            'left:12px',
            'right:12px',
            'bottom:12px',
            'max-width:520px',
            'margin:0 auto',
            'padding:14px',
            'border:1px solid rgba(250,204,21,.55)',
            'background:rgba(5,7,10,.96)',
            'box-shadow:0 16px 48px rgba(0,0,0,.55)',
            'font-family:JetBrains Mono,monospace',
            'color:#f8fafc'
        ].join(';');

        const title = document.createElement('div');
        title.textContent = 'Dashboard access required';
        title.style.cssText = 'font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#facc15;margin-bottom:8px';

        const detail = document.createElement('div');
        detail.textContent = 'Enter the operator WebSocket key to start live data on this browser.';
        detail.style.cssText = 'font-size:11px;line-height:1.45;color:#cbd5e1;margin-bottom:10px';

        const form = document.createElement('form');
        form.id = 'ogz-dashboard-token-form';
        form.style.cssText = 'display:grid;grid-template-columns:1fr;gap:8px;align-items:stretch';

        const input = document.createElement('input');
        input.id = 'ogz-dashboard-token-input';
        input.type = 'password';
        input.name = 'dashboard-token';
        input.autocomplete = 'off';
        input.placeholder = 'Operator WebSocket key';
        input.style.cssText = 'min-width:0;width:100%;box-sizing:border-box;padding:10px;border:1px solid rgba(148,163,184,.45);background:#020617;color:#f8fafc;font:12px JetBrains Mono,monospace;outline:none';

        const button = document.createElement('button');
        button.id = 'ogz-dashboard-token-submit';
        button.type = 'submit';
        button.textContent = 'Connect';
        button.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(34,211,238,.65);background:#071316;color:#22d3ee;font:800 12px JetBrains Mono,monospace;text-transform:uppercase';

        form.addEventListener('submit', async (event) => {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            button.disabled = true;
            button.textContent = 'Connecting';
            if (await enrollDashboardSession(input.value)) {
                removeDashboardTokenPrompt();
                Socket.connect();
            } else {
                button.disabled = false;
                button.textContent = 'Connect';
                input.focus();
            }
        });

        form.appendChild(input);
        form.appendChild(button);
        panel.appendChild(title);
        panel.appendChild(detail);
        panel.appendChild(form);
        document.body.appendChild(panel);
        input.focus();
        return panel;
    }

    function sendRaw(data) {
        if (ws && ws.readyState === OPEN) {
            ws.send(JSON.stringify(data));
            return true;
        }
        console.warn('[Socket] Send skipped; socket not open:', data && data.type, ws ? ws.readyState : 'none');
        return false;
    }

    function scheduleReconnect(reason) {
        if (reconnectTimer) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        console.log(`[Socket] Reconnecting in ${delay}ms: ${reason}`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            reconnectAttempts++;
            Socket.connect();
        }, delay);
    }

    function forceReconnect(reason) {
        const staleSocket = ws;
        authenticated = false;
        ws = null;
        stopHealthChecks();

        if (staleSocket && staleSocket.readyState === OPEN) {
            try {
                staleSocket.close(4000, reason.slice(0, 120));
            } catch (err) {
                console.error('[Socket] Failed to close stale connection:', err);
            }
        }

        scheduleReconnect(reason);
    }

    function startHealthChecks() {
        stopHealthChecks();
        lastPongAt = Date.now();
        lastDataAt = Date.now();

        heartbeatTimer = setInterval(() => {
            if (!ws || ws.readyState !== OPEN || !authenticated) return;

            const timeSincePong = Date.now() - lastPongAt;
            if (timeSincePong > PONG_TIMEOUT_MS) {
                console.warn(`[Socket] Heartbeat timeout after ${Math.round(timeSincePong / 1000)}s without pong`);
                forceReconnect('heartbeat timeout');
                return;
            }

            sendRaw({ type: 'ping', timestamp: Date.now() });
        }, HEARTBEAT_INTERVAL_MS);

        dataWatchdogTimer = setInterval(() => {
            if (!ws || ws.readyState !== OPEN || !authenticated) return;

            const timeSinceData = Date.now() - lastDataAt;
            if (timeSinceData > DATA_TIMEOUT_MS) {
                console.warn(`[Socket] Data watchdog stale after ${Math.round(timeSinceData / 1000)}s without dashboard data`);
                forceReconnect('data watchdog stale');
            }
        }, DATA_WATCHDOG_INTERVAL_MS);
    }

    const Socket = {
        connect: function() {
            if (ws && (ws.readyState === OPEN || ws.readyState === CONNECTING)) {
                console.log('[Socket] Connect skipped; socket already active.');
                return;
            }

            clearReconnectTimer();
            stopHealthChecks();
            authenticated = false;

            const token = dashboardAuthToken();
            if (!token) {
                removeDashboardTokenGate();
                bootstrapDashboardSession();
                console.warn('[Socket] No dashboard token configured. Dashboard data socket remains disconnected.');
                return false;
            }

            const url = socketUrl();
            console.log(`[Socket] Connecting to ${url}...`);
            const currentSocket = new WebSocket(url);
            ws = currentSocket;

            currentSocket.onopen = () => {
                if (currentSocket !== ws) return;
                console.log('[Socket] Connected. Authenticating...');
                // Public HTML must not carry WEBSOCKET_AUTH_TOKEN. Until the
                // gated session/ticket flow lands, an empty token fails closed
                // at the server instead of silently using a leaked literal.
                if (token === DASHBOARD_SESSION_AUTH_TOKEN) {
                    this.send({ type: 'auth', token, ticket: dashboardSessionTicket });
                    dashboardSessionTicket = '';
                } else {
                    this.send({ type: 'auth', token });
                }
            };

            currentSocket.onmessage = (e) => {
                if (currentSocket !== ws) return;
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'pong') {
                        lastPongAt = Date.now();
                    }
                    if (isDataFrame(data.type)) {
                        lastDataAt = Date.now();
                    }

                    // God Mode: Delta Merge Engine (dormant — awaits delta emitter)
                    if (data.type === 'delta' && data.tick) {
                        OGZ.state.lastPriceDelta = data.tick.price - OGZ.state.lastPrice;
                        OGZ.state.lastPrice = data.tick.price;
                    }

                    // Auth success -> identify + load historical candles for selected asset.
                    if (data.type === 'auth_success') {
                        authenticated = true;
                        reconnectAttempts = 0;
                        removeDashboardTokenGate();
                        removeDashboardTokenPrompt();
                        startHealthChecks();
                        this.send({ type: 'identify', source: 'dashboard', tier: OGZ.state.tier, version: '2.0.0' });
                        // V2 chart-panel uses cp-* IDs; fall back to legacy monolith IDs,
                        // then default. Same fallback chain CC-D bakes into asset consumers.
                        const asset = selectedDashboardAsset();
                        const tf = selectedDashboardTimeframe();
                        // #47: prime both startup paths. `asset_change` updates
                        // bot-side selected asset state, while `request_historical`
                        // asks the stock adapter or bot to send historical_candles.
                        // Fresh loads need both; manual ticker clicks already send
                        // asset_change, which is why the chart populated only after
                        // the user clicked a ticker.
                        this.send({ type: 'asset_change', asset: asset });
                        this.send({ type: 'request_historical', timeframe: tf, asset: asset, limit: 500 });
                    }
                    if (data.type === 'auth_failure') {
                        clearStoredDashboardToken();
                        console.warn('[Socket] Dashboard token was rejected. Stored token cleared.');
                        showDashboardTokenPrompt();
                        currentSocket.close(1008, 'dashboard auth failure');
                    }

                    // Dispatch to registered handlers
                    const handlerList = handlers.get(data.type);
                    if (handlerList) handlerList.slice().forEach(cb => cb(data));
                } catch (err) {
                    console.error('[Socket] Parse error:', err);
                }
            };

            currentSocket.onclose = (event) => {
                if (currentSocket !== ws) return;
                const wasAuthenticated = authenticated;
                authenticated = false;
                ws = null;
                stopHealthChecks();
                const code = event && event.code != null ? event.code : 'unknown';
                const reason = event && event.reason ? event.reason : 'no reason';
                console.log(`[Socket] Disconnected: code=${code}, reason=${reason}`);
                if (!wasAuthenticated && (code === 1008 || /auth|token/i.test(reason))) {
                    clearStoredDashboardToken();
                    console.warn(`[Socket] Dashboard token rejected: ${reason}`);
                    showDashboardTokenPrompt();
                    return;
                }
                scheduleReconnect(`close code=${code}`);
            };

            currentSocket.onerror = (err) => {
                if (currentSocket !== ws) return;
                console.error('[Socket] Error:', err);
            };
        },

        registerHandler: (type, cb) => {
            if (!type || typeof cb !== 'function') return false;
            if (!handlers.has(type)) handlers.set(type, []);
            const handlerList = handlers.get(type);
            if (!handlerList.includes(cb)) handlerList.push(cb);
            return true;
        },

        unregisterHandler: (type, cb) => {
            if (!type || typeof cb !== 'function') return false;
            const handlerList = handlers.get(type);
            if (!handlerList) return false;
            const next = handlerList.filter(handler => handler !== cb);
            if (next.length === handlerList.length) return false;
            if (next.length === 0) handlers.delete(type);
            else handlers.set(type, next);
            return true;
        },

        send: (data) => {
            return sendRaw(data);
        },

        setAuthToken: (token) => {
            if (typeof token !== 'string' || token.trim() === '') {
                console.warn('[Socket] Refusing empty dashboard token');
                return false;
            }
            try {
                storeDashboardToken(token);
                if (!stripDashboardTokenFragment()) {
                    operatorDashboardToken = '';
                    removePersistedDashboardToken();
                    showDashboardTokenPrompt();
                    console.warn('[Socket] Dashboard token fragment could not be stripped. Token was not stored.');
                    return false;
                }
            } catch (err) {
                console.error('[Socket] Failed to store dashboard token:', err);
                return false;
            }
            removeDashboardTokenPrompt();
            forceReconnect('dashboard token updated');
            return true;
        },

        clearAuthToken: () => {
            try {
                clearStoredDashboardToken();
                stripDashboardTokenFragment();
            } catch (err) {
                console.error('[Socket] Failed to clear dashboard token:', err);
                return false;
            }
            removeDashboardTokenPrompt();
            forceReconnect('dashboard token cleared');
            return true;
        },

        getAuthToken: () => dashboardAuthToken(),

        isConnected: () => Boolean(ws && ws.readyState === OPEN && authenticated)
    };

    OGZ.register('Socket', Socket);
})(window.OGZ);
