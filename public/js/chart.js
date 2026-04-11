/**
 * chart.js - High-Performance Chart Rendering
 * LightweightCharts with Ghost projections, TPO heatmap, and flicker fix
 */
(function(OGZ) {
    'use strict';

    let tvChart, candleSeries, volumeSeries, ghostSeries;
    let tpoLines = [], wallLines = [];

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

            volumeSeries = tvChart.addHistogramSeries({
                priceScaleId: 'volume',
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                scaleMargins: { top: 0.85, bottom: 0 }
            });

            // Ghost Layer for pattern projections (LIVE-SAFE-GUARDED)
            ghostSeries = tvChart.addLineSeries({
                color: 'rgba(0, 255, 255, 0.4)',
                lineWidth: 2,
                lineStyle: 3,
                priceLineVisible: false
            });

            // Flicker Fix: maintain live price display during crosshair hover
            tvChart.subscribeCrosshairMove(param => {
                const priceEl = document.getElementById('currentPrice');
                if (!priceEl) return;
                if (!param.time || !param.seriesData.get(candleSeries)) {
                    // Crosshair left chart area — show persistent dollar price
                    priceEl.textContent = `$${OGZ.state.lastPrice.toLocaleString()}`;
                    return;
                }
                // Crosshair over valid candle — show OHLC
                const d = param.seriesData.get(candleSeries);
                priceEl.textContent = `O:${d.open.toFixed(2)} H:${d.high.toFixed(2)} L:${d.low.toFixed(2)} C:${d.close.toFixed(2)}`;
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
            // Chart type selector
            const chartType = document.getElementById('chartTypeSelector');
            if (chartType) chartType.addEventListener('change', (e) => {
                console.log('[Chart] Type:', e.target.value);
                // Chart type switching handled by LightweightCharts
            });

            // Asset selector — sends asset_change + requests new historical data
            const assetSel = document.getElementById('assetSelector');
            if (assetSel) assetSel.addEventListener('change', (e) => {
                const socket = OGZ.get('Socket');
                if (socket) {
                    socket.send({ type: 'asset_change', asset: e.target.value });
                    // Clear chart and request new data
                    if (candleSeries) candleSeries.setData([]);
                    if (volumeSeries) volumeSeries.setData([]);
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
                    // Clear and reload
                    if (candleSeries) candleSeries.setData([]);
                    if (volumeSeries) volumeSeries.setData([]);
                    socket.send({
                        type: 'request_historical',
                        timeframe: e.target.value,
                        asset: document.getElementById('assetSelector')?.value || 'BTC-USD',
                        limit: 500
                    });
                }
                console.log('[Chart] Timeframe:', e.target.value);
            });

            // Indicator checkboxes
            document.querySelectorAll('#indicatorCheckboxes input[type="checkbox"]').forEach(chk => {
                chk.addEventListener('change', () => {
                    const active = [];
                    document.querySelectorAll('#indicatorCheckboxes input:checked').forEach(c => active.push(c.value));
                    const socket = OGZ.get('Socket');
                    if (socket) socket.send({ type: 'indicator_selection', indicators: active });
                    console.log('[Chart] Indicators:', active);
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

        update: (d) => {
            if (!candleSeries) return;
            const candle = d.candle || d;
            const t = Math.floor((candle.timestamp || candle.t || Date.now()) / 1000);
            const timeAligned = Math.floor(t / 60) * 60;
            candleSeries.update({
                time: timeAligned,
                open: candle.open || candle.o,
                high: candle.high || candle.h,
                low: candle.low || candle.l,
                close: candle.close || candle.c
            });
            if (candle.volume || candle.v) {
                const close = candle.close || candle.c;
                const open = candle.open || candle.o;
                volumeSeries.update({
                    time: timeAligned,
                    value: candle.volume || candle.v,
                    color: close >= open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)'
                });
            }
            // Update live price display
            const price = candle.close || candle.c;
            if (price) {
                OGZ.state.lastPriceDelta = price - OGZ.state.lastPrice;
                OGZ.state.lastPrice = price;
                const priceEl = document.getElementById('currentPrice');
                if (priceEl) priceEl.textContent = `$${price.toLocaleString()}`;
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
                const formatted = candles.map(c => ({
                    time: Math.floor((c.time || c.t || c.timestamp || 0) / (c.time > 1e12 || c.t > 1e12 || c.timestamp > 1e12 ? 1000 : 1)),
                    open: c.open || c.o || 0,
                    high: c.high || c.h || 0,
                    low: c.low || c.l || 0,
                    close: c.close || c.c || 0
                })).filter(c => c.time > 0 && c.open > 0);
                if (formatted.length > 0) candleSeries.setData(formatted);
            } catch (e) {
                console.error('[Chart] loadHistorical error:', e.message);
            }
        },

        getChart: () => tvChart,
        getSeries: () => ({ candle: candleSeries, volume: volumeSeries, ghost: ghostSeries })
    };

    OGZ.register('Chart', Chart);
})(window.OGZ);
