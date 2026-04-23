/**
 * chart.js - High-Performance Chart Rendering
 * LightweightCharts with Ghost projections, TPO heatmap, and flicker fix
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

    const Chart = {
        init: function() {
            const container = document.getElementById('tvChartContainer');
            if (!container) { console.error('[Chart] tvChartContainer not found'); return; }

            tvChart = LightweightCharts.createChart(container, {
                width: container.clientWidth,
                height: container.clientHeight,
                layout: { background: { color: '#0a0a0a' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
                crosshair: { mode: 0, vertLine: { color: 'rgba(255, 215, 0, 0.4)' }, horzLine: { color: 'rgba(255, 215, 0, 0.4)' } },
                timeScale: { rightOffset: 12, timeVisible: true, secondsVisible: false }
            });

            candleSeries = tvChart.addCandlestickSeries({
                upColor: '#00ff88', downColor: '#ff3366',
                borderUpColor: '#00ff88', borderDownColor: '#ff3366',
                wickUpColor: '#00ff88', wickDownColor: '#ff3366'
            });
            // Candles + all price-scale overlays (EMA/SMA/VWAP/BB/Ichimoku/Fibs/S-R)
            // occupy the top 72% of the chart.
            tvChart.priceScale('right').applyOptions({
                scaleMargins: { top: 0.02, bottom: 0.28 },
                borderVisible: false
            });

            volumeSeries = tvChart.addHistogramSeries({
                priceScaleId: 'vol',
                color: '#26a69a',
                priceFormat: { type: 'volume' }
            });
            // Volume sits in the 72%-84% band (middle strip), own invisible scale.
            tvChart.priceScale('vol').applyOptions({
                scaleMargins: { top: 0.72, bottom: 0.16 },
                drawTicks: false,
                borderVisible: false
            });

            // Ghost Layer for pattern projections (LIVE-SAFE-GUARDED)
            ghostSeries = tvChart.addLineSeries({
                color: 'rgba(0, 255, 255, 0.4)',
                lineWidth: 2,
                lineStyle: 3,
                priceLineVisible: false
            });

            // Indicator overlay series
            ema20Series = tvChart.addLineSeries({ color: '#ffcc00', lineWidth: 1, visible: false, title: 'EMA20', lastValueVisible: false, priceLineVisible: false });
            ema50Series = tvChart.addLineSeries({ color: '#00ccff', lineWidth: 1, visible: false, title: 'EMA50', lastValueVisible: false, priceLineVisible: false });
            ema200Series = tvChart.addLineSeries({ color: '#ff8800', lineWidth: 2, visible: false, title: 'EMA200', lastValueVisible: false, priceLineVisible: false });
            bbUpperSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.4)', lineWidth: 1, visible: false, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
            bbMiddleSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.6)', lineWidth: 1, visible: false, lastValueVisible: false, priceLineVisible: false });
            bbLowerSeries = tvChart.addLineSeries({ color: 'rgba(255,255,255,0.4)', lineWidth: 1, visible: false, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
            vwapSeries = tvChart.addLineSeries({ color: '#ff00ff', lineWidth: 2, visible: false, lastValueVisible: false, priceLineVisible: false });
            sma20Series = tvChart.addLineSeries({ color: '#00ccff', lineWidth: 1, visible: false, title: 'SMA20', lastValueVisible: false, priceLineVisible: false });
            sma50Series = tvChart.addLineSeries({ color: '#0088ff', lineWidth: 1, visible: false, title: 'SMA50', lastValueVisible: false, priceLineVisible: false });
            sma200Series = tvChart.addLineSeries({ color: '#0044cc', lineWidth: 2, visible: false, title: 'SMA200', lastValueVisible: false, priceLineVisible: false });
            // Oscillators (RSI/MACD/ATR) share the bottom 16% strip, below volume.
            // Each has its own isolated scale so the values don't fight for range.
            const OSC_MARGIN = { top: 0.84, bottom: 0 };
            rsiOverlaySeries = tvChart.addLineSeries({ color: '#ff0066', lineWidth: 1.5, visible: false, title: 'RSI', priceScaleId: 'rsi', priceFormat: { type: 'custom', formatter: v => v.toFixed(0) }, lastValueVisible: false, priceLineVisible: false });
            tvChart.priceScale('rsi').applyOptions({ scaleMargins: OSC_MARGIN, visible: false, borderVisible: false });
            macdLineSeries = tvChart.addLineSeries({ color: '#6600ff', lineWidth: 1.5, visible: false, title: 'MACD', priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
            macdSignalSeries = tvChart.addLineSeries({ color: '#ff6600', lineWidth: 1, visible: false, title: 'Signal', priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
            tvChart.priceScale('macd').applyOptions({ scaleMargins: OSC_MARGIN, visible: false, borderVisible: false });
            atrSeries = tvChart.addLineSeries({ color: '#ff9800', lineWidth: 1, visible: false, title: 'ATR', priceScaleId: 'atr', lastValueVisible: false, priceLineVisible: false });
            tvChart.priceScale('atr').applyOptions({ scaleMargins: OSC_MARGIN, visible: false, borderVisible: false });

            // Ichimoku series
            this._ichiTenkan = tvChart.addLineSeries({ color: '#00bcd4', lineWidth: 1, visible: false, title: 'Tenkan', lastValueVisible: false, priceLineVisible: false });
            this._ichiKijun = tvChart.addLineSeries({ color: '#ff5722', lineWidth: 1, visible: false, title: 'Kijun', lastValueVisible: false, priceLineVisible: false });
            this._ichiSenkouA = tvChart.addLineSeries({ color: 'rgba(76,175,80,0.5)', lineWidth: 1, visible: false, title: 'Senkou A', lastValueVisible: false, priceLineVisible: false });
            this._ichiSenkouB = tvChart.addLineSeries({ color: 'rgba(244,67,54,0.5)', lineWidth: 1, visible: false, title: 'Senkou B', lastValueVisible: false, priceLineVisible: false });

            // Trend lines (auto-detected)
            this._trendResistance = tvChart.addLineSeries({ color: '#ff3366', lineWidth: 2, visible: false, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
            this._trendSupport = tvChart.addLineSeries({ color: '#00ff88', lineWidth: 2, visible: false, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

            // Fibonacci and S/R use price lines (created dynamically)
            this._fibLines = [];
            this._srLines = [];

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
                const dir = candleData.close >= candleData.open ? '#00ff88' : '#ff3366';
                tooltipEl.innerHTML = `
                    <div style="color:#888;font-size:10px;letter-spacing:0.5px;">${dateStr}</div>
                    <div style="color:${dir};font-family:Orbitron,monospace;font-size:13px;font-weight:700;margin-top:2px;">
                        ${priceAt != null ? '$' + priceAt.toFixed(2) : '--'}
                    </div>
                    <div style="color:#aaa;font-size:10px;margin-top:4px;font-family:monospace;">
                        O ${candleData.open.toFixed(2)} &nbsp; H ${candleData.high.toFixed(2)}<br>
                        L ${candleData.low.toFixed(2)} &nbsp; C ${candleData.close.toFixed(2)}
                    </div>`;
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

            // Resize handler
            window.addEventListener('resize', () => {
                if (tvChart && container) {
                    tvChart.resize(container.clientWidth, container.clientHeight);
                }
            });

            console.log('[Chart] Initialized.');
        },

        bindControls: function() {
            // Chart type selector — switch between candlestick, line, area, bar
            const chartType = document.getElementById('chartTypeSelector');
            if (chartType) chartType.addEventListener('change', (e) => {
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
                        if (!this._lineSeries) this._lineSeries = tvChart.addLineSeries({ color: '#00ff88', lineWidth: 2 });
                        if (data.length) this._lineSeries.setData(data.map(d => ({ time: d.time, value: d.close })));
                        this._lineSeries.applyOptions({ visible: true });
                    } else if (type === 'area') {
                        if (!this._areaSeries) this._areaSeries = tvChart.addAreaSeries({
                            topColor: 'rgba(0, 255, 136, 0.4)', bottomColor: 'rgba(0, 255, 136, 0.0)',
                            lineColor: '#00ff88', lineWidth: 2
                        });
                        if (data.length) this._areaSeries.setData(data.map(d => ({ time: d.time, value: d.close })));
                        this._areaSeries.applyOptions({ visible: true });
                    } else if (type === 'bar') {
                        if (!this._barSeries) this._barSeries = tvChart.addBarSeries({
                            upColor: '#00ff88', downColor: '#ff3366'
                        });
                        if (data.length) this._barSeries.setData(data);
                        this._barSeries.applyOptions({ visible: true });
                    }
                }
                console.log('[Chart] Type:', type);
            });

            // Asset selector — sends asset_change + requests new historical data
            const assetSel = document.getElementById('assetSelector');
            if (assetSel) assetSel.addEventListener('change', (e) => {
                const socket = OGZ.get('Socket');
                if (socket) {
                    socket.send({ type: 'asset_change', asset: e.target.value });
                    this.clearAll();
                    setTimeout(() => {
                        const tf = document.getElementById('timeframeSelector')?.value || '1m';
                        socket.send({ type: 'request_historical', timeframe: tf, asset: e.target.value, limit: 500 });
                    }, 500);
                }
                console.log('[Chart] Asset:', e.target.value);
            });

            // Timeframe selector — sends timeframe_change + requests new historical data
            const tfSel = document.getElementById('timeframeSelector');
            if (tfSel) tfSel.addEventListener('change', (e) => {
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
                chk.addEventListener('change', () => {
                    activeOverlays = [];
                    document.querySelectorAll('#indicatorCheckboxes input:checked').forEach(c => activeOverlays.push(c.value));
                    this.toggleIndicators(activeOverlays);
                    if (storedCandles.length > 0) this.calculateIndicators(storedCandles);
                    console.log('[Chart] Indicators:', activeOverlays);
                });
            });

            // Tier selector
            const tierSel = document.getElementById('tierSelector');
            if (tierSel) tierSel.addEventListener('change', (e) => {
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
                            color: level.type === 'resistance' ? '#ff3366' : '#00ff88',
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
            wallLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch(e){} });
            tpoLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch(e){} });
            wallLines = []; tpoLines = [];
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
                volumeSeries.update({
                    time: timeAligned,
                    value: candle.volume || candle.v,
                    color: tickClose >= tickOpen ? 'rgba(0, 255, 136, 0.35)' : 'rgba(255, 51, 102, 0.35)'
                });
            }

            // Live price readout + subtle tick flash so you can SEE it updating
            if (price != null) {
                OGZ.state.lastPriceDelta = price - OGZ.state.lastPrice;
                OGZ.state.lastPrice = price;
                const priceEl = document.getElementById('currentPrice');
                if (priceEl) {
                    priceEl.textContent = `$${price.toLocaleString()}`;
                    const up = OGZ.state.lastPriceDelta >= 0;
                    priceEl.style.transition = 'color 0.08s ease, text-shadow 0.08s ease';
                    priceEl.style.color = up ? '#00ff88' : '#ff3366';
                    priceEl.style.textShadow = up
                        ? '0 0 12px rgba(0,255,136,0.75)'
                        : '0 0 12px rgba(255,51,102,0.75)';
                    clearTimeout(priceEl._flashTimer);
                    priceEl._flashTimer = setTimeout(() => {
                        priceEl.style.textShadow = '';
                    }, 180);
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
                        color: `rgba(255, 215, 0, ${Math.min(level.weight * 0.01, 0.15)})`,
                        lineWidth: 1, lineStyle: 0, axisLabelVisible: false
                    });
                    tpoLines.push(line);
                });
            }

            // Whale Walls
            if (data.walls) {
                data.walls.forEach(wall => {
                    const color = wall.side === 'BID' ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 51, 102, 0.4)';
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

                // Set volume data
                if (volumeSeries) {
                    volumeSeries.setData(formatted.map(c => ({
                        time: c.time,
                        value: c.volume,
                        color: c.close >= c.open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)'
                    })));
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
