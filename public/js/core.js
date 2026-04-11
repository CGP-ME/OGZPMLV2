/**
 * core.js - OGZPrime Orchestrator
 * Centralized State Management & Module Registry
 */
window.OGZ = (function() {
    'use strict';

    const state = {
        tier: 'ml',
        lastPrice: 0,
        lastPriceDelta: 0,
        proximityToGolden: 0,
        isGolden: false,
        activeModules: {}
    };

    return {
        register: (name, mod) => {
            state.activeModules[name] = mod;
            console.log(`[OGZ] Module Registered: ${name}`);
        },

        get: (name) => state.activeModules[name],

        state,

        init: async function() {
            console.log('[Core] Booting Modular System...');

            // Initialization sequence: Chart BEFORE Socket
            if (this.get('Chart')) this.get('Chart').init();
            if (this.get('Socket')) {
                this.bindGlobalHandlers();
                this.get('Socket').connect();
            }
            if (this.get('Operator')) this.get('Operator').init();
            if (this.get('Edge')) this.get('Edge').init();
            if (this.get('DrawingTools')) this.get('DrawingTools').init();
        },

        bindGlobalHandlers: function() {
            const socket = this.get('Socket');
            if (!socket) return;

            // DORMANT: Golden Setup State (awaits backend emitter)
            socket.registerHandler('golden_setup_state', (d) => {
                state.proximityToGolden = d.proximity;
                state.isGolden = d.is_golden;

                // UI Trigger: Golden Alert Pulse
                if (d.proximity >= 0.8) {
                    document.body.classList.add('golden-alert-pulse');
                } else {
                    document.body.classList.remove('golden-alert-pulse');
                }

                // Update Proximity Fill UI
                const fill = document.getElementById('goldenProximityFill');
                if (fill) fill.style.width = (d.proximity * 100) + '%';

                if (this.get('Edge')) this.get('Edge').renderConfluenceMatrix(d.conditions);
                if (this.get('Operator')) this.get('Operator').syncWithGoldenSetup(d.is_golden);
            });

            // LIVE: Standard Price Routing
            socket.registerHandler('price', (d) => {
                const p = parseFloat(d.data?.price || d.data?.close || d.price || 0);
                state.lastPriceDelta = p - state.lastPrice;
                state.lastPrice = p;
                if (this.get('Chart')) this.get('Chart').update(d.data || d);
            });

            // LIVE: Intelligence Routing (Strategy HUD)
            socket.registerHandler('bot_thinking', (d) => {
                if (this.get('Intelligence')) this.get('Intelligence').updateWinnerHUD(d);
            });

            // LIVE-SAFE-GUARDED: Pattern Analysis (Ghost Projections)
            socket.registerHandler('pattern_analysis', (d) => {
                if (this.get('Chart') && d.projection_path) {
                    this.get('Chart').plotGhost(d.projection_path);
                }
            });

            // LIVE: Trade execution events
            socket.registerHandler('trade', (d) => {
                if (this.get('TradeLog')) this.get('TradeLog').addEntry(d);
            });

            // LIVE: Market Internals (Whale Absorption)
            socket.registerHandler('market_internals', (d) => {
                if (this.get('Edge')) this.get('Edge').updateMarketInternals(d);
            });

            // DORMANT: Whale Walls & Depth (awaits Kraken L2 feed)
            socket.registerHandler('depth_update', (d) => {
                if (this.get('Chart')) this.get('Chart').renderLiquidity(d);
                if (this.get('Edge')) this.get('Edge').updateWallRadar(d);
            });

            // LIVE: Historical candle loading
            socket.registerHandler('historical_candles', (d) => {
                if (this.get('Chart')) this.get('Chart').loadHistorical(d.candles);
            });

            // LIVE: Balance sync
            socket.registerHandler('balance_update', (d) => {
                if (this.get('Operator')) this.get('Operator').updateBalance(d.balance);
            });

            // LIVE: State update (fallback balance delivery)
            socket.registerHandler('state_update', (d) => {
                if (d.state?.balance && this.get('Operator')) {
                    this.get('Operator').updateBalance(d.state.balance);
                }
            });
        }
    };
})();
