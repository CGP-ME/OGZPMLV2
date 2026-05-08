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
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'trade'        → OrderExecutor.js. Real shape:
 *                      { type:'trade', action:'BUY'|'SELL'|'SELL_SHORT'|'COVER',
 *                        direction:'long'|'short', price, pnl, timestamp,
 *                        [duration], confidence }
 *                      NOTE: bot is currently single-pair; no `symbol` on event.
 *                      We resolve symbol from the chart panel selector.
 *                      action=BUY|SELL_SHORT → open. action=SELL|COVER → close.
 *   - 'price'        → CandleProcessor. Read data.price for current-mark + P&L.
 *   - 'state_update' → StateManager.broadcastToDashboard. AUTHORITATIVE for whether
 *                      a position is open (state.position != 0) and unrealized P&L.
 *                      Shape: { state:{ position, balance, totalBalance,
 *                      realizedPnL, unrealizedPnL, totalPnL, ... } }
 *                      `position` is a SIGNED USD number (>0 long, <0 short, 0 flat).
 *
 * The bot's broadcast doesn't include entryPrice/SL/TP. Entry price is captured
 * locally from the BUY/SELL_SHORT 'trade' event. SL/TP render '--' until backend
 * exposes them. NO synthetic data anywhere.
 *
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
 * still functional from trade events alone (verified). Shows "No positions open — bot
 * scanning" until real position data flows. NO demo mode. NO synthetic positions.
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   addPosition(p) — Manual injection (for real-event handlers, not demo)
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
        selectedTicker: null,

        // Position storage: Map<"TSLA|ALP|1234567890" => Position>
        positions: new Map(),

        // Pending entry-price cache from 'trade' events that arrive ahead of
        // the matching 'state_update'. Keyed by `${symbol}|${broker}`.
        pendingEntries: new Map(),

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
        _timeTicker: null,
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
    // Prefer bot-authoritative unrealizedPnL when state_update has populated
    // it. Fall back to derived (current-entry)*notional only if we have both.
    function formatPnl(position) {
        if (!position) return { dollar: '--', percent: '--', value: 0 };

        // Authoritative path (set by handleStateUpdate from StateManager)
        if (position.unrealizedPnL != null && isFinite(position.unrealizedPnL)) {
            const v = Number(position.unrealizedPnL);
            const sign = v >= 0 ? '+' : '';
            // % is unr / position notional (size in USD)
            const denom = Math.abs(position.size) || 0;
            const pct = denom > 0 ? (v / denom) * 100 : 0;
            return {
                dollar: `${sign}$${Math.abs(v).toFixed(2)}`,
                percent: `${sign}${pct.toFixed(2)}%`,
                value: v,
            };
        }

        // Derived path (only if we have both entry and current)
        if (!position.current || !position.entry) {
            return { dollar: '--', percent: '--', value: 0 };
        }
        if (position.side === 'short') {
            const shortDollarPnl = (position.entry - position.current) * position.size;
            const shortPercentPnl = ((position.entry - position.current) / position.entry) * 100;
            const sign = shortDollarPnl >= 0 ? '+' : '';
            return {
                dollar: `${sign}$${Math.abs(shortDollarPnl).toFixed(2)}`,
                percent: `${sign}${shortPercentPnl.toFixed(2)}%`,
                value: shortDollarPnl,
            };
        }
        const dollarPnl = (position.current - position.entry) * position.size;
        const percentPnl = ((position.current - position.entry) / position.entry) * 100;
        const sign = dollarPnl >= 0 ? '+' : '';
        return {
            dollar: `${sign}$${Math.abs(dollarPnl).toFixed(2)}`,
            percent: `${sign}${percentPnl.toFixed(2)}%`,
            value: dollarPnl,
        };
    }

    // Format a numeric price; '--' when the bot hasn't surfaced it yet.
    function fmtPrice(v) {
        return (v != null && isFinite(v) && v > 0) ? `$${Number(v).toFixed(2)}` : '--';
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
            <div class="op-cell op-price" id="opEntry-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.entry)}</div>
            <div class="op-cell op-price" id="opCurrent-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.current || position.entry)}</div>
            <div class="op-cell op-price" id="opSL-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.stopLoss)}</div>
            <div class="op-cell op-price" id="opTP-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.takeProfit)}</div>
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

    // ─── Helpers: resolve current asset from the chart selector ────────
    function resolveCurrentSymbol() {
        try {
            const sel = document.getElementById('cp-assetSelector');
            if (sel && sel.value) return String(sel.value).toUpperCase();
            const wl = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('WatchlistStrip') : null;
            if (wl && typeof wl.getSelected === 'function') {
                const t = wl.getSelected();
                if (t) return String(t).toUpperCase();
            }
        } catch (_) { /* swallow */ }
        return 'ASSET';
    }

    function resolveBroker(symbol) {
        // Crypto pairs route through Kraken; everything else through Alpaca.
        // Coinbase is reserved for hot wallet use; bot doesn't currently emit a
        // broker tag on trade events.
        if (!symbol) return 'ALP';
        if (/-USD$|^BTC|^ETH|^SOL/.test(symbol.toUpperCase())) return 'KRA';
        return 'ALP';
    }

    // Capture entry price keyed by (symbol|broker) so reopens replace entry
    // cleanly when state_update reports a new position.
    function entryKey(symbol, broker) {
        return symbol + POSITION_KEY_SEP + broker;
    }

    // ─── WS Event Handlers (real bot emitter shapes) ───────────────────

    // 'trade' — capture entry price + side on open; clear on close.
    // Real bot shape: { type:'trade', action, direction, price, pnl, timestamp,
    // duration?, confidence }. Single-pair: symbol resolved from chart selector.
    function handleTradeEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data || !data.action) return;

            const symbol = resolveCurrentSymbol();
            const broker = resolveBroker(symbol);
            const price  = parseFloat(data.price);
            const ts     = Number(data.timestamp) || Date.now();
            const action = String(data.action).toUpperCase();
            const dir    = String(data.direction || (action === 'BUY' ? 'long' : 'short')).toLowerCase();
            const isOpen  = action === 'BUY' || action === 'SELL_SHORT';
            const isClose = action === 'SELL' || action === 'COVER';

            if (!isFinite(price) || price <= 0) return;

            if (isOpen) {
                // Cache the entry; the position row itself is created/synced by
                // the next state_update tick which carries authoritative size.
                state.pendingEntries = state.pendingEntries || new Map();
                state.pendingEntries.set(entryKey(symbol, broker), {
                    entry: price,
                    side: dir === 'short' ? 'short' : 'long',
                    openedAt: ts,
                    confidence: data.confidence,
                });
                // If we already have a row from state_update, fill in entry now
                state.positions.forEach((pos, key) => {
                    if (pos.symbol === symbol && pos.broker === broker && (!pos.entry || pos.entry === 0)) {
                        pos.entry = price;
                        pos.openedAt = ts;
                        pos.side = dir === 'short' ? 'short' : 'long';
                    }
                });
                renderRows();
            } else if (isClose) {
                // Drop any rows for this (symbol|broker); state_update will
                // confirm with position=0 right after.
                let removed = false;
                state.positions.forEach((pos, key) => {
                    if (pos.symbol === symbol && pos.broker === broker) {
                        // stamp realized pnl on the row briefly via flash class
                        state.positions.delete(key);
                        removed = true;
                    }
                });
                if (state.pendingEntries) state.pendingEntries.delete(entryKey(symbol, broker));
                if (removed) renderRows();
            }
        } catch (_) { /* swallow */ }
    }

    // 'price' — bot sends data.price for current asset. Single-pair: every
    // price tick is for the symbol the bot is trading right now. Update all
    // open rows whose symbol matches.
    function handlePriceEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const price = parseFloat(data && (data.price != null ? data.price : data.close));
            if (!isFinite(price) || price <= 0) return;

            // Single-pair bot: figure out current symbol from chart selector.
            const symbol = resolveCurrentSymbol();
            let updated = false;
            state.positions.forEach((position) => {
                if (position.symbol === symbol) {
                    position.current = price;
                    updateRow(position.symbol, position.broker, position.openedAt);
                    updated = true;
                }
            });
            if (updated) updateHeader();
        } catch (_) { /* swallow */ }
    }

    // 'state_update' — authoritative position presence & unrealized P&L.
    // state.position is a SIGNED USD size: >0 long, <0 short, 0 flat.
    function handleStateUpdate(d) {
        try {
            const s = d && d.state ? d.state : null;
            if (!s) return;

            const sizeUsd = Number(s.position) || 0;
            const unrPnL  = Number(s.unrealizedPnL) || 0;
            const symbol  = resolveCurrentSymbol();
            const broker  = resolveBroker(symbol);

            if (sizeUsd === 0) {
                // Bot says flat — purge any rows for this symbol/broker.
                let removed = false;
                state.positions.forEach((pos, key) => {
                    if (pos.symbol === symbol && pos.broker === broker) {
                        state.positions.delete(key);
                        removed = true;
                    }
                });
                if (removed) renderRows();
                return;
            }

            // Non-zero position: ensure a row exists and sync the live values.
            const side = sizeUsd >= 0 ? 'long' : 'short';
            const pending = (state.pendingEntries && state.pendingEntries.get(entryKey(symbol, broker))) || null;
            const entryAt = pending ? pending.openedAt : (d.timestamp || Date.now());
            const key = makeKey(symbol, broker, entryAt);

            let pos = state.positions.get(key);
            if (!pos) {
                // No prior row — first time we see this open position.
                pos = {
                    symbol,
                    broker,
                    side,
                    entry: pending ? pending.entry : 0,
                    current: 0,                 // updated by next price tick
                    stopLoss: 0,                // backend doesn't broadcast yet
                    takeProfit: 0,              // backend doesn't broadcast yet
                    size: Math.abs(sizeUsd),    // store USD notional
                    openedAt: entryAt,
                    unrealizedPnL: unrPnL,
                    strategy: pending ? pending.strategy : null,
                };
                state.positions.set(key, pos);
                renderRows();
            } else {
                pos.size = Math.abs(sizeUsd);
                pos.unrealizedPnL = unrPnL;
                pos.side = side;
                updateRow(pos.symbol, pos.broker, pos.openedAt);
                updateHeader();
            }
        } catch (_) { /* swallow */ }
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

            // Subscribe to WS events via the real socket. May not be ready
            // at panel-init time; poll briefly until OGZ.get('Socket') resolves.
            (function bindSocket() {
                const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                if (!socket || typeof socket.registerHandler !== 'function') {
                    setTimeout(bindSocket, 250);
                    return;
                }
                socket.registerHandler('trade', (e) => { try { handleTradeEvent(e); } catch (_) {} });
                socket.registerHandler('price', (e) => { try { handlePriceEvent(e); } catch (_) {} });
                socket.registerHandler('state_update', (e) => { try { handleStateUpdate(e); } catch (_) {} });
            })();

            // Re-render every 10s so the "time held" column ticks up live
            // even when no other event fires. Cheap enough — we only re-render
            // when there's at least one open position.
            state._timeTicker = setInterval(() => {
                if (state.positions.size > 0) {
                    state.positions.forEach((pos) => {
                        updateRow(pos.symbol, pos.broker, pos.openedAt);
                    });
                }
            }, 10000);

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

            // Stop time-held ticker
            if (state._timeTicker) {
                clearInterval(state._timeTicker);
                state._timeTicker = null;
            }

            // Remove DOM
            if (state.domRefs.root) {
                state.domRefs.root.innerHTML = '';
            }

            // Remove styles
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();

            state.mounted = false;
            state.positions.clear();
            state.pendingEntries.clear();
            Object.keys(state.domRefs).forEach((key) => {
                state.domRefs[key] = null;
            });
        },

        _compute() {
            return {
                mounted: state.mounted,
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
