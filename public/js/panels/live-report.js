/**
 * live-report.js — LiveReport: Gate H operator/customer live trade report
 *
 * Commit 4 of gate-h-live-trade-report-PLAN.md — the "quiet-period honest view".
 *
 * Gate H requires the report be useful during quiet / no-trade periods: show
 * the active symbol/timeframe/account, data freshness, account state, and the
 * bot's latest reasoning — rather than pretending something happened. This
 * module delivers exactly that, fed ONLY by verified real events:
 *
 *   - 'state_update'   → account state (balance, position, PnL, trade count)
 *   - 'asset_switched' → active symbol / broker / asset class
 *   - 'bot_thinking'   → latest bot reasoning + confidence + regime
 *   - socket message arrival → data-freshness clock
 *
 * NO synthetic data. NO hydration-default celebrations. NO fake trades. Every
 * field shows '—' / an honest "awaiting…" string until a real event fills it.
 * The append-only closed-trade feed (journal_snapshot) is commit 5 — this file
 * intentionally stops at the quiet-period surface.
 *
 * Mount contract: renders into <div id="liveReport"></div> if it exists. If no
 * docked mount point is present it renders NOTHING (no floating fallback — the
 * goal-tracker floating-overlay bug is not repeated here).
 *
 * Self-registers as OGZ.LiveReport. Reduced-motion safe (no animation in the
 * quiet view). Operator/customer aware via localStorage 'ogz.profile'.
 *
 * Public API: init() / render() / teardown() / _compute()
 *
 * @module public/js/panels/live-report
 */
