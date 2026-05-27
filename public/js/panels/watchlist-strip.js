/**
 * watchlist-strip.js — Multi-Ticker Watchlist Selection Panel
 *
 * Centerpiece of the OGZPrime dashboard refactor: a horizontal strip of 9-12
 * selectable ticker cards, each displaying symbol, broker, current price, % change
 * since session open, position state, and a 30-bar price sparkline.
 *
 * Click a card to select it, emitting `watchlist:select` event via OGZ.bus.
 * Other panels (chart, indicators, edge analytics, pattern) listen to this event
 * and re-render for the selected symbol.
 *
 * Default ticker universe: 3 crypto (Kraken) + 6 stocks (Alpaca):
 *   TSLA, NVDA, SPY, QQQ, COIN, MARA, RIOT (ALP)
 *   BTC, ETH (KRA)
 *
 * Subscribes to WS 'price' events to populate prices and sparklines.
 * TODO verify with backend: position_update — per-ticker position state
 *   (SCAN/LONG/SHORT/COOL/FAULT). Until backend confirms, defaults to SCAN
 *   unless ticker appears in openPositions state.
 *
 * Self-registers as OGZ.WatchlistStrip via OGZ.register().
 * Mounts into <div id="watchlistStrip"></div>.
 * Emits events via OGZ.bus (minimal event bus auto-installed if absent).
 *
 * Features:
 *   - Horizontal flex layout, scrollable on overflow (>12 tickers)
 *   - Click-to-select with visual highlight (cyan border + glow)
 *   - Hover effects: brightens border, slight lift
 *   - Sparklines: green stroke for up-session, red for down
 *   - Price flashing on tick (green up, red down, brief animation)
 *   - State pills: SCAN (gray), LONG (green), SHORT (red), COOL (amber), FAULT (red pulse)
 *   - Broker badges: ALP (blue), KRA (purple)
 *   - API for runtime config: setTickers(), setSelected(), addTicker(), removeTicker()
 *
 * Self-injects fallback minimal CSS; real styling via external
 * /css/panels/watchlist-strip.css for design ownership.
 *
 * @module public/js/panels/watchlist-strip
 */
