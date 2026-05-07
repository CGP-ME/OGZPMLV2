/**
 * header-strip.js — HeaderStrip: Dashboard Header Panel
 *
 * The topmost persistent UI element containing brand identity, live system state,
 * and account/session context. Extracted from unified-dashboard.html's inline
 * header structure to become the fourth shipped modular panel after NewsTicker,
 * WatchlistStrip, and PatternCard.
 *
 * What it renders:
 *   [LEFT]   OGZPrime logo + tagline ("Neural Ensemble — Real-Time Data")
 *   [CENTER] Hero price display: $X.XX ± Y.YY (±Z.Z%)
 *   [RIGHT]  Status cluster: DATA/BOT/TRAI lights, Risk Budget meter, Session Phase
 *
 * State tracking:
 *   - Current equity price + open-session delta
 *   - Risk budget: percentage + threat level (SAFE/WARN/DANGER)
 *   - Three status lights: DATA (live prices), BOT (strategy engine), TRAI (inference)
 *     Each light: gray (idle) → green (active, pulse) → red (error)
 *   - Account selector: dropdown for multi-account deployments (stub for v1)
 *
 * Self-registers as OGZ.HeaderStrip via OGZ.register().
 * Mounts into <header id="dashHeader">.
 * Subscribes to WS events:
 *   - price: triggers DATA light pulse, updates hero-price display
 *   - bot_state: (TODO-flag UNVERIFIED) controls BOT light state
 *   - trai_status: (TODO-flag UNVERIFIED) controls TRAI light state
 *   - state_update: (TODO-flag UNVERIFIED) alternative balance event
 *   - balance_update: (TODO-flag UNVERIFIED) alternative balance event
 * Listens to OGZ.bus events:
 *   - account:change — when dropdown selects a new account
 *   - risk:update — when RiskGauge (future module) reports new budget
 *
 * Graceful fallback: displays "--" placeholders if no events arrive.
 * No console.log in production code.
 *
 * Public API:
 *   init() — mount to DOM, inject styles, subscribe to WS + bus events
 *   setAccount(accountName) — update the account selector display
 *   getAccount() — return current account name
 *   getEquity() — return {price, delta, deltaPercent, priceOpen}
 *   setStatusLight(name, active, error) — update DATA/BOT/TRAI state
 *   setRiskBudget(percent, level) — update risk gauge (SAFE/WARN/DANGER)
 *   teardown() — remove DOM, listeners, styles
 *   _compute() — debug helper: return internal state snapshot
 *
 * @typedef {Object} HeaderState
 * @property {number} equity — current price
 * @property {number} equityDelta — session P&L in dollars
 * @property {number} equityDeltaPercent — session P&L in percent
 * @property {number} riskBudget — 0..100 percentage
 * @property {string} riskLevel — 'SAFE' | 'WARN' | 'DANGER'
 * @property {Object} statusLights — {data, bot, trai} — each {active: bool, error: bool}
 * @property {string} currentAccount — account display name or 'default'
 *
 * @module public/js/panels/header-strip
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-header-strip-styles';
    const ROOT_ID = 'dashHeader';
    const STATUS_PULSE_INTERVAL_MS = 1200;  // Pulse animation cycle
    const PRICE_FLASH_MS = 300;              // Duration of price tick flash
    const DEFAULT_ACCOUNT = 'default';
    const PRICE_HISTORY_SIZE = 100;          // Track recent prices for delta calc

    // Brand colors — must match CSS variables
    const COLORS = {
        statusGreen: '#00ff88',
        statusYellow: '#ffcc00',
        statusRed: '#ff3366',
        statusGray: '#444444',
        brandRed: '#dc2626',
        textSecondary: '#888888',
    };

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,

        // Equity display
        equity: 0,
        equityPriceOpen: 0,  // Session open price (for delta calculation)
        priceHistory: [],    // Rolling buffer of recent prices for averaging

        // Risk budget
        riskBudget: 0,       // 0..100 percentage
        riskLevel: 'SAFE',   // 'SAFE' | 'WARN' | 'DANGER'

        // Status lights
        statusLights: {
            data: { active: false, error: false },
            bot: { active: false, error: false },
            trai: { active: false, error: false },
        },

        // Account selector
        currentAccount: DEFAULT_ACCOUNT,

        // DOM caches
        domRefs: {
            root: null,
            heroPriceMain: null,
            heroPriceDelta: null,
            dataLight: null,
            botLight: null,
            traiLight: null,
            riskBudgetPercent: null,
            riskBudgetLevel: null,
            accountSelector: null,
        },

        // Event listeners (for cleanup)
        listeners: [],
        wsHandlers: [],
    };

    // ─── Event Bus Helper ──────────────────────────────────────────────
    function ensureEventBus() {
        if (OGZ && OGZ.bus) return;
        const listeners = new Map();
        const bus = {
            on(event, handler) {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event).push(handler);
            },
            off(event, handler) {
                if (!listeners.has(event)) return;
                const list = listeners.get(event);
                const idx = list.indexOf(handler);
                if (idx >= 0) list.splice(idx, 1);
            },
            emit(event, data) {
                if (!listeners.has(event)) return;
                listeners.get(event).forEach(h => {
                    try { h(data); } catch (_) { /* swallow */ }
                });
            },
        };
        if (OGZ) OGZ.bus = bus;
    }

    // ─── CSS Injection ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
            header#dashHeader {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 12px 24px;
                background: linear-gradient(180deg, #0d0d1a 0%, #080812 100%);
                border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
                height: 60px;
                position: relative;
                z-index: 10;
            }

            /* Header structure: three horizontal zones */
            .hs-brand {
                display: flex;
                flex-direction: column;
                flex: 0 0 auto;
                min-width: 0;
            }

            .hs-logo {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 45%, #b91c1c 75%, #ef4444 100%);
                background-clip: text;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                color: transparent;
                font-family: 'Orbitron', monospace;
                font-size: 32px;
                font-weight: 900;
                letter-spacing: 4px;
                text-transform: uppercase;
                line-height: 1;
                filter: drop-shadow(0 0 14px rgba(220, 38, 38, 0.45))
                        drop-shadow(0 0 4px rgba(0, 0, 0, 0.85));
                display: inline-flex;
                align-items: center;
                gap: 12px;
            }

            .hs-logo::before {
                content: '';
                display: inline-block;
                width: 14px;
                height: 14px;
                transform: rotate(45deg);
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                box-shadow: 0 0 12px rgba(220, 38, 38, 0.55),
                            0 0 0 1px rgba(255, 255, 255, 0.10) inset;
                filter: drop-shadow(0 0 6px rgba(220, 38, 38, 0.55));
            }

            .hs-tagline {
                color: #888888;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 2.8px;
                margin-top: 4px;
                text-shadow: 0 0 6px rgba(220, 38, 38, 0.18);
            }

            /* Hero price (CENTER zone) */
            .hs-hero-price {
                flex: 1;
                text-align: center;
                min-width: 0;
            }

            .hs-hero-price-main {
                font-family: 'Orbitron', monospace;
                font-size: 36px;
                font-weight: 800;
                color: #22c55e;
                letter-spacing: 1.5px;
                text-shadow: 0 0 22px rgba(34, 197, 94, 0.4);
                line-height: 1;
                transition: color 120ms ease, text-shadow 120ms ease;
            }

            .hs-hero-price-main.neg {
                color: #ef4444;
                text-shadow: 0 0 22px rgba(239, 68, 68, 0.4);
            }

            .hs-hero-price-main.flash-up {
                animation: hs-equity-flash-up 300ms ease-out;
            }

            .hs-hero-price-main.flash-down {
                animation: hs-equity-flash-down 300ms ease-out;
            }

            .hs-hero-price-delta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                color: #888888;
                margin-top: 4px;
                letter-spacing: 0.5px;
                transition: color 120ms ease;
            }

            .hs-hero-price-delta.pos {
                color: #22c55e;
            }

            .hs-hero-price-delta.neg {
                color: #ef4444;
            }

            @keyframes hs-equity-flash-up {
                0% { color: #ffd700; text-shadow: 0 0 22px rgba(255, 215, 0, 0.6); }
                100% { color: #22c55e; text-shadow: 0 0 22px rgba(34, 197, 94, 0.4); }
            }

            @keyframes hs-equity-flash-down {
                0% { color: #ffd700; text-shadow: 0 0 22px rgba(255, 215, 0, 0.6); }
                100% { color: #ef4444; text-shadow: 0 0 22px rgba(239, 68, 68, 0.4); }
            }

            /* Status cluster (RIGHT zone) */
            .hs-status-cluster {
                display: flex;
                align-items: center;
                gap: 12px;
                flex: 0 0 auto;
                margin-left: auto;
                justify-self: end;
            }

            .hs-status-lights-bar {
                display: flex;
                gap: 15px;
                align-items: center;
                background: rgba(0, 0, 0, 0.5);
                padding: 8px 15px;
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .hs-status-light {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .hs-status-light .hs-light {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #444444;
                box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
                transition: all 0.3s ease;
            }

            .hs-status-light .hs-light.active {
                background: #00ff88;
                box-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
                animation: hs-status-pulse 1.2s infinite;
            }

            .hs-status-light .hs-light.error {
                background: #ff3366;
                box-shadow: 0 0 8px rgba(255, 51, 102, 0.6);
                animation: hs-status-pulse 1s infinite;
            }

            .hs-status-light .hs-label {
                color: #888888;
            }

            .hs-status-light .hs-light.active + .hs-label {
                color: #00ff88;
            }

            .hs-status-light .hs-light.error + .hs-label {
                color: #ff3366;
            }

            @keyframes hs-status-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(1.1); }
            }

            .hs-risk-budget {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                min-width: 70px;
            }

            .hs-risk-budget-percent {
                font-family: 'Orbitron', monospace;
                font-size: 14px;
                font-weight: 700;
                color: var(--profit-color);
                letter-spacing: 1px;
            }

            .hs-risk-budget-percent.warn {
                color: var(--ml-color);
            }

            .hs-risk-budget-percent.danger {
                color: var(--loss-color);
            }

            .hs-risk-budget-level {
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1.2px;
                color: var(--profit-color);
                margin-top: 2px;
            }

            .hs-risk-budget-level.warn {
                color: var(--ml-color);
            }

            .hs-risk-budget-level.danger {
                color: var(--loss-color);
            }

            .hs-account-selector {
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: var(--text-primary);
                padding: 6px 12px;
                border-radius: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                cursor: pointer;
                transition: all 0.3s ease;
                max-width: 150px;
            }

            .hs-account-selector:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(220, 38, 38, 0.3);
            }

            .hs-account-selector option {
                background: #000000;
                color: #ffffff;
            }

            @media (prefers-reduced-motion: reduce) {
                .hs-status-light .hs-light.active,
                .hs-status-light .hs-light.error,
                .hs-hero-price-main.flash-up,
                .hs-hero-price-main.flash-down {
                    animation: none;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Render Functions ──────────────────────────────────────────────
    function render() {
        const root = state.domRefs.root;
        if (!root) return;

        root.innerHTML = `
            <div class="hs-brand">
                <div class="hs-logo">OGZPrime</div>
                <div class="hs-tagline">Neural Ensemble • Real-Time Data</div>
            </div>

            <div class="hs-hero-price">
                <div class="hs-hero-price-main" id="hsHeroPriceMain">$0.00</div>
                <div class="hs-hero-price-delta" id="hsHeroPriceDelta"></div>
            </div>

            <div class="hs-status-cluster">
                <div class="hs-status-lights-bar">
                    <div class="hs-status-light">
                        <span class="hs-light" id="hsDataLight"></span>
                        <span class="hs-label">DATA</span>
                    </div>
                    <div class="hs-status-light">
                        <span class="hs-light" id="hsBotLight"></span>
                        <span class="hs-label">BOT</span>
                    </div>
                    <div class="hs-status-light">
                        <span class="hs-light" id="hsTraiLight"></span>
                        <span class="hs-label">TRAI</span>
                    </div>
                </div>

                <div class="hs-risk-budget">
                    <div class="hs-risk-budget-percent" id="hsRiskPercent">0%</div>
                    <div class="hs-risk-budget-level" id="hsRiskLevel">SAFE</div>
                </div>

                <select class="hs-account-selector" id="hsAccountSelector">
                    <option value="default">Account: Default</option>
                </select>
            </div>
        `;

        // Cache DOM refs
        state.domRefs.heroPriceMain = root.querySelector('#hsHeroPriceMain');
        state.domRefs.heroPriceDelta = root.querySelector('#hsHeroPriceDelta');
        state.domRefs.dataLight = root.querySelector('#hsDataLight');
        state.domRefs.botLight = root.querySelector('#hsBotLight');
        state.domRefs.traiLight = root.querySelector('#hsTraiLight');
        state.domRefs.riskBudgetPercent = root.querySelector('#hsRiskPercent');
        state.domRefs.riskBudgetLevel = root.querySelector('#hsRiskLevel');
        state.domRefs.accountSelector = root.querySelector('#hsAccountSelector');

        // Wire up account selector
        if (state.domRefs.accountSelector) {
            state.domRefs.accountSelector.addEventListener('change', (e) => {
                const newAccount = e.target.value;
                state.currentAccount = newAccount;
                if (OGZ && OGZ.bus) {
                    OGZ.bus.emit('account:change', { account: newAccount });
                }
            });
        }

        updateDisplay();
    }

    function updateDisplay() {
        // Update hero price
        if (state.domRefs.heroPriceMain) {
            const priceStr = `$${state.equity.toFixed(2)}`;
            state.domRefs.heroPriceMain.textContent = priceStr;

            const isNeg = state.equity < 0;
            state.domRefs.heroPriceMain.classList.toggle('neg', isNeg);
        }

        // Update delta
        if (state.domRefs.heroPriceDelta) {
            const delta = state.equity - state.equityPriceOpen;
            const deltaPercent = state.equityPriceOpen > 0
                ? ((delta / state.equityPriceOpen) * 100)
                : 0;

            const sign = delta >= 0 ? '+' : '';
            const deltaStr = `${sign}${delta.toFixed(2)} (${sign}${deltaPercent.toFixed(2)}%)`;

            state.domRefs.heroPriceDelta.textContent = deltaStr;

            const isNeg = delta < 0;
            state.domRefs.heroPriceDelta.classList.toggle('pos', !isNeg);
            state.domRefs.heroPriceDelta.classList.toggle('neg', isNeg);
        }

        // Update status lights
        updateStatusLightDOM('data');
        updateStatusLightDOM('bot');
        updateStatusLightDOM('trai');

        // Update risk budget
        if (state.domRefs.riskBudgetPercent) {
            state.domRefs.riskBudgetPercent.textContent = `${state.riskBudget}%`;
            state.domRefs.riskBudgetPercent.className = `hs-risk-budget-percent ${state.riskLevel.toLowerCase()}`;
        }
        if (state.domRefs.riskBudgetLevel) {
            state.domRefs.riskBudgetLevel.textContent = state.riskLevel;
            state.domRefs.riskBudgetLevel.className = `hs-risk-budget-level ${state.riskLevel.toLowerCase()}`;
        }
    }

    function updateStatusLightDOM(name) {
        const light = state.domRefs[`${name}Light`];
        if (!light) return;

        const status = state.statusLights[name];
        light.className = 'hs-light';

        if (status.error) {
            light.classList.add('error');
        } else if (status.active) {
            light.classList.add('active');
        }
    }

    // ─── WS Event Handlers ──────────────────────────────────────────────
    function handlePrice(event) {
        try {
            if (typeof event === 'string') {
                event = JSON.parse(event);
            }

            const price = parseFloat(event.price || event.c || 0);
            if (!isNaN(price) && price > 0) {
                const prevPrice = state.equity;
                state.equity = price;

                // Track for delta calculation
                state.priceHistory.push(price);
                if (state.priceHistory.length > PRICE_HISTORY_SIZE) {
                    state.priceHistory.shift();
                }

                // Initialize open price on first price
                if (state.equityPriceOpen === 0) {
                    state.equityPriceOpen = price;
                }

                // Pulse DATA light
                state.statusLights.data.active = true;

                // Flash hero price
                if (state.domRefs.heroPriceMain) {
                    state.domRefs.heroPriceMain.classList.remove('flash-up', 'flash-down');
                    const direction = price > prevPrice ? 'flash-up' : 'flash-down';
                    state.domRefs.heroPriceMain.classList.add(direction);

                    setTimeout(() => {
                        state.domRefs.heroPriceMain.classList.remove(direction);
                    }, PRICE_FLASH_MS);
                }

                updateDisplay();
            }
        } catch (err) {
            // Swallow parse errors
        }
    }

    function handleBotState(event) {
        try {
            if (typeof event === 'string') {
                event = JSON.parse(event);
            }

            const isRunning = event.running || event.active || false;
            const isError = event.error || event.state === 'error' || false;

            state.statusLights.bot.active = isRunning;
            state.statusLights.bot.error = isError;

            updateDisplay();
        } catch (err) {
            // Swallow
        }
    }

    function handleTraiStatus(event) {
        try {
            if (typeof event === 'string') {
                event = JSON.parse(event);
            }

            const isRunning = event.running || event.active || false;
            const isError = event.error || event.state === 'error' || false;

            state.statusLights.trai.active = isRunning;
            state.statusLights.trai.error = isError;

            updateDisplay();
        } catch (err) {
            // Swallow
        }
    }

    function handleRiskUpdate(data) {
        try {
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }

            state.riskBudget = Math.max(0, Math.min(100, data.percent || 0));
            state.riskLevel = data.level || 'SAFE';

            updateDisplay();
        } catch (err) {
            // Swallow
        }
    }

    // ─── Bus Event Listeners ────────────────────────────────────────────
    function subscribeToEvents() {
        if (OGZ && OGZ.bus) {
            OGZ.bus.on('risk:update', handleRiskUpdate);
            OGZ.bus.on('account:change', (data) => {
                if (data && data.account) {
                    state.currentAccount = data.account;
                    updateDisplay();
                }
            });
        }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            if (state.mounted) return;

            ensureEventBus();
            injectStyles();

            const root = document.getElementById(ROOT_ID);
            if (!root) return;

            state.domRefs.root = root;
            render();

            // Subscribe to WS events (with defensive try/catch)
            if (window.ws && typeof window.ws.on === 'function') {
                window.ws.on('price', (event) => {
                    try { handlePrice(event); } catch (_) { /* swallow */ }
                });
                window.ws.on('bot_state', (event) => {
                    try { handleBotState(event); } catch (_) { /* swallow */ }
                });
                window.ws.on('trai_status', (event) => {
                    try { handleTraiStatus(event); } catch (_) { /* swallow */ }
                });
            }

            // Subscribe to bus events
            subscribeToEvents();

            state.mounted = true;
        },

        setAccount(accountName) {
            state.currentAccount = accountName;
            if (state.domRefs.accountSelector) {
                state.domRefs.accountSelector.value = accountName;
            }
            updateDisplay();
        },

        getAccount() {
            return state.currentAccount;
        },

        getEquity() {
            return {
                price: state.equity,
                delta: state.equity - state.equityPriceOpen,
                deltaPercent: state.equityPriceOpen > 0
                    ? ((state.equity - state.equityPriceOpen) / state.equityPriceOpen) * 100
                    : 0,
                priceOpen: state.equityPriceOpen,
            };
        },

        setStatusLight(name, active, error) {
            if (state.statusLights[name]) {
                state.statusLights[name].active = !!active;
                state.statusLights[name].error = !!error;
                updateDisplay();
            }
        },

        setRiskBudget(percent, level) {
            state.riskBudget = Math.max(0, Math.min(100, percent || 0));
            state.riskLevel = level || 'SAFE';
            updateDisplay();
        },

        teardown() {
            if (!state.mounted) return;

            // Remove event listeners
            if (state.domRefs.accountSelector) {
                state.domRefs.accountSelector.removeEventListener('change', null);
            }

            // Remove DOM
            if (state.domRefs.root) {
                state.domRefs.root.innerHTML = '';
            }

            // Remove styles
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();

            state.mounted = false;
            Object.keys(state.domRefs).forEach(key => {
                state.domRefs[key] = null;
            });
        },

        _compute() {
            return {
                mounted: state.mounted,
                equity: state.equity,
                equityPriceOpen: state.equityPriceOpen,
                riskBudget: state.riskBudget,
                riskLevel: state.riskLevel,
                statusLights: JSON.parse(JSON.stringify(state.statusLights)),
                currentAccount: state.currentAccount,
            };
        },
    };

    // ─── Registration ──────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('HeaderStrip', api);
    } else if (window.OGZ) {
        window.OGZ.HeaderStrip = api;
    }

})(window.OGZ || (window.OGZ = {}));
