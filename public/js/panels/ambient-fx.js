/**
 * ambient-fx.js — AmbientFX: ambient engagement glow/pulse accent engine
 *
 * Makes the dashboard feel alive by applying SUBTLE, TASTEFUL glow/pulse
 * accents to panels when REAL events fire. It draws the user's eye to where
 * something just happened — ambient and restrained, not a rave.
 *
 * Every glow is a reaction to a real event. NO synthetic data, NO timers
 * that fake activity. If nothing happens, nothing glows. (One exception: an
 * optional, extremely understated slow "breathing" pulse on the TRAI status
 * dot to signal the dashboard is alive — reduced-motion-gated.)
 *
 * All FX = add a CSS class to a target element, then remove it after the
 * animation duration. Re-triggering restarts cleanly via a reflow trick.
 *
 * Subscribes to OGZ.bus (verified against custom-alerts.js / milestone-effects.js):
 *   - 'celebration:win'          → brief GREEN glow pulse on #chartPanel
 *   - 'celebration:loss'         → brief RED glow pulse on #chartPanel
 *   - 'celebration:milestone-hit'→ larger GOLD glow pulse on #chartPanel
 *   - 'celebration:alert'        → brief GOLD edge-glow on #chainOfThought
 *   - 'watchlist:select'         → quick CYAN glow on #chartPanel (asset changed)
 *
 * Subscribes to the socket (verified against core.js registerHandler types):
 *   - 'bot_thinking'  → soft GOLD pulse on #traiBrain
 *   - 'trade'         → brief glow on #openPositions
 *   - 'state_update'  → very subtle brief glow on #dashHeader
 *
 * Self-registers as OGZ.AmbientFX via OGZ.register(). core.js auto-inits it.
 * Self-injects a guarded <style> block with keyframes/classes.
 *
 * Public API:
 *   init()
 *   setEnabled(bool) — mute / unmute all FX
 *   teardown() — remove style tag + clear pending timeouts
 *   _compute() — debug snapshot
 *
 * @module public/js/panels/ambient-fx
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-ambient-fx-styles';

    // FX class names — one per effect flavor. Pulse durations match the CSS
    // keyframes below (~500-700ms). Re-triggering removes then re-adds.
    const FX = {
        win:       { cls: 'ogz-afx-win',       ms: 650 },
        loss:      { cls: 'ogz-afx-loss',      ms: 650 },
        milestone: { cls: 'ogz-afx-milestone', ms: 900 },
        alert:     { cls: 'ogz-afx-alert',     ms: 600 },
        cyan:      { cls: 'ogz-afx-cyan',      ms: 550 },
        gold:      { cls: 'ogz-afx-gold',      ms: 600 },
        trade:     { cls: 'ogz-afx-trade',     ms: 650 },
        header:    { cls: 'ogz-afx-header',    ms: 500 }
    };

    // ─── Module State ───────────────────────────────────────────────────
    const state = {
        enabled: true,
        timers: new Set(),     // pending setTimeout ids (for clean teardown)
        glowsFired: 0
    };

    // ─── CSS Injection ──────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            /* Ambient engagement FX — gold-on-near-black palette.
               Subtle, brief box-shadow / outline pulses. */
            .ogz-afx-win {
                animation: ogzAfxWin 650ms ease-out;
            }
            .ogz-afx-loss {
                animation: ogzAfxLoss 650ms ease-out;
            }
            .ogz-afx-milestone {
                animation: ogzAfxMilestone 900ms ease-out;
            }
            .ogz-afx-alert {
                animation: ogzAfxAlert 600ms ease-out;
            }
            .ogz-afx-cyan {
                animation: ogzAfxCyan 550ms ease-out;
            }
            .ogz-afx-gold {
                animation: ogzAfxGold 600ms ease-out;
            }
            .ogz-afx-trade {
                animation: ogzAfxTrade 650ms ease-out;
            }
            .ogz-afx-header {
                animation: ogzAfxHeader 500ms ease-out;
            }

            @keyframes ogzAfxWin {
                0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.0); }
                35%  { box-shadow: 0 0 22px 3px rgba(34, 197, 94, 0.45); }
                100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.0); }
            }
            @keyframes ogzAfxLoss {
                0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.0); }
                35%  { box-shadow: 0 0 22px 3px rgba(239, 68, 68, 0.42); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.0); }
            }
            @keyframes ogzAfxMilestone {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                30%  { box-shadow: 0 0 34px 6px rgba(255, 215, 0, 0.55); }
                65%  { box-shadow: 0 0 20px 3px rgba(255, 215, 0, 0.30); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxAlert {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                40%  { box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.40),
                                   0 0 16px 1px rgba(255, 215, 0, 0.22); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxCyan {
                0%   { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.0); }
                40%  { box-shadow: 0 0 20px 2px rgba(34, 211, 238, 0.40); }
                100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.0); }
            }
            @keyframes ogzAfxGold {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                45%  { box-shadow: 0 0 16px 2px rgba(255, 215, 0, 0.30); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxTrade {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                40%  { box-shadow: 0 0 18px 2px rgba(255, 215, 0, 0.34); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxHeader {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                50%  { box-shadow: 0 0 12px 0 rgba(255, 215, 0, 0.16); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }

            /* Optional ambient "alive" signal — extremely understated slow
               breathing glow on the TRAI status dot. Reaction-free but tiny. */
            .ogz-afx-breathe {
                animation: ogzAfxBreathe 4200ms ease-in-out infinite;
            }
            @keyframes ogzAfxBreathe {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                50%      { box-shadow: 0 0 6px 1px rgba(255, 215, 0, 0.22); }
            }

            /* Respect motion preferences — disable every animation. */
            @media (prefers-reduced-motion: reduce) {
                .ogz-afx-win, .ogz-afx-loss, .ogz-afx-milestone,
                .ogz-afx-alert, .ogz-afx-cyan, .ogz-afx-gold,
                .ogz-afx-trade, .ogz-afx-header, .ogz-afx-breathe {
                    animation: none !important;
                }
            }
        `;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Core: pulse a target with an FX flavor ─────────────────────────
    // Adds the FX class, schedules removal after the animation duration.
    // Re-triggering restarts cleanly: remove the class + force a reflow
    // before re-adding so the keyframe replays from 0%.
    function pulse(elementId, fxKey) {
        if (!state.enabled) return;
        const fx = FX[fxKey];
        if (!fx) return;
        const el = document.getElementById(elementId);
        if (!el) return;   // target absent — skip gracefully

        // Restart cleanly if a previous pulse is still on this element.
        if (el.classList.contains(fx.cls)) {
            el.classList.remove(fx.cls);
            // Force reflow so the browser registers the removal before re-add.
            void el.offsetWidth;
        }
        el.classList.add(fx.cls);

        const t = setTimeout(() => {
            state.timers.delete(t);
            try { el.classList.remove(fx.cls); } catch (_) { /* swallow */ }
        }, fx.ms + 50);
        state.timers.add(t);

        state.glowsFired++;
    }

    // ─── OGZ.bus Subscribers ────────────────────────────────────────────
    function onWin()        { pulse('chartPanel', 'win'); }
    function onLoss()       { pulse('chartPanel', 'loss'); }
    function onMilestone()  { pulse('chartPanel', 'milestone'); }
    function onAlert()      { pulse('chainOfThought', 'alert'); }
    function onWatchlist()  { pulse('chartPanel', 'cyan'); }

    // ─── Socket Subscribers ─────────────────────────────────────────────
    function onBotThinking() { pulse('traiBrain', 'gold'); }
    function onTrade()       { pulse('openPositions', 'trade'); }
    function onStateUpdate() { pulse('dashHeader', 'header'); }

    // ─── Optional ambient "alive" breathing signal ──────────────────────
    // A single very-subtle slow pulse on the small TRAI status dot. Not a
    // reaction to events — just signals the dashboard is alive. Reduced-
    // motion is handled by the CSS @media gate above.
    function startBreathing() {
        const dot = document.getElementById('traiLight');
        if (dot) dot.classList.add('ogz-afx-breathe');
    }
    function stopBreathing() {
        const dot = document.getElementById('traiLight');
        if (dot) dot.classList.remove('ogz-afx-breathe');
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                injectStyles();

                // Bind OGZ.bus — it may not exist yet (CustomAlerts creates
                // it). Poll until ready, mirroring voice-fx.js's bindBus.
                (function bindBus() {
                    if (!OGZ.bus || typeof OGZ.bus.on !== 'function') {
                        setTimeout(bindBus, 100);
                        return;
                    }
                    OGZ.bus.on('celebration:win',           onWin);
                    OGZ.bus.on('celebration:loss',          onLoss);
                    OGZ.bus.on('celebration:milestone-hit', onMilestone);
                    OGZ.bus.on('celebration:alert',         onAlert);
                    OGZ.bus.on('watchlist:select',          onWatchlist);
                })();

                // Bind socket — poll until ready, mirroring custom-alerts.js.
                (function bindSocket() {
                    const socket = (OGZ && typeof OGZ.get === 'function')
                        ? OGZ.get('Socket') : null;
                    if (!socket || typeof socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    socket.registerHandler('bot_thinking',
                        () => { try { onBotThinking(); } catch (_) {} });
                    socket.registerHandler('trade',
                        () => { try { onTrade(); } catch (_) {} });
                    socket.registerHandler('state_update',
                        () => { try { onStateUpdate(); } catch (_) {} });
                })();

                // Ambient alive-signal — gated by reduced-motion in CSS.
                startBreathing();
            } catch (_) { /* swallow */ }
        },

        setEnabled(v) {
            state.enabled = !!v;
            if (!state.enabled) {
                // Clear any in-flight pulse timers and the breathing signal.
                state.timers.forEach(t => clearTimeout(t));
                state.timers.clear();
                stopBreathing();
            } else {
                startBreathing();
            }
        },

        teardown() {
            try {
                state.timers.forEach(t => clearTimeout(t));
                state.timers.clear();
                stopBreathing();
                if (OGZ && OGZ.bus && typeof OGZ.bus.off === 'function') {
                    OGZ.bus.off('celebration:win',           onWin);
                    OGZ.bus.off('celebration:loss',          onLoss);
                    OGZ.bus.off('celebration:milestone-hit', onMilestone);
                    OGZ.bus.off('celebration:alert',         onAlert);
                    OGZ.bus.off('watchlist:select',          onWatchlist);
                }
                const style = document.getElementById(STYLE_ID);
                if (style) style.remove();
            } catch (_) { /* swallow */ }
        },

        _compute() {
            return {
                enabled: state.enabled,
                glowsFired: state.glowsFired,
                pendingTimers: state.timers.size,
                styleInjected: !!document.getElementById(STYLE_ID)
            };
        }
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('AmbientFX', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('AmbientFX', api);
            }
        });
    }

    try { window.OGZAmbientFX = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
