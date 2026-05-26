/**
 * chart-panel.js — Self-Rendering Chart Module (Phase 5 Refactor)
 *
 * Refactored from public/js/chart.js. Converts the legacy DOM-binder into
 * a fully self-contained, modular panel that creates its own HTML scaffold
 * at mount time. The v2 shell no longer needs ~120 lines of inline chart HTML.
 *
 * Core Responsibility:
 *   - Self-injects the entire chart scaffold (header + controls + container + HUD + tooltips)
 *   - Initializes TradingView Lightweight Charts inside the self-created tvChartContainer
 *   - Manages 11 indicator overlays: EMA (3x), SMA (3x), Bollinger Bands (3x),
 *     VWAP, RSI, MACD, ATR, Ichimoku (4x), Trend Lines (2x), Fibonacci, Support/Resistance
 *   - Handles crosshair tooltip with OHLC readout + live price flash animation
 *   - Wires trade markers, drawing tools, asset/timeframe selectors, indicator toggles
 *   - Subscribes to WS events: price, candle, historical_candles, trade, etc.
 *   - Preserves all behavior from legacy chart.js (ghost projections, liquidity TPO, volume alpha)
 *
 * EXTRACTION SOURCE:
 *   Refactored from public/js/chart.js lines 1-1090. All functionality preserved:
 *   - TradingView Lightweight Charts API unchanged
 *   - IndicatorAdapter.js integration preserved
 *   - drawing-tools.js wiring unchanged (chart instance exposed as window.OGZ_chart)
 *   - Volume gradient opacity (98th percentile cap, alpha envelope)
 *   - Candle outlier clipping (2nd/98th percentile, dynamic padding)
 *   - RSI 70/30 bands with proper price line cleanup
 *   - Layout rebalance on oscillator toggle (candle 80%/20% → 60%/20%/20% split)
 *
 * Public API:
 *   - init() / mount() / renderScaffold() / initChart() — lifecycle
 *   - teardown() — explicit cleanup (listeners, timers, subscriptions, RSI bands)
 *   - setSymbol(symbol) — change asset, refetch historical
 *   - setTimeframe(tf) — change timeframe, refetch historical
 *   - setChartType(type) — candlestick / line / area / bar
 *   - toggleIndicator(indicatorName, enabled) — show/hide overlay
 *   - addTradeMarker(price, time, side) — place marker at price/time
 *   - clearMarkers() — remove all trade markers
 *   - _compute() — debug helper returning internal state
 *
 * Mount Contract:
 *   Expects <div id="chartPanel"></div> to exist in the page DOM.
 *   At init(), the module creates all child elements inside chartPanel:
 *     - chart-header (with selectors, indicator checkboxes)
 *     - chart-container (tvChartContainer, crosshairTooltip, chartHud, tradeTooltip, feedStatusPill)
 *
 * Teardown:
 *   destroy() unwinds: all WS handlers, event listeners, timers, ResizeObserver,
 *   cached DOM refs, RSI price lines, TradingView chart instance.
 *
 * WS Subscriptions:
 *   - 'price': live tick updates, price flash, HUD readout
 *   - 'candle': per-timeframe candle updates (OHLCV)
 *   - 'historical_candles': batch load on asset/timeframe change
 *   - 'trade': add markers to chart for executed trades
 *   - 'state_update': open positions (for trade side coloring)
 *   - 'projection_path': ghost projections overlay (ML path)
 *   - 'depth_update': TPO/wall rendering (dormant, gate-guarded)
 *
 * Self-registers as OGZ.ChartPanel via OGZ.register('ChartPanel', ...).
 * LEGACY COMPAT: Exposes window.OGZ_chart for drawing-tools.js access.
 *
 * @module public/js/panels/chart-panel
 */
