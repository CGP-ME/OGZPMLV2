/**
 * live-report.js — LiveReport: Gate H operator/customer live trade report
 *
 * Covers Gate H plan commits 4, 5, 6, 7. Renders, fed ONLY by verified real
 * events (no synthetic data, no hydration defaults, no fake trades):
 *
 *   - Context strip  → active symbol / timeframe / account (asset_switched)
 *   - Data freshness → live / Ns ago / STALE clock from message arrival
 *   - Account state  → position / balance / realized PnL / trades / mode
 *                       (state_update)
 *   - Latest bot read → bot_thinking message + reasoning + confidence + regime
 *                       + winning strategy (commit 6)
 *   - Today scoreboard → today's trades / today's P&L / win rate / streak
 *                        (journal_snapshot)
 *   - Recent closed trades (commit 5) → append-only list of the last ~12
 *     closed trades from journal_snapshot.recentTrades; new trades prepend
 *     in real time via trade_closed_replay; each row carries direction,
 *     entry→exit, hold, P&L, exit reason — every field a real backend value.
 *   - New-trade flash (commit 7) → the freshly-prepended row briefly glows
 *     when trade_closed_replay arrives, motion-gated for reduced-motion.
 *
 * Mount contract: renders into <div id="liveReport"></div>. If no docked mount
 * point exists the module renders NOTHING (no floating fallback — the
 * goal-tracker overlay mistake is not repeated). Operator/customer aware via
 * localStorage 'ogz.profile'. Reduced-motion safe.
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
    const FRESH_LIVE_MS   = 8000;
    const FRESH_RECENT_MS = 20000;
    const MAX_TRADE_ROWS  = 12;
    const FLASH_MS        = 1200;
    const TRACE_EVENTS_FOR_REPORT = new Set([
        'ANALYSIS_SKIP',
        'ANALYSIS_START',
        'ACTIVE_CANDLE_AGGREGATE_REJECTED',
        'ACTIVE_CANDLE_AGGREGATED',
        'ACTIVE_CANDLE_SOURCE_BACKFILLED',
        'ACTIVE_CANDLE_SOURCE_BACKFILL_REQUESTED',
        'BROKER_ORDER_REQUEST',
        'BROKER_ORDER_RESULT',
        'BOOT_REST_HYDRATION_CANDLE',
        'CANDLE_ACCEPTED',
        'CANDLE_INGRESS',
        'CANDLE_NORMALIZED',
        'CANDLE_PROCESSOR_RECEIVED',
        'CANDLE_SCOPE_REJECTED',
        'DECISION_SKIP',
        'EVAL_RULE_CHECK',
        'EXECUTE_HANDOFF',
        'EXECUTE_RETURN',
        'EXIT_ONLY_START',
        'GAP_BACKFILL_REPLAY',
        'ORDER_BLOCKED',
        'ORDER_ACCEPTED_OUTSIDE_SHARE_RANGE',
        'ORDER_EXCEPTION',
        'ORDER_EXECUTE_START',
        'ORDER_PLAN',
        'REST_RECOVERY_SCOPE_REJECTED',
        'STATE_MUTATION',
        'STRATEGY_DECISION',
        'LIVENESS_REST_BACKFILL_CANDLE',
        'TRACE_SCHEMA_ERROR',
        'TRADING_CYCLE_TRIGGER',
        'TTP_CONSISTENCY_CHECK',
        'WEBHOOK_ORDER_DISPATCH',
        'WEBHOOK_ORDER_RESULT'
    ]);

    const IS_OPERATOR = (function () {
        try { return localStorage.getItem('ogz.profile') === 'operator'; }
        catch (_) { return false; }
    })();

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        mounted: false,
        lastMsgAt: 0,
        asset: null,        // { label, base, broker, assetClass }
        account: null,      // state_update .state
        thinking: null,     // { message, reasoning, confidence, regime, winner, ts }
        trace: null,        // latest operator-relevant trace_event payload
        journal: null,      // headline stats from journal_snapshot.data
        recentTrades: [],   // newest-first; rows shaped below
        domRefs: {},
        freshTimer: null,
        replayClickBound: false,
        replayClickHandler: null
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
        const sign = v > 0 ? '+' : v < 0 ? '-' : '';
        return sign + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtPct(n, digits) {
        const v = Number(n);
        if (!isFinite(v)) return '—';
        return v.toFixed(digits == null ? 1 : digits) + '%';
    }
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
        const el = document.getElementById('cp-timeframeSelector');
        return (el && el.value) ? el.value : '—';
    }
    function shortTime(ts) {
        if (!ts) return '';
        const ms = timestampMs(ts);
        if (ms == null) return '';
        try {
            return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) { return ''; }
    }
    function timestampMs(ts) {
        if (ts == null || ts === '') return null;
        const n = Number(ts);
        if (Number.isFinite(n)) return n;
        const parsed = Date.parse(String(ts));
        return Number.isFinite(parsed) ? parsed : null;
    }
    function ageText(ms) {
        const n = Math.max(0, Number(ms) || 0);
        if (n < 60000) return Math.round(n / 1000) + 's';
        if (n < 3600000) return Math.round(n / 60000) + 'm';
        return (n / 3600000).toFixed(1).replace(/\.0$/, '') + 'h';
    }
    function finiteNumber(v) {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function eventText(v) {
        if (v == null || v === '') return null;
        const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
        if (!s) return null;
        return s.length > 240 ? s.slice(0, 237) + '...' : s;
    }
    function normalizedTraceEventName(v) {
        const s = eventText(v);
        return s ? s.toUpperCase() : null;
    }
    function pctText(v) {
        const n = finiteNumber(v);
        if (n == null) return null;
        const text = Math.abs(n) > 0 && Math.abs(n) < 1
            ? n.toFixed(1).replace(/\.0$/, '')
            : n.toFixed(0);
        return text + '%';
    }
    function confidenceText(value, explicitPct) {
        const n = finiteNumber(value);
        if (n == null) return 'invalid';
        const pct = explicitPct ? n : (Math.abs(n) <= 1 ? n * 100 : n);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'invalid';
        return pctText(pct);
    }
    function traceFieldKeys(fields) {
        if (!fields || typeof fields !== 'object') return [];
        return Object.keys(fields)
            .map(eventText)
            .filter(Boolean)
            .sort()
            .slice(0, 12);
    }
    function firstValue() {
        for (let i = 0; i < arguments.length; i++) {
            if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
                return arguments[i];
            }
        }
        return null;
    }
    function normalizeOutcome(v) {
        const s = String(v || '').trim().toLowerCase();
        return ['win', 'loss', 'flat', 'unverified'].includes(s) ? s : null;
    }
    function validPrice(v) {
        const n = finiteNumber(v);
        return n != null && n > 0 ? n : null;
    }
    function formatHoldTime(raw) {
        if (typeof raw === 'string' && raw.trim()) return raw;
        const n = finiteNumber(raw);
        if (n == null || n <= 0) return null;
        if (n < 60000) return `${Math.max(1, Math.round(n / 1000))}s`;
        if (n < 3600000) return `${Math.round(n / 60000)}m`;
        return `${(n / 3600000).toFixed(1)}h`;
    }
    function tradeKey(t) {
        if (!t) return '';
        if (t.orderId != null && String(t.orderId) !== '') return 'id:' + String(t.orderId);
        return [
            t.timestamp || '',
            t.direction || '',
            t.entryPrice || '',
            t.exitPrice || '',
            t.netPnl || ''
        ].join('|');
    }
    function renderTraceMeta() {
        const d = state.domRefs;
        if (!d.traceMeta) return;
        const t = state.trace;
        if (!t) {
            d.traceMeta.textContent = '';
            return;
        }
        const now = Date.now();
        const meta = Array.isArray(t.metaParts) ? t.metaParts.slice() : [];
        if (t.receivedAt != null) meta.push('received ' + ageText(now - t.receivedAt) + ' ago');
        if (t.eventAt != null) {
            const eventAge = now - t.eventAt;
            meta.push((eventAge > FRESH_RECENT_MS ? 'trace stale ' : 'trace age ') + ageText(eventAge));
        } else {
            meta.push('trace time unavailable');
        }
        if (t.actionRequired) {
            meta.push(t.actionRequired);
        } else if (t.knownEvent === false) {
            meta.push('action required add trace vocabulary');
        }
        d.traceMeta.textContent = meta.join('  ·  ');
    }
    function socketHandler(name, fn) {
        return function (event) {
            try {
                fn(event);
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                const safeMessage = eventText(message) || 'trace handler threw without message';
                console.warn('[LiveReport] socket handler failed for ' + name + ': ' + safeMessage);
                if (name === 'trace_event') {
                    state.trace = {
                        summary: 'TRACE_HANDLER_ERROR | handler trace_event failed',
                        metaParts: ['error ' + safeMessage],
                        actionRequired: 'action required inspect trace handler',
                        receivedAt: Date.now(),
                        eventAt: null,
                        knownEvent: false
                    };
                    state.lastMsgAt = Date.now();
                    render();
                    tickFreshness();
                }
            }
        };
    }
    function dirClass(d) {
        const u = String(d || '').toUpperCase();
        if (u === 'LONG' || u === 'BUY')   return { text: 'LONG',  cls: 'lr-long'  };
        if (u === 'SHORT'|| u === 'SELL_SHORT' || u === 'SELL' || u === 'COVER') {
            return u === 'SELL' || u === 'COVER' ? { text: 'EXIT', cls: 'lr-flat' }
                                                  : { text: 'SHORT', cls: 'lr-short' };
        }
        return { text: u || '—', cls: '' };
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
            #${ROOT_ID} .lr-cell .lr-k,
            #${ROOT_ID} .lr-stat .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 2px;
            }
            #${ROOT_ID} .lr-cell .lr-v,
            #${ROOT_ID} .lr-stat .lr-v {
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
            #${ROOT_ID} .lr-trace {
                margin-top: 8px;
                background: rgba(255, 255, 255, 0.025);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px; padding: 8px 10px;
            }
            #${ROOT_ID} .lr-reason .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 4px;
            }
            #${ROOT_ID} .lr-trace .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 4px;
            }
            #${ROOT_ID} .lr-reason .lr-msg {
                font-size: 12px; line-height: 1.5; color: #d1d4dc;
            }
            #${ROOT_ID} .lr-trace .lr-msg {
                font-size: 11px; line-height: 1.45; color: #d1d4dc;
                word-break: break-word;
            }
            #${ROOT_ID} .lr-reason .lr-meta {
                font-size: 10px; color: #71717a; margin-top: 5px;
            }
            #${ROOT_ID} .lr-trace .lr-meta {
                font-size: 10px; color: #71717a; margin-top: 5px;
                word-break: break-word;
            }
            #${ROOT_ID} .lr-empty { color: #52525b; font-style: italic; }

            /* Today scoreboard (commit 5 headline) */
            #${ROOT_ID} .lr-stats-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                gap: 8px 14px;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
            }

            /* Recent closed trades (commits 5 + 7) */
            #${ROOT_ID} .lr-trades { margin-top: 10px; }
            #${ROOT_ID} .lr-trades-head {
                font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
                color: #71717a; margin-bottom: 6px;
                display: flex; align-items: center; justify-content: space-between;
            }
            #${ROOT_ID} .lr-trades-body {
                display: flex; flex-direction: column; gap: 4px;
            }
            #${ROOT_ID} .lr-tr {
                display: grid;
                grid-template-columns: 56px 56px minmax(0, 1fr) 60px 86px minmax(0, 1.4fr);
                gap: 8px; align-items: center;
                padding: 5px 8px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                font-size: 11px;
            }
            #${ROOT_ID} .lr-tr.win  { border-left: 2px solid #22c55e; }
            #${ROOT_ID} .lr-tr.loss { border-left: 2px solid #ef4444; }
            #${ROOT_ID} .lr-tr-clickable {
                cursor: pointer;
                transition: background-color 120ms ease, border-color 120ms ease;
            }
            #${ROOT_ID} .lr-tr-clickable:hover {
                background: rgba(255, 215, 0, 0.06);
                border-color: rgba(255, 215, 0, 0.25);
            }
            #${ROOT_ID} .lr-tr-time { color: #71717a; font-size: 10px; }
            #${ROOT_ID} .lr-tr-dir  { font-weight: 700; font-size: 10px; letter-spacing: 0.06em; }
            #${ROOT_ID} .lr-tr-dir.lr-long  { color: #22c55e; }
            #${ROOT_ID} .lr-tr-dir.lr-short { color: #ef4444; }
            #${ROOT_ID} .lr-tr-px   { color: #d1d4dc; font-family: 'JetBrains Mono', monospace; }
            #${ROOT_ID} .lr-tr-hold { color: #a1a1aa; font-size: 10px; }
            #${ROOT_ID} .lr-tr-pnl  { font-weight: 700; }
            #${ROOT_ID} .lr-tr-pnl.pos { color: #22c55e; }
            #${ROOT_ID} .lr-tr-pnl.neg { color: #ef4444; }
            #${ROOT_ID} .lr-tr-reason {
                color: #a1a1aa; font-size: 10px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }

            /* New-trade flash (commit 7) — motion-gated below */
            #${ROOT_ID} .lr-tr.lr-flash {
                animation: lr-flash-kf ${FLASH_MS}ms ease-out 1;
                box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.45),
                            0 0 14px rgba(255, 215, 0, 0.35);
            }
            @keyframes lr-flash-kf {
                0%   { background: rgba(255, 215, 0, 0.22); }
                100% { background: rgba(255, 255, 255, 0.02); }
            }
            @media (prefers-reduced-motion: reduce) {
                #${ROOT_ID} .lr-tr.lr-flash {
                    animation: none;
                    box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.35);
                }
            }
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
        if (!root) return false;
        root.innerHTML = `
            <div class="lr-head">
                <span class="lr-title">Live Trade Report</span>
                <span class="lr-fresh" data-k="fresh">awaiting feed</span>
            </div>
            <div class="lr-grid">
                <div class="lr-cell"><div class="lr-k">Symbol</div><div class="lr-v" data-k="symbol">—</div></div>
                <div class="lr-cell"><div class="lr-k">Timeframe</div><div class="lr-v" data-k="tf">—</div></div>
                <div class="lr-cell"><div class="lr-k">Account</div><div class="lr-v" data-k="account">—</div></div>
                <div class="lr-cell"><div class="lr-k">Position</div><div class="lr-v" data-k="position">—</div></div>
                <div class="lr-cell"><div class="lr-k">Balance</div><div class="lr-v" data-k="balance">—</div></div>
                <div class="lr-cell"><div class="lr-k">Realized P&L (lifetime)</div><div class="lr-v" data-k="realized">—</div></div>
                <div class="lr-cell"><div class="lr-k">Trades (lifetime)</div><div class="lr-v" data-k="trades">—</div></div>
                <div class="lr-cell"><div class="lr-k">Mode</div><div class="lr-v" data-k="mode">—</div></div>
            </div>
            <div class="lr-reason">
                <div class="lr-k">Latest bot reasoning</div>
                <div class="lr-msg" data-k="reason"><span class="lr-empty">No signal yet — waiting for the bot's first read.</span></div>
                <div class="lr-meta" data-k="reasonMeta"></div>
            </div>
            <div class="lr-trace">
                <div class="lr-k">Latest pipeline trace</div>
                <div class="lr-msg" data-k="trace"><span class="lr-empty">Waiting for first trace_event frame.</span></div>
                <div class="lr-meta" data-k="traceMeta"></div>
            </div>
            <div class="lr-stats-row">
                <div class="lr-stat"><div class="lr-k">Today Trades</div><div class="lr-v" data-k="todayTrades">—</div></div>
                <div class="lr-stat"><div class="lr-k">Today P&L</div><div class="lr-v" data-k="todayPnl">—</div></div>
                <div class="lr-stat"><div class="lr-k">Today Win Rate</div><div class="lr-v" data-k="todayWR">—</div></div>
                <div class="lr-stat"><div class="lr-k">Streak</div><div class="lr-v" data-k="streak">—</div></div>
            </div>
            <div class="lr-trades">
                <div class="lr-trades-head">
                    <span>Recent closed trades</span>
                    <span data-k="tradesMeta"></span>
                </div>
                <div class="lr-trades-body" data-k="tradeList">
                    <div class="lr-empty">No closed trades this session yet.</div>
                </div>
            </div>
        `;
        const q = sel => root.querySelector(sel);
        state.domRefs = {
            fresh:       q('[data-k="fresh"]'),
            symbol:      q('[data-k="symbol"]'),
            tf:          q('[data-k="tf"]'),
            account:     q('[data-k="account"]'),
            position:    q('[data-k="position"]'),
            balance:     q('[data-k="balance"]'),
            realized:    q('[data-k="realized"]'),
            trades:      q('[data-k="trades"]'),
            mode:        q('[data-k="mode"]'),
            reason:      q('[data-k="reason"]'),
            reasonMeta:  q('[data-k="reasonMeta"]'),
            trace:       q('[data-k="trace"]'),
            traceMeta:   q('[data-k="traceMeta"]'),
            todayTrades: q('[data-k="todayTrades"]'),
            todayPnl:    q('[data-k="todayPnl"]'),
            todayWR:     q('[data-k="todayWR"]'),
            streak:      q('[data-k="streak"]'),
            tradesMeta:  q('[data-k="tradesMeta"]'),
            tradeList:   q('[data-k="tradeList"]')
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
        renderTraceMeta();
    }

    // ─── Render: quiet-period view (context, account, reasoning) ────────
    function renderQuiet() {
        const d = state.domRefs;
        const acct = state.account;

        if (d.symbol) {
            d.symbol.textContent = state.asset
                ? (state.asset.label || state.asset.base || state.asset.asset || '—')
                : '—';
        }
        if (d.tf) d.tf.textContent = activeTimeframe();
        if (d.account) {
            d.account.textContent = acct && acct.accountId
                ? String(acct.accountId)
                : state.asset && state.asset.accountId
                    ? String(state.asset.accountId)
                    : '—';
        }

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
            d.mode.textContent = !acct ? '—' : (acct.recoveryMode ? 'RECOVERY' : 'NORMAL');
        }

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
                if (t.winner)            bits.push('winner ' + esc(t.winner));
                if (t.confidence != null) bits.push('confidence ' + Number(t.confidence).toFixed(0) + '%');
                if (t.regime)            bits.push('regime ' + esc(t.regime));
                if (t.ts) {
                    bits.push(new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                }
                d.reasonMeta.textContent = bits.join('  ·  ');
            } else {
                d.reasonMeta.textContent = '';
            }
        }

        if (d.trace) {
            const t = state.trace;
            if (t && t.summary) {
                d.trace.textContent = t.summary;
            } else {
                d.trace.innerHTML = '<span class="lr-empty">Waiting for first trace_event frame.</span>';
            }
        }
        if (d.traceMeta) {
            renderTraceMeta();
        }
    }

    // ─── Render: today scoreboard from journal_snapshot ─────────────────
    function renderStats() {
        const d = state.domRefs;
        const j = state.journal;
        if (d.todayTrades) d.todayTrades.textContent = j && j.todayTrades != null ? String(j.todayTrades) : '—';
        if (d.todayPnl) {
            if (j && j.todayPnl != null) {
                const v = Number(j.todayPnl);
                d.todayPnl.textContent = fmtSignedMoney(v);
                d.todayPnl.className = 'lr-v ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
            } else {
                d.todayPnl.textContent = '—';
                d.todayPnl.className = 'lr-v';
            }
        }
        if (d.todayWR) {
            d.todayWR.textContent = j && j.todayWinRate != null ? fmtPct(j.todayWinRate) : '—';
        }
        if (d.streak) {
            if (j && j.currentStreak != null) {
                const type = j.currentStreakType || '';
                const n = Math.abs(j.currentStreak);
                if (n === 0) {
                    d.streak.textContent = '—';
                    d.streak.className = 'lr-v';
                } else {
                    const isWin = /^win/i.test(type) || j.currentStreak > 0;
                    d.streak.textContent = `${n}${isWin ? 'W' : 'L'}`;
                    d.streak.className = 'lr-v ' + (isWin ? 'pos' : 'neg');
                }
            } else {
                d.streak.textContent = '—';
                d.streak.className = 'lr-v';
            }
        }
    }

    // ─── Render: recent closed trades ───────────────────────────────────
    function renderTrades(flashOrderId) {
        const d = state.domRefs;
        if (!d.tradeList) return;
        if (d.tradesMeta) {
            const total = state.journal && state.journal.totalTrades != null
                ? state.journal.totalTrades : state.recentTrades.length;
            d.tradesMeta.textContent = state.recentTrades.length
                ? `last ${state.recentTrades.length} of ${total}`
                : '';
        }
        if (!state.recentTrades.length) {
            d.tradeList.innerHTML = '<div class="lr-empty">No closed trades this session yet.</div>';
            return;
        }
        const frag = document.createDocumentFragment();
        for (const t of state.recentTrades) {
            const row = document.createElement('div');
            const key = tradeKey(t);
            const pnl = finiteNumber(t.netPnl);
            const outcome = normalizeOutcome(t.outcome);
            const isWin = outcome ? outcome === 'win' : pnl != null && pnl > 0;
            const isLoss = outcome ? outcome === 'loss' : pnl != null && pnl < 0;
            row.className = 'lr-tr' + (isWin ? ' win' : isLoss ? ' loss' : '');
            row.classList.add('lr-tr-clickable');
            row.dataset.tradeKey = key;
            if (t.orderId != null && String(t.orderId) !== '') row.dataset.orderId = String(t.orderId);
            if (t.timestamp != null && String(t.timestamp) !== '') row.dataset.ts = String(t.timestamp);
            if (t.symbol != null && String(t.symbol) !== '') row.dataset.symbol = String(t.symbol);
            row.title = 'Click to open trade replay';
            if (flashOrderId && key === flashOrderId) row.classList.add('lr-flash');

            const dir = dirClass(t.direction);

            const time = document.createElement('span');
            time.className = 'lr-tr-time';
            time.textContent = shortTime(t.timestamp);

            const dirEl = document.createElement('span');
            dirEl.className = 'lr-tr-dir ' + dir.cls;
            dirEl.textContent = dir.text;

            const px = document.createElement('span');
            px.className = 'lr-tr-px';
            const ep = validPrice(t.entryPrice), xp = validPrice(t.exitPrice);
            px.textContent = (ep != null && xp != null)
                ? `${ep.toFixed(2)} → ${xp.toFixed(2)}`
                : '—';

            const hold = document.createElement('span');
            hold.className = 'lr-tr-hold';
            hold.textContent = t.holdTime ? String(t.holdTime) : '—';

            const pnlEl = document.createElement('span');
            pnlEl.className = 'lr-tr-pnl ' + (isWin ? 'pos' : isLoss ? 'neg' : '');
            if (pnl != null) {
                const pct = finiteNumber(t.pnlPercent);
                const pctPart = pct != null
                    ? `  (${pct.toFixed(2)}%)`
                    : '';
                pnlEl.textContent = fmtSignedMoney(pnl) + pctPart;
            } else {
                pnlEl.textContent = '—';
            }

            const reason = document.createElement('span');
            reason.className = 'lr-tr-reason';
            reason.title = outcome === 'unverified' ? 'unverified outcome' : (t.exitReason ? String(t.exitReason) : '');
            reason.textContent = outcome === 'unverified' ? 'unverified' : (t.exitReason ? String(t.exitReason) : '');

            row.appendChild(time);
            row.appendChild(dirEl);
            row.appendChild(px);
            row.appendChild(hold);
            row.appendChild(pnlEl);
            row.appendChild(reason);
            frag.appendChild(row);
        }
        d.tradeList.innerHTML = '';
        d.tradeList.appendChild(frag);

        if (flashOrderId) {
            // strip the flash class after the animation so re-renders don't re-flash
            setTimeout(() => {
                try {
                    const flashed = d.tradeList.querySelector('.lr-tr.lr-flash');
                    if (flashed) flashed.classList.remove('lr-flash');
                } catch (_) { /* swallow */ }
            }, FLASH_MS + 80);
        }
    }

    function render(flashOrderId) {
        if (!state.mounted) return;
        renderQuiet();
        renderStats();
        renderTrades(flashOrderId);
    }

    // ─── Event handlers (real events only) ──────────────────────────────
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
        const winner = msg.winner_id
                    || (msg.winner && (msg.winner.id || msg.winner.name))
                    || null;
        state.thinking = {
            message:   msg.message || null,
            reasoning: (msg.data && msg.data.reasoning) || null,
            confidence: msg.confidence != null ? msg.confidence
                       : (msg.data && msg.data.confidence != null ? msg.data.confidence : null),
            regime:    (msg.data && msg.data.regime) || null,
            winner:    winner,
            ts:        msg.timestamp || Date.now()
        };
        state.lastMsgAt = Date.now();
        render();
        tickFreshness();
    }

    function onJournalSnapshot(msg) {
        const d = msg && msg.data ? msg.data : null;
        if (!d) return;
        state.journal = d;
        if (Array.isArray(d.recentTrades)) {
            // journal_snapshot's recentTrades are newest-first per TradeJournal.getSnapshot;
            // cap to MAX_TRADE_ROWS in case the backend changes the cap.
            state.recentTrades = d.recentTrades.slice(0, MAX_TRADE_ROWS);
        }
        state.lastMsgAt = Date.now();
        render();
        tickFreshness();
    }

    function onTradeClosedReplay(msg) {
        const d = msg && msg.data ? msg.data : null;
        if (!d) return;
        if (d.orderId == null || String(d.orderId) === '') {
            console.warn('[LiveReport] Ignoring trade_closed_replay without orderId; closed-trade rows require journal-backed identity.');
            state.lastMsgAt = Date.now();
            tickFreshness();
            return;
        }
        const row = {
            orderId:    d.orderId,
            direction:  d.direction || null,
            entryPrice: d.entryPrice,
            exitPrice:  d.exitPrice,
            netPnl:     d.pnl,
            pnlPercent: d.pnlPercent,
            outcome:    d.outcome || null,
            holdTime:   formatHoldTime(d.holdTime),
            exitReason: d.reason || null,
            confidence: null,
            regime:     null,
            timestamp:  d.timestamp || Date.now()
        };
        // Prepend, dedupe by backend id, cap.
        const rowKey = tradeKey(row);
        const filtered = state.recentTrades.filter(t => tradeKey(t) !== rowKey);
        state.recentTrades = [row, ...filtered].slice(0, MAX_TRADE_ROWS);
        state.lastMsgAt = Date.now();
        render(rowKey);
        tickFreshness();
    }

    function summarizeTraceEvent(msg) {
        if (!msg) return null;
        const fields = msg.fields && typeof msg.fields === 'object' ? msg.fields : {};
        const hasRawEventField = Object.prototype.hasOwnProperty.call(msg, 'event');
        const rawEventName = eventText(msg.event);
        const normalizedName = normalizedTraceEventName(rawEventName);
        const hasEventName = !!normalizedName;
        const knownEvent = hasEventName && TRACE_EVENTS_FOR_REPORT.has(normalizedName);
        const eventName = hasEventName
            ? (knownEvent ? normalizedName : 'UNMAPPED_TRACE_EVENT')
            : 'TRACE_SCHEMA_ERROR';
        const bits = [eventName];
        if (!hasEventName) {
            bits.push('missing required field event');
        } else if (!knownEvent) {
            bits.push('event ' + normalizedName);
            bits.push('action required add trace vocabulary');
        }

        const action = firstValue(msg.action, fields.action);
        const direction = firstValue(fields.finalDirection, fields.direction);
        const reason = firstValue(fields.reason, fields.rejectionReason, fields.noMutationReason);
        const winner = firstValue(fields.winnerStrategy, fields.winner, fields.strategy);
        const confidencePct = firstValue(fields.confidencePct, msg.confidencePct);
        const confidenceRaw = firstValue(fields.confidence, msg.confidence);
        const minConfidencePct = firstValue(fields.minConfidencePct, msg.minConfidencePct);
        const minConfidenceRaw = firstValue(fields.minConfidence, msg.minConfidence);
        const success = firstValue(fields.success);
        const sent = firstValue(fields.sent);

        if (action != null) bits.push('action ' + eventText(action));
        if (direction != null) bits.push('direction ' + eventText(direction));
        if (reason != null) bits.push('reason ' + eventText(reason));
        if (winner != null) bits.push('winner ' + eventText(winner));
        if (confidencePct != null) bits.push('confidence ' + (confidenceText(confidencePct, true) || eventText(confidencePct)));
        else if (confidenceRaw != null) bits.push('confidence ' + (confidenceText(confidenceRaw, false) || eventText(confidenceRaw)));
        if (minConfidencePct != null) bits.push('min ' + (confidenceText(minConfidencePct, true) || eventText(minConfidencePct)));
        else if (minConfidenceRaw != null) bits.push('min ' + (confidenceText(minConfidenceRaw, false) || eventText(minConfidenceRaw)));
        if (success != null) bits.push('success ' + eventText(success));
        if (sent != null) bits.push('sent ' + eventText(sent));

        const meta = [];
        const fieldKeys = traceFieldKeys(fields);
        const traceId = firstValue(msg.traceId, fields.traceId);
        const symbol = firstValue(msg.symbol, fields.symbol);
        const timeframe = firstValue(msg.timeframe, fields.timeframe);
        const broker = firstValue(msg.brokerId, fields.brokerId);
        const account = firstValue(msg.accountId, fields.accountId);
        const mode = firstValue(msg.executionMode, fields.executionMode);
        const scopeKey = firstValue(msg.scopeKey, fields.scopeKey);
        const ts = msg.timestamp || fields.timestamp || Date.now();
        const eventAt = timestampMs(ts);

        if (rawEventName && rawEventName !== normalizedName) meta.push('raw event ' + rawEventName);
        if (!hasEventName) {
            meta.push(hasRawEventField ? 'event field blank' : 'event field missing');
            meta.push('schema path trace_event.event');
        }
        if ((!hasEventName || !knownEvent) && fieldKeys.length) {
            meta.push('field keys ' + fieldKeys.join(','));
        }
        if (symbol != null) meta.push(eventText(symbol));
        if (timeframe != null) meta.push(eventText(timeframe));
        if (broker != null) meta.push('broker ' + eventText(broker));
        if (account != null) meta.push('account ' + eventText(account));
        if (mode != null) meta.push('mode ' + eventText(mode));
        if (traceId != null) meta.push('trace ' + eventText(traceId));
        if (scopeKey != null) meta.push('scope ' + eventText(scopeKey));
        if (eventAt != null) meta.push(shortTime(eventAt));

        return {
            summary: bits.join(' | '),
            metaParts: meta,
            actionRequired: !hasEventName
                ? 'action required fix trace payload schema'
                : (!knownEvent ? 'action required add trace vocabulary' : null),
            receivedAt: Date.now(),
            eventAt,
            knownEvent
        };
    }

    function onTraceEvent(msg) {
        const summarized = summarizeTraceEvent(msg);
        if (!summarized) return;
        state.trace = summarized;
        state.lastMsgAt = Date.now();
        render();
        tickFreshness();
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                injectStyles();
                if (!mount()) return;
                render();

                if (!state.replayClickBound && state.domRefs && state.domRefs.tradeList) {
                    state.replayClickHandler = (e) => {
                        try {
                            const row = e.target.closest('.lr-tr-clickable');
                            if (!row) return;

                            let trade = null;
                            const key = row.dataset.tradeKey || '';
                            const orderId = row.dataset.orderId || '';
                            const ts = row.dataset.ts || '';

                            if (key) trade = state.recentTrades.find(t => tradeKey(t) === key) || null;
                            if (!trade && orderId) trade = state.recentTrades.find(t => String(t.orderId) === orderId) || null;
                            if (!trade && ts) trade = state.recentTrades.find(t => String(t.timestamp) === ts) || null;
                            if (!trade) return;

                            const replay = OGZ && typeof OGZ.get === 'function' ? OGZ.get('TradeReplay') : null;
                            if (replay && typeof replay.openReplay === 'function') {
                                replay.openReplay(trade);
                            } else if (window.OGZTradeReplay && typeof window.OGZTradeReplay.openReplay === 'function') {
                                window.OGZTradeReplay.openReplay(trade);
                            }
                        } catch (_) { /* swallow */ }
                    };
                    state.domRefs.tradeList.addEventListener('click', state.replayClickHandler);
                    state.replayClickBound = true;
                }

                (function bindSocket() {
                    const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                    if (!socket || typeof socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    socket.registerHandler('state_update',        socketHandler('state_update', onStateUpdate));
                    socket.registerHandler('asset_switched',      socketHandler('asset_switched', onAssetSwitched));
                    socket.registerHandler('bot_thinking',        socketHandler('bot_thinking', onBotThinking));
                    socket.registerHandler('trace_event',         socketHandler('trace_event', onTraceEvent));
                    socket.registerHandler('journal_snapshot',    socketHandler('journal_snapshot', onJournalSnapshot));
                    socket.registerHandler('trade_closed_replay', socketHandler('trade_closed_replay', onTradeClosedReplay));
                })();

                state.freshTimer = setInterval(tickFreshness, 1000);
            } catch (_) { /* never throw from init */ }
        },
        render,
        teardown() {
            try {
                if (state.freshTimer) { clearInterval(state.freshTimer); state.freshTimer = null; }
                if (state.replayClickBound && state.domRefs && state.domRefs.tradeList && state.replayClickHandler) {
                    state.domRefs.tradeList.removeEventListener('click', state.replayClickHandler);
                    state.replayClickBound = false;
                    state.replayClickHandler = null;
                }
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
                hasThinking: !!state.thinking,
                hasTrace: !!state.trace,
                hasJournal: !!state.journal,
                tradeRows: state.recentTrades.length
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
