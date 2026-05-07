/**
 * pattern-card.js — PatternCard: White-Box ML Pattern Visualization
 *
 * The operator's signature feature — real-time chart pattern detection with
 * hand-drawn SVG illustrations of canonical shapes. When the bot's pattern
 * engine detects a chart pattern (double bottom, head & shoulders, etc.),
 * this panel displays:
 *   - Pattern name (large, prominent)
 *   - Hand-drawn canonical SVG shape for the pattern
 *   - 1-2 sentence description of what makes it that pattern
 *   - Live confidence with thermal gradient bar
 *   - Recent occurrence history for the current ticker (last 3-5 with W/L outcomes)
 *
 * Two visible states:
 *   SCANNING: Small pulsing magnifying glass, label "Pattern engine scanning...",
 *             optional last-detected attribution
 *   DETECTED: Card flip animation. Pattern name, SVG, description, confidence bar,
 *             mini-list of recent occurrences on the selected ticker.
 *
 * Self-registers as OGZ.PatternCard via OGZ.register().
 * Mounts into <div id="patternCard"></div>.
 * Subscribes to WS event `pattern_analysis` (backend emitter UNVERIFIED).
 * Listens for `OGZ.bus.on('watchlist:select', ...)` to re-render for new ticker.
 * Gracefully handles "no events ever arrive" — stays in scanning state indefinitely.
 *
 * Demo mode optional (off by default). Enable via OGZ.PatternCard.setDemoMode(true)
 * for testing/screenshots.
 *
 * Public API:
 *   init() - Mount to DOM, inject styles, subscribe to WS events
 *   setSymbol(symbol) - Manually set the displayed ticker (used by watchlist listener)
 *   setDemoMode(enabled) - Toggle demo pattern generation on/off
 *   recordPattern(event) - Inject a fake pattern event (for testing)
 *   getHistory(symbol) - Get recent detection history for a symbol
 *   clearHistory(symbol) - Clear cached history for a symbol
 *   teardown() - Remove DOM, listeners, styles
 *   _compute() - Debug helper: return internal state snapshot
 *
 * @typedef {Object} PatternEvent
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} symbol - Ticker symbol (e.g., 'TSLA')
 * @property {string} pattern - Pattern key (e.g., 'double_bottom')
 * @property {number} confidence - 0..1
 * @property {'long'|'short'|null} bias - Direction implied by pattern
 * @property {string} [neckline] - Optional price level (e.g., for H&S)
 * @property {Object} [meta] - Optional extra context (timeframe, stage, etc.)
 *
 * @module public/js/panels/pattern-card
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-pattern-card-styles';
    const ROOT_ID = 'patternCard';
    const MAX_HISTORY_PER_TICKER = 5;     // Show up to 5 recent detections
    const MAX_HISTORY_TOTAL = 30;          // Cap total in-memory history at 30
    const DEMO_INTERVAL_MS = 8000;         // Demo mode: emit a fake pattern every 8s
    const CARD_FLIP_MS = 600;              // Animation duration for state transition

    // ─── SVG Pattern Art Library ────────────────────────────────────────
    // Each function returns an <svg> string with viewBox 240x100.
    // Styles use CSS variables for colors (--core-color cyan, --ml-color gold, etc.)
    const PATTERN_ART = {
        'double_bottom': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="db-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background fill (subtle bullish) -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#db-bg)"/>
            <!-- Support line (neckline) -->
            <line x1="20" y1="42" x2="240" y2="42" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left low (point 1) -->
            <path d="M 20 70 L 60 30 L 100 65" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right low (point 2, symmetrical) -->
            <path d="M 100 65 L 150 35 L 200 68 L 220 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="70" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="100" cy="65" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="180" cy="68" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="35" y="85" font-size="9" fill="var(--text-secondary)" font-family="monospace">1</text>
            <text x="95" y="85" font-size="9" fill="var(--text-secondary)" font-family="monospace">valley</text>
            <text x="175" y="85" font-size="9" fill="var(--text-secondary)" font-family="monospace">2</text>
        </svg>`,

        'double_top': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="dt-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background fill (subtle bearish) -->
            <path d="M 20 0 L 240 0 L 240 60 L 20 60 Z" fill="url(#dt-bg)"/>
            <!-- Neckline (resistance) -->
            <line x1="20" y1="58" x2="240" y2="58" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left peak -->
            <path d="M 20 55 L 60 15 L 100 50" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right peak (symmetrical) -->
            <path d="M 100 50 L 150 18 L 200 52 L 220 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="60" cy="15" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="100" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="150" cy="18" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="50" y="10" font-size="9" fill="var(--text-secondary)" font-family="monospace">1</text>
            <text x="95" y="35" font-size="9" fill="var(--text-secondary)" font-family="monospace">peak</text>
            <text x="145" y="10" font-size="9" fill="var(--text-secondary)" font-family="monospace">2</text>
        </svg>`,

        'head_shoulders': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="hs-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 65 L 20 65 Z" fill="url(#hs-bg)"/>
            <!-- Neckline -->
            <line x1="20" y1="63" x2="240" y2="63" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left shoulder -->
            <path d="M 20 60 L 50 30 L 80 58" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Head (highest peak) -->
            <path d="M 80 58 L 120 8 L 160 58" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right shoulder -->
            <path d="M 160 58 L 190 32 L 220 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="50" cy="30" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="8" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="190" cy="32" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="40" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">L</text>
            <text x="115" y="5" font-size="9" fill="var(--text-secondary)" font-family="monospace">H</text>
            <text x="185" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">R</text>
        </svg>`,

        'inv_head_shoulders': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ihs-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 35 L 240 35 L 240 100 L 20 100 Z" fill="url(#ihs-bg)"/>
            <!-- Neckline -->
            <line x1="20" y1="37" x2="240" y2="37" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left shoulder -->
            <path d="M 20 40 L 50 70 L 80 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Head (lowest point) -->
            <path d="M 80 42 L 120 92 L 160 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right shoulder -->
            <path d="M 160 42 L 190 68 L 220 40" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="50" cy="70" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="92" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="190" cy="68" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="40" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">L</text>
            <text x="115" y="95" font-size="9" fill="var(--text-secondary)" font-family="monospace">H</text>
            <text x="185" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">R</text>
        </svg>`,

        'ascending_triangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="at-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#at-bg)"/>
            <!-- Resistance (upper trend line) -->
            <line x1="20" y1="75" x2="200" y2="25" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Support (horizontal line) -->
            <line x1="20" y1="75" x2="200" y2="75" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: rising lows, flat highs -->
            <path d="M 20 72 L 40 50 L 60 65 L 85 42 L 110 58 L 135 38 L 160 52 L 190 30" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points (rising lows) -->
            <circle cx="40" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="85" cy="42" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="160" cy="52" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="15" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">sup</text>
            <text x="200" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">res</text>
        </svg>`,

        'descending_triangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="dt-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 60 L 20 60 Z" fill="url(#dt-bg)"/>
            <!-- Resistance (horizontal line) -->
            <line x1="20" y1="25" x2="200" y2="25" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Support (lower trend line) -->
            <line x1="20" y1="25" x2="200" y2="75" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: falling highs, flat lows -->
            <path d="M 20 28 L 40 50 L 60 35 L 85 58 L 110 42 L 135 62 L 160 48 L 190 70" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points (falling highs) -->
            <circle cx="40" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="85" cy="58" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="160" cy="48" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="15" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">res</text>
            <text x="200" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">sup</text>
        </svg>`,

        'symmetric_triangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="sym-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--neutral-color);stop-opacity:0.03"/>
                    <stop offset="100%" style="stop-color:var(--neutral-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 25 L 240 25 L 240 75 L 20 75 Z" fill="url(#sym-bg)"/>
            <!-- Upper trend (resistance narrowing) -->
            <line x1="20" y1="30" x2="180" y2="50" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower trend (support narrowing) -->
            <line x1="20" y1="70" x2="180" y2="50" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: oscillating with decreasing amplitude -->
            <path d="M 20 32 L 35 68 L 50 35 L 65 65 L 80 40 L 95 60 L 110 45 L 125 55 L 140 48" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Convergence point -->
            <circle cx="180" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="185" y="45" font-size="9" fill="var(--text-secondary)" font-family="monospace">apex</text>
        </svg>`,

        'bull_flag': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="bf-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#bf-bg)"/>
            <!-- Pole (initial uptrend) -->
            <path d="M 20 75 L 45 25" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <!-- Flag (slight downtrend/consolidation) -->
            <path d="M 45 25 L 70 35 L 95 32 L 120 38 L 145 35" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Breakout -->
            <path d="M 145 35 L 180 15" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Support/resistance in flag -->
            <line x1="45" y1="28" x2="145" y2="32" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <line x1="45" y1="38" x2="145" y2="38" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <!-- Annotations -->
            <text x="25" y="50" font-size="9" fill="var(--text-secondary)" font-family="monospace">pole</text>
            <text x="85" y="50" font-size="9" fill="var(--text-secondary)" font-family="monospace">flag</text>
        </svg>`,

        'bear_flag': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="bearf-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 60 L 20 60 Z" fill="url(#bearf-bg)"/>
            <!-- Pole (initial downtrend) -->
            <path d="M 20 25 L 45 75" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <!-- Flag (slight uptrend/consolidation) -->
            <path d="M 45 75 L 70 65 L 95 68 L 120 62 L 145 65" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Breakdown -->
            <path d="M 145 65 L 180 85" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Support/resistance in flag -->
            <line x1="45" y1="72" x2="145" y2="68" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <line x1="45" y1="62" x2="145" y2="62" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <!-- Annotations -->
            <text x="25" y="40" font-size="9" fill="var(--text-secondary)" font-family="monospace">pole</text>
            <text x="85" y="55" font-size="9" fill="var(--text-secondary)" font-family="monospace">flag</text>
        </svg>`,

        'cup_handle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ch-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#ch-bg)"/>
            <!-- Neckline (resistance) -->
            <line x1="20" y1="42" x2="220" y2="42" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Cup (rounded U shape) -->
            <path d="M 20 42 L 50 70 Q 100 85 150 70 L 180 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Handle (small pullback) -->
            <path d="M 180 42 L 195 55 L 210 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Breakout arrow (implied) -->
            <path d="M 210 42 L 225 25" stroke="var(--core-color)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.6"/>
            <!-- Key points -->
            <circle cx="100" cy="85" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="195" cy="55" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="90" y="95" font-size="9" fill="var(--text-secondary)" font-family="monospace">cup</text>
            <text x="195" y="65" font-size="9" fill="var(--text-secondary)" font-family="monospace">h</text>
        </svg>`,

        'wedge_rising': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="wr-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 70 L 20 70 Z" fill="url(#wr-bg)"/>
            <!-- Upper trend (resistance rising) -->
            <line x1="20" y1="50" x2="190" y2="15" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower trend (support rising faster) -->
            <line x1="20" y1="65" x2="190" y2="35" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: squeezed higher -->
            <path d="M 20 48 L 40 42 L 60 38 L 80 34 L 100 30 L 120 28 L 140 25 L 160 22" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="42" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="28" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="10" y="45" font-size="9" fill="var(--text-secondary)" font-family="monospace">r</text>
            <text x="10" y="65" font-size="9" fill="var(--text-secondary)" font-family="monospace">s</text>
        </svg>`,

        'wedge_falling': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="wf-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 30 L 240 30 L 240 100 L 20 100 Z" fill="url(#wf-bg)"/>
            <!-- Upper trend (resistance falling) -->
            <line x1="20" y1="35" x2="190" y2="65" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower trend (support falling slower) -->
            <line x1="20" y1="50" x2="190" y2="65" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: squeezed lower -->
            <path d="M 20 52 L 40 58 L 60 62 L 80 66 L 100 70 L 120 72 L 140 75 L 160 78" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="58" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="72" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="10" y="35" font-size="9" fill="var(--text-secondary)" font-family="monospace">r</text>
            <text x="10" y="50" font-size="9" fill="var(--text-secondary)" font-family="monospace">s</text>
        </svg>`,

        'rectangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="rect-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--neutral-color);stop-opacity:0.03"/>
                    <stop offset="100%" style="stop-color:var(--neutral-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 30 L 240 30 L 240 70 L 20 70 Z" fill="url(#rect-bg)"/>
            <!-- Upper boundary (resistance) -->
            <line x1="20" y1="32" x2="220" y2="32" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower boundary (support) -->
            <line x1="20" y1="68" x2="220" y2="68" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price oscillating within bounds -->
            <path d="M 20 68 L 40 35 L 60 65 L 80 38 L 100 62 L 120 36 L 140 64 L 160 38 L 180 60 L 200 35" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="35" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="100" cy="62" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="180" cy="60" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="10" y="28" font-size="9" fill="var(--text-secondary)" font-family="monospace">res</text>
            <text x="10" y="75" font-size="9" fill="var(--text-secondary)" font-family="monospace">sup</text>
        </svg>`,

        'liquidity_sweep': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ls-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#ls-bg)"/>
            <!-- Resistance level -->
            <line x1="20" y1="42" x2="180" y2="42" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Initial uptrend -->
            <path d="M 20 75 L 60 35 L 80 45" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Pullback -->
            <path d="M 80 45 L 100 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Liquidity sweep (break above then drop) -->
            <path d="M 100 60 L 120 30 L 140 65" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.9"/>
            <!-- Recovery -->
            <path d="M 140 65 L 180 25" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Key points -->
            <circle cx="60" cy="35" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="30" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="140" cy="65" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="115" y="15" font-size="9" fill="var(--text-secondary)" font-family="monospace">sweep</text>
        </svg>`,

        'breakout_retest': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="br-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#br-bg)"/>
            <!-- Resistance/breakout level -->
            <line x1="20" y1="42" x2="220" y2="42" stroke="var(--ml-color)" stroke-width="1.5" stroke-dasharray="4,3"/>
            <!-- Consolidation before breakout -->
            <path d="M 20 55 L 40 50 L 60 52 L 80 51 L 100 53" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Initial breakout -->
            <path d="M 100 53 L 130 25" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <!-- Retest (pullback to level) -->
            <path d="M 130 25 L 155 43 L 170 38" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Confirmation (breakout again) -->
            <path d="M 170 38 L 200 20" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Key points -->
            <circle cx="130" cy="25" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="155" cy="43" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="120" y="15" font-size="9" fill="var(--text-secondary)" font-family="monospace">BRK</text>
            <text x="155" y="55" font-size="9" fill="var(--text-secondary)" font-family="monospace">TEST</text>
        </svg>`,
    };

    // ─── Pattern Descriptions ────────────────────────────────────────────
    const PATTERN_DESCRIPTIONS = {
        'double_bottom': {
            title: 'Double Bottom',
            bias: 'bullish',
            summary: 'Two roughly-equal lows separated by a peak. Signals exhaustion of selling pressure. Confirm on neckline break with volume.',
        },
        'double_top': {
            title: 'Double Top',
            bias: 'short',
            summary: 'Two peaks at similar level separated by a valley. Bearish reversal pattern. Confirm on neckline break downward.',
        },
        'head_shoulders': {
            title: 'Head & Shoulders',
            bias: 'short',
            summary: 'Three peaks (left shoulder, head, right shoulder) with lower second shoulder. Classic reversal. Confirm on neckline support break.',
        },
        'inv_head_shoulders': {
            title: 'Inverse H&S',
            bias: 'long',
            summary: 'Inverted version of H&S (three lows). Bullish reversal pattern emerging from downtrend. Confirm on neckline resistance break.',
        },
        'ascending_triangle': {
            title: 'Ascending Triangle',
            bias: 'long',
            summary: 'Rising lows meet flat resistance. Buyer conviction increases while sellers hold line. Breakout above is typical bullish resolution.',
        },
        'descending_triangle': {
            title: 'Descending Triangle',
            bias: 'short',
            summary: 'Falling highs meet flat support. Seller conviction increases while buyers hold line. Breakout downward is typical bearish resolution.',
        },
        'symmetric_triangle': {
            title: 'Symmetric Triangle',
            bias: null,
            summary: 'Converging trend lines indicating indecision. Apex is decision point. Breakout direction determines bias.',
        },
        'bull_flag': {
            title: 'Bull Flag',
            bias: 'long',
            summary: 'Strong uptrend (pole) followed by minor consolidation (flag). Continuation pattern. Breakout above flag signals new leg up.',
        },
        'bear_flag': {
            title: 'Bear Flag',
            bias: 'short',
            summary: 'Strong downtrend (pole) followed by minor consolidation (flag). Continuation pattern. Breakdown below flag signals new leg down.',
        },
        'cup_handle': {
            title: 'Cup & Handle',
            bias: 'long',
            summary: 'U-shaped cup (consolidation) with small handle pullback. Bullish continuation. Breakout above neckline confirms resumption of uptrend.',
        },
        'wedge_rising': {
            title: 'Rising Wedge',
            bias: 'short',
            summary: 'Rising support and resistance converging upward. Price squeezed. Often reverses or breaks down (bearish bias despite uptrend look).',
        },
        'wedge_falling': {
            title: 'Falling Wedge',
            bias: 'long',
            summary: 'Falling support and resistance converging downward. Price squeezed. Often reverses or breaks up (bullish bias despite downtrend look).',
        },
        'rectangle': {
            title: 'Rectangle',
            bias: null,
            summary: 'Price oscillating between two parallel lines (support/resistance). Consolidation pattern. Breakout direction determines trend.',
        },
        'liquidity_sweep': {
            title: 'Liquidity Sweep',
            bias: 'long',
            summary: 'Price breaks resistance (trapping stops above), then reverses and rallies. Smart money trap. Watch for confirmation after reversal.',
        },
        'breakout_retest': {
            title: 'Breakout Retest',
            bias: 'long',
            summary: 'Price breaks resistance, pulls back to test it as support, then continues higher. High-probability confirmation setup.',
        },
    };

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        demoMode: false,
        currentSymbol: 'TSLA',
        currentPattern: null,              // PatternEvent or null
        historyByTicker: new Map(),        // symbol → PatternEvent[]
        totalHistory: [],                  // All events (capped at MAX_HISTORY_TOTAL)
        demoIntervalId: null,              // Timer for demo mode
    };

    // ─── Utilities ──────────────────────────────────────────────────────
    function formatRelativeTime(ts) {
        const now = Date.now();
        const diff = now - ts;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (mins < 1) return 'now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    function getTickerHistory(symbol) {
        if (!state.historyByTicker.has(symbol)) {
            return [];
        }
        return state.historyByTicker.get(symbol).slice(-MAX_HISTORY_PER_TICKER).reverse();
    }

    function recordDetection(event) {
        if (!event || !event.pattern || !event.symbol) return;

        // Normalize event
        const normalized = {
            ts: event.ts || Date.now(),
            symbol: String(event.symbol).toUpperCase(),
            pattern: String(event.pattern).toLowerCase(),
            confidence: Math.min(1, Math.max(0, Number(event.confidence) || 0)),
            bias: event.bias || null,
            neckline: event.neckline,
            meta: event.meta,
        };

        // Add to total history (FIFO cap)
        state.totalHistory.push(normalized);
        if (state.totalHistory.length > MAX_HISTORY_TOTAL) {
            state.totalHistory.shift();
        }

        // Add to per-ticker history
        if (!state.historyByTicker.has(normalized.symbol)) {
            state.historyByTicker.set(normalized.symbol, []);
        }
        const tickerHist = state.historyByTicker.get(normalized.symbol);
        tickerHist.push(normalized);
        if (tickerHist.length > MAX_HISTORY_PER_TICKER * 2) {
            tickerHist.shift();
        }

        // If this detection is for the current ticker, update the displayed pattern
        if (normalized.symbol === state.currentSymbol) {
            state.currentPattern = normalized;
        }

        render();
    }

    // ─── Demo Mode ──────────────────────────────────────────────────────
    const DEMO_PATTERNS = [
        'double_bottom',
        'head_shoulders',
        'ascending_triangle',
        'bull_flag',
        'cup_handle',
        'breakout_retest',
        'liquidity_sweep',
    ];

    function generateDemoPattern() {
        const patternKey = DEMO_PATTERNS[Math.floor(Math.random() * DEMO_PATTERNS.length)];
        const symbols = ['TSLA', 'NVDA', 'SPY', 'COIN', 'BTC'];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const confidence = 0.55 + Math.random() * 0.35;

        recordDetection({
            ts: Date.now(),
            symbol: symbol,
            pattern: patternKey,
            confidence: confidence,
            bias: PATTERN_DESCRIPTIONS[patternKey].bias,
        });
    }

    function startDemoMode() {
        if (state.demoIntervalId) return;
        state.demoIntervalId = setInterval(generateDemoPattern, DEMO_INTERVAL_MS);
        generateDemoPattern(); // Immediate first pattern
    }

    function stopDemoMode() {
        if (state.demoIntervalId) {
            clearInterval(state.demoIntervalId);
            state.demoIntervalId = null;
        }
    }

    // ─── Style Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                background: rgba(15, 15, 18, 0.55);
                backdrop-filter: blur(14px) saturate(160%);
                -webkit-backdrop-filter: blur(14px) saturate(160%);
                border: 1px solid rgba(255, 215, 0, 0.18);
                border-radius: 8px;
                padding: 12px;
                min-height: 180px;
                max-width: 280px;
                box-shadow: 0 6px 24px -8px rgba(255, 215, 0, 0.25), 0 1px 0 0 rgba(255, 215, 0, 0.08) inset;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                transition: all 0.3s ease;
                user-select: none;
            }

            .pc-state-scanning { display: none; }
            .pc-state-detected { display: none; }
            #${ROOT_ID}.pc-scanning .pc-state-scanning { display: block; }
            #${ROOT_ID}.pc-detected .pc-state-detected { display: block; }

            .pc-scanning {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-height: 120px;
            }

            .pc-scan-icon {
                font-size: 24px;
                animation: pc-scan-pulse 2s ease-in-out infinite;
            }

            @keyframes pc-scan-pulse {
                0%, 100% { opacity: 0.4; transform: scale(0.95); }
                50% { opacity: 1; transform: scale(1.1); }
            }

            .pc-scan-label {
                font-size: 10px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-secondary);
            }

            .pc-last-detected {
                font-size: 8px;
                color: var(--ml-color);
                margin-top: 4px;
                text-align: center;
            }

            .pc-detected-wrap {
                animation: pc-detected-flip 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }

            @keyframes pc-detected-flip {
                0% { opacity: 0; transform: rotateY(90deg); }
                100% { opacity: 1; transform: rotateY(0deg); }
            }

            .pc-title {
                font-size: 14px;
                font-weight: 700;
                color: var(--ml-color);
                text-transform: uppercase;
                letter-spacing: 0.06em;
                margin-bottom: 8px;
            }

            .pc-art-container {
                width: 100%;
                height: 80px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(0, 204, 255, 0.1);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 8px;
                overflow: hidden;
            }

            .pc-pattern-svg {
                width: 100%;
                height: 100%;
            }

            .pc-description {
                font-size: 9px;
                line-height: 1.4;
                color: var(--text-secondary);
                margin-bottom: 8px;
            }

            .pc-confidence-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 8px;
            }

            .pc-conf-label {
                font-size: 9px;
                color: var(--text-secondary);
                min-width: 50px;
            }

            .pc-conf-bar {
                flex: 1;
                height: 4px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 2px;
                overflow: hidden;
                position: relative;
            }

            .pc-conf-fill {
                height: 100%;
                background: var(--heat-gradient);
                transition: width 0.3s ease;
            }

            .pc-conf-val {
                font-size: 9px;
                font-family: 'Orbitron', sans-serif;
                font-weight: 700;
                color: var(--ml-color);
                min-width: 30px;
                text-align: right;
            }

            .pc-history-header {
                font-size: 8px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-secondary);
                margin-bottom: 4px;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                padding-top: 6px;
            }

            .pc-history-list {
                display: flex;
                flex-direction: column;
                gap: 3px;
            }

            .pc-hist-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 8px;
                padding: 3px 0;
            }

            .pc-hist-left {
                display: flex;
                gap: 6px;
                flex: 1;
            }

            .pc-hist-time {
                color: var(--text-secondary);
                min-width: 45px;
            }

            .pc-hist-pattern {
                color: var(--core-color);
                font-weight: 500;
            }

            .pc-hist-right {
                display: flex;
                gap: 4px;
                align-items: center;
            }

            .pc-hist-outcome {
                font-weight: 700;
                min-width: 20px;
                text-align: center;
            }

            .pc-hist-outcome.win {
                color: var(--profit-color);
            }

            .pc-hist-outcome.loss {
                color: var(--loss-color);
            }

            .pc-hist-outcome.open {
                color: var(--text-secondary);
            }

            /* High-confidence visual emphasis */
            #${ROOT_ID}.pc-high-confidence {
                box-shadow: 0 8px 40px -6px rgba(255, 215, 0, 0.45), 0 1px 0 0 rgba(255, 215, 0, 0.18) inset, 0 0 12px rgba(255, 215, 0, 0.3);
                border-color: rgba(255, 215, 0, 0.35);
            }

            #${ROOT_ID}.pc-high-confidence .pc-title {
                animation: pc-confidence-flash 0.6s ease-out;
            }

            @keyframes pc-confidence-flash {
                0% { color: #ffff00; text-shadow: 0 0 8px rgba(255, 255, 0, 0.8); }
                100% { color: var(--ml-color); text-shadow: none; }
            }
        `;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── DOM Rendering ──────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;
        root.innerHTML = '';
        state.mounted = true;
        return true;
    }

    function renderScanning() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const lastPat = state.totalHistory.length > 0 ? state.totalHistory[state.totalHistory.length - 1] : null;
        const lastAttr = lastPat
            ? `Last: ${PATTERN_DESCRIPTIONS[lastPat.pattern]?.title || lastPat.pattern} @ ${Math.round(lastPat.confidence * 100)}% (${lastPat.symbol}, ${formatRelativeTime(lastPat.ts)})`
            : '--';

        root.innerHTML = `
            <div class="pc-state-scanning">
                <div class="pc-scan-icon">🔍</div>
                <div class="pc-scan-label">Pattern engine scanning...</div>
                <div class="pc-last-detected">${lastAttr}</div>
            </div>
        `;
    }

    function renderDetected() {
        const root = document.getElementById(ROOT_ID);
        if (!root || !state.currentPattern) return;

        const p = state.currentPattern;
        const desc = PATTERN_DESCRIPTIONS[p.pattern] || { title: p.pattern, summary: 'Pattern detected.' };
        const confPct = Math.round(p.confidence * 100);
        const history = getTickerHistory(state.currentSymbol);

        let historyHTML = '';
        if (history.length > 0) {
            historyHTML = `
                <div class="pc-history-header">Recent on ${state.currentSymbol}</div>
                <div class="pc-history-list">
                    ${history.map(h => {
                        const outcome = h.meta?.outcome || 'open'; // 'win', 'loss', or 'open'
                        const pnl = h.meta?.pnl ? (h.meta.pnl >= 0 ? '+' : '') + h.meta.pnl.toFixed(2) : null;
                        return `
                            <div class="pc-hist-item">
                                <div class="pc-hist-left">
                                    <span class="pc-hist-time">${formatRelativeTime(h.ts)}</span>
                                    <span class="pc-hist-pattern">${PATTERN_DESCRIPTIONS[h.pattern]?.title || h.pattern}</span>
                                </div>
                                <div class="pc-hist-right">
                                    <span class="pc-hist-outcome ${outcome}">${outcome === 'open' ? 'OPEN' : outcome === 'win' ? 'W' : 'L'}</span>
                                    ${pnl ? `<span style="color:${h.meta.pnl >= 0 ? 'var(--profit-color)' : 'var(--loss-color)'};font-size:8px;">${pnl}</span>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        const svg = PATTERN_ART[p.pattern] ? PATTERN_ART[p.pattern]() : '';

        root.innerHTML = `
            <div class="pc-detected-wrap">
                <div class="pc-title">${desc.title}</div>
                <div class="pc-art-container">${svg}</div>
                <div class="pc-description">${desc.summary}</div>
                <div class="pc-confidence-row">
                    <span class="pc-conf-label">Confidence</span>
                    <div class="pc-conf-bar">
                        <div class="pc-conf-fill" style="width: ${confPct}%;"></div>
                    </div>
                    <span class="pc-conf-val">${confPct}%</span>
                </div>
                ${historyHTML}
            </div>
        `;
    }

    function render() {
        if (!mount()) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        // Update state classes
        root.classList.remove('pc-scanning', 'pc-detected', 'pc-high-confidence');
        if (state.currentPattern) {
            root.classList.add('pc-detected');
            if (state.currentPattern.confidence > 0.7) {
                root.classList.add('pc-high-confidence');
            }
            renderDetected();
        } else {
            root.classList.add('pc-scanning');
            renderScanning();
        }
    }

    // ─── WS Handler ─────────────────────────────────────────────────────
    function onPatternAnalysis(data) {
        try {
            if (!data) return;
            recordDetection(data);
        } catch (_) { /* swallow */ }
    }

    // ─── Event Bus Handler ──────────────────────────────────────────────
    function onWatchlistSelect(data) {
        try {
            if (!data || !data.symbol) return;
            state.currentSymbol = String(data.symbol).toUpperCase();
            const history = getTickerHistory(state.currentSymbol);
            state.currentPattern = history.length > 0 ? history[0] : null;
            render();
        } catch (_) { /* swallow */ }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const PatternCard = {
        /**
         * Initialize: mount to DOM, inject styles, subscribe to WS events and bus.
         */
        init() {
            try {
                injectStyles();
                if (!mount()) return;
                render();

                // Subscribe to pattern_analysis WS event
                const socket = OGZ.get && OGZ.get('Socket');
                if (socket && socket.registerHandler) {
                    socket.registerHandler('pattern_analysis', onPatternAnalysis);
                }

                // Subscribe to watchlist selection event
                if (OGZ && OGZ.bus) {
                    OGZ.bus.on('watchlist:select', onWatchlistSelect);
                }

                // Start demo mode if enabled
                if (state.demoMode) {
                    startDemoMode();
                }
            } catch (_) { /* swallow */ }
        },

        /**
         * Set the currently displayed ticker symbol.
         * @param {string} symbol
         */
        setSymbol(symbol) {
            try {
                state.currentSymbol = String(symbol).toUpperCase();
                const history = getTickerHistory(state.currentSymbol);
                state.currentPattern = history.length > 0 ? history[0] : null;
                render();
            } catch (_) { /* swallow */ }
        },

        /**
         * Toggle demo mode on/off.
         * @param {boolean} enabled
         */
        setDemoMode(enabled) {
            try {
                state.demoMode = Boolean(enabled);
                if (enabled) {
                    startDemoMode();
                } else {
                    stopDemoMode();
                }
            } catch (_) { /* swallow */ }
        },

        /**
         * Manually record a pattern detection (for testing).
         * @param {PatternEvent} event
         */
        recordPattern(event) {
            try {
                recordDetection(event);
            } catch (_) { /* swallow */ }
        },

        /**
         * Get detection history for a symbol.
         * @param {string} symbol
         * @returns {PatternEvent[]}
         */
        getHistory(symbol) {
            try {
                return getTickerHistory(String(symbol).toUpperCase());
            } catch (_) {
                return [];
            }
        },

        /**
         * Clear history for a symbol.
         * @param {string} symbol
         */
        clearHistory(symbol) {
            try {
                const sym = String(symbol).toUpperCase();
                if (state.historyByTicker.has(sym)) {
                    state.historyByTicker.delete(sym);
                }
                if (state.currentSymbol === sym) {
                    state.currentPattern = null;
                    render();
                }
            } catch (_) { /* swallow */ }
        },

        /**
         * Teardown: remove DOM, listeners, styles.
         */
        teardown() {
            try {
                stopDemoMode();

                const root = document.getElementById(ROOT_ID);
                if (root) {
                    root.innerHTML = '';
                }

                const style = document.getElementById(STYLE_ID);
                if (style) {
                    style.remove();
                }

                if (OGZ && OGZ.bus) {
                    OGZ.bus.off('watchlist:select', onWatchlistSelect);
                }

                state.mounted = false;
                state.currentPattern = null;
                state.historyByTicker.clear();
                state.totalHistory = [];
            } catch (_) { /* swallow */ }
        },

        /**
         * Debug: return internal state snapshot.
         */
        _compute() {
            return {
                mounted: state.mounted,
                demoMode: state.demoMode,
                currentSymbol: state.currentSymbol,
                currentPattern: state.currentPattern,
                totalHistoryCount: state.totalHistory.length,
                tickersWithHistory: state.historyByTicker.size,
            };
        },
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('PatternCard', PatternCard);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('PatternCard', PatternCard);
            }
        });
    }

    try { window.OGZPatternCard = PatternCard; } catch (_) {}
})(window.OGZ = window.OGZ || {});
