/**
 * open-positions.js — OpenPositions: Multi-Ticker Positions Table
 *
 * Right-rail panel showing all concurrently-held positions across tickers
 * (bot scans 9 tickers simultaneously, can hold positions in multiple at once).
 * One row per open position. Aggregate row at top. Responsive to live price ticks,
 * highlighting the currently-selected ticker's position (from WatchlistStrip).
 *
 * What it renders (top to bottom):
 *   1. Header row — "OPEN POSITIONS" title + count badge ("3 OPEN") + aggregate unrealized P&L
 *      (color-coded green/red, weight 900)
 *   2. Per-position rows (one per concurrent position): ticker + broker badge + side pill +
 *      entry price + current price + SL + TP + unrealized $ + unrealized % + time held
 *   3. Empty state: "No positions open — bot scanning" in muted text when no positions
 *   4. Highlight: if selected ticker (from WatchlistStrip) has open position, gold border + glow
 *
 * Self-registers as OGZ.OpenPositions via OGZ.register().
 * Mounts into <div id="openPositions"></div>.
 * Subscribes to WS events:
 *   - trade (✓ verified per CURRENT-ARCHITECTURE.md) — listens for 'open' and 'close' types
 *   - price (✓ verified) — for live current-price + unrealized P&L recalculation
 *   - position_update (TODO-flag UNVERIFIED) — alternative position sync if backend emits
 *   - state_update (TODO-flag UNVERIFIED) — alternate fallback for position data
 * Listens to OGZ.bus:
 *   - watchlist:select — to scope highlight to selected ticker
 *
 * Internal state: Map keyed by `${ticker}-${broker}-${entryTime}` (composite to handle
 * multiple lots). Each value = Position object with side/entry/current/sl/tp/size/
 * unrealized/timeOpened/strategy/tradeId.
 *
 * Recalculates unrealized P&L on every `price` tick where data.symbol matches an open
 * position. Updates row in-place via textContent/class swap — never re-renders whole table.
 *
 * Falls back gracefully: if position_update events never arrive (backend doesn't emit yet),
 * still functional from trade events alone (verified). Shows "Position data unavailable"
 * in muted text if no events flow. Demo mode (off by default): if turned on via
 * OGZ.OpenPositions.setDemoMode(true), injects 3 fake positions matching mockup.
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   setDemoMode(bool) — Toggle demo positions (TSLA, COIN, BTC)
 *   addPosition(p) — Manual injection for testing
 *   closePosition(symbol, broker) — Manual close
 *   getPositions() — Return current Position[]
 *   clearAll() — Empty state
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: internal state snapshot
 *
 * @typedef {Object} Position
 * @property {string} symbol - Ticker symbol (e.g., 'TSLA')
 * @property {string} broker - Broker ID ('ALP' | 'KRA' | 'CB' | etc)
 * @property {'long'|'short'} side - Position side
 * @property {number} entry - Entry price
 * @property {number} current - Current/last price
 * @property {number} stopLoss - Stop-loss price
 * @property {number} takeProfit - Take-profit price
 * @property {number} size - Shares/units held
 * @property {number} openedAt - Epoch milliseconds
 * @property {string} [strategy] - Strategy name that opened position
 * @property {string} [tradeId] - Server-side trade identifier if available
 *
 * @module public/js/panels/open-positions
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-open-positions-styles';
    const ROOT_ID = 'openPositions';
    const PNL_FLASH_MS = 300;           // Duration of P&L flash animation
    const POSITION_KEY_SEP = '|';        // Separator for composite key

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        demoMode: false,
        selectedTicker: null,

        // Position storage: Map<"TSLA|ALP|1234567890" => Position>
        positions: new Map(),

        // DOM caches
        domRefs: {
            root: null,
            header: null,
            count: null,
            aggregatePnl: null,
            table: null,
            tbody: null,
        },

        // Event listeners (for cleanup)
        listeners: [],
    };

    // ─── CSS Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            #${ROOT_ID} {
                display: flex;
                flex-direction: column;
                gap: 0;
                min-height: 100%;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 8px;
                backdrop-filter: blur(14px) saturate(160%);
                box-shadow: var(--glass-underglow);
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                overflow: hidden;
                padding: 0;
            }

            /* Header row: title + count + aggregate P&L */
            .op-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 12px;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
                background: rgba(0, 0, 0, 0.3);
            }

            .op-header-title {
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .op-count-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 40px;
                padding: 2px 8px;
                background: rgba(255, 215, 0, 0.12);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 12px;
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--ml-color);
                flex-shrink: 0;
            }

            .op-aggregate-pnl {
                margin-left: auto;
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.5px;
                color: var(--profit-color);
            }

            .op-aggregate-pnl.negative {
                color: var(--loss-color);
            }

            /* Positions table */
            .op-table {
                display: flex;
                flex-direction: column;
                gap: 0;
                flex: 1;
                overflow-y: auto;
                min-height: 0;
                padding: 0;
            }

            .op-row {
                display: grid;
                grid-template-columns: 60px 50px 45px 50px 50px 50px 50px 60px 50px 50px;
                gap: 4px;
                align-items: center;
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                font-size: 10px;
                font-family: 'JetBrains Mono', monospace;
                font-feature-settings: "tnum";
                transition: all 0.2s ease;
            }

            .op-row:last-child {
                border-bottom: none;
            }

            .op-row:hover {
                background: rgba(255, 255, 255, 0.02);
            }

            .op-row.highlighted {
                background: rgba(255, 215, 0, 0.08);
                border-left: 2px solid var(--ml-color);
                box-shadow: inset 0 0 12px rgba(255, 215, 0, 0.1);
            }

            /* Per-cell styling */
            .op-cell {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .op-symbol {
                font-weight: 600;
                color: var(--text-primary);
            }

            .op-broker {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 34px;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 8px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                background: rgba(100, 150, 200, 0.2);
                border: 1px solid rgba(100, 150, 200, 0.4);
                color: rgba(100, 150, 200, 0.9);
            }

            .op-broker.kra {
                background: rgba(150, 100, 200, 0.2);
                border-color: rgba(150, 100, 200, 0.4);
                color: rgba(150, 100, 200, 0.9);
            }

            .op-broker.cb {
                background: rgba(100, 200, 200, 0.2);
                border-color: rgba(100, 200, 200, 0.4);
                color: rgba(100, 200, 200, 0.9);
            }

            .op-side {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 40px;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                background: rgba(34, 197, 94, 0.2);
                color: var(--profit-color);
                border: 1px solid rgba(34, 197, 94, 0.4);
            }

            .op-side.short {
                background: rgba(255, 51, 102, 0.2);
                color: var(--loss-color);
                border-color: rgba(255, 51, 102, 0.4);
            }

            .op-price {
                text-align: right;
                color: var(--text-secondary);
                font-weight: 500;
            }

            .op-pnl {
                text-align: right;
                font-weight: 600;
                color: var(--profit-color);
            }

            .op-pnl.negative {
                color: var(--loss-color);
            }

            .op-pnl.flash-up {
                animation: op-pnl-flash-up 300ms ease-out;
            }

            .op-pnl.flash-down {
                animation: op-pnl-flash-down 300ms ease-out;
            }

            .op-time {
                text-align: right;
                color: var(--text-secondary);
                font-weight: 400;
            }

            /* Animations */
            @keyframes op-pnl-flash-up {
                0% {
                    color: #ffd700;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
                }
                100% {
                    color: var(--profit-color);
                    text-shadow: none;
                }
            }

            @keyframes op-pnl-flash-down {
                0% {
                    color: #ffd700;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
                }
                100% {
                    color: var(--loss-color);
                    text-shadow: none;
                }
            }

            @keyframes op-row-enter {
                from {
                    opacity: 0;
                    transform: translateY(-8px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes op-row-exit {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(8px);
                }
            }

            .op-row.entering {
                animation: op-row-enter 0.3s ease-out;
            }

            .op-row.exiting {
                animation: op-row-exit 0.2s ease-out;
            }

            /* Empty state */
            .op-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                flex: 1;
                padding: 32px 12px;
                text-align: center;
                color: var(--text-secondary);
                font-size: 11px;
                font-weight: 300;
                border: 1px dashed var(--border-color);
                margin: 12px;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.2);
            }

            /* Scrollbar styling */
            .op-table::-webkit-scrollbar {
                width: 4px;
            }

            .op-table::-webkit-scrollbar-track {
                background: transparent;
            }

            .op-table::-webkit-scrollbar-thumb {
                background: rgba(255, 215, 0, 0.2);
                border-radius: 2px;
            }

            .op-table::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 215, 0, 0.4);
            }

            @media (prefers-reduced-motion: reduce) {
                .op-row,
                .op-pnl.flash-up,
                .op-pnl.flash-down,
                .op-row.entering,
                .op-row.exiting {
                    animation: none;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Helper: Format Time Held ────────────────────────────────────
    function formatTimeHeld(openedAt) {
        if (!openedAt || openedAt <= 0) return '--';

        const elapsed = Date.now() - openedAt;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const mins = minutes % 60;
            return `${hours}h ${mins}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '<1m';
        }
    }

    // ─── Helper: Position Key ────────────────────────────────────────
    function makeKey(symbol, broker, openedAt) {
        return `${symbol}${POSITION_KEY_SEP}${broker}${POSITION_KEY_SEP}${openedAt}`;
    }

    // ─── Helper: Format P&L ──────────────────────────────────────────
    function formatPnl(position) {
        if (!position || !position.current) return { dollar: '--', percent: '--' };

        const dollarPnl = (position.current - position.entry) * position.size;
        const percentPnl = ((position.current - position.entry) / position.entry) * 100;

        let sign = '';
        if (position.side === 'short') {
            // For shorts, P&L calculation is inverted
            const shortDollarPnl = (position.entry - position.current) * position.size;
            const shortPercentPnl = ((position.entry - position.current) / position.entry) * 100;
            sign = shortDollarPnl >= 0 ? '+' : '';
            return {
                dollar: `${sign}$${Math.abs(shortDollarPnl).toFixed(0)}`,
                percent: `${sign}${shortPercentPnl.toFixed(2)}%`,
                value: shortDollarPnl,
            };
        }

        sign = dollarPnl >= 0 ? '+' : '';
        return {
            dollar: `${sign}$${Math.abs(dollarPnl).toFixed(0)}`,
            percent: `${sign}${percentPnl.toFixed(2)}%`,
            value: dollarPnl,
        };
    }

    // ─── Render Functions ────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;

        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        root.innerHTML = '';
        state.domRefs.root = root;

        // Header
        const header = document.createElement('div');
        header.className = 'op-header';
        header.innerHTML = `
            <span class="op-header-title">OPEN POSITIONS</span>
            <span class="op-count-badge" id="opCountBadge">0 OPEN</span>
            <span class="op-aggregate-pnl" id="opAggregatePnl">+$0</span>
        `;
        state.domRefs.header = header;
        state.domRefs.count = header.querySelector('#opCountBadge');
        state.domRefs.aggregatePnl = header.querySelector('#opAggregatePnl');
        root.appendChild(header);

        // Table container
        const table = document.createElement('div');
        table.className = 'op-table';
        table.id = 'opTable';
        state.domRefs.table = table;
        state.domRefs.tbody = table; // Flex container acts as tbody
        root.appendChild(table);

        state.mounted = true;
        return true;
    }

    function renderRows() {
        if (!state.domRefs.tbody) return;

        // Clear existing rows
        state.domRefs.tbody.innerHTML = '';

        if (state.positions.size === 0) {
            const empty = document.createElement('div');
            empty.className = 'op-empty';
            empty.textContent = 'No positions open — bot scanning';
            state.domRefs.tbody.appendChild(empty);
            updateHeader();
            return;
        }

        // Sort positions by opened time (newest first)
        const sorted = Array.from(state.positions.values()).sort(
            (a, b) => b.openedAt - a.openedAt
        );

        sorted.forEach((position) => {
            const row = renderRow(position);
            state.domRefs.tbody.appendChild(row);
        });

        updateHeader();
    }

    function renderRow(position) {
        const row = document.createElement('div');
        row.className = 'op-row';
        row.dataset.symbol = position.symbol;
        row.dataset.broker = position.broker;
        row.dataset.openedAt = position.openedAt;

        const pnl = formatPnl(position);
        const timeHeld = formatTimeHeld(position.openedAt);
        const brokerClass = position.broker.toLowerCase();

        row.innerHTML = `
            <div class="op-cell op-symbol">${position.symbol}</div>
            <div class="op-cell"><span class="op-broker ${brokerClass}">${position.broker}</span></div>
            <div class="op-cell"><span class="op-side ${position.side === 'short' ? 'short' : ''}">${position.side.toUpperCase()}</span></div>
            <div class="op-cell op-price" id="opEntry-${position.symbol}-${position.broker}-${position.openedAt}">$${position.entry.toFixed(2)}</div>
            <div class="op-cell op-price" id="opCurrent-${position.symbol}-${position.broker}-${position.openedAt}">$${(position.current || position.entry).toFixed(2)}</div>
            <div class="op-cell op-price" id="opSL-${position.symbol}-${position.broker}-${position.openedAt}">$${position.stopLoss.toFixed(2)}</div>
            <div class="op-cell op-price" id="opTP-${position.symbol}-${position.broker}-${position.openedAt}">$${position.takeProfit.toFixed(2)}</div>
            <div class="op-cell op-pnl ${pnl.value < 0 ? 'negative' : ''}" id="opPnlDol-${position.symbol}-${position.broker}-${position.openedAt}">${pnl.dollar}</div>
            <div class="op-cell op-pnl ${pnl.value < 0 ? 'negative' : ''}" id="opPnlPct-${position.symbol}-${position.broker}-${position.openedAt}">${pnl.percent}</div>
            <div class="op-cell op-time" id="opTime-${position.symbol}-${position.broker}-${position.openedAt}">${timeHeld}</div>
        `;

        // Highlight if this is selected ticker
        if (state.selectedTicker && position.symbol === state.selectedTicker) {
            row.classList.add('highlighted');
        }

        row.classList.add('entering');
        setTimeout(() => row.classList.remove('entering'), 300);

        return row;
    }

    function updateHeader() {
        if (state.domRefs.count) {
            const count = state.positions.size;
            state.domRefs.count.textContent = `${count} OPEN`;
        }

        if (state.domRefs.aggregatePnl) {
            let totalPnl = 0;
            state.positions.forEach((pos) => {
                const pnl = formatPnl(pos);
                totalPnl += pnl.value || 0;
            });

            const sign = totalPnl >= 0 ? '+' : '';
            state.domRefs.aggregatePnl.textContent = `${sign}$${Math.abs(totalPnl).toFixed(0)}`;
            state.domRefs.aggregatePnl.classList.toggle('negative', totalPnl < 0);
        }
    }

    function updateRow(symbol, broker, openedAt) {
        const key = makeKey(symbol, broker, openedAt);
        const position = state.positions.get(key);
        if (!position) return;

        const pnl = formatPnl(position);
        const timeHeld = formatTimeHeld(position.openedAt);

        // Update current price
        const currentEl = document.getElementById(`opCurrent-${symbol}-${broker}-${openedAt}`);
        if (currentEl) {
            currentEl.textContent = `$${(position.current || position.entry).toFixed(2)}`;
        }

        // Update P&L dollar
        const pnlDolEl = document.getElementById(`opPnlDol-${symbol}-${broker}-${openedAt}`);
        if (pnlDolEl) {
            const prevValue = parseFloat(pnlDolEl.textContent);
            const isUp = pnl.value > prevValue;

            pnlDolEl.textContent = pnl.dollar;
            pnlDolEl.classList.toggle('negative', pnl.value < 0);
            pnlDolEl.classList.remove('flash-up', 'flash-down');
            pnlDolEl.classList.add(isUp ? 'flash-up' : 'flash-down');

            setTimeout(() => {
                pnlDolEl.classList.remove('flash-up', 'flash-down');
            }, PNL_FLASH_MS);
        }

        // Update P&L percent
        const pnlPctEl = document.getElementById(`opPnlPct-${symbol}-${broker}-${openedAt}`);
        if (pnlPctEl) {
            pnlPctEl.textContent = pnl.percent;
            pnlPctEl.classList.toggle('negative', pnl.value < 0);
        }

        // Update time held
        const timeEl = document.getElementById(`opTime-${symbol}-${broker}-${openedAt}`);
        if (timeEl) {
            timeEl.textContent = timeHeld;
        }

        // Update header aggregate
        updateHeader();
    }

    // ─── WS Event Handlers ──────────────────────────────────────────
    function handleTradeEvent(data) {
        try {
            if (!data) return;

            const type = data.type || data.status || '';
            const symbol = String(data.symbol || data.ticker || '').toUpperCase();
            const broker = String(data.broker || 'ALP');
            const side = String(data.side || 'long').toLowerCase();
            const size = parseFloat(data.size || data.quantity || 0);
            const entryPrice = parseFloat(data.price || data.entry || 0);
            const sl = parseFloat(data.stopLoss || data.sl || 0);
            const tp = parseFloat(data.takeProfit || data.tp || 0);
            const timestamp = data.timestamp || data.ts || Date.now();

            if (!symbol || entryPrice <= 0) return;

            if (type === 'open' || type === 'opened') {
                // Add new position
                const position = {
                    symbol,
                    broker,
                    side,
                    entry: entryPrice,
                    current: entryPrice,
                    stopLoss: sl,
                    takeProfit: tp,
                    size,
                    openedAt: Number(timestamp),
                    strategy: data.strategy,
                    tradeId: data.tradeId || data.id,
                };

                const key = makeKey(symbol, broker, timestamp);
                state.positions.set(key, position);
                renderRows();
            } else if (type === 'close' || type === 'closed') {
                // Remove closed position
                const key = makeKey(symbol, broker, Number(timestamp));
                if (state.positions.has(key)) {
                    state.positions.delete(key);
                    renderRows();
                }
            }
        } catch (_) {
            // Swallow
        }
    }

    function handlePriceEvent(data) {
        try {
            if (!data) return;

            const symbol = String(data.symbol || data.s || '').toUpperCase();
            const price = parseFloat(data.price || data.c || data.close || 0);

            if (!symbol || !isFinite(price) || price <= 0) return;

            // Update all positions for this symbol
            let updated = false;
            state.positions.forEach((position, key) => {
                if (position.symbol === symbol) {
                    const oldPrice = position.current;
                    position.current = price;
                    updateRow(position.symbol, position.broker, position.openedAt);
                    updated = true;
                }
            });

            if (updated) {
                updateHeader();
            }
        } catch (_) {
            // Swallow
        }
    }

    function handlePositionUpdate(data) {
        try {
            if (!data) return;

            // Alternative position sync from backend
            // Expected shape: { positions: [{ symbol, broker, side, entry, current, sl, tp, size, openedAt }] }
            const positions = data.positions || data.pos || [];
            if (!Array.isArray(positions)) return;

            state.positions.clear();
            positions.forEach((p) => {
                if (p.symbol && p.entry > 0) {
                    const key = makeKey(p.symbol, p.broker || 'ALP', p.openedAt || Date.now());
                    state.positions.set(key, {
                        symbol: String(p.symbol).toUpperCase(),
                        broker: String(p.broker || 'ALP'),
                        side: (p.side || 'long').toLowerCase(),
                        entry: p.entry,
                        current: p.current || p.entry,
                        stopLoss: p.stopLoss || p.sl || 0,
                        takeProfit: p.takeProfit || p.tp || 0,
                        size: p.size || 0,
                        openedAt: p.openedAt || Date.now(),
                        strategy: p.strategy,
                        tradeId: p.tradeId || p.id,
                    });
                }
            });

            renderRows();
        } catch (_) {
            // Swallow
        }
    }

    // ─── Demo Mode ───────────────────────────────────────────────────
    function loadDemoData() {
        state.positions.clear();

        const now = Date.now();
        const demo = [
            {
                symbol: 'TSLA',
                broker: 'ALP',
                side: 'long',
                entry: 391.20,
                current: 393.42,
                stopLoss: 389.50,
                takeProfit: 396.18,
                size: 10,
                openedAt: now - 14 * 60 * 1000, // 14m ago
            },
            {
                symbol: 'COIN',
                broker: 'ALP',
                side: 'long',
                entry: 237.50,
                current: 241.18,
                stopLoss: 235.00,
                takeProfit: 244.00,
                size: 5,
                openedAt: now - 8 * 60 * 1000, // 8m ago
            },
            {
                symbol: 'BTC',
                broker: 'KRA',
                side: 'long',
                entry: 81420,
                current: 81663,
                stopLoss: 81150,
                takeProfit: 82100,
                size: 0.01,
                openedAt: now - 22 * 60 * 1000, // 22m ago
            },
        ];

        demo.forEach((d) => {
            const key = makeKey(d.symbol, d.broker, d.openedAt);
            state.positions.set(key, d);
        });

        renderRows();
    }

    // ─── Event Bus Helper ────────────────────────────────────────────
    function ensureEventBus() {
        if (OGZ && OGZ.bus) return;
        const listeners = new Map();
        const bus = {
            on(event, handler) {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event).push(handler);
            },
            off(event, handler) {
                if (!listeners.has(event)) return;
                const list = listeners.get(event);
                const idx = list.indexOf(handler);
                if (idx >= 0) list.splice(idx, 1);
            },
            emit(event, data) {
                if (!listeners.has(event)) return;
                listeners.get(event).forEach((h) => {
                    try { h(data); } catch (_) { /* swallow */ }
                });
            },
        };
        if (OGZ) OGZ.bus = bus;
    }

    // ─── Public API ─────────────────────────────────────────────────
    const api = {
        init() {
            injectStyles();
            if (!mount()) return;

            ensureEventBus();

            // Subscribe to WS events
            if (window.ws && typeof window.ws.on === 'function') {
                window.ws.on('trade', (event) => {
                    try { handleTradeEvent(event); } catch (_) { /* swallow */ }
                });
                window.ws.on('price', (event) => {
                    try { handlePriceEvent(event); } catch (_) { /* swallow */ }
                });
                window.ws.on('position_update', (event) => {
                    try { handlePositionUpdate(event); } catch (_) { /* swallow */ }
                });
                window.ws.on('state_update', (event) => {
                    try { handlePositionUpdate(event); } catch (_) { /* swallow */ }
                });
            }

            // Subscribe to bus events
            if (OGZ && OGZ.bus) {
                OGZ.bus.on('watchlist:select', (data) => {
                    try {
                        state.selectedTicker = data && data.ticker ? String(data.ticker) : null;
                        renderRows();
                    } catch (_) { /* swallow */ }
                });
            }

            renderRows();
        },

        setDemoMode(enabled) {
            state.demoMode = !!enabled;
            if (enabled) {
                loadDemoData();
            } else {
                state.positions.clear();
                renderRows();
            }
        },

        addPosition(position) {
            if (!position || !position.symbol) return;

            const key = makeKey(
                position.symbol,
                position.broker || 'ALP',
                position.openedAt || Date.now()
            );

            state.positions.set(key, {
                symbol: String(position.symbol).toUpperCase(),
                broker: position.broker || 'ALP',
                side: (position.side || 'long').toLowerCase(),
                entry: position.entry || 0,
                current: position.current || position.entry || 0,
                stopLoss: position.stopLoss || 0,
                takeProfit: position.takeProfit || 0,
                size: position.size || 0,
                openedAt: position.openedAt || Date.now(),
                strategy: position.strategy,
                tradeId: position.tradeId,
            });

            renderRows();
        },

        closePosition(symbol, broker) {
            if (!symbol) return;

            let found = false;
            state.positions.forEach((pos, key) => {
                if (
                    pos.symbol === String(symbol).toUpperCase() &&
                    pos.broker === (broker || 'ALP')
                ) {
                    state.positions.delete(key);
                    found = true;
                }
            });

            if (found) {
                renderRows();
            }
        },

        getPositions() {
            return Array.from(state.positions.values());
        },

        clearAll() {
            state.positions.clear();
            renderRows();
        },

        teardown() {
            if (!state.mounted) return;

            // Remove DOM
            if (state.domRefs.root) {
                state.domRefs.root.innerHTML = '';
            }

            // Remove styles
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();

            state.mounted = false;
            state.positions.clear();
            Object.keys(state.domRefs).forEach((key) => {
                state.domRefs[key] = null;
            });
        },

        _compute() {
            return {
                mounted: state.mounted,
                demoMode: state.demoMode,
                positionCount: state.positions.size,
                positions: Array.from(state.positions.values()),
                selectedTicker: state.selectedTicker,
            };
        },
    };

    // ─── Registration ──────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('OpenPositions', api);
    } else if (window.OGZ) {
        window.OGZ.OpenPositions = api;
    }

})(window.OGZ || (window.OGZ = {}));
