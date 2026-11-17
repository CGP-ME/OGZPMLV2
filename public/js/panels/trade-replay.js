/**
 * trade-replay.js — TradeReplay: White-Box Trade Analysis Modal
 *
 * Displays persisted, account-scoped replay facts requested through OGZ.Socket.
 * LiveReport and ChartPanel supply the confirmed order ID and scope.
 * Saved candle windows and actual event times drive the chart markers.
 * Unrecorded reasoning and missing replay data remain visibly unavailable.
 * The legacy TradeLog does not expose getTrade/getAllTrades; its obsolete
 * delegation hook is removed rather than pretending that interface exists.
 *
 * Public API:
 *   init() — Register saved-replay responses and inject styles
 *   openReplay(tradeData) — Programmatically open with a Trade object
 *   close() — Close modal and clean up
 *   setOnOpen(cb) — Register callback when modal opens
 *   setOnClose(cb) — Register callback when modal closes
 *   teardown() — Full cleanup (DOM, listeners, styles)
 *
 * @typedef {Object} TradeRecord
 * @property {string} id
 * @property {string} symbol
 * @property {string} broker - 'alpaca' | 'kraken' | etc
 * @property {'long'|'short'} side
 * @property {number} entry - entry price
 * @property {number} exit - exit price
 * @property {number} entryTs - epoch ms
 * @property {number} exitTs - epoch ms
 * @property {number} pnl - dollars
 * @property {number} pnlPercent
 * @property {string} [strategy] - e.g., 'Strategy-A'
 * @property {string} [pattern] - e.g., 'double_bottom'
 * @property {number} [confidence] - recorded percentage, 0..100
 * @property {string[]} [narratorLines] - reasoning lines from around entry time
 * @property {Object} [indicatorsAtEntry] - { rsi, macd, atr, volume }
 * @property {string} [newsContext] - news headline or 'Clean'
 * @property {string} [whaleContext] - whale activity or 'None detected'
 *
 * @module public/js/panels/trade-replay
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────────
    const MODULE_NAME = 'TradeReplay';
    const STYLE_ID = 'ogz-trade-replay-styles';
    const MODAL_ROOT_ID = 'tradeReplayModal';
    const Z_INDEX_MODAL = 9998;
    const Z_INDEX_BACKDROP = Z_INDEX_MODAL - 1;
    const MINI_CHART_W = 400;
    const MINI_CHART_H = 220;
    const CANDLE_COUNT = 30;
    const FADE_MS = 200;

    // NO synthetic candle generation. If real candles aren't available from
    // ChartPanel, the chart area renders an honest empty state. We never
    // fabricate price data.

    // ─── Private State ──────────────────────────────────────────────────────
    const state = {
        mounted: false,
        modalOpen: false,
        currentTrade: null,
        backdropEl: null,
        modalEl: null,
        contentEl: null,

        // Trade navigation
        allTrades: [],
        currentTradeIndex: -1,

        // Callbacks
        onOpenCallback: null,
        onCloseCallback: null,

        // Event listeners to clean up
        listeners: [],
    };

    // ─── CSS Injection ──────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            /* Backdrop */
            .tr-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: ${Z_INDEX_BACKDROP};
                opacity: 0;
                animation: tr-fade-in ${FADE_MS}ms ease-out forwards;
            }

            @keyframes tr-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            /* Modal Container */
            #${MODAL_ROOT_ID} {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: ${Z_INDEX_MODAL};
                max-width: 1100px;
                width: 95vw;
                max-height: 90vh;
                overflow-y: auto;
                background: rgba(15, 15, 18, 0.75);
                backdrop-filter: blur(14px) saturate(160%);
                -webkit-backdrop-filter: blur(14px) saturate(160%);
                border: 1px solid rgba(255, 215, 0, 0.25);
                border-radius: 8px;
                box-shadow: 0 8px 40px -6px rgba(255, 215, 0, 0.4),
                            0 1px 0 0 rgba(255, 215, 0, 0.1) inset;
                opacity: 0;
                animation: tr-modal-enter ${FADE_MS}ms ease-out forwards;
            }

            @keyframes tr-modal-enter {
                from {
                    opacity: 0;
                    transform: translate(-50%, -48%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }

            /* Modal Header */
            .tr-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 215, 0, 0.15);
                background: rgba(0, 0, 0, 0.2);
                flex-shrink: 0;
            }

            .tr-header-summary {
                display: flex;
                align-items: center;
                gap: 12px;
                font-family: 'Orbitron', monospace;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.04em;
                color: var(--text-primary);
            }

            .tr-header-symbol {
                color: var(--ml-color);
                font-size: 14px;
            }

            .tr-header-side {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                padding: 2px 6px;
                border-radius: 3px;
                background: rgba(0, 0, 0, 0.3);
            }

            .tr-header-side.long {
                color: var(--profit-color);
                border: 1px solid rgba(34, 197, 94, 0.3);
            }

            .tr-header-side.short {
                color: var(--loss-color);
                border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .tr-header-prices {
                color: var(--text-secondary);
                font-size: 11px;
                margin-left: 8px;
            }

            .tr-header-pnl {
                margin-left: auto;
                text-align: right;
                font-size: 12px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 3px;
                background: rgba(0, 0, 0, 0.2);
            }

            .tr-header-pnl.win {
                color: var(--profit-color);
                border: 1px solid rgba(34, 197, 94, 0.25);
            }

            .tr-header-pnl.loss {
                color: var(--loss-color);
                border: 1px solid rgba(239, 68, 68, 0.25);
            }

            .tr-close-btn {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                font-size: 16px;
                padding: 0;
                margin-left: 16px;
                transition: all 0.2s ease;
            }

            .tr-close-btn:hover {
                color: var(--ml-color);
                transform: scale(1.15);
            }

            /* Main Content */
            .tr-content {
                display: flex;
                gap: 12px;
                padding: 16px;
                flex: 1;
                min-height: 0;
            }

            /* Left: Mini Chart */
            .tr-chart-side {
                flex: 0 0 60%;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .tr-chart-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary);
                margin-bottom: 2px;
            }

            .tr-mini-chart {
                width: 100%;
                max-width: ${MINI_CHART_W}px;
                height: ${MINI_CHART_H}px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(0, 204, 255, 0.2);
                border-radius: 4px;
                overflow: hidden;
                flex: 1;
            }

            .tr-mini-chart svg {
                display: block;
                width: 100%;
                height: 100%;
            }

            /* Right: Reasoning Panel */
            .tr-reasoning-side {
                flex: 0 0 40%;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding-left: 12px;
                border-left: 1px solid rgba(255, 215, 0, 0.1);
                max-height: 400px;
                overflow-y: auto;
            }

            .tr-reasoning-row {
                display: flex;
                flex-direction: column;
                gap: 3px;
                padding: 6px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            }

            .tr-reasoning-row:last-child {
                border-bottom: none;
            }

            .tr-reasoning-label {
                font-size: 8px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary);
            }

            .tr-reasoning-value {
                font-size: 11px;
                color: var(--text-primary);
                font-family: 'JetBrains Mono', monospace;
                word-break: break-word;
            }

            .tr-reasoning-value.highlight {
                color: var(--ml-color);
                font-weight: 500;
            }

            /* Narrator lines section */
            .tr-narrator-section {
                margin-top: 4px;
                padding-top: 8px;
                border-top: 1px solid rgba(255, 215, 0, 0.15);
            }

            .tr-narrator-label {
                font-size: 8px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary);
                margin-bottom: 4px;
            }

            .tr-narrator-lines {
                display: flex;
                flex-direction: column;
                gap: 3px;
                font-size: 9px;
                font-family: 'JetBrains Mono', monospace;
                line-height: 1.3;
            }

            .tr-narrator-line {
                color: var(--text-secondary);
                padding-left: 10px;
                position: relative;
                padding-top: 2px;
                padding-bottom: 2px;
            }

            .tr-narrator-line::before {
                content: '•';
                position: absolute;
                left: 0;
            }

            .tr-narrator-line.decision {
                color: var(--ml-color);
            }

            .tr-narrator-line.execution {
                color: var(--profit-color);
            }

            .tr-narrator-line.warning {
                color: var(--loss-color);
            }

            /* Footer */
            .tr-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-top: 1px solid rgba(255, 215, 0, 0.15);
                background: rgba(0, 0, 0, 0.1);
                flex-shrink: 0;
            }

            .tr-nav-buttons {
                display: flex;
                gap: 8px;
            }

            .tr-nav-btn {
                padding: 6px 12px;
                background: rgba(255, 215, 0, 0.08);
                border: 1px solid rgba(255, 215, 0, 0.25);
                border-radius: 3px;
                color: var(--ml-color);
                font-size: 10px;
                font-family: 'Orbitron', monospace;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .tr-nav-btn:hover:not(:disabled) {
                background: rgba(255, 215, 0, 0.15);
                border-color: rgba(255, 215, 0, 0.4);
            }

            .tr-nav-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .tr-footer-spacer {
                flex: 1;
            }

            .tr-close-footer-btn {
                padding: 6px 16px;
                background: rgba(255, 215, 0, 0.12);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 3px;
                color: var(--ml-color);
                font-size: 10px;
                font-family: 'Orbitron', monospace;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .tr-close-footer-btn:hover {
                background: rgba(255, 215, 0, 0.2);
                border-color: rgba(255, 215, 0, 0.5);
            }

            /* Responsive */
            @media (max-width: 900px) {
                #${MODAL_ROOT_ID} {
                    width: 98vw;
                    max-width: 100%;
                }

                .tr-content {
                    flex-direction: column;
                }

                .tr-chart-side {
                    flex: 0 0 auto;
                    max-width: 100%;
                }

                .tr-reasoning-side {
                    flex: 0 0 auto;
                    padding-left: 0;
                    border-left: none;
                    border-top: 1px solid rgba(255, 215, 0, 0.1);
                    padding-top: 8px;
                    max-height: none;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Mini Chart Renderer ────────────────────────────────────────────────
    /**
     * Render mini candlestick chart as SVG.
     * @param {Array} candles - { open, high, low, close, volume }
     * @param {number} entryPrice - Entry price
     * @param {number} exitPrice - Exit price
     * @param {number} entryIdx - Index of entry candle
     * @param {number} exitIdx - Index of exit candle
     * @param {number} pnl - recorded net result for outcome color
     * @returns {SVGElement}
     */
    function renderMiniChart(candles, entryPrice, exitPrice, entryIdx, exitIdx, pnl) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${MINI_CHART_W} ${MINI_CHART_H}`);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        // Calculate price bounds with padding
        let minPrice = Math.min(...candles.map(c => c.low));
        let maxPrice = Math.max(...candles.map(c => c.high));
        const priceRange = maxPrice - minPrice || 1;
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;

        const priceHeight = maxPrice - minPrice;
        const pixelsPerPrice = MINI_CHART_H / priceHeight;
        const candleWidth = MINI_CHART_W / candles.length;

        // Helper to convert price to Y pixel
        const priceToY = (price) => MINI_CHART_H - ((price - minPrice) * pixelsPerPrice);

        // Draw candles
        candles.forEach((candle, i) => {
            const x = (i + 0.5) * candleWidth;
            const o = priceToY(candle.open);
            const c = priceToY(candle.close);
            const h = priceToY(candle.high);
            const l = priceToY(candle.low);

            const isUp = candle.close >= candle.open;
            const bodyTop = Math.min(o, c);
            const bodyBot = Math.max(o, c);
            const bodyColor = isUp ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
            const wickColor = isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';

            // Wick
            const wick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            wick.setAttribute('x1', x);
            wick.setAttribute('y1', h);
            wick.setAttribute('x2', x);
            wick.setAttribute('y2', l);
            wick.setAttribute('stroke', wickColor);
            wick.setAttribute('stroke-width', '1');
            svg.appendChild(wick);

            // Body
            const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            body.setAttribute('x', x - candleWidth * 0.35);
            body.setAttribute('y', bodyTop);
            body.setAttribute('width', candleWidth * 0.7);
            body.setAttribute('height', Math.max(1, bodyBot - bodyTop));
            body.setAttribute('fill', bodyColor);
            svg.appendChild(body);
        });

        // Entry marker (gold circle)
        if (entryIdx >= 0 && entryIdx < candles.length) {
            const x = (entryIdx + 0.5) * candleWidth;
            const y = priceToY(entryPrice);

            // Outer ring
            const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ring.setAttribute('cx', x);
            ring.setAttribute('cy', y);
            ring.setAttribute('r', '5');
            ring.setAttribute('fill', 'none');
            ring.setAttribute('stroke', 'rgba(255, 215, 0, 0.8)');
            ring.setAttribute('stroke-width', '1.5');
            svg.appendChild(ring);

            // Inner dot
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', 'rgba(255, 215, 0, 0.9)');
            svg.appendChild(dot);
        }

        // Exit marker (green/red circle)
        if (exitIdx >= 0 && exitIdx < candles.length) {
            const x = (exitIdx + 0.5) * candleWidth;
            const y = priceToY(exitPrice);
            const exitColor = pnl > 0 ? 'rgba(34, 197, 94, 0.8)' : pnl < 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(160, 160, 160, 0.8)';
            const exitRingColor = exitColor;

            // Outer ring
            const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ring.setAttribute('cx', x);
            ring.setAttribute('cy', y);
            ring.setAttribute('r', '5');
            ring.setAttribute('fill', 'none');
            ring.setAttribute('stroke', exitRingColor);
            ring.setAttribute('stroke-width', '1.5');
            svg.appendChild(ring);

            // Inner dot
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', exitColor);
            svg.appendChild(dot);
        }

        // Connecting line (dashed gold)
        if (entryIdx >= 0 && exitIdx >= 0 && entryIdx < candles.length && exitIdx < candles.length) {
            const x1 = (entryIdx + 0.5) * candleWidth;
            const y1 = priceToY(entryPrice);
            const x2 = (exitIdx + 0.5) * candleWidth;
            const y2 = priceToY(exitPrice);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', 'rgba(255, 215, 0, 0.3)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '4,3');
            svg.appendChild(line);
        }

        return svg;
    }

    // ─── Modal Rendering ────────────────────────────────────────────────────
    /**
     * Render the full modal content from trade data.
     * @param {TradeRecord} trade
     */
    function renderModal(trade, replay) {
        if (!state.modalEl) return;

        const raw = [...(replay.candles || []), ...(replay.postExitCandles || [])];
        const byTime = new Map(raw.map(row => [row.t, row]));
        const saved = Array.from(byTime.values()).sort((a, b) => a.t - b.t);
        const valid = saved.every(row => [row.t, row.o, row.h, row.l, row.c].every(Number.isFinite));
        const candles = valid ? saved.map(row => ({ time: row.t, end: row.etime, open: row.o, high: row.h, low: row.l, close: row.c, volume: row.v })) : [];
        const frame = replay.postExit?.scope?.timeframe?.match(/^(\d+)(m|h|d)$/);
        const duration = frame ? Number(frame[1]) * { m: 60000, h: 3600000, d: 86400000 }[frame[2]] : null;
        const indexAt = time => candles.findIndex(row => Number.isFinite(time) && row.time <= time && time < (row.end ?? (duration === null ? row.time : row.time + duration)));
        const entryIdx = Number.isFinite(trade.entry) ? indexAt(trade.entryTs) : -1;
        const exitIdx = Number.isFinite(trade.exit) ? indexAt(trade.exitTs) : -1;

        // Determine side
        const side = typeof trade.side === 'string' ? trade.side.toLowerCase() : '';
        const isLong = side === 'long' || side === 'buy';
        const sideDisplay = isLong ? 'LONG' : ['short', 'sell_short'].includes(side) ? 'SHORT' : 'UNAVAILABLE';
        const sideColor = isLong ? 'var(--profit-color)' : 'var(--loss-color)';

        // P&L color
        const pnl = trade.pnl;
        const pnlColor = pnl > 0 ? 'var(--profit-color)' : pnl < 0 ? 'var(--loss-color)' : 'var(--text-secondary)';
        const pnlText = Number.isFinite(pnl) ? `${pnl < 0 ? '-' : pnl > 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)} (${Number.isFinite(trade.pnlPercent) ? trade.pnlPercent.toFixed(2) + '%' : 'percent unavailable'})` : 'P&L unavailable';

        // Unrecorded narrative must not be copied from the currently displayed symbol.
        const narratorLines = [];

        // Pattern description
        let patternName = trade.pattern || 'Unknown';
        try {
            const patternCard = OGZ.get?.('PatternCard');
            const PATTERN_DESCRIPTIONS = patternCard?.PATTERN_DESCRIPTIONS || {};
            if (PATTERN_DESCRIPTIONS[trade.pattern]) {
                patternName = PATTERN_DESCRIPTIONS[trade.pattern].title || patternName;
            }
        } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }

        // Build HTML
        state.modalEl.innerHTML = `
            <div class="tr-header">
                <div class="tr-header-summary">
                    <span class="tr-header-symbol">${trade.symbol || 'N/A'}</span>
                    <span class="tr-header-side ${isLong ? 'long' : 'short'}">${sideDisplay}</span>
                    <span class="tr-header-prices">
                        ${Number.isFinite(trade.entry) ? '$' + trade.entry.toFixed(2) : 'Unavailable'} → ${Number.isFinite(trade.exit) ? '$' + trade.exit.toFixed(2) : 'Unavailable'}
                    </span>
                </div>
                <div class="tr-header-pnl ${pnl > 0 ? 'win' : pnl < 0 ? 'loss' : ''}">${pnlText}</div>
                <button class="tr-close-btn" aria-label="Close">✕</button>
            </div>

            <div class="tr-content">
                <div class="tr-chart-side">
                    <div class="tr-chart-label">Saved candle windows; gaps may exist</div>
                    <div class="tr-mini-chart" id="trMiniChartContainer"></div>
                </div>

                <div class="tr-reasoning-side">
                    <div class="tr-chart-label">Reasoning at Entry</div>

                    ${trade.pattern ? `
                        <div class="tr-reasoning-row">
                            <div class="tr-reasoning-label">Pattern</div>
                            <div class="tr-reasoning-value highlight">${patternName}</div>
                        </div>
                    ` : ''}

                    ${Number.isFinite(trade.confidence) ? `
                        <div class="tr-reasoning-row">
                            <div class="tr-reasoning-label">Confidence</div>
                            <div class="tr-reasoning-value">${trade.confidence.toFixed(0)}%</div>
                        </div>
                    ` : ''}

                    ${trade.strategy ? `
                        <div class="tr-reasoning-row">
                            <div class="tr-reasoning-label">Strategy</div>
                            <div class="tr-reasoning-value">${trade.strategy}</div>
                        </div>
                    ` : ''}

                    <div class="tr-reasoning-row">
                        <div class="tr-reasoning-label">News Context</div>
                        <div class="tr-reasoning-value">${trade.newsContext || 'Not recorded'}</div>
                    </div>

                    <div class="tr-reasoning-row">
                        <div class="tr-reasoning-label">Whale Activity</div>
                        <div class="tr-reasoning-value">${trade.whaleContext || 'Not recorded'}</div>
                    </div>

                    ${narratorLines.length > 0 ? `
                        <div class="tr-narrator-section">
                            <div class="tr-narrator-label">Narrator Lines</div>
                            <div class="tr-narrator-lines">
                                ${narratorLines.map(line => `
                                    <div class="tr-narrator-line ${line.level || 'info'}">
                                        ${line.text}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="tr-narrator-section">
                            <div class="tr-narrator-label">Narrator Lines</div>
                            <div style="font-size: 9px; color: var(--text-secondary);">
                                (narrator data not available for this trade)
                            </div>
                        </div>
                    `}
                </div>
            </div>

            <div class="tr-footer">
                <div class="tr-nav-buttons">
                    <button class="tr-nav-btn" id="trPrevBtn" ${state.currentTradeIndex <= 0 ? 'disabled' : ''}>
                        ← PREV
                    </button>
                    <button class="tr-nav-btn" id="trNextBtn" ${state.currentTradeIndex >= state.allTrades.length - 1 ? 'disabled' : ''}>
                        NEXT →
                    </button>
                </div>
                <div class="tr-footer-spacer"></div>
                <button class="tr-close-footer-btn">CLOSE</button>
            </div>
        `;

        // Render mini chart — only when REAL candles exist. Otherwise honest empty state.
        const chartContainer = document.getElementById('trMiniChartContainer');
        if (chartContainer) {
            chartContainer.innerHTML = '';
            if (candles.length > 0) {
                const svg = renderMiniChart(candles, trade.entry, trade.exit, entryIdx, exitIdx, pnl);
                chartContainer.appendChild(svg);
            } else {
                const empty = document.createElement('div');
                empty.className = 'tr-chart-empty';
                empty.style.cssText = 'display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-secondary); font-size:11px; text-align:center; padding:24px;';
                empty.textContent = 'Saved candle data is unavailable or invalid for this trade window.';
                chartContainer.appendChild(empty);
            }
        }

        // Wire event listeners
        const closeBtn = state.modalEl.querySelector('.tr-close-btn');
        const closeBtnFooter = state.modalEl.querySelector('.tr-close-footer-btn');
        const prevBtn = document.getElementById('trPrevBtn');
        const nextBtn = document.getElementById('trNextBtn');

        const onClose = () => { try { close(); } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); } };
        const onPrev = () => { try { navigateTrade(-1); } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); } };
        const onNext = () => { try { navigateTrade(1); } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); } };

        closeBtn?.addEventListener('click', onClose);
        closeBtnFooter?.addEventListener('click', onClose);
        prevBtn?.addEventListener('click', onPrev);
        nextBtn?.addEventListener('click', onNext);

        state.listeners.push({ el: closeBtn, event: 'click', fn: onClose });
        state.listeners.push({ el: closeBtnFooter, event: 'click', fn: onClose });
        state.listeners.push({ el: prevBtn, event: 'click', fn: onPrev });
        state.listeners.push({ el: nextBtn, event: 'click', fn: onNext });
    }

    function replayStatus(message) {
        state.modalEl.textContent = message;
        const button = document.createElement('button');
        button.textContent = 'Close'; button.addEventListener('click', close);
        state.modalEl.appendChild(button);
    }

    function requestSavedReplay(trade) {
        const orderId = trade.orderId ?? trade.tradeId;
        state.requestedReplay = { orderId, scopeKey: trade.scopeKey };
        if (!orderId) { replayStatus('Saved replay unavailable: this trade record has no confirmed order ID.'); return; }
        const socket = OGZ.get('Socket');
        if (!socket?.isConnected()) { replayStatus('Authenticate the dashboard to load the saved replay.'); return; }
        replayStatus('Loading saved trade replay...');
        socket.send({ type: 'request_replay', ...state.requestedReplay });
    }

    function receiveReplay(message) {
        if (!state.modalOpen || message.orderId !== state.requestedReplay?.orderId && message.data?.orderId !== state.requestedReplay?.orderId) return;
        if (state.requestedReplay.scopeKey && message.scopeKey !== state.requestedReplay.scopeKey) return;
        if (message.type !== 'replay_data') { replayStatus(`Saved replay unavailable: ${message.reason}`); return; }
        const data = message.data;
        renderModal({ orderId: data.orderId, symbol: data.postExit?.scope?.symbol,
            side: data.direction, entry: data.entry?.price, exit: data.exit?.price,
            entryTs: data.entry?.time, exitTs: data.exit?.time,
            pnl: data.exit?.pnl, pnlPercent: data.exit?.pnlPercent,
            confidence: data.entry?.confidence, strategy: data.entry?.entryStrategy,
            pattern: data.entry?.patterns?.[0]?.name,
            newsContext: data.entry?.newsContext, whaleContext: data.entry?.whaleContext,
        }, data);
    }

    // ─── Modal Lifecycle ────────────────────────────────────────────────────
    /**
     * Open the modal with a trade record.
     * @param {TradeRecord} trade
     */
    function open(trade) {
        try {
            if (!trade) return;

            state.currentTrade = trade;
            state.modalOpen = true;

            // Find trade index in allTrades
            state.currentTradeIndex = state.allTrades.findIndex(t => t.id === trade.id);
            if (state.currentTradeIndex < 0) {
                state.currentTradeIndex = 0;
            }

            // Create modal if needed
            if (!state.modalEl) {
                state.backdropEl = document.createElement('div');
                state.backdropEl.className = 'tr-backdrop';
                document.body.appendChild(state.backdropEl);

                state.modalEl = document.createElement('div');
                state.modalEl.id = MODAL_ROOT_ID;
                document.body.appendChild(state.modalEl);

                // Close on backdrop click
                state.backdropEl.addEventListener('click', close);
                state.listeners.push({ el: state.backdropEl, event: 'click', fn: close });

                // Close on ESC
                const onEsc = (e) => {
                    if (e.key === 'Escape') close();
                };
                document.addEventListener('keydown', onEsc);
                state.listeners.push({ el: document, event: 'keydown', fn: onEsc });
            }

            // Show modal
            state.backdropEl.style.display = 'block';
            state.modalEl.style.display = 'block';

            // Render content
            requestSavedReplay(trade);

            // Fire callback
            if (state.onOpenCallback) {
                try { state.onOpenCallback(trade); } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
            }
        } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
    }

    /**
     * Close the modal.
     */
    function close() {
        try {
            if (!state.modalOpen) return;

            state.modalOpen = false;
            state.currentTrade = null;

            if (state.backdropEl) {
                state.backdropEl.style.display = 'none';
            }
            if (state.modalEl) {
                state.modalEl.style.display = 'none';
            }

            // Fire callback
            if (state.onCloseCallback) {
                try { state.onCloseCallback(); } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
            }
        } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
    }

    /**
     * Navigate to next/prev trade.
     * @param {number} direction - -1 for prev, 1 for next
     */
    function navigateTrade(direction) {
        try {
            const newIdx = state.currentTradeIndex + direction;
            if (newIdx >= 0 && newIdx < state.allTrades.length) {
                state.currentTradeIndex = newIdx;
                const nextTrade = state.allTrades[newIdx];
                state.currentTrade = nextTrade;
                requestSavedReplay(nextTrade);
            }
        } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    const TradeReplay = {
        /**
         * Initialize styles and saved-replay response handlers.
         */
        init() {
            try {
                injectStyles();
                OGZ.get('Socket').registerHandler('replay_data', receiveReplay);
                OGZ.get('Socket').registerHandler('replay_not_found', receiveReplay);
                state.mounted = true;
            } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
        },

        /**
         * Programmatically open replay with trade data.
         * @param {TradeRecord} tradeData
         */
        openReplay(tradeData) {
            try {
                if (tradeData) {
                    state.allTrades = [tradeData];
                    open(tradeData);
                }
            } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
        },

        /**
         * Close modal.
         */
        close() {
            try {
                close();
            } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
        },

        /**
         * Register callback on open.
         * @param {Function} cb
         */
        setOnOpen(cb) {
            if (typeof cb === 'function') {
                state.onOpenCallback = cb;
            }
        },

        /**
         * Register callback on close.
         * @param {Function} cb
         */
        setOnClose(cb) {
            if (typeof cb === 'function') {
                state.onCloseCallback = cb;
            }
        },

        /**
         * Full cleanup.
         */
        teardown() {
            try {
                close();

                OGZ.get('Socket').unregisterHandler('replay_data', receiveReplay);
                OGZ.get('Socket').unregisterHandler('replay_not_found', receiveReplay);

                // Remove event listeners
                state.listeners.forEach(({ el, event, fn }) => {
                    if (el) el.removeEventListener(event, fn);
                });
                state.listeners = [];

                // Remove DOM
                if (state.backdropEl && state.backdropEl.parentNode) {
                    state.backdropEl.parentNode.removeChild(state.backdropEl);
                }
                if (state.modalEl && state.modalEl.parentNode) {
                    state.modalEl.parentNode.removeChild(state.modalEl);
                }

                // Remove styles
                const styleEl = document.getElementById(STYLE_ID);
                if (styleEl && styleEl.parentNode) {
                    styleEl.parentNode.removeChild(styleEl);
                }

                state.mounted = false;
                state.modalOpen = false;
                state.currentTrade = null;
                state.backdropEl = null;
                state.modalEl = null;
            } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
        },
    };

    // ─── Registration ───────────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register(MODULE_NAME, TradeReplay);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register(MODULE_NAME, TradeReplay);
            }
        });
    }

    try {
        window.OGZTradeReplay = TradeReplay;
    } catch (error) { console.error('[TradeReplay] Reporting UI error:', error); }
})(window.OGZ = window.OGZ || {});
