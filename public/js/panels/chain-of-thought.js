/**
 * chain-of-thought.js — ChainOfThought: Streaming Reasoning Ribbon
 *
 * Real-time streaming reasoning panel that displays the bot's live decision log.
 * Every decision the bot makes narrates itself as a line of reasoning. This is
 * OGZPrime's white-box AI differentiator — competitors hide their logic;
 * we narrate every step in real time as it happens.
 *
 * What it renders:
 *   - Horizontal ribbon (~140px tall) mounted between main grid and footer
 *   - Streaming reasoning lines: newest at the bottom (bottom-up scroll)
 *   - Each line: timestamp (HH:MM:SS ET) + reasoning text + optional ticker pill +
 *     optional confidence pill
 *   - Older lines fade out at top edge with gradient mask
 *   - Auto-scroll to keep newest line in view
 *   - Buffers last N lines (default 50). Older lines drop off.
 *   - Subtle typewriter-stream-in animation on new lines (~0.4s char reveal)
 *
 * Self-registers as OGZ.ChainOfThought via OGZ.register().
 * Mounts into <div id="chainOfThought"></div>.
 *
 * Subscribes to WS events:
 *   - narrator_event (✓ verified per CURRENT-ARCHITECTURE.md)
 *   - bot_thinking (⚠ partial verification; optional augmentation)
 *   - signal_analysis (⚠ optional; if present, inject decision-level lines)
 * Listens to OGZ.bus:
 *   - watchlist:select — when ticker changes, inject "[scope: TICKER]" divider
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   addLine(text, opts) — Manually add a reasoning line {text, symbol?, confidence?, level?}
 *   setSymbol(ticker) — Scope all future lines to this ticker (updates divider)
 *   pause() — Stop auto-scroll but keep receiving lines
 *   resume() — Resume auto-scroll
 *   clear() — Clear all lines (respects maxLines cap)
 *   setMaxLines(n) — Change buffer size
 *   getLines() — Return current lines array
 *   setDemoMode(bool) — Toggle demo reasoning stream (cycles through realistic lines)
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return internal state snapshot
 *
 * @typedef {Object} ReasoningLine
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} text - The reasoning content (max ~200 chars)
 * @property {string} [symbol] - Optional ticker context (e.g., 'TSLA')
 * @property {number} [confidence] - 0..1 if applicable
 * @property {'info'|'decision'|'warning'|'execution'} [level] - Line severity/type
 *
 * @module public/js/panels/chain-of-thought
 */
