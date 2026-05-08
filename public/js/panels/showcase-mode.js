/**
 * showcase-mode.js — OGZPrime Showcase Mode: 90-Second Scripted Demo Sequence
 *
 * Marketing automation module that orchestrates a precisely-timed, curated 90-second
 * demo sequence showcasing the entire dashboard's white-box ML capabilities in a single
 * polished flow. Designed for operators to:
 *   - Record VOD testimonials for ogzprime.com/proof/track-record/
 *   - Capture marketing screenshots with peak visual moments
 *   - Demo the platform to prospective white-glove licensees
 *   - First-time-visitor landing page auto-demo (on operator request, not auto-start)
 *
 * A single button "▶ SHOWCASE" (fixed position, top-right) triggers the sequence.
 * During playback, the button becomes "⏹ SHOWCASE LIVE" with a pulsing red dot for VOD cue.
 *
 * The sequence activates all demo modes, fires pattern detections, triggers money rain,
 * and narrates the bot's reasoning via ChainOfThought — all timed to beat within exactly
 * 90 seconds.
 *
 * Self-registers as OGZ.ShowcaseMode via OGZ.register().
 * Mounts button into <body> (fixed position) or as child of mode-toggle widget if present.
 *
 * Public API:
 *   init() — Mount button, subscribe to nothing (no auto-start)
 *   startDemo() — Begin the 90-second scripted sequence
 *   stopDemo() — Abort current sequence, reset to ready state
 *   isRunning() — Boolean: true while demo is active
 *   setOnComplete(cb) — Register callback for natural end of sequence
 *   teardown() — Full cleanup (DOM, timers, state)
 *
 * Sequence timeline: 14 events across 90 seconds
 *   T+0s:   All demo modes enabled (NewsTicker, PatternCard, OpenPositions, ChainOfThought, EquityCurve)
 *   T+3s:   First narrator line added to ChainOfThought
 *   T+6s:   1.5s pulse on all panels (.is-high-confidence class)
 *   T+10s:  First pattern detection (TSLA double_bottom @ 78%)
 *   T+12s:  Narrator line about TSLA pattern
 *   T+18s:  First money rain (modest, 60 particles, 3.5s)
 *   T+22s:  Second pattern detection (BTC inv_head_shoulders @ 84%)
 *   T+25s:  Narrator line about BTC entry signal
 *   T+30s:  Cell flash + trading-entry flash on chart
 *   T+35s:  Narrator line about trade execution
 *   T+45s:  Big money rain (120 particles, 5s — the marketing moment)
 *   T+48s:  Narrator line about trade win and P&L
 *   T+55s:  2s gold glow pulse on all panels
 *   T+62s:  Third pattern detection (TSLA ascending_triangle @ 71%)
 *   T+70s:  Narrator line cool-down
 *   T+75s:  Narrator line sequence complete
 *   T+82s:  All demo modes disabled
 *   T+88s:  Final narrator line, reset button state
 *   T+90s:  Fire onComplete callback
 *
 * Defensive coding: all module calls wrapped in try/catch with optional chaining (?.)
 * to gracefully degrade if a module isn't loaded. No console.log. Timers tracked
 * for cleanup on abort. Demo modes left in place after sequence (cleanup happens on
 * stopDemo/abort or next startDemo).
 *
 * Anti-patterns avoided:
 *   - Don't auto-start on page load
 *   - Don't persist sequence state in localStorage
 *   - Don't break out of demo modes on every panel (NewsTicker is default demo state)
 *   - Don't apply .visual-mode class (operator handles mode via ModeToggle separately)
 *
 * @module public/js/panels/showcase-mode
 */

