/**
 * strategy-leaderboard.js — Session Strategy Leaderboard (Phase F)
 *
 * Right-rail panel: per-strategy P&L for the current session, sorted by
 * |totalPnL| descending. Each row shows pretty name, colored total P&L,
 * proportional bar, trades count, and win rate.
 *
 * KNOWN GAP: core/OrderExecutor.js broadcasts `trade` events WITHOUT
 * strategy/exitStrategy fields on close. Until that's fixed, all closes
 * collapse to "Unattributed". When all rows are unknown, we surface an
 * inline amber hint explaining the attribution gap.
 *
 * Self-injects CSS; self-registers as OGZ.StrategyLeaderboard.
 *
 * @module public/js/panels/strategy-leaderboard
 */
(function (OGZ) {
    'use strict';

    const STYLE_ID = 'ogz-strategy-leaderboard-styles';
    const ROOT_ID = 'strategyLeaderboard';
    const MAX_ROWS = 6;
    // Cap the strategy-name map so a malformed/rotating strategy stream
    // (e.g., 10k trades across 100s of distinct names due to a backend
    // bug) can't grow the Map unbounded. 256 is generous for a real
    // bot which rarely has more than a dozen distinct strategies per
    // session. LRU eviction drops the least-recently-updated strategy
    // when the cap is hit.
    const MAX_STRATEGIES = 256;

    const state = {
        mounted: false,
        // Map<strategyName, { pnl, trades, wins }>
        book: new Map(),
    };

    // ─── Helpers ───────────────────────────────────────────────────────
    // XSS defense: strategy names come from trade events over WebSocket.
    // All render paths go through root.innerHTML, so ANY name that reaches
    // the DOM must be HTML-escaped. escapeHtml maps the five dangerous
    // characters to their entity equivalents.
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function prettyName(raw) {
        if (!raw || raw === 'unknown') return 'Unattributed';
        // Split on camelCase / snake_case boundaries
        const s = String(raw)
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return s.replace(/\b\w/g, c => c.toUpperCase());
    }

    function attributionOf(trade) {
        if (!trade) return 'unknown';
        return trade.exitStrategy
            || trade.strategy
            || trade.entryStrategy
            || trade.winnerStrategy
            || 'unknown';
    }

    // ─── Style injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                background: rgba(15, 15, 15, 0.72);
                backdrop-filter: blur(10px) saturate(140%);
                -webkit-backdrop-filter: blur(10px) saturate(140%);
                border: 1px solid rgba(220, 38, 38, 0.14);
                border-radius: 8px;
                padding: 10px 12px;
                margin-bottom: 10px;
                user-select: none;
            }
            #${ROOT_ID} .sl-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: #a1a1aa;
                letter-spacing: 0.12em;
                text-transform: uppercase;
            }
            #${ROOT_ID} .sl-reset {
                background: none;
                border: 1px solid rgba(255,255,255,0.12);
                color: #a1a1aa;
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                padding: 2px 8px;
                border-radius: 999px;
                cursor: pointer;
                transition: background 0.18s, border-color 0.18s;
            }
            #${ROOT_ID} .sl-reset:hover {
                background: rgba(220,38,38,0.12);
                border-color: rgba(220,38,38,0.35);
                color: #fca5a5;
            }
            #${ROOT_ID} .sl-row {
                padding: 6px 0;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            }
            #${ROOT_ID} .sl-row:last-child { border-bottom: none; }
            #${ROOT_ID} .sl-row-top {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                margin-bottom: 4px;
            }
            #${ROOT_ID} .sl-name {
                font-size: 12px;
                font-weight: 700;
                color: #f5f5f5;
            }
            #${ROOT_ID} .sl-pnl {
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                font-weight: 600;
            }
            #${ROOT_ID} .sl-pnl.pos { color: #22c55e; }
            #${ROOT_ID} .sl-pnl.neg { color: #ef4444; }
            #${ROOT_ID} .sl-bar {
                height: 3px;
                background: rgba(255,255,255,0.05);
                border-radius: 2px;
                overflow: hidden;
                margin-bottom: 3px;
            }
            #${ROOT_ID} .sl-bar-fill {
                height: 100%;
                transition: width 0.3s ease;
            }
            #${ROOT_ID} .sl-bar-fill.pos { background: #22c55e; }
            #${ROOT_ID} .sl-bar-fill.neg { background: #ef4444; }
            #${ROOT_ID} .sl-meta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #71717a;
                text-align: right;
            }
            #${ROOT_ID} .sl-empty {
                text-align: center;
                font-size: 11px;
                color: #52525b;
                padding: 10px 0;
                font-style: italic;
            }
            #${ROOT_ID} .sl-hint {
                margin-top: 8px;
                padding: 7px 9px;
                background: rgba(245, 158, 11, 0.08);
                border: 1px solid rgba(245, 158, 11, 0.24);
                border-radius: 5px;
                font-size: 10px;
                color: #fcd34d;
                line-height: 1.4;
                font-family: 'JetBrains Mono', monospace;
                letter-spacing: 0.02em;
            }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─── Mount + render ────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;
        state.mounted = true;
        return true;
    }

    function fmtUsd(v) {
        const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
        return `${sign}$${Math.abs(v).toFixed(2)}`;
    }

    function render() {
        if (!mount()) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const rows = [...state.book.entries()]
            .map(([name, d]) => ({
                name,
                pretty: prettyName(name),
                pnl: d.pnl,
                trades: d.trades,
                wr: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
            }))
            .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
            .slice(0, MAX_ROWS);

        const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.pnl)), 0) || 1;

        const allUnknown = rows.length > 0 && rows.every(r => r.name === 'unknown');

        let html = `
            <div class="sl-head">
                <span>Strategy Leaderboard · Session</span>
                <button class="sl-reset" data-role="reset" title="Reset session">⟲ reset</button>
            </div>
        `;

        if (rows.length === 0) {
            html += `<div class="sl-empty">No closed trades this session yet.</div>`;
        } else {
            html += rows.map(r => {
                const pnlClass = r.pnl >= 0 ? 'pos' : 'neg';
                const barPct = Math.min(100, (Math.abs(r.pnl) / maxAbs) * 100);
                // r.pretty is derived from WebSocket trade.strategy — HTML-escape
                // before interpolating into innerHTML. fmtUsd / r.wr / r.trades
                // are numeric-formatted so they're structurally safe.
                return `
                    <div class="sl-row">
                        <div class="sl-row-top">
                            <span class="sl-name">${escapeHtml(r.pretty)}</span>
                            <span class="sl-pnl ${pnlClass}">${fmtUsd(r.pnl)}</span>
                        </div>
                        <div class="sl-bar"><div class="sl-bar-fill ${pnlClass}" style="width:${barPct}%;"></div></div>
                        <div class="sl-meta">${r.trades} trades · ${r.wr.toFixed(0)}% WR</div>
                    </div>
                `;
            }).join('');
        }

        if (allUnknown) {
            html += `
                <div class="sl-hint">Awaiting strategy attribution&hellip;</div>
            `;
        }

        root.innerHTML = html;

        const resetBtn = root.querySelector('[data-role="reset"]');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                try { Leaderboard.reset(); } catch (_) { /* swallow */ }
            });
        }
    }

    // ─── Recording ─────────────────────────────────────────────────────
    function record(trade) {
        try {
            if (!trade) return;
            const pnl = Number(trade.pnl);
            if (!isFinite(pnl) || pnl === 0) return; // Skip opens / zero-pnl broadcasts
            const key = attributionOf(trade);
            const existing = state.book.has(key);
            const cur = state.book.get(key) || { pnl: 0, trades: 0, wins: 0 };
            cur.pnl += pnl;
            cur.trades += 1;
            if (pnl > 0) cur.wins += 1;
            // Cap + LRU eviction: if this is a NEW strategy and we're at
            // the cap, drop the least-recently-updated entry to make room.
            // state.book is a Map so insertion/update order is preserved;
            // delete-then-set moves the updated entry to the tail (tail =
            // most recent = LRU survival).
            if (!existing && state.book.size >= MAX_STRATEGIES) {
                const oldestKey = state.book.keys().next().value;
                if (oldestKey != null) state.book.delete(oldestKey);
            }
            // Delete-then-set for existing entries so they move to the
            // tail (LRU refresh on write).
            if (existing) state.book.delete(key);
            state.book.set(key, cur);
            render();
        } catch (_) { /* swallow */ }
    }

    // ─── Public API ────────────────────────────────────────────────────
    const Leaderboard = {
        init() {
            try {
                injectStyles();
                mount();
                render();
                const socket = OGZ.get && OGZ.get('Socket');
                if (!socket || !socket.registerHandler) return;
                socket.registerHandler('trade', (d) => {
                    try {
                        if (!d) return;
                        // Some feeds wrap payload in .data
                        const t = d.pnl != null ? d : (d.data || d);
                        record(t);
                    } catch (_) { /* swallow */ }
                });
            } catch (_) { /* swallow */ }
        },
        record,
        reset() {
            state.book.clear();
            render();
        },
        _book: state.book,
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('StrategyLeaderboard', Leaderboard);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('StrategyLeaderboard', Leaderboard);
            }
        });
    }

    try { window.OGZStrategyLeaderboard = Leaderboard; } catch (_) {}
})(window.OGZ = window.OGZ || {});
