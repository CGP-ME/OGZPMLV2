/**
 * trai-brain.js — TRAIBrain: White-Box AI Reasoning Panel
 *
 * The persistent right-rail panel that replaces the floating TRAI chat widget
 * with an always-visible window into TRAI's real-time thinking. Operators and
 * customers see exactly what the AI is processing: flagged news, whale activity,
 * narrator verbalization of bot decisions, escalation queue, and an "Ask TRAI"
 * input for on-demand queries.
 *
 * What it renders (top to bottom):
 *   1. Header — "TRAI BRAIN" title + pulsing ML-active gold dot + connection status
 *   2. Latest News (1-2 max visible, "see more" expands) — color-coded by sentiment
 *   3. Whale Alert (1 item) — most recent block trade or unusual volume
 *   4. Narrator Output (4-5 lines visible, scrolling) — live thinking, newest at top
 *   5. Escalation Queue — numbered list of items requiring operator attention
 *   6. Ask TRAI Input — text field to query TRAI directly via HTTP API
 *   7. TRAI Response (expandable) — inline result from last query
 *
 * Self-registers as OGZ.TRAIBrain via OGZ.register().
 * Mounts into <div id="traiBrain"></div>.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'whale_trade'    → DashboardBroadcaster.broadcastEdgeAnalytics line 133.
 *                        Real shape: { type:'whale_trade', size, price, side, timestamp }
 *                        (size = USD notional). No `ticker` carried; bot is single-pair.
 *                        We resolve symbol from chart selector for display.
 *   - 'narrator_event' → TradeNarrator.broadcast. Real shape:
 *                        { type:'narrator_event', scope, event, timestamp, text, ... }
 *                        Filter to scope='USER' (customer-facing). text is the
 *                        verbalized line.
 *   - 'bot_thinking'   → TradingLoop / TRAIDecisionModule. Used as a low-key
 *                        "still thinking" pulse on the header dot when no
 *                        narrator events fire for a while.
 *
 * AWAITING BACKEND EMITTERS (rendered as muted "awaiting…" placeholders, no fakes):
 *   - 'news_event'     → planned: route through TRAI NLP + websearch crawler
 *   - 'escalation'     → planned: TRAI flags ops attention items
 *
 * Listens to OGZ.bus:
 *   - watchlist:select (re-scope news/whale to selected ticker once those exist)
 *
 * HTTP API calls:
 *   POST /api/trai/analyze { prompt, maxTokens } → { response, provider, latency }
 *   GET /api/trai/status → { ready, providerName, model }
 *
 * No console.log in production. Try/catch swallow on all WS handlers.
 * State is minimal: in-memory buffers (news, whales, narrator, escalations).
 * Clean teardown: removes DOM, listeners, intervals.
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   askTRAI(query) — Submit a query to /api/trai/analyze, display response
 *   addNarratorLine(text) — Prepend a narrator line (called by WS handler)
 *   setConnectionStatus(status) — Update header connection display
 *   clearAll() — Reset all buffers (news, whales, narrator, escalations)
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return internal state snapshot
 *
 * @typedef {Object} NewsItem
 * @property {number} ts - Unix epoch milliseconds
 * @property {'bullish'|'neutral'|'defensive'} sentiment - Event sentiment
 * @property {string} headline - Short headline (max ~100 chars)
 * @property {string} source - Origin attribution (e.g., 'Reuters', 'SEC', 'TRAI')
 * @property {string} [ticker] - Optional ticker symbol
 * @property {string} [confidence_modifier] - Optional confidence delta (e.g., '-0.15')
 *
 * @typedef {Object} WhaleAlert
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} description - Human-readable alert (e.g., "Unusual call volume +312%")
 * @property {string} ticker - Ticker symbol
 * @property {string} [source] - Optional source (e.g., 'Block', 'Analytics')
 *
 * @typedef {Object} NarratorLine
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} text - Narrator verbalization (e.g., "Strategy-A and B aligning...")
 *
 * @typedef {Object} EscalationItem
 * @property {number} id - Unique ID for this escalation
 * @property {string} title - Short title (e.g., "Risk Limit Exceeded")
 * @property {string} [detail] - Optional detail
 * @property {'warning'|'critical'} level - Severity
 *
 * @module public/js/panels/trai-brain
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-trai-brain-styles';
    const ROOT_ID = 'traiBrain';
    const NEWS_VISIBLE_COUNT = 2;           // Max news items shown before "see more"
    const WHALE_VISIBLE_COUNT = 1;          // Show 1 whale alert
    const NARRATOR_LINES_VISIBLE = 5;       // Show last 5 narrator lines
    const NARRATOR_MAX_BUFFER = 50;         // Keep 50 lines in memory
    const STATUS_CHECK_INTERVAL_MS = 30000; // Check /api/trai/status every 30s
    const RESPONSE_EXPAND_MS = 300;         // Response expand animation duration

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        selectedTicker: null,

        // Data buffers
        news: [],                   // Array of NewsItem
        whales: [],                 // Array of WhaleAlert
        narrator: [],               // Array of NarratorLine (rolling buffer, newest first)
        escalations: [],            // Array of EscalationItem

        // UI state
        connectionStatus: null,     // e.g., 'Connected to Mercury-2 / Inception Labs'
        newsExpanded: false,        // Toggle "see more" state
        responseExpanded: false,    // Toggle response panel
        lastTRAIResponse: null,     // { response, provider, latency }
        askTRAIQuery: '',           // Current input value

        // DOM caches
        domRefs: {
            root: null,
            newsSection: null,
            whaleSection: null,
            narratorSection: null,
            escalationSection: null,
            askInput: null,
            responseSection: null,
        },

        // Timers
        statusCheckInterval: null,
    };

    // ─── CSS Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            /* Container */
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
            }

            /* Header */
            .tb-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 12px;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
            }

            .tb-header-title {
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .tb-pulse {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--ml-color);
                box-shadow: 0 0 8px var(--ml-color), inset 0 0 2px rgba(255, 215, 0, 0.5);
                animation: tb-pulse-keyframes 1.5s ease-in-out infinite;
                flex-shrink: 0;
            }

            @keyframes tb-pulse-keyframes {
                0%, 100% { opacity: 0.6; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.15); }
            }

            .tb-header-status {
                font-size: 10px;
                color: var(--text-secondary);
                margin-left: auto;
                text-align: right;
                flex-shrink: 0;
            }

            /* Sections container */
            .tb-sections {
                display: flex;
                flex-direction: column;
                gap: 0;
                flex: 1;
                overflow-y: auto;
                padding: 0;
                min-height: 0;
            }

            /* Individual section */
            .tb-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px 12px;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
            }

            .tb-section:last-child {
                border-bottom: none;
            }

            .tb-section-title {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: var(--ml-color);
            }

            /* News items */
            .tb-news-item {
                padding: 6px 8px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.04);
                border-left: 2px solid var(--neutral-color);
                font-size: 10px;
                line-height: 1.3;
                color: var(--text-primary);
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .tb-news-item:hover {
                background: rgba(255, 255, 255, 0.08);
                border-left-color: var(--ml-color);
            }

            .tb-news-item.bullish {
                border-left-color: var(--profit-color);
            }

            .tb-news-item.neutral {
                border-left-color: var(--ml-color);
            }

            .tb-news-item.defensive {
                border-left-color: var(--loss-color);
            }

            .tb-news-time {
                font-size: 9px;
                color: var(--text-secondary);
                display: block;
                margin-bottom: 2px;
            }

            .tb-news-headline {
                display: block;
                font-weight: 500;
            }

            .tb-news-source {
                font-size: 9px;
                color: var(--text-secondary);
                display: block;
                margin-top: 2px;
            }

            /* Whale alert */
            .tb-whale-item {
                padding: 6px 8px;
                border-radius: 4px;
                background: rgba(255, 215, 0, 0.06);
                border-left: 2px solid var(--ml-color);
                font-size: 10px;
                line-height: 1.3;
                color: var(--text-primary);
            }

            .tb-whale-muted {
                padding: 6px 8px;
                font-size: 10px;
                color: var(--text-secondary);
                font-style: italic;
            }

            /* Narrator section */
            .tb-narrator-lines {
                display: flex;
                flex-direction: column;
                gap: 4px;
                max-height: 100px;
                overflow-y: auto;
            }

            .tb-narrator-line {
                padding: 4px 6px;
                border-radius: 3px;
                background: rgba(255, 255, 255, 0.03);
                border-left: 1px solid var(--core-color);
                font-size: 9px;
                line-height: 1.3;
                color: var(--text-secondary);
                animation: tb-narrator-fade-in 0.3s ease-out;
            }

            .tb-narrator-line.new {
                color: var(--text-primary);
                background: rgba(0, 204, 255, 0.08);
            }

            @keyframes tb-narrator-fade-in {
                from {
                    opacity: 0;
                    transform: translateY(-2px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            /* Escalation queue */
            .tb-escalation-item {
                padding: 6px 8px;
                border-radius: 4px;
                background: rgba(255, 51, 102, 0.08);
                border-left: 2px solid var(--loss-color);
                font-size: 10px;
                line-height: 1.3;
                color: var(--text-primary);
            }

            .tb-escalation-item.warning {
                background: rgba(255, 215, 0, 0.08);
                border-left-color: var(--ml-color);
            }

            .tb-escalation-title {
                font-weight: 600;
                display: block;
                margin-bottom: 2px;
            }

            .tb-escalation-detail {
                font-size: 9px;
                color: var(--text-secondary);
            }

            .tb-escalation-muted {
                padding: 6px 8px;
                font-size: 10px;
                color: var(--text-secondary);
                font-style: italic;
            }

            /* Ask TRAI section */
            .tb-ask-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px 12px;
                border-top: 1px solid var(--border-color);
                flex-shrink: 0;
                background: rgba(0, 0, 0, 0.3);
            }

            .tb-ask-input {
                width: 100%;
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                outline: none;
                transition: all 0.2s ease;
            }

            .tb-ask-input:focus {
                border-color: var(--ml-color);
                box-shadow: 0 0 8px rgba(255, 215, 0, 0.2);
            }

            .tb-ask-input::placeholder {
                color: var(--text-secondary);
            }

            /* Response panel */
            .tb-response-header {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: var(--ml-color);
                cursor: pointer;
                user-select: none;
                padding: 4px 8px;
                background: rgba(255, 215, 0, 0.08);
                border-radius: 3px;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: background 0.2s ease;
            }

            .tb-response-header:hover {
                background: rgba(255, 215, 0, 0.12);
            }

            .tb-response-arrow {
                display: inline-block;
                font-size: 8px;
                transform: rotate(0deg);
                transition: transform 0.2s ease;
            }

            .tb-response-header.expanded .tb-response-arrow {
                transform: rotate(90deg);
            }

            .tb-response-body {
                display: none;
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            }

            .tb-response-body.expanded {
                display: block;
                max-height: 200px;
                opacity: 1;
                overflow-y: auto;
                padding: 8px 10px;
                background: rgba(0, 204, 255, 0.05);
                border-radius: 4px;
                margin-top: 4px;
                border-left: 2px solid var(--core-color);
                font-size: 9px;
                line-height: 1.4;
                color: var(--text-secondary);
            }

            /* Scrollbar styling */
            .tb-sections::-webkit-scrollbar,
            .tb-narrator-lines::-webkit-scrollbar,
            .tb-response-body::-webkit-scrollbar {
                width: 4px;
            }

            .tb-sections::-webkit-scrollbar-track,
            .tb-narrator-lines::-webkit-scrollbar-track,
            .tb-response-body::-webkit-scrollbar-track {
                background: transparent;
            }

            .tb-sections::-webkit-scrollbar-thumb,
            .tb-narrator-lines::-webkit-scrollbar-thumb,
            .tb-response-body::-webkit-scrollbar-thumb {
                background: rgba(255, 215, 0, 0.2);
                border-radius: 2px;
            }

            .tb-sections::-webkit-scrollbar-thumb:hover,
            .tb-narrator-lines::-webkit-scrollbar-thumb:hover,
            .tb-response-body::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 215, 0, 0.4);
            }

            /* Expand/collapse toggle */
            .tb-see-more {
                font-size: 9px;
                color: var(--ml-color);
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 3px;
                background: rgba(255, 215, 0, 0.08);
                border: 1px solid rgba(255, 215, 0, 0.2);
                text-align: center;
                transition: all 0.2s ease;
                user-select: none;
            }

            .tb-see-more:hover {
                background: rgba(255, 215, 0, 0.12);
                border-color: rgba(255, 215, 0, 0.3);
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── DOM Rendering ──────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        root.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'tb-header';
        header.innerHTML = `
            <span class="tb-pulse"></span>
            <span class="tb-header-title">TRAI BRAIN</span>
            <div class="tb-header-status">Connecting...</div>
        `;
        state.domRefs.root = root;
        root.appendChild(header);

        // Sections container
        const sections = document.createElement('div');
        sections.className = 'tb-sections';
        root.appendChild(sections);

        // News section
        const newsSection = document.createElement('div');
        newsSection.className = 'tb-section';
        newsSection.innerHTML = '<div class="tb-section-title">Latest News</div>';
        state.domRefs.newsSection = newsSection;
        sections.appendChild(newsSection);

        // Whale section
        const whaleSection = document.createElement('div');
        whaleSection.className = 'tb-section';
        whaleSection.innerHTML = '<div class="tb-section-title">Whale Alert</div>';
        state.domRefs.whaleSection = whaleSection;
        sections.appendChild(whaleSection);

        // Narrator section
        const narratorSection = document.createElement('div');
        narratorSection.className = 'tb-section';
        narratorSection.innerHTML = '<div class="tb-section-title">Narrator Output</div>';
        state.domRefs.narratorSection = narratorSection;
        sections.appendChild(narratorSection);

        // Escalation section
        const escalationSection = document.createElement('div');
        escalationSection.className = 'tb-section';
        escalationSection.innerHTML = '<div class="tb-section-title">Escalation Queue</div>';
        state.domRefs.escalationSection = escalationSection;
        sections.appendChild(escalationSection);

        // Ask TRAI section
        const askSection = document.createElement('div');
        askSection.className = 'tb-ask-section';
        askSection.innerHTML = `
            <input type="text" class="tb-ask-input" placeholder="Ask TRAI about a ticker, news, or trade...">
            <div class="tb-response-section"></div>
        `;
        state.domRefs.askInput = askSection.querySelector('.tb-ask-input');
        state.domRefs.responseSection = askSection.querySelector('.tb-response-section');
        root.appendChild(askSection);

        // Wire up ask input
        state.domRefs.askInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const query = state.domRefs.askInput.value.trim();
                if (query) {
                    askTRAI(query);
                    state.domRefs.askInput.value = '';
                }
            }
        });

        state.mounted = true;
        return true;
    }

    function formatTime(ts) {
        const d = new Date(ts);
        const h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const meridiem = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m} ${meridiem}`;
    }

    function renderNews() {
        if (!state.domRefs.newsSection) return;

        // Keep title, remove items
        const title = state.domRefs.newsSection.querySelector('.tb-section-title');
        const existingItems = state.domRefs.newsSection.querySelectorAll('.tb-news-item, .tb-see-more');
        existingItems.forEach(el => el.remove());

        const filtered = state.news.filter(n => !state.selectedTicker || n.ticker === state.selectedTicker);
        const visible = filtered.slice(0, NEWS_VISIBLE_COUNT);

        if (visible.length === 0) {
            const muted = document.createElement('div');
            muted.className = 'tb-news-muted';
            muted.textContent = 'Awaiting market events...';
            state.domRefs.newsSection.appendChild(muted);
            return;
        }

        visible.forEach(item => {
            const el = document.createElement('div');
            el.className = `tb-news-item ${item.sentiment}`;
            const confMod = item.confidence_modifier ? ` (conf mod: ${item.confidence_modifier})` : '';
            el.innerHTML = `
                <span class="tb-news-time">${formatTime(item.ts)}</span>
                <span class="tb-news-headline">${item.headline}${confMod}</span>
                <span class="tb-news-source">${item.source}${item.ticker ? ' • ' + item.ticker : ''}</span>
            `;
            state.domRefs.newsSection.appendChild(el);
        });

        // "See more" if hidden items exist
        if (filtered.length > NEWS_VISIBLE_COUNT) {
            const seeMore = document.createElement('div');
            seeMore.className = 'tb-see-more';
            seeMore.textContent = `+${filtered.length - NEWS_VISIBLE_COUNT} more`;
            seeMore.addEventListener('click', () => {
                state.newsExpanded = !state.newsExpanded;
                renderNews();
            });
            state.domRefs.newsSection.appendChild(seeMore);
        }
    }

    function renderWhale() {
        if (!state.domRefs.whaleSection) return;

        const title = state.domRefs.whaleSection.querySelector('.tb-section-title');
        const existingItems = state.domRefs.whaleSection.querySelectorAll('.tb-whale-item, .tb-whale-muted');
        existingItems.forEach(el => el.remove());

        const filtered = state.whales.filter(w => !state.selectedTicker || w.ticker === state.selectedTicker);
        const item = filtered.length > 0 ? filtered[0] : null;

        if (!item) {
            const muted = document.createElement('div');
            muted.className = 'tb-whale-muted';
            muted.textContent = 'Watching for whales...';
            state.domRefs.whaleSection.appendChild(muted);
            return;
        }

        const el = document.createElement('div');
        el.className = 'tb-whale-item';
        el.innerHTML = `
            <span class="tb-news-time">${formatTime(item.ts)}</span>
            <span class="tb-news-headline">${item.description}</span>
            ${item.source ? `<span class="tb-news-source">${item.source}</span>` : ''}
        `;
        state.domRefs.whaleSection.appendChild(el);
    }

    function renderNarrator() {
        if (!state.domRefs.narratorSection) return;

        const title = state.domRefs.narratorSection.querySelector('.tb-section-title');
        const existingLines = state.domRefs.narratorSection.querySelectorAll('.tb-narrator-lines');
        existingLines.forEach(el => el.remove());

        if (state.narrator.length === 0) {
            const muted = document.createElement('div');
            muted.className = 'tb-whale-muted';
            muted.textContent = 'Awaiting narrator updates...';
            state.domRefs.narratorSection.appendChild(muted);
            return;
        }

        const container = document.createElement('div');
        container.className = 'tb-narrator-lines';

        const visible = state.narrator.slice(0, NARRATOR_LINES_VISIBLE);
        visible.forEach((line, idx) => {
            const el = document.createElement('div');
            el.className = `tb-narrator-line ${idx === 0 ? 'new' : ''}`;
            el.textContent = line.text;
            container.appendChild(el);
        });

        state.domRefs.narratorSection.appendChild(container);
    }

    function renderEscalation() {
        if (!state.domRefs.escalationSection) return;

        const title = state.domRefs.escalationSection.querySelector('.tb-section-title');
        const existingItems = state.domRefs.escalationSection.querySelectorAll('.tb-escalation-item, .tb-escalation-muted');
        existingItems.forEach(el => el.remove());

        if (state.escalations.length === 0) {
            const muted = document.createElement('div');
            muted.className = 'tb-escalation-muted';
            muted.textContent = '0 items requiring operator attention';
            state.domRefs.escalationSection.appendChild(muted);
            return;
        }

        state.escalations.forEach((esc, idx) => {
            const el = document.createElement('div');
            el.className = `tb-escalation-item ${esc.level}`;
            const detail = esc.detail ? `<div class="tb-escalation-detail">${esc.detail}</div>` : '';
            el.innerHTML = `
                <div class="tb-escalation-title">${idx + 1}. ${esc.title}</div>
                ${detail}
            `;
            state.domRefs.escalationSection.appendChild(el);
        });
    }

    function updateConnectionStatus() {
        const header = document.querySelector('.tb-header-status');
        if (header) {
            header.textContent = state.connectionStatus || 'Disconnected';
        }
    }

    // ─── WS Event Handlers ──────────────────────────────────────────
    // 'news_event' — DORMANT. Backend doesn't emit this yet (planned: TRAI
    // NLP+websearch crawler will broadcast). Handler is wired so the panel
    // lights up automatically once the emitter ships. Strict gating: drop any
    // malformed event rather than synthesizing placeholder text.
    function onNewsEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data || !data.headline) return;  // STRICT — no placeholder text
            const event = {
                ts: data.ts != null ? Number(data.ts)
                    : (data.timestamp != null ? Number(data.timestamp) : Date.now()),
                sentiment: ['bullish', 'neutral', 'defensive'].includes(data.sentiment)
                    ? data.sentiment
                    : 'neutral',
                headline: String(data.headline),
                source: String(data.source || 'TRAI'),
                ticker: data.ticker ? String(data.ticker) : undefined,
                confidence_modifier: data.confidence_modifier ? String(data.confidence_modifier) : undefined,
            };
            if (!event.ts) return;
            state.news.unshift(event);
            if (state.news.length > 30) state.news.pop();
            renderNews();
        } catch (_) { /* swallow */ }
    }

    // Resolve current trading symbol (single-pair bot, no ticker on event).
    function resolveCurrentSymbol() {
        try {
            const sel = document.getElementById('cp-assetSelector');
            if (sel && sel.value) return String(sel.value).toUpperCase();
        } catch (_) { /* swallow */ }
        return 'ASSET';
    }

    // Bot's whale_trade event shape:
    //   { type:'whale_trade', size, price, side:'BUY'|'SELL', timestamp }
    // size = USD notional (volume * price). side derived from candle close vs open.
    function onWhaleEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data) return;
            const sizeUsd = Number(data.size);
            const price   = Number(data.price);
            if (!isFinite(sizeUsd) || !isFinite(price)) return;
            const side    = String(data.side || '').toUpperCase();
            const ticker  = data.ticker ? String(data.ticker) : resolveCurrentSymbol();

            // Format $1.2M / $850K / $42 readout
            const sizeStr = sizeUsd >= 1e6
                ? `$${(sizeUsd / 1e6).toFixed(1)}M`
                : sizeUsd >= 1e3
                    ? `$${(sizeUsd / 1e3).toFixed(0)}K`
                    : `$${sizeUsd.toFixed(0)}`;

            const arrow = side === 'BUY' ? '▲' : side === 'SELL' ? '▼' : '◆';
            const desc  = `${arrow} ${side || '—'} ${sizeStr} @ $${price.toFixed(2)}`;

            const event = {
                ts: data.timestamp != null ? Number(data.timestamp) : Date.now(),
                description: desc,
                ticker: ticker,
                source: 'aggregated tape',
                side: side,
                sizeUsd: sizeUsd,
                price: price,
            };
            state.whales.unshift(event);
            if (state.whales.length > 20) state.whales.pop();
            renderWhale();
        } catch (_) { /* swallow */ }
    }

    // Bot's narrator_event shape:
    //   { type:'narrator_event', scope:'USER'|'ARCHITECT', event, timestamp, text, ... }
    // We only render USER-scope content (sanitized customer story). Architect
    // notes are operator-internal and stay off the customer-facing brain.
    function onNarratorEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data) return;
            // Filter to USER scope when present; if scope is missing assume USER
            const scope = data.scope ? String(data.scope).toUpperCase() : 'USER';
            if (scope !== 'USER') return;
            if (!data.text) return;
            addNarratorLine(String(data.text));
        } catch (_) { /* swallow */ }
    }

    // Bot 'bot_thinking' — heartbeat only; we don't push to narrator list (that
    // would clutter the customer-facing story). Used to keep the header dot
    // alive even during quiet stretches between USER-scope narrator events.
    let _lastBotThinkingAt = 0;
    function onBotThinking(_d) {
        _lastBotThinkingAt = Date.now();
    }

    function onEscalationEvent(data) {
        try {
            if (!data) return;
            const event = {
                id: data.id != null ? Number(data.id) : Date.now(),
                title: String(data.title || 'Escalation'),
                detail: data.detail ? String(data.detail) : undefined,
                level: ['warning', 'critical'].includes(data.level) ? data.level : 'critical',
            };
            state.escalations.push(event);
            if (state.escalations.length > 10) state.escalations.shift();
            renderEscalation();
        } catch (_) { /* swallow */ }
    }

    // ─── Public API ─────────────────────────────────────────────────
    function addNarratorLine(text) {
        try {
            if (!text) return;
            const line = {
                ts: Date.now(),
                text: String(text),
            };
            state.narrator.unshift(line);
            if (state.narrator.length > NARRATOR_MAX_BUFFER) {
                state.narrator.pop();
            }
            renderNarrator();
        } catch (_) { /* swallow */ }
    }

    async function askTRAI(query) {
        try {
            if (!query) return;

            // Show loading state
            const responseBody = state.domRefs.responseSection;
            if (responseBody) {
                responseBody.innerHTML = '';

                const header = document.createElement('div');
                header.className = 'tb-response-header expanded';
                header.innerHTML = '<span class="tb-response-arrow">▶</span> TRAI Response';
                responseBody.appendChild(header);

                const body = document.createElement('div');
                body.className = 'tb-response-body expanded';
                body.textContent = 'Thinking...';
                responseBody.appendChild(body);

                header.addEventListener('click', () => {
                    header.classList.toggle('expanded');
                    body.classList.toggle('expanded');
                });
            }

            // POST to /api/trai/analyze
            const response = await fetch('/api/trai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: query,
                    maxTokens: 1500,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Store and display response
            state.lastTRAIResponse = {
                response: data.response || '',
                provider: data.provider || 'Unknown',
                latency: data.latency || 0,
            };

            if (responseBody) {
                responseBody.innerHTML = '';

                const header = document.createElement('div');
                header.className = 'tb-response-header expanded';
                header.innerHTML = '<span class="tb-response-arrow">▶</span> TRAI Response';
                responseBody.appendChild(header);

                const body = document.createElement('div');
                body.className = 'tb-response-body expanded';
                body.textContent = data.response || '(Empty response)';
                responseBody.appendChild(body);

                header.addEventListener('click', () => {
                    header.classList.toggle('expanded');
                    body.classList.toggle('expanded');
                });
            }
        } catch (err) {
            try {
                const responseBody = state.domRefs.responseSection;
                if (responseBody) {
                    responseBody.innerHTML = '';

                    const header = document.createElement('div');
                    header.className = 'tb-response-header expanded';
                    header.innerHTML = '<span class="tb-response-arrow">▶</span> TRAI Response';
                    responseBody.appendChild(header);

                    const body = document.createElement('div');
                    body.className = 'tb-response-body expanded';
                    body.textContent = `Error: ${err.message}`;
                    body.style.color = 'var(--loss-color)';
                    responseBody.appendChild(body);

                    header.addEventListener('click', () => {
                        header.classList.toggle('expanded');
                        body.classList.toggle('expanded');
                    });
                }
            } catch (_) { /* swallow */ }
        }
    }

    function setConnectionStatus(status) {
        state.connectionStatus = status;
        updateConnectionStatus();
    }

    function clearAll() {
        state.news = [];
        state.whales = [];
        state.narrator = [];
        state.escalations = [];
        renderNews();
        renderWhale();
        renderNarrator();
        renderEscalation();
    }

    // ─── Lifecycle ──────────────────────────────────────────────────
    const api = {
        init() {
            try {
                injectStyles();
                if (!mount()) return;

                renderNews();
                renderWhale();
                renderNarrator();
                renderEscalation();

                // Subscribe to WS events via real socket (poll until ready)
                (function bindSocket() {
                    const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                    if (!socket || typeof socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    // Verified-emitter subs
                    socket.registerHandler('whale_trade',    (e) => { try { onWhaleEvent(e); } catch (_) {} });
                    socket.registerHandler('narrator_event', (e) => { try { onNarratorEvent(e); } catch (_) {} });
                    socket.registerHandler('bot_thinking',   (e) => { try { onBotThinking(e); } catch (_) {} });
                    // Future emitters — sub'd defensively so when backend ships
                    // them they light up automatically. Until then they no-op.
                    socket.registerHandler('news_event',  (e) => { try { onNewsEvent(e); } catch (_) {} });
                    socket.registerHandler('escalation',  (e) => { try { onEscalationEvent(e); } catch (_) {} });
                })();

                // Subscribe to bus events
                if (OGZ && OGZ.bus) {
                    OGZ.bus.on('watchlist:select', (data) => {
                        try {
                            state.selectedTicker = data && data.ticker ? String(data.ticker) : null;
                            renderNews();
                            renderWhale();
                        } catch (_) { /* swallow */ }
                    });
                }

                // Check TRAI status periodically
                async function checkStatus() {
                    try {
                        const response = await fetch('/api/trai/status');
                        if (response.ok) {
                            const status = await response.json();
                            const connStr = `Connected to ${status.model || 'Unknown'} / ${status.providerName || 'Unknown'}`;
                            setConnectionStatus(connStr);
                        } else {
                            setConnectionStatus('Status check failed');
                        }
                    } catch (_) {
                        setConnectionStatus('Disconnected');
                    }
                }

                checkStatus();
                state.statusCheckInterval = setInterval(checkStatus, STATUS_CHECK_INTERVAL_MS);
            } catch (_) { /* swallow */ }
        },

        askTRAI,
        addNarratorLine,
        setConnectionStatus,
        clearAll,

        teardown() {
            try {
                if (state.statusCheckInterval) {
                    clearInterval(state.statusCheckInterval);
                    state.statusCheckInterval = null;
                }

                if (state.domRefs.root) {
                    state.domRefs.root.innerHTML = '';
                }

                const style = document.getElementById(STYLE_ID);
                if (style) style.remove();

                state.mounted = false;
                state.news = [];
                state.whales = [];
                state.narrator = [];
                state.escalations = [];
            } catch (_) { /* swallow */ }
        },

        _compute() {
            return {
                mounted: state.mounted,
                selectedTicker: state.selectedTicker,
                newsCount: state.news.length,
                whalesCount: state.whales.length,
                narratorCount: state.narrator.length,
                escalationsCount: state.escalations.length,
                connectionStatus: state.connectionStatus,
                lastResponse: state.lastTRAIResponse,
            };
        },
    };

    // ─── Registration ───────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('TRAIBrain', api);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('TRAIBrain', api);
            }
        });
    }

    try { window.OGZTRAIBrain = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
