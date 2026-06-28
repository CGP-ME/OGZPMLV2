/**
 * risk-gauge.js - Daily Risk Budget Gauge (Phase E)
 *
 * Compact radial SVG ring showing what percentage of the daily loss-limit
 * budget has been consumed.
 *
 *   < 50% used  -> state-ok     (green)
 *   50-80%      -> state-watch  (amber)
 *   >= 80%      -> state-danger (red, pulsing)
 *
 * Session start equity, peak, date, and loss-limit % persist in
 * localStorage. Session resets at the next UTC midnight boundary.
 *
 * Data sources (priority):
 *   1. price.data.equity      - authoritative account value (CandleProcessor per-tick)
 *   2. balance_update.equity - explicit equity heartbeat
 *   3. state_update.state.equity - equity fallback
 *   trade.pnl is not used to derive equity; the gauge waits for authoritative
 *   account equity instead of reconstructing it from events.
 *
 * Self-injects its own scoped CSS; self-registers as OGZ.RiskGauge.
 * Also exposes window.OGZRiskGauge for debug console access.
 *
 * Mount priority: #botStatusRow -> .bot-status-row -> .header
 *
 * @module public/js/panels/risk-gauge
 */
(function (OGZ) {
    'use strict';

    const STYLE_ID = 'ogz-risk-gauge-styles';
    const ROOT_ID = 'riskGauge';

    // ─── Storage keys ──────────────────────────────────────────────────
    const LS_KEY_START = 'ogz.risk.sessionStartEquity';
    const LS_KEY_DATE = 'ogz.risk.sessionDate';
    const LS_KEY_PEAK = 'ogz.risk.sessionPeakEquity';
    const LS_KEY_LIMIT = 'ogz.riskLimit.pct';

    // Ring geometry (compact, 56×56)
    const SVG_SIZE = 56;
    const RING_RADIUS = 23;
    const RING_CIRC = 2 * Math.PI * RING_RADIUS;

    // ─── State ─────────────────────────────────────────────────────────
    const state = {
        mounted: false,
        currentEquity: null,
        sessionStart: null,          // equity at session open
        sessionPeak: null,           // highest equity seen this session
        sessionDate: null,           // UTC yyyy-mm-dd
        lossLimitPct: 0.05,          // 5% default
    };

    // ─── localStorage helpers ──────────────────────────────────────────
    function lsGet(k) {
        try { return localStorage.getItem(k); } catch (_) { return null; }
    }
    function lsSet(k, v) {
        try { localStorage.setItem(k, String(v)); } catch (_) { /* quota / disabled */ }
    }

    // ─── Session handling ──────────────────────────────────────────────
    // ET-aligned session day — trading happens on NYSE hours, so session
    // rollover MUST NOT fire at UTC midnight (which is 8 PM ET during EDT /
    // 7 PM ET during EST, right in the middle of after-hours trading).
    // A trade at 23:30 ET (03:30 UTC next day) would otherwise zero the
    // session mid-position. Intl.DateTimeFormat handles the EDT/EST
    // transition automatically via the America/New_York tz.
    const _etDateFormatter = (typeof Intl !== 'undefined' && Intl.DateTimeFormat)
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/New_York',
            year: 'numeric', month: '2-digit', day: '2-digit',
        })
        : null;
    function todayET() {
        if (_etDateFormatter) return _etDateFormatter.format(new Date());
        // Fallback for environments without Intl (very old browsers / Node
        // without ICU): approximate ET as UTC-5. Slightly off during EDT
        // but still beats UTC midnight rollover.
        const d = new Date(Date.now() - 5 * 3600 * 1000);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }

    function loadSession() {
        const savedDate = lsGet(LS_KEY_DATE);
        const today = todayET();
        if (savedDate !== today) {
            // Rollover — wipe session.
            state.sessionStart = null;
            state.sessionPeak = null;
            state.sessionDate = today;
            lsSet(LS_KEY_DATE, today);
            return;
        }
        const start = parseFloat(lsGet(LS_KEY_START));
        const peak = parseFloat(lsGet(LS_KEY_PEAK));
        if (isFinite(start)) state.sessionStart = start;
        if (isFinite(peak)) state.sessionPeak = peak;
        state.sessionDate = savedDate;
    }

    function initSessionStart(equity) {
        if (state.sessionStart != null) return;
        if (!isFinite(equity) || equity <= 0) return;
        state.sessionStart = equity;
        state.sessionPeak = equity;
        lsSet(LS_KEY_START, equity);
        lsSet(LS_KEY_PEAK, equity);
    }

    function loadLimit() {
        const raw = parseFloat(lsGet(LS_KEY_LIMIT));
        if (isFinite(raw) && raw > 0 && raw < 1) state.lossLimitPct = raw;
    }

    // ─── Compute metrics ───────────────────────────────────────────────
    function compute() {
        const equity = state.currentEquity;
        const start = state.sessionStart;
        if (!isFinite(equity) || !isFinite(start) || start <= 0) {
            return {
                ready: false,
                pnl: 0,
                pnlPct: 0,
                usedPct: 0,
                lossLimit: 0,
                drawdownFromPeak: 0,
                peak: null,
                start: start,
                equity,
            };
        }
        const pnl = equity - start;
        const pnlPct = (pnl / start) * 100;
        const lossLimit = start * state.lossLimitPct;   // dollar loss budget
        // Used % = how deep in the red we are relative to the budget.
        // Only losses consume budget; gains leave it at 0.
        let usedPct = 0;
        if (pnl < 0 && lossLimit > 0) {
            usedPct = Math.min(100, (Math.abs(pnl) / lossLimit) * 100);
        }
        const peak = state.sessionPeak != null ? state.sessionPeak : start;
        const drawdownFromPeak = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        return {
            ready: true,
            pnl,
            pnlPct,
            usedPct,
            lossLimit,
            drawdownFromPeak: Math.max(0, drawdownFromPeak),
            peak,
            start,
            equity,
        };
    }

    // ─── Style injection ───────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                position: relative;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                padding: 4px 6px;
                min-width: 64px;
                user-select: none;
                cursor: default;
            }
            #${ROOT_ID} .rg-ring-wrap {
                position: relative;
                width: ${SVG_SIZE}px;
                height: ${SVG_SIZE}px;
            }
            #${ROOT_ID} .rg-ring-track {
                stroke: rgba(255,255,255,0.06);
                fill: none;
                stroke-width: 4;
            }
            #${ROOT_ID} .rg-ring-fill {
                fill: none;
                stroke-width: 4;
                stroke-linecap: round;
                transform: rotate(-90deg);
                transform-origin: 50% 50%;
                transition: stroke-dashoffset 0.4s cubic-bezier(0.22,0.61,0.36,1),
                            stroke 0.3s ease;
                stroke-dasharray: ${RING_CIRC.toFixed(3)};
                stroke-dashoffset: ${RING_CIRC.toFixed(3)};
            }
            #${ROOT_ID}.state-ok .rg-ring-fill { stroke: #22c55e; }
            #${ROOT_ID}.state-watch .rg-ring-fill { stroke: #fbbf24; }
            #${ROOT_ID}.state-danger .rg-ring-fill {
                stroke: #ef4444;
                animation: rg-pulse 1.3s ease-in-out infinite;
            }
            @keyframes rg-pulse {
                0%, 100% { opacity: 1; filter: drop-shadow(0 0 2px rgba(239,68,68,0.6)); }
                50%      { opacity: 0.55; filter: drop-shadow(0 0 8px rgba(239,68,68,0.9)); }
            }
            #${ROOT_ID} .rg-pct {
                position: absolute;
                inset: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                pointer-events: none;
            }
            #${ROOT_ID} .rg-pct-num {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.02em;
                color: #f5f5f5;
                line-height: 1;
            }
            #${ROOT_ID} .rg-pct-sub {
                font-family: 'JetBrains Mono', monospace;
                font-size: 7px;
                letter-spacing: 0.14em;
                color: #a1a1aa;
                text-transform: uppercase;
                margin-top: 1px;
            }
            #${ROOT_ID} .rg-label {
                font-family: 'JetBrains Mono', monospace;
                font-size: 8px;
                letter-spacing: 0.16em;
                color: #71717a;
                text-transform: uppercase;
            }
            #${ROOT_ID} .rg-tooltip {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%) translateY(6px);
                min-width: 200px;
                padding: 8px 10px;
                background: rgba(15,15,15,0.92);
                backdrop-filter: blur(12px) saturate(140%);
                -webkit-backdrop-filter: blur(12px) saturate(140%);
                border: 1px solid rgba(220, 38, 38, 0.22);
                border-radius: 6px;
                box-shadow: 0 8px 32px -8px rgba(0,0,0,0.6);
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #e4e4e7;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.18s ease;
                z-index: 80;
                white-space: nowrap;
            }
            #${ROOT_ID}:hover .rg-tooltip { opacity: 1; }
            #${ROOT_ID} .rg-tooltip .rg-row {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 2px 0;
            }
            #${ROOT_ID} .rg-tooltip .rg-row span:first-child {
                color: #a1a1aa;
            }
            #${ROOT_ID} .rg-tooltip .rg-row .rg-pos { color: #22c55e; }
            #${ROOT_ID} .rg-tooltip .rg-row .rg-neg { color: #ef4444; }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── Mount ─────────────────────────────────────────────────────────
    function findMountHost() {
        return document.getElementById('botStatusRow')
            || document.querySelector('.bot-status-row')
            || document.querySelector('.header')
            || null;
    }

    function mount() {
        let root = document.getElementById(ROOT_ID);
        if (state.mounted && root && root.querySelector('.rg-ring-wrap')) return true;
        state.mounted = false;

        // Prefer a semantic host; if none exist (page still loading, DOM
        // stripped, test harness, etc.) fall back to a fixed-position
        // element on document.body so the gauge is always visible rather
        // than silently failing to mount. Per spec §5 mount priority.
        let host = findMountHost();
        let usedFallback = false;
        if (!host) {
            if (!document.body) return false;  // DOM not ready yet
            host = document.body;
            usedFallback = true;
        }

        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
        }
        root.classList.remove('state-watch', 'state-danger');
        root.classList.add('state-ok');
        if (usedFallback) {
            // Fixed top-right positioning so the gauge doesn't compete
            // with other content for layout space when mounted outside
            // the intended status-row host.
            root.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;';
        }
        root.innerHTML = `
            <div class="rg-ring-wrap">
                <svg viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}" aria-hidden="true">
                    <circle class="rg-ring-track" cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${RING_RADIUS}"></circle>
                    <circle class="rg-ring-fill" cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${RING_RADIUS}"></circle>
                </svg>
                <div class="rg-pct">
                    <span class="rg-pct-num">0%</span>
                    <span class="rg-pct-sub">SAFE</span>
                </div>
            </div>
            <span class="rg-label">Risk Budget</span>
            <div class="rg-tooltip" role="tooltip"></div>
        `;
        if (!root.parentNode) {
            host.appendChild(root);
        }
        state.mounted = true;
        render();
        return true;
    }

    // ─── Render ────────────────────────────────────────────────────────
    function classifyState(usedPct) {
        if (usedPct >= 80) return 'state-danger';
        if (usedPct >= 50) return 'state-watch';
        return 'state-ok';
    }

    function fmtUsd(v) {
        const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
        return `${sign}$${Math.abs(v).toFixed(2)}`;
    }
    function fmtPctSigned(v) {
        const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
        return `${sign}${Math.abs(v).toFixed(2)}%`;
    }

    function render() {
        if (!mount()) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const m = compute();

        const pctNum = root.querySelector('.rg-pct-num');
        const pctSub = root.querySelector('.rg-pct-sub');
        const ringFill = root.querySelector('.rg-ring-fill');
        const tooltip = root.querySelector('.rg-tooltip');

        // Ring fill: stroke-dashoffset based on usedPct (0 used → full circle empty;
        // 100% used → full circle filled).
        const used = Math.max(0, Math.min(100, m.ready ? m.usedPct : 0));
        if (ringFill) {
            const offset = RING_CIRC * (1 - used / 100);
            ringFill.setAttribute('stroke-dashoffset', offset.toFixed(3));
        }
        // When the gauge hasn't received authoritative equity data yet,
        // show "—" / "WAIT" instead of the default "0% SAFE" — that was
        // indistinguishable from a working gauge with no drawdown, so
        // a broken pipeline looked identical to a healthy "no losses today."
        // Empty-state signaling needs to be unambiguous.
        if (pctNum) pctNum.textContent = m.ready ? `${Math.round(used)}%` : '—';
        if (pctSub) {
            if (!m.ready) {
                pctSub.textContent = 'WAIT';
            } else {
                pctSub.textContent = used >= 80 ? 'DANGER' : used >= 50 ? 'WATCH' : (used > 0 ? 'USED' : 'SAFE');
            }
        }

        // State class swap
        root.classList.remove('state-ok', 'state-watch', 'state-danger');
        root.classList.add(classifyState(used));

        // Tooltip
        if (tooltip) {
            if (!m.ready) {
                tooltip.innerHTML = `<div class="rg-row"><span>Status</span><span>awaiting balance…</span></div>`;
            } else {
                const pnlClass = m.pnl >= 0 ? 'rg-pos' : 'rg-neg';
                tooltip.innerHTML = `
                    <div class="rg-row"><span>P&L</span><span class="${pnlClass}">${fmtUsd(m.pnl)} (${fmtPctSigned(m.pnlPct)})</span></div>
                    <div class="rg-row"><span>Loss Limit</span><span>$${m.lossLimit.toFixed(2)} (${(state.lossLimitPct * 100).toFixed(1)}%)</span></div>
                    <div class="rg-row"><span>Budget Used</span><span>${used.toFixed(1)}%</span></div>
                    <div class="rg-row"><span>Drawdown (peak)</span><span>${m.drawdownFromPeak.toFixed(2)}%</span></div>
                    <div class="rg-row"><span>Session Start</span><span>$${m.start.toFixed(2)}</span></div>
                `;
            }
        }
    }

    // ─── Balance update paths ──────────────────────────────────────────
    function updateEquity(equity) {
        if (!isFinite(equity) || equity <= 0) return;
        // Session rollover check on every update
        if (todayET() !== state.sessionDate) loadSession();
        initSessionStart(equity);
        state.currentEquity = equity;
        if (state.sessionPeak == null || equity > state.sessionPeak) {
            state.sessionPeak = equity;
            lsSet(LS_KEY_PEAK, equity);
        }
        render();
    }

    function onPriceEquity(equity) {
        updateEquity(equity);
    }

    // ─── Public API ────────────────────────────────────────────────────
    const RiskGauge = {
        init() {
            try {
                injectStyles();
                loadLimit();
                loadSession();
                mount();

                const socket = OGZ.get && OGZ.get('Socket');
                if (!socket || !socket.registerHandler) return;

                // 1. price - authoritative per-tick equity
                socket.registerHandler('price', (d) => {
                    try {
                        const data = d && d.data;
                        const eq = data && data.equity;
                        if (isFinite(eq) && eq > 0) onPriceEquity(Number(eq));
                    } catch (_) { /* swallow */ }
                });

                // 2. balance_update - explicit equity push
                socket.registerHandler('balance_update', (d) => {
                    try {
                        const eq = d && (d.equity != null ? d.equity : (d.data && d.data.equity));
                        if (isFinite(eq) && eq > 0) {
                            // Not the price stream path - do not flip the flag.
                            updateEquity(Number(eq));
                        }
                    } catch (_) { /* swallow */ }
                });

                // 3. state_update - fallback
                socket.registerHandler('state_update', (d) => {
                    try {
                        const eq = d && (d.equity != null ? d.equity : (d.state && d.state.equity));
                        if (isFinite(eq) && eq > 0) updateEquity(Number(eq));
                    } catch (_) { /* swallow */ }
                });

            } catch (_) { /* init must never throw */ }
        },

        setLimit(pct) {
            if (!isFinite(pct) || pct <= 0 || pct >= 1) return;
            state.lossLimitPct = pct;
            lsSet(LS_KEY_LIMIT, pct);
            render();
        },

        resetSession() {
            state.sessionStart = null;
            state.sessionPeak = null;
            // DeepSearch fix 2026-04-27: was `todayUTC()` which doesn't
            // exist in this module — the helper is `todayET()` (defined
            // at L77). Calls to resetSession() previously threw
            // ReferenceError silently inside the OGZ.RiskGauge.resetSession
            // public method, which broke the daily session-rollover path.
            state.sessionDate = todayET();
            try {
                localStorage.removeItem(LS_KEY_START);
                localStorage.removeItem(LS_KEY_PEAK);
            } catch (_) { /* swallow */ }
            if (isFinite(state.currentEquity) && state.currentEquity > 0) {
                initSessionStart(state.currentEquity);
            }
            render();
        },

        // Debug surface
        _state: state,
        _compute: compute,
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('RiskGauge', RiskGauge);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('RiskGauge', RiskGauge);
            }
        });
    }

    // Debug console access per spec
    try { window.OGZRiskGauge = RiskGauge; } catch (_) {}
})(window.OGZ = window.OGZ || {});
