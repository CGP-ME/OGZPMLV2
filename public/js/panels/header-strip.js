/**
 * header-strip.js - HeaderStrip: Dashboard Header Panel
 *
 * The topmost persistent UI element containing brand identity, live system state,
 * and account/session context.
 *
 * What it renders:
 *   [LEFT]   OGZPrime logo + tagline ("Neural Ensemble - Real-Time Data")
 *   [CENTER] Hero: total account equity, session P&L, session trade count + win rate
 *   [RIGHT]  Status cluster: DATA/BOT/TRAI lights, Risk Budget meter, Account selector
 *
 * State tracking:
 *   - Account equity: explicit state_update.equity
 *   - Session P&L: totalPnL since session open
 *   - Session trade count + win rate (from state_update.tradeCount + tradePNL ledger)
 *   - Risk budget: drawdown from session-open as percentage of session-open equity
 *   - Three status lights: DATA (price ticks), BOT (bot_thinking), TRAI (narrator_event)
 *
 * Self-registers as OGZ.HeaderStrip via OGZ.register().
 * Mounts into <header id="dashHeader">.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'price'          -> CandleProcessor.broadcastPrice; DATA-light heartbeat only.
 *                        Shape: { type:'price', data:{ price, candle, indicators,
 *                        overlays, equity, position, ... } }
 *   - 'state_update'   -> StateManager.broadcastToDashboard; equity hero + risk meter.
 *                        Shape: { type:'state_update', state:{ position, equity,
 *                        balance, totalBalance, realizedPnL, unrealizedPnL, totalPnL,
 *                        tradeCount, dailyTradeCount, recoveryMode }, timestamp }
 *   - 'balance_update' -> equity fallback: { type:'balance_update', equity }
 *   - 'bot_thinking'   -> TradingLoop.processCycle / TRAIDecisionModule. BOT-light heartbeat.
 *                        Shape: { type:'bot_thinking', timestamp, message, confidence,
 *                        data:{ reasoning, price, regime, module }, strategy_stack }
 *   - 'narrator_event' -> TradeNarrator.broadcast. TRAI-light heartbeat.
 *                        Shape: { type:'narrator_event', subtype, text, timestamp }
 *   - 'trade'          -> OrderExecutor; session win/loss tally.
 *                        Shape: { type:'trade', action, direction, price, pnl,
 *                        timestamp, confidence }
 *
 * Listens to OGZ.bus events:
 *   - account:change - when dropdown selects a new account
 *   - risk:update    - when an external RiskGauge module reports new budget
 *                      (overrides the auto-derived value)
 *
 * Graceful fallback: displays "--" placeholders if no events arrive.
 * No console.log in production code.
 *
 * Public API:
 *   init() - mount to DOM, inject styles, subscribe to WS + bus events
 *   setAccount(accountName) - update the account selector display
 *   getAccount() - return current account name
 *   getEquity() - return the current equity snapshot
 *   setStatusLight(name, active, error) - update DATA/BOT/TRAI state
 *   setRiskBudget(percent, level) - update risk gauge (SAFE/WARN/DANGER)
 *   teardown() - remove DOM, listeners, styles
 *   _compute() - debug helper: return internal state snapshot
 *
 * @typedef {Object} HeaderState
 * @property {number} equity - current account equity
 * @property {number} equityDelta - session P&L in dollars
 * @property {number} equityDeltaPercent - session P&L in percent
 * @property {number} riskBudget - 0..100 percentage
 * @property {string} riskLevel - 'SAFE' | 'WARN' | 'DANGER'
 * @property {Object} statusLights - {data, bot, trai}; each {active: bool, error: bool}
 * @property {string} currentAccount - account display name or 'default'
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

    // Brand colors - must match CSS variables
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

        // Account equity hero (real account dollars, NOT asset price)
        equity: 0,                 // explicit account equity
        unrealizedPnL: 0,
        sessionTotalPnL: 0,        // totalPnL since session open
        sessionOpenEquity: 0,      // captured on first state_update - for risk %
        sessionTradeCount: 0,
        sessionWins: 0,
        sessionLosses: 0,
        priceHistory: [],          // for DATA-light idle detection
        externalRiskOverride: null,// non-null = use external RiskGauge value

        // Risk budget - auto-derived unless external override fires
        riskBudget: 0,             // 0..100 (% of session-open equity burned)
        riskLevel: 'SAFE',         // 'SAFE' | 'WARN' | 'DANGER'

        // Status lights
        statusLights: {
            data: { active: false, error: false, lastPulse: 0 },
            bot:  { active: false, error: false, lastPulse: 0 },
            trai: { active: false, error: false, lastPulse: 0 },
        },
        idleTimers: { data: null, bot: null, trai: null },

        // Account selector
        currentAccount: DEFAULT_ACCOUNT,

        // DOM caches
        domRefs: {
            root: null,
            heroPriceMain: null,
            heroPriceDelta: null,
            heroSessionMeta: null,
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

    // Event cadences differ: price feed should stale fast, bot/narrator can be quieter.
    const LIGHT_IDLE_MS_BY_KIND = {
        data: 5000,
        bot: 15000,
        trai: 15000,
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
                height: 66px;
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

            /* #51 brand-shrink: 40px logo dwarfed the 36px hero price; pulled to
               24px so the brand identifies but the hero number wins the eye.
               Diamond ornament + tagline scaled in proportion. */
            .hs-logo {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 45%, #b91c1c 75%, #ef4444 100%);
                background-clip: text;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                color: transparent;
                font-family: 'Orbitron', monospace;
                font-size: 24px;
                font-weight: 900;
                letter-spacing: 2.5px;
                text-transform: uppercase;
                line-height: 1;
                filter: drop-shadow(0 0 10px rgba(220, 38, 38, 0.4))
                        drop-shadow(0 0 4px rgba(0, 0, 0, 0.85));
                display: inline-flex;
                align-items: center;
                gap: 9px;
            }

            .hs-logo::before {
                content: '';
                display: inline-block;
                width: 10px;
                height: 10px;
                transform: rotate(45deg);
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                box-shadow: 0 0 8px rgba(220, 38, 38, 0.55),
                            0 0 0 1px rgba(255, 255, 255, 0.10) inset;
                filter: drop-shadow(0 0 4px rgba(220, 38, 38, 0.55));
            }

            .hs-tagline {
                color: #a8a8a8;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 1.4px;
                margin-top: 3px;
                text-shadow: 0 0 4px rgba(220, 38, 38, 0.18);
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

            .hs-hero-session-meta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #6b7280;
                margin-top: 2px;
                letter-spacing: 1.2px;
                text-transform: uppercase;
            }
            .hs-hero-session-meta .hs-meta-key { color: #6b7280; }
            .hs-hero-session-meta .hs-meta-val { color: #d1d5db; margin-left: 4px; margin-right: 12px; }
            .hs-hero-session-meta .hs-meta-val.pos { color: #22c55e; }
            .hs-hero-session-meta .hs-meta-val.neg { color: #ef4444; }
            .hs-hero-session-meta .hs-meta-val.warn { color: #fbbf24; }

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
                gap: 16px;
                flex: 0 0 auto;
                margin-left: auto;
                justify-self: end;
            }

            .hs-status-lights-bar {
                display: flex;
                gap: 18px;
                align-items: center;
                background: rgba(0, 0, 0, 0.5);
                padding: 9px 18px;
                border-radius: 22px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .hs-status-light {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.6px;
            }

            .hs-status-light .hs-light {
                width: 12px;
                height: 12px;
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
                padding: 7px 14px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                min-width: 78px;
            }

            .hs-risk-budget-percent {
                font-family: 'Orbitron', monospace;
                font-size: 16px;
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
                <div class="hs-hero-price-main" id="hsHeroPriceMain">$--.--</div>
                <div class="hs-hero-price-delta" id="hsHeroPriceDelta">awaiting state_update</div>
                <div class="hs-hero-session-meta" id="hsHeroSessionMeta">
                    <span class="hs-meta-key">trades</span><span class="hs-meta-val" data-k="trades">0</span>
                    <span class="hs-meta-key">win</span><span class="hs-meta-val" data-k="win">--</span>
                    <span class="hs-meta-key">unr</span><span class="hs-meta-val" data-k="unr">$0.00</span>
                </div>
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

                <div class="hs-risk-budget" title="Risk budget - how much of your session-opening equity has been drawn down. The percentage is current drawdown; the label escalates SAFE -> WARN -> DANGER as it grows.">
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
        state.domRefs.heroSessionMeta = root.querySelector('#hsHeroSessionMeta');
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
        // Hero: account equity (NOT asset price - that's on the chart panel).
        // Show '$--.--' until first state_update arrives so we never lie about
        // a zero balance from cold-boot.
        if (state.domRefs.heroPriceMain) {
            if (state.sessionOpenEquity > 0 || state.equity > 0) {
                state.domRefs.heroPriceMain.textContent = `$${Number(state.equity).toLocaleString(undefined, {
                    minimumFractionDigits: 2, maximumFractionDigits: 2
                })}`;
            } else {
                state.domRefs.heroPriceMain.textContent = '$--.--';
            }
            state.domRefs.heroPriceMain.classList.toggle('neg', state.equity < state.sessionOpenEquity);
        }

        // Delta: session P&L vs session-open equity
        if (state.domRefs.heroPriceDelta) {
            if (state.sessionOpenEquity > 0) {
                const delta = state.equity - state.sessionOpenEquity;
                const deltaPct = (delta / state.sessionOpenEquity) * 100;
                const sign = delta >= 0 ? '+' : '';
                state.domRefs.heroPriceDelta.textContent =
                    `${sign}$${delta.toFixed(2)} (${sign}${deltaPct.toFixed(2)}%) session`;
                const isNeg = delta < 0;
                state.domRefs.heroPriceDelta.classList.toggle('pos', !isNeg);
                state.domRefs.heroPriceDelta.classList.toggle('neg', isNeg);
            } else {
                state.domRefs.heroPriceDelta.textContent = 'awaiting state_update';
                state.domRefs.heroPriceDelta.classList.remove('pos', 'neg');
            }
        }

        // Session meta line: trades, win%, unrealized P&L
        if (state.domRefs.heroSessionMeta) {
            const tradesEl = state.domRefs.heroSessionMeta.querySelector('[data-k="trades"]');
            const winEl    = state.domRefs.heroSessionMeta.querySelector('[data-k="win"]');
            const unrEl    = state.domRefs.heroSessionMeta.querySelector('[data-k="unr"]');
            if (tradesEl) tradesEl.textContent = String(state.sessionTradeCount);
            if (winEl) {
                if (state.sessionTradeCount > 0) {
                    const wp = (state.sessionWins / state.sessionTradeCount) * 100;
                    winEl.textContent = `${wp.toFixed(0)}%`;
                    winEl.classList.toggle('pos', wp >= 60);
                    winEl.classList.toggle('warn', wp >= 40 && wp < 60);
                    winEl.classList.toggle('neg', wp < 40);
                } else {
                    winEl.textContent = '--';
                    winEl.classList.remove('pos', 'warn', 'neg');
                }
            }
            if (unrEl) {
                const u = Number(state.unrealizedPnL || 0);
                const sign = u >= 0 ? '+' : '';
                unrEl.textContent = `${sign}$${u.toFixed(2)}`;
                unrEl.classList.toggle('pos', u > 0);
                unrEl.classList.toggle('neg', u < 0);
            }
        }

        // Update status lights
        updateStatusLightDOM('data');
        updateStatusLightDOM('bot');
        updateStatusLightDOM('trai');

        // Update risk budget
        if (state.domRefs.riskBudgetPercent) {
            state.domRefs.riskBudgetPercent.textContent = `${Math.round(state.riskBudget)}%`;
            state.domRefs.riskBudgetPercent.className = `hs-risk-budget-percent ${state.riskLevel.toLowerCase()}`;
        }
        if (state.domRefs.riskBudgetLevel) {
            state.domRefs.riskBudgetLevel.textContent = state.riskLevel;
            state.domRefs.riskBudgetLevel.className = `hs-risk-budget-level ${state.riskLevel.toLowerCase()}`;
        }
    }

    // Auto-derive risk meter from session drawdown (if no external override).
    // Risk = % of session-open equity currently burned (cap at 100).
    function recomputeRiskBudget() {
        if (state.externalRiskOverride != null) return; // external module wins
        if (state.sessionOpenEquity <= 0) {
            state.riskBudget = 0;
            state.riskLevel = 'SAFE';
            return;
        }
        const drawdown = Math.max(0, state.sessionOpenEquity - state.equity);
        const pct = Math.min(100, (drawdown / state.sessionOpenEquity) * 100);
        state.riskBudget = pct;
        if (pct >= 50) state.riskLevel = 'DANGER';
        else if (pct >= 20) state.riskLevel = 'WARN';
        else state.riskLevel = 'SAFE';
    }

    // Pulse a status light + arm idle timer to dim it after silence.
    function pulseLight(name) {
        const lt = state.statusLights[name];
        if (!lt) return;
        lt.active = true;
        lt.error = false;
        lt.lastPulse = Date.now();
        const old = state.idleTimers[name];
        if (old) clearTimeout(old);
        state.idleTimers[name] = setTimeout(() => {
            lt.active = false;
            updateDisplay();
        }, LIGHT_IDLE_MS_BY_KIND[name] || 5000);
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

    // ─── WS Event Handlers (real bot emitter shapes) ────────────────────

    // 'price' tick - DATA light heartbeat only. The asset price itself lives
    // on the chart panel; we don't want to misuse the equity hero for it.
    function handlePrice(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const p = parseFloat(data && (data.price != null ? data.price : data.c));
            if (isNaN(p) || p <= 0) return;
            state.priceHistory.push(p);
            if (state.priceHistory.length > PRICE_HISTORY_SIZE) state.priceHistory.shift();
            pulseLight('data');
            updateDisplay();
        } catch (_) { /* swallow */ }
    }

    // 'state_update' - StateManager's authoritative account snapshot.
    // Drives equity hero, session P&L delta, win-rate, risk meter.
    function handleStateUpdate(d) {
        try {
            const s = d && d.state ? d.state : (d && d.data && d.data.state) ? d.data.state : null;
            if (!s) return;

            const equity  = Number(s.equity);
            if (!isFinite(equity) || equity <= 0) return;
            const unr     = Number(s.unrealizedPnL || 0);
            const totPnL  = Number(s.totalPnL || 0);
            const trades  = Number(s.tradeCount || 0);

            const prevEquity = state.equity;
            state.unrealizedPnL = unr;
            state.equity = equity;
            state.sessionTotalPnL = totPnL;
            state.sessionTradeCount = trades;

            // Capture session-open equity on first real state_update.
            // Walk back to the pre-PnL principal so the % delta is correct
            // regardless of when the dashboard joined the session.
            if (state.sessionOpenEquity === 0) {
                state.sessionOpenEquity = equity - totPnL;
                if (state.sessionOpenEquity <= 0) state.sessionOpenEquity = equity;
            }

            // Recovery mode = bot self-flagged drawdown trigger -> DANGER lock
            if (s.recoveryMode && state.externalRiskOverride == null) {
                state.riskLevel = 'DANGER';
                state.riskBudget = Math.max(state.riskBudget, 50);
            } else {
                recomputeRiskBudget();
            }

            // Flash hero on equity change
            if (state.domRefs.heroPriceMain && Math.abs(state.equity - prevEquity) > 0.005) {
                const dir = state.equity >= prevEquity ? 'flash-up' : 'flash-down';
                state.domRefs.heroPriceMain.classList.remove('flash-up', 'flash-down');
                state.domRefs.heroPriceMain.classList.add(dir);
                setTimeout(() => {
                    state.domRefs.heroPriceMain &&
                        state.domRefs.heroPriceMain.classList.remove(dir);
                }, PRICE_FLASH_MS);
            }

            updateDisplay();
        } catch (_) { /* swallow */ }
    }

    // 'balance_update' - equity fallback for dashboards that arrive after StateManager.
    // Shape: { type:'balance_update', equity }
    function handleBalanceUpdate(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            const equity = Number(data && data.equity);
            if (!isFinite(equity) || equity <= 0) return;
            state.equity = equity;
            if (state.sessionOpenEquity === 0) state.sessionOpenEquity = equity;
            recomputeRiskBudget();
            updateDisplay();
        } catch (_) { /* swallow */ }
    }

    // 'bot_thinking' - BOT light heartbeat. We don't render the reasoning
    // here (Intelligence/HUD modules own that); we only use this as proof
    // of life for the BOT pill.
    function handleBotThinking(_d) {
        pulseLight('bot');
        updateDisplay();
    }

    // 'narrator_event' - TRAI heartbeat. Also drives a light pulse only.
    function handleNarratorEvent(_d) {
        pulseLight('trai');
        updateDisplay();
    }

    // 'trade' - session win/loss tally. Bot shape:
    //   { type:'trade', action:'BUY'|'SELL', direction, price, pnl, timestamp, confidence }
    // Only SELL events carry final pnl (BUY pnl is 0). Count both as a trade
    // increment; classify win/loss strictly by SELL.pnl sign.
    function handleTrade(d) {
        try {
            const data = (d && d.data) ? d.data : d;
            if (data.action === 'SELL') {
                const pnl = Number(data.pnl || 0);
                if (pnl > 0) state.sessionWins++;
                else if (pnl < 0) state.sessionLosses++;
            }
            // Do not increment sessionTradeCount here - state_update.tradeCount
            // is authoritative and arrives right after each trade. Avoids
            // double-counting if both fire.
            updateDisplay();
        } catch (_) { /* swallow */ }
    }

    // External RiskGauge override (bus event)
    function handleRiskUpdate(data) {
        try {
            if (typeof data === 'string') data = JSON.parse(data);
            const pct = Number(data && data.percent);
            const lvl = data && data.level;
            if (!isFinite(pct)) return;
            state.externalRiskOverride = pct;
            state.riskBudget = Math.max(0, Math.min(100, pct));
            state.riskLevel = lvl || (pct >= 50 ? 'DANGER' : pct >= 20 ? 'WARN' : 'SAFE');
            updateDisplay();
        } catch (_) { /* swallow */ }
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

            // Subscribe to WS events via the real socket (OGZ.get('Socket')).
            // Socket may not be registered yet at panel-init time, so poll briefly
            // and bind once it shows up. Bound subs survive for the page lifetime
            // (websocket.js doesn't currently expose unregisterHandler).
            (function bindSocket() {
                const socket = (OGZ && typeof OGZ.get === 'function') ? OGZ.get('Socket') : null;
                if (!socket || typeof socket.registerHandler !== 'function') {
                    setTimeout(bindSocket, 250);
                    return;
                }
                socket.registerHandler('price', (e) => { try { handlePrice(e); } catch (_) {} });
                socket.registerHandler('state_update', (e) => { try { handleStateUpdate(e); } catch (_) {} });
                socket.registerHandler('balance_update', (e) => { try { handleBalanceUpdate(e); } catch (_) {} });
                socket.registerHandler('bot_thinking', (e) => { try { handleBotThinking(e); } catch (_) {} });
                socket.registerHandler('narrator_event', (e) => { try { handleNarratorEvent(e); } catch (_) {} });
                socket.registerHandler('trade', (e) => { try { handleTrade(e); } catch (_) {} });
            })();

            // Subscribe to bus events (account:change, risk:update)
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
                equity: state.equity,
                unrealizedPnL: state.unrealizedPnL,
                sessionPnL: state.equity - state.sessionOpenEquity,
                sessionPnLPercent: state.sessionOpenEquity > 0
                    ? ((state.equity - state.sessionOpenEquity) / state.sessionOpenEquity) * 100
                    : 0,
                sessionOpenEquity: state.sessionOpenEquity,
                trades: state.sessionTradeCount,
                wins: state.sessionWins,
                losses: state.sessionLosses,
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

            Object.keys(state.idleTimers).forEach(name => {
                if (state.idleTimers[name]) {
                    clearTimeout(state.idleTimers[name]);
                    state.idleTimers[name] = null;
                }
            });
            Object.keys(state.statusLights).forEach(name => {
                state.statusLights[name].active = false;
                state.statusLights[name].error = false;
                state.statusLights[name].lastPulse = 0;
            });

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
                unrealizedPnL: state.unrealizedPnL,
                sessionTotalPnL: state.sessionTotalPnL,
                sessionOpenEquity: state.sessionOpenEquity,
                sessionTradeCount: state.sessionTradeCount,
                sessionWins: state.sessionWins,
                sessionLosses: state.sessionLosses,
                riskBudget: state.riskBudget,
                riskLevel: state.riskLevel,
                externalRiskOverride: state.externalRiskOverride,
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
