/**
 * news-ticker.js — TRAI-flagged Trading Events Horizontal Scroller
 *
 * Real-time horizontal ticker across the dashboard displaying TRAI-flagged
 * market-altering events: FOMC announcements, earnings surprises, whale wallet
 * moves, insider filings, unusual volume spikes. Self-injects minimal fallback
 * CSS (positioning + container baseline); real styling via external
 * /css/panels/news-ticker.css. Subscribed to WS event type 'news_event'.
 *
 * Renders items RTL in an infinite-scroll marquee animation. NO demo mode,
 * NO synthetic seed events. Empty/honest "Awaiting news events..." placeholder
 * until real backend `news_event` messages arrive.
 *
 * Features:
 *   - Live sentiment coloring: bullish (green), neutral (gold), defensive (red)
 *   - Hover pauses scroll; click item expands inline popup with full details
 *   - ~30s per full loop at default speed (configurable)
 *   - TRAI commentary suffix when available
 *   - Clean teardown: all intervals, listeners, and injected DOM removed
 *
 * Self-registers as OGZ.NewsTicker via OGZ.register().
 *
 * TODO verify with backend: news_event
 *   We subscribe to WS event type 'news_event' but have not confirmed
 *   the backend emitter exists or its schema. If backend does not emit
 *   'news_event' with shape { ts, sentiment, headline, source, ticker?, trai_commentary? },
 *   NewsTicker remains in demo mode forever. To wire real TRAI events:
 *   ensure core/DashboardBroadcaster.js (or equivalent) emits news_event.
 *
 * @module public/js/panels/news-ticker
 */
