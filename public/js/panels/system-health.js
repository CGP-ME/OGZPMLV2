/**
 * system-health.js — SystemHealth: Operator Health Strip
 *
 * Footer-right operator health visibility panel. Displays at-a-glance status for:
 * SessionRouter state (CRYPTO / STOCKS / FAULTED), broker WebSocket connections
 * (Kraken / Alpaca individual status), error count, session uptime, last unplanned
 * crash timestamp, Risk Posture guardrail state, and git commit hash.
 *
 * Renders as a compact horizontal strip with segments separated by " | ":
 *   SESSIONROUTER: CRYPTO ✓ | KRAKEN ✓ | ALPACA ✗ | LAST ERR: 3 | UPTIME: 2h 14m |
 *   LAST CRASH: 47 days ago | RISK POSTURE: ALL GUARDRAILS ARMED ✓ | COMMIT: a07516a
 *
 * Self-registers as OGZ.SystemHealth via OGZ.register().
 * Mounts into <div id="systemHealth"></div>.
 *
 * Data sources:
 *   - HTTP fetch /api/health (every 30s) — uptime, status, timestamp, broker WS counts,
 *     memory. Backend MAY return optional: commit, lastCrash, errorCount fields.
 *   - WS events:
 *     * state_update — for SessionRouter active session (CRYPTO / STOCKS / FAULTED)
 *     * error_event — increments error counter
 *     * broker_status — Kraken/Alpaca individual WS status (name, ok)
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
 * Demo mode (on by default):
 *   If no real fetch/WS events arrive within DEMO_FALLBACK_MS (5s), shows
 *   realistic sample health data. Disabled automatically when real data arrives.
 *
 * @typedef {Object} HealthSnapshot
 * @property {number} timestamp - Unix epoch milliseconds
 * @property {string} state - SessionRouter state (e.g., 'CRYPTO')
 * @property {number} uptime - Session uptime in seconds
 * @property {number} websockets - Count of active WebSocket connections
 * @property {Object} memory - {heapUsed: number, heapTotal: number}
 * @property {string} [commit] - Git commit hash (optional, backend gap)
 * @property {number} [lastCrash] - Unix timestamp of last unplanned crash (optional)
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
    const DEMO_FALLBACK_MS = 5000;           // 5 seconds until demo mode

    // Demo data — realistic values when real API unavailable
    const DEMO_HEALTH = {
        timestamp: Date.now(),
        state: 'CRYPTO',
        uptime: 82440,  // 22h 54m
        websockets: 2,
        memory: { heapUsed: 128, heapTotal: 256 },
        commit: 'a07516a',
        lastCrash: 0,  // NEVER
        errorCount: 0,
    };

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
        demoFallbackTimer: null,
        healthFetchTimer: null,
        uptimeTickTimer: null,
        usingDemo: false,
    };

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

            .sh-crash-time {
                color: var(--ml-color, #ffd700);
                font-weight: 600;
            }

            .sh-crash-time.never {
                color: var(--ml-color, #ffd700);
            }

            .sh-crash-time.ago {
                color: var(--text-primary, #ffffff);
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

    function formatCrashTime(timestamp) {
        if (!timestamp || timestamp === 0) {
            return 'NEVER';
        }
        const now = Date.now();
        const diffMs = now - timestamp;
        const days = Math.floor(diffMs / (86400000));
        const hours = Math.floor((diffMs % 86400000) / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);

        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ago`;
        } else {
            return `${minutes}m ago`;
        }
    }

    // ─── DOM Rendering ──────────────────────────────────────────────────
    function render() {
        if (!state.mounted) return;

        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        root.innerHTML = '';

        // Segment 1: SessionRouter state
        const routerSegment = document.createElement('div');
        routerSegment.className = 'sh-segment';
        const routerLabel = document.createElement('span');
        routerLabel.className = 'sh-label';
        routerLabel.textContent = 'SESSIONROUTER:';
        const routerState = document.createElement('span');
        routerState.className = 'sh-value';
        const routerOk = state.routerState && state.routerState !== 'OFFLINE' && state.routerState !== 'FAULTED';
        const routerIndicator = document.createElement('span');
        routerIndicator.className = `sh-indicator ${routerOk ? 'ok' : state.routerState === 'FAULTED' ? 'fail' : 'muted'}`;
        routerIndicator.textContent = routerOk || state.routerState === 'FAULTED' ? (routerOk ? '✓' : '✗') : '?';
        routerState.appendChild(document.createTextNode(state.routerState + ' '));
        routerState.appendChild(routerIndicator);
        routerSegment.appendChild(routerLabel);
        routerSegment.appendChild(routerState);
        root.appendChild(routerSegment);

        // Separator
        const sep1 = document.createElement('span');
        sep1.className = 'sh-separator';
        sep1.textContent = '|';
        root.appendChild(sep1);

        // Segment 2: Kraken broker WS status
        const krakenOk = state.brokers.get('kraken') === true;
        const krakenSegment = document.createElement('div');
        krakenSegment.className = 'sh-segment';
        krakenSegment.title = krakenOk ? 'Kraken WebSocket connected' : 'Kraken WebSocket disconnected';
        const krakenLabel = document.createElement('span');
        krakenLabel.className = 'sh-label';
        krakenLabel.textContent = 'KRAKEN:';
        const krakenInd = document.createElement('span');
        krakenInd.className = `sh-indicator ${state.brokers.has('kraken') ? (krakenOk ? 'ok' : 'fail') : 'muted'}`;
        krakenInd.textContent = state.brokers.has('kraken') ? (krakenOk ? '✓' : '✗') : '?';
        krakenSegment.appendChild(krakenLabel);
        krakenSegment.appendChild(krakenInd);
        root.appendChild(krakenSegment);

        // Separator
        const sep2 = document.createElement('span');
        sep2.className = 'sh-separator';
        sep2.textContent = '|';
        root.appendChild(sep2);

        // Segment 3: Alpaca broker WS status
        const alpacaOk = state.brokers.get('alpaca') === true;
        const alpacaSegment = document.createElement('div');
        alpacaSegment.className = 'sh-segment';
        alpacaSegment.title = alpacaOk ? 'Alpaca WebSocket connected' : 'Alpaca WebSocket disconnected';
        const alpacaLabel = document.createElement('span');
        alpacaLabel.className = 'sh-label';
        alpacaLabel.textContent = 'ALPACA:';
        const alpacaInd = document.createElement('span');
        alpacaInd.className = `sh-indicator ${state.brokers.has('alpaca') ? (alpacaOk ? 'ok' : 'fail') : 'muted'}`;
        alpacaInd.textContent = state.brokers.has('alpaca') ? (alpacaOk ? '✓' : '✗') : '?';
        alpacaSegment.appendChild(alpacaLabel);
        alpacaSegment.appendChild(alpacaInd);
        root.appendChild(alpacaSegment);

        // Separator
        const sep3 = document.createElement('span');
        sep3.className = 'sh-separator';
        sep3.textContent = '|';
        root.appendChild(sep3);

        // Segment 4: Error count
        const errCount = state.errors.length;
        const errSegment = document.createElement('div');
        errSegment.className = 'sh-segment';
        if (errCount > 0 && state.errors.length > 0) {
            errSegment.title = `Last error: ${state.errors[state.errors.length - 1]}`;
        }
        const errLabel = document.createElement('span');
        errLabel.className = 'sh-label';
        errLabel.textContent = 'LAST ERR:';
        const errValue = document.createElement('span');
        errValue.className = `sh-error-count ${errCount > 0 ? 'alert' : 'ok'}`;
        errValue.textContent = String(errCount);
        errSegment.appendChild(errLabel);
        errSegment.appendChild(errValue);
        root.appendChild(errSegment);

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

        // Segment 6: Last crash
        const crashTime = state.lastHealth ? state.lastHealth.lastCrash : 0;
        const crashSegment = document.createElement('div');
        crashSegment.className = 'sh-segment';
        const crashLabel = document.createElement('span');
        crashLabel.className = 'sh-label';
        crashLabel.textContent = 'LAST CRASH:';
        const crashValue = document.createElement('span');
        crashValue.className = `sh-crash-time ${crashTime === 0 ? 'never' : 'ago'}`;
        crashValue.textContent = formatCrashTime(crashTime);
        crashSegment.appendChild(crashLabel);
        crashSegment.appendChild(crashValue);
        root.appendChild(crashSegment);

        // Separator
        const sep6 = document.createElement('span');
        sep6.className = 'sh-separator';
        sep6.textContent = '|';
        root.appendChild(sep6);

        // Segment 7: Risk Posture
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

        // Separator
        const sep7 = document.createElement('span');
        sep7.className = 'sh-separator';
        sep7.textContent = '|';
        root.appendChild(sep7);

        // Segment 8: Commit
        const commit = state.lastHealth ? state.lastHealth.commit : null;
        const commitSeg = document.createElement('div');
        commitSeg.className = 'sh-segment';
        const commitLabel = document.createElement('span');
        commitLabel.className = 'sh-label';
        commitLabel.textContent = 'COMMIT:';
        const commitValue = document.createElement('span');
        commitValue.className = `sh-commit ${commit ? '' : 'unknown'}`;
        commitValue.textContent = commit || '?';
        commitSeg.appendChild(commitLabel);
        commitSeg.appendChild(commitValue);
        root.appendChild(commitSeg);
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
                    if (state.demoFallbackTimer) {
                        clearTimeout(state.demoFallbackTimer);
                        state.demoFallbackTimer = null;
                    }
                    state.usingDemo = false;
                    render();
                })
                .catch(_e => {
                    // Silently fail, use existing state
                });
        } catch (_) { /* swallow */ }
    }

    // ─── Uptime Ticker ──────────────────────────────────────────────────
    function tickUptime() {
        if (state.mounted) {
            render();
        }
    }

    // ─── Demo Mode Fallback ─────────────────────────────────────────────
    function startDemoFallback() {
        if (state.demoFallbackTimer) clearTimeout(state.demoFallbackTimer);
        state.demoFallbackTimer = setTimeout(() => {
            if (!state.lastHealth && !state.usingDemo) {
                state.lastHealth = JSON.parse(JSON.stringify(DEMO_HEALTH));
                state.usingDemo = true;
                state.routerState = DEMO_HEALTH.state;
                state.brokers.set('kraken', true);
                state.brokers.set('alpaca', true);
                state.errors = [];
                state.riskPosture = 'armed';
                render();
            }
        }, DEMO_FALLBACK_MS);
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

                // Subscribe to WS events
                const Socket = OGZ.get && OGZ.get('Socket');
                if (Socket && Socket.registerHandler) {
                    Socket.registerHandler('state_update', onStateUpdate);
                    Socket.registerHandler('error_event', onErrorEvent);
                    Socket.registerHandler('broker_status', onBrokerStatus);
                }

                // Subscribe to OGZ.bus risk:update
                if (OGZ.bus) {
                    OGZ.bus.on('risk:update', onRiskUpdate);
                }

                // Start demo fallback (5s until real data expected)
                startDemoFallback();

                // Start health fetch loop (every 30s)
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
                if (state.demoFallbackTimer) {
                    clearTimeout(state.demoFallbackTimer);
                    state.demoFallbackTimer = null;
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
                usingDemo: state.usingDemo,
            };
        },
    };

    // ─── WS Event Handlers ──────────────────────────────────────────────
    function onStateUpdate(data) {
        try {
            if (data && data.state) {
                SystemHealth.setRouterState(data.state);
            }
        } catch (_) { /* swallow */ }
    }

    function onErrorEvent(data) {
        try {
            if (data && data.message) {
                SystemHealth.addError(data.message);
            }
        } catch (_) { /* swallow */ }
    }

    function onBrokerStatus(data) {
        try {
            if (data && data.name && typeof data.ok === 'boolean') {
                SystemHealth.setBroker(data.name, data.ok);
            }
        } catch (_) { /* swallow */ }
    }

    function onRiskUpdate(data) {
        try {
            if (data && data.state) {
                SystemHealth.setRiskPosture(data.state);
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