(function (OGZ) {
    'use strict';

    const ROOT_ID = 'liveReport';
    const STYLE_ID = 'ogz-live-report-styles';

    // Freshness thresholds (ms)
    const FRESH_LIVE_MS = 8000;     // < 8s  → "live"
    const FRESH_RECENT_MS = 20000;  // < 20s → "Ns ago"; beyond → "STALE"

    const IS_OPERATOR = (function () {
        try { return localStorage.getItem('ogz.profile') === 'operator'; }
        catch (_) { return false; }
    })();

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        mounted: false,
        lastMsgAt: 0,        // last time ANY tracked socket event arrived
        asset: null,         // { label, base, broker, assetClass }
        account: null,       // state_update .state object
        thinking: null,      // { message, reasoning, confidence, regime, ts }
        domRefs: {},
        freshTimer: null
    };

    // ─── Helpers ────────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function fmtMoney(n) {
        const v = Number(n);
        if (!isFinite(v)) return '—';
        return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtSignedMoney(n) {
        const v = Number(n);
        if (!isFinite(v)) return '—';
        return (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Position can arrive as 0 / number / string / object — normalize honestly.
    function describePosition(pos) {
        if (pos == null) return { text: '—', cls: '' };
        if (typeof pos === 'number') {
            if (pos === 0) return { text: 'FLAT', cls: 'lr-flat' };
            return { text: pos > 0 ? 'LONG' : 'SHORT', cls: pos > 0 ? 'lr-long' : 'lr-short' };
        }
        if (typeof pos === 'string') {
            const u = pos.toUpperCase();
            if (u === 'FLAT' || u === '') return { text: 'FLAT', cls: 'lr-flat' };
            if (u === 'LONG') return { text: 'LONG', cls: 'lr-long' };
            if (u === 'SHORT') return { text: 'SHORT', cls: 'lr-short' };
            return { text: u, cls: '' };
        }
        if (typeof pos === 'object') {
            const dir = String(pos.direction || pos.side || '').toUpperCase();
            if (!pos.size || pos.size === 0) return { text: 'FLAT', cls: 'lr-flat' };
            if (dir === 'LONG') return { text: 'LONG', cls: 'lr-long' };
            if (dir === 'SHORT') return { text: 'SHORT', cls: 'lr-short' };
            return { text: 'OPEN', cls: '' };
        }
        return { text: '—', cls: '' };
    }

    function activeTimeframe() {
        // The active timeframe is owned by the chart panel's selector — there is
        // no dedicated socket event for it. Best-effort read; '—' if absent.
        const el = document.getElementById('cp-timeframeSelector');
        return (el && el.value) ? el.value : '—';
    }

    // ─── Style Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                background: rgba(10, 10, 14, 0.55);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 12px 14px;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                color: #d1d4dc;
                overflow: hidden;
            }
            #${ROOT_ID} .lr-head {
                display: flex; align-items: center; justify-content: space-between;
                gap: 10px; margin-bottom: 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 8px;
            }
            #${ROOT_ID} .lr-title {
                font-size: 11px; font-weight: 700; letter-spacing: 0.16em;
                text-transform: uppercase; color: #e4e4e7;
            }
            #${ROOT_ID} .lr-fresh {
                font-size: 10px; letter-spacing: 0.04em; padding: 2px 8px;
                border-radius: 10px; white-space: nowrap;
            }
            #${ROOT_ID} .lr-fresh.live   { color: #22c55e; background: rgba(34,197,94,0.12);  border: 1px solid rgba(34,197,94,0.35); }
            #${ROOT_ID} .lr-fresh.recent { color: #fbbf24; background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.30); }
            #${ROOT_ID} .lr-fresh.stale  { color: #ef4444; background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.35); }
            #${ROOT_ID} .lr-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                gap: 8px 14px; margin-bottom: 10px;
            }
            #${ROOT_ID} .lr-cell .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 2px;
            }
            #${ROOT_ID} .lr-cell .lr-v {
                font-size: 13px; font-weight: 600; color: #e4e4e7;
            }
            #${ROOT_ID} .lr-v.lr-flat  { color: #a1a1aa; }
            #${ROOT_ID} .lr-v.lr-long  { color: #22c55e; }
            #${ROOT_ID} .lr-v.lr-short { color: #ef4444; }
            #${ROOT_ID} .lr-v.pos { color: #22c55e; }
            #${ROOT_ID} .lr-v.neg { color: #ef4444; }
            #${ROOT_ID} .lr-reason {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px; padding: 8px 10px;
            }
            #${ROOT_ID} .lr-reason .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 4px;
            }
            #${ROOT_ID} .lr-reason .lr-msg {
                font-size: 12px; line-height: 1.5; color: #d1d4dc;
            }
            #${ROOT_ID} .lr-reason .lr-meta {
                font-size: 10px; color: #71717a; margin-top: 5px;
            }
            #${ROOT_ID} .lr-empty { color: #52525b; font-style: italic; }
        `;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        if (document.head) document.head.appendChild(el);
    }

    // ─── Mount ──────────────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;   // no docked mount point → render nothing
        root.innerHTML = `
            <div class="lr-head">
                <span class="lr-title">${IS_OPERATOR ? 'Live Trade Report' : 'Live Trade Report'}</span>
                <span class="lr-fresh" data-k="fresh">awaiting feed</span>
            </div>
            <div class="lr-grid">
                <div class="lr-cell"><div class="lr-k">Symbol</div><div class="lr-v" data-k="symbol">—</div></div>
                <div class="lr-cell"><div class="lr-k">Timeframe</div><div class="lr-v" data-k="tf">—</div></div>
                <div class="lr-cell"><div class="lr-k">Account</div><div class="lr-v" data-k="account">—</div></div>
                <div class="lr-cell"><div class="lr-k">Position</div><div class="lr-v" data-k="position">—</div></div>
                <div class="lr-cell"><div class="lr-k">Balance</div><div class="lr-v" data-k="balance">—</div></div>
                <div class="lr-cell"><div class="lr-k">Realized P&L</div><div class="lr-v" data-k="realized">—</div></div>
                <div class="lr-cell"><div class="lr-k">Trades</div><div class="lr-v" data-k="trades">—</div></div>
                <div class="lr-cell"><div class="lr-k">Mode</div><div class="lr-v" data-k="mode">—</div></div>
            </div>
            <div class="lr-reason">
                <div class="lr-k">Latest bot reasoning</div>
                <div class="lr-msg" data-k="reason"><span class="lr-empty">No signal yet — waiting for the bot's first read.</span></div>
                <div class="lr-meta" data-k="reasonMeta"></div>
            </div>
        `;
        const q = sel => root.querySelector(sel);
        state.domRefs = {
            fresh:      q('[data-k="fresh"]'),
            symbol:     q('[data-k="symbol"]'),
            tf:         q('[data-k="tf"]'),
            account:    q('[data-k="account"]'),
            position:   q('[data-k="position"]'),
            balance:    q('[data-k="balance"]'),
            realized:   q('[data-k="realized"]'),
            trades:     q('[data-k="trades"]'),
            mode:       q('[data-k="mode"]'),
            reason:     q('[data-k="reason"]'),
            reasonMeta: q('[data-k="reasonMeta"]')
        };
        state.mounted = true;
        return true;
    }

    // ─── Freshness ──────────────────────────────────────────────────────
    function tickFreshness() {
        const el = state.domRefs.fresh;
        if (!el) return;
        if (state.domRefs.tf) state.domRefs.tf.textContent = activeTimeframe();
        if (!state.lastMsgAt) {
            el.textContent = 'awaiting feed';
            el.className = 'lr-fresh stale';
            return;
        }
        const age = Date.now() - state.lastMsgAt;
        if (age < FRESH_LIVE_MS) {
            el.textContent = 'live';
            el.className = 'lr-fresh live';
        } else if (age < FRESH_RECENT_MS) {
            el.textContent = Math.round(age / 1000) + 's ago';
            el.className = 'lr-fresh recent';
        } else {
            el.textContent = 'STALE · ' + Math.round(age / 1000) + 's no feed';
            el.className = 'lr-fresh stale';
        }
    }

    // ─── Render ─────────────────────────────────────────────────────────
    function render() {
        if (!state.mounted) return;
        const d = state.domRefs;
        const acct = state.account;

        // Context
        if (d.symbol) {
            d.symbol.textContent = state.asset
                ? (state.asset.label || state.asset.base || state.asset.asset || '—')
                : '—';
        }
        if (d.tf) d.tf.textContent = activeTimeframe();
        if (d.account) {
            d.account.textContent = acct && acct.accountId
                ? String(acct.accountId)
                : state.asset
                    ? String(state.asset.accountId || state.asset.broker || state.asset.assetClass || '—').toUpperCase()
                    : '—';
        }

        // Account state
        if (d.position) {
            const p = describePosition(acct ? acct.position : null);
            d.position.textContent = p.text;
            d.position.className = 'lr-v ' + p.cls;
        }
        if (d.balance) {
            d.balance.textContent = acct && acct.balance != null ? fmtMoney(acct.balance) : '—';
        }
        if (d.realized) {
            if (acct && acct.realizedPnL != null) {
                const v = Number(acct.realizedPnL);
                d.realized.textContent = fmtSignedMoney(v);
                d.realized.className = 'lr-v ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
            } else {
                d.realized.textContent = '—';
                d.realized.className = 'lr-v';
            }
        }
        if (d.trades) {
            d.trades.textContent = acct && acct.tradeCount != null ? String(acct.tradeCount) : '—';
        }
        if (d.mode) {
            if (!acct) d.mode.textContent = '—';
            else d.mode.textContent = acct.recoveryMode ? 'RECOVERY' : 'NORMAL';
        }

        // Latest bot reasoning — honest no-signal surface
        if (d.reason) {
            const t = state.thinking;
            if (t && (t.message || t.reasoning)) {
                d.reason.textContent = String(t.reasoning || t.message);
            } else {
                d.reason.innerHTML = '<span class="lr-empty">No signal yet — waiting for the bot’s first read.</span>';
            }
        }
        if (d.reasonMeta) {
            const t = state.thinking;
            if (t) {
                const bits = [];
                if (t.confidence != null) bits.push('confidence ' + Number(t.confidence).toFixed(0) + '%');
                if (t.regime) bits.push('regime ' + esc(t.regime));
                if (t.ts) {
                    bits.push(new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                }
                d.reasonMeta.textContent = bits.join('  ·  ');
            } else {
                d.reasonMeta.textContent = '';
            }
        }
    }

    // ─── Event Handlers (real events only) ──────────────────────────────
    function onStateUpdate(msg) {
        const s = msg && msg.state ? msg.state : null;
        if (!s) return;
        state.account = s;
        state.lastMsgAt = Date.now();
        render();
        tickFreshness();
    }

    function onAssetSwitched(msg) {
        const a = msg && msg.data ? msg.data : null;
        if (!a) return;
        state.asset = a;
        state.lastMsgAt = Date.now();
        render();
        tickFreshness();
    }

    function onBotThinking(msg) {
        if (!msg) return;
        state.thinking = {
            message: msg.message || null,
            reasoning: (msg.data && msg.data.reasoning) || null,
            confidence: msg.confidence != null ? msg.confidence
                       : (msg.data && msg.data.confidence != null ? msg.data.confidence : null),
            regime: (msg.data && msg.data.regime) || null,
            ts: msg.timestamp || Date.now()
        };
        state.lastMsgAt = Date.now();
        render();
        tickFreshness();
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                injectStyles();
                if (!mount()) return;   // no #liveReport mount point — stay inert
                render();

                (function bindSocket() {
                    const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                    if (!socket || typeof socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    socket.registerHandler('state_update',   e => { try { onStateUpdate(e); } catch (_) {} });
                    socket.registerHandler('asset_switched', e => { try { onAssetSwitched(e); } catch (_) {} });
                    socket.registerHandler('bot_thinking',   e => { try { onBotThinking(e); } catch (_) {} });
                })();

                state.freshTimer = setInterval(tickFreshness, 1000);
            } catch (_) { /* never throw from init */ }
        },
        render,
        teardown() {
            try {
                if (state.freshTimer) { clearInterval(state.freshTimer); state.freshTimer = null; }
                const s = document.getElementById(STYLE_ID);
                if (s) s.remove();
                state.mounted = false;
            } catch (_) { /* swallow */ }
        },
        _compute() {
            return {
                mounted: state.mounted,
                lastMsgAt: state.lastMsgAt,
                hasAsset: !!state.asset,
                hasAccount: !!state.account,
                hasThinking: !!state.thinking
            };
        }
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('LiveReport', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('LiveReport', api);
            }
        });
    }

    try { window.OGZLiveReport = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