(function (OGZ) {
    'use strict';

    /**
     * @typedef {Object} NewsEvent
     * @property {number} ts - Unix epoch milliseconds
     * @property {'bullish'|'neutral'|'defensive'} sentiment - Event sentiment
     * @property {string} headline - Short headline (max ~80 chars)
     * @property {string} source - Origin attribution (e.g., 'Reuters', 'SEC', 'TRAI')
     * @property {string} [ticker] - Optional ticker symbol (e.g., 'TSLA')
     * @property {string} [trai_commentary] - Optional TRAI risk/opportunity note
     */

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-news-ticker-styles';
    const ROOT_ID = 'newsTicker';

    const SCROLL_SPEED_PX_MS = 0.15;  // pixels per millisecond (controls marquee speed)
    const FULL_LOOP_MS = 30000;       // ~30s for one complete traversal
    const ANIMATION_FRAME_MS = 1000 / 60;  // 60 FPS update target
    const POPUP_AUTO_DISMISS_MS = 6000;    // Popup closes after 6s if user doesn't interact

    // TRAI events REST poll — /api/trai/events?symbol=X returns Tavily-searched +
    // LLM-extracted upcoming earnings/FOMC/FDA/macro/catalysts (per symbol, 30min cache).
    // See ogzprime-ssl-server.js:674 for endpoint, prompt-injection guards, schema.
    const TRAI_POLL_INTERVAL_MS = 60000;   // Poll every 60s; endpoint cache is 30min so this is gentle
    const TRAI_EVENTS_ENDPOINT = '/api/trai/events';
    const DEFAULT_SYMBOL = 'TSLA';

    // Private state — only accessible within this IIFE.
    const state = {
        mounted: false,
        events: [],                        // Real WS events only
        animationFrameId: null,            // RAF handle for scroll loop
        scrollPos: 0,                      // Current horizontal scroll position (px)
        paused: false,                     // Is marquee paused (hover)?
        popupDismissTimer: null,           // setTimeout handle for auto-close popup
        containerWidth: 0,                 // Width of scrollable content
        pollTimer: null,                   // setInterval handle for TRAI events poll
        lastPolledSymbol: null,            // Last symbol we polled for (re-poll on change)
        lastPollTs: 0,                     // Last successful poll timestamp (throttle)
    };

    // ─── Fallback CSS injection ─────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                background: rgba(20, 20, 20, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                padding: 10px 0;
                margin: 10px 0;
                overflow: hidden;
                position: relative;
            }
            #${ROOT_ID} .nt-container {
                display: flex;
                align-items: center;
                position: relative;
                width: 100%;
                height: 100%;
            }
            #${ROOT_ID} .nt-scroller {
                display: flex;
                gap: 16px;
                padding: 0 20px;
                position: relative;
            }
            #${ROOT_ID} .nt-item {
                flex-shrink: 0;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                cursor: pointer;
                white-space: nowrap;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                color: #ffffff;
                user-select: none;
            }
            #${ROOT_ID} .nt-item:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.12);
            }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── DOM Structure ──────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        // Clear any existing content
        root.innerHTML = '';

        // Build scroller structure
        const container = document.createElement('div');
        container.className = 'nt-container';
        container.style.minHeight = '45px';

        const scroller = document.createElement('div');
        scroller.className = 'nt-scroller';
        scroller.style.animation = 'none'; // Will be enabled by render()
        scroller.style.willChange = 'transform';

        container.appendChild(scroller);
        root.appendChild(container);

        // Attach event listeners
        root.addEventListener('mouseenter', onMouseEnter);
        root.addEventListener('mouseleave', onMouseLeave);
        root.addEventListener('click', onItemClick);

        state.mounted = true;
        return true;
    }

    // ─── Data preparation ──────────────────────────────────
    function prepareEvents() {
        // Sort real events by timestamp descending (newest first)
        const events = [...state.events];
        // Remove duplicates by unique (ts, headline) key
        const seen = new Set();
        const deduped = events.filter(e => {
            const key = `${e.ts}|${e.headline}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        // Sort descending by timestamp
        deduped.sort((a, b) => b.ts - a.ts);
        return deduped;
    }

    // ─── Time formatting ────────────────────────────────────────────────
    function formatTime(ts) {
        const d = new Date(ts);
        const h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const meridiem = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m} ${meridiem}`;
    }

    // ─── Item DOM creation ──────────────────────────────────────────────
    function renderItem(event) {
        const item = document.createElement('div');
        item.className = `nt-item nt-sent-${event.sentiment}`;
        item.dataset.ts = event.ts;
        item.dataset.headline = event.headline;

        // Sentiment dot
        const dot = document.createElement('span');
        dot.className = 'nt-dot';
        dot.textContent = '●';
        dot.style.fontSize = '10px';

        // Time
        const time = document.createElement('span');
        time.className = 'nt-time';
        time.textContent = formatTime(event.ts);
        time.style.color = '#888888';
        time.style.fontSize = '11px';
        time.style.minWidth = '60px';

        // Headline + ticker
        const headline = document.createElement('span');
        headline.className = 'nt-headline';
        let text = event.headline;
        if (event.ticker) {
            text = `[${event.ticker}] ${text}`;
        }
        headline.textContent = text;

        // Source
        const source = document.createElement('span');
        source.className = 'nt-source';
        source.textContent = event.source;
        source.style.color = '#888888';
        source.style.fontSize = '10px';

        // TRAI commentary suffix (if present)
        let suffix = '';
        if (event.trai_commentary) {
            suffix = ` · TRAI: ${event.trai_commentary}`;
        }

        // Assemble
        item.appendChild(dot);
        item.appendChild(time);
        item.appendChild(headline);
        if (suffix) {
            const traiText = document.createElement('span');
            traiText.textContent = suffix;
            traiText.style.color = '#ffd700';
            traiText.style.fontSize = '11px';
            item.appendChild(traiText);
        }
        item.appendChild(source);

        // Store full event for popup
        item.dataset.fullEvent = JSON.stringify(event);

        return item;
    }

    // ─── Main render function ───────────────────────────────────────────
    function render() {
        if (!state.mounted) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const scroller = root.querySelector('.nt-scroller');
        if (!scroller) return;

        // Clear and rebuild items
        scroller.innerHTML = '';
        const events = prepareEvents();

        if (events.length === 0) {
            // Empty state: show placeholder
            const placeholder = document.createElement('div');
            placeholder.style.cssText = `
                flex: 0 0 auto;
                padding: 12px 20px;
                color: #666666;
                font-size: 12px;
                font-family: 'JetBrains Mono', monospace;
            `;
            placeholder.textContent = 'Waiting for news events...';
            scroller.appendChild(placeholder);
            return;
        }

        // Render all items
        events.forEach(event => {
            const item = renderItem(event);
            scroller.appendChild(item);
        });

        // Calculate container width and restart animation
        state.containerWidth = scroller.scrollWidth;
        state.scrollPos = 0;
        startAnimation();
    }

    // ─── Animation loop (pure scroll, no marquee CSS) ──────────────────
    let lastFrameTime = 0;

    function animateScroll(currentTime) {
        if (!lastFrameTime) lastFrameTime = currentTime;
        const deltaMs = currentTime - lastFrameTime;
        lastFrameTime = currentTime;

        if (!state.paused && state.containerWidth > 0) {
            // Move left by speed × delta
            state.scrollPos += SCROLL_SPEED_PX_MS * deltaMs;

            // Reset to start when fully scrolled off (infinite loop)
            const root = document.getElementById(ROOT_ID);
            if (root) {
                const containerWidth = root.offsetWidth;
                if (state.scrollPos > state.containerWidth + containerWidth) {
                    state.scrollPos = -containerWidth;
                }

                const scroller = root.querySelector('.nt-scroller');
                if (scroller) {
                    scroller.style.transform = `translateX(-${state.scrollPos}px)`;
                }
            }
        }

        // Continue loop
        if (state.mounted) {
            state.animationFrameId = requestAnimationFrame(animateScroll);
        }
    }

    function startAnimation() {
        if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
        }
        lastFrameTime = 0;
        state.animationFrameId = requestAnimationFrame(animateScroll);
    }

    function stopAnimation() {
        if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = null;
        }
    }

    // ─── Event handlers ─────────────────────────────────────────────────
    function onMouseEnter() {
        state.paused = true;
    }

    function onMouseLeave() {
        state.paused = false;
    }

    function onItemClick(e) {
        const item = e.target.closest('.nt-item');
        if (!item) return;

        try {
            const eventData = JSON.parse(item.dataset.fullEvent);
            showPopup(eventData);
        } catch (_) { /* swallow */ }
    }

    function showPopup(event) {
        // Dismiss any existing popup
        dismissPopup();

        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const popup = document.createElement('div');
        popup.className = 'nt-popup';
        popup.id = 'nt-popup-' + Date.now();
        popup.style.cssText = `
            position: fixed;
            z-index: 1000;
            background: rgba(15, 15, 20, 0.95);
            border: 1px solid rgba(255, 215, 0, 0.4);
            border-radius: 8px;
            padding: 16px;
            max-width: 400px;
            backdrop-filter: blur(12px);
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #ffffff;
        `;

        const timeEl = document.createElement('div');
        timeEl.style.cssText = 'color: #888888; font-size: 11px; margin-bottom: 8px;';
        timeEl.textContent = formatTime(event.ts);

        const headlineEl = document.createElement('div');
        headlineEl.style.cssText = 'font-weight: 600; margin-bottom: 8px; line-height: 1.4;';
        headlineEl.textContent = event.headline;

        const sourceEl = document.createElement('div');
        sourceEl.style.cssText = 'color: #a0a0a0; font-size: 11px; margin-bottom: 8px;';
        sourceEl.textContent = `Source: ${event.source}`;

        if (event.trai_commentary) {
            const traiEl = document.createElement('div');
            traiEl.style.cssText = 'color: #ffd700; font-size: 11px; padding: 8px; background: rgba(255, 215, 0, 0.05); border-radius: 4px; margin-bottom: 8px;';
            traiEl.textContent = `TRAI: ${event.trai_commentary}`;
            popup.appendChild(traiEl);
        }

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Close';
        closeBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            cursor: pointer;
            margin-top: 10px;
            width: 100%;
        `;
        closeBtn.addEventListener('click', dismissPopup);

        popup.appendChild(timeEl);
        popup.appendChild(headlineEl);
        popup.appendChild(sourceEl);
        popup.appendChild(closeBtn);

        document.body.appendChild(popup);

        // Auto-dismiss after POPUP_AUTO_DISMISS_MS
        if (state.popupDismissTimer) clearTimeout(state.popupDismissTimer);
        state.popupDismissTimer = setTimeout(dismissPopup, POPUP_AUTO_DISMISS_MS);
    }

    function dismissPopup() {
        const existing = document.querySelector('[id^="nt-popup-"]');
        if (existing) existing.remove();
        if (state.popupDismissTimer) {
            clearTimeout(state.popupDismissTimer);
            state.popupDismissTimer = null;
        }
    }

    // ─── TRAI events REST poll ──────────────────────────────────────────
    function detectActiveAsset() {
        // Prefer v2 chart-panel selector, fall back to legacy, then default.
        // Same fallback chain CC-D bakes into every price/asset consumer.
        const cpSel = document.getElementById('cp-assetSelector');
        if (cpSel && cpSel.value) return cpSel.value;
        const legacySel = document.getElementById('assetSelector');
        if (legacySel && legacySel.value) return legacySel.value;
        return DEFAULT_SYMBOL;
    }

    function mapTraiEventToNewsItem(traiEvent, symbol) {
        // TRAI payload: {type, date (YYYY-MM-DD or 'TBD'), title, summary, source}
        // News-ticker shape: {ts, sentiment, headline, source, ticker, trai_commentary}
        let ts;
        if (traiEvent && traiEvent.date && traiEvent.date !== 'TBD') {
            const parsed = Date.parse(traiEvent.date);
            ts = Number.isFinite(parsed) ? parsed : Date.now();
        } else {
            ts = Date.now();
        }

        // Sentiment heuristic from TRAI event type. earnings/fda/macro/other
        // default to neutral; fomc/macro lean defensive (rate-policy uncertainty);
        // catalyst leans bullish (positive trigger). Operator can refine later.
        const sentimentMap = {
            earnings: 'neutral',
            fomc: 'defensive',
            fda: 'neutral',
            macro: 'defensive',
            catalyst: 'bullish',
            other: 'neutral',
        };
        const sentiment = sentimentMap[traiEvent && traiEvent.type] || 'neutral';

        return {
            ts,
            sentiment,
            headline: String((traiEvent && traiEvent.title) || 'Market event'),
            source: String((traiEvent && traiEvent.source) || 'TRAI'),
            ticker: symbol,
            trai_commentary: traiEvent && traiEvent.summary ? String(traiEvent.summary) : undefined,
        };
    }

    async function pollTraiEvents() {
        const symbol = detectActiveAsset();
        // Skip if same symbol polled within throttle window — defends against
        // burst calls when asset-change fires near a scheduled poll tick.
        if (symbol === state.lastPolledSymbol && (Date.now() - state.lastPollTs) < TRAI_POLL_INTERVAL_MS / 2) {
            return;
        }

        try {
            const res = await fetch(`${TRAI_EVENTS_ENDPOINT}?symbol=${encodeURIComponent(symbol)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !Array.isArray(data.events)) return;

            // TRAI returns full set per poll — replace events array (don't append)
            state.events = data.events
                .filter(e => e && (e.title || e.summary))
                .map(e => mapTraiEventToNewsItem(e, symbol));
            // Cap at 50 (defensive — endpoint typically returns ≤5)
            if (state.events.length > 50) state.events = state.events.slice(0, 50);

            state.lastPolledSymbol = symbol;
            state.lastPollTs = Date.now();
            render();
        } catch (_) { /* swallow — dashboard non-critical, fail silently */ }
    }

    function startTraiPollLoop() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        pollTraiEvents(); // immediate first poll
        state.pollTimer = setInterval(pollTraiEvents, TRAI_POLL_INTERVAL_MS);
    }

    function stopTraiPollLoop() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function onWatchlistSelectAsset(data) {
        // Re-poll TRAI immediately when active asset changes
        if (data && data.ticker) {
            state.lastPolledSymbol = null; // bypass throttle
            pollTraiEvents();
        }
    }

    // ─── WS Handler ─────────────────────────────────────────────────────
    function onNewsEvent(data) {
        try {
            if (!data) return;
            // Validate required fields
            const event = {
                ts: data.ts != null ? Number(data.ts) : Date.now(),
                sentiment: ['bullish', 'neutral', 'defensive'].includes(data.sentiment)
                    ? data.sentiment
                    : 'neutral',
                headline: String(data.headline || 'Market event'),
                source: String(data.source || 'Unknown'),
                ticker: data.ticker ? String(data.ticker) : undefined,
                trai_commentary: data.trai_commentary ? String(data.trai_commentary) : undefined,
            };
            if (!event.ts || !event.headline) return;
            state.events.push(event);
            // Cap at 50 real events (prevent unbounded growth)
            if (state.events.length > 50) state.events.shift();
            render();
        } catch (_) { /* swallow */ }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const NewsTicker = {
        /**
         * Initialize: mount to DOM, inject styles, subscribe to WS events.
         * Safe to call multiple times (idempotent via mount guard).
         */
        init() {
            try {
                injectStyles();
                if (!mount()) return; // Mount point missing
                render();

                // Subscribe to news_event WS frame as defensive backup if backend ever emits it.
                // Currently no bot-side emit site exists for news_event; TRAI REST poll below
                // is the active data source. Subscription is harmless either way.
                const socket = OGZ.get && OGZ.get('Socket');
                if (socket && socket.registerHandler) {
                    socket.registerHandler('news_event', onNewsEvent);
                }

                // Subscribe to watchlist:select bus event — re-poll TRAI on asset change
                if (OGZ && OGZ.bus && OGZ.bus.on) {
                    OGZ.bus.on('watchlist:select', onWatchlistSelectAsset);
                }

                // Start REST poll loop against /api/trai/events
                // (Tavily search + TRAI LLM extraction with prompt-injection guards)
                startTraiPollLoop();
            } catch (_) { /* swallow */ }
        },


        /**
         * Pause/resume marquee scroll.
         */
        pause() {
            state.paused = true;
        },

        /**
         * Resume marquee scroll.
         */
        resume() {
            state.paused = false;
        },

        /**
         * Manually add a news event (for testing or external feeds).
         * @param {NewsEvent} event
         */
        addEvent(event) {
            if (event && event.headline) {
                state.events.push(event);
                if (state.events.length > 50) state.events.shift();
                render();
            }
        },

        /**
         * Clear all real events (demo events remain if demoMode=true).
         */
        clear() {
            state.events = [];
            render();
        },

        /**
         * Teardown: remove DOM, listeners, animations, injected styles.
         */
        teardown() {
            try {
                dismissPopup();
                stopAnimation();
                stopTraiPollLoop();

                const root = document.getElementById(ROOT_ID);
                if (root) {
                    root.removeEventListener('mouseenter', onMouseEnter);
                    root.removeEventListener('mouseleave', onMouseLeave);
                    root.removeEventListener('click', onItemClick);
                    root.innerHTML = '';
                }

                const styleEl = document.getElementById(STYLE_ID);
                if (styleEl) styleEl.remove();

                state.mounted = false;
                state.events = [];
                state.scrollPos = 0;
            } catch (_) { /* swallow */ }
        },

        /**
         * Expose compute/debug helper for testing
         */
        _compute() {
            return {
                realEventsCount: state.events.length,
                totalEvents: prepareEvents().length,
                scrollPos: state.scrollPos,
                paused: state.paused,
            };
        },
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('NewsTicker', NewsTicker);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('NewsTicker', NewsTicker);
            }
        });
    }

    try { window.OGZNewsTicker = NewsTicker; } catch (_) {}
})(window.OGZ = window.OGZ || {});
