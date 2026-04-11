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

            // LIVE: Standard Price Routing + Bottom Panel Updates
            socket.registerHandler('price', (d) => {
                const data = d.data || d;
                const p = parseFloat(data.price || data.close || 0);
                state.lastPriceDelta = p - state.lastPrice;
                state.lastPrice = p;
                if (this.get('Chart')) this.get('Chart').update(data);

                // Update indicator bar from price message
                if (data.indicators) {
                    const ind = data.indicators;
                    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                    set('rsiCore', ind.rsi != null ? ind.rsi.toFixed(1) : '--');
                    set('macdCore', ind.macd != null ? (typeof ind.macd === 'object' ? (ind.macd.macd || 0).toFixed(2) : ind.macd.toFixed(2)) : '--');
                    set('volumeCore', data.volume ? data.volume.toFixed(0) : '--');
                    set('atrML', ind.atr != null ? ind.atr.toFixed(2) : '--');
                    set('confidenceML', data.confidence != null ? data.confidence.toFixed(0) + '%' : '--');
                }

                // Update performance stats if included
                if (data.stats) {
                    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                    if (data.stats.totalPnl != null) {
                        const pnl = data.stats.totalPnl;
                        set('totalPnl', (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2));
                        const el = document.getElementById('totalPnl');
                        if (el) el.style.color = pnl >= 0 ? 'var(--profit-color)' : 'var(--loss-color)';
                    }
                    if (data.stats.winRate != null) set('winRate', data.stats.winRate.toFixed(1) + '%');
                    if (data.stats.tradesExecuted != null) set('tradesExecuted', data.stats.tradesExecuted);
                }

                // Update status lights
                const dataLight = document.getElementById('dataLight');
                if (dataLight) dataLight.classList.add('green');
                const statusText = document.getElementById('statusText');
                if (statusText) statusText.textContent = 'Connected';
            });

            // LIVE: Intelligence Routing (Strategy HUD)
            socket.registerHandler('bot_thinking', (d) => {
                if (this.get('Intelligence')) this.get('Intelligence').updateWinnerHUD(d);
            });

            // LIVE: Pattern Analysis — updates pattern panel + ghost projection
            socket.registerHandler('pattern_analysis', (d) => {
                // Ghost projection (guarded)
                if (this.get('Chart') && d.projection_path) {
                    this.get('Chart').plotGhost(d.projection_path);
                }

                // Pattern display panel
                if (d.pattern) {
                    const nameEl = document.getElementById('currentPatternName');
                    const descEl = document.getElementById('patternDescription');
                    const patternCore = document.getElementById('patternCore');
                    const patternML = document.getElementById('patternML');
                    const confEl = document.getElementById('confidence');

                    if (nameEl) nameEl.textContent = d.pattern.name || 'No pattern';
                    if (descEl) descEl.innerHTML = `<p class="pattern-info">${d.pattern.description || 'Analyzing market structure...'}</p>`;
                    if (patternCore) patternCore.textContent = d.pattern.name || 'None';
                    if (patternML) patternML.textContent = d.pattern.name || 'None';
                    if (confEl && d.pattern.confidence != null) {
                        confEl.textContent = (d.pattern.confidence * 100).toFixed(0) + '%';
                    }
                }

                // Indicator values from pattern_analysis (the bot sends these here too)
                if (d.indicators) {
                    const ind = d.indicators;
                    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                    if (ind.rsi != null) set('rsiCore', ind.rsi.toFixed(1));
                    if (ind.macd != null) set('macdCore', (typeof ind.macd === 'object' ? (ind.macd.macd || ind.macd).toFixed(2) : ind.macd.toFixed(2)));
                    if (ind.atr != null) set('atrML', ind.atr.toFixed(2));
                }
            });

            // LIVE: Trade execution events — trade log + performance stats update
            socket.registerHandler('trade', (d) => {
                if (this.get('TradeLog')) this.get('TradeLog').addEntry(d);

                // Update trade count
                const tcEl = document.getElementById('tradesExecuted');
                if (tcEl) {
                    const current = parseInt(tcEl.textContent) || 0;
                    tcEl.textContent = current + 1;
                }

                // Update PnL if trade has it
                if (d.pnl != null) {
                    const pnlEl = document.getElementById('totalPnl');
                    if (pnlEl) {
                        const currentPnl = parseFloat(pnlEl.textContent.replace(/[^-\d.]/g, '')) || 0;
                        const newPnl = currentPnl + d.pnl;
                        pnlEl.textContent = (newPnl >= 0 ? '+' : '') + '$' + newPnl.toFixed(2);
                        pnlEl.style.color = newPnl >= 0 ? 'var(--profit-color)' : 'var(--loss-color)';
                    }
                }
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
