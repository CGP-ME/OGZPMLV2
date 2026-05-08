/**
 * celebration.js — OGZPrime Celebration & Visual Delight Module
 *
 * Autonomous celebration engine: listens for trade wins, high-confidence setups,
 * and strategic alignments, then triggers visual effects to delight the operator.
 *
 * Core features:
 *   - Money rain on profitable trade closes (>= 10% P&L)
 *   - Session cumulative P&L threshold (first time > 10% profit triggers rain once)
 *   - Cell flash + glow on high-confidence signals (confidence > 0.85)
 *   - Screen-edge pulse on trade entry execution
 *   - Strategy confluence glow when multiple strategies align
 *   - Customizable demo mode for testing (fires money rain every 8s)
 *
 * WebSocket subscriptions:
 *   - trade (event === 'close') with pnlPercent >= 10
 *   - bot_thinking (confidence > 0.85)
 *   - narrator_event (event === 'entry' or 'execution')
 *
 * Cooldowns prevent spam:
 *   - Money rain: max once per 30s
 *   - Cell flash: max twice per 5s
 *   - Confluence pulse: max once per 15s
 *
 * Public API:
 *   init() — boot, subscribe to events, create overlay container
 *   triggerMoneyRain(opts) — manual trigger. opts: { count, duration, char }
 *   triggerCellFlash(elementOrId, color) — flash element (gold/green/red)
 *   triggerStrategyAlignment(strategies) — N strategies aligned → edge pulse
 *   setDemoMode(bool) — auto-fire money rain every 8s for testing
 *   setEnabled(bool) — operator toggle for effect disable
 *   teardown() — clean up all DOM, timers, listeners
 *
 * Self-registers as OGZ.Celebration via OGZ.register().
 * Creates overlay elements on demand, appends to document.body.
 * Self-injects fallback CSS (production styling moves to cyberpunk-polish.css later).
 *
 * @module public/js/panels/celebration
 */

