/**
 * chart.js - High-Performance Chart Rendering
 * LightweightCharts with Ghost projections, TPO heatmap, and flicker fix.
 *
 * Phase A polish:
 *   - ogzprime brand palette (candles + every overlay, no red-family collisions)
 *   - RSI 70/30 overbought/oversold bands on the RSI scale
 *   - Gradient-opacity volume bars driven by 98th-percentile cap
 *   - Outlier-robust autoscale on candle + volume series (2nd/98th pct)
 *   - Dynamic layout: legacy 80/20 when no oscillator on, rebalanced when any on
 *   - Visible-range listener nudges autoscale on scroll/zoom
 *   - Floating in-chart HUD (#chartHud) driven by live price ticks
 */
(function(OGZ) {
    'use strict';

    let tvChart, candleSeries, volumeSeries, ghostSeries;
    let tpoLines = [], wallLines = [];

    // Indicator overlay series
    let ema20Series, ema50Series, ema200Series;
    let bbUpperSeries, bbMiddleSeries, bbLowerSeries;
    let vwapSeries, sma20Series, sma50Series, sma200Series;
    let rsiOverlaySeries, macdLineSeries, macdSignalSeries, atrSeries;
    let activeOverlays = [];
    let storedCandles = []; // For recalculating indicators from historical data

    // ─── Teardown-tracking state ───
    // Every listener, timer, subscription, and priceLine registered by Chart.init()
    // is pushed into one of these buckets so Chart.destroy() can unwind cleanly.
    // This eliminates the possibility of leaked handles on chart re-mount or
    // page unload (the latter wires through a 'beforeunload' listener below).
    const _trackedListeners = [];      // Array of { target, type, handler }
    const _trackedTimers = new Set();  // setTimeout / setInterval IDs
    let _trackedVisibleRangeCB = null; // Subscription callback for unsubscribe
    let _trackedRsiSeries = null;      // RSI overlay series reference (for priceLine removal)

    function trackListener(target, type, handler) {
        target.addEventListener(type, handler);
        _trackedListeners.push({ target, type, handler });
    }
    function trackTimer(id) {
        _trackedTimers.add(id);
        return id;
    }

    // Timeframe string -> seconds per bar. Used to align live ticks to the
    // correct bucket so 5m/15m/1h charts actually build in real time instead
    // of appearing as a single fat bar every N minutes.
    const TF_SECONDS = {
        '1s': 1, '5s': 5, '15s': 15, '30s': 30,
        '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
        '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200,
        '1d': 86400
    };
    function currentBucketSeconds() {
        const tf = document.getElementById('timeframeSelector')?.value || '1m';
        return TF_SECONDS[tf] || 60;
    }

    // ─── Phase A helpers (visible-window outlier clipping) ───
    // Both series use these to compute autoscale bounds that ignore flash-crash
    // wicks / mega-volume spikes. Normal bars stay readable.
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
            // Chart not ready yet (createChart hasn't assigned tvChart), or
            // timeScale threw on getVisibleLogicalRange. Fall back to full
            // series so indicators still compute — logged so we notice if
            // this fires on the hot path.
            console.warn('[Chart] visibleSlice getVisibleLogicalRange failed:', e && e.message);
        }
        return storedCandles;
    }

    const Chart = {
        init: function() {
            const container = document.getElementById('tvChartContainer');
            if (!container) { console.error('[Chart] tvChartContainer not found'); return; }

            tvChart = LightweightCharts.createChart(container, {
                width: container.clientWidth,
                height: container.clientHeight,
                layout: { background: { color: '#0a0a0a' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
                crosshair: { mode: 0, vertLine: { color: 'rgba(220, 38, 38, 0.45)' }, horzLine: { color: 'rgba(220, 38, 38, 0.45)' } },
                timeScale: { rightOffset: 12, timeVisible: true, secondsVisible: false }
            });

            candleSeries = tvChart.addCandlestickSeries({
                // Phase A — ogzprime-safe palette. Distinct from brand #dc2626 so
                // brand elements on the page don't collide with candle coloring.
                upColor: '#22c55e', downColor: '#ef4444',
                borderUpColor: '#22c55e', borderDownColor: '#ef4444',
                wickUpColor: '#22c55e', wickDownColor: '#ef4444',
                // Outlier-robust autoscale: 2nd/98th percentile of visible highs/lows.
                // One flash-crash wick can't squish 400 normal bars into a flat band.
                autoscaleInfoProvider: (baseImpl) => {
                    try {
                        const base = baseImpl();
                        const slice = visibleSlice();
                        // Need a statistically meaningful sample before clipping —
                        // below ~10 candles the percentile math itself becomes noise.
                        if (slice.length < 10) return base;
                        const lows  = slice.map(c => c.low).sort((a, b) => a - b);
                        const highs = slice.map(c => c.high).sort((a, b) => a - b);
                        // 2nd / 98th percentile clip: discards the extreme 2% of
                        // values on each tail. Flash-crash wicks fall in that tail
                        // and stop dominating the visible range.
                        const PCTILE_LOW = 0.02;
                        const PCTILE_HIGH = 0.98;
                        const loIdx = Math.max(0, Math.floor(lows.length * PCTILE_LOW));
                        const hiIdx = Math.min(highs.length - 1, Math.ceil(highs.length * PCTILE_HIGH) - 1);
                        const pLow = lows[loIdx];
                        const pHigh = highs[hiIdx];
                        // Guard: identical values (flat bar or all-highs-equal)
                        // collapse the range to zero — fall back to library default.
                        if (!(pLow < pHigh)) return base;
                        // 5% padding on each side so price action isn't clipped at
                        // the frame edges after the percentile trim.
                        const PAD_RATIO = 0.05;
                        const pad = (pHigh - pLow) * PAD_RATIO;
                        return {
                            priceRange: { minValue: pLow - pad, maxValue: pHigh + pad },
                            margins: base?.margins || { above: 10, below: 20 }
                        };
                    } catch (e) {
                        console.warn('[Chart] candle autoscale clip failed:', e && e.message);
                        return baseImpl();
                    }
                }
            });

            volumeSeries = tvChart.addHistogramSeries({
                priceScaleId: 'vol',
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                // One mega-volume bar (flash-crash print, halt cross) shouldn't
                // make every normal bar invisible. Cap at 98th percentile.
                autoscaleInfoProvider: (baseImpl) => {
                    try {
                        const base = baseImpl();
                        const slice = visibleSlice();
                        const vols = slice.map(c => Number(c.volume || 0)).filter(v => v > 0).sort((a, b) => a - b);
                        // Need a stable sample for percentile cap; below ~10 bars
                        // the cap itself becomes noisy.
                        if (vols.length < 10) return base;
                        // Cap at 98th percentile: a single mega-volume print doesn't
                        // squish every other bar to invisibility.
                        const VOL_CAP_PCTILE = 0.98;
                        const capIdx = Math.min(vols.length - 1, Math.ceil(vols.length * VOL_CAP_PCTILE) - 1);
                        const cap = vols[capIdx];
                        // All zero / empty after filter → fall back to library default.
                        if (!(cap > 0)) return base;
                        // 15% headroom above the cap so bars that approach the cap
                        // don't visually touch the pane ceiling.
                        const HEADROOM_RATIO = 1.15;
                        return {
                            priceRange: { minValue: 0, maxValue: cap * HEADROOM_RATIO },
                            margins: base?.margins || { above: 10, below: 0 }
                        };
                    } catch (e) {
                        console.warn('[Chart] volume autoscale clip failed:', e && e.message);
                        return baseImpl();
                    }
                }
            });
            // Volume scale cosmetics only — layout margins applied via _applyLayout().
            tvChart.priceScale('vol').applyOptions({ drawTicks: false, borderVisible: false });
            tvChart.priceScale('right').applyOptions({ borderVisible: false });

            // Ghost Layer for pattern projections (LIVE-SAFE-GUARDED)
            ghostSeries = tvChart.addLineSeries({
                color: 'rgba(0, 255, 255, 0.4)',
                lineWidth: 2,
                lineStyle: 3,
                priceLineVisible: false
            });

            // Phase A — overlay palette. Every hue chosen so overlays remain
            // legible on both profit-green AND loss-red candles. Zero red-family
            // colors — purple/amber/cyan/blue/pink spread.
            ema20Series  = tvChart.addLineSeries({ color: '#fbbf24', lineWidth: 1.5, visible: false, title: 'EMA20',  lastValueVisible: false, priceLineVisible: false });
            ema50Series  = tvChart.addLineSeries({ color: '#22d3ee', lineWidth: 1.5, visible: false, title: 'EMA50',  lastValueVisible: false, priceLineVisible: false });
            ema200Series = tvChart.addLineSeries({ color: '#a78bfa', lineWidth: 2,   visible: false, title: 'EMA200', lastValueVisible: false, priceLineVisible: false });
            bbUpperSeries  = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.35)', lineWidth: 1, visible: false, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
            bbMiddleSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.55)', lineWidth: 1, visible: false,               lastValueVisible: false, priceLineVisible: false });
            bbLowerSeries  = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.35)', lineWidth: 1, visible: false, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
            vwapSeries   = tvChart.addLineSeries({ color: '#e879f9', lineWidth: 2, visible: false, title: 'VWAP',   lastValueVisible: false, priceLineVisible: false });
            sma20Series  = tvChart.addLineSeries({ color: '#60a5fa', lineWidth: 1, visible: false, title: 'SMA20',  lastValueVisible: false, priceLineVisible: false });
            sma50Series  = tvChart.addLineSeries({ color: '#3b82f6', lineWidth: 1, visible: false, title: 'SMA50',  lastValueVisible: false, priceLineVisible: false });
            sma200Series = tvChart.addLineSeries({ color: '#1d4ed8', lineWidth: 2, visible: false, title: 'SMA200', lastValueVisible: false, priceLineVisible: false });

            // Oscillators — each on its own isolated scale. Margins applied
            // dynamically via _applyLayout() so they collapse to zero when no
            // oscillator is active and legacy layout is preserved.
            rsiOverlaySeries = tvChart.addLineSeries({
                color: '#ec4899', lineWidth: 1.5, visible: false, title: 'RSI',
                priceScaleId: 'rsi',
                priceFormat: { type: 'custom', formatter: v => v.toFixed(0) },
                lastValueVisible: false, priceLineVisible: false
            });
            tvChart.priceScale('rsi').applyOptions({ visible: false, borderVisible: false });
            // RSI 70/30 overbought/oversold bands. Attached to the RSI series
            // itself so they inherit series visibility (hide when RSI off).
            // Stored on both `this` AND the module-level _trackedRsiSeries so
            // clearAll() and destroy() can remove them cleanly regardless of
            // which access path wins.
            _trackedRsiSeries = rsiOverlaySeries;
            this._rsiOverlaySeries = rsiOverlaySeries;
            this._rsiBand70 = rsiOverlaySeries.createPriceLine({
                price: 70, color: 'rgba(239,68,68,0.45)', lineWidth: 1, lineStyle: 2,
                axisLabelVisible: true, title: '70'
            });
            this._rsiBand30 = rsiOverlaySeries.createPriceLine({
                price: 30, color: 'rgba(34,197,94,0.45)', lineWidth: 1, lineStyle: 2,
                axisLabelVisible: true, title: '30'
            });

            macdLineSeries   = tvChart.addLineSeries({ color: '#8b5cf6', lineWidth: 1.5, visible: false, title: 'MACD',   priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
            macdSignalSeries = tvChart.addLineSeries({ color: '#fbbf24', lineWidth: 1,   visible: false, title: 'Signal', priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
            tvChart.priceScale('macd').applyOptions({ visible: false, borderVisible: false });
            atrSeries = tvChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, visible: false, title: 'ATR', priceScaleId: 'atr', lastValueVisible: false, priceLineVisible: false });
            tvChart.priceScale('atr').applyOptions({ visible: false, borderVisible: false });

            // Ichimoku — distinct palette so it can coexist with EMAs.
            this._ichiTenkan  = tvChart.addLineSeries({ color: '#06b6d4', lineWidth: 1, visible: false, title: 'Tenkan',   lastValueVisible: false, priceLineVisible: false });
            this._ichiKijun   = tvChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, visible: false, title: 'Kijun',    lastValueVisible: false, priceLineVisible: false });
            this._ichiSenkouA = tvChart.addLineSeries({ color: 'rgba(34,197,94,0.45)', lineWidth: 1, visible: false, title: 'Senkou A', lastValueVisible: false, priceLineVisible: false });
            this._ichiSenkouB = tvChart.addLineSeries({ color: 'rgba(239,68,68,0.45)', lineWidth: 1, visible: false, title: 'Senkou B', lastValueVisible: false, priceLineVisible: false });

            // Trend lines — semantic colors: support=profit green, resistance=loss red.
            // Matches the candle palette.
            this._trendResistance = tvChart.addLineSeries({ color: '#ef4444', lineWidth: 2, visible: false, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
            this._trendSupport    = tvChart.addLineSeries({ color: '#22c55e', lineWidth: 2, visible: false, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

            // Fibonacci and S/R use price lines (created dynamically)
            this._fibLines = [];
            this._srLines = [];

            // Apply legacy layout at init — candles 80%, volume 20%, no osc strip.
            // Layout will rebalance on first oscillator toggle.
            this._applyLayout(false);

            // Visible-range listener: nudge both scales to recompute autoscale
            // against the newly-visible candles on scroll/zoom. Throttled at 80ms
            // so panning stays smooth. Callback reference stored on
            // _trackedVisibleRangeCB so destroy() can unsubscribeVisibleLogicalRangeChange
            // with the matching function identity.
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
                        console.warn('[Chart] priceScale applyOptions failed:', e && e.message);
                    }
                }, 80));
            };
            tvChart.timeScale().subscribeVisibleLogicalRangeChange(_trackedVisibleRangeCB);

            // Crosshair driver: (1) keep header price live, (2) feed floating
            // tooltip near the cursor so you see exact time + price at any point.
            const tooltipEl = document.getElementById('crosshairTooltip');
            tvChart.subscribeCrosshairMove(param => {
                const priceEl = document.getElementById('currentPrice');
                const candleData = param.seriesData ? param.seriesData.get(candleSeries) : null;

                // Header readout
                if (priceEl) {
                    if (!param.time || !candleData) {
                        priceEl.textContent = `$${OGZ.state.lastPrice.toLocaleString()}`;
                    } else {
                        priceEl.textContent = `O:${candleData.open.toFixed(2)} H:${candleData.high.toFixed(2)} L:${candleData.low.toFixed(2)} C:${candleData.close.toFixed(2)}`;
                    }
                }

                // Floating tooltip near cursor
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

                // ─── XSS-safe tooltip construction (no innerHTML) ───
                // All values go through textContent (never parsed as HTML) so
                // even if a malicious WS payload ever injects HTML into a
                // candleData field, it renders as literal text, never executes.
                while (tooltipEl.firstChild) tooltipEl.removeChild(tooltipEl.firstChild);

                const dateRow = document.createElement('div');
                dateRow.style.cssText = 'color:#888;font-size:10px;letter-spacing:0.5px;';
                dateRow.textContent = dateStr;
                tooltipEl.appendChild(dateRow);

                const priceRow = document.createElement('div');
                priceRow.style.cssText =
                    'font-family:Orbitron,monospace;font-size:13px;font-weight:700;margin-top:2px;color:' + dir;
                priceRow.textContent =
                    (priceAt != null && typeof priceAt === 'number' ? '$' + priceAt.toFixed(2) : '--');
                tooltipEl.appendChild(priceRow);

                const ohlcRow = document.createElement('div');
                ohlcRow.style.cssText = 'color:#aaa;font-size:10px;margin-top:4px;font-family:monospace;';
                const oh = document.createElement('div');
                const ll = document.createElement('div');
                oh.textContent =
                    'O ' + Number(candleData.open).toFixed(2) +
                    '   H ' + Number(candleData.high).toFixed(2);
                ll.textContent =
                    'L ' + Number(candleData.low).toFixed(2) +
                    '   C ' + Number(candleData.close).toFixed(2);
                ohlcRow.appendChild(oh);
                ohlcRow.appendChild(ll);
                tooltipEl.appendChild(ohlcRow);
                // Position: offset so cursor doesn't cover the box, flip left if near right edge
                const containerRect = container.getBoundingClientRect();
                const tipW = 150, tipH = 78;
                let x = param.point.x + 18;
                let y = param.point.y + 18;
                if (x + tipW > containerRect.width) x = param.point.x - tipW - 18;
                if (y + tipH > containerRect.height) y = param.point.y - tipH - 18;
                tooltipEl.style.left = Math.max(4, x) + 'px';
                tooltipEl.style.top = Math.max(4, y) + 'px';
                tooltipEl.style.display = 'block';
            });

            // Expose for legacy code compatibility
            window.tvChart = tvChart;
            window.candleSeries = candleSeries;

            // Bind chart control events
            this.bindControls();

            // Resize handler (tracked for destroy-time cleanup)
            trackListener(window, 'resize', () => {
                if (tvChart && container) {
                    tvChart.resize(container.clientWidth, container.clientHeight);
                }
            });

            // Wire beforeunload → destroy() so every listener, timer, and
            // subscription this module created is explicitly torn down
            // before the browser collects the page. Belt-and-suspenders:
            // the browser would clean most of this anyway, but explicit
            // teardown closes the "theoretical" gap.
            trackListener(window, 'beforeunload', () => {
                try { Chart.destroy(); } catch (e) {
                    console.warn('[Chart] destroy() failed on unload:', e && e.message);
                }
            });

            console.log('[Chart] Initialized.');
        },

        /**
         * Apply scale margins based on whether any oscillator is active.
         * - hasOsc=false: candles use library defaults (top:0.1, bottom:0.1 = 80%
         *   band, legacy), volume bottom 20%. Oscillator scales collapse to zero
         *   so they claim no space. Baseline chart is pixel-identical to pre-polish.
         * - hasOsc=true: candles give up ~20% so a clean oscillator strip can
         *   render at the bottom. Volume keeps its 20% breathing room.
         */
        _applyLayout: function(hasOsc) {
            if (hasOsc) {
                tvChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.02, bottom: 0.38 } });
                tvChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.62, bottom: 0.18 } });
                tvChart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
                tvChart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
                tvChart.priceScale('atr').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
            } else {
                tvChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
                tvChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
                tvChart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.999, bottom: 0 } });
                tvChart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.999, bottom: 0 } });
                tvChart.priceScale('atr').applyOptions({ scaleMargins: { top: 0.999, bottom: 0 } });
            }
        },

        bindControls: function() {
            // Chart type selector — switch between candlestick, line, area, bar
            const chartType = document.getElementById('chartTypeSelector');
            if (chartType) trackListener(chartType, 'change', (e) => {
                const type = e.target.value;
                // Hide all alt series
                if (this._lineSeries) this._lineSeries.applyOptions({ visible: false });
                if (this._areaSeries) this._areaSeries.applyOptions({ visible: false });
                if (this._barSeries) this._barSeries.applyOptions({ visible: false });

                if (type === 'candlestick') {
                    candleSeries.applyOptions({ visible: true });
                } else {
                    candleSeries.applyOptions({ visible: false });
                    // Get candle data for alt series
                    let data = [];
                    try { data = candleSeries.data ? candleSeries.data() : []; } catch(err) {}

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
                console.log('[Chart] Type:', type);
            });

            // Asset selector — sends asset_change + requests new historical data
            const assetSel = document.getElementById('assetSelector');
            if (assetSel) trackListener(assetSel, 'change', (e) => {
                const socket = OGZ.get('Socket');
                if (socket) {
                    socket.send({ type: 'asset_change', asset: e.target.value });
                    this.clearAll();
                    // Tracked setTimeout — id goes into _trackedTimers so destroy() can clear
                    const tid = setTimeout(() => {
                        _trackedTimers.delete(tid);
                        const tf = document.getElementById('timeframeSelector')?.value || '1m';
                        socket.send({ type: 'request_historical', timeframe: tf, asset: e.target.value, limit: 500 });
                    }, 500);
                    trackTimer(tid);
                }
                console.log('[Chart] Asset:', e.target.value);
            });

            // Timeframe selector — sends timeframe_change + requests new historical data
            const tfSel = document.getElementById('timeframeSelector');
            if (tfSel) trackListener(tfSel, 'change', (e) => {
                const socket = OGZ.get('Socket');
                if (socket) {
                    socket.send({ type: 'timeframe_change', timeframe: e.target.value });
                    this.clearAll();
                    socket.send({
                        type: 'request_historical',
                        timeframe: e.target.value,
                        asset: document.getElementById('assetSelector')?.value || 'TSLA',
                        limit: 500
                    });
                }
                console.log('[Chart] Timeframe:', e.target.value);
            });

            // Indicator checkboxes — toggle visibility + recalculate from stored candles
            document.querySelectorAll('#indicatorCheckboxes input[type="checkbox"]').forEach(chk => {
                trackListener(chk, 'change', () => {
                    activeOverlays = [];
                    document.querySelectorAll('#indicatorCheckboxes input:checked').forEach(c => activeOverlays.push(c.value));
                    this.toggleIndicators(activeOverlays);
                    if (storedCandles.length > 0) this.calculateIndicators(storedCandles);
                    console.log('[Chart] Indicators:', activeOverlays);
                });
            });

            // Tier selector
            const tierSel = document.getElementById('tierSelector');
            if (tierSel) trackListener(tierSel, 'change', (e) => {
                OGZ.state.tier = e.target.value;
                document.body.className = `tier-${e.target.value}`;
                console.log('[Chart] Tier:', e.target.value);
            });
        },

        toggleIndicators: function(active) {
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
            rsiOverlaySeries.applyOptions({ visible: active.includes('rsi') });
            macdLineSeries.applyOptions({ visible: active.includes('macd') });
            macdSignalSeries.applyOptions({ visible: active.includes('macd') });
            atrSeries.applyOptions({ visible: active.includes('atr') });
            // Ichimoku
            this._ichiTenkan.applyOptions({ visible: active.includes('ichimoku') });
            this._ichiKijun.applyOptions({ visible: active.includes('ichimoku') });
            this._ichiSenkouA.applyOptions({ visible: active.includes('ichimoku') });
            this._ichiSenkouB.applyOptions({ visible: active.includes('ichimoku') });
            // Trend lines
            this._trendResistance.applyOptions({ visible: active.includes('trendlines') });
            this._trendSupport.applyOptions({ visible: active.includes('trendlines') });
            // Fibonacci — show/hide price lines
            this._fibLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch(e){} });
            this._fibLines = [];
            // S/R — show/hide price lines
            this._srLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch(e){} });
            this._srLines = [];

            // Rebalance layout based on whether any oscillator strip is needed.
            const hasOsc = active.includes('rsi') || active.includes('macd') || active.includes('atr');
            this._applyLayout(hasOsc);
        },

        calculateIndicators: function(candles) {
            if (!candles || candles.length < 30) return;
            const Ind = OGZ.get('Indicators');
            if (!Ind) return;

            const closes = candles.map(c => c.close);
            const times = candles.map(c => c.time);
            const mapSeries = (values) => values.map((v, i) => v != null ? { time: times[i], value: v } : null).filter(Boolean);

            try {
                // EMAs
                const ema20 = Ind.calculateEMA(closes, 20);
                const ema50 = Ind.calculateEMA(closes, 50);
                const ema200 = Ind.calculateEMA(closes, 200);
                ema20Series.setData(mapSeries(ema20));
                ema50Series.setData(mapSeries(ema50));
                ema200Series.setData(mapSeries(ema200));

                // SMAs
                const sma20 = Ind.calculateSMA(closes, 20);
                const sma50 = Ind.calculateSMA(closes, 50);
                const sma200 = Ind.calculateSMA(closes, 200);
                sma20Series.setData(mapSeries(sma20));
                sma50Series.setData(mapSeries(sma50));
                sma200Series.setData(mapSeries(sma200));

                // Bollinger Bands
                const bb = Ind.calculateBollinger(closes, 20, 2);
                bbUpperSeries.setData(mapSeries(bb.upper));
                bbMiddleSeries.setData(mapSeries(bb.middle));
                bbLowerSeries.setData(mapSeries(bb.lower));

                // VWAP
                const vwap = Ind.calculateVWAP(candles);
                vwapSeries.setData(mapSeries(vwap));

                // RSI
                const rsi = Ind.calculateRSI(closes, 14);
                rsiOverlaySeries.setData(mapSeries(rsi));

                // ATR
                const atr = Ind.calculateATR(candles, 14);
                atrSeries.setData(mapSeries(atr));

                // Trend Lines (auto-detected from swing highs/lows)
                if (activeOverlays.includes('trendlines')) {
                    const trendLines = Ind.calculateTrendLines(candles);
                    trendLines.forEach(tl => {
                        if (tl.type === 'resistance') this._trendResistance.setData(tl.points);
                        if (tl.type === 'support') this._trendSupport.setData(tl.points);
                    });
                }

                // MACD
                const macd = Ind.calculateMACD(closes);
                macdLineSeries.setData(mapSeries(macd.macd));
                macdSignalSeries.setData(mapSeries(macd.signal));

                // Ichimoku
                const ichi = Ind.calculateIchimoku(candles);
                this._ichiTenkan.setData(mapSeries(ichi.tenkan));
                this._ichiKijun.setData(mapSeries(ichi.kijun));
                this._ichiSenkouA.setData(mapSeries(ichi.senkouA));
                this._ichiSenkouB.setData(mapSeries(ichi.senkouB));

                // Fibonacci price lines
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

                // Support/Resistance price lines
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

                console.log('[Chart] Indicators calculated for', candles.length, 'candles');
            } catch (e) {
                console.error('[Chart] Indicator calc error:', e.message);
            }
        },

        clearAll: function() {
            if (candleSeries) candleSeries.setData([]);
            if (volumeSeries) volumeSeries.setData([]);
            if (this._lineSeries) this._lineSeries.setData([]);
            if (this._areaSeries) this._areaSeries.setData([]);
            if (this._barSeries) this._barSeries.setData([]);
            if (ghostSeries) ghostSeries.setData([]);
            wallLines.forEach(l => {
                try { candleSeries.removePriceLine(l); }
                catch (e) { console.warn('[Chart] removePriceLine wall failed:', e && e.message); }
            });
            tpoLines.forEach(l => {
                try { candleSeries.removePriceLine(l); }
                catch (e) { console.warn('[Chart] removePriceLine tpo failed:', e && e.message); }
            });
            wallLines = []; tpoLines = [];

            // ─── RSI band cleanup (Phase A audit fix) ───
            // The 70/30 overbought/oversold priceLines were previously leaked
            // when the RSI series was destroyed + recreated (indicator toggle
            // off → on). Now tracked via _trackedRsiSeries and nulled after
            // removal so the next init attaches fresh bands to the new series.
            const rsiSeries = this._rsiOverlaySeries || _trackedRsiSeries;
            if (rsiSeries) {
                if (this._rsiBand70) {
                    try { rsiSeries.removePriceLine(this._rsiBand70); }
                    catch (e) { console.warn('[Chart] removePriceLine RSI70 failed:', e && e.message); }
                    this._rsiBand70 = null;
                }
                if (this._rsiBand30) {
                    try { rsiSeries.removePriceLine(this._rsiBand30); }
                    catch (e) { console.warn('[Chart] removePriceLine RSI30 failed:', e && e.message); }
                    this._rsiBand30 = null;
                }
            }
        },

        /**
         * Explicit teardown. Removes every listener, cancels every tracked
         * timer, unsubscribes the visible-range callback, and removes the
         * RSI band priceLines. Wired to 'beforeunload' so theoretical
         * re-mount leaks become structurally impossible — every handle this
         * module created is reachable here.
         */
        destroy: function() {
            // 1. Cancel every pending timer (flash, rescale, asset-change deferred)
            for (const tid of _trackedTimers) {
                try { clearTimeout(tid); } catch (e) { /* tid might be stale */ }
            }
            _trackedTimers.clear();

            // 2. Remove every tracked event listener
            for (const { target, type, handler } of _trackedListeners) {
                try { target.removeEventListener(type, handler); }
                catch (e) { console.warn('[Chart] removeEventListener failed for', type, e && e.message); }
            }
            _trackedListeners.length = 0;

            // 3. Unsubscribe the visible-range change handler with its exact fn ref
            if (_trackedVisibleRangeCB && tvChart && tvChart.timeScale) {
                try { tvChart.timeScale().unsubscribeVisibleLogicalRangeChange(_trackedVisibleRangeCB); }
                catch (e) { console.warn('[Chart] unsubscribeVisibleLogicalRangeChange failed:', e && e.message); }
                _trackedVisibleRangeCB = null;
            }

            // 4. Remove RSI band priceLines
            const rsiSeries = this._rsiOverlaySeries || _trackedRsiSeries;
            if (rsiSeries) {
                if (this._rsiBand70) {
                    try { rsiSeries.removePriceLine(this._rsiBand70); } catch (e) { /* already removed */ }
                    this._rsiBand70 = null;
                }
                if (this._rsiBand30) {
                    try { rsiSeries.removePriceLine(this._rsiBand30); } catch (e) { /* already removed */ }
                    this._rsiBand30 = null;
                }
            }
            _trackedRsiSeries = null;
            this._rsiOverlaySeries = null;

            console.log('[Chart] destroy() — teardown complete.');
        },

        update: (d) => {
            if (!candleSeries) return;
            const candle = d.candle || d;
            const price = candle.close || candle.c;
            const open = candle.open || candle.o;
            const high = candle.high || candle.h;
            const low = candle.low || candle.l;
            const rawMs = candle.timestamp || candle.t || Date.now();
            const t = Math.floor(rawMs / 1000);

            // Align to the bucket size of the currently selected timeframe so
            // sub-bar ticks continuously update the in-progress candle — this
            // is what made it "feel real-time" before.
            const bucket = currentBucketSeconds();
            const timeAligned = Math.floor(t / bucket) * bucket;

            // If bot only sent a bare `price` (no OHLC), synthesize a tick on
            // the in-progress candle so the wick/body extends live.
            let tickOpen = open, tickHigh = high, tickLow = low, tickClose = price;
            if (price != null && (open == null || high == null || low == null)) {
                const last = storedCandles[storedCandles.length - 1];
                if (last && last.time === timeAligned) {
                    tickOpen = last.open;
                    tickHigh = Math.max(last.high, price);
                    tickLow = Math.min(last.low, price);
                    tickClose = price;
                    // mutate stored candle so crosshair/tooltip reflects live bar
                    last.high = tickHigh; last.low = tickLow; last.close = tickClose;
                } else if (price != null) {
                    tickOpen = tickHigh = tickLow = tickClose = price;
                    storedCandles.push({ time: timeAligned, open: price, high: price, low: price, close: price, volume: 0 });
                }
            } else if (open != null) {
                // Full candle provided — upsert into storedCandles
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
                // Live-bar volume alpha — clamp against the stored 98th-percentile
                // cap so the live bar doesn't leap to 100% opacity and pop.
                const up = tickClose >= tickOpen;
                let liveAlpha = 0.5;
                if (storedCandles.length > 20) {
                    const sortedVols = storedCandles.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
                    const capVol = sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * 0.98) - 1)] || 1;
                    const ratio = Math.min(1, (candle.volume || candle.v) / capVol);
                    liveAlpha = 0.25 + 0.55 * ratio;
                }
                const rgb = up ? '34,197,94' : '239,68,68';
                volumeSeries.update({
                    time: timeAligned,
                    value: candle.volume || candle.v,
                    color: `rgba(${rgb},${liveAlpha.toFixed(3)})`
                });
            }

            // Live price readout + floating HUD + tick flash with ogzprime palette.
            if (price != null) {
                OGZ.state.lastPriceDelta = price - OGZ.state.lastPrice;
                OGZ.state.lastPrice = price;
                const up = OGZ.state.lastPriceDelta >= 0;
                const flashColor = up ? '#22c55e' : '#ef4444';
                const flashShadow = up ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)';

                const priceEl = document.getElementById('currentPrice');
                if (priceEl) {
                    priceEl.textContent = `$${price.toLocaleString()}`;
                    priceEl.style.transition = 'color 0.08s ease, text-shadow 0.08s ease';
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
                    }, 180);
                    trackTimer(priceEl._flashTimer);
                }

                // Floating in-chart HUD (top-right inside chart container).
                const hudPrice = document.getElementById('chartHudPrice');
                if (hudPrice) {
                    hudPrice.textContent = `$${Number(price).toFixed(2)}`;
                    hudPrice.style.transition = 'color 0.08s ease, text-shadow 0.08s ease';
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
                    }, 180);
                    trackTimer(hudPrice._flashTimer);
                }
                const hudOhlc = document.getElementById('chartHudOhlc');
                if (hudOhlc && storedCandles.length) {
                    const lc = storedCandles[storedCandles.length - 1];
                    hudOhlc.textContent = `O ${lc.open.toFixed(2)}  H ${lc.high.toFixed(2)}  L ${lc.low.toFixed(2)}  C ${lc.close.toFixed(2)}`;
                }
            }
        },

        // LIVE-SAFE-GUARDED: Ghost path renders only when projection_path exists
        plotGhost: (path) => {
            if (ghostSeries && path && path.length > 0) {
                ghostSeries.setData(path);
            }
        },

        // DORMANT: TPO/Liquidity rendering — only fires through depth_update handler
        renderLiquidity: (data) => {
            if (!candleSeries) return;
            if (!data.isLive) return;

            // Clear old visuals
            wallLines.forEach(l => candleSeries.removePriceLine(l));
            tpoLines.forEach(l => candleSeries.removePriceLine(l));
            wallLines = [];
            tpoLines = [];

            // TPO Density Heatmap
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

            // Whale Walls
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

        loadHistorical: (candles) => {
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

                // Set candle data
                candleSeries.setData(formatted.map(c => ({
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
                })));

                // Volume with GRADIENT OPACITY — alpha scales with bar height
                // against the 98th-percentile cap. Tiny bars fade, dominant
                // bars pop. One flash-crash bar can't bleach the rest.
                if (volumeSeries) {
                    const sortedVols = formatted.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
                    const capVol = sortedVols.length
                        ? sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * 0.98) - 1)]
                        : 1;
                    volumeSeries.setData(formatted.map(c => {
                        const up = c.close >= c.open;
                        const ratio = capVol > 0 ? Math.min(1, (c.volume || 0) / capVol) : 0;
                        const alpha = 0.25 + 0.55 * ratio; // 0.25 floor, up to 0.80
                        const rgb = up ? '34,197,94' : '239,68,68';
                        return { time: c.time, value: c.volume, color: `rgba(${rgb},${alpha.toFixed(3)})` };
                    }));
                }

                // Store for indicator recalculation
                storedCandles = formatted;

                // Auto-calculate indicators if any are active
                if (activeOverlays.length > 0) this.calculateIndicators(formatted);

                // Scroll to most recent candles
                if (tvChart) tvChart.timeScale().scrollToRealTime();

                console.log(`[Chart] Loaded ${formatted.length} historical candles`);
            } catch (e) {
                console.error('[Chart] loadHistorical error:', e.message);
            }
        },

        getChart: () => tvChart,
        getSeries: () => ({ candle: candleSeries, volume: volumeSeries, ghost: ghostSeries })
    };

    OGZ.register('Chart', Chart);
})(window.OGZ);
