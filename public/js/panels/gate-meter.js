/**
 * gate-meter.js — GateMeter: Near-Miss / Gate Decision Panel
 *
 * Renders every `gate_event` frame the bot emits when a signal reaches risk
 * evaluation. This is the "what the bot almost did" panel: instead of dead
 * air while the bot scans, the operator sees each signal that reached the
 * gates and exactly which gate passed or blocked it.
 *
 * What it renders:
 *   - Header: "GATE METER" + live session counters (passed / blocked)
 *   - Event list (newest first, capped at MAX_EVENTS):
 *       time (HH:MM:SS ET) · symbol pill · PASS/BLOCK badge · action ·
 *       block reason · failed-gate chips (gate name + value vs threshold)
 *   - Honest empty state until the first gate_event arrives. NO demo mode,
 *     NO synthetic seed events, NO fallback data of any kind.
 *
 * Data contract (STRICT — malformed frames are rejected loudly, never guessed):
 *   Emitter: core/TradingLoop.js _broadcastGateEvent()
 *   Frame: {
 *     type: 'gate_event', timestamp: msEpoch,
 *     traceId, signalId, action, kind: 'eval_pass'|'risk_block'|'risk_check',
 *     passed: boolean, reason: string|null,
 *     riskGates: [{ gate, threshold, value, passed, rejectReason? }],
 *     symbol, brokerId, accountId, assetClass, executionMode, timeframe
 *   }
 *
 * Self-registers as OGZ.GateMeter via OGZ.register().
 * Mounts into <div id="gateMeter"></div>.
 * Styles are self-injected (STYLE_ID guard) — no external CSS dependency.
 *
 * Public API:
 *   init()      — Mount, inject styles, subscribe to gate_event
 *   clear()     — Drop buffered events + reset counters (UI reset only)
 *   getEvents() — Return a copy of the current event buffer
 *   teardown()  — Unregister handler, remove DOM + styles
 *
 * @module public/js/panels/gate-meter
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-gate-meter-styles';
    const ROOT_ID = 'gateMeter';
    const MAX_EVENTS = 20;
    const EMPTY_TEXT = 'No gate decisions yet — gates fire when a signal reaches risk evaluation.';

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        events: [],          // Newest first, validated gate events only
        passedCount: 0,
        blockedCount: 0,
        root: null,
        listEl: null,
        passCountEl: null,
        blockCountEl: null,
        registeredHandlers: [],
    };

    // ─── CSS Injection ──────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            #${ROOT_ID} {
                background: var(--bg-panel);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 10px;
                min-height: 120px;
                max-height: 320px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: 'JetBrains Mono', monospace;
            }
            #${ROOT_ID} .gm-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
                flex-shrink: 0;
            }
            #${ROOT_ID} .gm-title {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.08em;
                color: var(--text-primary);
            }
            #${ROOT_ID} .gm-counters {
                display: flex;
                gap: 8px;
                font-size: 10px;
                font-weight: 600;
            }
            #${ROOT_ID} .gm-count-pass  { color: var(--profit-color); }
            #${ROOT_ID} .gm-count-block { color: var(--loss-color); }
            #${ROOT_ID} .gm-list {
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 6px;
                min-height: 0;
            }
            #${ROOT_ID} .gm-empty {
                color: var(--text-secondary);
                font-size: 10px;
                font-weight: 300;
                padding: 12px 4px;
                text-align: center;
            }
            #${ROOT_ID} .gm-row {
                border: 1px solid var(--border-color);
                border-radius: 6px;
                padding: 6px 8px;
                font-size: 10px;
                line-height: 1.5;
                background: rgba(0, 0, 0, 0.35);
            }
            #${ROOT_ID} .gm-row.gm-pass  { border-left: 3px solid var(--profit-color); }
            #${ROOT_ID} .gm-row.gm-block { border-left: 3px solid var(--loss-color); }
            #${ROOT_ID} .gm-row-top {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            #${ROOT_ID} .gm-time {
                color: var(--text-secondary);
                font-size: 9px;
            }
            #${ROOT_ID} .gm-symbol {
                border: 1px solid var(--border-color);
                border-radius: 4px;
                padding: 0 5px;
                font-size: 9px;
                font-weight: 700;
                color: var(--core-color);
            }
            #${ROOT_ID} .gm-badge {
                border-radius: 4px;
                padding: 0 6px;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.05em;
            }
            #${ROOT_ID} .gm-badge-pass {
                color: var(--profit-color);
                border: 1px solid var(--profit-color);
            }
            #${ROOT_ID} .gm-badge-block {
                color: var(--loss-color);
                border: 1px solid var(--loss-color);
            }
            #${ROOT_ID} .gm-action {
                color: var(--text-primary);
                font-weight: 600;
                text-transform: uppercase;
            }
            #${ROOT_ID} .gm-reason {
                color: var(--text-secondary);
                margin-top: 2px;
                word-break: break-word;
            }
            #${ROOT_ID} .gm-gates {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-top: 4px;
            }
            #${ROOT_ID} .gm-gate-chip {
                border: 1px solid var(--brand-red-line);
                border-radius: 4px;
                padding: 0 5px;
                font-size: 9px;
                color: var(--loss-color);
                background: rgba(220, 38, 38, 0.08);
            }
        `;
        const styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    // ─── Validation (strict — reject loudly, never guess) ──────────────
    function validateGateEvent(frame) {
        if (!frame || frame.type !== 'gate_event') {
            return { ok: false, error: 'frame.type must be gate_event' };
        }
        if (typeof frame.passed !== 'boolean') {
            return { ok: false, error: 'frame.passed must be a boolean' };
        }
        if (!Array.isArray(frame.riskGates)) {
            return { ok: false, error: 'frame.riskGates must be an array' };
        }
        if (!Number.isFinite(Number(frame.timestamp))) {
            return { ok: false, error: 'frame.timestamp must be finite ms epoch' };
        }
        const symbol = typeof frame.symbol === 'string' ? frame.symbol.trim() : '';
        if (!symbol) {
            return { ok: false, error: 'frame.symbol missing — scoped frame contract violated' };
        }
        return { ok: true };
    }

    // ─── Rendering ──────────────────────────────────────────────────────
    function formatTime(ms) {
        return new Date(ms).toLocaleTimeString('en-US', {
            hour12: false,
            timeZone: 'America/New_York',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    }

    function formatGateChip(gate) {
        const name = typeof gate.gate === 'string' && gate.gate ? gate.gate : 'unnamed_gate';
        const hasThreshold = gate.threshold !== undefined && gate.threshold !== null;
        const hasValue = gate.value !== undefined && gate.value !== null;
        if (hasValue && hasThreshold) return `${name}: ${gate.value} / ${gate.threshold}`;
        if (typeof gate.rejectReason === 'string' && gate.rejectReason) return `${name}: ${gate.rejectReason}`;
        return name;
    }

    function renderRow(evt) {
        const row = document.createElement('div');
        row.className = `gm-row ${evt.passed ? 'gm-pass' : 'gm-block'}`;

        const top = document.createElement('div');
        top.className = 'gm-row-top';

        const time = document.createElement('span');
        time.className = 'gm-time';
        time.textContent = formatTime(evt.timestamp);
        top.appendChild(time);

        const symbol = document.createElement('span');
        symbol.className = 'gm-symbol';
        symbol.textContent = evt.symbol;
        top.appendChild(symbol);

        const badge = document.createElement('span');
        badge.className = `gm-badge ${evt.passed ? 'gm-badge-pass' : 'gm-badge-block'}`;
        badge.textContent = evt.passed ? 'PASS' : 'BLOCK';
        top.appendChild(badge);

        if (typeof evt.action === 'string' && evt.action) {
            const action = document.createElement('span');
            action.className = 'gm-action';
            action.textContent = evt.action;
            top.appendChild(action);
        }

        row.appendChild(top);

        if (!evt.passed && typeof evt.reason === 'string' && evt.reason) {
            const reason = document.createElement('div');
            reason.className = 'gm-reason';
            reason.textContent = evt.reason;
            row.appendChild(reason);
        }

        const failedGates = evt.riskGates.filter(g => g && g.passed === false);
        if (failedGates.length > 0) {
            const gates = document.createElement('div');
            gates.className = 'gm-gates';
            failedGates.forEach(g => {
                const chip = document.createElement('span');
                chip.className = 'gm-gate-chip';
                chip.textContent = formatGateChip(g);
                gates.appendChild(chip);
            });
            row.appendChild(gates);
        }

        return row;
    }

    function renderList() {
        if (!state.listEl) return;
        state.listEl.innerHTML = '';

        if (state.events.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gm-empty';
            empty.textContent = EMPTY_TEXT;
            state.listEl.appendChild(empty);
            return;
        }

        state.events.forEach(evt => state.listEl.appendChild(renderRow(evt)));
    }

    function renderCounters() {
        if (state.passCountEl) state.passCountEl.textContent = `${state.passedCount} PASS`;
        if (state.blockCountEl) state.blockCountEl.textContent = `${state.blockedCount} BLOCK`;
    }

    function renderScaffold() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;
        state.root = root;
        root.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'gm-header';

        const title = document.createElement('span');
        title.className = 'gm-title';
        title.textContent = 'GATE METER';
        header.appendChild(title);

        const counters = document.createElement('div');
        counters.className = 'gm-counters';

        const passCount = document.createElement('span');
        passCount.className = 'gm-count-pass';
        counters.appendChild(passCount);
        state.passCountEl = passCount;

        const blockCount = document.createElement('span');
        blockCount.className = 'gm-count-block';
        counters.appendChild(blockCount);
        state.blockCountEl = blockCount;

        header.appendChild(counters);
        root.appendChild(header);

        const list = document.createElement('div');
        list.className = 'gm-list';
        root.appendChild(list);
        state.listEl = list;

        renderCounters();
        renderList();
        return true;
    }

    // ─── WS Event Handler ───────────────────────────────────────────────
    function onGateEvent(frame) {
        const validation = validateGateEvent(frame);
        if (!validation.ok) {
            console.error(`[GateMeter] Rejected malformed gate_event: ${validation.error}`, frame);
            return;
        }

        const evt = {
            timestamp: Number(frame.timestamp),
            symbol: frame.symbol.trim().toUpperCase(),
            action: typeof frame.action === 'string' ? frame.action : null,
            kind: typeof frame.kind === 'string' ? frame.kind : null,
            passed: frame.passed,
            reason: typeof frame.reason === 'string' ? frame.reason : null,
            riskGates: frame.riskGates,
        };

        state.events.unshift(evt);
        if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;

        if (evt.passed) state.passedCount += 1;
        else state.blockedCount += 1;

        renderCounters();
        renderList();
    }

    // ─── Subscription helper ────────────────────────────────────────────
    function subscribe(socket, type, fn) {
        if (!socket || typeof socket.registerHandler !== 'function') {
            console.error('[GateMeter] OGZ.Socket unavailable — gate_event subscription not registered');
            return;
        }
        socket.registerHandler(type, fn);
        state.registeredHandlers.push({ type, fn });
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const GateMeter = {
        init: function () {
            if (state.mounted) return;
            injectStyles();
            if (!renderScaffold()) {
                console.error(`[GateMeter] Mount point #${ROOT_ID} not found — panel not mounted`);
                return;
            }
            state.mounted = true;

            const socket = OGZ.get && OGZ.get('Socket');
            subscribe(socket, 'gate_event', onGateEvent);
        },

        clear: function () {
            state.events.length = 0;
            state.passedCount = 0;
            state.blockedCount = 0;
            renderCounters();
            renderList();
        },

        getEvents: function () {
            return state.events.slice();
        },

        teardown: function () {
            const socket = OGZ.get && OGZ.get('Socket');
            if (socket && typeof socket.unregisterHandler === 'function') {
                state.registeredHandlers.forEach(({ type, fn }) => socket.unregisterHandler(type, fn));
            }
            state.registeredHandlers.length = 0;
            if (state.root) state.root.innerHTML = '';
            const styleEl = document.getElementById(STYLE_ID);
            if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
            state.mounted = false;
            state.root = null;
            state.listEl = null;
            state.passCountEl = null;
            state.blockCountEl = null;
        },
    };

    OGZ.register('GateMeter', GateMeter);
})(window.OGZ);
