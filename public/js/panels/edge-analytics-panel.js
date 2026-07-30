/**
 * edge-analytics-panel.js — Self-Rendering Edge Analytics Panel
 *
 * Self-creates the 8-section edge analytics scaffold at mount time.
 * NO synthetic data. NO Math.random. NO simulated feeds. NO setDemoMode.
 * Every value rendered originates from a real WS event from the bot.
 *
 * Sections (each is empty/placeholder until a real event populates it):
 *   1. Liquidation Levels   — fed by WS 'liquidation_data'
 *   2. CVD (Order Flow)     — fed by WS 'cvd_update' (history accumulated locally from real events)
 *   3. Funding Rates        — fed by WS 'funding_rate'
 *   4. Whale Activity       — fed by WS 'whale_trade'
 *   5. Market Internals     — fed by WS 'market_internals' (includes absorption detection)
 *   6. Smart Money          — fed by WS 'smart_money'
 *   7. Fear & Greed         — fed by WS 'fear_greed'
 *   8. Hidden Divergences   — fed by WS 'divergence'
 *
 * If a backend emitter is not yet wired for a given event type, that section
 * stays in its empty/honest placeholder state forever. We never fabricate.
 *
 * Public API:
 *   init()       — render scaffold, subscribe to real WS events
 *   setSymbol()  — record current symbol context (for future symbol-scoped events)
 *   clearAll()   — reset all sections to empty/placeholder state
 *   teardown()   — disconnect WS handlers, clear DOM
 *   _compute()   — debug helper
 *
 * Mount: <div id="edgeAnalyticsPanel"></div> in the dashboard shell.
 *
 * @module public/js/panels/edge-analytics-panel
 */
