/**
 * core.js - OGZPrime Orchestrator
 * Centralized State Management & Module Registry
 */
window.OGZ = (window.OGZ && window.OGZ.__coreGuard === 'ogz-core-v2')
    ? window.OGZ
    : (function() {
    'use strict';

    const SPECIAL_MODULES = new Set(['Chart', 'Socket', 'Theme']);
    const initializedModules = new Map();
    const initializedModuleRefs = new Set();

    const state = {
        tier: 'ml',
        lastPrice: 0,
        lastPriceDelta: 0,
        proximityToGolden: 0,
        isGolden: false,
        lastBotMessageAt: 0,
        initialized: false,
        activeModules: {}
    };

    function isNumericValue(value) {
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed !== '' && Number.isFinite(Number(trimmed));
        }
        return false;
    }

    function initRegisteredModule(name, mod, force) {
        if (SPECIAL_MODULES.has(name) && !force) return;
        if (initializedModules.get(name) === mod) return;
        if (!mod || typeof mod.init !== 'function') return;
        if (initializedModuleRefs.has(mod)) {
            initializedModules.set(name, mod);
            return;
        }
        try {
            mod.init();
            initializedModules.set(name, mod);
            initializedModuleRefs.add(mod);
        } catch (e) {
            console.error(`[OGZ] Module init failed: ${name}`, e);
        }
    }

    return {
        __coreGuard: 'ogz-core-v2',

        register: (name, mod) => {
            if (state.activeModules[name]) {
                console.warn(`[OGZ] Duplicate module registration ignored: ${name}`);
                return;
            }
            state.activeModules[name] = mod;
            console.log(`[OGZ] Module Registered: ${name}`);
            if (state.initialized) {
                initRegisteredModule(name, mod);
            }
        },

        get: (name) => state.activeModules[name],

        state,

        init: async function() {
            if (state.initialized) {
                console.log('[Core] Modular System already booted.');
                return;
            }
            state.initialized = true;
            console.log('[Core] Booting Modular System...');

            // Chart MUST init first because price/pattern_analysis/trade handlers
            // reference it. Mount every normal panel before Socket.connect() so
            // first-frame WebSocket data cannot race panel DOM bridges or handlers.
            // Socket has special boot (bindGlobalHandlers + connect), not init().
            // Theme is init'd separately by unified-dashboard.html's window.onload.
            if (this.get('Chart')) initRegisteredModule('Chart', this.get('Chart'), true);

            Object.keys(state.activeModules).forEach(name => {
                initRegisteredModule(name, this.get(name));
            });

            if (this.get('Socket')) {
                this.bindGlobalHandlers();
                this.get('Socket').connect();
            }

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
                const priceCandidate = data.price != null ? data.price : data.close;
                const p = parseFloat(priceCandidate);
                if (!isFinite(p) || p <= 0) return;
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
                    if (isNumericValue(data.confidence)) {
                        set('confidenceML', Number(data.confidence).toFixed(0) + '%');
                    }
                }

                // Session Performance is owned by TradeLog (panels/trade-log.js) —
                // updated on every closed trade via TradeLog.addEntry, ticked by the
                // session timer. The previous per-tick `data.stats.*` writer was
                // clobbering session counters with state.json cumulative numbers,
                // breaking the "session-scope everywhere" guarantee. Removed.

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
                // carries decision.confidence; price frames only update this
                // field when they actually include confidence.
                const conf = (d && d.confidence != null) ? d.confidence
                          : (d && d.data && d.data.confidence != null) ? d.data.confidence
                          : null;
                if (isNumericValue(conf)) {
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

                // tradesExecuted / totalPnl updates removed — TradeLog.addEntry
                // already updates these via renderSessionPerformance(). Doubling
                // up here was double-counting the trade and reading the prior
                // value back from textContent (broken if first event).
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
                if (this.get('Chart')) this.get('Chart').loadHistorical(d);
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
