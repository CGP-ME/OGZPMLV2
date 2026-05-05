/**
 * session-phase.js — US Equity Session Phase Indicator (Phase F)
 *
 * Inline pill in the header strip. Shows current market phase for US stocks
 * (PRE / RTH / AH / CLOSED) using DST-aware America/New_York time via
 * Intl.DateTimeFormat. Recognises NYSE holidays + early-close days (hardcoded
 * for 2026 and 2027). When the active asset is crypto (detected via -USD
 * suffix on #assetSelector), shows "24/7" amber.
 *
 * Tooltip shows the next transition (e.g. "RTH opens 09:30 ET").
 *
 * Self-injects CSS; self-registers as OGZ.SessionPhase.
 *
 * @module public/js/panels/session-phase
 */
(function (OGZ) {
    'use strict';

    const STYLE_ID = 'ogz-session-phase-styles';
    const ROOT_ID = 'sessionPhase';

    // Source of truth: foundation/MarketCalendar.js (server-side, dynamic).
    // This frontend copy is hardcoded for offline rendering; if updating
    // holidays, update BOTH files (or wire to /api/trai/session-context).
    // NYSE full-day closures 2026-2027
    const HOLIDAYS = new Set([
        '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
        '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
        '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
        '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
    ]);

    // Early-close days (RTH closes at 13:00 ET instead of 16:00)
    const EARLY_CLOSE = new Set([
        '2026-11-27', '2026-12-24',
        '2027-11-26', '2027-12-23',
    ]);

    const state = {
        mounted: false,
        timerId: null,
    };

    // ─── Style injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 3px 10px;
                background: rgba(0,0,0,0.35);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 999px;
                user-select: none;
                margin-left: 8px;
            }
            #${ROOT_ID} .sp-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #71717a;
                box-shadow: 0 0 6px rgba(255,255,255,0.2);
            }
            #${ROOT_ID} .sp-label {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-weight: 700;
                font-size: 10px;
                letter-spacing: 0.08em;
                color: #e4e4e7;
            }
            #${ROOT_ID} .sp-clock {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #a1a1aa;
                letter-spacing: 0.04em;
            }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── NY time extraction ────────────────────────────────────────────
    // Returns {y,m,d,h,min,s,weekday} in America/New_York.
    const NY_FMT = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short',
        hour12: false,
    });

    function nyParts() {
        const parts = NY_FMT.formatToParts(new Date());
        const get = (t) => {
            const p = parts.find(x => x.type === t);
            return p ? p.value : '';
        };
        let h = parseInt(get('hour'), 10);
        if (h === 24) h = 0; // some impls emit 24 for midnight
        return {
            y: get('year'),
            m: get('month'),
            d: get('day'),
            h,
            min: parseInt(get('minute'), 10),
            s: parseInt(get('second'), 10),
            weekday: get('weekday'), // Mon, Tue, ...
        };
    }

    function dateKey(p) { return `${p.y}-${p.m}-${p.d}`; }
    function isWeekend(p) { return p.weekday === 'Sat' || p.weekday === 'Sun'; }
    function minutesET(p) { return p.h * 60 + p.min; }

    // ─── Asset detection ───────────────────────────────────────────────
    function isCryptoActive() {
        const sel = document.getElementById('assetSelector');
        if (!sel) return false;
        const v = String(sel.value || '').toUpperCase();
        return /-USD$/.test(v) || /USD$/.test(v) && /^(BTC|ETH|SOL|XBT|LTC|DOGE|ADA|XRP|DOT|AVAX)/.test(v);
    }

    // ─── Phase logic ───────────────────────────────────────────────────
    function computePhase() {
        if (isCryptoActive()) {
            return {
                label: '24/7',
                dot: '#f59e0b',
                clock: '',
                tooltip: 'Crypto market — always open',
            };
        }

        const p = nyParts();
        const key = dateKey(p);
        const et = `${String(p.h).padStart(2,'0')}:${String(p.min).padStart(2,'0')} ET`;

        // Weekend or holiday → CLOSED
        if (isWeekend(p) || HOLIDAYS.has(key)) {
            return {
                label: 'CLOSED',
                dot: '#71717a',
                clock: et,
                tooltip: isWeekend(p) ? 'Weekend — opens Mon 09:30 ET' : 'NYSE holiday',
            };
        }

        const mins = minutesET(p);
        const PRE_OPEN = 4 * 60;           // 04:00
        const RTH_OPEN = 9 * 60 + 30;      // 09:30
        const early = EARLY_CLOSE.has(key);
        const RTH_CLOSE = early ? 13 * 60 : 16 * 60;
        const AH_CLOSE = 20 * 60;          // 20:00

        if (mins < PRE_OPEN) {
            return { label: 'CLOSED', dot: '#71717a', clock: et, tooltip: 'Pre-market opens 04:00 ET' };
        }
        if (mins < RTH_OPEN) {
            return { label: 'PRE', dot: '#60a5fa', clock: et, tooltip: 'RTH opens 09:30 ET' };
        }
        if (mins < RTH_CLOSE) {
            const closeH = Math.floor(RTH_CLOSE / 60);
            const closeM = RTH_CLOSE % 60;
            const closeStr = `${String(closeH).padStart(2,'0')}:${String(closeM).padStart(2,'0')} ET`;
            return {
                label: 'RTH',
                dot: '#22c55e',
                clock: et,
                tooltip: early ? `Early close ${closeStr}` : `Closes ${closeStr}`,
            };
        }
        if (mins < AH_CLOSE) {
            return { label: 'AH', dot: '#f59e0b', clock: et, tooltip: 'After-hours closes 20:00 ET' };
        }
        return { label: 'CLOSED', dot: '#71717a', clock: et, tooltip: 'Pre-market opens 04:00 ET' };
    }

    // ─── Mount + render ────────────────────────────────────────────────
    function findHost() {
        const container = document.querySelector('.tier-selector-container');
        return container || document.querySelector('.header') || document.body;
    }

    function mount() {
        if (state.mounted) return true;
        if (document.getElementById(ROOT_ID)) { state.mounted = true; return true; }
        const host = findHost();
        if (!host) return false;
        const span = document.createElement('span');
        span.id = ROOT_ID;
        span.innerHTML = `
            <span class="sp-dot"></span>
            <span class="sp-label">—</span>
            <span class="sp-clock"></span>
        `;
        // Prefer to sit after botStatusRow (Phase E mount) if it exists
        const botRow = document.getElementById('botStatusRow');
        if (botRow && botRow.parentNode === host && botRow.nextSibling) {
            host.insertBefore(span, botRow.nextSibling);
        } else if (botRow && botRow.parentNode === host) {
            host.appendChild(span);
        } else {
            host.appendChild(span);
        }
        state.mounted = true;
        return true;
    }

    function render() {
        if (!mount()) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const info = computePhase();
        const dot = root.querySelector('.sp-dot');
        const label = root.querySelector('.sp-label');
        const clock = root.querySelector('.sp-clock');
        if (dot) {
            dot.style.background = info.dot;
            dot.style.boxShadow = `0 0 8px ${info.dot}80`;
        }
        if (label) label.textContent = info.label;
        if (clock) clock.textContent = info.clock;
        if (info.tooltip) root.title = info.tooltip;
    }

    // ─── Public API ────────────────────────────────────────────────────
    const SessionPhase = {
        init() {
            try {
                injectStyles();
                mount();
                render();
                if (state.timerId) clearInterval(state.timerId);
                state.timerId = setInterval(render, 1000);

                const assetSel = document.getElementById('assetSelector');
                if (assetSel) {
                    assetSel.addEventListener('change', () => {
                        try { render(); } catch (_) { /* swallow */ }
                    });
                }
            } catch (_) { /* init must never throw */ }
        },
        _compute: computePhase,
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('SessionPhase', SessionPhase);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('SessionPhase', SessionPhase);
            }
        });
    }

    try { window.OGZSessionPhase = SessionPhase; } catch (_) {}
})(window.OGZ = window.OGZ || {});
