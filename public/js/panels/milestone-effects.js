/**
 * milestone-effects.js - MilestoneEffects: Houston ladder + visual celebrations
 *
 * Listens to OGZ.bus 'celebration:milestone' (equity heartbeat from
 * CustomAlerts -> from StateManager state_update.state.equity), and fires
 * tiered celebrations as the user crosses thresholds en route to the Houston
 * moving fund.
 *
 * Tiers (firstTrade and firstWin tiers fire on win events, not equity):
 *   firstTrade        - any close (banner only)
 *   firstWin          - first profitable close (banner + confetti)
 *   first100          - equity crosses $100 profit (banner + confetti + flash)
 *   first1000         - equity crosses $1,000 profit (banner + confetti + flash)
 *   houstonQuarter    - equity reaches $2,500 (rocket animation)
 *   houstonHalf       - equity reaches $5,000 (rocket animation + brand flash)
 *   houstonReady      - equity reaches $10,000 (full-screen takeover overlay)
 *
 * Persists fired milestones to localStorage so they don't re-fire on reload.
 * Emits 'celebration:milestone-hit' { tier, label } so VictoryAnimations
 * plays the milestone fanfare on tier crossings.
 *
 * Self-registers as OGZ.MilestoneEffects.
 *
 * Public API:
 *   init() - wire bus listeners, inject styles, load persisted state
 *   check(equity) - manual trigger
 *   resetProgress() - clear all fired tiers (debugging / fresh test)
 *   setTargets(overrides) - adjust threshold values
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/milestone-effects
 */
