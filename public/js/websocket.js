/**
 * websocket.js - OGZPrime Data Pipe
 * WebSocket connection with auth, heartbeat, reconnect, and God Mode delta merge
 */
(function(OGZ) {
    'use strict';

    let ws = null;
    let handlers = new Map();
    let reconnectAttempts = 0;

    const Socket = {
        connect: function() {
            console.log('[Socket] Connecting...');
            ws = new WebSocket(`wss://${window.location.host}/ws`);

            ws.onopen = () => {
                reconnectAttempts = 0;
                console.log('[Socket] Connected.');
                // Wolf CC-SPEC-POST-PHASE3 Commit 7 (2026-04-30): runtime
                // token injection. Token is read from <meta name="ws-token">
                // (server-side injectable via custom route handler) or from
                // window.OGZ_DASHBOARD_TOKEN (set by an inline script tag).
                // Empty string falls back to no-auth — server will reject
                // and dashboard surfaces a clear auth-failure error rather
                // than silently using a leaked literal.
                const metaToken = document.querySelector('meta[name="ws-token"]')?.content;
                const token = (metaToken && metaToken !== '') ? metaToken
                    : (typeof window.OGZ_DASHBOARD_TOKEN === 'string' ? window.OGZ_DASHBOARD_TOKEN : '');
                if (!token) {
                    console.warn('[Socket] No dashboard token configured — set <meta name="ws-token"> or window.OGZ_DASHBOARD_TOKEN');
                }
                this.send({ type: 'auth', token });
            };

            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);

                    // God Mode: Delta Merge Engine (dormant — awaits delta emitter)
                    if (data.type === 'delta' && data.tick) {
                        OGZ.state.lastPriceDelta = data.tick.price - OGZ.state.lastPrice;
                        OGZ.state.lastPrice = data.tick.price;
                    }

                    // Auth success → identify + request historical candles for selected asset
                    if (data.type === 'auth_success') {
                        this.send({ type: 'identify', source: 'dashboard', tier: OGZ.state.tier, version: '2.0.0' });
                        const asset = document.getElementById('assetSelector')?.value || 'TSLA';
                        const tf = document.getElementById('timeframeSelector')?.value || '15m';
                        this.send({ type: 'request_historical', timeframe: tf, asset: asset, limit: 500 });
                    }

                    // Dispatch to registered handlers
                    const handlerList = handlers.get(data.type);
                    if (handlerList) handlerList.forEach(cb => cb(data));
                } catch (err) {
                    console.error('[Socket] Parse error:', err);
                }
            };

            ws.onclose = () => {
                console.log('[Socket] Disconnected. Reconnecting...');
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                setTimeout(() => { reconnectAttempts++; this.connect(); }, delay);
            };

            ws.onerror = (err) => {
                console.error('[Socket] Error:', err);
            };
        },

        registerHandler: (type, cb) => {
            if (!handlers.has(type)) handlers.set(type, []);
            handlers.get(type).push(cb);
        },

        send: (data) => {
            if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
        },

        isConnected: () => ws && ws.readyState === 1
    };

    OGZ.register('Socket', Socket);
})(window.OGZ);
