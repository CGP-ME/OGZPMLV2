/**
 * custom-alerts.js - CustomAlerts: 5-priority alert dispatcher + UI
 *
 * The spine of the celebration / emotional layer. Subscribes to bot trade
 * events and StateManager updates, classifies each event into one of five
 * priorities (info/warning/critical/victory/roast), and emits both a visual
 * toast in the top-right corner AND an OGZ.bus event that downstream
 * celebration modules (VictoryAnimations, LossRecovery, MilestoneEffects)
 * can react to.
 *
 * Single source of truth for "trade fired" classification on the dashboard.
 *
 * Self-registers as OGZ.CustomAlerts via OGZ.register().
 * Self-injects CSS and DOM mount into <body>.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'trade' (OrderExecutor): { type, action, direction, price, pnl,
 *     timestamp, confidence, duration? }
 *     - BUY / SELL_SHORT     -> info  (entry)
 *     - SELL  with pnl > 0   -> victory (long win)
 *     - SELL  with pnl < 0   -> roast / critical depending on streak
 *     - COVER with pnl > 0   -> victory (short win)
 *     - COVER with pnl < 0   -> roast / critical
 *   - 'state_update' (StateManager): tracks tradeCount for win/loss streak
 *     and recoveryMode -> warning
 *
 * Emits OGZ.bus events (downstream celebration modules subscribe to these):
 *   - 'celebration:win'  { pnl, direction, price, timestamp, streakWin }
 *   - 'celebration:loss' { pnl, direction, price, timestamp, streakLoss }
 *   - 'celebration:milestone' { equity }          (from state_update)
 *   - 'celebration:alert' { type, message, ts }   (every alert fires this)
 *
 * Public API:
 *   init() - mount, inject styles, wire socket
 *   createAlert(message, type, options) - manually create an alert
 *   getAlerts() - Array of recent alerts
 *   clearAll() - empty the toast stack
 *   teardown() - full cleanup
 *   _compute() - debug snapshot
 *
 * NO synthetic alerts. NO Math.random. Every alert is driven by a real
 * bot-side broadcast. If nothing fires, nothing shows.
 *
 * @module public/js/panels/custom-alerts
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-custom-alerts-styles';
    const ROOT_ID = 'ogzCustomAlertsRoot';
    const MAX_ALERTS_VISIBLE = 5;          // stack cap on screen
    const MAX_ALERTS_MEMORY = 50;          // history retention in state
    const TOAST_DURATION_MS = {
        info: 3500,
        warning: 6000,
        critical: 8000,
        victory: 5000,
        roast: 5000
    };

    // 5 priority definitions — icon / color / sound key for downstream
    const PRIORITIES = {
        info:     { icon: 'ℹ',  color: '#17a2b8', label: 'INFO' },
        warning:  { icon: '⚠',  color: '#ffc107', label: 'WARN' },
        critical: { icon: '⛔', color: '#dc3545', label: 'CRIT' },
        victory:  { icon: '🎉', color: '#28a745', label: 'WIN'  },
        roast:    { icon: '🔥', color: '#ff6b6b', label: 'L'    }
    };

    // Streak thresholds - switch from roast to encouragement at 3+
    const STREAK_ROAST_LIMIT = 2;

    // ─── Module State ───────────────────────────────────────────────────
    const state = {
        mounted: false,
        alerts: [],                 // history of recent alerts
        domRefs: { root: null },
        streakWin: 0,
        streakLoss: 0,
        lastTradeCount: 0,
        lastEquity: 0,
        lastRecoveryMode: false
    };

    // ─── Event Bus Shim ─────────────────────────────────────────────────
    function ensureEventBus() {
        if (OGZ && OGZ.bus) return;
        const listeners = new Map();
        OGZ.bus = {
            on(event, h) {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event).push(h);
            },
            off(event, h) {
                if (!listeners.has(event)) return;
                const l = listeners.get(event);
                const i = l.indexOf(h);
                if (i >= 0) l.splice(i, 1);
            },
            emit(event, data) {
                if (!listeners.has(event)) return;
                listeners.get(event).forEach(h => {
                    try { h(data); } catch (_) { /* swallow */ }
                });
            }
        };
    }

    // ─── CSS Injection ──────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                position: fixed;
                top: 80px;
                right: 16px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 9500;
                pointer-events: none;
                max-width: 360px;
                font-family: 'JetBrains Mono', monospace;
            }
            .oca-toast {
                pointer-events: auto;
                background: rgba(15, 15, 22, 0.94);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-left-width: 3px;
                border-radius: 6px;
                padding: 10px 14px;
                color: #e6e6e6;
                font-size: 12px;
                line-height: 1.4;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45),
                            0 0 0 1px rgba(255, 255, 255, 0.02) inset;
                backdrop-filter: blur(8px) saturate(160%);
                opacity: 0;
                transform: translateX(20px);
                transition: opacity 200ms ease, transform 200ms ease;
                display: flex;
                gap: 10px;
                align-items: flex-start;
            }
            .oca-toast.show { opacity: 1; transform: translateX(0); }
            .oca-toast.dismissing { opacity: 0; transform: translateX(20px); }
            .oca-toast.info     { border-left-color: #17a2b8; }
            .oca-toast.warning  { border-left-color: #ffc107; }
            .oca-toast.critical { border-left-color: #dc3545; }
            .oca-toast.victory  {
                border-left-color: #28a745;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45),
                            0 0 18px rgba(34, 197, 94, 0.25);
            }
            .oca-toast.roast    {
                border-left-color: #ff6b6b;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45),
                            0 0 18px rgba(255, 107, 107, 0.18);
            }
            .oca-icon {
                font-size: 16px;
                line-height: 1;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .oca-body {
                flex: 1;
                min-width: 0;
            }
            .oca-label {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1px;
                opacity: 0.65;
                margin-bottom: 2px;
            }
            .oca-msg {
                font-weight: 500;
                word-break: break-word;
            }
            .oca-time {
                font-size: 9px;
                opacity: 0.45;
                margin-top: 4px;
                font-feature-settings: "tnum";
            }
            .oca-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.45);
                font-size: 14px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                transition: color 150ms;
            }
            .oca-close:hover { color: rgba(255, 255, 255, 0.85); }

            @media (prefers-reduced-motion: reduce) {
                .oca-toast { transition: opacity 100ms; transform: none !important; }
            }
        `;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── DOM Mount ──────────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        state.domRefs.root = root;
        state.mounted = true;
        return true;
    }

    // ─── Toast Render ───────────────────────────────────────────────────
    function renderToast(alert) {
        if (!state.domRefs.root) return;
        const prio = PRIORITIES[alert.type] || PRIORITIES.info;
        const el = document.createElement('div');
        el.className = `oca-toast ${alert.type}`;
        el.dataset.alertId = alert.id;

        const icon = document.createElement('span');
        icon.className = 'oca-icon';
        icon.textContent = prio.icon;

        const body = document.createElement('div');
        body.className = 'oca-body';

        const label = document.createElement('div');
        label.className = 'oca-label';
        label.textContent = prio.label;

        const msg = document.createElement('div');
        msg.className = 'oca-msg';
        msg.textContent = alert.message;

        const time = document.createElement('div');
        time.className = 'oca-time';
        time.textContent = formatTime(alert.timestamp);

        body.appendChild(label);
        body.appendChild(msg);
        body.appendChild(time);

        const close = document.createElement('button');
        close.className = 'oca-close';
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = '×';
        close.addEventListener('click', () => dismiss(el));

        el.appendChild(icon);
        el.appendChild(body);
        el.appendChild(close);

        // Insert at top; cap visible stack
        state.domRefs.root.insertBefore(el, state.domRefs.root.firstChild);
        const visible = state.domRefs.root.querySelectorAll('.oca-toast');
        if (visible.length > MAX_ALERTS_VISIBLE) {
            for (let i = MAX_ALERTS_VISIBLE; i < visible.length; i++) {
                dismiss(visible[i]);
            }
        }

        // Animate in next frame
        requestAnimationFrame(() => el.classList.add('show'));

        // Auto-dismiss
        const duration = TOAST_DURATION_MS[alert.type] || TOAST_DURATION_MS.info;
        setTimeout(() => dismiss(el), duration);
    }

    function dismiss(el) {
        if (!el || el.classList.contains('dismissing')) return;
        el.classList.add('dismissing');
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 250);
    }

    function formatTime(ts) {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    // ─── Core: createAlert (public + internal entry point) ──────────────
    function createAlert(message, type, options) {
        if (!message || !type || !PRIORITIES[type]) return null;
        const alert = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            message: String(message),
            type: type,
            timestamp: Date.now(),
            metadata: (options && options.metadata) || {}
        };
        state.alerts.unshift(alert);
        if (state.alerts.length > MAX_ALERTS_MEMORY) state.alerts.length = MAX_ALERTS_MEMORY;

        renderToast(alert);

        // Broadcast to other modules
        if (OGZ.bus) {
            OGZ.bus.emit('celebration:alert', {
                type: alert.type,
                message: alert.message,
                ts: alert.timestamp,
                metadata: alert.metadata
            });
        }
        return alert;
    }

    // ─── Trade Classification ───────────────────────────────────────────
    // Bot 'trade' event:
    //   { type:'trade', action:'BUY'|'SELL'|'SELL_SHORT'|'COVER',
    //     direction:'long'|'short', price, pnl, timestamp, confidence, duration? }
    function handleTrade(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data || !data.action) return;
            const action = String(data.action).toUpperCase();
            const pnl    = Number(data.pnl) || 0;
            const price  = Number(data.price) || 0;
            const dir    = String(data.direction || (action === 'BUY' ? 'long' : 'short')).toLowerCase();
            const ts     = Number(data.timestamp) || Date.now();

            const isEntry = action === 'BUY' || action === 'SELL_SHORT';
            const isClose = action === 'SELL' || action === 'COVER';

            if (isEntry) {
                createAlert(
                    `${dir === 'short' ? 'SHORT' : 'LONG'} entered @ $${price.toFixed(2)}` +
                    (data.confidence != null ? ` · conf ${Number(data.confidence).toFixed(0)}%` : ''),
                    'info',
                    { metadata: { action, dir, price, ts } }
                );
                return;
            }

            if (isClose) {
                const win = pnl > 0;
                const loss = pnl < 0;
                if (win) {
                    state.streakWin++;
                    state.streakLoss = 0;
                    const sign = pnl >= 0 ? '+' : '';
                    createAlert(
                        `${dir === 'short' ? 'COVER' : 'SELL'} @ $${price.toFixed(2)} · ${sign}$${pnl.toFixed(2)}` +
                        (state.streakWin > 1 ? ` · ${state.streakWin}W streak` : ''),
                        'victory',
                        { metadata: { action, dir, price, pnl, ts, streak: state.streakWin } }
                    );
                    if (OGZ.bus) {
                        OGZ.bus.emit('celebration:win', {
                            pnl, direction: dir, price, timestamp: ts, streakWin: state.streakWin
                        });
                    }
                } else if (loss) {
                    state.streakLoss++;
                    state.streakWin = 0;
                    const type = state.streakLoss > STREAK_ROAST_LIMIT ? 'critical' : 'roast';
                    createAlert(
                        `${dir === 'short' ? 'COVER' : 'SELL'} @ $${price.toFixed(2)} · -$${Math.abs(pnl).toFixed(2)}` +
                        (state.streakLoss > 1 ? ` · ${state.streakLoss}L streak` : ''),
                        type,
                        { metadata: { action, dir, price, pnl, ts, streak: state.streakLoss } }
                    );
                    if (OGZ.bus) {
                        OGZ.bus.emit('celebration:loss', {
                            pnl, direction: dir, price, timestamp: ts, streakLoss: state.streakLoss
                        });
                    }
                } else {
                    // pnl == 0: scratch / break-even close
                    createAlert(
                        `${dir === 'short' ? 'COVER' : 'SELL'} @ $${price.toFixed(2)} · break-even`,
                        'info',
                        { metadata: { action, dir, price, pnl: 0, ts } }
                    );
                }
            }
        } catch (_) { /* swallow */ }
    }

    // ─── State Update - recoveryMode warnings + equity for milestones ──
    function handleStateUpdate(d) {
        try {
            const s = (d && d.state) ? d.state : null;
            if (!s) return;
            const equity = Number(s.equity) || 0;
            const recovery = !!s.recoveryMode;

            // Recovery-mode entry warning (fires once on edge)
            if (recovery && !state.lastRecoveryMode) {
                createAlert(
                    'Recovery mode active - bot self-throttled after drawdown',
                    'warning',
                    { metadata: { reason: 'recoveryMode' } }
                );
            }
            state.lastRecoveryMode = recovery;
            state.lastEquity = equity;

            // Forward to milestone module (it owns tier decisions)
            if (OGZ.bus && equity > 0) {
                OGZ.bus.emit('celebration:milestone', { equity });
            }
        } catch (_) { /* swallow */ }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                ensureEventBus();
                injectStyles();
                if (!mount()) return;

                // Bind socket — poll until ready
                (function bindSocket() {
                    const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                    if (!socket || typeof socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    socket.registerHandler('trade',        (e) => { try { handleTrade(e); } catch (_) {} });
                    socket.registerHandler('state_update', (e) => { try { handleStateUpdate(e); } catch (_) {} });
                })();
            } catch (_) { /* swallow */ }
        },

        createAlert,
        getAlerts: () => state.alerts.slice(),
        clearAll() {
            state.alerts.length = 0;
            if (state.domRefs.root) state.domRefs.root.innerHTML = '';
        },
        teardown() {
            this.clearAll();
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();
            const root = document.getElementById(ROOT_ID);
            if (root) root.remove();
            state.mounted = false;
            state.domRefs.root = null;
        },
        _compute() {
            return {
                mounted: state.mounted,
                alertsInMemory: state.alerts.length,
                streakWin: state.streakWin,
                streakLoss: state.streakLoss,
                lastEquity: state.lastEquity,
                lastRecoveryMode: state.lastRecoveryMode
            };
        }
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('CustomAlerts', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('CustomAlerts', api);
            }
        });
    }

    try { window.OGZCustomAlerts = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