(function (OGZ) {
    'use strict';

    // ─── Module-Scoped State ──────────────────────────────────────────────
    // Every identifier is module-private. Chart instance + series exposed via
    // public API. DOM refs cached after mount for hot-path performance.
    let tvChart, candleSeries, volumeSeries, ghostSeries;
    let tpoLines = [], wallLines = [];

    // Indicator overlay series
    let ema20Series, ema50Series, ema200Series;
    let bbUpperSeries, bbMiddleSeries, bbLowerSeries;
    let vwapSeries, sma20Series, sma50Series, sma200Series;
    let rsiOverlaySeries, macdLineSeries, macdSignalSeries, atrSeries;
    let activeOverlays = [];
    let storedCandles = [];

    // Cached hot-path DOM refs (resolved once at mount)
    let _cachedPriceEl = null;
    let _cachedHudPrice = null;
    let _cachedHudOhlc = null;
    let _cachedTooltipEl = null;

    // Teardown tracking
    const _trackedListeners = [];
    const _trackedTimers = new Set();
    let _trackedVisibleRangeCB = null;
    let _trackedRsiSeries = null;

    // Trade markers (by time+action+price key)
    let tradeMarkers = new Map();
    // Per-time-second context map for hover tooltips
    // Key: candle-time seconds (integer). Value: Array of trade contexts at that time.
    const tradeMarkerData = new Map();
    // Floating marker tooltip element (created lazily)
    let _markerTooltipEl = null;
    let _hoveredMarkerTime = null;

    // ─── Oscillator Panes (stacked multi-pane system) ───────────────────
    // Each oscillator (volume, rsi, macd, atr) can be toggled to appear as
    // its OWN LightweightCharts instance stacked below the main candle pane.
    // Every active pane is time-axis + crosshair synced to the main chart.
    // v4 has no native panes — each pane is a separate createChart() instance.
    //
    // _oscPanes: registry keyed by 'volume'|'rsi'|'macd'|'atr'. Each entry:
    //   { container, chart, series, rangeCB, crosshairCB, resizeObserver }
    // where `series` is an object whose values are the pane's series
    // (volume/rsi/atr have one; macd has { macd, signal }).
    // _oscSyncing is a SINGLE re-entrance guard shared across all panes.
    const OSC_PANE_LS_KEY = 'ogz.chartPanel.oscPanes';   // JSON array of active keys
    const OSC_PANE_ORDER = ['volume', 'rsi', 'macd', 'atr'];
    let _oscPanes = {};                 // key -> pane entry (see above)
    let _oscSyncing = false;            // re-entrance guard for time-axis sync (shared)
    let _oscMainRangeCB = null;         // single main-chart range sub feeding all panes

    // ─── Constants ─────────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-chart-panel-styles';
    const ROOT_ID = 'chartPanel';

    const MIN_AUTOSCALE_SAMPLE = 10;
    const RESCALE_THROTTLE_MS = 80;
    const PRICE_FLASH_MS = 180;
    const MIN_INDICATOR_CANDLES = 30;
    const MIN_VOLUME_STATS_CANDLES = 20;
    const VOL_CAP_PCTILE = 0.98;
    const VOL_ALPHA_FLOOR = 0.25;
    const VOL_ALPHA_RANGE = 0.55;
    const VOL_LIVE_ALPHA_DEFAULT = 0.5;
    const VOL_LIVE_HEADROOM = 1.15;
    const CANDLE_PCTILE_LOW = 0.02;
    const CANDLE_PCTILE_HIGH = 0.98;
    const CANDLE_PAD_RATIO = 0.05;

    const PRICE_FLASH_CLASS = 'ogz-chart-panel-price-flash';

    const TF_SECONDS = {
        '1s': 1, '5s': 5, '15s': 15, '30s': 30,
        '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
        '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200,
        '1d': 86400
    };

    const DEFAULT_SYMBOL = 'TSLA';
    const DEFAULT_TIMEFRAME = '1m';

    // ─── CSS Injection (Fallback) ──────────────────────────────────────────
    (function injectFlashStyle() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('ogz-chart-panel-flash-style')) return;
        const s = document.createElement('style');
        s.id = 'ogz-chart-panel-flash-style';
        s.textContent = '.' + PRICE_FLASH_CLASS +
            '{transition:color 0.08s ease,text-shadow 0.08s ease;}';
        if (document.head) document.head.appendChild(s);
    })();

    // ─── Trade Marker Tooltip CSS ──────────────────────────────────────────
    (function injectMarkerTooltipStyle() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('ogz-chart-marker-tip-style')) return;
        const s = document.createElement('style');
        s.id = 'ogz-chart-marker-tip-style';
        s.textContent = `
            .ogz-chart-marker-tip {
                position: absolute;
                background: rgba(10, 10, 16, 0.96);
                border: 1px solid rgba(255, 215, 0, 0.35);
                border-radius: 6px;
                padding: 8px 12px;
                color: #e6e6e6;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                line-height: 1.45;
                pointer-events: none;
                z-index: 9550;
                box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55),
                            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
                max-width: 280px;
                opacity: 0;
                transform: translateY(-2px);
                transition: opacity 120ms, transform 120ms;
                white-space: nowrap;
            }
            .ogz-chart-marker-tip.show { opacity: 1; transform: translateY(0); }
            .ogz-chart-marker-tip .tip-head {
                font-size: 10px;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: rgba(255, 215, 0, 0.85);
                margin-bottom: 4px;
                font-weight: 700;
            }
            .ogz-chart-marker-tip .tip-pnl-pos { color: #22c55e; font-weight: 700; }
            .ogz-chart-marker-tip .tip-pnl-neg { color: #ef4444; font-weight: 700; }
            .ogz-chart-marker-tip .tip-meta {
                color: rgba(255, 255, 255, 0.55);
                font-size: 10px;
                margin-top: 4px;
            }
            .ogz-chart-marker-tip .tip-hint {
                font-size: 9px;
                color: rgba(255, 215, 0, 0.5);
                margin-top: 6px;
                letter-spacing: 0.5px;
            }

            /* Oscillator pane (opt-in split) */
            .cp-osc-toggle {
                cursor: pointer;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: rgba(255, 255, 255, 0.85);
                transition: background 150ms, border-color 150ms;
            }
            .cp-osc-toggle:hover {
                background: rgba(255, 215, 0, 0.08);
                border-color: rgba(255, 215, 0, 0.35);
            }
            .cp-osc-toggle.active {
                background: rgba(255, 215, 0, 0.16);
                border-color: rgba(255, 215, 0, 0.55);
                color: #ffd700;
            }
            .cp-osc-pane {
                width: 100%;
                height: 120px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                background: var(--bg, #0a0a0a);
                position: relative;
                margin-top: 4px;
            }
            /* Only the last stacked pane gets the rounded bottom corners */
            .cp-osc-pane:last-child {
                border-radius: 0 0 6px 6px;
            }
            .cp-osc-pane + .cp-osc-pane {
                margin-top: 0;
            }
            .cp-osc-label {
                position: absolute;
                top: 4px;
                left: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: rgba(255, 255, 255, 0.4);
                letter-spacing: 1px;
                text-transform: uppercase;
                pointer-events: none;
                z-index: 2;
            }
        `;
        if (document.head) document.head.appendChild(s);
    })();

    // ─── Marker Tooltip Helpers ────────────────────────────────────────────
    function ensureMarkerTooltip() {
        if (_markerTooltipEl) return _markerTooltipEl;
        const container = document.getElementById('tvChartContainer') || document.body;
        const el = document.createElement('div');
        el.className = 'ogz-chart-marker-tip';
        container.appendChild(el);
        _markerTooltipEl = el;
        return el;
    }

    function renderMarkerTooltipContent(contexts) {
        // contexts: Array of trade contexts at the same candle-time.
        // Most cases one entry, but in tight markets there could be entry + exit
        // at the same candle.
        if (!contexts || !contexts.length) return '';
        const fmtTime = (ms) => {
            const d = new Date(ms);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        return contexts.map(c => {
            const sideText = c.isEntry
                ? `${c.direction === 'short' ? 'SHORT' : 'LONG'} entry @ $${c.price.toFixed(2)}`
                : `${c.direction === 'short' ? 'COVER' : 'SELL'} @ $${c.price.toFixed(2)}`;
            let pnlLine = '';
            if (c.isClose) {
                const sign = c.pnl >= 0 ? '+' : '';
                const cls  = c.pnl >= 0 ? 'tip-pnl-pos' : 'tip-pnl-neg';
                pnlLine = `<div><span class="${cls}">${sign}$${Math.abs(c.pnl).toFixed(2)}</span></div>`;
            }
            let metaBits = [];
            if (c.strategy)    metaBits.push(`strat: ${c.strategy}`);
            if (c.pattern)     metaBits.push(`pattern: ${c.pattern}`);
            if (c.confidence != null) metaBits.push(`conf: ${Number(c.confidence).toFixed(0)}%`);
            if (c.duration)    metaBits.push(`held: ${c.duration}`);
            const metaStr = metaBits.length ? `<div class="tip-meta">${metaBits.join(' · ')}</div>` : '';

            return `
                <div class="tip-head">${c.isEntry ? 'ENTRY' : 'EXIT'} · ${fmtTime(c.tsMs)}</div>
                <div>${sideText}</div>
                ${pnlLine}
                ${metaStr}
                <div class="tip-hint">click marker to replay</div>
            `;
        }).join('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:6px 0;">');
    }

    function showMarkerTooltipAt(point, contexts) {
        if (!point || !contexts || !contexts.length) return;
        const el = ensureMarkerTooltip();
        const container = document.getElementById('tvChartContainer');
        if (!container) return;
        el.innerHTML = renderMarkerTooltipContent(contexts);

        // Position relative to chart container
        const rect = container.getBoundingClientRect();
        const tipW = 240;   // approximate
        const tipH = 90;
        let x = point.x + 18;
        let y = point.y - tipH - 10;
        if (x + tipW > rect.width)  x = point.x - tipW - 18;
        if (y < 4)                  y = point.y + 18;
        el.style.left = Math.max(4, x) + 'px';
        el.style.top  = Math.max(4, y) + 'px';
        el.classList.add('show');
    }

    function hideMarkerTooltip() {
        if (_markerTooltipEl) _markerTooltipEl.classList.remove('show');
        _hoveredMarkerTime = null;
    }

    // ─── Helper: Track & Cleanup Listeners ─────────────────────────────────
    function trackListener(target, type, handler) {
        for (let i = 0; i < _trackedListeners.length; i++) {
            const e = _trackedListeners[i];
            if (e.target === target && e.type === type && e.handler === handler) return;
        }
        target.addEventListener(type, handler);
        _trackedListeners.push({ target, type, handler });
    }

    function trackTimer(id) {
        _trackedTimers.add(id);
        return id;
    }

    // ─── Helper: RSI Band Removal ──────────────────────────────────────────
    function removeRsiBands(chartInstance) {
        const rsiSeries = (chartInstance && chartInstance._rsiOverlaySeries) || _trackedRsiSeries;
        if (!rsiSeries) return;
        if (chartInstance && chartInstance._rsiBand70) {
            try { rsiSeries.removePriceLine(chartInstance._rsiBand70); }
            catch (e) { /* swallow */ }
            chartInstance._rsiBand70 = null;
        }
        if (chartInstance && chartInstance._rsiBand30) {
            try { rsiSeries.removePriceLine(chartInstance._rsiBand30); }
            catch (e) { /* swallow */ }
            chartInstance._rsiBand30 = null;
        }
    }

    // ─── Helper: Visible Slice (Autoscale Clipping) ────────────────────────
    function visibleSlice() {
        if (!storedCandles.length) return [];
        try {
            const lr = tvChart.timeScale().getVisibleLogicalRange();
            if (lr && lr.from != null && lr.to != null) {
                const from = Math.max(0, Math.floor(lr.from));
                const to = Math.min(storedCandles.length - 1, Math.ceil(lr.to));
                if (to > from) return storedCandles.slice(from, to + 1);
            }
        } catch (e) {
            /* swallow */
        }
        return storedCandles;
    }

    // ─── Helper: Current Bucket Size ───────────────────────────────────────
    function currentBucketSeconds() {
        const root = document.getElementById(ROOT_ID);
        const tf = root ? root.querySelector('#cp-timeframeSelector')?.value : DEFAULT_TIMEFRAME;
        return TF_SECONDS[tf || DEFAULT_TIMEFRAME] || 60;
    }

    // ─── Helper: Oscillator-Pane Persistence ───────────────────────────────
    // OSC_PANE_LS_KEY stores a JSON array of active pane keys. When the key is
    // absent (first-ever load / new feature) the VOLUME pane defaults ON.
    function readSavedOscPanes() {
        try {
            const raw = localStorage.getItem(OSC_PANE_LS_KEY);
            if (raw == null) return ['volume'];   // default: volume split ON
            // Back-compat: the key used to hold a '1'/'0' flag.
            if (raw === '1') return ['volume'];
            if (raw === '0') return [];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return ['volume'];
            return arr.filter(k => OSC_PANE_ORDER.indexOf(k) !== -1);
        } catch (e) {
            return ['volume'];
        }
    }

    function persistOscPanes() {
        try {
            const active = OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
            localStorage.setItem(OSC_PANE_LS_KEY, JSON.stringify(active));
        } catch (e) { /* swallow */ }
    }

    // ─── Helper: Per-Oscillator Pane Spec ──────────────────────────────────
    // Describes how to build each oscillator's aux-pane series.
    const OSC_PANE_SPEC = {
        volume: {
            label: 'VOLUME',
            build: function (chart) {
                const s = chart.addHistogramSeries({
                    color: '#26a69a',
                    priceFormat: { type: 'volume' },
                    priceScaleId: 'right'
                });
                return { volume: s };
            }
        },
        rsi: {
            label: 'RSI 14',
            build: function (chart) {
                const s = chart.addLineSeries({
                    color: '#ec4899', lineWidth: 1.5, title: 'RSI',
                    priceScaleId: 'right',
                    priceFormat: { type: 'custom', minMove: 1, formatter: v => v.toFixed(0) },
                    lastValueVisible: false, priceLineVisible: false,
                    // Fixed 0-100 RSI scale
                    autoscaleInfoProvider: () => ({
                        priceRange: { minValue: 0, maxValue: 100 }
                    })
                });
                // 70 / 30 guide lines
                try {
                    s.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.45)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
                    s.createPriceLine({ price: 30, color: 'rgba(34,197,94,0.45)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
                } catch (e) { /* swallow */ }
                return { rsi: s };
            }
        },
        macd: {
            label: 'MACD 12/26/9',
            build: function (chart) {
                const macd = chart.addLineSeries({
                    color: '#8b5cf6', lineWidth: 1.5, title: 'MACD',
                    priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false
                });
                const signal = chart.addLineSeries({
                    color: '#fbbf24', lineWidth: 1, title: 'Signal',
                    priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false
                });
                return { macd: macd, signal: signal };
            }
        },
        atr: {
            label: 'ATR 14',
            build: function (chart) {
                const s = chart.addLineSeries({
                    color: '#f59e0b', lineWidth: 1, title: 'ATR',
                    priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false
                });
                return { atr: s };
            }
        }
    };

    // ─── Helper: Recompute & Feed Oscillator Panes ─────────────────────────
    // Recompute RSI/MACD/ATR from the given candle array and push the result
    // into whichever oscillator panes are currently active. Volume is fed
    // separately by the caller (it already has the colored volData on hand).
    function feedOscIndicatorPanes(candles) {
        if (!candles || candles.length < MIN_INDICATOR_CANDLES) return;
        const haveRsi = _oscPanes['rsi'] && _oscPanes['rsi'].series && _oscPanes['rsi'].series.rsi;
        const haveMacd = _oscPanes['macd'] && _oscPanes['macd'].series;
        const haveAtr = _oscPanes['atr'] && _oscPanes['atr'].series && _oscPanes['atr'].series.atr;
        if (!haveRsi && !haveMacd && !haveAtr) return;

        const Ind = OGZ.get('Indicators');
        if (!Ind) return;
        const closes = candles.map(c => c.close);
        const times = candles.map(c => c.time);
        const mapSeries = (values) => values
            .map((v, i) => v != null ? { time: times[i], value: v } : null)
            .filter(Boolean);

        try {
            if (haveRsi) {
                _oscPanes['rsi'].series.rsi.setData(mapSeries(Ind.calculateRSI(closes, 14)));
            }
            if (haveAtr) {
                _oscPanes['atr'].series.atr.setData(mapSeries(Ind.calculateATR(candles, 14)));
            }
            if (haveMacd) {
                const macd = Ind.calculateMACD(closes);
                if (_oscPanes['macd'].series.macd) _oscPanes['macd'].series.macd.setData(mapSeries(macd.macd));
                if (_oscPanes['macd'].series.signal) _oscPanes['macd'].series.signal.setData(mapSeries(macd.signal));
            }
        } catch (e) { /* swallow */ }
    }

    // ─── Helper: Render Scaffold HTML ─────────────────────────────────────
    function renderScaffold() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        root.innerHTML = '';
        root.className = 'cp-root';

        // Header with selectors & indicator checkboxes
        const header = document.createElement('div');
        header.className = 'cp-header';

        const titleContainer = document.createElement('div');
        titleContainer.className = 'cp-title-container';

        const title = document.createElement('h2');
        title.className = 'cp-title';
        title.id = 'chartTitle';
        title.textContent = 'ML VERSION';
        title.style.display = 'none';

        const priceDisplay = document.createElement('span');
        priceDisplay.className = 'cp-price-display';
        priceDisplay.id = 'currentPrice';
        priceDisplay.textContent = '$0.00';

        titleContainer.appendChild(title);
        titleContainer.appendChild(priceDisplay);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'cp-controls';

        const chartTypeSelector = document.createElement('select');
        chartTypeSelector.id = 'cp-chartTypeSelector';
        chartTypeSelector.className = 'cp-selector';
        chartTypeSelector.innerHTML = `
            <option value="candlestick" selected>Candlestick</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
        `;

        const assetSelector = document.createElement('select');
        assetSelector.id = 'cp-assetSelector';
        assetSelector.className = 'cp-selector';
        assetSelector.innerHTML = `
            <optgroup label="Crypto (Kraken)">
                <option value="BTC-USD">Bitcoin (BTC)</option>
                <option value="ETH-USD">Ethereum (ETH)</option>
            </optgroup>
            <optgroup label="Stocks (Alpaca)">
                <option value="TSLA" selected>Tesla (TSLA)</option>
                <option value="NVDA">NVIDIA (NVDA)</option>
                <option value="SPY">S&P 500 (SPY)</option>
                <option value="QQQ">Nasdaq 100 (QQQ)</option>
                <option value="COIN">Coinbase (COIN)</option>
                <option value="MARA">Marathon (MARA)</option>
                <option value="RIOT">Riot Platforms (RIOT)</option>
            </optgroup>
        `;
        // #48: selector now covers every watchlist ticker the backend serves —
        // watchlist DEFAULT_TICKERS = TSLA,NVDA,SPY,QQQ,COIN,MARA,RIOT (Alpaca)
        // + BTC,ETH (Kraken). stock-data-adapter STOCK_TICKERS confirms all
        // seven stocks are supported. Previously only TSLA/NVDA/SPY were
        // options, so clicking QQQ/COIN/MARA/RIOT in the watchlist hit
        // switchAsset's unknown-symbol guard and silently did nothing.

        const timeframeSelector = document.createElement('select');
        timeframeSelector.id = 'cp-timeframeSelector';
        timeframeSelector.className = 'cp-selector';
        timeframeSelector.innerHTML = `
            <option value="1m" selected>1M</option>
            <option value="5m">5M</option>
            <option value="15m">15M</option>
            <option value="30m">30M</option>
            <option value="1h">1H</option>
            <option value="4h">4H</option>
            <option value="1d">1D</option>
        `;

        controls.appendChild(chartTypeSelector);
        controls.appendChild(assetSelector);
        controls.appendChild(timeframeSelector);

        // Oscillator-pane toggle button (opt-in pane split)
        const oscToggle = document.createElement('button');
        oscToggle.id = 'cp-oscToggle';
        oscToggle.className = 'cp-selector cp-osc-toggle';
        oscToggle.type = 'button';
        oscToggle.textContent = 'Volume Split';
        oscToggle.title = 'Toggle the volume oscillator pane (volume in its own row below the chart)';
        oscToggle.addEventListener('click', () => {
            try {
                if (_oscPanes['volume']) {
                    ChartPanel.removeOscPane('volume');
                } else {
                    ChartPanel.addOscPane('volume');
                }
            } catch (e) { /* swallow */ }
        });
        controls.appendChild(oscToggle);

        // Indicator checkboxes
        const indicatorCheckboxes = document.createElement('div');
        indicatorCheckboxes.id = 'cp-indicatorCheckboxes';
        indicatorCheckboxes.className = 'cp-indicator-checkboxes';

        const indicatorConfigs = [
            { value: 'ema', label: 'EMA', color: '#fbbf24' },
            { value: 'sma', label: 'SMA', color: '#60a5fa' },
            { value: 'bollinger', label: 'Bollinger Bands', color: '#a78bfa' },
            { value: 'atr', label: 'ATR', color: '#f59e0b' },
            { value: 'fibonacci', label: 'Fibonacci', color: '#9900ff' },
            { value: 'trendlines', label: 'Trend Lines', color: '#00ff00' },
            { value: 'rsi', label: 'RSI', color: '#ec4899' },
            { value: 'macd', label: 'MACD', color: '#8b5cf6' },
            { value: 'vwap', label: 'VWAP', color: '#e879f9' },
            { value: 'ichimoku', label: 'Ichimoku', color: '#06b6d4' },
            { value: 'sr', label: 'Support/Resistance', color: '#ff9900' }
        ];

        indicatorConfigs.forEach(config => {
            const label = document.createElement('label');
            label.className = 'cp-indicator-check';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = config.value;

            const dot = document.createElement('span');
            dot.className = 'cp-color-dot';
            dot.style.backgroundColor = config.color;

            const text = document.createElement('span');
            text.textContent = config.label;

            label.appendChild(checkbox);
            label.appendChild(dot);
            label.appendChild(text);
            indicatorCheckboxes.appendChild(label);
        });

        header.appendChild(titleContainer);
        header.appendChild(controls);
        header.appendChild(indicatorCheckboxes);

        // Chart container
        const container = document.createElement('div');
        container.className = 'cp-container';

        const tvChartContainer = document.createElement('div');
        tvChartContainer.id = 'tvChartContainer';
        tvChartContainer.className = 'cp-tv-chart-container';

        const tradeTooltip = document.createElement('div');
        tradeTooltip.id = 'tradeTooltip';
        tradeTooltip.className = 'cp-trade-tooltip';
        tradeTooltip.style.display = 'none';
        const tooltipContent = document.createElement('div');
        tooltipContent.id = 'tooltipContent';
        tradeTooltip.appendChild(tooltipContent);

        const crosshairTooltip = document.createElement('div');
        crosshairTooltip.id = 'crosshairTooltip';
        crosshairTooltip.className = 'cp-crosshair-tooltip';
        crosshairTooltip.style.display = 'none';

        const feedStatusPill = document.createElement('div');
        feedStatusPill.id = 'feedStatusPill';
        feedStatusPill.className = 'cp-feed-status-pill';
        feedStatusPill.style.display = 'none';
        feedStatusPill.textContent = 'Bot offline - waiting for feed';

        const chartHud = document.createElement('div');
        chartHud.id = 'chartHud';
        chartHud.className = 'cp-chart-hud';
        chartHud.style.visibility = 'hidden';

        const hudPrice = document.createElement('div');
        hudPrice.id = 'chartHudPrice';
        hudPrice.className = 'cp-hud-price';
        hudPrice.style.display = 'none';

        const hudOhlc = document.createElement('div');
        hudOhlc.id = 'chartHudOhlc';
        hudOhlc.className = 'cp-hud-ohlc';
        hudOhlc.textContent = 'O 0.00  H 0.00  L 0.00  C 0.00';

        chartHud.appendChild(hudPrice);
        chartHud.appendChild(hudOhlc);

        container.appendChild(tvChartContainer);
        container.appendChild(tradeTooltip);
        container.appendChild(crosshairTooltip);
        container.appendChild(feedStatusPill);
        container.appendChild(chartHud);

        root.appendChild(header);
        root.appendChild(container);

        return true;
    }

    // ─── Main Chart Initialization ─────────────────────────────────────────
    function initChart() {
        const container = document.getElementById('tvChartContainer');
        if (!container) return false;

        // Cache hot-path DOM refs
        _cachedPriceEl = document.getElementById('currentPrice');
        _cachedHudPrice = document.getElementById('chartHudPrice');
        _cachedHudOhlc = document.getElementById('chartHudOhlc');
        _cachedTooltipEl = document.getElementById('crosshairTooltip');

        if (_cachedPriceEl) _cachedPriceEl.classList.add(PRICE_FLASH_CLASS);
        if (_cachedHudPrice) _cachedHudPrice.classList.add(PRICE_FLASH_CLASS);

        tvChart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: { background: { color: '#0a0a0a' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
            crosshair: { mode: 0, vertLine: { color: 'rgba(220, 38, 38, 0.45)' }, horzLine: { color: 'rgba(220, 38, 38, 0.45)' } },
            timeScale: { rightOffset: 12, timeVisible: true, secondsVisible: false },
            handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true }
        });

        // Candlestick series
        candleSeries = tvChart.addCandlestickSeries({
            upColor: '#22c55e', downColor: '#ef4444',
            borderUpColor: '#22c55e', borderDownColor: '#ef4444',
            wickUpColor: '#22c55e', wickDownColor: '#ef4444',
            autoscaleInfoProvider: (baseImpl) => {
                try {
                    const base = baseImpl();
                    const slice = visibleSlice();
                    if (slice.length < MIN_AUTOSCALE_SAMPLE) return base;
                    const lows = slice.map(c => c.low).sort((a, b) => a - b);
                    const highs = slice.map(c => c.high).sort((a, b) => a - b);
                    const loIdx = Math.max(0, Math.floor(lows.length * CANDLE_PCTILE_LOW));
                    const hiIdx = Math.min(highs.length - 1, Math.ceil(highs.length * CANDLE_PCTILE_HIGH) - 1);
                    const pLow = lows[loIdx];
                    const pHigh = highs[hiIdx];
                    if (!(pLow < pHigh)) return base;
                    const pad = (pHigh - pLow) * CANDLE_PAD_RATIO;
                    return {
                        priceRange: { minValue: pLow - pad, maxValue: pHigh + pad },
                        margins: base?.margins || { above: 10, below: 20 }
                    };
                } catch (e) {
                    return baseImpl();
                }
            }
        });

        // Volume series
        volumeSeries = tvChart.addHistogramSeries({
            priceScaleId: 'vol',
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            autoscaleInfoProvider: (baseImpl) => {
                try {
                    const base = baseImpl();
                    const slice = visibleSlice();
                    const vols = slice.map(c => Number(c.volume || 0)).filter(v => v > 0).sort((a, b) => a - b);
                    if (vols.length < MIN_AUTOSCALE_SAMPLE) return base;
                    const capIdx = Math.min(vols.length - 1, Math.ceil(vols.length * VOL_CAP_PCTILE) - 1);
                    const cap = vols[capIdx];
                    if (!(cap > 0)) return base;
                    return {
                        priceRange: { minValue: 0, maxValue: cap * VOL_LIVE_HEADROOM },
                        margins: base?.margins || { above: 10, below: 0 }
                    };
                } catch (e) {
                    return baseImpl();
                }
            }
        });

        tvChart.priceScale('vol').applyOptions({ drawTicks: false, borderVisible: false });
        tvChart.priceScale('right').applyOptions({ borderVisible: false });

        // Ghost series for projections
        ghostSeries = tvChart.addLineSeries({
            color: 'rgba(0, 255, 255, 0.4)',
            lineWidth: 2,
            lineStyle: 3,
            priceLineVisible: false
        });

        // Indicator overlay series
        ema20Series = tvChart.addLineSeries({ color: '#fbbf24', lineWidth: 1.5, visible: false, title: 'EMA20', lastValueVisible: false, priceLineVisible: false });
        ema50Series = tvChart.addLineSeries({ color: '#22d3ee', lineWidth: 1.5, visible: false, title: 'EMA50', lastValueVisible: false, priceLineVisible: false });
        ema200Series = tvChart.addLineSeries({ color: '#a78bfa', lineWidth: 2, visible: false, title: 'EMA200', lastValueVisible: false, priceLineVisible: false });
        bbUpperSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.35)', lineWidth: 1, visible: false, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
        bbMiddleSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.55)', lineWidth: 1, visible: false, lastValueVisible: false, priceLineVisible: false });
        bbLowerSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.35)', lineWidth: 1, visible: false, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
        vwapSeries = tvChart.addLineSeries({ color: '#e879f9', lineWidth: 2, visible: false, title: 'VWAP', lastValueVisible: false, priceLineVisible: false });
        sma20Series = tvChart.addLineSeries({ color: '#60a5fa', lineWidth: 1, visible: false, title: 'SMA20', lastValueVisible: false, priceLineVisible: false });
        sma50Series = tvChart.addLineSeries({ color: '#3b82f6', lineWidth: 1, visible: false, title: 'SMA50', lastValueVisible: false, priceLineVisible: false });
        sma200Series = tvChart.addLineSeries({ color: '#1d4ed8', lineWidth: 2, visible: false, title: 'SMA200', lastValueVisible: false, priceLineVisible: false });

        // Oscillator series — RSI/MACD/ATR are NO LONGER drawn on the main
        // price chart (fix #42). They now live in their own stacked aux panes
        // (see OSC_PANE_SPEC / addOscPane). These main-chart series are kept
        // DECLARED-but-permanently-hidden to keep the diff focused; nothing
        // makes them visible and nothing feeds them anymore. A later cleanup
        // will excise them entirely.
        rsiOverlaySeries = tvChart.addLineSeries({
            color: '#ec4899', lineWidth: 1.5, visible: false, title: 'RSI',
            priceScaleId: 'rsi',
            priceFormat: { type: 'custom', formatter: v => v.toFixed(0) },
            lastValueVisible: false, priceLineVisible: false
        });
        tvChart.priceScale('rsi').applyOptions({ visible: false, borderVisible: false });
        _trackedRsiSeries = rsiOverlaySeries;
        ChartPanel._rsiOverlaySeries = rsiOverlaySeries;

        macdLineSeries = tvChart.addLineSeries({ color: '#8b5cf6', lineWidth: 1.5, visible: false, title: 'MACD', priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
        macdSignalSeries = tvChart.addLineSeries({ color: '#fbbf24', lineWidth: 1, visible: false, title: 'Signal', priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
        tvChart.priceScale('macd').applyOptions({ visible: false, borderVisible: false });
        atrSeries = tvChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, visible: false, title: 'ATR', priceScaleId: 'atr', lastValueVisible: false, priceLineVisible: false });
        tvChart.priceScale('atr').applyOptions({ visible: false, borderVisible: false });

        // Ichimoku
        ChartPanel._ichiTenkan = tvChart.addLineSeries({ color: '#06b6d4', lineWidth: 1, visible: false, title: 'Tenkan', lastValueVisible: false, priceLineVisible: false });
        ChartPanel._ichiKijun = tvChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, visible: false, title: 'Kijun', lastValueVisible: false, priceLineVisible: false });
        ChartPanel._ichiSenkouA = tvChart.addLineSeries({ color: 'rgba(34,197,94,0.45)', lineWidth: 1, visible: false, title: 'Senkou A', lastValueVisible: false, priceLineVisible: false });
        ChartPanel._ichiSenkouB = tvChart.addLineSeries({ color: 'rgba(239,68,68,0.45)', lineWidth: 1, visible: false, title: 'Senkou B', lastValueVisible: false, priceLineVisible: false });

        // Trend lines
        ChartPanel._trendResistance = tvChart.addLineSeries({ color: '#ef4444', lineWidth: 2, visible: false, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        ChartPanel._trendSupport = tvChart.addLineSeries({ color: '#22c55e', lineWidth: 2, visible: false, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

        // Fibonacci & S/R price lines
        ChartPanel._fibLines = [];
        ChartPanel._srLines = [];

        // Apply initial layout
        ChartPanel._applyLayout();

        // Visible-range rescale listener
        let _rescaleTimer = null;
        _trackedVisibleRangeCB = () => {
            if (_rescaleTimer) return;
            _rescaleTimer = trackTimer(setTimeout(() => {
                _trackedTimers.delete(_rescaleTimer);
                _rescaleTimer = null;
                try {
                    tvChart.priceScale('right').applyOptions({});
                    tvChart.priceScale('vol').applyOptions({});
                } catch (e) {
                    /* swallow */
                }
            }, RESCALE_THROTTLE_MS));
        };
        tvChart.timeScale().subscribeVisibleLogicalRangeChange(_trackedVisibleRangeCB);

        // Crosshair tooltip
        const tooltipEl = _cachedTooltipEl;
        tvChart.subscribeCrosshairMove(param => {
            const priceEl = _cachedPriceEl;
            const candleData = param.seriesData ? param.seriesData.get(candleSeries) : null;

            if (priceEl) {
                if (!param.time || !candleData) {
                    priceEl.textContent = `$${OGZ.state.lastPrice.toLocaleString()}`;
                } else {
                    priceEl.textContent = `O:${candleData.open.toFixed(2)} H:${candleData.high.toFixed(2)} L:${candleData.low.toFixed(2)} C:${candleData.close.toFixed(2)}`;
                }
            }

            if (!tooltipEl) return;
            if (!param.time || !candleData || !param.point) {
                tooltipEl.style.display = 'none';
                return;
            }

            const ts = (typeof param.time === 'number' ? param.time : (param.time.timestamp || 0)) * 1000;
            const dateStr = new Date(ts).toLocaleString([], {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const priceAt = candleSeries.coordinateToPrice(param.point.y);
            const dir = candleData.close >= candleData.open ? '#22c55e' : '#ef4444';

            while (tooltipEl.firstChild) tooltipEl.removeChild(tooltipEl.firstChild);

            const dateRow = document.createElement('div');
            dateRow.style.cssText = 'color:#888;font-size:10px;letter-spacing:0.5px;';
            dateRow.textContent = dateStr;
            tooltipEl.appendChild(dateRow);

            const priceRow = document.createElement('div');
            priceRow.style.cssText = 'font-family:Orbitron,monospace;font-size:13px;font-weight:700;margin-top:2px;color:' + dir;
            priceRow.textContent = (priceAt != null && typeof priceAt === 'number' ? '$' + priceAt.toFixed(2) : '--');
            tooltipEl.appendChild(priceRow);

            const ohlcRow = document.createElement('div');
            ohlcRow.style.cssText = 'color:#aaa;font-size:10px;margin-top:4px;font-family:monospace;';
            const oh = document.createElement('div');
            const ll = document.createElement('div');
            oh.textContent = 'O ' + Number(candleData.open).toFixed(2) + '   H ' + Number(candleData.high).toFixed(2);
            ll.textContent = 'L ' + Number(candleData.low).toFixed(2) + '   C ' + Number(candleData.close).toFixed(2);
            ohlcRow.appendChild(oh);
            ohlcRow.appendChild(ll);
            tooltipEl.appendChild(ohlcRow);

            const containerRect = container.getBoundingClientRect();
            const tipW = 150, tipH = 78;
            let x = param.point.x + 18;
            let y = param.point.y + 18;
            if (x + tipW > containerRect.width) x = param.point.x - tipW - 18;
            if (y + tipH > containerRect.height) y = param.point.y - tipH - 18;
            tooltipEl.style.left = Math.max(4, x) + 'px';
            tooltipEl.style.top = Math.max(4, y) + 'px';
            tooltipEl.style.display = 'block';

            // ─── Trade Marker Tooltip ──────────────────────────────────
            // Check if the hovered candle-time has any trade markers attached.
            // If yes, show the rich trade-context floating tooltip with the
            // entry/exit details, P&L, strategy, pattern, confidence.
            try {
                const candleTime = typeof param.time === 'number' ? param.time : (param.time && param.time.timestamp);
                if (candleTime != null && tradeMarkerData.has(candleTime)) {
                    if (_hoveredMarkerTime !== candleTime) {
                        _hoveredMarkerTime = candleTime;
                        showMarkerTooltipAt(param.point, tradeMarkerData.get(candleTime));
                    }
                } else if (_hoveredMarkerTime != null) {
                    hideMarkerTooltip();
                }
            } catch (e) { /* swallow */ }
        });

        // ─── Click Handler — open Trade Replay on marker click ─────────
        try {
            tvChart.subscribeClick(param => {
                try {
                    if (!param || !param.time) return;
                    const candleTime = typeof param.time === 'number' ? param.time : (param.time && param.time.timestamp);
                    if (candleTime == null || !tradeMarkerData.has(candleTime)) return;
                    const contexts = tradeMarkerData.get(candleTime);
                    if (!contexts || !contexts.length) return;
                    // Prefer the close (exit) marker — that's what TradeReplay expects
                    const target = contexts.find(c => c.isClose) || contexts[0];
                    const tr = OGZ && typeof OGZ.get === 'function' ? OGZ.get('TradeReplay') : null;
                    if (tr && typeof tr.openReplay === 'function') {
                        tr.openReplay({
                            symbol: (document.getElementById('cp-assetSelector')?.value) || 'ASSET',
                            side: target.direction,
                            entry: target.isEntry ? target.price : (target.metadata?.entryPrice ?? target.price),
                            exit:  target.isClose ? target.price : null,
                            entryTs: target.tsMs,
                            exitTs:  target.isClose ? target.tsMs : null,
                            pnl: target.pnl,
                            pnlPercent: null,
                            strategy: target.strategy,
                            pattern:  target.pattern,
                            confidence: target.confidence,
                            indicatorsAtEntry: target.indicators,
                            narratorLines: target.narratorText ? [target.narratorText] : []
                        });
                    }
                } catch (_) { /* swallow */ }
            });
        } catch (_) { /* subscribeClick missing in older lightweight-charts versions — swallow */ }

        // Expose for legacy drawing-tools.js
        window.OGZ_chart = tvChart;
        window.tvChart = tvChart;
        window.candleSeries = candleSeries;

        // Bind control events
        ChartPanel.bindControls();

        // Resize handlers
        trackListener(window, 'resize', () => {
            if (tvChart && container) {
                tvChart.resize(container.clientWidth, container.clientHeight);
            }
        });

        if (typeof ResizeObserver !== 'undefined') {
            ChartPanel._chartResizeObserver = new ResizeObserver(() => {
                if (tvChart && container) {
                    tvChart.resize(container.clientWidth, container.clientHeight);
                }
            });
            try {
                ChartPanel._chartResizeObserver.observe(container);
            } catch (e) {
                /* swallow */
            }
        }

        // Unload handler
        trackListener(window, 'beforeunload', () => {
            try { ChartPanel.teardown(); } catch (e) {
                /* swallow */
            }
        });

        return true;
    }

    // ─── WS Wiring State ──────────────────────────────────────────────────
    let _wsBootstrapped = false;
    let _wsBootstrapTimer = null;
    let _entryPriceLine = null;
    let _stopPriceLine = null;
    let _targetPriceLine = null;
    let _lastPositionState = null;
    let _noDataWatchdogTimer = null;   // fix #42: timeframe-change "no data" watchdog

    // Auto-bootstrap historical candles + supplemental WS subscriptions.
    // Core.js routes price/historical_candles/pattern_analysis/depth_update to
    // ChartPanel.update/loadHistorical/plotGhost/renderLiquidity already, but it
    // does NOT route: (a) the initial request_historical handshake, (b) `delta`
    // sub-tick flashes, (c) `trade` markers, (d) `state_update` position lines.
    // Those four are wired here directly against the real socket.registerHandler.
    function bootstrapWS(rootEl) {
        if (_wsBootstrapped) return;
        const socket = OGZ.get('Socket');
        if (!socket || typeof socket.registerHandler !== 'function') {
            // Socket not registered yet — poll once a frame for up to 10s
            _wsBootstrapTimer = trackTimer(setTimeout(() => bootstrapWS(rootEl), 250));
            return;
        }
        _wsBootstrapped = true;

        // (a) Initial historical load + empty-chart watchdog "kick".
        //
        // VERIFIED SERVER BEHAVIOUR (live socket capture, 2026-05-25): the
        // server sends `historical_candles` ONLY in response to an asset_change
        // that is a REAL change. `request_historical` is ignored, and an
        // `asset_change` to the asset already current is a no-op. Proof:
        //   asset_change NVDA -> 200 candles
        //   asset_change TSLA -> 200 candles
        //   asset_change TSLA again -> 0 candles
        // So on a fresh load the chart asks for the default asset, the server
        // already considers it current, and nothing comes back — empty chart.
        //
        // Fix: fire the normal request, then arm a 3s watchdog. If no candles
        // landed, "kick" the server with a guaranteed real change — swap to a
        // different asset and immediately back. The swap-back IS a real change,
        // so the intended asset's history is sent. The kick only runs when the
        // chart would otherwise sit empty, so it is a harmless no-op when the
        // normal path already worked.
        try {
            const sym = rootEl?.querySelector('#cp-assetSelector')?.value || DEFAULT_SYMBOL;
            const tf  = rootEl?.querySelector('#cp-timeframeSelector')?.value || DEFAULT_TIMEFRAME;
            if (typeof socket.send === 'function') {
                socket.send({ type: 'request_historical', timeframe: tf, asset: sym, limit: 500 });
                socket.send({ type: 'asset_change', asset: sym });
            }
            const kickT = trackTimer(setTimeout(() => {
                _trackedTimers.delete(kickT);
                if (storedCandles && storedCandles.length > 0) return;  // candles arrived — no kick needed
                try {
                    const aSel = rootEl?.querySelector('#cp-assetSelector');
                    if (!aSel || typeof socket.send !== 'function') return;
                    const intended = aSel.value;
                    let other = null;
                    const intendedOption = Array.prototype.find.call(
                        aSel.options,
                        opt => opt.value === intended
                    );
                    const intendedGroup = intendedOption ? intendedOption.parentElement : null;
                    if (intendedGroup && intendedGroup.tagName === 'OPTGROUP') {
                        for (let i = 0; i < intendedGroup.children.length; i++) {
                            const v = intendedGroup.children[i].value;
                            if (v && v !== intended) { other = v; break; }
                        }
                    }
                    if (!other) return;
                    socket.send({ type: 'asset_change', asset: other });
                    const backT = trackTimer(setTimeout(() => {
                        _trackedTimers.delete(backT);
                        try { socket.send({ type: 'asset_change', asset: intended }); }
                        catch (e) { /* swallow */ }
                    }, 700));
                } catch (e) { /* swallow */ }
            }, 3000));
        } catch (e) { /* swallow */ }

        // (b) `delta` — sub-tick {price, volume, timestamp} from
        // DashboardBroadcaster.broadcastEdgeAnalytics(). Used to keep the HUD
        // price color/flash alive between full `price` ticks. Bot shape:
        //   { type:'delta', tick:{ price, volume, timestamp } }
        socket.registerHandler('delta', (d) => {
            try {
                const tick = (d && d.tick) ? d.tick : (d || {});
                const p = Number(tick.price);
                if (!isFinite(p) || p <= 0) return;
                // Update only the HUD readout (chart series stays on real candle ticks)
                const priceEl = _cachedPriceEl;
                if (priceEl) {
                    const prev = OGZ.state.lastPrice || p;
                    OGZ.state.lastPriceDelta = p - prev;
                    OGZ.state.lastPrice = p;
                    const up = OGZ.state.lastPriceDelta >= 0;
                    priceEl.textContent = `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    priceEl.style.color = up ? '#22c55e' : '#ef4444';
                    priceEl.style.textShadow = up
                        ? '0 0 12px rgba(34,197,94,0.75)'
                        : '0 0 12px rgba(239,68,68,0.75)';
                }
            } catch (e) { /* swallow */ }
        });

        // (c) `trade` — bot OrderExecutor broadcast. Real shape:
        //   { type:'trade', action:'BUY'|'SELL', direction:'long'|'short',
        //     price, pnl, timestamp, confidence }
        // Drop a marker line at the executed price.
        socket.registerHandler('trade', (d) => {
            try {
                const data = (d && d.data) ? d.data : d;
                if (!data || !isFinite(Number(data.price)) || Number(data.price) <= 0) return;
                // Pass the FULL trade payload so the marker carries all the
                // white-box context (action, direction, pnl, confidence,
                // pattern, strategy, duration) for hover-tooltip rendering.
                ChartPanel.addTradeMarker(data);
            } catch (e) { /* swallow */ }
        });

        // (d) `state_update` — StateManager.broadcastToDashboard. Real shape:
        //   { type:'state_update', source, updates, context,
        //     state:{ position, balance, totalBalance, realizedPnL,
        //             unrealizedPnL, totalPnL, tradeCount, dailyTradeCount,
        //             recoveryMode }, timestamp }
        // Maintain entry/stop/target price lines while a position is open.
        socket.registerHandler('state_update', (d) => {
            try {
                const s = d && d.state ? d.state : {};
                const pos = s.position;
                _lastPositionState = pos || null;

                // Strip stale lines whenever position absent or flat
                const stripLine = (line) => {
                    if (!line || !candleSeries) return null;
                    try { candleSeries.removePriceLine(line); } catch (e) { /* swallow */ }
                    return null;
                };

                if (!pos || pos === 'flat' || pos === 'FLAT' || (typeof pos === 'object' && (pos.size === 0 || !pos.entryPrice))) {
                    _entryPriceLine = stripLine(_entryPriceLine);
                    _stopPriceLine  = stripLine(_stopPriceLine);
                    _targetPriceLine = stripLine(_targetPriceLine);
                    return;
                }

                if (typeof pos !== 'object' || !candleSeries) return;

                const entry = Number(pos.entryPrice || pos.entry || pos.avgPrice);
                const stop  = Number(pos.stopLoss   || pos.stop  || 0);
                const targ  = Number(pos.takeProfit || pos.target|| 0);
                const isLong = String(pos.direction || pos.side || '').toLowerCase() === 'long'
                            || pos === 'long' || pos === 'LONG';

                if (isFinite(entry) && entry > 0) {
                    _entryPriceLine = stripLine(_entryPriceLine);
                    _entryPriceLine = candleSeries.createPriceLine({
                        price: entry,
                        color: isLong ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)',
                        lineWidth: 2,
                        lineStyle: 0,
                        axisLabelVisible: true,
                        title: 'ENTRY ' + (isLong ? 'L' : 'S')
                    });
                }
                if (isFinite(stop) && stop > 0) {
                    _stopPriceLine = stripLine(_stopPriceLine);
                    _stopPriceLine = candleSeries.createPriceLine({
                        price: stop,
                        color: 'rgba(239,68,68,0.55)',
                        lineWidth: 1,
                        lineStyle: 2,
                        axisLabelVisible: true,
                        title: 'STOP'
                    });
                }
                if (isFinite(targ) && targ > 0) {
                    _targetPriceLine = stripLine(_targetPriceLine);
                    _targetPriceLine = candleSeries.createPriceLine({
                        price: targ,
                        color: 'rgba(34,197,94,0.55)',
                        lineWidth: 1,
                        lineStyle: 2,
                        axisLabelVisible: true,
                        title: 'TGT'
                    });
                }
            } catch (e) { /* swallow */ }
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────
    const ChartPanel = {
        /**
         * Initialize: render scaffold, create chart, wire controls,
         * bootstrap WS subscriptions (historical, delta, trade, state_update).
         * Safe to call multiple times (idempotent).
         */
        init: function () {
            try {
                if (!renderScaffold()) return;
                if (!initChart()) return;
                bootstrapWS(document.getElementById(ROOT_ID));

                // Restore oscillator-pane set from last session. The volume pane
                // defaults ON when the key is absent (requested default). Defer
                // to next frame so the main chart finishes initial layout before
                // we add siblings that trigger resize.
                try {
                    const keys = readSavedOscPanes();
                    if (keys.length) {
                        requestAnimationFrame(() => {
                            keys.forEach(k => {
                                try { ChartPanel.addOscPane(k, true); } catch (e) { /* swallow */ }
                                // Keep the indicator checkbox UI coherent: an
                                // rsi/macd/atr pane restored from LS should show
                                // its checkbox ticked (volume is the Split button).
                                if (k === 'rsi' || k === 'macd' || k === 'atr') {
                                    try {
                                        const root = document.getElementById(ROOT_ID);
                                        const chk = root && root.querySelector(
                                            '#cp-indicatorCheckboxes input[value="' + k + '"]');
                                        if (chk) {
                                            chk.checked = true;
                                            if (activeOverlays.indexOf(k) === -1) activeOverlays.push(k);
                                        }
                                    } catch (e) { /* swallow */ }
                                }
                            });
                            try { ChartPanel._applyLayout(); } catch (e) { /* swallow */ }
                        });
                    }
                } catch (e) { /* swallow */ }

                // ─── FIX #41: subscribe to watchlist:select ──────────────
                // Clicking a watchlist ticker emits {symbol, broker}. Switch
                // the chart by reusing the same asset-switch sequence the
                // #cp-assetSelector dropdown uses.
                try {
                    if (OGZ && OGZ.bus && typeof OGZ.bus.on === 'function') {
                        OGZ.bus.on('watchlist:select', (payload) => {
                            try {
                                const sym = payload && payload.symbol
                                    ? String(payload.symbol)
                                    : (typeof payload === 'string' ? payload : null);
                                if (sym) ChartPanel.switchAsset(sym);
                            } catch (e) { /* swallow */ }
                        });
                    }
                } catch (e) { /* swallow */ }
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Apply layout for the stacked oscillator-pane system.
         *
         * Oscillators (RSI/MACD/ATR/volume) now each live in their OWN aux
         * LightweightCharts instance (separate DOM panes below the main chart),
         * so they no longer share the main chart's price scales. This method:
         *   - keeps the main chart's `right`/`vol` scales sized correctly
         *     (the in-chart `vol` histogram strip is hidden whenever the
         *     volume pane is split out, so the price scale can use full height)
         *   - divides the aux-pane DOM heights evenly across whatever
         *     oscillator panes are currently active.
         *
         * Accepts no argument; reads `_oscPanes` directly. The legacy boolean
         * arg is ignored for back-compat with any stray caller.
         */
        _applyLayout: function () {
            if (!tvChart) return;
            const volSplitOut = !!_oscPanes['volume'];
            try {
                if (volSplitOut) {
                    // Volume lives in its own pane — give the price chart full height.
                    tvChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.06 } });
                    tvChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.999, bottom: 0 } });
                } else {
                    // Volume rides inside the main chart as a bottom strip.
                    tvChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
                    tvChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
                }
            } catch (e) { /* swallow */ }

            // Divide vertical space across the active aux panes. Each pane is a
            // fixed-height DOM block; we scale that height down as more panes
            // stack so the price chart keeps a reasonable share.
            try {
                const activeKeys = OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
                const n = activeKeys.length;
                if (n > 0) {
                    // #49: oscillator panes were too short to read — with all
                    // 4 active each was ~90px, unusable even on a large monitor.
                    // Raised the floor so each pane stays legible: 1 → 160px,
                    // otherwise 480/n floored at 130px (2 → 240, 3 → 160, 4 → 130).
                    const perPane = n <= 1 ? 160 : Math.max(130, Math.round(480 / n));
                    activeKeys.forEach(k => {
                        const entry = _oscPanes[k];
                        if (entry && entry.container) {
                            entry.container.style.height = perPane + 'px';
                            if (entry.chart) {
                                try { entry.chart.resize(entry.container.clientWidth, perPane); }
                                catch (e) { /* swallow */ }
                            }
                        }
                    });
                }
                // Main chart shares the remaining space — let its ResizeObserver
                // pick up the flex re-layout.
                const mainContainer = document.getElementById('tvChartContainer');
                if (mainContainer) {
                    try { tvChart.resize(mainContainer.clientWidth, mainContainer.clientHeight); }
                    catch (e) { /* swallow */ }
                }
            } catch (e) { /* swallow */ }
        },

        /**
         * Bind control events (selectors, checkboxes, etc.).
         */
        bindControls: function () {
            const root = document.getElementById(ROOT_ID);
            if (!root) return;

            // Chart type selector
            const chartType = root.querySelector('#cp-chartTypeSelector');
            if (chartType) trackListener(chartType, 'change', (e) => {
                const type = e.target.value;
                if (this._lineSeries) this._lineSeries.applyOptions({ visible: false });
                if (this._areaSeries) this._areaSeries.applyOptions({ visible: false });
                if (this._barSeries) this._barSeries.applyOptions({ visible: false });

                if (type === 'candlestick') {
                    candleSeries.applyOptions({ visible: true });
                } else {
                    candleSeries.applyOptions({ visible: false });
                    let data = [];
                    try { data = candleSeries.data ? candleSeries.data() : []; } catch (err) { }

                    if (type === 'line') {
                        if (!this._lineSeries) this._lineSeries = tvChart.addLineSeries({ color: '#22c55e', lineWidth: 2 });
                        if (data.length) this._lineSeries.setData(data.map(d => ({ time: d.time, value: d.close })));
                        this._lineSeries.applyOptions({ visible: true });
                    } else if (type === 'area') {
                        if (!this._areaSeries) this._areaSeries = tvChart.addAreaSeries({
                            topColor: 'rgba(34, 197, 94, 0.4)', bottomColor: 'rgba(34, 197, 94, 0.0)',
                            lineColor: '#22c55e', lineWidth: 2
                        });
                        if (data.length) this._areaSeries.setData(data.map(d => ({ time: d.time, value: d.close })));
                        this._areaSeries.applyOptions({ visible: true });
                    } else if (type === 'bar') {
                        if (!this._barSeries) this._barSeries = tvChart.addBarSeries({
                            upColor: '#22c55e', downColor: '#ef4444'
                        });
                        if (data.length) this._barSeries.setData(data);
                        this._barSeries.applyOptions({ visible: true });
                    }
                }
            });

            // Asset selector — delegate to the shared switchAsset() sequence
            // so the dropdown and the watchlist:select bus event (fix #41)
            // share ONE code path.
            const assetSel = root.querySelector('#cp-assetSelector');
            if (assetSel) trackListener(assetSel, 'change', (e) => {
                this.switchAsset(e.target.value);
            });

            // Timeframe selector — fix #42: do NOT call clearAll() preemptively.
            // The incoming `historical_candles` handler (loadHistorical) does a
            // full setData() replace, so blanking the chart first only risks a
            // silent black void if the response is slow/empty. Instead we arm a
            // ~5s watchdog that surfaces a visible "No data" message.
            const tfSel = root.querySelector('#cp-timeframeSelector');
            if (tfSel) trackListener(tfSel, 'change', (e) => {
                const socket = OGZ.get('Socket');
                if (socket) {
                    socket.send({ type: 'timeframe_change', timeframe: e.target.value });
                    socket.send({
                        type: 'request_historical',
                        timeframe: e.target.value,
                        asset: root.querySelector('#cp-assetSelector')?.value || DEFAULT_SYMBOL,
                        limit: 500
                    });
                    this._armNoDataWatchdog();
                }
            });

            // Indicator checkboxes
            const checkboxContainer = root.querySelector('#cp-indicatorCheckboxes');
            if (checkboxContainer) {
                checkboxContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
                    trackListener(chk, 'change', () => {
                        activeOverlays = [];
                        checkboxContainer.querySelectorAll('input:checked').forEach(c => activeOverlays.push(c.value));
                        this.toggleIndicators(activeOverlays);
                        if (storedCandles.length > 0) this.calculateIndicators(storedCandles);
                    });
                });
            }
        },

        /**
         * Switch the chart to a new asset/symbol (fix #41).
         *
         * This is the SINGLE asset-switch code path, shared by:
         *   - the #cp-assetSelector dropdown 'change' handler, and
         *   - the OGZ.bus 'watchlist:select' subscription.
         *
         * Sequence (identical to the legacy dropdown behavior):
         *   1. send `asset_change`
         *   2. clearAll() — blank the chart
         *   3. after 500ms, send `request_historical` for the new asset
         *
         * Guards: if `symbol` is not a valid <option> of #cp-assetSelector,
         * the call is ignored. Keeps the dropdown's `.value` in sync so the
         * UI reflects the active symbol regardless of how the switch began.
         */
        switchAsset: function (symbol) {
            const root = document.getElementById(ROOT_ID);
            if (!root) return;
            const assetSel = root.querySelector('#cp-assetSelector');
            if (!assetSel) return;

            let sym = String(symbol || '').trim();
            if (!sym) return;

            // #48: the watchlist emits BARE symbols ('BTC', 'ETH', 'TSLA'...).
            // Stock symbols already equal the selector option values; crypto in
            // the selector uses the server's required '-USD' form (verified via
            // live socket — the server's asset_change accepts 'BTC-USD' and
            // returns nothing for bare 'BTC'). So if the bare symbol is not a
            // valid option, try its '-USD' form before giving up.
            const optionExists = (v) => Array.prototype.some.call(
                assetSel.options, opt => opt.value === v
            );
            if (!optionExists(sym) && optionExists(sym + '-USD')) {
                sym = sym + '-USD';
            }
            if (!optionExists(sym)) return;   // genuinely unknown symbol — ignore

            // No-op if we're already on this asset.
            if (assetSel.value === sym) return;

            // Keep the dropdown in sync with the new symbol.
            assetSel.value = sym;

            const socket = OGZ.get('Socket');
            if (!socket) return;
            try { socket.send({ type: 'asset_change', asset: sym }); } catch (e) { /* swallow */ }
            this.clearAll();
            const tid = setTimeout(() => {
                _trackedTimers.delete(tid);
                const tf = root.querySelector('#cp-timeframeSelector')?.value || DEFAULT_TIMEFRAME;
                try { socket.send({ type: 'request_historical', timeframe: tf, asset: sym, limit: 500 }); }
                catch (e) { /* swallow */ }
            }, 500);
            trackTimer(tid);
        },

        /**
         * Arm a watchdog after a timeframe change (fix #42). If no
         * `historical_candles` arrive within ~5s, surface a visible
         * "No data for this timeframe" message instead of a silent void.
         * loadHistorical() clears the watchdog on the next data arrival.
         */
        _armNoDataWatchdog: function () {
            this._clearNoDataWatchdog();
            const tid = setTimeout(() => {
                _trackedTimers.delete(tid);
                _noDataWatchdogTimer = null;
                try {
                    const pill = document.getElementById('feedStatusPill');
                    if (pill) {
                        pill.textContent = 'No data for this timeframe';
                        pill.style.display = 'block';
                    }
                } catch (e) { /* swallow */ }
            }, 5000);
            _noDataWatchdogTimer = tid;
            trackTimer(tid);
        },

        /**
         * Clear the no-data watchdog and hide the warning pill if it was
         * raised by the watchdog.
         */
        _clearNoDataWatchdog: function () {
            if (_noDataWatchdogTimer) {
                try { clearTimeout(_noDataWatchdogTimer); } catch (e) { /* swallow */ }
                _trackedTimers.delete(_noDataWatchdogTimer);
                _noDataWatchdogTimer = null;
            }
            try {
                const pill = document.getElementById('feedStatusPill');
                if (pill && pill.textContent === 'No data for this timeframe') {
                    pill.style.display = 'none';
                }
            } catch (e) { /* swallow */ }
        },

        /**
         * Toggle indicator visibility and recalculate layout.
         */
        toggleIndicators: function (active) {
            // ─── Price-chart overlays (unchanged) ───────────────────────
            // EMA / SMA / Bollinger / VWAP / Ichimoku / trendlines /
            // fibonacci / sr are correct price overlays — they stay on the
            // main chart exactly as before.
            ema20Series.applyOptions({ visible: active.includes('ema') });
            ema50Series.applyOptions({ visible: active.includes('ema') });
            ema200Series.applyOptions({ visible: active.includes('ema') });
            bbUpperSeries.applyOptions({ visible: active.includes('bollinger') });
            bbMiddleSeries.applyOptions({ visible: active.includes('bollinger') });
            bbLowerSeries.applyOptions({ visible: active.includes('bollinger') });
            vwapSeries.applyOptions({ visible: active.includes('vwap') });
            sma20Series.applyOptions({ visible: active.includes('sma') });
            sma50Series.applyOptions({ visible: active.includes('sma') });
            sma200Series.applyOptions({ visible: active.includes('sma') });
            this._ichiTenkan.applyOptions({ visible: active.includes('ichimoku') });
            this._ichiKijun.applyOptions({ visible: active.includes('ichimoku') });
            this._ichiSenkouA.applyOptions({ visible: active.includes('ichimoku') });
            this._ichiSenkouB.applyOptions({ visible: active.includes('ichimoku') });
            this._trendResistance.applyOptions({ visible: active.includes('trendlines') });
            this._trendSupport.applyOptions({ visible: active.includes('trendlines') });

            // ─── Oscillators (fix #42) ──────────────────────────────────
            // RSI / MACD / ATR are no longer main-chart overlays — each
            // toggles its own stacked aux pane. The legacy main-chart series
            // rsiOverlaySeries/macdLineSeries/macdSignalSeries/atrSeries are
            // intentionally left hidden + unfed.
            ['rsi', 'macd', 'atr'].forEach(key => {
                if (active.includes(key)) {
                    if (!_oscPanes[key]) this.addOscPane(key);
                } else {
                    if (_oscPanes[key]) this.removeOscPane(key);
                }
            });

            this._fibLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch (e) { } });
            this._fibLines = [];
            this._srLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch (e) { } });
            this._srLines = [];

            this._applyLayout();
        },

        /**
         * Calculate and render indicator overlays from stored candles.
         */
        calculateIndicators: function (candles) {
            if (!candles || candles.length < MIN_INDICATOR_CANDLES) return;
            const Ind = OGZ.get('Indicators');
            if (!Ind) return;

            const closes = candles.map(c => c.close);
            const times = candles.map(c => c.time);
            const mapSeries = (values) => values.map((v, i) => v != null ? { time: times[i], value: v } : null).filter(Boolean);

            try {
                const ema20 = Ind.calculateEMA(closes, 20);
                const ema50 = Ind.calculateEMA(closes, 50);
                const ema200 = Ind.calculateEMA(closes, 200);
                ema20Series.setData(mapSeries(ema20));
                ema50Series.setData(mapSeries(ema50));
                ema200Series.setData(mapSeries(ema200));

                const sma20 = Ind.calculateSMA(closes, 20);
                const sma50 = Ind.calculateSMA(closes, 50);
                const sma200 = Ind.calculateSMA(closes, 200);
                sma20Series.setData(mapSeries(sma20));
                sma50Series.setData(mapSeries(sma50));
                sma200Series.setData(mapSeries(sma200));

                const bb = Ind.calculateBollinger(closes, 20, 2);
                bbUpperSeries.setData(mapSeries(bb.upper));
                bbMiddleSeries.setData(mapSeries(bb.middle));
                bbLowerSeries.setData(mapSeries(bb.lower));

                const vwap = Ind.calculateVWAP(candles);
                vwapSeries.setData(mapSeries(vwap));

                // ─── Oscillator panes (fix #42) ─────────────────────────
                // RSI / ATR computed data is routed into their aux panes
                // when active. The legacy main-chart series stay unfed.
                if (_oscPanes['rsi'] && _oscPanes['rsi'].series && _oscPanes['rsi'].series.rsi) {
                    const rsi = Ind.calculateRSI(closes, 14);
                    try { _oscPanes['rsi'].series.rsi.setData(mapSeries(rsi)); } catch (e) { /* swallow */ }
                }

                if (_oscPanes['atr'] && _oscPanes['atr'].series && _oscPanes['atr'].series.atr) {
                    const atr = Ind.calculateATR(candles, 14);
                    try { _oscPanes['atr'].series.atr.setData(mapSeries(atr)); } catch (e) { /* swallow */ }
                }

                if (activeOverlays.includes('trendlines')) {
                    const trendLines = Ind.calculateTrendLines(candles);
                    trendLines.forEach(tl => {
                        if (tl.type === 'resistance') this._trendResistance.setData(tl.points);
                        if (tl.type === 'support') this._trendSupport.setData(tl.points);
                    });
                }

                if (_oscPanes['macd'] && _oscPanes['macd'].series) {
                    const macd = Ind.calculateMACD(closes);
                    try {
                        if (_oscPanes['macd'].series.macd) _oscPanes['macd'].series.macd.setData(mapSeries(macd.macd));
                        if (_oscPanes['macd'].series.signal) _oscPanes['macd'].series.signal.setData(mapSeries(macd.signal));
                    } catch (e) { /* swallow */ }
                }

                const ichi = Ind.calculateIchimoku(candles);
                this._ichiTenkan.setData(mapSeries(ichi.tenkan));
                this._ichiKijun.setData(mapSeries(ichi.kijun));
                this._ichiSenkouA.setData(mapSeries(ichi.senkouA));
                this._ichiSenkouB.setData(mapSeries(ichi.senkouB));

                if (activeOverlays.includes('fibonacci')) {
                    const fibColors = ['#00cc00', '#33cc33', '#66cc66', '#999900', '#cc6600', '#cc3300', '#cc0000'];
                    const fibs = Ind.calculateFibonacci(candles);
                    fibs.forEach((f, i) => {
                        const line = candleSeries.createPriceLine({
                            price: f.price, color: fibColors[i] || '#888',
                            lineWidth: 1, lineStyle: 2, axisLabelVisible: true,
                            title: `Fib ${f.label}`
                        });
                        this._fibLines.push(line);
                    });
                }

                if (activeOverlays.includes('sr')) {
                    const sr = Ind.calculateSupportResistance(candles);
                    sr.forEach(level => {
                        const line = candleSeries.createPriceLine({
                            price: level.price,
                            color: level.type === 'resistance' ? '#ef4444' : '#22c55e',
                            lineWidth: 1, lineStyle: 2, axisLabelVisible: true,
                            title: `${level.type === 'resistance' ? 'R' : 'S'} (${level.strength})`
                        });
                        this._srLines.push(line);
                    });
                }
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Clear all chart data (candles, volume, indicators, markers).
         */
        clearAll: function () {
            if (candleSeries) candleSeries.setData([]);
            if (volumeSeries) volumeSeries.setData([]);
            if (this._lineSeries) this._lineSeries.setData([]);
            if (this._areaSeries) this._areaSeries.setData([]);
            if (this._barSeries) this._barSeries.setData([]);
            if (ghostSeries) ghostSeries.setData([]);

            wallLines.forEach(l => {
                try { candleSeries.removePriceLine(l); }
                catch (e) { /* swallow */ }
            });
            tpoLines.forEach(l => {
                try { candleSeries.removePriceLine(l); }
                catch (e) { /* swallow */ }
            });
            wallLines = []; tpoLines = [];

            removeRsiBands(this);
        },

        /**
         * Explicit teardown: remove listeners, timers, subscriptions, chart instance.
         */
        teardown: function () {
            for (const tid of _trackedTimers) {
                try { clearTimeout(tid); } catch (e) { /* swallow */ }
            }
            _trackedTimers.clear();

            for (const { target, type, handler } of _trackedListeners) {
                try { target.removeEventListener(type, handler); }
                catch (e) { /* swallow */ }
            }
            _trackedListeners.length = 0;

            if (_trackedVisibleRangeCB && tvChart && tvChart.timeScale) {
                try { tvChart.timeScale().unsubscribeVisibleLogicalRangeChange(_trackedVisibleRangeCB); }
                catch (e) { /* swallow */ }
                _trackedVisibleRangeCB = null;
            }

            removeRsiBands(this);
            _trackedRsiSeries = null;
            this._rsiOverlaySeries = null;

            _cachedPriceEl = null;
            _cachedHudPrice = null;
            _cachedHudOhlc = null;
            _cachedTooltipEl = null;

            if (this._chartResizeObserver) {
                try { this._chartResizeObserver.disconnect(); }
                catch (e) { /* swallow */ }
            }

            // Strip position lines (they live on candleSeries which is about to be nulled)
            const _strip = (line) => {
                if (!line || !candleSeries) return null;
                try { candleSeries.removePriceLine(line); } catch (e) { /* swallow */ }
                return null;
            };
            _entryPriceLine = _strip(_entryPriceLine);
            _stopPriceLine  = _strip(_stopPriceLine);
            _targetPriceLine = _strip(_targetPriceLine);
            _lastPositionState = null;

            // Note: websocket.js does not currently expose unregisterHandler,
            // so the delta/trade/state_update subs we registered survive teardown.
            // They will no-op safely because candleSeries is null below.
            _wsBootstrapped = false;

            // Tear down ALL active oscillator panes BEFORE nulling tvChart
            // (removeOscPane needs tvChart to unsubscribe the crosshair sub).
            // We preserve the persisted active-set in LS so the panes
            // auto-restore on the next init(): snapshot it first, then
            // restore it after the removeOscPane calls (which would otherwise
            // re-persist an empty set).
            try {
                const savedSet = OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
                OSC_PANE_ORDER.slice().forEach(k => {
                    if (_oscPanes[k]) {
                        try { ChartPanel.removeOscPane(k); } catch (e) { /* swallow */ }
                    }
                });
                if (savedSet.length) {
                    try { localStorage.setItem(OSC_PANE_LS_KEY, JSON.stringify(savedSet)); }
                    catch (e) { /* swallow */ }
                }
            } catch (e) { /* swallow */ }
            _oscPanes = {};
            _oscMainRangeCB = null;
            _oscSyncing = false;

            // Clear the timeframe-change watchdog if still pending.
            try { ChartPanel._clearNoDataWatchdog(); } catch (e) { /* swallow */ }

            tvChart = null;

            candleSeries = null;
            volumeSeries = null;
            ghostSeries = null;
            storedCandles = [];
            activeOverlays = [];
            tradeMarkers.clear();
            tradeMarkerData.clear();
            if (_markerTooltipEl) {
                try { _markerTooltipEl.remove(); } catch (e) { /* swallow */ }
                _markerTooltipEl = null;
            }
            _hoveredMarkerTime = null;
        },

        /**
         * Handle live price ticks: update candles, volume, price flash, HUD.
         */
        update: function (d) {
            if (!candleSeries) return;
            const candle = d.candle || d;
            const price = candle.close || candle.c;
            const open = candle.open || candle.o;
            const high = candle.high || candle.h;
            const low = candle.low || candle.l;
            const rawMs = candle.timestamp || candle.t || Date.now();
            const t = Math.floor(rawMs / 1000);
            const bucket = currentBucketSeconds();
            const timeAligned = Math.floor(t / bucket) * bucket;

            let tickOpen = open, tickHigh = high, tickLow = low, tickClose = price;
            if (price != null && (open == null || high == null || low == null)) {
                const last = storedCandles[storedCandles.length - 1];
                if (last && last.time === timeAligned) {
                    tickOpen = last.open;
                    tickHigh = Math.max(last.high, price);
                    tickLow = Math.min(last.low, price);
                    tickClose = price;
                    last.high = tickHigh; last.low = tickLow; last.close = tickClose;
                } else if (price != null) {
                    tickOpen = tickHigh = tickLow = tickClose = price;
                    storedCandles.push({ time: timeAligned, open: price, high: price, low: price, close: price, volume: 0 });
                }
            } else if (open != null) {
                const last = storedCandles[storedCandles.length - 1];
                if (last && last.time === timeAligned) {
                    last.open = open; last.high = high; last.low = low; last.close = price;
                } else {
                    storedCandles.push({ time: timeAligned, open, high, low, close: price, volume: candle.volume || candle.v || 0 });
                }
            }

            if (tickClose != null) {
                candleSeries.update({
                    time: timeAligned,
                    open: tickOpen,
                    high: tickHigh,
                    low: tickLow,
                    close: tickClose
                });
            }

            if (candle.volume || candle.v) {
                const up = tickClose >= tickOpen;
                let liveAlpha = VOL_LIVE_ALPHA_DEFAULT;
                if (storedCandles.length > MIN_VOLUME_STATS_CANDLES) {
                    const sortedVols = storedCandles.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
                    const capVol = sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * VOL_CAP_PCTILE) - 1)] || 1;
                    const ratio = Math.min(1, (candle.volume || candle.v) / capVol);
                    liveAlpha = VOL_ALPHA_FLOOR + VOL_ALPHA_RANGE * ratio;
                }
                const rgb = up ? '34,197,94' : '239,68,68';
                const volEntry = {
                    time: timeAligned,
                    value: candle.volume || candle.v,
                    color: `rgba(${rgb},${liveAlpha.toFixed(3)})`
                };
                volumeSeries.update(volEntry);
                // Mirror live volume tick into the volume pane when active.
                const volPane = _oscPanes['volume'];
                if (volPane && volPane.series && volPane.series.volume) {
                    try { volPane.series.volume.update(volEntry); } catch (e) { /* swallow */ }
                }
            }

            // Feed live RSI/MACD/ATR into their panes (recomputed from the
            // updated storedCandles window). Cheap enough at tick cadence —
            // the same indicator math the panel already runs on every toggle.
            if ((_oscPanes['rsi'] || _oscPanes['macd'] || _oscPanes['atr'])
                && storedCandles.length >= MIN_INDICATOR_CANDLES) {
                feedOscIndicatorPanes(storedCandles);
            }

            if (price != null) {
                OGZ.state.lastPriceDelta = price - OGZ.state.lastPrice;
                OGZ.state.lastPrice = price;
                const up = OGZ.state.lastPriceDelta >= 0;
                const flashColor = up ? '#22c55e' : '#ef4444';
                const flashShadow = up ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)';

                const priceEl = _cachedPriceEl;
                if (priceEl) {
                    priceEl.textContent = `$${price.toLocaleString()}`;
                    priceEl.style.color = flashColor;
                    priceEl.style.textShadow = `0 0 12px ${flashShadow}`;
                    if (priceEl._flashTimer) {
                        clearTimeout(priceEl._flashTimer);
                        _trackedTimers.delete(priceEl._flashTimer);
                    }
                    priceEl._flashTimer = setTimeout(() => {
                        _trackedTimers.delete(priceEl._flashTimer);
                        priceEl._flashTimer = null;
                        priceEl.style.textShadow = '';
                    }, PRICE_FLASH_MS);
                    trackTimer(priceEl._flashTimer);
                }

                const hudPrice = _cachedHudPrice;
                if (hudPrice) {
                    hudPrice.textContent = `$${Number(price).toFixed(2)}`;
                    hudPrice.style.color = flashColor;
                    hudPrice.style.textShadow = `0 0 14px ${flashShadow}`;
                    if (hudPrice._flashTimer) {
                        clearTimeout(hudPrice._flashTimer);
                        _trackedTimers.delete(hudPrice._flashTimer);
                    }
                    hudPrice._flashTimer = setTimeout(() => {
                        _trackedTimers.delete(hudPrice._flashTimer);
                        hudPrice._flashTimer = null;
                        hudPrice.style.textShadow = `0 0 6px ${flashShadow}`;
                    }, PRICE_FLASH_MS);
                    trackTimer(hudPrice._flashTimer);
                }

                const hudOhlc = _cachedHudOhlc;
                if (hudOhlc) {
                    if (storedCandles.length) {
                        const lc = storedCandles[storedCandles.length - 1];
                        hudOhlc.textContent = `O ${lc.open.toFixed(2)}  H ${lc.high.toFixed(2)}  L ${lc.low.toFixed(2)}  C ${lc.close.toFixed(2)}`;
                        const hud = hudOhlc.parentElement;
                        if (hud && hud.style.visibility !== 'visible') {
                            hud.style.visibility = 'visible';
                        }
                    }
                }
            }
        },

        /**
         * Render ghost projection path (ML).
         */
        plotGhost: function (path) {
            if (ghostSeries && path && path.length > 0) {
                ghostSeries.setData(path);
            }
        },

        /**
         * Render TPO/liquidity overlay (gate-guarded).
         */
        renderLiquidity: function (data) {
            if (!candleSeries) return;
            if (!data.isLive) return;

            wallLines.forEach(l => {
                try { candleSeries.removePriceLine(l); }
                catch (e) { /* swallow */ }
            });
            tpoLines.forEach(l => {
                try { candleSeries.removePriceLine(l); }
                catch (e) { /* swallow */ }
            });
            wallLines = []; tpoLines = [];

            if (data.density) {
                data.density.forEach(level => {
                    const line = candleSeries.createPriceLine({
                        price: level.price,
                        color: `rgba(220, 38, 38, ${Math.min(level.weight * 0.01, 0.15)})`,
                        lineWidth: 1, lineStyle: 0, axisLabelVisible: false
                    });
                    tpoLines.push(line);
                });
            }

            if (data.walls) {
                data.walls.forEach(wall => {
                    const color = wall.side === 'BID' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                    const line = candleSeries.createPriceLine({
                        price: wall.price, color: color,
                        lineWidth: 3, lineStyle: 0, axisLabelVisible: true,
                        title: `$${(wall.size / 1000000).toFixed(1)}M`
                    });
                    wallLines.push(line);
                });
            }
        },

        /**
         * Load historical candles and recalculate indicators.
         */
        loadHistorical: function (candles) {
            if (!candleSeries || !candles || candles.length === 0) return;
            try {
                const formatted = candles.map(c => {
                    const rawTime = c.time || c.t || c.timestamp || 0;
                    const time = Math.floor(rawTime / (rawTime > 1e12 ? 1000 : 1));
                    return {
                        time,
                        open: c.open || c.o || 0,
                        high: c.high || c.h || 0,
                        low: c.low || c.l || 0,
                        close: c.close || c.c || 0,
                        volume: c.volume || c.v || 0
                    };
                }).filter(c => c.time > 0 && c.open > 0);

                if (formatted.length === 0) return;

                candleSeries.setData(formatted.map(c => ({
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
                })));

                if (volumeSeries) {
                    const sortedVols = formatted.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
                    const capVol = sortedVols.length
                        ? sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * VOL_CAP_PCTILE) - 1)]
                        : 1;
                    const volData = formatted.map(c => {
                        const up = c.close >= c.open;
                        const ratio = capVol > 0 ? Math.min(1, (c.volume || 0) / capVol) : 0;
                        const alpha = VOL_ALPHA_FLOOR + VOL_ALPHA_RANGE * ratio;
                        const rgb = up ? '34,197,94' : '239,68,68';
                        return { time: c.time, value: c.volume, color: `rgba(${rgb},${alpha.toFixed(3)})` };
                    });
                    volumeSeries.setData(volData);
                    // Mirror full historical volume into the volume pane when active.
                    const volPane = _oscPanes['volume'];
                    if (volPane && volPane.series && volPane.series.volume) {
                        try { volPane.series.volume.setData(volData); } catch (e) { /* swallow */ }
                    }
                }

                storedCandles = formatted;

                // fix #42: real data arrived — cancel the timeframe-change watchdog.
                this._clearNoDataWatchdog();

                if (activeOverlays.length > 0) this.calculateIndicators(formatted);

                // Feed any active RSI/MACD/ATR panes with the fresh history.
                feedOscIndicatorPanes(formatted);

                if (tvChart) {
                    try {
                        tvChart.priceScale('right').applyOptions({ autoScale: true });
                        // fitContent() spreads the whole loaded batch evenly
                        // across the full chart width. The old scrollToRealTime()
                        // call right after it FOUGHT that — it jumped the
                        // viewport to the live edge at the default narrow bar
                        // spacing, so the batch ended up jammed into the right
                        // ~40% of the x-axis with dead space on the left.
                        // fitContent() alone is correct for a one-shot
                        // historical load; live-follow on streaming candles is
                        // handled separately by the per-tick update path.
                        tvChart.timeScale().fitContent();
                    } catch (e) { /* swallow */ }
                }
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Add a rich trade marker. Accepts either:
         *   - (price, time, side)           — legacy 3-arg form (no rich tooltip)
         *   - (tradeData)                   — preferred: full bot trade payload
         *
         * Rich tradeData shape (from OrderExecutor broadcast):
         *   { action:'BUY'|'SELL'|'SELL_SHORT'|'COVER',
         *     direction:'long'|'short', price, pnl, timestamp, confidence,
         *     duration?, pattern?, strategy? }
         *
         * Uses LightweightCharts' native setMarkers() — hover/click are
         * detected via the crosshair callback in initChart(), which reads
         * tradeMarkerData (a Map keyed by candle-time-seconds) to render
         * the floating trade tooltip card.
         */
        addTradeMarker: function (arg1, arg2, arg3) {
            if (!candleSeries) return;

            // Normalize input into a trade-data object
            let td;
            if (typeof arg1 === 'object' && arg1 !== null) {
                td = arg1;
            } else {
                td = {
                    price: Number(arg1),
                    timestamp: Number(arg2) * 1000,
                    action: arg3 === 'SHORT' ? 'SELL_SHORT' : arg3 === 'EXIT' ? 'SELL' : 'BUY',
                    direction: arg3 === 'SHORT' ? 'short' : 'long'
                };
            }
            const price = Number(td.price);
            const tsMs  = Number(td.timestamp) || Date.now();
            const tsSec = Math.floor((tsMs > 1e12 ? tsMs : tsMs * 1000) / 1000);
            if (!isFinite(price) || price <= 0) return;

            const action = String(td.action || '').toUpperCase();
            const direction = String(td.direction || (action === 'SELL_SHORT' || action === 'COVER' ? 'short' : 'long')).toLowerCase();
            const isEntry = action === 'BUY' || action === 'SELL_SHORT';
            const isClose = action === 'SELL' || action === 'COVER';
            const pnl = Number(td.pnl) || 0;
            const win = isClose && pnl > 0;
            const loss = isClose && pnl < 0;

            // Marker visual config
            let position, color, shape, text;
            if (isEntry) {
                position = direction === 'short' ? 'aboveBar' : 'belowBar';
                color    = direction === 'short' ? '#ff6b8a' : '#22c55e';
                shape    = direction === 'short' ? 'arrowDown' : 'arrowUp';
                text     = direction === 'short' ? 'S' : 'L';
            } else if (isClose) {
                position = direction === 'short' ? 'belowBar' : 'aboveBar';
                shape    = win ? 'circle' : (loss ? 'square' : 'circle');
                color    = win ? '#22c55e' : (loss ? '#ef4444' : '#9ca3af');
                const sign = pnl >= 0 ? '+' : '';
                text     = `${sign}$${Math.abs(pnl).toFixed(0)}`;
            } else {
                position = 'belowBar';
                color    = '#9ca3af';
                shape    = 'circle';
                text     = '·';
            }

            const markerObj = { time: tsSec, position, color, shape, text, size: 1 };
            const key = `${tsSec}:${action}:${price.toFixed(2)}`;

            // Idempotency: skip exact duplicates (same second + action + price)
            if (tradeMarkers.has(key)) return;

            tradeMarkers.set(key, markerObj);

            // Stash full context for tooltip / click
            const ctxEntry = {
                key,
                time: tsSec,
                price,
                action,
                direction,
                pnl,
                isEntry,
                isClose,
                win,
                loss,
                confidence: td.confidence != null ? Number(td.confidence) : null,
                pattern:    td.pattern || null,
                strategy:   td.strategy || null,
                duration:   td.duration || null,
                narratorText: td.narratorText || null,
                indicators: td.indicators || null,
                tsMs
            };
            if (!tradeMarkerData.has(tsSec)) tradeMarkerData.set(tsSec, []);
            tradeMarkerData.get(tsSec).push(ctxEntry);

            // Push to chart
            const sorted = Array.from(tradeMarkers.values()).sort((a, b) => a.time - b.time);
            try { candleSeries.setMarkers(sorted); } catch (e) { /* swallow */ }
        },

        /**
         * Remove all trade markers.
         */
        clearMarkers: function () {
            tradeMarkers.clear();
            tradeMarkerData.clear();
            try { if (candleSeries) candleSeries.setMarkers([]); } catch (e) { /* swallow */ }
            hideMarkerTooltip();
        },

        /**
         * Get chart instance (for drawing-tools.js etc).
         */
        getChart: () => tvChart,

        /**
         * Re-sync the single main→pane time-axis subscription. The main
         * chart has ONE range-change callback; it pushes the range into
         * every active pane. Bottom→top sync is wired per-pane in
         * _buildOscPane(). All sync paths share the `_oscSyncing` guard.
         */
        _ensureOscMainRangeSub: function () {
            if (_oscMainRangeCB || !tvChart) return;
            _oscMainRangeCB = (range) => {
                if (_oscSyncing || !range) return;
                _oscSyncing = true;
                try {
                    OSC_PANE_ORDER.forEach(k => {
                        const entry = _oscPanes[k];
                        if (entry && entry.chart) {
                            try { entry.chart.timeScale().setVisibleLogicalRange(range); }
                            catch (e) { /* swallow */ }
                        }
                    });
                } finally {
                    setTimeout(() => { _oscSyncing = false; }, 0);
                }
            };
            try { tvChart.timeScale().subscribeVisibleLogicalRangeChange(_oscMainRangeCB); }
            catch (e) { /* swallow */ }
        },

        /**
         * Build ONE aux LightweightCharts pane for a given oscillator key.
         * Shared by addOscPane(). Wires per-pane bottom→top time-axis sync,
         * main→pane crosshair sync, and a ResizeObserver. Returns the pane
         * registry entry, or null on failure.
         *
         * v4 only — each pane is a separate createChart() instance, the same
         * proven pattern the old single volume pane used.
         */
        _buildOscPane: function (key) {
            const spec = OSC_PANE_SPEC[key];
            if (!spec || !tvChart || typeof LightweightCharts === 'undefined') return null;
            const mainContainer = document.getElementById('tvChartContainer');
            if (!mainContainer || !mainContainer.parentElement) return null;

            // Build the pane container.
            const container = document.createElement('div');
            container.className = 'cp-osc-pane';
            container.dataset.oscKey = key;
            const label = document.createElement('div');
            label.className = 'cp-osc-label';
            label.textContent = spec.label;
            container.appendChild(label);

            // Insert in fixed stack order: after the last pane that precedes
            // `key` in OSC_PANE_ORDER, otherwise right after the main chart.
            const parent = mainContainer.parentElement;
            let insertBefore = mainContainer.nextSibling;
            const idx = OSC_PANE_ORDER.indexOf(key);
            for (let i = idx - 1; i >= 0; i--) {
                const prev = _oscPanes[OSC_PANE_ORDER[i]];
                if (prev && prev.container) {
                    insertBefore = prev.container.nextSibling;
                    break;
                }
            }
            // If a later pane already exists, make sure we land before it.
            for (let i = idx + 1; i < OSC_PANE_ORDER.length; i++) {
                const later = _oscPanes[OSC_PANE_ORDER[i]];
                if (later && later.container) {
                    insertBefore = later.container;
                    break;
                }
            }
            parent.insertBefore(container, insertBefore);

            // Build the aux chart instance.
            const chart = LightweightCharts.createChart(container, {
                width: container.clientWidth,
                height: container.clientHeight,
                layout: { background: { color: '#0a0a0a' }, textColor: '#888' },
                grid:   { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
                crosshair: { mode: 0, vertLine: { color: 'rgba(220,38,38,0.45)' }, horzLine: { color: 'rgba(220,38,38,0.45)' } },
                timeScale: { rightOffset: 12, timeVisible: true, secondsVisible: false, visible: false },
                handleScroll: false,
                handleScale: false,
                rightPriceScale: { borderVisible: false }
            });

            // Build the pane's series via its spec.
            const series = spec.build(chart);

            // Bottom→top time-axis sync (per pane), shares the _oscSyncing guard.
            const rangeCB = (range) => {
                if (_oscSyncing || !range || !tvChart) return;
                _oscSyncing = true;
                try {
                    tvChart.timeScale().setVisibleLogicalRange(range);
                    // Mirror into the OTHER active panes too.
                    OSC_PANE_ORDER.forEach(k => {
                        if (k === key) return;
                        const other = _oscPanes[k];
                        if (other && other.chart) {
                            try { other.chart.timeScale().setVisibleLogicalRange(range); }
                            catch (e) { /* swallow */ }
                        }
                    });
                } finally {
                    setTimeout(() => { _oscSyncing = false; }, 0);
                }
            };
            try { chart.timeScale().subscribeVisibleLogicalRangeChange(rangeCB); }
            catch (e) { /* swallow */ }

            // Main→pane crosshair sync. Anchor the crosshair on the pane's
            // first series so the vertical line lines up with the main chart.
            const anchorSeries = series[Object.keys(series)[0]];
            const crosshairCB = (param) => {
                if (!param || !param.time || !anchorSeries) return;
                try { chart.setCrosshairPosition(NaN, param.time, anchorSeries); }
                catch (e) { /* swallow */ }
            };
            try { tvChart.subscribeCrosshairMove(crosshairCB); } catch (e) { /* swallow */ }

            // ResizeObserver for the pane.
            let resizeObserver = null;
            if (typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(() => {
                    if (chart && container) {
                        try { chart.resize(container.clientWidth, container.clientHeight); }
                        catch (e) { /* swallow */ }
                    }
                });
                try { resizeObserver.observe(container); } catch (e) { /* swallow */ }
            }

            // Match the main chart's current visible range immediately.
            try {
                const lr = tvChart.timeScale().getVisibleLogicalRange();
                if (lr) chart.timeScale().setVisibleLogicalRange(lr);
            } catch (e) { /* swallow */ }

            return { container, chart, series, rangeCB, crosshairCB, resizeObserver };
        },

        /**
         * Add (activate) a stacked oscillator pane for `key` — one of
         * 'volume' | 'rsi' | 'macd' | 'atr'. Idempotent. The pane is built
         * below the price chart, time-axis + crosshair synced, then fed with
         * data computed from the current storedCandles.
         *
         * @param {string} key
         * @param {boolean} [skipLayout] - when true, the caller will run
         *        _applyLayout() itself (used by init() batch restore).
         */
        addOscPane: function (key, skipLayout) {
            if (!OSC_PANE_SPEC[key]) return false;
            if (_oscPanes[key]) return true;   // idempotent
            if (!tvChart) return false;

            const entry = this._buildOscPane(key);
            if (!entry) return false;
            _oscPanes[key] = entry;

            // Ensure the single main→pane range subscription is live.
            this._ensureOscMainRangeSub();

            // Feed the pane with current data.
            if (key === 'volume') {
                // Hide the in-chart volume strip — volume now lives in its pane.
                try { if (volumeSeries) volumeSeries.applyOptions({ visible: false }); } catch (e) { /* swallow */ }
                this._feedVolumePane();
            } else {
                feedOscIndicatorPanes(storedCandles);
            }

            // Persist + UI.
            persistOscPanes();
            if (key === 'volume') {
                const btn = document.getElementById('cp-oscToggle');
                if (btn) { btn.classList.add('active'); btn.textContent = 'Volume Split On'; }
            }

            if (!skipLayout) this._applyLayout();
            return true;
        },

        /**
         * Remove (deactivate) the stacked oscillator pane for `key`.
         * Idempotent. Unwinds all subscriptions, the chart instance, the
         * ResizeObserver, and the DOM container.
         */
        removeOscPane: function (key) {
            const entry = _oscPanes[key];
            if (!entry) return;

            try {
                if (entry.rangeCB && entry.chart) {
                    try { entry.chart.timeScale().unsubscribeVisibleLogicalRangeChange(entry.rangeCB); }
                    catch (e) { /* swallow */ }
                }
                if (entry.crosshairCB && tvChart) {
                    try { tvChart.unsubscribeCrosshairMove(entry.crosshairCB); }
                    catch (e) { /* swallow */ }
                }
                if (entry.resizeObserver) {
                    try { entry.resizeObserver.disconnect(); } catch (e) { /* swallow */ }
                }
                if (entry.chart && typeof entry.chart.remove === 'function') {
                    try { entry.chart.remove(); } catch (e) { /* swallow */ }
                }
                if (entry.container && entry.container.parentElement) {
                    try { entry.container.parentElement.removeChild(entry.container); }
                    catch (e) { /* swallow */ }
                }
            } catch (e) { /* swallow */ }

            delete _oscPanes[key];

            // If no panes remain, drop the shared main→pane range subscription.
            if (Object.keys(_oscPanes).length === 0 && _oscMainRangeCB && tvChart) {
                try { tvChart.timeScale().unsubscribeVisibleLogicalRangeChange(_oscMainRangeCB); }
                catch (e) { /* swallow */ }
                _oscMainRangeCB = null;
            }

            // Restore the in-chart volume strip when the volume pane closes.
            if (key === 'volume') {
                try { if (volumeSeries) volumeSeries.applyOptions({ visible: true }); } catch (e) { /* swallow */ }
                const btn = document.getElementById('cp-oscToggle');
                if (btn) { btn.classList.remove('active'); btn.textContent = 'Volume Split'; }
            }

            persistOscPanes();
            this._applyLayout();
        },

        /**
         * Feed the volume pane (if active) with colored volume bars derived
         * from the current storedCandles. Mirrors the alpha-envelope logic
         * used by the in-chart volume series.
         */
        _feedVolumePane: function () {
            const entry = _oscPanes['volume'];
            if (!entry || !entry.series || !entry.series.volume) return;
            if (!storedCandles || !storedCandles.length) return;
            const sortedVols = storedCandles.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
            const capVol = sortedVols.length
                ? sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * VOL_CAP_PCTILE) - 1)]
                : 1;
            const volData = storedCandles
                .filter(c => c && typeof c.time === 'number')
                .map(c => {
                    const up = c.close >= c.open;
                    const ratio = capVol > 0 ? Math.min(1, (c.volume || 0) / capVol) : 0;
                    const alpha = VOL_ALPHA_FLOOR + VOL_ALPHA_RANGE * ratio;
                    const rgb = up ? '34,197,94' : '239,68,68';
                    return { time: c.time, value: c.volume || 0, color: `rgba(${rgb},${alpha.toFixed(3)})` };
                });
            try { entry.series.volume.setData(volData); } catch (e) { /* swallow */ }
        },

        /**
         * Returns true if any oscillator pane is currently active.
         * (Diagnostics / UI sync.)
         */
        isOscillatorPaneActive: function () { return Object.keys(_oscPanes).length > 0; },

        /**
         * Returns the list of active oscillator-pane keys.
         */
        getActiveOscPanes: function () {
            return OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
        },


        /**
         * Get series references.
         */
        getSeries: () => ({ candle: candleSeries, volume: volumeSeries, ghost: ghostSeries }),

        /**
         * Return up to `count` real candles centered around a given timestamp.
         * Used by TradeReplay to render the mini-chart for a closed trade.
         * NO synthetic candle generation — only returns what's in storedCandles.
         * If the trade timestamp falls outside the loaded window, returns the
         * closest contiguous slice we have. If storedCandles is empty, returns [].
         *
         * @param {number} ts - Epoch milliseconds OR seconds (auto-detected)
         * @param {number} count - Total candles to return (default 30)
         * @returns {Array<{time, open, high, low, close, volume}>}
         */
        getCandlesAroundTime: function (ts, count) {
            try {
                if (!storedCandles || storedCandles.length === 0) return [];
                const n = Math.max(1, Number(count) || 30);
                // Normalize ts to seconds (storedCandles uses second-aligned bucket times)
                const tsSec = (ts > 1e12) ? Math.floor(Number(ts) / 1000) : Math.floor(Number(ts));
                if (!isFinite(tsSec)) return [];

                // Binary search the nearest candle by time
                let lo = 0, hi = storedCandles.length - 1, nearest = 0;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    const t = storedCandles[mid].time;
                    if (t === tsSec) { nearest = mid; break; }
                    if (t < tsSec) { nearest = mid; lo = mid + 1; }
                    else { hi = mid - 1; }
                }

                // Center the slice on the nearest candle, clamp to array bounds
                const half = Math.floor(n / 2);
                let start = Math.max(0, nearest - half);
                let end   = Math.min(storedCandles.length, start + n);
                start = Math.max(0, end - n);  // re-align if we hit the right wall

                // Return a shallow copy so the caller can't mutate live state
                return storedCandles.slice(start, end).map(c => ({
                    time: c.time,
                    open: c.open,
                    high: c.high,
                    low:  c.low,
                    close: c.close,
                    volume: c.volume
                }));
            } catch (e) {
                return [];
            }
        },

        /**
         * Debug helper: return internal state.
         */
        _compute: function () {
            return {
                tvChart: !!tvChart,
                storedCandles: storedCandles.length,
                activeOverlays: activeOverlays,
                tradeMarkers: tradeMarkers.size,
                cachedDomRefs: {
                    priceEl: !!_cachedPriceEl,
                    hudPrice: !!_cachedHudPrice,
                    hudOhlc: !!_cachedHudOhlc,
                    tooltip: !!_cachedTooltipEl
                }
            };
        }
    };

    // ─── Registration ──────────────────────────────────────────────────────
    // Dual-register: 'ChartPanel' is the canonical v2 name; 'Chart' is the
    // legacy alias core.js + websocket.js consumers do OGZ.get('Chart') against.
    // Without the alias, every price/historical_candles event short-circuits
    // silently (Wolf cotwerk diagnosis 2026-05-08).
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('ChartPanel', ChartPanel);
        OGZ.register('Chart', ChartPanel);
    } else {
        if (typeof document !== 'undefined') {
            document.addEventListener('DOMContentLoaded', () => {
                if (window.OGZ && typeof window.OGZ.register === 'function') {
                    window.OGZ.register('ChartPanel', ChartPanel);
                    window.OGZ.register('Chart', ChartPanel);
                }
            });
        }
    }

    try { window.OGZChartPanel = ChartPanel; } catch (_) { }
})(window.OGZ = window.OGZ || {});
