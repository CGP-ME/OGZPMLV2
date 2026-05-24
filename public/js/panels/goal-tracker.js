/**
 * goal-tracker.js — GoalTracker: Houston progress bar + session goal display
 *
 * Renders a slim always-visible band at the top-left of the viewport showing:
 *   - Account balance vs Houston Fund target ($10,000)
 *   - Houston progress bar with % readout
 *   - Session P&L vs daily target ($250 default)
 *   - Trade count + win rate for the session
 *
 * Subscribes to OGZ.bus 'celebration:milestone' (balance heartbeat) and the
 * raw socket 'trade' + 'state_update' events for session stats.
 *
 * Persistence: long-term saved fund + total earned + start date to
 * localStorage. Auto-saves 50% of every profitable close to the long-term
 * fund (the original Mover behavior).
 *
 * NO synthetic data. NO Math.random. If state_update hasn't fired yet,
 * shows '--' placeholders. The bar fills only on real bot data.
 *
 * Self-mounts into <div id="goalTracker"></div> if it exists; otherwise
 * creates its own floating container at top-left.
 *
 * Public API:
 *   init()
 *   setTargets({ houston, monthly, daily })
 *   resetSession()
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/goal-tracker
 */
(function (OGZ) {
    'use strict';

    const STORAGE_KEY = 'ogz.goalTracker.state';
    const STYLE_ID = 'ogz-goal-tracker-styles';
    const ROOT_ID_TARGET = 'goalTracker';      // preferred mount if exists
    const FLOATING_ROOT_ID = 'ogzGoalTrackerFloating';

    // Profile gate: 'operator' shows the personal Houston-fund framing;
    // anything else (default) shows a generic profit-goal label so nothing
    // private renders on a shipped dashboard. Operator opts in per-browser:
    //   localStorage.setItem('ogz.profile','operator')
    const IS_OPERATOR = (function () {
        try { return localStorage.getItem('ogz.profile') === 'operator'; }
        catch (_) { return false; }
    })();

    // Defaults aligned with original mover/goalTracker.js
    const DEFAULTS = {
        houstonTarget: 10000,
        monthlyTarget: 5000,
        dailyPnlTarget: 250,
        savePctOfProfits: 0.5
    };

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        mounted: false,
        targets: { ...DEFAULTS },
        session: { pnl: 0, trades: 0, wins: 0 },
        longTerm: { currentSaved: 0, totalEarned: 0, startDate: null },
        balance: 0,
        domRefs: {}
    };

    // ─── Persistence ────────────────────────────────────────────────────
    function loadPersisted() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                state.longTerm.startDate = new Date().toISOString();
                savePersisted();
                return;
            }
            const data = JSON.parse(raw);
            if (data.targets) state.targets = { ...state.targets, ...data.targets };
            if (data.longTerm) state.longTerm = { ...state.longTerm, ...data.longTerm };
            if (!state.longTerm.startDate) state.longTerm.startDate = new Date().toISOString();
        } catch (_) { /* swallow */ }
    }
    function savePersisted() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                targets: state.targets,
                longTerm: state.longTerm
            }));
        } catch (_) { /* swallow */ }
    }

    // ─── CSS ────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            .ogz-goal-tracker {
                font-family: 'JetBrains Mono', monospace;
                background: rgba(15, 15, 22, 0.85);
                border: 1px solid rgba(255, 215, 0, 0.18);
                border-radius: 8px;
                padding: 8px 14px;
                color: #d1d5db;
                font-size: 11px;
                line-height: 1.3;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(8px) saturate(160%);
                display: flex;
                gap: 18px;
                align-items: center;
                flex-wrap: wrap;
            }
            .ogz-goal-tracker.floating {
                position: fixed;
                top: 76px;
                left: 16px;
                z-index: 9400;
                max-width: 480px;
            }
            .ogz-gt-block { display: flex; flex-direction: column; min-width: 90px; }
            .ogz-gt-key {
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 1.2px;
                color: rgba(255, 215, 0, 0.7);
                margin-bottom: 2px;
            }
            .ogz-gt-val {
                font-size: 13px;
                font-weight: 700;
                color: #fff;
                font-feature-settings: "tnum";
            }
            .ogz-gt-val.pos { color: #22c55e; }
            .ogz-gt-val.neg { color: #ef4444; }
            .ogz-gt-val.warn { color: #fbbf24; }

            .ogz-gt-houston {
                flex: 1;
                min-width: 200px;
                display: flex;
                flex-direction: column;
            }
            .ogz-gt-houston-row {
                display: flex;
                justify-content: space-between;
                font-size: 10px;
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 4px;
            }
            .ogz-gt-bar {
                position: relative;
                height: 8px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                overflow: hidden;
            }
            .ogz-gt-bar-fill {
                position: absolute;
                left: 0; top: 0; bottom: 0;
                background: linear-gradient(90deg, #f59e0b 0%, #ffd700 60%, #fef08a 100%);
                box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
                width: 0%;
                transition: width 600ms ease-out;
                border-radius: 4px;
            }
            .ogz-gt-houston-pct {
                font-weight: 700;
                color: #ffd700;
            }

            @media (prefers-reduced-motion: reduce) {
                .ogz-gt-bar-fill { transition: none; }
            }
            @media (max-width: 768px) {
                .ogz-goal-tracker.floating { left: 8px; right: 8px; max-width: none; }
            }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── Render ─────────────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        let container = document.getElementById(ROOT_ID_TARGET);
        let floating = false;
        if (!container) {
            // The floating top-left fallback was built for the pre-v2 layout.
            // In the v2 shell it renders ON TOP of the watchlist strip and has
            // to be clicked away before the dashboard is even usable -- a live
            // bug on the shipped site. The v2 shell has no docked #goalTracker
            // mount point, so GoalTracker now does NOT render at all rather
            // than floating over other panels. To bring it back, add
            // <div id="goalTracker"></div> to the dashboard at a deliberate,
            // docked location and it will mount there instead.
            return false;
        }
        container.innerHTML = `
            <div class="ogz-goal-tracker ${floating ? 'floating' : ''}">
                <div class="ogz-gt-block">
                    <div class="ogz-gt-key">Balance</div>
                    <div class="ogz-gt-val" data-k="balance">$--</div>
                </div>
                <div class="ogz-gt-block">
                    <div class="ogz-gt-key">Session P&L</div>
                    <div class="ogz-gt-val" data-k="sessionPnl">$--</div>
                </div>
                <div class="ogz-gt-block">
                    <div class="ogz-gt-key">Trades · Win</div>
                    <div class="ogz-gt-val" data-k="tradeMeta">--</div>
                </div>
                <div class="ogz-gt-houston">
                    <div class="ogz-gt-houston-row">
                        <span>${IS_OPERATOR ? 'Houston Fund' : 'Profit Goal'}</span>
                        <span class="ogz-gt-houston-pct" data-k="houstonPct">0%</span>
                    </div>
                    <div class="ogz-gt-bar">
                        <div class="ogz-gt-bar-fill" data-k="houstonBar"></div>
                    </div>
                </div>
            </div>
        `;

        state.domRefs.balance      = container.querySelector('[data-k="balance"]');
        state.domRefs.sessionPnl   = container.querySelector('[data-k="sessionPnl"]');
        state.domRefs.tradeMeta    = container.querySelector('[data-k="tradeMeta"]');
        state.domRefs.houstonPct   = container.querySelector('[data-k="houstonPct"]');
        state.domRefs.houstonBar   = container.querySelector('[data-k="houstonBar"]');
        state.mounted = true;
        return true;
    }

    function updateDisplay() {
        if (!state.mounted) return;

        // Balance
        if (state.domRefs.balance) {
            if (state.balance > 0) {
                state.domRefs.balance.textContent = '$' + state.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                state.domRefs.balance.textContent = '$--';
            }
        }

        // Session P&L
        if (state.domRefs.sessionPnl) {
            const p = state.session.pnl;
            const sign = p >= 0 ? '+' : '';
            state.domRefs.sessionPnl.textContent = `${sign}$${p.toFixed(2)}`;
            state.domRefs.sessionPnl.classList.toggle('pos', p > 0);
            state.domRefs.sessionPnl.classList.toggle('neg', p < 0);
        }

        // Trades · Win
        if (state.domRefs.tradeMeta) {
            const t = state.session.trades;
            if (t === 0) {
                state.domRefs.tradeMeta.textContent = '0 · --';
            } else {
                const wp = (state.session.wins / t) * 100;
                state.domRefs.tradeMeta.textContent = `${t} · ${wp.toFixed(0)}%`;
                state.domRefs.tradeMeta.classList.toggle('pos', wp >= 60);
                state.domRefs.tradeMeta.classList.toggle('warn', wp >= 40 && wp < 60);
                state.domRefs.tradeMeta.classList.toggle('neg', wp < 40 && t >= 3);
            }
        }

        // Houston bar
        if (state.domRefs.houstonBar && state.domRefs.houstonPct) {
            const target = state.targets.houstonTarget || DEFAULTS.houstonTarget;
            const tracked = state.longTerm.currentSaved || state.balance || 0;
            const pct = Math.max(0, Math.min(100, (tracked / target) * 100));
            state.domRefs.houstonBar.style.width = pct.toFixed(2) + '%';
            state.domRefs.houstonPct.textContent = pct.toFixed(1) + '%';
        }
    }

    // ─── Event Handlers ─────────────────────────────────────────────────
    function onTrade(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data || !data.action) return;
            const action = String(data.action).toUpperCase();
            if (action === 'SELL' || action === 'COVER') {
                const pnl = Number(data.pnl) || 0;
                state.session.pnl += pnl;
                state.session.trades++;
                if (pnl > 0) {
                    state.session.wins++;
                    state.longTerm.totalEarned += pnl;
                    state.longTerm.currentSaved += pnl * (state.targets.savePctOfProfits || DEFAULTS.savePctOfProfits);
                    savePersisted();
                }
                updateDisplay();
            }
        } catch (_) { /* swallow */ }
    }

    function onStateUpdate(d) {
        try {
            const s = (d && d.state) ? d.state : null;
            if (!s) return;
            const b = Number(s.balance) || 0;
            if (b > 0) state.balance = b;
            updateDisplay();
        } catch (_) { /* swallow */ }
    }

    function onMilestoneBalance(payload) {
        if (!payload || typeof payload.balance !== 'number') return;
        state.balance = payload.balance;
        updateDisplay();
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                loadPersisted();
                injectStyles();
                if (!mount()) return;
                updateDisplay();

                (function bindSocket() {
                    const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                    if (!socket || typeof socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    socket.registerHandler('trade',        (e) => { try { onTrade(e); } catch (_) {} });
                    socket.registerHandler('state_update', (e) => { try { onStateUpdate(e); } catch (_) {} });
                })();

                (function bindBus() {
                    if (!OGZ.bus) { setTimeout(bindBus, 100); return; }
                    OGZ.bus.on('celebration:milestone', onMilestoneBalance);
                })();
            } catch (_) { /* swallow */ }
        },
        setTargets(t) {
            if (!t || typeof t !== 'object') return;
            if (t.houston) state.targets.houstonTarget = Number(t.houston);
            if (t.monthly) state.targets.monthlyTarget = Number(t.monthly);
            if (t.daily)   state.targets.dailyPnlTarget = Number(t.daily);
            savePersisted();
            updateDisplay();
        },
        resetSession() {
            state.session = { pnl: 0, trades: 0, wins: 0 };
            updateDisplay();
        },
        teardown() {
            const s = document.getElementById(STYLE_ID);
            if (s) s.remove();
            const f = document.getElementById(FLOATING_ROOT_ID);
            if (f) f.remove();
            state.mounted = false;
        },
        _compute() {
            return {
                mounted: state.mounted,
                targets: { ...state.targets },
                session: { ...state.session },
                longTerm: { ...state.longTerm },
                balance: state.balance
            };
        }
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('GoalTracker', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('GoalTracker', api);
            }
        });
    }
    try { window.OGZGoalTracker = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
