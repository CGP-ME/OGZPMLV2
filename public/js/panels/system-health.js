/**
 * system-health.js — SystemHealth: Operator Health Strip
 *
 * Footer-right operator health visibility panel. Displays at-a-glance status for:
 * Runtime state (CRYPTO / STOCKS / FAULTED), active broker feed status,
 * real error count when an error emitter
 * exists, session uptime, Risk Posture guardrail state, and git commit hash
 * when the health endpoint provides it.
 *
 * Renders as a compact horizontal strip with segments separated by " | ":
 *   RUNTIME: ALPACA STOCKS ✓ | BROKER: ALPACA ? | LAST ERR: 3 | UPTIME: 2h 14m |
 *   RISK POSTURE: ALL GUARDRAILS ARMED ✓ | COMMIT: a07516a
 *
 * Self-registers as OGZ.SystemHealth via OGZ.register().
 * Mounts into <div id="systemHealth"></div>.
 *
 * Data sources:
 *   - HTTP fetch /api/health (every 30s) — uptime, status, timestamp, broker
 *     WS counts, memory. Backend MAY return optional: commit, errorCount fields.
 *   - WS events (real bot shapes verified against StateManager / TradingLoop /
 *     CandleProcessor):
 *     * state_update — { state:{ recoveryMode, position, balance, ... } }.
 *       Used as the heartbeat for "router is alive" + risk posture (recoveryMode
 *       flips RISK POSTURE to DEGRADED).
 *     * price        — heartbeat for the broker feed of the active symbol.
 *       Bot is single-pair → broker derived from symbol prefix.
 *     * bot_thinking — heartbeat for the trading loop being alive.
 *
 * AWAITING BACKEND EMITTERS (rendered as muted '?' with explicit 'AWAITING'
 * tooltip rather than silent fail or fake green):
 *     * error_event   — currently no top-level emitter; bot logs to console only
 *     * broker_status — currently no per-broker WS status broadcast
 *
 *   - OGZ.bus event risk:update — for risk posture state (armed / degraded)
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, start health fetch loop
 *   setHealthEndpoint(url) — Configure /api/health URL (default '/api/health')
 *   refresh() — Manually fetch /api/health now
 *   addError(msg) — Manually increment error counter + store message
 *   clearErrors() — Reset error count to 0
 *   setBroker(name, ok) — Update broker WS status (name: 'kraken'|'alpaca', ok: boolean)
 *   setRouterState(state) — Set SessionRouter state (CRYPTO / STOCKS / FAULTED)
 *   setRiskPosture(state) — Set risk posture (armed / degraded / etc)
 *   teardown() — Remove DOM, listeners, timers, injected styles
 *   _compute() — Debug helper: return current state snapshot
 *
 * NO synthetic data. NO demo fallback. If /api/health does not respond,
 * the panel renders honest placeholders ('--' / '?' / 'OFFLINE'). We
 * never fabricate green-state values.
 *
 * @typedef {Object} HealthSnapshot
 * @property {number} timestamp - Unix epoch milliseconds
 * @property {string} state - SessionRouter state (e.g., 'CRYPTO')
 * @property {number} uptime - Session uptime in seconds
 * @property {number} websockets - Count of active WebSocket connections
 * @property {Object} memory - {heapUsed: number, heapTotal: number}
 * @property {string} [commit] - Git commit hash (optional, backend gap)
 * @property {number} [errorCount] - Error count in current session (optional)
 *
 * @module public/js/panels/system-health
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-system-health-styles';
    const ROOT_ID = 'systemHealth';
    const HEALTH_FETCH_INTERVAL_MS = 30000;  // 30 seconds
    const UPTIME_TICK_MS = 1000;             // 1 second
    const DEFAULT_HEALTH_URL = '/api/health';

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        healthEndpoint: DEFAULT_HEALTH_URL,
        lastHealth: null,
        brokers: new Map(),  // Map<name, ok>
        routerState: 'OFFLINE',
        riskPosture: 'UNKNOWN',
        errors: [],
        uptimeStart: Date.now(),
        healthFetchTimer: null,
        uptimeTickTimer: null,

        // Heartbeat tracking (derived broker/router status from real events)
        lastStateUpdateAt: 0,
        lastPriceAt: 0,
        lastBotThinkingAt: 0,
        currentSymbol: null,        // resolved from runtime/price frames, not chart selector
        runtimeScope: null,         // authoritative bot/account scope from state_update
        recoveryMode: false,        // mirrored from state_update.state.recoveryMode

        // Backend-emitter availability flags. Flip true once first such event
        // is seen — until then we render '?' with AWAITING tooltip rather
        // than synthesizing a green ✓.
        haveErrorEmitter: false,
        haveBrokerEmitter: false,
    };

    // Heartbeat freshness window: an event is "fresh" if it fired in the
    // last 30 seconds. Used to decide ✓/✗/? state for derived indicators.
    const HEARTBEAT_FRESH_MS = 30000;

    // ─── CSS Injection ───────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            #${ROOT_ID} {
                background: var(--glass-bg, rgba(15, 15, 18, 0.55));
                border: 1px solid var(--glass-border, rgba(255, 215, 0, 0.18));
                border-radius: 6px;
                padding: 8px 12px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: var(--text-primary, #ffffff);
                overflow-x: auto;
                overflow-y: hidden;
                white-space: nowrap;
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                gap: 0;
                height: 32px;
                min-height: 32px;
                flex-shrink: 0;
            }

            .sh-segment {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 3px;
                border: 1px solid rgba(255, 255, 255, 0.04);
                flex-shrink: 0;
            }

            .sh-segment:hover {
                background: rgba(255, 255, 255, 0.04);
                border-color: rgba(255, 255, 255, 0.08);
            }

            .sh-separator {
                color: rgba(255, 255, 255, 0.2);
                margin: 0 2px;
                flex-shrink: 0;
            }

            .sh-label {
                color: var(--text-secondary, #a0a0a0);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                font-size: 8px;
            }

            .sh-value {
                color: var(--text-primary, #ffffff);
                font-weight: 500;
                letter-spacing: 0.3px;
            }

            .sh-indicator {
                display: inline-block;
                font-size: 9px;
                font-weight: 700;
            }

            .sh-indicator.ok {
                color: var(--profit-color, #00ff88);
            }

            .sh-indicator.fail {
                color: var(--loss-color, #ff3366);
            }

            .sh-indicator.warn {
                color: var(--ml-color, #ffd700);
            }

            .sh-indicator.muted {
                color: var(--neutral-color, #8b8b8b);
            }

            .sh-error-count.alert {
                color: var(--loss-color, #ff3366);
                font-weight: 700;
            }

            .sh-error-count.ok {
                color: var(--profit-color, #00ff88);
            }

            .sh-uptime {
                font-variant-numeric: tabular-nums;
            }

            .sh-posture {
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .sh-posture.armed {
                color: var(--ml-color, #ffd700);
                animation: sh-armed-pulse 1.5s ease-in-out infinite;
            }

            .sh-posture.degraded {
                color: var(--loss-color, #ff3366);
            }

            @keyframes sh-armed-pulse {
                0%, 100% {
                    opacity: 0.8;
                    text-shadow: none;
                }
                50% {
                    opacity: 1;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
                }
            }

            .sh-commit {
                font-family: 'Courier New', monospace;
                color: var(--text-secondary, #a0a0a0);
                font-weight: 500;
            }

            .sh-commit.unknown {
                color: var(--neutral-color, #8b8b8b);
                font-style: italic;
            }

            @media (max-width: 1200px) {
                #${ROOT_ID} {
                    font-size: 9px;
                    padding: 6px 10px;
                    height: 28px;
                    flex-wrap: wrap;
                }
                .sh-segment {
                    padding: 2px 6px;
                    font-size: 9px;
                }
            }

            /* Tooltip on hover */
            .sh-segment[title] {
                cursor: help;
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Format Helpers ─────────────────────────────────────────────────
    function formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // ─── DOM Rendering ──────────────────────────────────────────────────
    function render() {
        if (!state.mounted) return;

        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        root.innerHTML = '';

        // Segment 1: runtime state. This is not necessarily SessionRouter; eval
        // may be running the single-broker Alpaca path with SessionRouter off.
        const routerSegment = document.createElement('div');
        routerSegment.className = 'sh-segment';
        const routerLabel = document.createElement('span');
        routerLabel.className = 'sh-label';
        routerLabel.textContent = 'RUNTIME:';
        const routerState = document.createElement('span');
        routerState.className = 'sh-value';
        const routerOk = state.routerState && state.routerState !== 'OFFLINE' && state.routerState !== 'FAULTED';
        const routerIndicator = document.createElement('span');
        routerIndicator.className = `sh-indicator ${routerOk ? 'ok' : state.routerState === 'FAULTED' ? 'fail' : 'muted'}`;
        routerIndicator.textContent = routerOk || state.routerState === 'FAULTED' ? (routerOk ? '✓' : '✗') : '?';
        routerState.appendChild(document.createTextNode(displayRuntimeState() + ' '));
        routerState.appendChild(routerIndicator);
        routerSegment.appendChild(routerLabel);
        routerSegment.appendChild(routerState);
        root.appendChild(routerSegment);

        // Separator
        const sep1 = document.createElement('span');
        sep1.className = 'sh-separator';
        sep1.textContent = '|';
        root.appendChild(sep1);

        // Segment 2: active broker feed status. Do not render inactive broker
        // columns in single-broker eval; that makes the dashboard imply Kraken
        // posture while the bot is scoped to Alpaca.
        const renderBroker = (key, label) => {
            const v = state.brokers.get(key);
            const known = v === true || v === false;
            const seg = document.createElement('div');
            seg.className = 'sh-segment';
            const tipBase = key.charAt(0).toUpperCase() + key.slice(1);
            seg.title = !known
                ? `${tipBase}: AWAITING broker_status emitter (price-feed heartbeat used as proxy when symbol matches)`
                : v ? `${tipBase} feed fresh in last 30s` : `${tipBase} feed stale (>30s since price tick)`;
            const lab = document.createElement('span');
            lab.className = 'sh-label';
            lab.textContent = label;
            const ind = document.createElement('span');
            ind.className = `sh-indicator ${!known ? 'muted' : (v ? 'ok' : 'fail')}`;
            ind.textContent = !known ? '?' : (v ? '✓' : '✗');
            seg.appendChild(lab);
            seg.appendChild(ind);
            root.appendChild(seg);
        };

        // Separator
        const sep2 = document.createElement('span');
        sep2.className = 'sh-separator';
        sep2.textContent = '|';
        root.appendChild(sep2);

        const activeBroker = brokerFromRuntimeScope(state.runtimeScope) || symbolToBroker(state.currentSymbol);
        if (activeBroker) {
            renderBroker(activeBroker, 'BROKER:');
        } else {
            renderBroker('unknown', 'BROKER:');
        }

        // Segment 4: Error count. Do not render a placeholder when the backend
        // error_event emitter has not shipped; render only real error telemetry.
        const errCount = state.errors.length;
        if (state.haveErrorEmitter || errCount > 0) {
            const sep3 = document.createElement('span');
            sep3.className = 'sh-separator';
            sep3.textContent = '|';
            root.appendChild(sep3);

            const errSegment = document.createElement('div');
            errSegment.className = 'sh-segment';
            const errLabel = document.createElement('span');
            errLabel.className = 'sh-label';
            errLabel.textContent = 'LAST ERR:';
            const errValue = document.createElement('span');
            if (errCount > 0) {
                errSegment.title = `Last error: ${state.errors[state.errors.length - 1]}`;
            }
            errValue.className = `sh-error-count ${errCount > 0 ? 'alert' : 'ok'}`;
            errValue.textContent = String(errCount);
            errSegment.appendChild(errLabel);
            errSegment.appendChild(errValue);
            root.appendChild(errSegment);
        }

        // Separator
        const sep4 = document.createElement('span');
        sep4.className = 'sh-separator';
        sep4.textContent = '|';
        root.appendChild(sep4);

        // Segment 5: Uptime
        const uptime = Math.floor((Date.now() - state.uptimeStart) / 1000);
        const uptimeSegment = document.createElement('div');
        uptimeSegment.className = 'sh-segment';
        const uptimeLabel = document.createElement('span');
        uptimeLabel.className = 'sh-label';
        uptimeLabel.textContent = 'UPTIME:';
        const uptimeValue = document.createElement('span');
        uptimeValue.className = 'sh-value sh-uptime';
        uptimeValue.textContent = formatUptime(uptime);
        uptimeSegment.appendChild(uptimeLabel);
        uptimeSegment.appendChild(uptimeValue);
        root.appendChild(uptimeSegment);

        // Separator
        const sep5 = document.createElement('span');
        sep5.className = 'sh-separator';
        sep5.textContent = '|';
        root.appendChild(sep5);

        // Segment 6: Risk Posture
        const postureSeg = document.createElement('div');
        postureSeg.className = 'sh-segment';
        const postureLabel = document.createElement('span');
        postureLabel.className = 'sh-label';
        postureLabel.textContent = 'RISK POSTURE:';
        const postureValue = document.createElement('span');
        const armed = state.riskPosture === 'armed' || state.riskPosture === 'ALL GUARDRAILS ARMED';
        postureValue.className = `sh-posture ${armed ? 'armed' : state.riskPosture === 'degraded' ? 'degraded' : 'muted'}`;
        const postureText = armed ? 'ALL GUARDRAILS ARMED' : (state.riskPosture || 'UNKNOWN');
        postureValue.textContent = postureText + ' ';
        const postureInd = document.createElement('span');
        postureInd.className = `sh-indicator ${armed ? 'ok' : state.riskPosture === 'degraded' ? 'fail' : 'warn'}`;
        postureInd.textContent = armed ? '✓' : '⚠';
        postureValue.appendChild(postureInd);
        postureSeg.appendChild(postureLabel);
        postureSeg.appendChild(postureValue);
        root.appendChild(postureSeg);

        // Segment 7: Commit. Render only when /api/health provides a real value.
        const commit = state.lastHealth ? state.lastHealth.commit : null;
        if (commit) {
            const sep7 = document.createElement('span');
            sep7.className = 'sh-separator';
            sep7.textContent = '|';
            root.appendChild(sep7);

            const commitSeg = document.createElement('div');
            commitSeg.className = 'sh-segment';
            const commitLabel = document.createElement('span');
            commitLabel.className = 'sh-label';
            commitLabel.textContent = 'COMMIT:';
            const commitValue = document.createElement('span');
            commitValue.className = 'sh-commit';
            commitValue.textContent = commit;
            commitSeg.appendChild(commitLabel);
            commitSeg.appendChild(commitValue);
            root.appendChild(commitSeg);
        }
    }

    // ─── Health Fetch ────────────────────────────────────────────────────
    function fetchHealth() {
        try {
            fetch(state.healthEndpoint)
                .then(res => {
                    if (!res.ok) throw new Error(`Status ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    state.lastHealth = data;
                    render();
                })
                .catch(_e => {
                    // Silently fail, use existing state
                });
        } catch (_) { /* swallow */ }
    }

    // ─── Uptime Ticker ──────────────────────────────────────────────────
    // Re-render every second so the uptime + heartbeat-derived states
    // (router, broker) decay to STALE / fail gracefully when events stop.
    function tickUptime() {
        if (state.mounted) {
            recomputeDerivedHealth();
            render();
        }
    }

    // ─── Mount to DOM ────────────────────────────────────────────────────
    function mount() {
        if (state.mounted) return true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return false;

        injectStyles();
        state.mounted = true;
        state.uptimeStart = Date.now();

        // Initialize brokers as unknown
        state.brokers.set('kraken', undefined);
        state.brokers.set('alpaca', undefined);

        render();
        return true;
    }

    // ─── Public API ──────────────────────────────────────────────────────
    const SystemHealth = {
        /**
         * Initialize: mount to DOM, inject styles, start fetch loop + uptime ticker.
         * Idempotent.
         */
        init() {
            try {
                if (!mount()) return; // Mount point missing

                // Subscribe to WS events. Socket may not be ready yet; poll
                // briefly until it shows up so the heartbeat-derived broker
                // and router indicators light up the moment data flows.
                (function bindSocket() {
                    const Socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                    if (!Socket || typeof Socket.registerHandler !== 'function') {
                        setTimeout(bindSocket, 250);
                        return;
                    }
                    Socket.registerHandler('state_update', onStateUpdate);
                    Socket.registerHandler('price',        onPriceEvent);
                    Socket.registerHandler('bot_thinking', onBotThinking);
                    // Dormant — fire when backend ships them
                    Socket.registerHandler('error_event',  onErrorEvent);
                    Socket.registerHandler('broker_status', onBrokerStatus);
                })();

                // Subscribe to OGZ.bus risk:update
                if (OGZ.bus) {
                    OGZ.bus.on('risk:update', onRiskUpdate);
                }

                // Start health fetch loop (every 30s). If endpoint returns no
                // response or 404, render() displays honest placeholder values
                // — we never substitute synthetic data.
                fetchHealth(); // Immediate first fetch
                state.healthFetchTimer = setInterval(fetchHealth, HEALTH_FETCH_INTERVAL_MS);

                // Start uptime ticker (every 1s)
                state.uptimeTickTimer = setInterval(tickUptime, UPTIME_TICK_MS);
            } catch (_) { /* swallow */ }
        },

        /**
         * Reconfigure the health endpoint URL (default: '/api/health').
         * @param {string} url - New endpoint URL
         */
        setHealthEndpoint(url) {
            if (typeof url === 'string') {
                state.healthEndpoint = url;
            }
        },

        /**
         * Manually fetch health data now (bypass the 30s interval).
         */
        refresh() {
            fetchHealth();
        },

        /**
         * Add an error message and increment error counter.
         * @param {string} msg - Error message (stored for tooltip)
         */
        addError(msg) {
            if (msg) {
                state.errors.push(String(msg));
                // Keep only last 10 errors in memory
                if (state.errors.length > 10) state.errors.shift();
                render();
            }
        },

        /**
         * Clear all errors (reset error count to 0).
         */
        clearErrors() {
            state.errors = [];
            render();
        },

        /**
         * Set broker WebSocket status (Kraken / Alpaca).
         * @param {string} name - Broker name ('kraken' | 'alpaca')
         * @param {boolean} ok - Connected (true) or disconnected (false)
         */
        setBroker(name, ok) {
            if (typeof name === 'string' && typeof ok === 'boolean') {
                state.brokers.set(name.toLowerCase(), ok);
                render();
            }
        },

        /**
         * Set SessionRouter state.
         * @param {string} state - Router state (e.g., 'CRYPTO', 'STOCKS', 'FAULTED')
         */
        setRouterState(routerState) {
            if (typeof routerState === 'string') {
                state.routerState = routerState.toUpperCase();
                render();
            }
        },

        /**
         * Set Risk Posture state.
         * @param {string} posture - Posture state (e.g., 'armed', 'degraded')
         */
        setRiskPosture(posture) {
            if (typeof posture === 'string') {
                state.riskPosture = posture.toLowerCase();
                render();
            }
        },

        /**
         * Teardown: stop timers, remove DOM, listeners, styles.
         */
        teardown() {
            try {
                if (state.healthFetchTimer) {
                    clearInterval(state.healthFetchTimer);
                    state.healthFetchTimer = null;
                }
                if (state.uptimeTickTimer) {
                    clearInterval(state.uptimeTickTimer);
                    state.uptimeTickTimer = null;
                }

                const root = document.getElementById(ROOT_ID);
                if (root) {
                    root.innerHTML = '';
                }

                const styleEl = document.getElementById(STYLE_ID);
                if (styleEl) styleEl.remove();

                state.mounted = false;
                state.lastHealth = null;
                state.brokers.clear();
                state.errors = [];
            } catch (_) { /* swallow */ }
        },

        /**
         * Debug helper: return snapshot of internal state.
         */
        _compute() {
            return {
                mounted: state.mounted,
                healthEndpoint: state.healthEndpoint,
                lastHealth: state.lastHealth,
                brokers: Object.fromEntries(state.brokers),
                routerState: state.routerState,
                riskPosture: state.riskPosture,
                errorCount: state.errors.length,
                uptime: Math.floor((Date.now() - state.uptimeStart) / 1000),
            };
        },
    };

    // ─── Helpers: symbol → broker, derived router state ─────────────────
    function symbolToBroker(symbol) {
        if (!symbol) return null;
        const s = String(symbol).toUpperCase();
        if (/-USD$/.test(s) || /^BTC|^ETH|^SOL|^XBT|^DOGE|^XRP/.test(s)) return 'kraken';
        return 'alpaca';
    }

    function cleanScopeString(value) {
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    function runtimeScopeFromFrame(frame) {
        const data = frame && frame.data && typeof frame.data === 'object' ? frame.data : null;
        const stateSnapshot = frame && frame.state && typeof frame.state === 'object'
            ? frame.state
            : (data && data.state && typeof data.state === 'object' ? data.state : null);
        const scope = (frame && frame.runtimeScope && typeof frame.runtimeScope === 'object' && frame.runtimeScope)
            || (stateSnapshot && stateSnapshot.runtimeScope && typeof stateSnapshot.runtimeScope === 'object' && stateSnapshot.runtimeScope)
            || (data && data.runtimeScope && typeof data.runtimeScope === 'object' && data.runtimeScope)
            || null;
        if (!scope) return null;

        const brokerId = cleanScopeString(scope.brokerId || scope.broker);
        const assetClass = cleanScopeString(scope.assetClass);
        const symbol = cleanScopeString(scope.symbol || scope.asset);
        if (!brokerId && !assetClass && !symbol) return null;
        return { brokerId, assetClass, symbol };
    }

    function brokerFromRuntimeScope(scope) {
        if (!scope) return null;
        const brokerId = cleanScopeString(scope.brokerId || scope.broker);
        if (brokerId) return brokerId.toLowerCase();
        const assetClass = cleanScopeString(scope.assetClass);
        if (assetClass) {
            const normalized = assetClass.toLowerCase();
            if (normalized === 'stocks' || normalized === 'stock' || normalized === 'equity' || normalized === 'equities') return 'alpaca';
            if (normalized === 'crypto' || normalized === 'cryptocurrency') return 'kraken';
        }
        return symbolToBroker(scope.symbol || scope.asset);
    }

    function routerStateFromBroker(broker) {
        if (broker === 'kraken') return 'CRYPTO';
        if (broker === 'alpaca') return 'STOCKS';
        if (broker) return 'LIVE';
        return null;
    }

    function displayRuntimeState() {
        const broker = brokerFromRuntimeScope(state.runtimeScope);
        const assetClass = cleanScopeString(state.runtimeScope && state.runtimeScope.assetClass);
        if (broker && assetClass) return `${broker.toUpperCase()} ${assetClass.toUpperCase()}`;
        if (broker) return broker.toUpperCase();
        return state.routerState;
    }

    // Derive router state from heartbeats. Public method updates state &
    // re-renders. Called periodically by the uptime ticker so stale
    // heartbeats degrade gracefully.
    function recomputeDerivedHealth() {
        const now = Date.now();
        const broker = brokerFromRuntimeScope(state.runtimeScope) || symbolToBroker(state.currentSymbol);

        // Router state: alive only while state_update OR bot_thinking is fresh
        const routerAlive =
            (state.lastStateUpdateAt > 0 && (now - state.lastStateUpdateAt) < HEARTBEAT_FRESH_MS) ||
            (state.lastBotThinkingAt > 0 && (now - state.lastBotThinkingAt) < HEARTBEAT_FRESH_MS);

        if (routerAlive) {
            state.routerState = routerStateFromBroker(broker) || 'LIVE';
        } else if (state.lastStateUpdateAt === 0 && state.lastBotThinkingAt === 0) {
            state.routerState = 'OFFLINE';
        } else {
            state.routerState = 'STALE';
        }

        // Broker heartbeats from price feed. We only know the active broker,
        // and render only that active broker unless broker_status ships more.
        if (broker && state.lastPriceAt > 0) {
            const priceFresh = (now - state.lastPriceAt) < HEARTBEAT_FRESH_MS;
            // Only flip the active broker; leave the other one alone unless we
            // already have explicit broker_status from backend.
            if (!state.haveBrokerEmitter) {
                state.brokers.set(broker, priceFresh);
            }
        }

        // Risk posture from recoveryMode flag
        if (state.recoveryMode) {
            state.riskPosture = 'degraded';
        } else if (state.lastStateUpdateAt > 0) {
            state.riskPosture = 'armed';
        }
    }

    // ─── WS Event Handlers (real bot emitter shapes) ────────────────────

    // 'state_update' — StateManager's authoritative snapshot. Drives router
    // heartbeat + risk posture (recoveryMode flag).
    function onStateUpdate(d) {
        try {
            const now = Date.now();
            state.lastStateUpdateAt = now;
            const s = d && d.state ? d.state : null;
            if (s && typeof s === 'object') {
                state.recoveryMode = !!s.recoveryMode;
            }
            const runtimeScope = runtimeScopeFromFrame(d);
            if (runtimeScope) {
                state.runtimeScope = runtimeScope;
                if (runtimeScope.symbol) state.currentSymbol = String(runtimeScope.symbol).toUpperCase();
            }
            recomputeDerivedHealth();
            render();
        } catch (_) { /* swallow */ }
    }

    // 'price' — broker feed heartbeat. Single-pair bot, so the active broker
    // comes from runtimeScope first, then the symbol carried by the price frame.
    function onPriceEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data) return;
            const runtimeScope = runtimeScopeFromFrame(d);
            if (runtimeScope) state.runtimeScope = runtimeScope;
            if (data.symbol) state.currentSymbol = String(data.symbol).toUpperCase();
            state.lastPriceAt = Date.now();
            recomputeDerivedHealth();
            // Don't render here — uptime ticker re-renders every second
        } catch (_) { /* swallow */ }
    }

    // 'bot_thinking' — trading loop heartbeat
    function onBotThinking(_d) {
        state.lastBotThinkingAt = Date.now();
        recomputeDerivedHealth();
    }

    // DORMANT 'error_event' — wired defensively. When backend ships it
    // (planned), we flip haveErrorEmitter=true and start counting.
    function onErrorEvent(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data) return;
            state.haveErrorEmitter = true;
            const msg = String(data.message || data.error || '');
            if (msg) SystemHealth.addError(msg);
        } catch (_) { /* swallow */ }
    }

    // DORMANT 'broker_status' — wired defensively. When backend ships it,
    // it overrides the price-derived broker indicators.
    function onBrokerStatus(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (!data || !data.name || typeof data.ok !== 'boolean') return;
            state.haveBrokerEmitter = true;
            SystemHealth.setBroker(data.name, data.ok);
        } catch (_) { /* swallow */ }
    }

    // External RiskGauge override — keep shape backward compatible
    function onRiskUpdate(data) {
        try {
            if (typeof data === 'string') data = JSON.parse(data);
            if (data && data.state) {
                SystemHealth.setRiskPosture(data.state);
            } else if (data && data.level) {
                SystemHealth.setRiskPosture(String(data.level).toLowerCase());
            }
        } catch (_) { /* swallow */ }
    }

    // ─── Module Registration ────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('SystemHealth', SystemHealth);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('SystemHealth', SystemHealth);
            }
        });
    }

    try { window.OGZSystemHealth = SystemHealth; } catch (_) {}
})(window.OGZ = window.OGZ || {});