(function (OGZ) {
    'use strict';

    /**
     * @typedef {Object} Ticker
     * @property {string} symbol - Ticker symbol (e.g., 'TSLA', 'BTC')
     * @property {string} broker - Broker code ('ALP' = Alpaca, 'KRA' = Kraken, 'CB' = Coinbase)
     */

    /**
     * @typedef {Object} TickerState
     * @property {string} symbol
     * @property {string} broker
     * @property {number} price - Current price (default: 0 until first WS tick)
     * @property {number} priceOpen - Session open price (default: 0)
     * @property {string} positionState - 'SCAN' | 'LONG' | 'SHORT' | 'COOL' | 'FAULT'
     * @property {number[]} sparkline - Rolling 30-bar price buffer
     * @property {number} lastPriceFlash - Timestamp of last price flash (for animation)
     * @property {string} lastFlashDir - 'up' | 'down' | null (for flash animation CSS class)
     */

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-watchlist-strip-styles';
    const ROOT_ID = 'watchlistStrip';
    const SPARKLINE_BUF_SIZE = 30;          // Number of bars in sparkline
    const PRICE_FLASH_MS = 400;              // Duration of price flash animation
    const POSITION_POLL_MS = 2000;            // Check for position state updates
    const BROKER_COLORS = {
        'ALP': { light: '#4287f5', alpha: 0.3 },   // Blue for Alpaca
        'KRA': { light: '#8b5cf6', alpha: 0.3 },   // Purple for Kraken
        'CB': { light: '#06b6d4', alpha: 0.3 },    // Teal for Coinbase (reserved)
    };

    const DEFAULT_TICKERS = [
        // Stocks (Alpaca)
        { symbol: 'TSLA', broker: 'ALP' },
        { symbol: 'NVDA', broker: 'ALP' },
        { symbol: 'SPY', broker: 'ALP' },
        { symbol: 'QQQ', broker: 'ALP' },
        { symbol: 'COIN', broker: 'ALP' },
        { symbol: 'MARA', broker: 'ALP' },
        { symbol: 'RIOT', broker: 'ALP' },
        // Crypto (Kraken)
        { symbol: 'BTC', broker: 'KRA' },
        { symbol: 'ETH', broker: 'KRA' },
    ];

    // Private state — only accessible within this IIFE
    const state = {
        mounted: false,
        tickers: [],                      // Current ticker list (Ticker[])
        tickerStates: new Map(),          // symbol → TickerState
        selectedSymbol: null,              // Currently selected ticker symbol
        priceHistogram: new Map(),        // symbol → price[] (rolling buffer)
        cardElementCache: new Map(),      // symbol → DOM element reference
        animationFrameId: null,            // RAF handle for price flash timeouts
        openPositions: [],                 // { symbol, side: 'LONG'|'SHORT' } (from state_update)
    };

    // ─── Event Bus (lightweight pubsub) ─────────────────────────────
    // Install OGZ.bus if not present. Used by WatchlistStrip to emit
    // 'watchlist:select' and by other modules to listen.
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
                listeners.get(event).forEach(h => {
                    try { h(data); } catch (_) { /* swallow */ }
                });
            },
        };
        if (OGZ) OGZ.bus = bus;
    }

    // ─── Fallback CSS injection ─────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                display: flex;
                gap: 12px;
                padding: 8px 12px;
                overflow-x: auto;
                overflow-y: hidden;
                height: 90px;
                background: rgba(10, 10, 10, 0.6);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                align-items: center;
            }
            #${ROOT_ID}::-webkit-scrollbar {
                height: 6px;
            }
            #${ROOT_ID}::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 3px;
            }
            .ws-card {
                flex-shrink: 0;
                width: 132px;
                padding: 10px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                cursor: pointer;
                font-family: 'JetBrains Mono', monospace;
                user-select: none;
                transition: all 0.2s ease;
            }
            .ws-card:hover {
                border-color: rgba(255, 215, 0, 0.4);
                background: rgba(255, 255, 255, 0.08);
                transform: translateY(-1px);
            }
            .ws-card.selected {
                border-color: rgba(0, 204, 255, 1);
                background: rgba(0, 204, 255, 0.12);
                box-shadow: 0 0 12px rgba(0, 204, 255, 0.3);
                transform: scale(1.02);
            }
            .ws-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
            }
            .ws-symbol {
                font-weight: 700;
                font-size: 13px;
                color: #ffffff;
            }
            .ws-broker {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                background: rgba(255, 255, 255, 0.1);
            }
            .ws-price-row {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
            }
            .ws-price {
                color: #ffffff;
                font-weight: 600;
            }
            .ws-pct {
                font-size: 10px;
            }
            .ws-pct.up { color: #00ff88; }
            .ws-pct.down { color: #ff3366; }
            .ws-sparkline-wrap {
                width: 100%;
                height: 20px;
            }
            .ws-state {
                font-size: 9px;
                padding: 3px 6px;
                border-radius: 3px;
                text-align: center;
                font-weight: 600;
                text-transform: uppercase;
            }
            .ws-state.SCAN { background: rgba(100, 100, 100, 0.3); color: #a0a0a0; }
            .ws-state.LONG { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
            .ws-state.SHORT { background: rgba(255, 51, 102, 0.2); color: #ff3366; }
            .ws-state.COOL { background: rgba(255, 215, 0, 0.2); color: #ffd700; }
            .ws-state.FAULT { background: rgba(255, 51, 102, 0.2); color: #ff3366; animation: ws-fault-pulse 1s ease-in-out infinite; }
            @keyframes ws-fault-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            @keyframes ws-price-flash-up {
                0% { background: rgba(0, 255, 136, 0.2); }
                100% { background: transparent; }
            }
            @keyframes ws-price-flash-down {
                0% { background: rgba(255, 51, 102, 0.2); }
                100% { background: transparent; }
            }
            .ws-card.flash-up { animation: ws-price-flash-up 0.4s ease-out; }
            .ws-card.flash-down { animation: ws-price-flash-down 0.4s ease-out; }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── DOM Management ────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;
        root.innerHTML = '';
        root.addEventListener('click', onCardClick);
        state.mounted = true;
        return true;
    }

    /**
     * Format price to 2-4 decimal places depending on magnitude.
     * Crypto typically has ~2 decimals, stocks have 2, very high-priced things vary.
     */
    function formatPrice(price) {
        if (!isFinite(price)) return '--';
        if (price >= 10000) return price.toFixed(0);
        if (price >= 100) return price.toFixed(2);
        if (price >= 1) return price.toFixed(2);
        return price.toFixed(4);
    }

    /**
     * Calculate percentage change from session open price.
     * Returns {pct: number, text: string, direction: 'up'|'down'|'neutral'}
     */
    function calcPctChange(current, sessionOpen) {
        if (!isFinite(current) || !isFinite(sessionOpen) || sessionOpen <= 0) {
            return { pct: 0, text: '--', direction: 'neutral' };
        }
        const pct = ((current - sessionOpen) / sessionOpen) * 100;
        const dir = pct > 0.01 ? 'up' : pct < -0.01 ? 'down' : 'neutral';
        const sign = pct > 0 ? '+' : '';
        return { pct, text: sign + pct.toFixed(2) + '%', direction: dir };
    }

    /**
     * Render a 30-bar inline SVG sparkline from price history.
     * Bars evenly spaced; height maps min/max of the buffer.
     */
    function renderSparkline(prices) {
        if (!prices || prices.length === 0) {
            // Empty sparkline: flat line at bottom
            return `<svg viewBox="0 0 150 20" xmlns="http://www.w3.org/2000/svg" class="ws-sparkline">
                <polyline points="0,18 150,18" stroke="rgba(255,255,255,0.1)" stroke-width="1" fill="none"/>
            </svg>`;
        }

        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1; // Prevent division by zero

        // Determine stroke color based on net session direction
        const sessionOpen = prices[0];
        const current = prices[prices.length - 1];
        const isUp = current >= sessionOpen;
        const stroke = isUp ? '#00ff88' : '#ff3366';

        // Generate polyline points: evenly spaced across 150px width
        const xStep = 150 / (prices.length - 1 || 1);
        const points = prices.map((p, i) => {
            const x = i * xStep;
            const y = 18 - ((p - min) / range) * 16; // Map to 18px height (2px padding)
            return `${x},${y}`;
        }).join(' ');

        return `<svg viewBox="0 0 150 20" xmlns="http://www.w3.org/2000/svg" class="ws-sparkline">
            <polyline points="${points}" stroke="${stroke}" stroke-width="1.5" fill="none"/>
        </svg>`;
    }

    /**
     * Initialize or update a ticker's state. Called on first price tick for a symbol.
     */
    function ensureTickerState(symbol, broker) {
        if (state.tickerStates.has(symbol)) {
            return state.tickerStates.get(symbol);
        }
        const ts = {
            symbol,
            broker,
            price: 0,
            priceOpen: 0,
            positionState: 'SCAN',
            sparkline: [],
            lastPriceFlash: 0,
            lastFlashDir: null,
        };
        state.tickerStates.set(symbol, ts);
        state.priceHistogram.set(symbol, []);
        return ts;
    }

    /**
     * Render a single ticker card DOM element.
     */
    function renderCard(ticker) {
        const ts = ensureTickerState(ticker.symbol, ticker.broker);
        const pct = calcPctChange(ts.price, ts.priceOpen);
        const brokerColor = BROKER_COLORS[ticker.broker] || BROKER_COLORS.CB;

        const card = document.createElement('div');
        card.className = 'ws-card';
        if (ticker.symbol === state.selectedSymbol) {
            card.classList.add('selected');
        }
        card.dataset.symbol = ticker.symbol;
        card.dataset.broker = ticker.broker;

        const header = document.createElement('div');
        header.className = 'ws-header';

        const symbol = document.createElement('span');
        symbol.className = 'ws-symbol';
        symbol.textContent = ticker.symbol;

        const broker = document.createElement('span');
        broker.className = 'ws-broker';
        broker.textContent = ticker.broker;
        broker.style.backgroundColor = `rgba(${brokerColor.light}, ${brokerColor.alpha})`;

        header.appendChild(symbol);
        header.appendChild(broker);

        const priceRow = document.createElement('div');
        priceRow.className = 'ws-price-row';

        const price = document.createElement('span');
        price.className = 'ws-price';
        price.textContent = formatPrice(ts.price);
        price.style.fontSize = ts.price < 10 ? '10px' : '11px';

        const pctSpan = document.createElement('span');
        pctSpan.className = `ws-pct ${pct.direction}`;
        pctSpan.textContent = pct.text;

        priceRow.appendChild(price);
        priceRow.appendChild(pctSpan);

        const sparklineWrap = document.createElement('div');
        sparklineWrap.className = 'ws-sparkline-wrap';
        sparklineWrap.innerHTML = renderSparkline(ts.sparkline);

        const statePill = document.createElement('div');
        statePill.className = `ws-state ${ts.positionState}`;
        statePill.textContent = ts.positionState;

        card.appendChild(header);
        card.appendChild(priceRow);
        card.appendChild(sparklineWrap);
        card.appendChild(statePill);

        state.cardElementCache.set(ticker.symbol, card);
        return card;
    }

    /**
     * Main render: rebuild the strip from current ticker list.
     */
    function render() {
        if (!state.mounted) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        root.innerHTML = '';
        state.tickers.forEach(ticker => {
            const card = renderCard(ticker);
            root.appendChild(card);
        });
    }

    /**
     * Update a single card's display after a price tick.
     * Reuses cached DOM element and updates price, sparkline, position.
     */
    function updateCard(symbol) {
        const card = state.cardElementCache.get(symbol);
        if (!card) return; // Card not in DOM
        const ts = state.tickerStates.get(symbol);
        if (!ts) return;

        // Update price text
        const priceEl = card.querySelector('.ws-price');
        if (priceEl) {
            priceEl.textContent = formatPrice(ts.price);
            priceEl.style.fontSize = ts.price < 10 ? '10px' : '11px';
        }

        // Update % change + color
        const pct = calcPctChange(ts.price, ts.priceOpen);
        const pctEl = card.querySelector('.ws-pct');
        if (pctEl) {
            pctEl.textContent = pct.text;
            pctEl.classList.remove('up', 'down', 'neutral');
            pctEl.classList.add(pct.direction);
        }

        // Update sparkline
        const sparklineWrap = card.querySelector('.ws-sparkline-wrap');
        if (sparklineWrap) {
            sparklineWrap.innerHTML = renderSparkline(ts.sparkline);
        }

        // Update position state
        const stateEl = card.querySelector('.ws-state');
        if (stateEl) {
            stateEl.classList.remove('SCAN', 'LONG', 'SHORT', 'COOL', 'FAULT');
            stateEl.classList.add(ts.positionState);
            stateEl.textContent = ts.positionState;
        }

        // Flash animation on price change
        if (pct.direction !== 'neutral') {
            card.classList.remove('flash-up', 'flash-down');
            const flashClass = pct.direction === 'up' ? 'flash-up' : 'flash-down';
            card.offsetHeight; // Trigger reflow to restart animation
            card.classList.add(flashClass);
            setTimeout(() => {
                card.classList.remove(flashClass);
            }, PRICE_FLASH_MS);
        }
    }

    // ─── Event Handlers ─────────────────────────────────────────────────
    function onCardClick(e) {
        const card = e.target.closest('.ws-card');
        if (!card) return;

        const symbol = card.dataset.symbol;
        const broker = card.dataset.broker;
        if (!symbol || !broker) return;

        try {
            // setSelected is a method of the WatchlistStrip api object — it is
            // NOT a standalone function in this scope. A bare setSelected(...)
            // call here throws ReferenceError, which the catch below swallowed
            // silently — so ticker clicks never emitted 'watchlist:select'.
            WatchlistStrip.setSelected({ symbol, broker });
        } catch (_) { /* swallow */ }
    }

    // ─── WS Handler ─────────────────────────────────────────────────────
    /**
     * Subscribe to 'price' WS events. Each tick updates the card's price,
     * sparkline history, and session % change.
     */
    function onPriceEvent(data) {
        try {
            if (!data || !data.symbol) return;
            const symbol = String(data.symbol).toUpperCase();
            const priceCandidate = data.price != null ? data.price : data.close;
            const price = parseFloat(priceCandidate);
            if (!isFinite(price) || price <= 0) return;

            // Ensure this symbol is in our watchlist
            const ticker = state.tickers.find(t => t.symbol === symbol);
            if (!ticker) return;

            const ts = ensureTickerState(symbol, ticker.broker);
            const prevPrice = ts.price;

            // Update price
            ts.price = price;

            // On first tick, set session open price
            if (ts.priceOpen === 0) {
                ts.priceOpen = price;
            }

            // Push to sparkline buffer (FIFO, max SPARKLINE_BUF_SIZE)
            if (!Array.isArray(ts.sparkline)) ts.sparkline = [];
            ts.sparkline.push(price);
            if (ts.sparkline.length > SPARKLINE_BUF_SIZE) {
                ts.sparkline.shift();
            }

            // Update the card display
            updateCard(symbol);
        } catch (_) { /* swallow */ }
    }

    /**
     * TODO verify with backend: position_update
     * When backend confirms per-ticker position state events, hook here.
     * Until then, position_update events are ignored; state defaults to SCAN.
     */
    function onPositionUpdate(data) {
        try {
            if (!data || !Array.isArray(data.openPositions)) return;
            // Store for later position state synthesis
            state.openPositions = data.openPositions;
            // Update position states for relevant cards
            state.tickers.forEach(ticker => {
                const ts = state.tickerStates.get(ticker.symbol);
                if (!ts) return;
                const pos = state.openPositions.find(p => p.symbol === ticker.symbol);
                if (pos) {
                    ts.positionState = pos.side === 'SHORT' ? 'SHORT' : 'LONG';
                } else {
                    ts.positionState = 'SCAN';
                }
                updateCard(ticker.symbol);
            });
        } catch (_) { /* swallow */ }
    }

    /**
     * Helper: update all position states based on openPositions array.
     * Called periodically to sync with current trading state.
     */
    function syncPositionStates() {
        state.tickers.forEach(ticker => {
            const ts = state.tickerStates.get(ticker.symbol);
            if (!ts) return;
            const pos = state.openPositions.find(p => p.symbol === ticker.symbol);
            ts.positionState = pos ? (pos.side === 'SHORT' ? 'SHORT' : 'LONG') : 'SCAN';
            updateCard(ticker.symbol);
        });
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const WatchlistStrip = {
        /**
         * Initialize: mount to DOM, inject styles, subscribe to WS events.
         * Safe to call multiple times (idempotent via mount guard).
         */
        init() {
            try {
                ensureEventBus();
                injectStyles();
                if (!mount()) return; // Mount point missing
                state.tickers = [...DEFAULT_TICKERS];
                state.selectedSymbol = state.tickers[0]?.symbol || null;
                render();

                // Subscribe to price events via Socket
                const socket = OGZ.get && OGZ.get('Socket');
                if (socket && socket.registerHandler) {
                    socket.registerHandler('price', onPriceEvent);
                    // TODO verify with backend: position_update
                    // socket.registerHandler('position_update', onPositionUpdate);
                }

                // Periodically sync position states (fallback for missing backend event)
                setInterval(syncPositionStates, POSITION_POLL_MS);
            } catch (_) { /* swallow */ }
        },

        /**
         * Replace the entire ticker list.
         * @param {Ticker[]} tickers - Array of { symbol, broker } objects
         */
        setTickers(tickers) {
            try {
                if (!Array.isArray(tickers)) return;
                state.tickers = tickers.map(t => ({ symbol: String(t.symbol).toUpperCase(), broker: String(t.broker) }));
                state.selectedSymbol = state.tickers[0]?.symbol || null;
                state.cardElementCache.clear();
                render();
            } catch (_) { /* swallow */ }
        },

        /**
         * Set the selected ticker and emit watchlist:select event.
         * @param {Ticker} ticker - { symbol, broker }
         */
        setSelected(ticker) {
            try {
                if (!ticker || !ticker.symbol) return;
                const symbol = String(ticker.symbol).toUpperCase();
                const broker = String(ticker.broker);

                // Verify ticker exists in list
                const found = state.tickers.find(t => t.symbol === symbol);
                if (!found) return;

                state.selectedSymbol = symbol;

                // Update all cards (only selected gets the highlight)
                state.cardElementCache.forEach((card, sym) => {
                    if (sym === symbol) {
                        card.classList.add('selected');
                    } else {
                        card.classList.remove('selected');
                    }
                });

                // Emit event for other modules
                if (OGZ && OGZ.bus) {
                    OGZ.bus.emit('watchlist:select', { symbol, broker });
                }
            } catch (_) { /* swallow */ }
        },

        /**
         * Get the currently selected ticker.
         * @returns {Ticker|null}
         */
        getSelected() {
            if (!state.selectedSymbol) return null;
            const ticker = state.tickers.find(t => t.symbol === state.selectedSymbol);
            return ticker || null;
        },

        /**
         * Get the current ticker list.
         * @returns {Ticker[]}
         */
        getTickers() {
            return [...state.tickers];
        },

        /**
         * Add a ticker to the list.
         * @param {Ticker} ticker - { symbol, broker }
         */
        addTicker(ticker) {
            try {
                if (!ticker || !ticker.symbol) return;
                const sym = String(ticker.symbol).toUpperCase();
                if (state.tickers.some(t => t.symbol === sym)) return; // Already present
                state.tickers.push({ symbol: sym, broker: String(ticker.broker) });
                state.cardElementCache.delete(sym);
                render();
            } catch (_) { /* swallow */ }
        },

        /**
         * Remove a ticker from the list.
         * @param {string} symbol
         */
        removeTicker(symbol) {
            try {
                if (!symbol) return;
                const sym = String(symbol).toUpperCase();
                state.tickers = state.tickers.filter(t => t.symbol !== sym);
                state.cardElementCache.delete(sym);
                state.tickerStates.delete(sym);
                state.priceHistogram.delete(sym);
                render();
            } catch (_) { /* swallow */ }
        },

        /**
         * Teardown: remove DOM, listeners, injected styles, cached data.
         */
        teardown() {
            try {
                const root = document.getElementById(ROOT_ID);
                if (root) {
                    root.removeEventListener('click', onCardClick);
                    root.innerHTML = '';
                }

                const styleEl = document.getElementById(STYLE_ID);
                if (styleEl) styleEl.remove();

                state.mounted = false;
                state.tickers = [];
                state.tickerStates.clear();
                state.priceHistogram.clear();
                state.cardElementCache.clear();
                state.selectedSymbol = null;
                state.openPositions = [];
            } catch (_) { /* swallow */ }
        },

        /**
         * Expose internal state for testing/debugging.
         */
        _compute() {
            return {
                mounted: state.mounted,
                tickers: state.tickers,
                selectedSymbol: state.selectedSymbol,
                tickerStatesCount: state.tickerStates.size,
                cachedCards: state.cardElementCache.size,
            };
        },
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('WatchlistStrip', WatchlistStrip);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('WatchlistStrip', WatchlistStrip);
            }
        });
    }

    try { window.OGZWatchlistStrip = WatchlistStrip; } catch (_) {}
})(window.OGZ = window.OGZ || {});