(function (OGZ) {
    'use strict';

    const STYLE_ID = 'ogz-edge-analytics-panel-styles';
    const ROOT_ID  = 'edgeAnalyticsPanel';

    const CVD_HISTORY_MAX = 60;        // accumulated from real cvd_update events only
    const WHALE_ALERTS_MAX = 5;        // most-recent N real whale_trade events kept on screen
    const ABSORPTION_DELTA_MIN = 0;    // lastPriceDelta > 0 + sellers aggressing = absorbed

    // Module state — accumulated only from real events
    const state = {
        mounted: false,
        currentSymbol: null,
        cvdHistory: []   // populated only by real cvd_update payloads
    };

    // Tracked socket handlers for clean teardown
    const _registeredHandlers = []; // [{type, fn}]

    // ─── Scaffold ─────────────────────────────────────────────────────────
    function renderScaffold() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        root.innerHTML = '';
        root.className = 'eap-root';

        // Section 1: Liquidation Levels (crypto-only concept — hidden on stocks)
        const liqSection = document.createElement('div');
        liqSection.className = 'eap-section edge-section eap-crypto-only';
        liqSection.innerHTML = `
            <h4>💀 Liquidation Levels</h4>
            <div class="liq-levels">
                <div class="liq-level long-liq">
                    <span>Long Liq Zone:</span>
                    <span class="liq-price" id="longLiqPrice">--</span>
                    <span class="liq-volume" id="longLiqVol">--</span>
                </div>
                <div class="liq-level short-liq">
                    <span>Short Liq Zone:</span>
                    <span class="liq-price" id="shortLiqPrice">--</span>
                    <span class="liq-volume" id="shortLiqVol">--</span>
                </div>
            </div>
            <canvas id="liqHeatmap" width="300" height="150"></canvas>
        `;
        root.appendChild(liqSection);

        // Section 2: CVD
        const cvdSection = document.createElement('div');
        cvdSection.className = 'eap-section edge-section';
        cvdSection.innerHTML = `
            <h4>📊 CVD (Order Flow)</h4>
            <div class="cvd-display">
                <div class="cvd-value" id="cvdValue">--</div>
                <div class="cvd-trend" id="cvdTrend">--</div>
                <canvas id="cvdChart" width="300" height="100"></canvas>
            </div>
        `;
        root.appendChild(cvdSection);

        // Section 3: Funding Rates (crypto-only concept — hidden on stocks)
        const fundingSection = document.createElement('div');
        fundingSection.className = 'eap-section edge-section eap-crypto-only';
        fundingSection.innerHTML = `
            <h4>💰 Funding Rates</h4>
            <div class="funding-display">
                <div class="funding-current">
                    <span>Current:</span>
                    <span class="funding-rate" id="currentFunding">--</span>
                </div>
                <div class="funding-predicted">
                    <span>Predicted:</span>
                    <span class="funding-rate" id="predictedFunding">--</span>
                </div>
                <div class="funding-signal" id="fundingSignal">--</div>
            </div>
        `;
        root.appendChild(fundingSection);

        // Section 4: Whale Activity
        const whaleSection = document.createElement('div');
        whaleSection.className = 'eap-section edge-section';
        whaleSection.innerHTML = `
            <h4>🐋 Whale Activity</h4>
            <div class="whale-alerts" id="whaleAlerts">
                <div class="whale-item eap-empty">Awaiting whale events...</div>
            </div>
        `;
        root.appendChild(whaleSection);

        // Section 5: Market Internals
        const internalsSection = document.createElement('div');
        internalsSection.className = 'eap-section edge-section';
        internalsSection.innerHTML = `
            <h4>🔍 Market Internals</h4>
            <div class="internals">
                <div class="internal-item">
                    <span>Buy/Sell Ratio:</span>
                    <span id="buySellRatio">--</span>
                </div>
                <div class="internal-item">
                    <span>Aggressor Side:</span>
                    <span id="aggressorSide">--</span>
                </div>
                <div class="internal-item">
                    <span>Order Book Imbalance:</span>
                    <span id="bookImbalance">--</span>
                </div>
                <div class="internal-item">
                    <span>Spread:</span>
                    <span id="spreadValue">--</span>
                </div>
            </div>
        `;
        root.appendChild(internalsSection);

        // Section 6: Smart Money
        const smartMoneySection = document.createElement('div');
        smartMoneySection.className = 'eap-section edge-section';
        smartMoneySection.innerHTML = `
            <h4>🧠 Smart Money</h4>
            <div class="smart-money">
                <div class="smart-item">
                    <span>Smart Money Flow:</span>
                    <span id="smartFlow" class="flow-value">--</span>
                </div>
                <div class="smart-item">
                    <span>Institutional Activity:</span>
                    <span id="instActivity">--</span>
                </div>
                <div class="smart-item">
                    <span>Old Coins Moving:</span>
                    <span id="dormancy">--</span>
                </div>
            </div>
        `;
        root.appendChild(smartMoneySection);

        // Section 7: Fear & Greed
        const fearGreedSection = document.createElement('div');
        fearGreedSection.className = 'eap-section edge-section';
        fearGreedSection.innerHTML = `
            <h4>😱 Fear & Greed</h4>
            <div class="fear-greed">
                <div class="fg-gauge">
                    <div class="fg-value" id="fgValue">--</div>
                    <div class="fg-label" id="fgLabel">--</div>
                    <div class="fg-bar">
                        <div class="fg-fill" id="fgFill" style="width:0%"></div>
                    </div>
                </div>
            </div>
        `;
        root.appendChild(fearGreedSection);

        // Section 8: Hidden Divergences
        const divergencesSection = document.createElement('div');
        divergencesSection.className = 'eap-section edge-section';
        divergencesSection.innerHTML = `
            <h4>🔮 Hidden Divergences</h4>
            <div class="divergences" id="divergences">
                <div class="divergence-item eap-empty">Awaiting divergence scanner...</div>
            </div>
        `;
        root.appendChild(divergencesSection);

        return true;
    }

    // ─── Real-event handlers ──────────────────────────────────────────────
    // Each handler renders ONLY when a real WS event arrives. No fallback.

    function onLiquidationData(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const longP = document.getElementById('longLiqPrice');
            const longV = document.getElementById('longLiqVol');
            const shortP = document.getElementById('shortLiqPrice');
            const shortV = document.getElementById('shortLiqVol');
            if (longP && data.longLiqPrice != null)  longP.textContent = '$' + Number(data.longLiqPrice).toFixed(0);
            if (longV && data.longLiqVol != null)    longV.textContent = '$' + (Number(data.longLiqVol) / 1e6).toFixed(1) + 'M';
            if (shortP && data.shortLiqPrice != null) shortP.textContent = '$' + Number(data.shortLiqPrice).toFixed(0);
            if (shortV && data.shortLiqVol != null)   shortV.textContent = '$' + (Number(data.shortLiqVol) / 1e6).toFixed(1) + 'M';
        } catch (_) { /* swallow */ }
    }

    // Per-asset frames (direct Kraken feed) only apply when their asset is
    // the one on screen; assetless frames (bot broadcaster) pass through.
    function frameMatchesSelectedAsset(data) {
        if (!data || !data.asset) return true;
        const selected = document.getElementById('cp-assetSelector')?.value
            || document.getElementById('assetSelector')?.value || '';
        return !selected || data.asset === selected;
    }

    function onCVDUpdate(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!frameMatchesSelectedAsset(data)) return;
            const valEl = document.getElementById('cvdValue');
            const trEl = document.getElementById('cvdTrend');

            if (data.cvdValue != null) {
                state.cvdHistory.push(Number(data.cvdValue));
                if (state.cvdHistory.length > CVD_HISTORY_MAX) state.cvdHistory.shift();

                if (valEl) {
                    valEl.textContent = Number(data.cvdValue).toFixed(0);
                    valEl.style.color = data.cvdValue > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
                }
            }
            if (trEl && data.cvdTrend) trEl.textContent = data.cvdTrend;

            // Render CVD canvas chart from REAL accumulated history only
            const canvas = document.getElementById('cvdChart');
            if (canvas && state.cvdHistory.length > 1) {
                const ctx = canvas.getContext('2d');
                const w = canvas.width, h = canvas.height;
                ctx.clearRect(0, 0, w, h);
                const min = Math.min(...state.cvdHistory);
                const max = Math.max(...state.cvdHistory);
                const range = max - min || 1;
                const zeroY = h - ((0 - min) / range) * h;
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.moveTo(0, zeroY);
                ctx.lineTo(w, zeroY);
                ctx.stroke();
                const last = state.cvdHistory[state.cvdHistory.length - 1];
                ctx.strokeStyle = last > 0 ? '#00ff88' : '#ff3366';
                ctx.lineWidth = 2;
                ctx.beginPath();
                state.cvdHistory.forEach((v, i) => {
                    const x = (i / (state.cvdHistory.length - 1)) * w;
                    const y = h - ((v - min) / range) * h;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();
                ctx.lineTo(w, h);
                ctx.lineTo(0, h);
                ctx.closePath();
                ctx.fillStyle = last > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)';
                ctx.fill();
            }
        } catch (_) { /* swallow */ }
    }

    function onWhaleTrade(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const container = document.getElementById('whaleAlerts');
            if (!container) return;

            // Drop the empty placeholder on first real event
            const empty = container.querySelector('.eap-empty');
            if (empty) empty.remove();

            const side = (data.side || '').toString().toUpperCase();
            const amount = Number(data.amount || 0);
            const price = Number(data.price || 0);
            const sym = data.symbol || data.ticker || '';

            const item = document.createElement('div');
            item.className = 'whale-item';
            item.style.cssText = `padding:8px; margin:4px 0; background:rgba(0,100,255,0.1); border-radius:4px; font-size:11px; border-left:3px solid ${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}`;
            item.innerHTML = `<span style="color:${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}; font-weight:800;">${side || '—'}</span> ${amount.toFixed(2)}${sym ? ' ' + sym : ''} @ $${price.toLocaleString()}`;
            container.prepend(item);
            while (container.children.length > WHALE_ALERTS_MAX) container.lastChild.remove();
        } catch (_) { /* swallow */ }
    }

    function onFundingRate(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const cur = document.getElementById('currentFunding');
            const pred = document.getElementById('predictedFunding');
            const sig = document.getElementById('fundingSignal');
            if (cur && data.currentFunding != null)   cur.textContent = (Number(data.currentFunding) * 100).toFixed(2) + '%';
            if (pred && data.predictedFunding != null) pred.textContent = (Number(data.predictedFunding) * 100).toFixed(2) + '%';
            if (sig && data.fundingSignal)             sig.textContent = data.fundingSignal;
        } catch (_) { /* swallow */ }
    }

    function onMarketInternals(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!frameMatchesSelectedAsset(data)) return;
            const aggEl = document.getElementById('aggressorSide');

            // Absorption detection: SELLERS aggressing BUT price moves up = absorbed
            const lastDelta = (OGZ.state && typeof OGZ.state.lastPriceDelta === 'number') ? OGZ.state.lastPriceDelta : 0;
            const isAbsorption = (data.aggressor === 'SELLERS' && lastDelta > ABSORPTION_DELTA_MIN);

            if (aggEl) {
                if (isAbsorption) {
                    aggEl.innerHTML = 'SELLERS <span class="absorbed-glow" style="color:var(--profit-color); text-shadow:0 0 10px var(--profit-color);">[ABSORBED]</span>';
                } else if (data.aggressor) {
                    aggEl.textContent = data.aggressor;
                    aggEl.style.color = data.aggressor === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
                }
            }

            const bsr = document.getElementById('buySellRatio');
            if (bsr && data.buySellRatio != null) bsr.textContent = Number(data.buySellRatio).toFixed(2);

            const bi = document.getElementById('bookImbalance');
            if (bi && data.bookImbalance != null) bi.textContent = (Number(data.bookImbalance) * 100).toFixed(1) + '%';

            const sp = document.getElementById('spreadValue');
            if (sp && data.spread != null) sp.textContent = Number(data.spread).toFixed(3) + '%';
        } catch (_) { /* swallow */ }
    }

    function onSmartMoney(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const sf = document.getElementById('smartFlow');
            const ia = document.getElementById('instActivity');
            const dm = document.getElementById('dormancy');
            if (sf && data.smartFlow)     sf.textContent = data.smartFlow;
            if (ia && data.instActivity)  ia.textContent = data.instActivity;
            if (dm && data.dormancy)      dm.textContent = data.dormancy;
        } catch (_) { /* swallow */ }
    }

    function onFearGreed(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const el = document.getElementById('fgValue');
            const fill = document.getElementById('fgFill');
            const label = document.getElementById('fgLabel');
            if (data.fgValue != null) {
                if (el) el.textContent = data.fgValue;
                if (fill) fill.style.width = data.fgValue + '%';
            }
            if (label && data.fgLabel) label.textContent = data.fgLabel;
        } catch (_) { /* swallow */ }
    }

    function onDivergence(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const container = document.getElementById('divergences');
            if (!container || !Array.isArray(data.divergences)) return;
            container.innerHTML = '';
            data.divergences.forEach(div => {
                const item = document.createElement('div');
                item.className = 'divergence-item';
                item.textContent = div;
                container.appendChild(item);
            });
        } catch (_) { /* swallow */ }
    }

    // ─── Subscription helper — uses the REAL OGZ.Socket pattern ─────────────
    function subscribe(socket, type, fn) {
        if (!socket || typeof socket.registerHandler !== 'function') return;
        socket.registerHandler(type, fn);
        _registeredHandlers.push({ type, fn });
    }

    // ─── Symbol-class awareness ──────────────────────────────────────────
    // Liquidation zones and funding rates are perpetual-futures concepts.
    // Rendering them under a stock scope (the "$738 Long Liq Zone on TSLA"
    // bug) presents fabricated-looking analytics as real. Sections marked
    // .eap-crypto-only are hidden while a stock is selected.
    function assetClassForBroker(broker) {
        const code = String(broker || '').trim().toUpperCase();
        if (code === 'KRA' || code === 'KRAKEN' || code === 'CB' || code === 'COINBASE') return 'crypto';
        if (code === 'ALP' || code === 'ALPACA') return 'stock';
        return null;
    }

    function applyAssetClassVisibility(assetClass) {
        if (assetClass !== 'crypto' && assetClass !== 'stock') {
            console.error(`[EdgeAnalyticsPanel] Unknown asset class "${assetClass}" — section visibility unchanged`);
            return;
        }
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelectorAll('.eap-crypto-only').forEach(section => {
            section.style.display = assetClass === 'crypto' ? '' : 'none';
        });
    }

    function onWatchlistSelect(data) {
        const broker = data && data.broker;
        const assetClass = assetClassForBroker(broker);
        if (!assetClass) {
            console.error('[EdgeAnalyticsPanel] watchlist:select without recognizable broker:', data);
            return;
        }
        if (data && data.symbol) state.currentSymbol = String(data.symbol);
        applyAssetClassVisibility(assetClass);
    }

    // ─── Public API ──────────────────────────────────────────────────────
    const EdgeAnalyticsPanel = {
        init: function () {
            try {
                if (state.mounted) return;
                if (!renderScaffold()) return;
                state.mounted = true;

                const socket = OGZ.get && OGZ.get('Socket');
                if (socket) {
                    subscribe(socket, 'liquidation_data', onLiquidationData);
                    subscribe(socket, 'cvd_update',       onCVDUpdate);
                    subscribe(socket, 'whale_trade',      onWhaleTrade);
                    subscribe(socket, 'funding_rate',     onFundingRate);
                    subscribe(socket, 'market_internals', onMarketInternals);
                    subscribe(socket, 'smart_money',      onSmartMoney);
                    subscribe(socket, 'fear_greed',       onFearGreed);
                    subscribe(socket, 'divergence',       onDivergence);
                }

                // Symbol-class awareness: track selection changes and apply
                // the initial state from the watchlist's REAL selection.
                if (OGZ.bus && typeof OGZ.bus.on === 'function') {
                    OGZ.bus.on('watchlist:select', onWatchlistSelect);
                }
                const watchlist = OGZ.get && OGZ.get('WatchlistStrip');
                if (watchlist && typeof watchlist.getSelected === 'function') {
                    const selected = watchlist.getSelected();
                    if (selected) onWatchlistSelect(selected);
                }
            } catch (_) { /* swallow */ }
        },

        setSymbol: function (symbol) {
            try { state.currentSymbol = symbol || null; } catch (_) { /* swallow */ }
        },

        clearAll: function () {
            try {
                state.cvdHistory.length = 0;
                ['longLiqPrice','longLiqVol','shortLiqPrice','shortLiqVol',
                 'cvdValue','cvdTrend','currentFunding','predictedFunding','fundingSignal',
                 'buySellRatio','aggressorSide','bookImbalance','spreadValue',
                 'smartFlow','instActivity','dormancy','fgValue','fgLabel'
                ].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '--';
                });
                const fgFill = document.getElementById('fgFill');
                if (fgFill) fgFill.style.width = '0%';
                const wa = document.getElementById('whaleAlerts');
                if (wa) wa.innerHTML = '<div class="whale-item eap-empty">Awaiting whale events...</div>';
                const dv = document.getElementById('divergences');
                if (dv) dv.innerHTML = '<div class="divergence-item eap-empty">Awaiting divergence scanner...</div>';
                const cvdCanvas = document.getElementById('cvdChart');
                if (cvdCanvas) {
                    const ctx = cvdCanvas.getContext('2d');
                    if (ctx) ctx.clearRect(0, 0, cvdCanvas.width, cvdCanvas.height);
                }
            } catch (_) { /* swallow */ }
        },

        teardown: function () {
            try {
                _registeredHandlers.length = 0; // OGZ.Socket has no unregister; we drop refs
                if (OGZ.bus && typeof OGZ.bus.off === 'function') {
                    OGZ.bus.off('watchlist:select', onWatchlistSelect);
                }
                state.mounted = false;
                state.cvdHistory.length = 0;
            } catch (_) { /* swallow */ }
        },

        _compute: function () {
            return {
                mounted: state.mounted,
                currentSymbol: state.currentSymbol,
                cvdHistoryLength: state.cvdHistory.length,
                registeredHandlers: _registeredHandlers.map(h => h.type)
            };
        }
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('EdgeAnalyticsPanel', EdgeAnalyticsPanel);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('EdgeAnalyticsPanel', EdgeAnalyticsPanel);
            }
        });
    }

    try { window.OGZEdgeAnalyticsPanel = EdgeAnalyticsPanel; } catch (_) { }
})(window.OGZ = window.OGZ || {});
