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
                this.send({ type: 'auth', token: '39ccfbc54660e6075f07730285badebbc40d805748c8eeb7d7f2e32d15ae1c62' });
            };

            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);

                    // God Mode: Delta Merge Engine (dormant — awaits delta emitter)
                    if (data.type === 'delta' && data.tick) {
                        OGZ.state.lastPriceDelta = data.tick.price - OGZ.state.lastPrice;
                        OGZ.state.lastPrice = data.tick.price;
                    }

                    // Auth success → identify + request historical candles
                    if (data.type === 'auth_success') {
                        this.send({ type: 'identify', source: 'dashboard', tier: OGZ.state.tier, version: '2.0.0' });
                        // Request historical candles to fill the chart on load
                        this.send({ type: 'request_historical', timeframe: '1m', limit: 200 });
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
