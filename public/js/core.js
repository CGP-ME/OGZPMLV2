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
        lastBotMessageAt: 0,
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
            if (this.get('CommandPalette')) this.get('CommandPalette').init();
            if (this.get('Heatbar')) this.get('Heatbar').init();
            if (this.get('RiskGauge')) this.get('RiskGauge').init();
            if (this.get('CandleCountdown')) this.get('CandleCountdown').init();
            if (this.get('SessionPhase')) this.get('SessionPhase').init();
            if (this.get('SizePreview')) this.get('SizePreview').init();
            if (this.get('StrategyLeaderboard')) this.get('StrategyLeaderboard').init();

            // Check TRAI status light
            fetch('/api/trai/status').then(r => r.ok ? r.json() : null).then(d => {
                const traiLight = document.getElementById('traiLight');
                if (traiLight && d && d.ready) {
                    traiLight.classList.remove('red','yellow');
                    traiLight.classList.add('green');
                }
            }).catch(() => {});

            // Bot feed watchdog: if no price/pattern/trade message arrives for
            // >15s, surface a visible "bot offline" state + seed placeholders
            // so the empty bottom panels aren't silent.
            state.lastBotMessageAt = 0;
            setInterval(() => {
                const pill = document.getElementById('feedStatusPill');
                const stale = Date.now() - (state.lastBotMessageAt || 0) > 15000;
                if (pill) pill.style.display = stale ? 'block' : 'none';
                ['botLight'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.remove(stale ? 'green' : 'red');
                    el.classList.add(stale ? 'red' : 'green');
                });
                if (stale) {
                    const thought = document.getElementById('thoughtDisplay');
                    if (thought && !thought.dataset.stale) {
                        thought.dataset.stale = '1';
                        thought.innerHTML = '<p style="color:#888;font-size:11px;">Bot offline — no feed received in 15s. Check <code>pm2 list</code> for <code>ogz-prime-v2</code>.</p>';
                    }
                    const patternName = document.getElementById('currentPatternName');
                    if (patternName && !patternName.dataset.stale) {
                        patternName.dataset.stale = '1';
                        patternName.textContent = 'Waiting for bot…';
                    }
                } else {
                    const thought = document.getElementById('thoughtDisplay');
                    if (thought) delete thought.dataset.stale;
                    const patternName = document.getElementById('currentPatternName');
                    if (patternName) delete patternName.dataset.stale;
                }
            }, 3000);
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
                state.lastBotMessageAt = Date.now();
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
                    const vol = data.volume != null ? data.volume : (data.candle && data.candle.volume);
                    set('volumeCore', vol != null ? Number(vol).toFixed(0) : '--');
                    set('atrML', ind.atr != null ? ind.atr.toFixed(2) : '--');
                    set('confidenceML', data.confidence != null ? data.confidence.toFixed(0) + '%' : '--');
                }

                // Update performance stats — supports both `data.stats.*` and flat
                // CandleProcessor shape (`totalPnL`, `winRate`, `totalTrades` on `data`).
                const st = data.stats || {};
                const totalPnl = st.totalPnl != null ? st.totalPnl : (data.totalPnL != null ? data.totalPnL : data.totalPnl);
                const winRate = st.winRate != null ? st.winRate : data.winRate;
                const tradesCt = st.tradesExecuted != null ? st.tradesExecuted : data.totalTrades;
                if (totalPnl != null || winRate != null || tradesCt != null) {
                    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                    if (totalPnl != null) {
                        const pnl = Number(totalPnl);
                        // Use unambiguous symbols + bright color so + isn't misread as -
                        set('totalPnl', (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2));
                        const el = document.getElementById('totalPnl');
                        if (el) {
                            el.style.color = pnl >= 0 ? '#22c55e' : '#ef4444';
                            el.style.fontWeight = '900';
                        }
                    }
                    if (winRate != null) set('winRate', Number(winRate).toFixed(1) + '%');
                    if (tradesCt != null) set('tradesExecuted', String(tradesCt));
                }

                // Update status lights — all three
                ['dataLight', 'botLight'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) { el.classList.remove('red','yellow'); el.classList.add('green'); }
                });
                const statusText = document.getElementById('statusText');
                if (statusText) statusText.textContent = 'Connected';
                const connDot = document.getElementById('connectionStatus');
                if (connDot) { connDot.classList.remove('red'); connDot.classList.add('green'); }
            });

            // LIVE: Intelligence Routing (Strategy HUD)
            socket.registerHandler('bot_thinking', (d) => {
                state.lastBotMessageAt = Date.now();
                if (this.get('Intelligence')) this.get('Intelligence').updateWinnerHUD(d);
                // Populate the indicators-bar "Live Conf" field. bot_thinking
                // carries decision.confidence which the price event does not —
                // without this wire, #confidenceML rendered '--' on every tick.
                const conf = (d && d.confidence != null) ? d.confidence
                          : (d && d.data && d.data.confidence != null) ? d.data.confidence
                          : null;
                if (conf != null) {
                    const el = document.getElementById('confidenceML');
                    if (el) el.textContent = Number(conf).toFixed(0) + '%';
                }
            });

            // LIVE: Pattern Analysis — updates pattern panel + ghost projection
            socket.registerHandler('pattern_analysis', (d) => {
                state.lastBotMessageAt = Date.now();
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
                state.lastBotMessageAt = Date.now();
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

            // LIVE: Historical candle loading.
            // If the bot includes a `symbol` field (added 2026-04-27 to heal
            // post-swap dashboard state), sync the UI's asset display so the
            // chart isn't labeled "TSLA" while showing BTC candles.
            socket.registerHandler('historical_candles', (d) => {
                if (this.get('Chart')) this.get('Chart').loadHistorical(d.candles);
                if (d && d.symbol) {
                    // asset-tf-card mirrors #symbolSelector + listens to price events
                    const symbolEl = document.querySelector('.asset-tf-card__symbol');
                    if (symbolEl) symbolEl.textContent = String(d.symbol);
                    const symSel = document.getElementById('symbolSelector');
                    if (symSel) {
                        // Try to match dropdown option; tolerate format differences
                        // (e.g. 'BTC/USD' → 'BTC-USD').
                        const dash = String(d.symbol).replace('/', '-');
                        if (Array.from(symSel.options).some(o => o.value === dash)) {
                            symSel.value = dash;
                        }
                    }
                }
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

            // LIVE: Narrator events (USER_NARRATOR only — sanitized customer story).
            // Prepends each event to Chain of Thought so the panel fills with
            // the trade story as it unfolds. TradeNarrator broadcasts text in
            // payload.text (see commit 5b6845c) so we can render directly.
            socket.registerHandler('narrator_event', (d) => {
                state.lastBotMessageAt = Date.now();
                const container = document.getElementById('chainOfThought');
                if (!container) return;
                // Clear placeholder on first narrator event
                const placeholder = container.querySelector('#thoughtDisplay');
                if (placeholder && !container.dataset.narratorStarted) {
                    placeholder.remove();
                    container.dataset.narratorStarted = '1';
                }
                const entry = document.createElement('div');
                entry.className = 'thought-entry narrator-entry';
                const ts = new Date(d.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
                // Sanitize d.text before injecting
                const safeText = String(d.text || '').replace(/[&<>"']/g, c =>
                    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
                entry.innerHTML = `
                    <div style="display:flex;gap:10px;align-items:baseline;">
                        <span style="color:#71717a;font-size:10px;font-family:'JetBrains Mono',monospace;letter-spacing:0.05em;">${ts}</span>
                        <span style="color:#e4e4e7;font-size:12px;line-height:1.5;flex:1;">${safeText}</span>
                    </div>`;
                container.prepend(entry);
                // Cap at 40 entries
                while (container.children.length > 40) container.lastChild.remove();
            });
        }
    };
})();