(function (OGZ) {
    'use strict';

    /**
     * @typedef {Object} ReasoningLine
     * @property {number} ts - Unix epoch milliseconds
     * @property {string} text - Reasoning text content
     * @property {string} [symbol] - Optional ticker symbol
     * @property {number} [confidence] - 0..1 confidence value
     * @property {'info'|'decision'|'warning'|'execution'} [level] - Line type
     */

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-chain-of-thought-styles';
    const ROOT_ID = 'chainOfThought';
    const MAX_LINES_DEFAULT = 50;
    const TYPEWRITER_MS = 400;
    const AUTO_SCROLL_DELAY_MS = 100;
    const PLACEHOLDER_TEXT = 'Bot reasoning will stream here...';

    // Demo reasoning lines — realistic decision narration
    const DEMO_LINES = [
        { text: 'Strategy-A scoring TSLA at 73% conf', level: 'decision', confidence: 0.73, symbol: 'TSLA' },
        { text: 'Pattern engine suggests Double Bottom — confluence with Strategy-B at 68%', level: 'info', confidence: 0.68, symbol: 'TSLA' },
        { text: 'News check: clean. Whale check: bullish (block trade 50K @ $393.10)', level: 'info', symbol: 'TSLA' },
        { text: 'Risk gate: ARMED. Daily DD remaining: $1,847 / $2,000 floor', level: 'decision', symbol: 'TSLA' },
        { text: 'Position stance: Aggressive (×1.4) based on composite confidence', level: 'decision', confidence: 0.73, symbol: 'TSLA' },
        { text: 'Entering LONG TSLA @ $391.20, SL $389.50 (0.43%), TP $396.18 (1.27%, 1R)', level: 'execution', symbol: 'TSLA' },
        { text: 'COIN: no entry, conf below threshold (61% / 70 needed)', level: 'warning', confidence: 0.61, symbol: 'COIN' },
        { text: 'BTC breakout confirmed above $81K resistance. Monitoring for scalp entry', level: 'info', confidence: 0.72, symbol: 'BTC' },
    ];

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        demoMode: false,
        paused: false,
        currentSymbol: null,

        // Lines buffer
        lines: [],                  // Array<ReasoningLine>
        maxLines: MAX_LINES_DEFAULT,

        // DOM refs
        root: null,
        container: null,
        contentArea: null,

        // Timers
        autoScrollTimer: null,
        demoLoopTimer: null,
        demoIndex: 0,

        // Event listeners
        listeners: [],
    };

    // ─── CSS Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            #${ROOT_ID} {
                position: relative;
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 140px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 6px;
                backdrop-filter: blur(12px) saturate(140%);
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                overflow: hidden;
                padding: 0;
                gap: 0;
            }

            .cot-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-bottom: 1px solid var(--glass-border);
                flex-shrink: 0;
                background: rgba(0, 0, 0, 0.2);
            }

            .cot-title {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .cot-status {
                font-size: 9px;
                color: var(--text-secondary);
                margin-left: auto;
                flex-shrink: 0;
            }

            .cot-status.paused {
                color: var(--loss-color);
            }

            /* Content scrollable area */
            .cot-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                display: flex;
                flex-direction: column;
                gap: 0;
                padding: 8px 10px;
                min-height: 0;
                position: relative;
                mask-image: linear-gradient(
                    to bottom,
                    transparent 0%,
                    transparent 12%,
                    black 20%,
                    black 100%
                );
                -webkit-mask-image: linear-gradient(
                    to bottom,
                    transparent 0%,
                    transparent 12%,
                    black 20%,
                    black 100%
                );
            }

            /* Individual reasoning line */
            .cot-line {
                display: flex;
                align-items: baseline;
                gap: 8px;
                padding: 4px 6px;
                border-radius: 3px;
                background: transparent;
                border-left: 2px solid transparent;
                font-size: 10px;
                line-height: 1.4;
                color: var(--text-secondary);
                transition: all 0.2s ease;
                flex-shrink: 0;
                animation: cot-line-enter 0.3s ease-out;
                min-height: 18px;
                word-break: break-word;
            }

            @keyframes cot-line-enter {
                from {
                    opacity: 0;
                    transform: translateY(4px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            /* Line timestamp */
            .cot-time {
                font-size: 9px;
                color: var(--text-secondary);
                opacity: 0.7;
                flex-shrink: 0;
                min-width: 75px;
            }

            /* Line text content */
            .cot-text {
                flex: 1;
                color: var(--text-secondary);
                font-size: 10px;
                line-height: 1.4;
            }

            /* Typewriter animation for char reveal */
            .cot-text.typewriter {
                animation: cot-typewriter ${TYPEWRITER_MS}ms steps(60, end) 1;
                overflow: hidden;
                white-space: nowrap;
            }

            @keyframes cot-typewriter {
                from { max-width: 0; }
                to { max-width: 100%; }
            }

            /* Symbol pill */
            .cot-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 2px 6px;
                background: rgba(255, 215, 0, 0.12);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 10px;
                font-size: 8px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                color: var(--ml-color);
                flex-shrink: 0;
                white-space: nowrap;
            }

            /* Confidence pill */
            .cot-confidence {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 2px 6px;
                background: rgba(0, 255, 136, 0.12);
                border: 1px solid rgba(0, 255, 136, 0.3);
                border-radius: 10px;
                font-size: 8px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                color: var(--profit-color);
                flex-shrink: 0;
                white-space: nowrap;
            }

            /* Line type colors */
            .cot-line.decision {
                border-left-color: var(--ml-color);
                color: var(--text-primary);
            }

            .cot-line.decision .cot-text {
                color: var(--text-primary);
                font-weight: 500;
            }

            .cot-line.warning {
                border-left-color: var(--loss-color);
            }

            .cot-line.warning .cot-text {
                color: var(--loss-color);
            }

            .cot-line.execution {
                border-left-color: var(--profit-color);
                background: rgba(0, 255, 136, 0.04);
            }

            .cot-line.execution .cot-text {
                color: var(--profit-color);
                font-weight: 500;
            }

            .cot-line.info {
                border-left-color: var(--text-secondary);
            }

            /* Empty state / placeholder */
            .cot-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                flex: 1;
                color: var(--text-secondary);
                font-size: 10px;
                font-weight: 300;
                text-align: center;
                padding: 8px;
                animation: cot-pulse 2s ease-in-out infinite;
            }

            @keyframes cot-pulse {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 0.7; }
            }

            /* Divider line for ticker scope change */
            .cot-divider {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                margin: 4px 0;
                border: none;
                border-top: 1px dashed rgba(255, 215, 0, 0.3);
                font-size: 8px;
                color: var(--ml-color);
                text-transform: uppercase;
                letter-spacing: 0.6px;
                flex-shrink: 0;
            }

            /* Scrollbar styling */
            .cot-content::-webkit-scrollbar {
                width: 4px;
            }

            .cot-content::-webkit-scrollbar-track {
                background: transparent;
            }

            .cot-content::-webkit-scrollbar-thumb {
                background: rgba(255, 215, 0, 0.2);
                border-radius: 2px;
            }

            .cot-content::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 215, 0, 0.4);
            }

            @media (prefers-reduced-motion: reduce) {
                .cot-line,
                .cot-text.typewriter,
                .cot-placeholder {
                    animation: none;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── DOM Mount ───────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;

        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        root.innerHTML = '';
        state.root = root;

        // Header
        const header = document.createElement('div');
        header.className = 'cot-header';
        header.innerHTML = `
            <span class="cot-title">CHAIN OF THOUGHT</span>
            <span class="cot-status" id="cotStatus">Ready</span>
        `;
        root.appendChild(header);

        // Content area
        const content = document.createElement('div');
        content.className = 'cot-content';
        content.id = 'cotContent';
        state.contentArea = content;
        root.appendChild(content);

        // Pause on hover
        root.addEventListener('mouseenter', () => { state.paused = true; updateStatus(); });
        root.addEventListener('mouseleave', () => { state.paused = false; updateStatus(); });

        state.mounted = true;
        return true;
    }

    function updateStatus() {
        const el = document.getElementById('cotStatus');
        if (el) {
            el.textContent = state.paused ? 'PAUSED' : 'LIVE';
            el.classList.toggle('paused', state.paused);
        }
    }

    // ─── Line rendering ─────────────────────────────────────────────
    function formatTime(ts) {
        const d = new Date(ts);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s} ET`;
    }

    function renderLine(line) {
        const el = document.createElement('div');
        el.className = `cot-line ${line.level || 'info'}`;

        // Timestamp
        const timeEl = document.createElement('span');
        timeEl.className = 'cot-time';
        timeEl.textContent = formatTime(line.ts);
        el.appendChild(timeEl);

        // Text content
        const textEl = document.createElement('span');
        textEl.className = 'cot-text typewriter';
        textEl.textContent = line.text;
        el.appendChild(textEl);

        // Symbol pill
        if (line.symbol) {
            const pillEl = document.createElement('span');
            pillEl.className = 'cot-pill';
            pillEl.textContent = line.symbol;
            el.appendChild(pillEl);
        }

        // Confidence pill
        if (line.confidence != null) {
            const confEl = document.createElement('span');
            confEl.className = 'cot-confidence';
            confEl.textContent = `${Math.round(line.confidence * 100)}%`;
            el.appendChild(confEl);
        }

        return el;
    }

    function renderDivider(ticker) {
        const el = document.createElement('div');
        el.className = 'cot-divider';
        el.textContent = `— Scope: ${ticker} —`;
        return el;
    }

    // ─── Public API ─────────────────────────────────────────────────
    const ChainOfThought = {
        /**
         * Initialize: mount to DOM, inject styles, subscribe to WS events.
         */
        init() {
            try {
                injectStyles();
                if (!mount()) return; // Mount point missing

                // Subscribe to narrator events
                const socket = OGZ && OGZ.get && OGZ.get('Socket');
                if (socket && socket.registerHandler) {
                    socket.registerHandler('narrator_event', onNarratorEvent);
                    socket.registerHandler('bot_thinking', onBotThinking);
                    socket.registerHandler('signal_analysis', onSignalAnalysis);
                }

                // Subscribe to bus events
                if (OGZ && OGZ.bus) {
                    if (OGZ.bus.on) {
                        OGZ.bus.on('watchlist:select', onWatchlistSelect);
                    }
                }

                // Render empty state
                render();
            } catch (_) { /* swallow */ }
        },

        /**
         * Add a reasoning line manually.
         * @param {string} text - Reasoning content
         * @param {Object} [opts] - { symbol?, confidence?, level? }
         */
        addLine(text, opts) {
            try {
                if (!text) return;
                const line = {
                    ts: Date.now(),
                    text: String(text),
                    symbol: opts && opts.symbol ? String(opts.symbol) : undefined,
                    confidence: opts && opts.confidence != null ? Number(opts.confidence) : undefined,
                    level: opts && ['info', 'decision', 'warning', 'execution'].includes(opts.level)
                        ? opts.level
                        : 'info',
                };
                state.lines.push(line);
                if (state.lines.length > state.maxLines) {
                    state.lines.shift();
                }
                render();
            } catch (_) { /* swallow */ }
        },

        /**
         * Set the current ticker scope (injects divider).
         * @param {string} ticker - Ticker symbol
         */
        setSymbol(ticker) {
            try {
                if (!ticker || ticker === state.currentSymbol) return;
                state.currentSymbol = String(ticker);
                this.addLine(`Scope: ${ticker}`, { level: 'info' });
            } catch (_) { /* swallow */ }
        },

        /**
         * Pause auto-scroll (manual user action).
         */
        pause() {
            state.paused = true;
            updateStatus();
        },

        /**
         * Resume auto-scroll.
         */
        resume() {
            state.paused = false;
            updateStatus();
        },

        /**
         * Clear all lines.
         */
        clear() {
            state.lines = [];
            render();
        },

        /**
         * Set max lines buffer.
         * @param {number} n
         */
        setMaxLines(n) {
            state.maxLines = Math.max(10, Math.min(500, n));
            while (state.lines.length > state.maxLines) {
                state.lines.shift();
            }
        },

        /**
         * Get current lines array.
         * @returns {Array<ReasoningLine>}
         */
        getLines() {
            return state.lines.slice();
        },

        /**
         * Toggle demo mode (cycles through realistic reasoning lines).
         * @param {boolean} enabled
         */
        setDemoMode(enabled) {
            state.demoMode = !!enabled;
            if (enabled) {
                startDemoLoop();
            } else {
                stopDemoLoop();
            }
        },

        /**
         * Teardown: remove DOM, listeners, styles.
         */
        teardown() {
            try {
                stopDemoLoop();

                if (state.root) {
                    state.root.innerHTML = '';
                }

                const styleEl = document.getElementById(STYLE_ID);
                if (styleEl) styleEl.remove();

                state.mounted = false;
                state.lines = [];
                if (state.autoScrollTimer) clearTimeout(state.autoScrollTimer);
            } catch (_) { /* swallow */ }
        },

        /**
         * Debug helper.
         * @returns {Object}
         */
        _compute() {
            return {
                mounted: state.mounted,
                lineCount: state.lines.length,
                maxLines: state.maxLines,
                paused: state.paused,
                demoMode: state.demoMode,
                currentSymbol: state.currentSymbol,
            };
        },
    };

    // ─── Event Handlers ─────────────────────────────────────────────
    function onNarratorEvent(data) {
        try {
            if (!data) return;
            const text = String(data.text || data.message || '');
            const symbol = data.symbol || data.ticker;
            const level = data.level || 'info';
            if (!text) return;

            ChainOfThought.addLine(text, {
                symbol,
                level,
            });
        } catch (_) { /* swallow */ }
    }

    function onBotThinking(data) {
        try {
            if (!data || !data.thinking) return;
            const text = String(data.thinking);
            if (!text) return;

            ChainOfThought.addLine(text, {
                level: 'decision',
                confidence: data.confidence,
            });
        } catch (_) { /* swallow */ }
    }

    function onSignalAnalysis(data) {
        try {
            if (!data) return;
            const text = data.description || data.analysis;
            if (!text) return;

            ChainOfThought.addLine(String(text), {
                symbol: data.symbol || data.ticker,
                confidence: data.confidence,
                level: 'decision',
            });
        } catch (_) { /* swallow */ }
    }

    function onWatchlistSelect(data) {
        try {
            if (data && data.ticker) {
                ChainOfThought.setSymbol(String(data.ticker));
            }
        } catch (_) { /* swallow */ }
    }

    // ─── Rendering ──────────────────────────────────────────────────
    function render() {
        if (!state.mounted || !state.contentArea) return;

        state.contentArea.innerHTML = '';

        if (state.lines.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'cot-placeholder';
            placeholder.textContent = PLACEHOLDER_TEXT;
            state.contentArea.appendChild(placeholder);
            return;
        }

        // Render all lines (newest at bottom for bottom-up scroll)
        state.lines.forEach(line => {
            const el = renderLine(line);
            state.contentArea.appendChild(el);
        });

        // Auto-scroll to bottom if not paused
        if (!state.paused) {
            if (state.autoScrollTimer) clearTimeout(state.autoScrollTimer);
            state.autoScrollTimer = setTimeout(() => {
                if (state.contentArea) {
                    state.contentArea.scrollTop = state.contentArea.scrollHeight;
                }
            }, AUTO_SCROLL_DELAY_MS);
        }
    }

    // ─── Demo Mode ──────────────────────────────────────────────────
    function startDemoLoop() {
        stopDemoLoop();
        state.demoIndex = 0;

        const loop = () => {
            if (!state.demoMode) return;

            const line = DEMO_LINES[state.demoIndex % DEMO_LINES.length];
            ChainOfThought.addLine(line.text, {
                symbol: line.symbol,
                confidence: line.confidence,
                level: line.level,
            });

            state.demoIndex++;
            state.demoLoopTimer = setTimeout(loop, 400 + Math.random() * 800);
        };

        loop();
    }

    function stopDemoLoop() {
        if (state.demoLoopTimer) {
            clearTimeout(state.demoLoopTimer);
            state.demoLoopTimer = null;
        }
    }

    // ─── Registration ───────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('ChainOfThought', ChainOfThought);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('ChainOfThought', ChainOfThought);
            }
        });
    }

})(window.OGZ = window.OGZ || {});