(function (OGZ) {
    'use strict';

    const STORAGE_KEY = 'ogz.milestones.fired';
    const FEATURE_FLAG_KEY = 'ogz.features.milestoneEffects';
    const STYLE_ID = 'ogz-milestone-effects-styles';

    // Default tiers - keys must be stable (used as localStorage flags).
    // Values are profit deltas over the first verified session equity heartbeat.
    // Seed or hydration equity must not count as earned progress.
    const DEFAULT_TIERS = {
        first100:      { value: 100,   label: '🎯 First $100',           kind: 'profit'   },
        first1000:     { value: 1000,  label: '💰 First $1,000',          kind: 'profit'   },
        houstonQuarter:{ value: 2500,  label: '🚀 25% to Houston',        kind: 'houston'  },
        houstonHalf:   { value: 5000,  label: '🚀 50% to Houston',        kind: 'houston'  },
        houstonReady:  { value: 10000, label: 'HOUSTON FUND COMPLETE',    kind: 'endgame'  }
    };

    // Win-event tiers (triggered by 'celebration:win', not equity)
    const WIN_EVENT_TIERS = {
        firstWin: { label: '💰 First Win!', sub: 'Taste of victory!' }
    };

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        tiers: { ...DEFAULT_TIERS },
        fired: {},                 // { tierKey: true }
        firedWinEvents: {},
        sessionOpenEquity: null,
        peakEquity: null,
        tradeCount: 0,
        enabled: false
    };

    function isOperatorMilestoneEnabled() {
        try {
            const flags = window.OGZ_DASHBOARD_FLAGS || {};
            const profile = localStorage.getItem('ogz.profile');
            const layout = localStorage.getItem('ogz.layout') || localStorage.getItem('ogz.layout.mode');
            return (profile === 'operator' || layout === 'operator') &&
                flags.personalMilestones === true &&
                localStorage.getItem(FEATURE_FLAG_KEY) === 'enabled';
        } catch (_) {
            return false;
        }
    }

    // ─── Persistence ────────────────────────────────────────────────────
    function loadPersisted() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                state.fired = data.fired || {};
                state.firedWinEvents = data.firedWinEvents || {};
            }
        } catch (_) { /* swallow */ }
    }
    function savePersisted() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                fired: state.fired,
                firedWinEvents: state.firedWinEvents
            }));
        } catch (_) { /* swallow */ }
    }

    // ─── CSS Injection ──────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            .ogz-milestone-banner {
                position: fixed;
                top: 30%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.85);
                background: linear-gradient(135deg, rgba(15,15,22,0.96) 0%, rgba(30,15,40,0.96) 100%);
                border: 2px solid rgba(255, 215, 0, 0.6);
                border-radius: 14px;
                padding: 22px 36px;
                color: #ffd700;
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 22px;
                font-weight: 700;
                text-align: center;
                z-index: 9700;
                box-shadow: 0 10px 40px rgba(255, 215, 0, 0.3),
                            0 0 60px rgba(255, 215, 0, 0.2);
                opacity: 0;
                pointer-events: none;
                animation: ogz-mb-pop 2.6s ease-out forwards;
            }
            .ogz-milestone-banner .ogz-mb-sub {
                display: block;
                margin-top: 6px;
                font-size: 12px;
                opacity: 0.75;
                letter-spacing: 1px;
                color: #fff;
            }
            @keyframes ogz-mb-pop {
                0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
                10%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
                20%  { transform: translate(-50%, -50%) scale(1); }
                85%  { opacity: 1; }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
            }

            .ogz-confetti-piece {
                position: fixed;
                width: 8px;
                height: 14px;
                z-index: 9650;
                pointer-events: none;
                opacity: 1;
                will-change: transform, opacity;
            }

            .ogz-screen-flash {
                position: fixed;
                inset: 0;
                background: rgba(34, 197, 94, 0.0);
                z-index: 9600;
                pointer-events: none;
                animation: ogz-flash 0.7s ease-out forwards;
            }
            .ogz-screen-flash.red {
                background: rgba(239, 68, 68, 0.0);
            }
            @keyframes ogz-flash {
                0%   { background-color: rgba(255, 215, 0, 0.0); }
                15%  { background-color: rgba(255, 215, 0, 0.28); }
                100% { background-color: rgba(255, 215, 0, 0.0); }
            }

            .ogz-rocket {
                position: fixed;
                left: 50%;
                bottom: -60px;
                transform: translateX(-50%);
                font-size: 60px;
                z-index: 9620;
                pointer-events: none;
                animation: ogz-rocket-fly 2.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }
            @keyframes ogz-rocket-fly {
                0%   { bottom: -60px; opacity: 1; transform: translateX(-50%) rotate(-6deg); }
                40%  { transform: translateX(-50%) rotate(0deg); }
                100% { bottom: 110%; opacity: 0; transform: translateX(-50%) rotate(6deg); }
            }

            .ogz-houston-ready-overlay {
                position: fixed;
                inset: 0;
                background: radial-gradient(circle at center, rgba(20, 0, 40, 0.96) 0%, rgba(0, 0, 0, 0.99) 70%);
                z-index: 9800;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #ffd700;
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                animation: ogz-overlay-in 0.6s ease-out forwards;
                opacity: 0;
                cursor: pointer;
            }
            @keyframes ogz-overlay-in {
                from { opacity: 0; backdrop-filter: blur(0px); }
                to   { opacity: 1; backdrop-filter: blur(8px); }
            }
            .ogz-houston-ready-overlay .ogz-hr-rocket {
                font-size: 110px;
                animation: ogz-hr-pulse 1.4s infinite ease-in-out;
                margin-bottom: 24px;
            }
            @keyframes ogz-hr-pulse {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 16px rgba(255,215,0,0.6)); }
                50%      { transform: scale(1.12); filter: drop-shadow(0 0 32px rgba(255,215,0,0.95)); }
            }
            .ogz-houston-ready-overlay h1 {
                font-size: 54px;
                margin: 0 0 12px 0;
                letter-spacing: 4px;
                text-shadow: 0 0 30px rgba(255, 215, 0, 0.7);
                animation: ogz-hr-glow 2s infinite ease-in-out alternate;
            }
            @keyframes ogz-hr-glow {
                from { text-shadow: 0 0 14px rgba(255, 215, 0, 0.5); }
                to   { text-shadow: 0 0 38px rgba(255, 215, 0, 0.95), 0 0 60px rgba(255, 100, 200, 0.4); }
            }
            .ogz-houston-ready-overlay p {
                font-size: 20px;
                color: #fff;
                margin: 0 0 36px 0;
                max-width: 560px;
                text-align: center;
                line-height: 1.5;
                opacity: 0.9;
            }
            .ogz-houston-ready-overlay .ogz-hr-stars {
                font-size: 30px;
                letter-spacing: 12px;
                opacity: 0.8;
                margin-bottom: 24px;
            }
            .ogz-houston-ready-overlay .ogz-hr-dismiss {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.55);
                letter-spacing: 2px;
                text-transform: uppercase;
                margin-top: 14px;
            }

            @media (prefers-reduced-motion: reduce) {
                .ogz-milestone-banner,
                .ogz-rocket,
                .ogz-screen-flash,
                .ogz-houston-ready-overlay .ogz-hr-rocket,
                .ogz-houston-ready-overlay h1 { animation: none !important; }
                .ogz-milestone-banner { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── Visual Helpers ─────────────────────────────────────────────────
    function showBanner(label, sub) {
        if (!state.enabled) return;
        const el = document.createElement('div');
        el.className = 'ogz-milestone-banner';
        const text = document.createElement('div');
        text.textContent = label;
        el.appendChild(text);
        if (sub) {
            const subEl = document.createElement('span');
            subEl.className = 'ogz-mb-sub';
            subEl.textContent = sub;
            el.appendChild(subEl);
        }
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 2700);
    }

    function confetti(count) {
        if (!state.enabled) return;
        // Deterministic spread (index-based, no Math.random for fairness)
        const n = Math.max(10, Math.min(120, count | 0));
        const colors = ['#ffd700', '#ff6b6b', '#22c55e', '#60a5fa', '#a78bfa', '#f472b6'];
        for (let i = 0; i < n; i++) {
            const piece = document.createElement('div');
            piece.className = 'ogz-confetti-piece';
            const startX = (i / n) * window.innerWidth;
            const drift = ((i * 37) % 200) - 100;      // pseudo-random drift, no Math.random
            const duration = 1800 + ((i * 53) % 1400);
            const delay = (i * 13) % 200;
            piece.style.left = startX + 'px';
            piece.style.top = '-20px';
            piece.style.backgroundColor = colors[i % colors.length];
            piece.style.transform = 'rotate(' + ((i * 47) % 360) + 'deg)';
            piece.style.transition = `transform ${duration}ms cubic-bezier(0.2,0.7,0.5,1) ${delay}ms,
                                      opacity ${duration}ms ease-out ${delay}ms`;
            document.body.appendChild(piece);
            // Trigger animation next frame
            requestAnimationFrame(() => {
                piece.style.transform =
                    `translate(${drift}px, ${window.innerHeight + 80}px) rotate(${(i * 47 + 720) % 720}deg)`;
                piece.style.opacity = '0';
            });
            setTimeout(() => { try { piece.remove(); } catch (_) {} }, duration + delay + 200);
        }
    }

    function screenFlash() {
        if (!state.enabled) return;
        const el = document.createElement('div');
        el.className = 'ogz-screen-flash';
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 750);
    }

    function rocketAnimation() {
        if (!state.enabled) return;
        const el = document.createElement('div');
        el.className = 'ogz-rocket';
        el.textContent = '🚀';
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 2500);
    }

    function houstonReadyTakeover() {
        if (!state.enabled) return;
        const overlay = document.createElement('div');
        overlay.className = 'ogz-houston-ready-overlay';
        overlay.innerHTML = `
            <div class="ogz-hr-rocket">🚀</div>
            <h1>HOUSTON FUND COMPLETE</h1>
            <p>You did it. Time to reunite with your daughter.</p>
            <div class="ogz-hr-stars">✨  ✨  ✨</div>
            <div class="ogz-hr-dismiss">Click anywhere to dismiss</div>
        `;
        const dismiss = () => { try { overlay.remove(); } catch (_) {} };
        overlay.addEventListener('click', dismiss);
        // Don't auto-dismiss — this is THE moment, let the user own it
        document.body.appendChild(overlay);
    }

    // ─── Tier Crossing Logic ────────────────────────────────────────────
    function fireTier(key, tier) {
        if (!state.enabled) return;
        if (state.fired[key]) return;          // already fired
        state.fired[key] = true;
        savePersisted();

        if (tier.kind === 'endgame') {
            houstonReadyTakeover();
        } else if (tier.kind === 'houston') {
            showBanner(tier.label, 'Getting closer to your daughter');
            rocketAnimation();
            screenFlash();
            confetti(60);
        } else if (tier.kind === 'profit') {
            showBanner(tier.label, 'Profits are stacking up');
            screenFlash();
            confetti(40);
        } else {
            showBanner(tier.label);
            confetti(20);
        }

        // Tell VictoryAnimations to play the milestone fanfare
        if (OGZ.bus) {
            OGZ.bus.emit('celebration:milestone-hit', { tier: key, label: tier.label });
        }
    }

    function check(equity) {
        if (!state.enabled) return;
        const b = Number(equity);
        if (!Number.isFinite(b) || b <= 0) return;
        if (state.sessionOpenEquity === null) {
            state.sessionOpenEquity = b;
            savePersisted();
            return;
        }
        if (state.peakEquity === null || b > state.peakEquity) {
            state.peakEquity = b;
            savePersisted();
        }
        if (state.tradeCount <= 0) return;
        const earned = b - state.sessionOpenEquity;
        if (!Number.isFinite(earned) || earned <= 0) return;
        // Fire any unfired tier whose threshold the equity has crossed.
        // Iterate in ascending threshold order so banners come in sequence
        // if multiple cross in one update.
        const sorted = Object.entries(state.tiers).sort((a, b2) => a[1].value - b2[1].value);
        for (const [key, tier] of sorted) {
            if (earned >= tier.value && !state.fired[key]) {
                fireTier(key, tier);
            }
        }
    }

    function onMilestoneEquity(payload) {
        if (!state.enabled) return;
        if (!payload || typeof payload.equity !== 'number') return;
        check(payload.equity);
    }

    // Win-event tiers (firstWin)
    function onWin(payload) {
        if (!state.enabled) return;
        if (!payload) return;
        state.tradeCount++;
        if (!state.firedWinEvents.firstWin) {
            state.firedWinEvents.firstWin = true;
            savePersisted();
            showBanner(WIN_EVENT_TIERS.firstWin.label, WIN_EVENT_TIERS.firstWin.sub);
            confetti(30);
        } else {
            savePersisted();
        }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                state.enabled = isOperatorMilestoneEnabled();
                if (!state.enabled) return;
                injectStyles();
                loadPersisted();
                (function bindBus() {
                    if (!OGZ.bus) { setTimeout(bindBus, 100); return; }
                    OGZ.bus.on('celebration:milestone', onMilestoneEquity);
                    OGZ.bus.on('celebration:win', onWin);
                })();
            } catch (_) { /* swallow */ }
        },
        check,
        isEnabled: isOperatorMilestoneEnabled,
        resetProgress() {
            state.fired = {};
            state.firedWinEvents = {};
            state.sessionOpenEquity = null;
            state.peakEquity = null;
            state.tradeCount = 0;
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        },
        setTargets(overrides) {
            if (!overrides || typeof overrides !== 'object') return;
            for (const k in overrides) {
                if (state.tiers[k]) {
                    state.tiers[k].value = Number(overrides[k]) || state.tiers[k].value;
                }
            }
        },
        teardown() {
            const s = document.getElementById(STYLE_ID);
            if (s) s.remove();
        },
        _compute() {
            return {
                tiers: state.tiers,
                fired: { ...state.fired },
                firedWinEvents: { ...state.firedWinEvents },
                sessionOpenEquity: state.sessionOpenEquity,
                peakEquity: state.peakEquity,
                tradeCount: state.tradeCount,
                enabled: state.enabled
            };
        }
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('MilestoneEffects', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('MilestoneEffects', api);
            }
        });
    }
    try { window.OGZMilestoneEffects = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
