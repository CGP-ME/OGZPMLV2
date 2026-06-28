/**
 * run-frontend-empire-v2.js - Dashboard module orchestrator.
 *
 * Empire is not a market-data store and not a trading engine.
 * It tracks frontend module lifecycle, loaded assets, mount presence,
 * WebSocket frame freshness, and symbol-scope hygiene.
 *
 * Phase 1 is intentionally adoptive:
 * - core.js still owns dashboard boot.
 * - panel modules still own their rendered state.
 * - Empire does not call panel init() and cannot double-initialize modules.
 */
(function (OGZ) {
    'use strict';

    const FRAME_STALE_MS = 30000;
    const HEALTH_TICK_MS = 5000;
    const MAX_ERROR_RECORDS = 80;
    const EMPIRE_MODULE = 'Empire';

    const MODULES = [
        { name: 'Core', script: '/js/core.js', required: true },
        { name: 'Indicators', script: '/js/indicators.js', exportName: 'Indicators', required: true },
        { name: 'Socket', script: '/js/websocket.js', exportName: 'Socket', required: true },
        { name: 'DrawingTools', script: '/js/drawing-tools.js', exportName: 'DrawingTools' },
        { name: 'Theme', script: '/js/theme-customizer.js', exportName: 'Theme' },
        { name: 'CommandPalette', script: '/js/command-palette.js', exportName: 'CommandPalette' },
        { name: 'Operator', script: '/js/operator/trade-manager.js', exportName: 'Operator', required: true },

        { name: 'RailResize', script: '/js/panels/rail-resize.js' },
        { name: 'SystemSnapshot', script: '/js/panels/system-snapshot.js' },
        { name: 'AssetTFCard', script: '/js/panels/asset-tf-card.js' },
        { name: 'PatternSparkline', script: '/js/panels/pattern-sparkline.js' },
        { name: 'Heatbar', script: '/js/panels/confidence-heatbar.js', exportName: 'Heatbar', mount: 'confidenceHeatbar' },
        { name: 'RiskGauge', script: '/js/panels/risk-gauge.js', exportName: 'RiskGauge' },
        { name: 'CandleCountdown', script: '/js/panels/candle-countdown.js', exportName: 'CandleCountdown' },
        { name: 'SessionPhase', script: '/js/panels/session-phase.js', exportName: 'SessionPhase' },
        { name: 'SizePreview', script: '/js/panels/size-preview.js', exportName: 'SizePreview' },
        { name: 'StrategyLeaderboard', script: '/js/panels/strategy-leaderboard.js', exportName: 'StrategyLeaderboard', mount: 'strategyLeaderboard' },
        { name: 'TradeLog', script: '/js/panels/trade-log.js', exportName: 'TradeLog' },
        { name: 'SpoofingDetector', script: '/js/panels/spoofing-detector.js' },

        { name: 'WatchlistStrip', script: '/js/panels/watchlist-strip.js', exportName: 'WatchlistStrip', mount: 'watchlistStrip', required: true },
        { name: 'NewsTicker', script: '/js/panels/news-ticker.js', exportName: 'NewsTicker', mount: 'newsTicker' },
        { name: 'PatternCard', script: '/js/panels/pattern-card.js', exportName: 'PatternCard', mount: 'patternCard' },
        { name: 'HeaderStrip', script: '/js/panels/header-strip.js', exportName: 'HeaderStrip', mount: 'dashHeader', required: true },
        { name: 'TRAIBrain', script: '/js/panels/trai-brain.js', exportName: 'TRAIBrain', mount: 'traiBrain' },
        { name: 'OpenPositions', script: '/js/panels/open-positions.js', exportName: 'OpenPositions', mount: 'openPositions', required: true },
        { name: 'ChainOfThought', script: '/js/panels/chain-of-thought.js', exportName: 'ChainOfThought', mount: 'chainOfThought' },
        { name: 'LiveReport', script: '/js/panels/live-report.js', exportName: 'LiveReport', mount: 'liveReport', required: true },
        { name: 'EquityCurve', script: '/js/panels/equity-curve.js', exportName: 'EquityCurve', mount: 'equityCurve' },
        { name: 'SystemHealth', script: '/js/panels/system-health.js', exportName: 'SystemHealth', mount: 'systemHealth' },
        { name: 'LiveReadouts', script: '/js/panels/live-readouts.js', exportName: 'LiveReadouts', mount: 'liveReadouts' },
        { name: 'Celebration', script: '/js/panels/celebration.js', exportName: 'Celebration' },
        { name: 'CustomAlerts', script: '/js/panels/custom-alerts.js', exportName: 'CustomAlerts' },
        { name: 'VictoryAnimations', script: '/js/panels/victory-animations.js', exportName: 'VictoryAnimations' },
        { name: 'LossRecovery', script: '/js/panels/loss-recovery.js', exportName: 'LossRecovery' },
        { name: 'MilestoneEffects', script: '/js/panels/milestone-effects.js', exportName: 'MilestoneEffects' },
        { name: 'VoiceManager', script: '/js/panels/voice-manager.js', exportName: 'VoiceManager' },
        { name: 'VoiceFX', script: '/js/panels/voice-fx.js', exportName: 'VoiceFX' },
        { name: 'AmbientFX', script: '/js/panels/ambient-fx.js', exportName: 'AmbientFX' },
        { name: 'LayoutSwitcher', script: '/js/panels/layout-switcher.js', exportName: 'LayoutSwitcher' },
        { name: 'ChartPanel', script: '/js/panels/chart-panel.js', exportName: 'ChartPanel', mount: 'chartPanel', required: true },
        { name: 'EdgeAnalyticsPanel', script: '/js/panels/edge-analytics-panel.js', exportName: 'EdgeAnalyticsPanel', mount: 'edgeAnalyticsPanel' },
        { name: 'TradeReplay', script: '/js/panels/trade-replay.js', exportName: 'TradeReplay' },
        { name: 'TRAIWidget', script: '/trai-widget.js' },
        { name: EMPIRE_MODULE, script: '/js/run-frontend-empire-v2.js', exportName: EMPIRE_MODULE }
    ];

    const STYLES = [
        '/css/dashboard.css',
        '/css/trading-panel.css',
        '/css/asset-tf-card.css',
        '/css/header-brand.css',
        '/css/golden-proximity.css',
        '/css/pattern-sparkline.css',
        '/css/panels/watchlist-strip.css',
        '/css/panels/news-ticker.css',
        '/css/panels/pattern-card.css',
        '/css/panels/header-strip.css',
        '/css/panels/trai-brain.css',
        '/css/panels/open-positions.css',
        '/css/panels/chain-of-thought.css',
        '/css/panels/equity-curve.css',
        '/css/panels/system-health.css',
        '/css/panels/live-readouts.css',
        '/css/panels/cyberpunk-polish.css',
        '/css/layouts.css',
        '/css/panels/chart-panel.css',
        '/css/panels/edge-analytics-panel.css'
    ];

    const SYMBOL_REQUIRED_FRAMES = new Set([
        'price',
        'delta',
        'historical_candles',
        'pattern_analysis',
        'signal_analysis',
        'ticker_price'
    ]);

    const SCOPE_ACK_FRAMES = new Set([
        'asset_switched'
    ]);

    const SOCKET_FRAME_TYPES = [
        'price',
        'delta',
        'historical_candles',
        'state_update',
        'bot_thinking',
        'narrator_event',
        'trade',
        'trade_closed_replay',
        'journal_snapshot',
        'pattern_analysis',
        'signal_analysis',
        'asset_switched',
        'feed_status',
        'broker_status',
        'balance_update',
        'auth_success',
        'error_event',
        'trace_event',
        'ticker_price',
        'gate_event',
        'broker_ack',
        'broker_reject'
    ];

    const state = {
        initialized: false,
        socketHandlersInstalled: false,
        healthIntervalId: null,
        socketRetryId: null,
        socketRef: null,
        socketBindErrorRecorded: false,
        modules: new Map(),
        assets: new Map(),
        frameSubscribers: new Map(),
        frameFreshness: new Map(),
        frameFreshnessBySymbol: new Map(),
        droppedNoSymbol: new Map(),
        errors: [],
        scope: {
            symbol: null,
            timeframe: null,
            broker: null,
            account: null,
            executionMode: null
        },
        scopeSubscribers: [],
        scopeInputBound: false,
        scopeInputHandler: null,
        watchlistHandler: null
    };

    function nowIso() {
        return new Date().toISOString();
    }

    function recordError(area, message, err, extras) {
        const entry = {
            ts: nowIso(),
            area,
            message,
            error: err && err.stack ? err.stack : (err ? String(err) : null),
            extras: extras || null
        };
        state.errors.push(entry);
        if (state.errors.length > MAX_ERROR_RECORDS) state.errors.shift();
        try {
            console.warn('[Empire] ' + area + ': ' + message, err || '', extras || '');
        } catch (consoleErr) {
            void consoleErr;
        }
        return entry;
    }

    function emitBus(type, payload) {
        if (!OGZ || !OGZ.bus || typeof OGZ.bus.emit !== 'function') return;
        try {
            OGZ.bus.emit(type, payload);
        } catch (err) {
            recordError('bus', 'bus emit failed for ' + type, err);
        }
    }

    function assetPath(rawUrl) {
        try {
            return new URL(rawUrl, window.location.href).pathname;
        } catch (err) {
            recordError('asset', 'invalid asset URL', err, { rawUrl });
            return null;
        }
    }

    function normalizeSymbol(raw) {
        if (raw === null || raw === undefined) return null;
        const value = String(raw).trim().toUpperCase();
        return value || null;
    }

    function extractSymbol(payload) {
        if (!payload) return null;
        if (payload.symbol) return normalizeSymbol(payload.symbol);
        if (payload.data && payload.data.symbol) {
            return normalizeSymbol(payload.data.symbol);
        }
        if (payload.tick && payload.tick.symbol) {
            return normalizeSymbol(payload.tick.symbol);
        }
        return null;
    }

    function extractScope(frame) {
        if (!frame || typeof frame !== 'object') return {};
        const source = frame.data && typeof frame.data === 'object' ? Object.assign({}, frame, frame.data) : frame;
        return {
            symbol: extractSymbol(frame),
            timeframe: source.timeframe || source.tf || null,
            broker: source.broker || source.brokerId || null,
            account: source.account || source.accountId || null,
            executionMode: source.executionMode || source.mode || null
        };
    }

    function setScopeField(field, value, reason) {
        if (!(field in state.scope)) return false;
        const normalized = field === 'symbol' ? normalizeSymbol(value) : (value || null);
        if (state.scope[field] === normalized) return false;
        const previous = state.scope[field];
        state.scope[field] = normalized;
        const event = { field, value: normalized, previous, reason: reason || null, ts: nowIso() };
        for (const cb of state.scopeSubscribers.slice()) {
            try {
                cb(event);
            } catch (err) {
                recordError('scope', 'scope subscriber failed', err, { field });
            }
        }
        emitBus('empire:scope-change', event);
        return true;
    }

    function syncScopeFromFrame(frame, reason, requireSelectableSymbol) {
        const next = extractScope(frame);
        if (requireSelectableSymbol && next.symbol) {
            next.symbol = normalizeSelectedSymbol(next.symbol);
            if (!next.symbol) return false;
        }
        const previousSymbol = state.scope.symbol;
        let changed = false;
        Object.keys(next).forEach((field) => {
            if (next[field]) changed = setScopeField(field, next[field], reason) || changed;
        });
        if (next.symbol && previousSymbol && next.symbol !== previousSymbol) {
            ['timeframe', 'broker', 'account', 'executionMode'].forEach((field) => {
                if (!next[field] && state.scope[field] !== null) {
                    changed = setScopeField(field, null, reason + ':symbol-change-cleared-' + field) || changed;
                }
            });
        }
        return changed;
    }

    function normalizeSelectedSymbol(raw) {
        const symbol = normalizeSymbol(raw);
        if (!symbol) return null;
        const selector = document.getElementById('cp-assetSelector');
        if (!selector || !selector.options || selector.options.length === 0) return symbol;
        const optionExists = (value) => Array.prototype.some.call(
            selector.options,
            (opt) => normalizeSymbol(opt.value) === value
        );
        if (optionExists(symbol)) return symbol;
        const usdSymbol = symbol + '-USD';
        if (optionExists(usdSymbol)) return usdSymbol;
        return null;
    }

    function setSelectedScope(rawSymbol, broker, reason) {
        const symbol = normalizeSelectedSymbol(rawSymbol);
        if (!symbol) return false;
        let changed = setScopeField('symbol', symbol, reason);
        if (broker) changed = setScopeField('broker', broker, reason) || changed;
        return changed;
    }

    function bindExplicitScopeInputs() {
        if (state.scopeInputBound) return;
        const bind = () => {
            if (state.scopeInputBound) return;
            const selector = document.getElementById('cp-assetSelector');
            if (selector && typeof selector.addEventListener === 'function') {
                state.scopeInputHandler = function () {
                    setSelectedScope(selector.value, null, 'chart-selector');
                };
                selector.addEventListener('change', state.scopeInputHandler);
                setSelectedScope(selector.value, null, 'chart-selector:init');
            }
            if (OGZ && OGZ.bus && typeof OGZ.bus.on === 'function') {
                state.watchlistHandler = function (payload) {
                    const symbol = payload && payload.symbol
                        ? payload.symbol
                        : (typeof payload === 'string' ? payload : null);
                    const broker = payload && payload.broker ? payload.broker : null;
                    setSelectedScope(symbol, broker, 'watchlist:select');
                };
                OGZ.bus.on('watchlist:select', state.watchlistHandler);
            }
            state.scopeInputBound = !!state.scopeInputHandler || !!state.watchlistHandler;
        };
        bind();
        if (!state.scopeInputBound) {
            window.setTimeout(bind, 0);
        }
    }

    function scriptElements() {
        return Array.from(document.querySelectorAll('script[src]'));
    }

    function styleElements() {
        return Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
    }

    function loadedScriptPaths() {
        const paths = new Set();
        scriptElements().forEach((el) => {
            const path = assetPath(el.src);
            if (path) paths.add(path);
        });
        return paths;
    }

    function loadedStylePaths() {
        const paths = new Set();
        styleElements().forEach((el) => {
            const path = assetPath(el.href);
            if (path) paths.add(path);
        });
        return paths;
    }

    function moduleExport(name) {
        try {
            return OGZ && typeof OGZ.get === 'function' ? OGZ.get(name) : null;
        } catch (err) {
            recordError('module', 'OGZ.get failed', err, { name });
            return null;
        }
    }

    function mountPresent(mountId) {
        if (!mountId) return null;
        return !!document.getElementById(mountId);
    }

    function refreshAssetStatus() {
        const scripts = loadedScriptPaths();
        const styles = loadedStylePaths();
        const next = new Map();

        MODULES.forEach((spec) => {
            next.set(spec.script, {
                kind: 'script',
                path: spec.script,
                module: spec.name,
                required: !!spec.required,
                loaded: scripts.has(spec.script)
            });
        });

        STYLES.forEach((path) => {
            next.set(path, {
                kind: 'style',
                path,
                module: null,
                required: true,
                loaded: styles.has(path)
            });
        });

        state.assets = next;
        return next;
    }

    function refreshModuleStatus() {
        const modules = new Map();
        MODULES.forEach((spec) => {
            const loaded = state.assets.get(spec.script);
            const exported = spec.exportName ? !!moduleExport(spec.exportName) : null;
            const mountOk = mountPresent(spec.mount);
            let status = 'loaded';
            if (loaded && !loaded.loaded) status = 'asset-missing';
            else if (spec.exportName && !exported) status = 'export-missing';
            else if (mountOk === false) status = 'mount-missing';
            else if (spec.exportName) status = 'registered';

            modules.set(spec.name, {
                name: spec.name,
                script: spec.script,
                exportName: spec.exportName || null,
                mount: spec.mount || null,
                required: !!spec.required,
                loaded: loaded ? loaded.loaded : false,
                exported,
                mountPresent: mountOk,
                status
            });
        });
        state.modules = modules;
        return modules;
    }

    function refreshInventory() {
        refreshAssetStatus();
        refreshModuleStatus();
    }

    function addFreshness(eventType, symbol) {
        const ts = Date.now();
        const item = state.frameFreshness.get(eventType) || { count: 0, lastTs: null, lastSymbol: null };
        item.count += 1;
        item.lastTs = ts;
        item.lastSymbol = symbol || null;
        state.frameFreshness.set(eventType, item);

        if (!symbol) return;
        let bySymbol = state.frameFreshnessBySymbol.get(eventType);
        if (!bySymbol) {
            bySymbol = new Map();
            state.frameFreshnessBySymbol.set(eventType, bySymbol);
        }
        const symItem = bySymbol.get(symbol) || { count: 0, lastTs: null };
        symItem.count += 1;
        symItem.lastTs = ts;
        bySymbol.set(symbol, symItem);
    }

    function dispatchFrame(eventType, frame) {
        const subscribers = state.frameSubscribers.get(eventType);
        if (!subscribers || !subscribers.length) return;
        subscribers.slice().forEach((sub) => {
            try {
                sub.fn(frame);
            } catch (err) {
                recordError('frame', 'frame subscriber failed', err, {
                    moduleName: sub.moduleName,
                    eventType
                });
            }
        });
    }

    function routeFrame(eventType, frame) {
        const symbol = extractSymbol(frame);
        if (SYMBOL_REQUIRED_FRAMES.has(eventType) && !symbol) {
            const count = (state.droppedNoSymbol.get(eventType) || 0) + 1;
            state.droppedNoSymbol.set(eventType, count);
            emitBus('empire:frame-rejected', {
                eventType,
                reason: 'missing-symbol',
                count,
                ts: nowIso()
            });
            return false;
        }

        if (SCOPE_ACK_FRAMES.has(eventType)) {
            syncScopeFromFrame(frame, 'frame:' + eventType, true);
        }
        addFreshness(eventType, symbol);

        const routed = symbol ? Object.assign({}, frame, { _empireSymbol: symbol }) : frame;
        dispatchFrame(eventType, routed);
        return true;
    }

    function installSocketHandlers() {
        const socket = moduleExport('Socket');
        if (state.socketHandlersInstalled && state.socketRef === socket) return true;
        if (!socket || typeof socket.registerHandler !== 'function') {
            if (!state.socketBindErrorRecorded) {
                recordError('socket', 'Socket.registerHandler unavailable during Empire bind');
                state.socketBindErrorRecorded = true;
            }
            return false;
        }

        SOCKET_FRAME_TYPES.forEach((eventType) => {
            socket.registerHandler(eventType, (frame) => {
                if (!state.initialized) return;
                try {
                    routeFrame(eventType, frame);
                } catch (err) {
                    recordError('socket', 'frame route failed', err, { eventType });
                }
            });
        });

        state.socketHandlersInstalled = true;
        state.socketRef = socket;
        state.socketBindErrorRecorded = false;
        return true;
    }

    function scheduleSocketBindRetry() {
        if (state.socketRetryId) return;
        state.socketRetryId = window.setTimeout(() => {
            state.socketRetryId = null;
            if (!state.initialized) return;
            if (!installSocketHandlers()) scheduleSocketBindRetry();
        }, 250);
    }

    function bindToSocket() {
        if (installSocketHandlers()) return true;
        scheduleSocketBindRetry();
        return false;
    }

    function ensureHealthInterval() {
        if (state.healthIntervalId) return;
        state.healthIntervalId = window.setInterval(() => {
            emitBus('empire:health', health());
        }, HEALTH_TICK_MS);
    }

    function frameSnapshot() {
        const frames = {};
        const now = Date.now();
        state.frameFreshness.forEach((value, eventType) => {
            const bySymbol = {};
            const symbolMap = state.frameFreshnessBySymbol.get(eventType);
            if (symbolMap) {
                symbolMap.forEach((symValue, symbol) => {
                    bySymbol[symbol] = {
                        count: symValue.count,
                        lastTs: symValue.lastTs,
                        ageMs: symValue.lastTs ? now - symValue.lastTs : null,
                        stale: symValue.lastTs ? (now - symValue.lastTs) > FRAME_STALE_MS : null
                    };
                });
            }
            frames[eventType] = {
                count: value.count,
                lastTs: value.lastTs,
                lastSymbol: value.lastSymbol,
                ageMs: value.lastTs ? now - value.lastTs : null,
                stale: value.lastTs ? (now - value.lastTs) > FRAME_STALE_MS : null,
                bySymbol
            };
        });
        return frames;
    }

    function mapToObject(map) {
        const out = {};
        map.forEach((value, key) => { out[key] = value; });
        return out;
    }

    function missingRequiredAssets() {
        const missing = [];
        state.assets.forEach((asset) => {
            if (asset.required && !asset.loaded) missing.push(asset);
        });
        return missing;
    }

    function health() {
        refreshInventory();
        return {
            initialized: state.initialized,
            socketHandlersInstalled: state.socketHandlersInstalled,
            socketRefPresent: !!state.socketRef,
            modules: mapToObject(state.modules),
            assets: mapToObject(state.assets),
            missingRequiredAssets: missingRequiredAssets(),
            frames: frameSnapshot(),
            droppedNoSymbol: mapToObject(state.droppedNoSymbol),
            scope: Object.assign({}, state.scope),
            errors: state.errors.slice(),
            ts: nowIso()
        };
    }

    const Empire = {
        init: function () {
            if (state.initialized) return health();
            state.initialized = true;
            refreshInventory();
            bindExplicitScopeInputs();
            bindToSocket();
            ensureHealthInterval();
            emitBus('empire:ready', health());
            return health();
        },

        teardown: function () {
            state.initialized = false;
            if (state.socketRetryId) {
                window.clearTimeout(state.socketRetryId);
                state.socketRetryId = null;
            }
            if (state.healthIntervalId) {
                window.clearInterval(state.healthIntervalId);
                state.healthIntervalId = null;
            }
            const selector = document.getElementById('cp-assetSelector');
            if (selector && state.scopeInputHandler) {
                selector.removeEventListener('change', state.scopeInputHandler);
            }
            if (OGZ && OGZ.bus && typeof OGZ.bus.off === 'function' && state.watchlistHandler) {
                OGZ.bus.off('watchlist:select', state.watchlistHandler);
            }
            state.scopeInputHandler = null;
            state.watchlistHandler = null;
            state.scopeInputBound = false;
            state.frameSubscribers.clear();
            emitBus('empire:teardown', { ts: nowIso() });
        },

        bootAll: function () {
            return health();
        },

        health,

        getManifest: function () {
            return {
                modules: MODULES.map((item) => Object.assign({}, item)),
                styles: STYLES.slice()
            };
        },

        getScope: function (field) {
            if (!field) return Object.assign({}, state.scope);
            return Object.prototype.hasOwnProperty.call(state.scope, field) ? state.scope[field] : null;
        },

        setScope: function (field, value) {
            if (typeof field === 'object' && field) {
                let changed = false;
                Object.keys(field).forEach((key) => {
                    changed = setScopeField(key, field[key], 'manual') || changed;
                });
                return changed;
            }
            return setScopeField(field, value, 'manual');
        },

        onScopeChange: function (fn) {
            if (typeof fn !== 'function') return function noop() {};
            if (!state.scopeSubscribers.includes(fn)) state.scopeSubscribers.push(fn);
            return function unsubscribe() {
                const idx = state.scopeSubscribers.indexOf(fn);
                if (idx >= 0) state.scopeSubscribers.splice(idx, 1);
            };
        },

        subscribeFrame: function (moduleName, eventType, fn) {
            if (!moduleName || !eventType || typeof fn !== 'function') {
                recordError('frame', 'invalid frame subscription', null, { moduleName, eventType });
                return function noop() {};
            }
            let subscribers = state.frameSubscribers.get(eventType);
            if (!subscribers) {
                subscribers = [];
                state.frameSubscribers.set(eventType, subscribers);
            }
            if (!subscribers.some((sub) => sub.moduleName === moduleName && sub.fn === fn)) {
                subscribers.push({ moduleName, fn });
            }
            return function unsubscribe() {
                const current = state.frameSubscribers.get(eventType) || [];
                state.frameSubscribers.set(eventType, current.filter((sub) => !(sub.moduleName === moduleName && sub.fn === fn)));
            };
        },

        unsubscribeFramesByModule: function (moduleName) {
            state.frameSubscribers.forEach((subscribers, eventType) => {
                state.frameSubscribers.set(eventType, subscribers.filter((sub) => sub.moduleName !== moduleName));
            });
        },

        routeFrame: routeFrame,

        droppedFrames: function () {
            return mapToObject(state.droppedNoSymbol);
        },

        _compute: health
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register(EMPIRE_MODULE, Empire);
    } else {
        recordError('register', 'OGZ.register unavailable during Empire load');
    }

    try {
        window.OGZEmpire = Empire;
    } catch (err) {
        recordError('register', 'failed to expose window.OGZEmpire', err);
    }
})(window.OGZ = window.OGZ || {});