(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const MODULE_NAME = 'ShowcaseMode';
    const ROOT_ID = 'showcaseButton';
    const BUTTON_LABEL_READY = '▶ SHOWCASE';
    const BUTTON_LABEL_ACTIVE = '⏹ SHOWCASE LIVE';
    const SHOWCASE_DURATION_MS = 90000;
    const TIMELINE_INTERVAL_MS = 100; // Poll timeline every 100ms for event firing

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        running: false,
        mounted: false,
        rootElement: null,
        onCompleteCallback: null,

        // Timeline tracking
        startTimeMs: 0,
        currentTimeMs: 0,
        timelineIntervalId: null,
        firedEvents: new Set(), // Track which timeline events have fired

        // All timers (for cleanup)
        timers: [],
    };

    // ─── Timeline: Scripted Events ────────────────────────────────────
    /**
     * Each event: { ts: milliseconds, action: (currentTime) => void }
     * Actions are idempotent (can fire multiple times without side effects).
     */
    const TIMELINE = [
        // T+0s: Activate all demo modes
        {
            ts: 0,
            action: () => {
                try { OGZ.NewsTicker?.setDemoMode?.(true); } catch (_) {}
                try { OGZ.PatternCard?.setDemoMode?.(true); } catch (_) {}
                try { OGZ.OpenPositions?.setDemoMode?.(true); } catch (_) {}
                try { OGZ.ChainOfThought?.setDemoMode?.(true); } catch (_) {}
                try { OGZ.EquityCurve?.setDemoMode?.(true); } catch (_) {}
            },
        },

        // T+3s: Showcase started narrator line
        {
            ts: 3000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'SHOWCASE MODE engaged — demo sequence initiated',
                        level: 'info',
                    });
                } catch (_) {}
            },
        },

        // T+6s: Pulse all panels (high-confidence glow for 1.5s)
        {
            ts: 6000,
            action: () => {
                const panelIds = [
                    'newsTicker', 'patternCard', 'openPositions',
                    'chainOfThought', 'equityCurve', 'liveReadouts',
                    'unifiedChart', 'systemHealth', 'strategyLeaderboard',
                ];
                panelIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.classList.add('is-high-confidence');
                    }
                });

                // Auto-remove after 1.5s
                const timer = setTimeout(() => {
                    panelIds.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.classList.remove('is-high-confidence');
                        }
                    });
                }, 1500);
                state.timers.push(timer);
            },
        },

        // T+10s: Pattern detection #1 (TSLA double_bottom @ 78%)
        {
            ts: 10000,
            action: () => {
                try {
                    OGZ.PatternCard?.recordPattern?.({
                        ts: Date.now(),
                        symbol: 'TSLA',
                        pattern: 'double_bottom',
                        confidence: 0.78,
                        bias: 'long',
                    });
                } catch (_) {}
            },
        },

        // T+12s: Narrator line about TSLA pattern
        {
            ts: 12000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'Strategy-A scoring TSLA at 78% conf. Pattern engine: Double Bottom confirmed.',
                        level: 'decision',
                        symbol: 'TSLA',
                        confidence: 0.78,
                    });
                } catch (_) {}
            },
        },

        // T+18s: First money rain (modest)
        {
            ts: 18000,
            action: () => {
                try {
                    OGZ.Celebration?.triggerMoneyRain?.({
                        count: 60,
                        duration: 3500,
                    });
                } catch (_) {}
            },
        },

        // T+22s: Pattern detection #2 (BTC inv_head_shoulders @ 84%)
        {
            ts: 22000,
            action: () => {
                try {
                    OGZ.PatternCard?.recordPattern?.({
                        ts: Date.now(),
                        symbol: 'BTC',
                        pattern: 'inv_head_shoulders',
                        confidence: 0.84,
                        bias: 'long',
                    });
                } catch (_) {}
            },
        },

        // T+25s: Narrator line about BTC entry
        {
            ts: 25000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'Strategy-A + Strategy-B confluence on BTC. Inv H&S pattern, 84% conf. ENTRY confirmed.',
                        level: 'execution',
                        symbol: 'BTC',
                        confidence: 0.84,
                    });
                } catch (_) {}
            },
        },

        // T+30s: Cell flash + trading-entry flash
        {
            ts: 30000,
            action: () => {
                try {
                    OGZ.Celebration?.triggerCellFlash?.('confidenceML', 'green');
                } catch (_) {}

                const chart = document.getElementById('unifiedChart');
                if (chart) {
                    chart.classList.add('is-trading-entry');
                    const timer = setTimeout(() => {
                        chart.classList.remove('is-trading-entry');
                    }, 800);
                    state.timers.push(timer);
                }
            },
        },

        // T+35s: Narrator line about trade execution
        {
            ts: 35000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'Trade executed: LONG BTC @ $81,420. SL $81,150 (0.33%). TP $82,100 (0.83%, 1R).',
                        level: 'execution',
                        symbol: 'BTC',
                    });
                } catch (_) {}
            },
        },

        // T+45s: Big money rain (the marketing moment)
        {
            ts: 45000,
            action: () => {
                try {
                    OGZ.Celebration?.triggerMoneyRain?.({
                        count: 120,
                        duration: 5000,
                    });
                } catch (_) {}
            },
        },

        // T+48s: Narrator line about trade win
        {
            ts: 48000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'Trade closed: WIN +$340 (+2.1%). Session P&L crossed +10%.',
                        level: 'decision',
                        symbol: 'BTC',
                    });
                } catch (_) {}
            },
        },

        // T+55s: All-panel gold glow celebration (2s pulse)
        {
            ts: 55000,
            action: () => {
                const panelIds = [
                    'newsTicker', 'patternCard', 'openPositions',
                    'chainOfThought', 'equityCurve', 'liveReadouts',
                    'unifiedChart', 'systemHealth', 'strategyLeaderboard',
                ];
                panelIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.classList.add('is-high-confidence');
                    }
                });

                const timer = setTimeout(() => {
                    panelIds.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.classList.remove('is-high-confidence');
                        }
                    });
                }, 2000);
                state.timers.push(timer);
            },
        },

        // T+62s: Pattern detection #3 (TSLA ascending_triangle @ 71%)
        {
            ts: 62000,
            action: () => {
                try {
                    OGZ.PatternCard?.recordPattern?.({
                        ts: Date.now(),
                        symbol: 'TSLA',
                        pattern: 'ascending_triangle',
                        confidence: 0.71,
                        bias: 'long',
                    });
                } catch (_) {}
            },
        },

        // T+70s: Cool-down narrator line
        {
            ts: 70000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'Strategy-C firing TSLA. Pattern: ascending_triangle. Confidence climbing.',
                        level: 'decision',
                        symbol: 'TSLA',
                        confidence: 0.71,
                    });
                } catch (_) {}
            },
        },

        // T+75s: Completion narrator line
        {
            ts: 75000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'Demo complete. Bot continues scanning.',
                        level: 'info',
                    });
                } catch (_) {}
            },
        },

        // T+82s: Deactivate demo modes
        {
            ts: 82000,
            action: () => {
                try { OGZ.NewsTicker?.setDemoMode?.(false); } catch (_) {}
                try { OGZ.PatternCard?.setDemoMode?.(false); } catch (_) {}
                try { OGZ.OpenPositions?.setDemoMode?.(false); } catch (_) {}
                try { OGZ.ChainOfThought?.setDemoMode?.(false); } catch (_) {}
                try { OGZ.EquityCurve?.setDemoMode?.(false); } catch (_) {}
            },
        },

        // T+88s: Final narrator line
        {
            ts: 88000,
            action: () => {
                try {
                    OGZ.ChainOfThought?.addLine?.({
                        text: 'SHOWCASE complete. Returning to live mode.',
                        level: 'info',
                    });
                } catch (_) {}
            },
        },
    ];

    // ─── CSS Injection ────────────────────────────────────────────────
    function injectStyles() {
        const STYLE_ID = 'ogz-showcase-mode-styles';
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ROOT_ID} {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 9997;
                width: 140px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 0 12px;
                background: rgba(15, 15, 18, 0.7);
                backdrop-filter: blur(12px) saturate(150%);
                -webkit-backdrop-filter: blur(12px) saturate(150%);
                border: 1px solid rgba(255, 215, 0, 0.25);
                border-radius: 20px;
                font-family: 'Orbitron', monospace;
                font-size: 11px;
                font-weight: 700;
                color: rgba(255, 215, 0, 0.8);
                letter-spacing: 0.04em;
                cursor: pointer;
                user-select: none;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px -3px rgba(255, 215, 0, 0.2),
                            0 1px 0 0 rgba(255, 215, 0, 0.08) inset;
            }

            #${ROOT_ID}:hover {
                background: rgba(15, 15, 18, 0.85);
                border-color: rgba(255, 215, 0, 0.4);
                box-shadow: 0 6px 16px -2px rgba(255, 215, 0, 0.35),
                            0 1px 0 0 rgba(255, 215, 0, 0.12) inset;
                transform: scale(1.03);
            }

            #${ROOT_ID}:active {
                transform: scale(0.98);
            }

            /* Active/running state */
            #${ROOT_ID}.sc-active {
                background: rgba(255, 51, 102, 0.15);
                border-color: rgba(255, 51, 102, 0.35);
                box-shadow: 0 6px 20px -2px rgba(255, 51, 102, 0.4),
                            0 1px 0 0 rgba(255, 51, 102, 0.15) inset;
                animation: sc-button-active-glow 2s ease-in-out infinite;
            }

            /* Recording dot (pulsing) */
            .sc-rec-dot {
                display: none;
                width: 6px;
                height: 6px;
                background: rgba(255, 51, 102, 0.9);
                border-radius: 50%;
                box-shadow: 0 0 6px rgba(255, 51, 102, 0.8);
                animation: sc-rec-pulse 1s ease-in-out infinite;
            }

            #${ROOT_ID}.sc-active .sc-rec-dot {
                display: block;
            }

            @keyframes sc-rec-pulse {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                    box-shadow: 0 0 6px rgba(255, 51, 102, 0.8);
                }
                50% {
                    opacity: 0.6;
                    transform: scale(1.3);
                    box-shadow: 0 0 10px rgba(255, 51, 102, 0.5);
                }
            }

            @keyframes sc-button-active-glow {
                0%, 100% {
                    border-color: rgba(255, 51, 102, 0.35);
                    box-shadow: 0 6px 20px -2px rgba(255, 51, 102, 0.4),
                                0 1px 0 0 rgba(255, 51, 102, 0.15) inset;
                }
                50% {
                    border-color: rgba(255, 51, 102, 0.5);
                    box-shadow: 0 8px 24px -1px rgba(255, 51, 102, 0.5),
                                0 1px 0 0 rgba(255, 51, 102, 0.2) inset;
                }
            }

            /* REC badge (optional top-left cue for VOD) */
            .sc-rec-badge {
                display: none;
                position: fixed;
                top: 20px;
                left: 20px;
                z-index: 9996;
                padding: 6px 10px;
                background: rgba(255, 51, 102, 0.2);
                border: 1px solid rgba(255, 51, 102, 0.4);
                border-radius: 4px;
                font-size: 9px;
                font-weight: 700;
                color: rgba(255, 51, 102, 0.9);
                letter-spacing: 0.06em;
                text-transform: uppercase;
                animation: sc-rec-pulse 1s ease-in-out infinite;
            }

            #${ROOT_ID}.sc-active ~ .sc-rec-badge {
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    // ─── DOM Management ────────────────────────────────────────────────
    function mountButton() {
        if (state.mounted) return;

        const button = document.createElement('button');
        button.id = ROOT_ID;
        button.type = 'button';
        button.innerHTML = `
            <div class="sc-rec-dot"></div>
            <span>${BUTTON_LABEL_READY}</span>
        `;

        // Try to append to mode-toggle widget if it exists
        const modeToggle = document.getElementById('modeToggleWidget');
        if (modeToggle && modeToggle.parentNode) {
            modeToggle.parentNode.insertBefore(button, modeToggle.nextSibling);
        } else {
            // Fall back to body
            document.body.appendChild(button);
        }

        button.addEventListener('click', onButtonClick);
        state.rootElement = button;
        state.mounted = true;
    }

    function updateButtonState() {
        if (!state.rootElement) return;

        const label = state.rootElement.querySelector('span');
        if (state.running) {
            state.rootElement.classList.add('sc-active');
            if (label) label.textContent = BUTTON_LABEL_ACTIVE;
        } else {
            state.rootElement.classList.remove('sc-active');
            if (label) label.textContent = BUTTON_LABEL_READY;
        }
    }

    // ─── Timeline Playback ────────────────────────────────────────────
    function startTimeline() {
        state.startTimeMs = Date.now();
        state.currentTimeMs = 0;
        state.firedEvents.clear();

        state.timelineIntervalId = setInterval(() => {
            if (!state.running) {
                if (state.timelineIntervalId) {
                    clearInterval(state.timelineIntervalId);
                    state.timelineIntervalId = null;
                }
                return;
            }

            state.currentTimeMs = Date.now() - state.startTimeMs;

            // Fire all events that should have fired by now
            TIMELINE.forEach((event, idx) => {
                if (!state.firedEvents.has(idx) && state.currentTimeMs >= event.ts) {
                    try {
                        event.action();
                    } catch (_) {}
                    state.firedEvents.add(idx);
                }
            });

            // Check if sequence is complete
            if (state.currentTimeMs >= SHOWCASE_DURATION_MS) {
                stopDemo(true);
            }
        }, TIMELINE_INTERVAL_MS);
    }

    function stopTimeline() {
        if (state.timelineIntervalId) {
            clearInterval(state.timelineIntervalId);
            state.timelineIntervalId = null;
        }
    }

    // ─── Event Handlers ────────────────────────────────────────────────
    function onButtonClick(e) {
        e.preventDefault();
        e.stopPropagation();

        if (state.running) {
            stopDemo();
        } else {
            startDemo();
        }
    }

    // ─── Public API ────────────────────────────────────────────────────
    const Public = {
        /**
         * Initialize: mount button, inject styles. No auto-start.
         */
        init() {
            try {
                injectStyles();
                mountButton();
                updateButtonState();
            } catch (_) {}
        },

        /**
         * Start the 90-second showcase sequence.
         */
        startDemo() {
            try {
                if (state.running) return;

                state.running = true;
                updateButtonState();

                startTimeline();
            } catch (_) {}
        },

        /**
         * Abort the showcase and reset to ready state.
         */
        stopDemo() {
            try {
                stopDemo(false);
            } catch (_) {}
        },

        /**
         * Check if demo is currently running.
         * @returns {boolean}
         */
        isRunning() {
            return state.running;
        },

        /**
         * Register a callback to fire when sequence completes naturally.
         * @param {Function} cb
         */
        setOnComplete(cb) {
            if (typeof cb === 'function') {
                state.onCompleteCallback = cb;
            }
        },

        /**
         * Full teardown: remove DOM, clear timers, reset state.
         */
        teardown() {
            try {
                stopDemo(false);

                // Clear all timers
                state.timers.forEach(clearTimeout);
                state.timers = [];

                // Remove button DOM
                if (state.rootElement && state.rootElement.parentNode) {
                    state.rootElement.parentNode.removeChild(state.rootElement);
                    state.rootElement = null;
                }

                // Remove styles
                const styleEl = document.getElementById('ogz-showcase-mode-styles');
                if (styleEl && styleEl.parentNode) {
                    styleEl.parentNode.removeChild(styleEl);
                }

                state.mounted = false;
                state.running = false;
                state.onCompleteCallback = null;
            } catch (_) {}
        },
    };

    /**
     * Internal: stop demo (optionally fire callback if natural end).
     */
    function stopDemo(isNaturalEnd) {
        try {
            state.running = false;
            stopTimeline();

            // Clear all active timers
            state.timers.forEach(clearTimeout);
            state.timers = [];

            // Reset state
            state.firedEvents.clear();
            state.startTimeMs = 0;
            state.currentTimeMs = 0;

            updateButtonState();

            // Fire callback if natural end
            if (isNaturalEnd && state.onCompleteCallback) {
                try {
                    state.onCompleteCallback();
                } catch (_) {}
            }
        } catch (_) {}
    }

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register(MODULE_NAME, Public);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register(MODULE_NAME, Public);
            }
        });
    }

    try {
        window.OGZShowcaseMode = Public;
    } catch (_) {}
})(window.OGZ = window.OGZ || {});
