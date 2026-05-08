/**
 * edge-analytics-panel.js — Self-Rendering Edge Analytics Module (Phase 5 Refactor)
 *
 * Refactored from public/js/panels/edge-analytics.js. Converts the legacy DOM-binder
 * into a fully self-contained, modular panel that creates its own HTML scaffold at mount
 * time. The v2 shell no longer needs ~115 lines of inline edge-analytics HTML.
 *
 * EXTRACTION SOURCE:
 *   Refactored from public/js/panels/edge-analytics.js lines 1-290. All functionality
 *   preserved: 8 sections (Liquidation Levels, CVD, Funding Rates, Whale Activity,
 *   Market Internals, Smart Money, Fear & Greed, Hidden Divergences).
 *   - All child element IDs preserved (longLiqPrice, cvdValue, fgFill, etc.)
 *   - All simulated data generators preserved
 *   - WS subscription bindings preserved (liquidation_data, cvd_update, whale_trade, etc.)
 *   - Absorption detection (updateMarketInternals) preserved
 *
 * Core Responsibility:
 *   - Self-injects the entire 8-section scaffold (headers + content containers + canvas elements)
 *   - Binds all simulated data generators and WS event handlers to the self-created child IDs
 *   - Manages state of all 8 sections: values, trends, canvas renders
 *   - Handles dormant/parked features: Wall Radar (awaits depth_update), Spoof Detection
 *   - Preserves canvas elements (liqHeatmap, cvdChart) for library rendering
 *
 * Public API:
 *   - init() — render scaffold, start simulated feeds, wire WS handlers
 *   - setSymbol(symbol) — prepare for symbol-scoped events (currently fires symbol changes)
 *   - clearAll() — reset all section values to defaults
 *   - teardown() — stop timers, remove listeners
 *   - _compute() — debug helper returning internal state
 *
 * Mount Contract:
 *   Expects <div id="edgeAnalyticsPanel"></div> to exist in the page DOM.
 *   At init(), the module creates all child elements inside edgeAnalyticsPanel:
 *     - 8 section divs (class="eap-section edge-section")
 *     - All legacy child IDs (longLiqPrice, cvdValue, whaleAlerts, etc.)
 *     - Canvas elements (liqHeatmap, cvdChart)
 *
 * WS Subscriptions (all optional; graceful degrade if backend absent):
 *   - 'liquidation_data' — overrides simulated long/short liq levels
 *   - 'cvd_update' — overrides simulated CVD value/trend
 *   - 'whale_trade' — live whale alerts (appended to whaleAlerts)
 *   - 'funding_rate' — overrides simulated funding rates
 *   - 'market_internals' — overrides simulated buySellRatio, bookImbalance, aggressor (includes absorption detection)
 *   - 'smart_money' — overrides simulated smart flow, inst activity, dormancy
 *   - 'fear_greed' — overrides simulated fear & greed value/label
 *   - 'divergence' — overrides simulated divergence items
 *
 * Self-registers as OGZ.EdgeAnalyticsPanel via OGZ.register('EdgeAnalyticsPanel', ...).
 * LEGACY COMPAT: Coexists with public/js/panels/edge-analytics.js (registered as 'Edge').
 *   New module mounts to <div id="edgeAnalyticsPanel"></div>.
 *   Legacy module (if present) mounts to <div id="edgePanel"></div>.
 *   During transition, either can be active. Final state: only EdgeAnalyticsPanel.
 *
 * @module public/js/panels/edge-analytics-panel
 */