(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const MODULE_NAME = 'Celebration';
    const STYLE_ID = 'ogz-celebration-styles';
    const OVERLAY_ID = 'ogz-celebration-overlay';

    // Cooldown windows (ms)
    const MONEY_RAIN_COOLDOWN_MS = 30000;
    const CELL_FLASH_COOLDOWN_MS = 5000;
    const CONFLUENCE_COOLDOWN_MS = 15000;

    // Timing
    const DEFAULT_RAIN_COUNT = 80;
    const DEFAULT_RAIN_DURATION_MS = 4000;
    const DEFAULT_RAIN_CHARS = ['💰', '💵', '💸', '$'];
    const DEMO_MODE_INTERVAL_MS = 8000;

    // Color palette
    const COLORS = {
        gold: 'rgba(255, 215, 0, 0.8)',
        green: 'rgba(0, 255, 136, 0.8)',
        red: 'rgba(255, 51, 102, 0.8)',
    };

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        enabled: true,
        demoMode: false,
        mounted: false,

        // Cooldown tracking
        lastMoneyRainAt: 0,
        lastCellFlashAt: 0,
        lastConfluenceAt: 0,

        // Session P&L tracking
        sessionPnlThresholdTriggered: false,
        lastSessionStartAt: Date.now(),

        // DOM references
        overlay: null,

        // Active timers/intervals (for cleanup)
        timers: [],
        intervals: [],
        listeners: [],
    };

    // ─── CSS Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Money Rain Container */
            #${OVERLAY_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9999;
            }

            /* Individual particle */
            .cb-money-particle {
                position: fixed;
                font-size: 24px;
                font-weight: bold;
                user-select: none;
                pointer-events: none;
            }

            /* Fall animation: gravity + horizontal drift */
            @keyframes cb-money-fall {
                0% {
                    opacity: 1;
                    transform: translateY(0) translateX(0) rotate(0deg);
                }
                100% {
                    opacity: 0;
                    transform: translateY(100vh) translateX(var(--drift)) rotate(360deg);
                }
            }

            /* Twinkle effect for particles */
            @keyframes cb-twinkle {
                0%, 100% {
                    opacity: 0.8;
                    text-shadow: none;
                }
                50% {
                    opacity: 1;
                    text-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
                }
            }

            .cb-money-particle {
                animation: cb-money-fall var(--duration) linear forwards,
                           cb-twinkle var(--twinkle-duration) ease-in-out infinite;
            }

            /* Edge pulse vignette */
            @keyframes cb-edge-pulse {
                0% {
                    opacity: 0.6;
                    box-shadow: inset 0 0 60px rgba(255, 215, 0, 0.7),
                                inset 0 0 120px rgba(255, 215, 0, 0.4);
                }
                100% {
                    opacity: 0;
                    box-shadow: inset 0 0 0px rgba(255, 215, 0, 0),
                                inset 0 0 0px rgba(255, 215, 0, 0);
                }
            }

            .cb-edge-pulse {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                border: 2px solid rgba(255, 215, 0, 0.4);
                border-radius: 0;
                animation: cb-edge-pulse 0.8s ease-out forwards;
                z-index: 9998;
            }

            /* Cell flash effect (applied inline to element) */
            @keyframes cb-cell-flash {
                0% {
                    box-shadow: 0 0 0 rgba(255, 215, 0, 0.8);
                }
                50% {
                    box-shadow: 0 0 20px var(--flash-color);
                }
                100% {
                    box-shadow: 0 0 0 rgba(255, 215, 0, 0.8);
                }
            }

            .cb-cell-flash {
                animation: cb-cell-flash 0.6s ease-out forwards !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Overlay Container Setup ─────────────────────────────────────
    function ensureOverlay() {
        if (state.overlay) return state.overlay;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        document.body.appendChild(overlay);
        state.overlay = overlay;
        return overlay;
    }

    // ─── Cooldown Check ─────────────────────────────────────────────
    function isInCooldown(lastTs, windowMs) {
        return Date.now() - lastTs < windowMs;
    }

    // ─── Money Rain ─────────────────────────────────────────────────
    /**
     * Spawn falling money particles across the viewport.
     * @param {Object} opts - Options
     * @param {number} [opts.count=80] - Number of particles
     * @param {number} [opts.duration=4000] - Fall duration in ms
     * @param {string[]} [opts.chars] - Characters to use (default: ['💰','💵','💸','$'])
     */
    function triggerMoneyRain(opts) {
        if (!state.enabled) return;

        opts = opts || {};
        const count = opts.count || DEFAULT_RAIN_COUNT;
        const duration = opts.duration || DEFAULT_RAIN_DURATION_MS;
        const chars = opts.chars || DEFAULT_RAIN_CHARS;

        const overlay = ensureOverlay();

        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'cb-money-particle';

            // Random character
            const char = chars[Math.floor(Math.random() * chars.length)];
            particle.textContent = char;

            // Random horizontal position
            const xStart = Math.random() * window.innerWidth;

            // Random horizontal drift (can go left or right)
            const driftAmount = (Math.random() - 0.5) * 200;

            // Random fall duration (2-5s)
            const fallDuration = 2000 + Math.random() * 3000;

            // Random rotation
            const rotation = Math.random() * 360;

            // Random color (gold or green mix)
            const color = Math.random() > 0.5 ? COLORS.gold : COLORS.green;

            // Set CSS variables and position
            particle.style.setProperty('--duration', fallDuration + 'ms');
            particle.style.setProperty('--drift', driftAmount + 'px');
            particle.style.setProperty('--twinkle-duration', (800 + Math.random() * 400) + 'ms');
            particle.style.left = xStart + 'px';
            particle.style.top = '-40px';
            particle.style.color = color;
            particle.style.textShadow = `0 0 4px ${color}`;

            overlay.appendChild(particle);

            // Auto-cleanup after animation ends
            const cleanupTimer = setTimeout(() => {
                particle.remove();
            }, fallDuration);

            state.timers.push(cleanupTimer);
        }
    }

    // ─── Cell Flash ─────────────────────────────────────────────────
    /**
     * Flash an element with a color glow.
     * @param {string|HTMLElement} elementOrId - Element or element ID
     * @param {string} [color='gold'] - Color: 'gold', 'green', or 'red'
     */
    function triggerCellFlash(elementOrId, color) {
        if (!state.enabled) return;

        let el = elementOrId;
        if (typeof elementOrId === 'string') {
            el = document.getElementById(elementOrId);
        }

        if (!el) return;

        color = color || 'gold';
        const colorMap = {
            gold: COLORS.gold,
            green: COLORS.green,
            red: COLORS.red,
        };
        const colorValue = colorMap[color] || colorMap.gold;

        // Remove existing class to reset animation
        el.classList.remove('cb-cell-flash');

        // Trigger reflow to restart animation
        void el.offsetWidth;

        // Add flash class with color
        el.classList.add('cb-cell-flash');
        el.style.setProperty('--flash-color', colorValue);

        // Auto-remove class after animation
        const timer = setTimeout(() => {
            el.classList.remove('cb-cell-flash');
        }, 700);

        state.timers.push(timer);
    }

    // ─── Edge Pulse / Vignette ──────────────────────────────────────
    /**
     * Brief screen-edge gold pulse effect.
     */
    function triggerEdgePulse() {
        if (!state.enabled) return;

        const overlay = ensureOverlay();
        const pulse = document.createElement('div');
        pulse.className = 'cb-edge-pulse';

        overlay.appendChild(pulse);

        // Auto-remove after animation
        const timer = setTimeout(() => {
            pulse.remove();
        }, 900);

        state.timers.push(timer);
    }

    // ─── Event Handlers ─────────────────────────────────────────────

    /**
     * Handle trade event: close with pnlPercent >= 10 triggers money rain.
     */
    function onTradeEvent(data) {
        try {
            if (!state.enabled) return;

            // Trigger on close event with profit >= 10%
            if (data.event === 'close' && data.pnlPercent >= 10) {
                // Check cooldown
                if (!isInCooldown(state.lastMoneyRainAt, MONEY_RAIN_COOLDOWN_MS)) {
                    triggerMoneyRain();
                    state.lastMoneyRainAt = Date.now();
                }
            }
        } catch (err) {
            // Silent swallow
        }
    }

    /**
     * Handle bot_thinking event: confidence > 0.85 triggers cell flash.
     */
    function onBotThinkingEvent(data) {
        try {
            if (!state.enabled) return;

            const confidence = data.confidence || (data.data && data.data.confidence);
            if (confidence != null && confidence > 0.85) {
                // Check cooldown (max twice per 5s)
                if (!isInCooldown(state.lastCellFlashAt, CELL_FLASH_COOLDOWN_MS)) {
                    // Flash the confidence readout
                    const confEl = document.getElementById('confidenceML');
                    if (confEl) {
                        triggerCellFlash(confEl, 'green');
                    }

                    // Also apply .is-high-confidence class for CSS animation
                    const liveReadouts = document.getElementById('liveReadouts');
                    if (liveReadouts) {
                        liveReadouts.classList.add('is-high-confidence');
                        const timer = setTimeout(() => {
                            liveReadouts.classList.remove('is-high-confidence');
                        }, 1500);
                        state.timers.push(timer);
                    }

                    state.lastCellFlashAt = Date.now();
                }
            }
        } catch (err) {
            // Silent swallow
        }
    }

    /**
     * Handle narrator_event: entry/execution triggers trade-entry flash.
     */
    function onNarratorEvent(data) {
        try {
            if (!state.enabled) return;

            if (data.event === 'entry' || data.event === 'execution') {
                // Trigger edge pulse
                triggerEdgePulse();

                // Apply .is-trading-entry class to chart container
                const chart = document.getElementById('unifiedChart');
                if (chart) {
                    chart.classList.add('is-trading-entry');
                    const timer = setTimeout(() => {
                        chart.classList.remove('is-trading-entry');
                    }, 850);
                    state.timers.push(timer);
                }
            }
        } catch (err) {
            // Silent swallow
        }
    }

    // ─── Public API ────────────────────────────────────────────────

    const Public = {
        /**
         * Initialize the celebration module.
         */
        init() {
            if (state.mounted) return;

            injectStyles();
            ensureOverlay();

            // Subscribe to WebSocket events
            const socket = OGZ.get('Socket');
            if (socket) {
                socket.registerHandler('trade', onTradeEvent);
                socket.registerHandler('bot_thinking', onBotThinkingEvent);
                socket.registerHandler('narrator_event', onNarratorEvent);

                state.listeners.push({ type: 'trade', fn: onTradeEvent });
                state.listeners.push({ type: 'bot_thinking', fn: onBotThinkingEvent });
                state.listeners.push({ type: 'narrator_event', fn: onNarratorEvent });
            }

            // Demo mode interval
            if (state.demoMode) {
                const interval = setInterval(() => {
                    Public.triggerMoneyRain({ count: 40, duration: 3000 });
                }, DEMO_MODE_INTERVAL_MS);
                state.intervals.push(interval);
            }

            state.mounted = true;
        },

        /**
         * Trigger money rain manually.
         * @param {Object} [opts] - Options { count, duration, chars }
         */
        triggerMoneyRain(opts) {
            triggerMoneyRain(opts);
        },

        /**
         * Trigger cell flash on an element.
         * @param {string|HTMLElement} elementOrId
         * @param {string} [color='gold']
         */
        triggerCellFlash(elementOrId, color) {
            triggerCellFlash(elementOrId, color);
        },

        /**
         * Trigger strategy alignment celebration.
         * @param {Array} strategies - Array of strategy objects (unused in v1, reserved for future)
         */
        triggerStrategyAlignment(strategies) {
            if (!state.enabled) return;

            // Check confluence cooldown
            if (!isInCooldown(state.lastConfluenceAt, CONFLUENCE_COOLDOWN_MS)) {
                triggerEdgePulse();

                // Apply .is-confluence class to strategy leaderboard
                const leaderboard = document.getElementById('strategyLeaderboard');
                if (leaderboard) {
                    leaderboard.classList.add('is-confluence');
                    const timer = setTimeout(() => {
                        leaderboard.classList.remove('is-confluence');
                    }, 1000);
                    state.timers.push(timer);
                }

                state.lastConfluenceAt = Date.now();
            }
        },

        /**
         * Enable/disable all visual effects.
         * @param {boolean} enabled
         */
        setEnabled(enabled) {
            state.enabled = !!enabled;
        },

        /**
         * Set demo mode: auto-fire money rain every 8s.
         * @param {boolean} demoMode
         */
        setDemoMode(demoMode) {
            state.demoMode = !!demoMode;

            if (state.demoMode && state.mounted) {
                const interval = setInterval(() => {
                    Public.triggerMoneyRain({ count: 40, duration: 3000 });
                }, DEMO_MODE_INTERVAL_MS);
                state.intervals.push(interval);
            } else if (!state.demoMode) {
                // Clear demo intervals
                state.intervals.forEach(clearInterval);
                state.intervals = [];
            }
        },

        /**
         * Clean up all DOM, timers, listeners.
         */
        teardown() {
            // Clear timers
            state.timers.forEach(clearTimeout);
            state.timers = [];

            // Clear intervals
            state.intervals.forEach(clearInterval);
            state.intervals = [];

            // Remove overlay DOM
            if (state.overlay && state.overlay.parentNode) {
                state.overlay.parentNode.removeChild(state.overlay);
                state.overlay = null;
            }

            // Remove styles
            const styleEl = document.getElementById(STYLE_ID);
            if (styleEl && styleEl.parentNode) {
                styleEl.parentNode.removeChild(styleEl);
            }

            state.mounted = false;
            state.listeners = [];
        },

        /**
         * Debug: return current state snapshot.
         */
        _debug() {
            return {
                enabled: state.enabled,
                demoMode: state.demoMode,
                mounted: state.mounted,
                lastMoneyRainAt: state.lastMoneyRainAt,
                lastCellFlashAt: state.lastCellFlashAt,
                lastConfluenceAt: state.lastConfluenceAt,
                activeTimers: state.timers.length,
                activeIntervals: state.intervals.length,
            };
        },
    };

    // Register with OGZ module system
    OGZ.register(MODULE_NAME, Public);

})(window.OGZ || {});
