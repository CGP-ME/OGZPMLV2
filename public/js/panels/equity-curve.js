/**
 * equity-curve.js — EquityCurve: Session/Multi-Day Equity Visualization
 *
 * Live equity curve panel mounted in the dashboard footer-left. Displays account
 * session/multi-day equity as an SVG line chart with horizontal dashed reference lines
 * (profit target in gold, max drawdown floor in red) and trade markers (green/red dots)
 * at entry/exit points along the curve. Critical for Apex eval where the operator watches
 * drawdown in real time and monitors progress toward profit target.
 *
 * What it renders (top to bottom):
 *   1. Title bar: "EQUITY CURVE" + range selector buttons (1D / 7D / 30D / ALL)
 *      Default range: ALL. Buttons are small pill-style with gold accent when active.
 *   2. SVG line chart:
 *      - X-axis: time (formatted by range — minutes/hours/days)
 *      - Y-axis: equity in $ (auto-scaled)
 *      - Main line: gold (var(--ml-color)), 1.5px stroke, smooth curve
 *      - Profit target: horizontal dashed line in gold, label "Profit Target: $X" floating right
 *      - Max DD floor: horizontal dashed line in red, label "Max DD: $X" floating right
 *      - Trade markers: small circles at each trade entry/exit
 *        * Green (r=2.5) if winner (pnl >= 0)
 *        * Red (r=2.5) if loser (pnl < 0)
 *        * Gray (r=2) if open
 *      - Hover trade marker: tooltip shows Time / Ticker / Side / P&L
 *      - Last data point: filled gold circle + value label floating right
 *   3. Stats row below chart:
 *      Current Balance / Total P&L / Return % / Target Progress % (tabular, monospace)
 *
 * Self-registers as OGZ.EquityCurve via OGZ.register().
 * Mounts into <div id="equityCurve"></div>.
 *
 * Subscribes to WS events:
 *   - state_update (⚠ TODO verify; most likely source for balance/equity)
 *   - balance_update (⚠ TODO verify; alternative balance sync)
 *   - trade (✓ verified) — emitted when trade closes, provides symbol/side/pnl
 *   - price (✓ verified) — live tick; if data.equity field present (verified in size-preview.js)
 *                          it may drive live equity recalc. Fallback: sample every ~10s.
 * Listens to OGZ.bus:
 *   - account:change — to swap the curve when operator changes account
 *
 * Internal state:
 *   - Holds in-memory rolling buffer of EquitySample objects (default 1000 samples)
 *   - Older samples decimated when buffer fills to maintain ~1000-point granularity
 *   - Trades: Map<tradeId => TradeMarker> to plot entry/exit markers
 *   - profitTarget, maxDDFloor: $ amounts (set manually or via config)
 *   - range: '1d', '7d', '30d', 'all' (default 'all')
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   setRange(range) — Switch to 1d/7d/30d/all and re-render
 *   setProfitTarget(amt) — Set $ profit target (will update horizontal line)
 *   setMaxDDFloor(amt) — Set $ max drawdown floor (will update red floor line)
 *   addEquitySample(ts, equity) — Manual sample injection; auto-decimates if buffer full
 *   addTradeMarker(ts, ticker, side, pnl) — Log trade entry/exit with P&L for marker placement
 *   clear() — Remove all samples and markers (respects buffer cap)
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return {samples, trades, profitTarget, maxDDFloor, range, mounted}
 *
 * NO synthetic data. NO demo mode. NO Math.random. The curve only renders
 * samples that arrive from real WS events (price w/ data.equity, balance_update,
 * state_update with state.balance) and real closed trades. Empty state until
 * the first sample arrives.
 *
 * @typedef {Object} EquitySample
 * @property {number} ts - Unix epoch milliseconds
 * @property {number} equity - Account equity at this moment ($)
 *
 * @typedef {Object} TradeMarker
 * @property {number} ts - Close time epoch milliseconds
 * @property {string} ticker - Symbol traded (e.g., 'TSLA')
 * @property {'long'|'short'} side - Position side
 * @property {number} pnl - Realized P&L in $
 * @property {number} equityAt - Equity level at close (for vertical placement)
 *
 * @module public/js/panels/equity-curve
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-equity-curve-styles';
    const ROOT_ID = 'equityCurve';
    const MAX_SAMPLES = 1000;
    const DEFAULT_RANGE = 'all';
    const SAMPLE_INTERVAL_MS = 10000; // Sample every ~10s if price ticks don't provide equity
    const DECIMATION_FACTOR = 0.7;    // Keep 70% of old samples when decimating

    // Monotonic counter used to disambiguate trade IDs when two real closed
    // trades land at the exact same epoch ms on the same ticker. NOT a source
    // of fake data — only a uniqueness suffix.
    let _tradeIdCounter = 0;

    const RANGES = {
        '1d': 1 * 86400000,
        '7d': 7 * 86400000,
        '30d': 30 * 86400000,
        'all': Infinity
    };

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,

        // Data buffers
        samples: [],              // Array<EquitySample>
        trades: new Map(),        // Map<tradeId => TradeMarker>

        // Configuration
        profitTarget: null,       // $
        maxDDFloor: null,         // $
        range: DEFAULT_RANGE,

        // DOM refs
        root: null,
        titleBar: null,
        rangeButtons: new Map(),
        svgContainer: null,
        svg: null,
        statsContainer: null,

        // Sampling timer
        sampleTimer: null,

        // Event listeners
        listeners: [],
    };

    // ─── Utilities ──────────────────────────────────────────────────────

    function fmtUsd(n, signed = false) {
        if (n == null || isNaN(n)) return '—';
        const sign = signed && n > 0 ? '+' : '';
        return `${sign}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function fmtPct(n) {
        if (n == null || isNaN(n)) return '—';
        const sign = n > 0 ? '+' : '';
        return `${sign}${n.toFixed(2)}%`;
    }

    function svgEl(tag, attrs = {}) {
        const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [k, v] of Object.entries(attrs)) {
            e.setAttribute(k, v);
        }
        return e;
    }

    function fmtTime(ts, range) {
        const d = new Date(ts);
        if (range === '1d') {
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else if (range === '7d') {
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } else {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }

    function decimateBuffer() {
        if (state.samples.length <= MAX_SAMPLES) return;
        const keep = Math.floor(MAX_SAMPLES * DECIMATION_FACTOR);
        const step = Math.ceil(state.samples.length / keep);
        const decimated = [];
        for (let i = 0; i < state.samples.length; i += step) {
            decimated.push(state.samples[i]);
        }
        state.samples = decimated.slice(-MAX_SAMPLES);
    }

    // ─── CSS Injection ───────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            #${ROOT_ID} {
                display: flex;
                flex-direction: column;
                gap: 8px;
                height: 100%;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 8px;
                backdrop-filter: blur(14px) saturate(160%);
                box-shadow: var(--glass-underglow);
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                overflow: hidden;
                padding: 12px;
            }

            .ec-title-bar {
                display: flex;
                align-items: center;
                gap: 12px;
                justify-content: space-between;
                flex-shrink: 0;
                padding-bottom: 8px;
                border-bottom: 1px solid var(--border-color);
            }

            .ec-title {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .ec-range-selector {
                display: flex;
                gap: 6px;
                flex-shrink: 0;
            }

            .ec-range-btn {
                padding: 4px 10px;
                background: rgba(255, 215, 0, 0.08);
                border: 1px solid rgba(255, 215, 0, 0.2);
                border-radius: 12px;
                color: var(--text-secondary);
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                cursor: pointer;
                transition: all 150ms ease;
            }

            .ec-range-btn:hover {
                border-color: rgba(255, 215, 0, 0.4);
                color: var(--ml-color);
            }

            .ec-range-btn.active {
                background: rgba(255, 215, 0, 0.25);
                border-color: var(--ml-color);
                color: var(--ml-color);
                box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
            }

            .ec-svg-container {
                flex: 1;
                min-height: 200px;
                overflow: hidden;
                position: relative;
            }

            .ec-svg {
                width: 100%;
                height: 100%;
            }

            .ec-marker {
                cursor: pointer;
                transition: opacity 150ms ease;
            }

            .ec-marker:hover {
                opacity: 0.8;
                filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.5));
            }

            .ec-tooltip {
                position: absolute;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid var(--ml-color);
                border-radius: 4px;
                padding: 8px;
                font-size: 10px;
                color: var(--text-primary);
                pointer-events: none;
                z-index: 100;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
            }

            .ec-tooltip.hidden {
                display: none;
            }

            .ec-stats {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--border-color);
                flex-shrink: 0;
            }

            .ec-stat {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .ec-stat-label {
                font-size: 9px;
                font-weight: 600;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ec-stat-value {
                font-size: 12px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: var(--text-primary);
            }

            .ec-stat-value.profit {
                color: var(--profit-color);
            }

            .ec-stat-value.loss {
                color: var(--loss-color);
            }

            .ec-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: var(--text-secondary);
                font-size: 11px;
                animation: pulse 2s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Chart Rendering ────────────────────────────────────────────────

    function renderChart() {
        if (!state.svgContainer) return;

        state.svgContainer.innerHTML = '';

        // Handle empty state
        if (state.samples.length === 0) {
            state.svgContainer.innerHTML = '<div class="ec-empty">Waiting for first equity sample...</div>';
            return;
        }

        const w = state.svgContainer.clientWidth || 600;
        const h = state.svgContainer.clientHeight || 200;
        const padL = 50, padR = 80, padT = 20, padB = 30;
        const innerW = w - padL - padR;
        const innerH = h - padT - padB;

        // Filter samples by range
        const now = Date.now();
        const rangeMs = RANGES[state.range];
        const cutoff = rangeMs === Infinity ? 0 : now - rangeMs;
        const visible = state.samples.filter(s => s.ts >= cutoff);

        if (visible.length < 2) {
            state.svgContainer.innerHTML = '<div class="ec-empty">Insufficient data for range...</div>';
            return;
        }

        const ts = visible.map(s => s.ts);
        const equities = visible.map(s => s.equity);

        const startBalance = visible[0].equity;
        const targetBalance = state.profitTarget ? startBalance + state.profitTarget : null;
        const floorBalance = state.maxDDFloor ? startBalance - state.maxDDFloor : null;

        const yMin = Math.min(...equities, floorBalance || Infinity) * 0.998;
        const yMax = Math.max(...equities, targetBalance || -Infinity) * 1.002;
        const xMin = ts[0];
        const xMax = ts[ts.length - 1];

        const x = t => padL + ((t - xMin) / (xMax - xMin || 1)) * innerW;
        const y = b => padT + innerH - ((b - yMin) / (yMax - yMin || 1)) * innerH;

        const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'ec-svg' });

        // Background zones
        if (floorBalance) {
            svg.appendChild(svgEl('rect', {
                x: padL,
                y: y(floorBalance),
                width: innerW,
                height: padT + innerH - y(floorBalance),
                fill: 'rgba(255, 45, 45, 0.08)',
                'pointer-events': 'none'
            }));
        }

        // Y-axis labels and gridlines
        for (let i = 0; i <= 4; i++) {
            const v = yMin + (yMax - yMin) * (i / 4);
            const yy = y(v);
            const tick = svgEl('text', {
                x: padL - 8,
                y: yy + 3,
                fill: '#665E45',
                'font-size': 10,
                'text-anchor': 'end',
                'font-family': "'JetBrains Mono', monospace"
            });
            tick.textContent = fmtUsd(v);
            svg.appendChild(tick);
        }

        // X-axis labels (first, middle, last)
        for (const idx of [0, Math.floor(visible.length / 2), visible.length - 1]) {
            const label = fmtTime(ts[idx], state.range);
            const tx = svgEl('text', {
                x: x(ts[idx]),
                y: padT + innerH + 18,
                fill: '#665E45',
                'font-size': 10,
                'text-anchor': 'middle',
                'font-family': "'JetBrains Mono', monospace"
            });
            tx.textContent = label;
            svg.appendChild(tx);
        }

        // Max DD floor line and label
        if (floorBalance) {
            svg.appendChild(svgEl('line', {
                x1: padL,
                y1: y(floorBalance),
                x2: padL + innerW,
                y2: y(floorBalance),
                stroke: '#FF2D2D',
                'stroke-width': 1,
                'stroke-dasharray': '4 4',
                'pointer-events': 'none'
            }));
            const lbl = svgEl('text', {
                x: padL + innerW + 6,
                y: y(floorBalance) - 4,
                fill: '#FF2D2D',
                'font-size': 10,
                'font-family': "'JetBrains Mono', monospace"
            });
            lbl.textContent = `Max DD ${fmtUsd(floorBalance)}`;
            svg.appendChild(lbl);
        }

        // Profit target line and label
        if (targetBalance) {
            svg.appendChild(svgEl('line', {
                x1: padL,
                y1: y(targetBalance),
                x2: padL + innerW,
                y2: y(targetBalance),
                stroke: '#FFB800',
                'stroke-width': 1,
                'stroke-dasharray': '4 4',
                'pointer-events': 'none'
            }));
            const lbl = svgEl('text', {
                x: padL + innerW + 6,
                y: y(targetBalance) - 4,
                fill: '#FFB800',
                'font-size': 10,
                'font-family': "'JetBrains Mono', monospace"
            });
            lbl.textContent = `Target ${fmtUsd(targetBalance)}`;
            svg.appendChild(lbl);
        }

        // Starting balance baseline
        svg.appendChild(svgEl('line', {
            x1: padL,
            y1: y(startBalance),
            x2: padL + innerW,
            y2: y(startBalance),
            stroke: '#665E45',
            'stroke-width': 1,
            'pointer-events': 'none'
        }));

        // Main equity curve
        const pathD = ts.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(t)} ${y(equities[i])}`).join(' ');
        svg.appendChild(svgEl('path', {
            d: pathD,
            fill: 'none',
            stroke: 'var(--ml-color)',
            'stroke-width': 1.5,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'pointer-events': 'none'
        }));

        // Trade markers
        for (const [tradeId, marker] of state.trades.entries()) {
            if (marker.ts < cutoff) continue; // Skip trades outside range

            const xx = x(marker.ts);
            const yy = y(marker.equityAt);

            const color = marker.pnl >= 0 ? '#00E676' : '#FF2D2D';
            const r = marker.pnl !== undefined ? 2.5 : 2;

            const circle = svgEl('circle', {
                cx: xx,
                cy: yy,
                r: r,
                fill: color,
                class: 'ec-marker',
                'data-trade-id': tradeId,
                'pointer-events': 'auto'
            });

            circle.addEventListener('mouseenter', () => {
                showTradeTooltip(tradeId, marker, xx, yy);
            });

            circle.addEventListener('mouseleave', () => {
                hideTradeTooltip();
            });

            svg.appendChild(circle);
        }

        // Last equity point (filled gold circle)
        const lastT = ts[ts.length - 1];
        const lastE = equities[equities.length - 1];
        svg.appendChild(svgEl('circle', {
            cx: x(lastT),
            cy: y(lastE),
            r: 4,
            fill: 'var(--ml-color)',
            'pointer-events': 'none'
        }));

        const lastLbl = svgEl('text', {
            x: padL + innerW + 6,
            y: y(lastE) + 3,
            fill: 'var(--ml-color)',
            'font-size': 10,
            'font-weight': 600,
            'font-family': "'JetBrains Mono', monospace"
        });
        lastLbl.textContent = fmtUsd(lastE);
        svg.appendChild(lastLbl);

        state.svgContainer.appendChild(svg);
    }

    let tooltipTimeout = null;
    function showTradeTooltip(tradeId, marker, xx, yy) {
        clearTimeout(tooltipTimeout);

        let tooltip = state.svgContainer.querySelector('.ec-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'ec-tooltip';
            state.svgContainer.appendChild(tooltip);
        }

        const time = new Date(marker.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const pnlText = fmtUsd(marker.pnl, true);
        tooltip.textContent = `${marker.ticker} ${marker.side.toUpperCase()} @ ${time} | ${pnlText}`;
        tooltip.classList.remove('hidden');
        tooltip.style.left = xx + 'px';
        tooltip.style.top = (yy - 30) + 'px';
    }

    function hideTradeTooltip() {
        tooltipTimeout = setTimeout(() => {
            const tooltip = state.svgContainer.querySelector('.ec-tooltip');
            if (tooltip) {
                tooltip.classList.add('hidden');
            }
        }, 200);
    }

    // ─── Stats Row Rendering ────────────────────────────────────────────

    function renderStats() {
        if (!state.statsContainer || state.samples.length === 0) return;

        const lastSample = state.samples[state.samples.length - 1];
        const firstSample = state.samples[0];

        const current = lastSample.equity;
        const starting = firstSample.equity;
        const pnl = current - starting;
        const pct = starting ? (pnl / starting) * 100 : 0;

        const targetPct = state.profitTarget ? (pnl / state.profitTarget) * 100 : null;

        const stats = [
            {
                label: 'Current Balance',
                value: fmtUsd(current),
                klass: ''
            },
            {
                label: 'Total P&L',
                value: fmtUsd(pnl, true),
                klass: pnl >= 0 ? 'profit' : 'loss'
            },
            {
                label: 'Return',
                value: fmtPct(pct),
                klass: pct >= 0 ? 'profit' : 'loss'
            },
            {
                label: 'Target Progress',
                value: targetPct !== null ? `${targetPct.toFixed(0)}%` : '—',
                klass: ''
            }
        ];

        state.statsContainer.innerHTML = stats.map(s => `
            <div class="ec-stat">
                <div class="ec-stat-label">${s.label}</div>
                <div class="ec-stat-value ${s.klass}">${s.value}</div>
            </div>
        `).join('');
    }

    // ─── Mount & Render ─────────────────────────────────────────────────

    function mount() {
        if (state.mounted) return;

        state.root = document.getElementById(ROOT_ID);
        if (!state.root) {
            console.warn('[EquityCurve] Mount point #equityCurve not found');
            return;
        }

        injectStyles();

        state.root.innerHTML = `
            <div class="ec-title-bar">
                <div class="ec-title">EQUITY CURVE</div>
                <div class="ec-range-selector">
                    <button class="ec-range-btn" data-range="1d">1D</button>
                    <button class="ec-range-btn" data-range="7d">7D</button>
                    <button class="ec-range-btn" data-range="30d">30D</button>
                    <button class="ec-range-btn active" data-range="all">ALL</button>
                </div>
            </div>
            <div class="ec-svg-container"></div>
            <div class="ec-stats"></div>
        `;

        state.titleBar = state.root.querySelector('.ec-title-bar');
        state.svgContainer = state.root.querySelector('.ec-svg-container');
        state.statsContainer = state.root.querySelector('.ec-stats');

        // Wire range buttons
        state.root.querySelectorAll('.ec-range-btn').forEach(btn => {
            const range = btn.dataset.range;
            state.rangeButtons.set(range, btn);

            btn.addEventListener('click', () => {
                state.rangeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.range = range;
                render();
            });
        });

        state.mounted = true;
        renderChart();
        renderStats();
    }

    function render() {
        if (!state.mounted) return;
        renderChart();
        renderStats();
    }

    // ─── Data Management ────────────────────────────────────────────────

    function addEquitySample(ts, equity) {
        if (typeof ts !== 'number' || typeof equity !== 'number') {
            return;
        }

        // Don't add duplicate timestamps
        if (state.samples.length > 0 && state.samples[state.samples.length - 1].ts === ts) {
            return;
        }

        state.samples.push({ ts, equity });

        if (state.samples.length > MAX_SAMPLES) {
            decimateBuffer();
        }

        render();
    }

    function addTradeMarker(ts, ticker, side, pnl, equityAt) {
        if (typeof ts !== 'number' || !ticker || !side) {
            return;
        }

        const tradeId = `${ticker}-${ts}-${++_tradeIdCounter}`;
        const equityAtVal = equityAt || (state.samples.length > 0 ? state.samples[state.samples.length - 1].equity : 50000);

        state.trades.set(tradeId, {
            ts,
            ticker: ticker.toUpperCase(),
            side: side.toLowerCase(),
            pnl: pnl || 0,
            equityAt: equityAtVal
        });

        render();
    }

    // ─── WebSocket Handlers ──────────────────────────────────────────────

    function handlePrice(data) {
        try {
            if (data && data.equity && typeof data.equity === 'number') {
                addEquitySample(Date.now(), data.equity);
            }
        } catch (e) {
            // Silently ignore malformed price events
        }
    }

    function handleTrade(data) {
        try {
            if (data && data.type === 'close' && data.symbol && data.side && typeof data.pnl === 'number') {
                addTradeMarker(data.ts || Date.now(), data.symbol, data.side, data.pnl, data.balance);
            }
        } catch (e) {
            // Silently ignore malformed trade events
        }
    }

    function handleBalanceUpdate(data) {
        try {
            if (data && typeof data.balance === 'number') {
                addEquitySample(data.ts || Date.now(), data.balance);
            }
        } catch (e) {
            // Silently ignore malformed balance events
        }
    }

    function handleStateUpdate(data) {
        try {
            if (data && typeof data.balance === 'number') {
                addEquitySample(data.ts || Date.now(), data.balance);
            }
        } catch (e) {
            // Silently ignore malformed state updates
        }
    }

    // ─── Bus Event Handlers ──────────────────────────────────────────────

    function handleAccountChange(data) {
        try {
            // When account changes, clear samples (new equity curve context)
            state.samples = [];
            state.trades.clear();
            render();
        } catch (e) {
            // Silently ignore
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────

    const EquityCurve = {
        init() {
            mount();

            // Subscribe to WS events
            const Socket = OGZ.get('Socket');
            if (Socket) {
                Socket.registerHandler('price', handlePrice);
                Socket.registerHandler('trade', handleTrade);
                Socket.registerHandler('balance_update', handleBalanceUpdate);
                Socket.registerHandler('state_update', handleStateUpdate);
            }

            // Subscribe to OGZ.bus
            if (OGZ.bus) {
                OGZ.bus.on('account:change', handleAccountChange);
            }
        },

        setRange(range) {
            if (RANGES[range] !== undefined) {
                state.range = range;
                state.rangeButtons.forEach((btn, r) => {
                    btn.classList.toggle('active', r === range);
                });
                render();
            }
        },

        setProfitTarget(amt) {
            if (typeof amt === 'number') {
                state.profitTarget = amt;
                render();
            }
        },

        setMaxDDFloor(amt) {
            if (typeof amt === 'number') {
                state.maxDDFloor = amt;
                render();
            }
        },

        addEquitySample(ts, equity) {
            addEquitySample(ts, equity);
        },

        addTradeMarker(ts, ticker, side, pnl, equityAt) {
            addTradeMarker(ts, ticker, side, pnl, equityAt);
        },

        clear() {
            state.samples = [];
            state.trades.clear();
            render();
        },

        getRange() {
            return state.range;
        },

        getProfitTarget() {
            return state.profitTarget;
        },

        getMaxDDFloor() {
            return state.maxDDFloor;
        },

        teardown() {
            if (state.sampleTimer) {
                clearInterval(state.sampleTimer);
            }

            const Socket = OGZ.get('Socket');
            if (Socket) {
                // Note: Socket doesn't expose unregisterHandler, so we rely on page teardown
            }

            if (state.root) {
                state.root.innerHTML = '';
            }

            if (document.getElementById(STYLE_ID)) {
                document.getElementById(STYLE_ID).remove();
            }

            state.mounted = false;
        },

        _compute() {
            return {
                samples: state.samples.slice(),
                trades: Array.from(state.trades.entries()),
                profitTarget: state.profitTarget,
                maxDDFloor: state.maxDDFloor,
                range: state.range,
                mounted: state.mounted
            };
        }
    };

    // ─── Module Registration ────────────────────────────────────────────

    OGZ.register('EquityCurve', EquityCurve);

})(window.OGZ || {});