(function (OGZ) {
    'use strict';

    // ─── JSDoc Typedefs ───────────────────────────────────────────────────
    /**
     * @typedef {Object} LiquidationData
     * @property {number} longLiqPrice
     * @property {number} longLiqVol
     * @property {number} shortLiqPrice
     * @property {number} shortLiqVol
     */

    /**
     * @typedef {Object} CVDData
     * @property {number} cvdValue
     * @property {string} cvdTrend
     */

    /**
     * @typedef {Object} WhaleAlert
     * @property {number} amount
     * @property {string} side
     * @property {number} price
     * @property {number} timestamp
     */

    /**
     * @typedef {Object} FundingRate
     * @property {number} currentFunding
     * @property {number} predictedFunding
     * @property {string} fundingSignal
     */

    /**
     * @typedef {Object} MarketInternalsData
     * @property {string} aggressor
     * @property {number} buySellRatio
     * @property {number} bookImbalance
     */

    /**
     * @typedef {Object} SmartMoneyData
     * @property {string} smartFlow
     * @property {string} instActivity
     * @property {string} dormancy
     */

    /**
     * @typedef {Object} FearGreedData
     * @property {number} fgValue
     * @property {string} fgLabel
     */

    /**
     * @typedef {Object} DivergenceData
     * @property {string[]} divergences
     */

    // ─── Constants ─────────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-edge-analytics-panel-styles';
    const ROOT_ID = 'edgeAnalyticsPanel';

    // Simulated feed timers (in ms)
    const WHALE_ALERT_INTERVAL = 8000;
    const CVD_UPDATE_INTERVAL = 5000;
    const FEAR_GREED_INTERVAL = 30000;
    const MARKET_INTERNALS_INTERVAL = 5000;
    const SMART_MONEY_INTERVAL = 30000;
    const DIVERGENCE_INTERVAL = 15000;
    const LIQUIDATION_INTERVAL = 60000;

    // CVD simulation state
    let cvdState = {
        value: 0,
        history: []
    };

    // Tracked timers for cleanup
    const _trackedTimers = new Set();
    const _trackedListeners = [];

    // ─── Module State ─────────────────────────────────────────────────────
    const state = {
        mounted: false,
        currentSymbol: 'TSLA',
        sectionState: {
            liquidation: { longLiqPrice: null, longLiqVol: '$0', shortLiqPrice: null, shortLiqVol: '$0' },
            cvd: { cvdValue: 0, cvdTrend: 'NEUTRAL', history: [] },
            funding: { currentFunding: '0.01%', predictedFunding: '0.01%', fundingSignal: 'NEUTRAL' },
            whale: { alerts: [] },
            internals: { buySellRatio: '1.0', aggressorSide: 'NEUTRAL', bookImbalance: '0%', spreadValue: '0.01%' },
            smartMoney: { smartFlow: 'ACCUMULATING', instActivity: 'HIGH', dormancy: 'LOW' },
            fearGreed: { fgValue: 50, fgLabel: 'NEUTRAL' },
            divergences: []
        }
    };

    // ─── Helpers ───────────────────────────────────────────────────────────
    function trackTimer(id) {
        _trackedTimers.add(id);
        return id;
    }

    function trackListener(target, type, handler) {
        for (let i = 0; i < _trackedListeners.length; i++) {
            const e = _trackedListeners[i];
            if (e.target === target && e.type === type && e.handler === handler) return;
        }
        target.addEventListener(type, handler);
        _trackedListeners.push({ target, type, handler });
    }

    // ─── Scaffold Renderer ─────────────────────────────────────────────────
    /**
     * Create and inject the 8-section HTML scaffold into the root element.
     * Each section includes headers and content containers; all legacy child IDs
     * are created inside so legacy code paths (and new listeners) find them.
     */
    function renderScaffold() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        root.innerHTML = '';
        root.className = 'eap-root';

        // Section 1: Liquidation Levels
        const liqSection = document.createElement('div');
        liqSection.className = 'eap-section edge-section';
        liqSection.innerHTML = `
            <h4>💀 Liquidation Levels</h4>
            <div class="liq-levels">
                <div class="liq-level long-liq">
                    <span>Long Liq Zone:</span>
                    <span class="liq-price" id="longLiqPrice">--</span>
                    <span class="liq-volume" id="longLiqVol">$0</span>
                </div>
                <div class="liq-level short-liq">
                    <span>Short Liq Zone:</span>
                    <span class="liq-price" id="shortLiqPrice">--</span>
                    <span class="liq-volume" id="shortLiqVol">$0</span>
                </div>
            </div>
            <canvas id="liqHeatmap" width="300" height="150"></canvas>
        `;
        root.appendChild(liqSection);

        // Section 2: CVD (Order Flow)
        const cvdSection = document.createElement('div');
        cvdSection.className = 'eap-section edge-section';
        cvdSection.innerHTML = `
            <h4>📊 CVD (Order Flow)</h4>
            <div class="cvd-display">
                <div class="cvd-value" id="cvdValue">0</div>
                <div class="cvd-trend" id="cvdTrend">NEUTRAL</div>
                <canvas id="cvdChart" width="300" height="100"></canvas>
            </div>
        `;
        root.appendChild(cvdSection);

        // Section 3: Funding Rates
        const fundingSection = document.createElement('div');
        fundingSection.className = 'eap-section edge-section';
        fundingSection.innerHTML = `
            <h4>💰 Funding Rates</h4>
            <div class="funding-display">
                <div class="funding-current">
                    <span>Current:</span>
                    <span class="funding-rate" id="currentFunding">0.01%</span>
                </div>
                <div class="funding-predicted">
                    <span>Predicted:</span>
                    <span class="funding-rate" id="predictedFunding">0.01%</span>
                </div>
                <div class="funding-signal" id="fundingSignal">NEUTRAL</div>
            </div>
        `;
        root.appendChild(fundingSection);

        // Section 4: Whale Activity
        const whaleSection = document.createElement('div');
        whaleSection.className = 'eap-section edge-section';
        whaleSection.innerHTML = `
            <h4>🐋 Whale Activity</h4>
            <div class="whale-alerts" id="whaleAlerts">
                <div class="whale-item">Waiting for whales...</div>
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
                    <span id="buySellRatio">1.0</span>
                </div>
                <div class="internal-item">
                    <span>Aggressor Side:</span>
                    <span id="aggressorSide">NEUTRAL</span>
                </div>
                <div class="internal-item">
                    <span>Order Book Imbalance:</span>
                    <span id="bookImbalance">0%</span>
                </div>
                <div class="internal-item">
                    <span>Spread:</span>
                    <span id="spreadValue">0.01%</span>
                </div>
            </div>
        `;
        root.appendChild(internalsSection);

        // Section 6: Smart Money Tracking
        const smartMoneySection = document.createElement('div');
        smartMoneySection.className = 'eap-section edge-section';
        smartMoneySection.innerHTML = `
            <h4>🧠 Smart Money</h4>
            <div class="smart-money">
                <div class="smart-item">
                    <span>Smart Money Flow:</span>
                    <span id="smartFlow" class="flow-value">ACCUMULATING</span>
                </div>
                <div class="smart-item">
                    <span>Institutional Activity:</span>
                    <span id="instActivity">HIGH</span>
                </div>
                <div class="smart-item">
                    <span>Old Coins Moving:</span>
                    <span id="dormancy">LOW</span>
                </div>
            </div>
        `;
        root.appendChild(smartMoneySection);

        // Section 7: Fear & Greed Index
        const fearGreedSection = document.createElement('div');
        fearGreedSection.className = 'eap-section edge-section';
        fearGreedSection.innerHTML = `
            <h4>😱 Fear & Greed</h4>
            <div class="fear-greed">
                <div class="fg-gauge">
                    <div class="fg-value" id="fgValue">50</div>
                    <div class="fg-label" id="fgLabel">NEUTRAL</div>
                    <div class="fg-bar">
                        <div class="fg-fill" id="fgFill" style="width: 50%"></div>
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
                <div class="divergence-item">Scanning...</div>
            </div>
        `;
        root.appendChild(divergencesSection);

        return true;
    }

    // ─── Simulated Feed Generators ─────────────────────────────────────────
    /**
     * Start all simulated data feeds (whale alerts, CVD, fear/greed, etc.)
     * These populate the panel until real backend data arrives.
     */
    function startSimulatedFeeds() {
        const lastPrice = () => OGZ.state?.lastPrice || 73000;

        // Whale alert monitor
        const whaleTimer = setInterval(() => {
            if (Math.random() > 0.8) {
                const container = document.getElementById('whaleAlerts');
                if (!container) return;
                const amount = (Math.random() * 10 + 1).toFixed(2);
                const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
                const price = (lastPrice() * (1 + (Math.random() - 0.5) * 0.002)).toFixed(2);
                const item = document.createElement('div');
                item.className = 'whale-item';
                item.style.cssText = `padding:8px; margin:4px 0; background:rgba(0,100,255,0.1); border-radius:4px; font-size:11px; border-left:3px solid ${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}`;
                item.innerHTML = `<span style="color:${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}; font-weight:800;">${side}</span> ${amount} BTC @ $${parseFloat(price).toLocaleString()}`;
                container.prepend(item);
                if (container.children.length > 5) container.lastChild.remove();
            }
        }, WHALE_ALERT_INTERVAL);
        trackTimer(whaleTimer);

        // CVD simulation with chart
        const cvdTimer = setInterval(() => {
            cvdState.value += (Math.random() - 0.48) * 50;
            cvdState.history.push(cvdState.value);
            if (cvdState.history.length > 60) cvdState.history.shift();

            const el = document.getElementById('cvdValue');
            const trend = document.getElementById('cvdTrend');
            if (el) {
                el.textContent = cvdState.value.toFixed(0);
                el.style.color = cvdState.value > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
            }
            if (trend) trend.textContent = cvdState.value > 50 ? 'BULLISH' : cvdState.value < -50 ? 'BEARISH' : 'NEUTRAL';

            // Draw CVD chart on canvas
            const canvas = document.getElementById('cvdChart');
            if (canvas && cvdState.history.length > 2) {
                const ctx = canvas.getContext('2d');
                const w = canvas.width, h = canvas.height;
                ctx.clearRect(0, 0, w, h);

                const min = Math.min(...cvdState.history);
                const max = Math.max(...cvdState.history);
                const range = max - min || 1;

                // Zero line
                const zeroY = h - ((0 - min) / range) * h;
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.moveTo(0, zeroY);
                ctx.lineTo(w, zeroY);
                ctx.stroke();

                // CVD line
                ctx.strokeStyle = cvdState.value > 0 ? '#00ff88' : '#ff3366';
                ctx.lineWidth = 2;
                ctx.beginPath();
                cvdState.history.forEach((v, i) => {
                    const x = (i / (cvdState.history.length - 1)) * w;
                    const y = h - ((v - min) / range) * h;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();

                // Fill under the line
                ctx.lineTo(w, h);
                ctx.lineTo(0, h);
                ctx.closePath();
                ctx.fillStyle = cvdState.value > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)';
                ctx.fill();
            }
        }, CVD_UPDATE_INTERVAL);
        trackTimer(cvdTimer);

        // Fear & Greed simulation
        const fgTimer = setInterval(() => {
            const value = Math.round(30 + Math.random() * 40);
            const el = document.getElementById('fgValue');
            const fill = document.getElementById('fgFill');
            const label = document.getElementById('fgLabel');
            if (el) el.textContent = value;
            if (fill) fill.style.width = value + '%';
            if (label) {
                label.textContent = value < 25 ? 'EXTREME FEAR' : value < 40 ? 'FEAR' : value < 60 ? 'NEUTRAL' : value < 75 ? 'GREED' : 'EXTREME GREED';
            }
        }, FEAR_GREED_INTERVAL);
        trackTimer(fgTimer);

        // Market internals simulation
        const miTimer = setInterval(() => {
            const bsr = document.getElementById('buySellRatio');
            const bi = document.getElementById('bookImbalance');
            const spread = document.getElementById('spreadValue');
            const agg = document.getElementById('aggressorSide');
            if (bsr) bsr.textContent = (0.8 + Math.random() * 0.4).toFixed(2);
            if (bi) bi.textContent = (Math.random() * 20 - 10).toFixed(1) + '%';
            if (spread) spread.textContent = (Math.random() * 0.1).toFixed(3) + '%';
            if (agg) {
                const side = Math.random() > 0.5 ? 'BUYERS' : 'SELLERS';
                agg.textContent = side;
                agg.style.color = side === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
            }
        }, MARKET_INTERNALS_INTERVAL);
        trackTimer(miTimer);

        // Smart money flow simulation
        const smTimer = setInterval(() => {
            const flows = ['ACCUMULATING', 'DISTRIBUTING', 'NEUTRAL', 'STRONG INFLOW'];
            const activity = ['HIGH', 'MEDIUM', 'LOW'];
            const dormancy = ['LOW', 'MEDIUM', 'HIGH'];
            const sf = document.getElementById('smartFlow');
            const ia = document.getElementById('instActivity');
            const dm = document.getElementById('dormancy');
            if (sf) sf.textContent = flows[Math.floor(Math.random() * flows.length)];
            if (ia) ia.textContent = activity[Math.floor(Math.random() * activity.length)];
            if (dm) dm.textContent = dormancy[Math.floor(Math.random() * dormancy.length)];
        }, SMART_MONEY_INTERVAL);
        trackTimer(smTimer);

        // Divergence scanner simulation
        const divTimer = setInterval(() => {
            const container = document.getElementById('divergences');
            if (!container) return;
            const divs = ['RSI Bullish Divergence on 4H', 'MACD Hidden Bearish on 1H', 'Volume Divergence on Daily', 'OBV Divergence Forming'];
            const selected = divs[Math.floor(Math.random() * divs.length)];
            container.innerHTML = '';
            const div = document.createElement('div');
            div.className = 'divergence-item';
            div.textContent = selected;
            container.appendChild(div);
        }, DIVERGENCE_INTERVAL);
        trackTimer(divTimer);

        // Liquidation level calculation
        const liqTimer = setInterval(() => {
            const p = lastPrice();
            if (!p) return;
            const longLiq = document.getElementById('longLiqPrice');
            const shortLiq = document.getElementById('shortLiqPrice');
            if (longLiq) longLiq.textContent = '$' + (p * 0.95).toFixed(0);
            if (shortLiq) shortLiq.textContent = '$' + (p * 1.05).toFixed(0);
        }, LIQUIDATION_INTERVAL);
        trackTimer(liqTimer);
    }

    // ─── WS Event Handlers ─────────────────────────────────────────────────
    function handleLiquidationData(data) {
        try {
            const longLiqPrice = document.getElementById('longLiqPrice');
            const longLiqVol = document.getElementById('longLiqVol');
            const shortLiqPrice = document.getElementById('shortLiqPrice');
            const shortLiqVol = document.getElementById('shortLiqVol');

            if (longLiqPrice && data.longLiqPrice) longLiqPrice.textContent = '$' + Number(data.longLiqPrice).toFixed(0);
            if (longLiqVol && data.longLiqVol) longLiqVol.textContent = '$' + (data.longLiqVol / 1e6).toFixed(1) + 'M';
            if (shortLiqPrice && data.shortLiqPrice) shortLiqPrice.textContent = '$' + Number(data.shortLiqPrice).toFixed(0);
            if (shortLiqVol && data.shortLiqVol) shortLiqVol.textContent = '$' + (data.shortLiqVol / 1e6).toFixed(1) + 'M';
        } catch (e) {
            /* swallow */
        }
    }

    function handleCVDUpdate(data) {
        try {
            const el = document.getElementById('cvdValue');
            const trend = document.getElementById('cvdTrend');

            if (data.cvdValue != null) {
                cvdState.value = data.cvdValue;
                if (el) {
                    el.textContent = cvdState.value.toFixed(0);
                    el.style.color = cvdState.value > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
                }
            }

            if (trend && data.cvdTrend) trend.textContent = data.cvdTrend;
        } catch (e) {
            /* swallow */
        }
    }

    function handleWhaleAlert(data) {
        try {
            const container = document.getElementById('whaleAlerts');
            if (!container || !data) return;

            const item = document.createElement('div');
            item.className = 'whale-item';
            const side = data.side || 'UNKNOWN';
            item.style.cssText = `padding:8px; margin:4px 0; background:rgba(0,100,255,0.1); border-radius:4px; font-size:11px; border-left:3px solid ${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}`;
            item.innerHTML = `<span style="color:${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}; font-weight:800;">${side}</span> ${(data.amount || 0).toFixed(2)} BTC @ $${(data.price || 0).toLocaleString()}`;
            container.prepend(item);
            if (container.children.length > 5) container.lastChild.remove();
        } catch (e) {
            /* swallow */
        }
    }

    function handleFundingRate(data) {
        try {
            const current = document.getElementById('currentFunding');
            const predicted = document.getElementById('predictedFunding');
            const signal = document.getElementById('fundingSignal');

            if (current && data.currentFunding != null) current.textContent = (data.currentFunding * 100).toFixed(2) + '%';
            if (predicted && data.predictedFunding != null) predicted.textContent = (data.predictedFunding * 100).toFixed(2) + '%';
            if (signal && data.fundingSignal) signal.textContent = data.fundingSignal;
        } catch (e) {
            /* swallow */
        }
    }

    function handleMarketInternals(data) {
        try {
            const aggEl = document.getElementById('aggressorSide');
            if (!aggEl) return;

            // THE ALPHA: If SELLERS are slamming the bid, but price delta is POSITIVE = Absorption
            const isAbsorption = (data.aggressor === 'SELLERS' && OGZ.state?.lastPriceDelta > 0);

            if (isAbsorption) {
                aggEl.innerHTML = 'SELLERS <span class="absorbed-glow" style="color:var(--profit-color); text-shadow: 0 0 10px var(--profit-color);">[ABSORBED]</span>';
            } else {
                aggEl.textContent = data.aggressor;
                aggEl.style.color = data.aggressor === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
            }

            const bsrEl = document.getElementById('buySellRatio');
            if (bsrEl && data.buySellRatio != null) bsrEl.textContent = data.buySellRatio.toFixed(2);

            const biEl = document.getElementById('bookImbalance');
            if (biEl && data.bookImbalance != null) biEl.textContent = (data.bookImbalance * 100).toFixed(1) + '%';
        } catch (e) {
            /* swallow */
        }
    }

    function handleSmartMoney(data) {
        try {
            const sf = document.getElementById('smartFlow');
            const ia = document.getElementById('instActivity');
            const dm = document.getElementById('dormancy');

            if (sf && data.smartFlow) sf.textContent = data.smartFlow;
            if (ia && data.instActivity) ia.textContent = data.instActivity;
            if (dm && data.dormancy) dm.textContent = data.dormancy;
        } catch (e) {
            /* swallow */
        }
    }

    function handleFearGreed(data) {
        try {
            const el = document.getElementById('fgValue');
            const fill = document.getElementById('fgFill');
            const label = document.getElementById('fgLabel');

            if (data.fgValue != null) {
                if (el) el.textContent = data.fgValue;
                if (fill) fill.style.width = data.fgValue + '%';
            }

            if (label && data.fgLabel) label.textContent = data.fgLabel;
        } catch (e) {
            /* swallow */
        }
    }

    function handleDivergence(data) {
        try {
            const container = document.getElementById('divergences');
            if (!container || !data.divergences) return;

            container.innerHTML = '';
            data.divergences.forEach(div => {
                const item = document.createElement('div');
                item.className = 'divergence-item';
                item.textContent = div;
                container.appendChild(item);
            });
        } catch (e) {
            /* swallow */
        }
    }

    // ─── Public API ────────────────────────────────────────────────────────
    const EdgeAnalyticsPanel = {
        /**
         * Initialize: render scaffold, start feeds, wire event handlers.
         * Safe to call multiple times (idempotent).
         */
        init: function () {
            try {
                if (state.mounted) return;
                if (!renderScaffold()) return;

                state.mounted = true;
                startSimulatedFeeds();

                // Wire WS handlers if socket available
                const socket = OGZ.get && OGZ.get('Socket');
                if (socket) {
                    trackListener(socket, 'liquidation_data', handleLiquidationData);
                    trackListener(socket, 'cvd_update', handleCVDUpdate);
                    trackListener(socket, 'whale_trade', handleWhaleAlert);
                    trackListener(socket, 'funding_rate', handleFundingRate);
                    trackListener(socket, 'market_internals', handleMarketInternals);
                    trackListener(socket, 'smart_money', handleSmartMoney);
                    trackListener(socket, 'fear_greed', handleFearGreed);
                    trackListener(socket, 'divergence', handleDivergence);
                }
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Set current symbol (for symbol-scoped event subscriptions).
         */
        setSymbol: function (symbol) {
            try {
                state.currentSymbol = symbol || 'TSLA';
                const socket = OGZ.get && OGZ.get('Socket');
                if (socket && typeof socket.send === 'function') {
                    socket.send({ type: 'asset_change', asset: state.currentSymbol });
                }
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Clear all section values to defaults.
         */
        clearAll: function () {
            try {
                state.sectionState = {
                    liquidation: { longLiqPrice: null, longLiqVol: '$0', shortLiqPrice: null, shortLiqVol: '$0' },
                    cvd: { cvdValue: 0, cvdTrend: 'NEUTRAL', history: [] },
                    funding: { currentFunding: '0.01%', predictedFunding: '0.01%', fundingSignal: 'NEUTRAL' },
                    whale: { alerts: [] },
                    internals: { buySellRatio: '1.0', aggressorSide: 'NEUTRAL', bookImbalance: '0%', spreadValue: '0.01%' },
                    smartMoney: { smartFlow: 'ACCUMULATING', instActivity: 'HIGH', dormancy: 'LOW' },
                    fearGreed: { fgValue: 50, fgLabel: 'NEUTRAL' },
                    divergences: []
                };

                // Reset DOM
                ['longLiqPrice', 'longLiqVol', 'shortLiqPrice', 'shortLiqVol'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '--';
                });

                const whaleAlerts = document.getElementById('whaleAlerts');
                if (whaleAlerts) whaleAlerts.innerHTML = '<div class="whale-item">Waiting for whales...</div>';

                const divergences = document.getElementById('divergences');
                if (divergences) divergences.innerHTML = '<div class="divergence-item">Scanning...</div>';

                cvdState = { value: 0, history: [] };
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Explicit teardown: stop timers, remove listeners.
         */
        teardown: function () {
            try {
                for (const tid of _trackedTimers) {
                    try { clearInterval(tid); clearTimeout(tid); } catch (e) { /* swallow */ }
                }
                _trackedTimers.clear();

                for (const { target, type, handler } of _trackedListeners) {
                    try { target.removeEventListener(type, handler); }
                    catch (e) { /* swallow */ }
                }
                _trackedListeners.length = 0;

                state.mounted = false;
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Debug helper: return internal state.
         */
        _compute: function () {
            return {
                mounted: state.mounted,
                currentSymbol: state.currentSymbol,
                cvdHistoryLength: cvdState.history.length,
                timerCount: _trackedTimers.size,
                listenerCount: _trackedListeners.length,
                sectionState: JSON.parse(JSON.stringify(state.sectionState))
            };
        }
    };

    // ─── Registration ──────────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('EdgeAnalyticsPanel', EdgeAnalyticsPanel);
    } else {
        if (typeof document !== 'undefined') {
            document.addEventListener('DOMContentLoaded', () => {
                if (window.OGZ && typeof window.OGZ.register === 'function') {
                    window.OGZ.register('EdgeAnalyticsPanel', EdgeAnalyticsPanel);
                }
            });
        }
    }

    try { window.OGZEdgeAnalyticsPanel = EdgeAnalyticsPanel; } catch (_) { }
})(window.OGZ = window.OGZ || {});
