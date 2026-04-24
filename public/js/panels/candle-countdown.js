/**
 * candle-countdown.js — Candle Countdown Ring (Phase F)
 *
 * Compact SVG ring + digital m:ss label mounted inline with the timeframe
 * selector. Ticks down to the next candle close aligned to the selected
 * timeframe boundary. Drift-corrects from price.data.candle.time when that
 * server-authoritative bucket start is available. Dims to 45% on stale feed.
 *
 * Self-injects CSS; self-registers as OGZ.CandleCountdown.
 *
 * @module public/js/panels/candle-countdown
 */
(function (OGZ) {
    'use strict';

    const STYLE_ID = 'ogz-candle-countdown-styles';
    const ROOT_ID = 'candleCountdown';

    const TF_MS = {
        '1m': 60000,
        '5m': 300000,
        '15m': 900000,
        '30m': 1800000,
        '1h': 3600000,
        '4h': 14400000,
        '1d': 86400000,
    };

    const RING_R = 10;
    const RING_C = 2 * Math.PI * RING_R;

    const state = {
        mounted: false,
        boundaryMs: 0,     // Absolute timestamp the current bucket ends at
        lastTickAt: 0,     // Last time we saw a price message
        tfKey: '15m',
        tickerId: null,
    };

    // ─── Helpers ────────────────────────────────────────────────────────
    function currentTf() {
        const sel = document.getElementById('timeframeSelector');
        const v = sel ? String(sel.value || '').toLowerCase() : '15m';
        return TF_MS[v] ? v : '15m';
    }

    function tfMs() { return TF_MS[state.tfKey] || TF_MS['15m']; }

    function anchorWallClock() {
        const ms = tfMs();
        const now = Date.now();
        state.boundaryMs = Math.ceil(now / ms) * ms;
    }

    function anchorFromCandleStart(startMs) {
        // Server-authoritative bucket start → boundary = start + tfMs.
        const ms = tfMs();
        if (!isFinite(startMs) || startMs <= 0) return;
        state.boundaryMs = startMs + ms;
    }

    // ─── Style injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 2px 8px 2px 4px;
                background: rgba(0,0,0,0.35);
                border: 1px solid rgba(220, 38, 38, 0.25);
                border-radius: 999px;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                transition: opacity 0.25s ease;
                user-select: none;
            }
            #${ROOT_ID}.stale { opacity: 0.45; }
            #${ROOT_ID} .cc-ring-wrap {
                position: relative;
                width: 28px;
                height: 28px;
            }
            #${ROOT_ID} .cc-ring-track {
                fill: none;
                stroke: rgba(255,255,255,0.07);
                stroke-width: 2;
            }
            #${ROOT_ID} .cc-ring-fill {
                fill: none;
                stroke-width: 2;
                stroke-linecap: round;
                transform: rotate(-90deg);
                transform-origin: 50% 50%;
                stroke-dasharray: ${RING_C.toFixed(3)};
                stroke-dashoffset: 0;
                transition: stroke-dashoffset 0.28s linear, stroke 0.2s ease;
                stroke: #dc2626;
            }
            #${ROOT_ID}.warn .cc-ring-fill { stroke: #f59e0b; }
            #${ROOT_ID}.crit .cc-ring-fill { stroke: #ef4444; }
            #${ROOT_ID} .cc-label {
                font-size: 11px;
                color: #e4e4e7;
                letter-spacing: 0.06em;
                min-width: 28px;
                text-align: center;
            }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── Mount ──────────────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        if (document.getElementById(ROOT_ID)) { state.mounted = true; return true; }

        const tfSel = document.getElementById('timeframeSelector');
        const host = (tfSel && tfSel.parentNode) || document.querySelector('.chart-controls');
        if (!host) return false;

        const span = document.createElement('span');
        span.id = ROOT_ID;
        span.innerHTML = `
            <span class="cc-ring-wrap">
                <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
                    <circle class="cc-ring-track" cx="14" cy="14" r="${RING_R}"></circle>
                    <circle class="cc-ring-fill"  cx="14" cy="14" r="${RING_R}"></circle>
                </svg>
            </span>
            <span class="cc-label">--:--</span>
        `;

        if (tfSel && tfSel.nextSibling && host === tfSel.parentNode) {
            host.insertBefore(span, tfSel.nextSibling);
        } else {
            host.appendChild(span);
        }

        state.mounted = true;
        return true;
    }

    // ─── Render tick ───────────────────────────────────────────────────
    function fmt(ms) {
        if (!isFinite(ms) || ms < 0) ms = 0;
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${m}:${String(rem).padStart(2, '0')}`;
    }

    function renderTick() {
        if (!mount()) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const fill = root.querySelector('.cc-ring-fill');
        const label = root.querySelector('.cc-label');

        const total = tfMs();
        const now = Date.now();
        if (!state.boundaryMs || state.boundaryMs <= now) anchorWallClock();
        const remaining = Math.max(0, state.boundaryMs - now);
        const pct = total > 0 ? (remaining / total) : 0;

        // Ring — filled portion represents time remaining.
        if (fill) {
            const off = RING_C * (1 - pct);
            fill.setAttribute('stroke-dashoffset', off.toFixed(3));
        }
        if (label) label.textContent = fmt(remaining);

        root.classList.remove('warn', 'crit');
        if (pct <= 0.10) root.classList.add('crit');
        else if (pct <= 0.25) root.classList.add('warn');

        // Stale feed dim (>15s without a price tick)
        if (state.lastTickAt && (now - state.lastTickAt) > 15000) {
            root.classList.add('stale');
        } else if (state.lastTickAt) {
            root.classList.remove('stale');
        }
    }

    function startTicker() {
        if (state.tickerId) clearInterval(state.tickerId);
        state.tickerId = setInterval(renderTick, 300);
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const CandleCountdown = {
        init() {
            try {
                injectStyles();
                mount();
                state.tfKey = currentTf();
                anchorWallClock();

                const tfSel = document.getElementById('timeframeSelector');
                if (tfSel) {
                    tfSel.addEventListener('change', () => {
                        try {
                            state.tfKey = currentTf();
                            anchorWallClock();
                            renderTick();
                        } catch (_) { /* swallow */ }
                    });
                }

                const socket = OGZ.get && OGZ.get('Socket');
                if (socket && socket.registerHandler) {
                    socket.registerHandler('price', (d) => {
                        try {
                            state.lastTickAt = Date.now();
                            const candle = d && d.data && d.data.candle;
                            // CandleProcessor sends candle.timestamp, not
                            // candle.time (verified against
                            // core/CandleProcessor.js:346-368). Read both
                            // field names so drift correction fires whether
                            // the broadcast uses the spec name (.time) or
                            // the implementation name (.timestamp).
                            // Without this, setInterval-based drift could
                            // accumulate up to hours over a long session.
                            const rawTime = candle
                                ? (isFinite(candle.time) ? candle.time
                                    : (isFinite(candle.timestamp) ? candle.timestamp : null))
                                : null;
                            if (rawTime != null) {
                                const t = Number(rawTime);
                                const ms = t > 1e12 ? t : t * 1000;
                                anchorFromCandleStart(ms);
                            }
                        } catch (_) { /* swallow */ }
                    });
                }

                startTicker();
            } catch (_) { /* init must never throw */ }
        },
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('CandleCountdown', CandleCountdown);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('CandleCountdown', CandleCountdown);
            }
        });
    }

    try { window.OGZCandleCountdown = CandleCountdown; } catch (_) {}
})(window.OGZ = window.OGZ || {});
