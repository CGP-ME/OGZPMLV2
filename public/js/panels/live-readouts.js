/**
 * live-readouts.js — LiveReadouts: 6-Cell Technical Indicator Readout Grid
 *
 * Real-time display of core technical indicators (RSI, MACD, ATR, Volume, Live Conf, Pattern).
 * Extracted from unified-dashboard.html's inline "Live Readouts" section to become the tenth
 * shipped modular panel after NewsTicker, WatchlistStrip, PatternCard, HeaderStrip, TRAIBrain,
 * OpenPositions, ChainOfThought, EquityCurve, and SystemHealth.
 *
 * What it renders:
 *   - 2 rows × 3 columns grid of indicator cells
 *   - RSI (color-coded: green neutral, gold warn, red extreme)
 *   - MACD (green positive, red negative, with +/- sign)
 *   - ATR (absolute volatility value)
 *   - VOLUME (formatted for readability: K, M notation)
 *   - LIVE CONF (confidence percentage with mini progress bar in --core-color)
 *   - PATTERN (current detected pattern name or "Scanning...")
 *
 * Each cell animates a subtle gold flash on value update (lr-cell-flash, 300ms).
 * Cells show "--" when no data available; briefly clear on symbol change.
 *
 * Self-registers as OGZ.LiveReadouts via OGZ.register().
 * Mounts into <div id="liveReadouts"></div>.
 * Subscribes to WS events:
 *   - price — extracts data.indicators (RSI, MACD, ATR, Volume) and data.confidence if present
 *   - signal_analysis — updates LIVE CONF if data.modules.orchestrator.confidence exists
 *   - pattern_analysis — updates PATTERN with data.pattern.name
 * Listens to OGZ.bus events:
 *   - watchlist:select — clears all cells to "--" briefly when symbol changes
 *
 * Graceful fallback: all cells show "--" until first data arrives.
 * No console.log in production code. All updates are cell-only (no full re-render).
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   setSymbol(symbol) — Update currentSymbol state (called on watchlist:select)
 *   updateRSI(value) — Update RSI cell with numeric value
 *   updateMACD(value) — Update MACD cell with numeric value (+/-)
 *   updateATR(value) — Update ATR cell with numeric value
 *   updateVolume(value) — Update VOLUME cell with numeric value (auto-formatted)
 *   updateLiveConf(value) — Update LIVE CONF cell with percentage (0-100)
 *   updatePattern(name) — Update PATTERN cell with pattern name string
 *   clearAll() — Reset all cells to "--"
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return current state snapshot
 *
 * EXTRACTION SOURCE WARNING:
 *   This module was extracted from public/unified-dashboard.html (workspace 3) inline
 *   "Live Readouts" section (lines 3266-3290, HTML) with attendant inline CSS (grid,
 *   cell styling, font, colors). If the operator's monolith has drifted since baseline
 *   (3), the visual layout or element ID names may differ; this module's JS logic should
 *   still function because it drives cell updates via WS events, not HTML structure.
 *   On visual mismatch, compare the v2 shell mount point (unified-dashboard-v2.html:506)
 *   with the original HTML and adjust grid layout / class names as needed.
 *
 * @typedef {Object} ReadoutValue
 * @property {number|string} value - The metric value (number or formatted string like "2.4M")
 * @property {number} [timestamp] - Unix epoch milliseconds when last updated
 * @property {number} [flashUntil] - Unix epoch milliseconds until flash animation ends
 *
 * @module public/js/panels/live-readouts
 */
(function (OGZ) {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────
    const STYLE_ID = 'ogz-live-readouts-styles';
    const ROOT_ID = 'liveReadouts';
    const CELL_FLASH_MS = 300;  // Duration of gold flash on value update
    const DEFAULT_SYMBOL = 'UNKNOWN';

    // RSI color thresholds (neutral 30-70, warn 20-30 / 70-80, extreme <20 or >80)
    const RSI_NEUTRAL_MIN = 30;
    const RSI_NEUTRAL_MAX = 70;
    const RSI_WARN_LOW = 20;
    const RSI_WARN_HIGH = 80;

    // ─── Private State ──────────────────────────────────────────────────
    const state = {
        mounted: false,
        currentSymbol: DEFAULT_SYMBOL,
        rsi: '--',
        macd: '--',
        atr: '--',
        volume: '--',
        liveConf: '--',
        pattern: 'Scanning...',
        // Cell DOM references
        rsiCell: null,
        macdCell: null,
        atrCell: null,
        volumeCell: null,
        liveConfCell: null,
        liveConfBar: null,
        patternCell: null,
    };

    // ─── CSS Injection ───────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            #${ROOT_ID} {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                grid-template-rows: auto auto;
                gap: 8px 12px;
                padding: 12px;
                background: var(--glass-bg, rgba(15, 15, 18, 0.55));
                border: 1px solid var(--glass-border, rgba(255, 215, 0, 0.18));
                border-radius: 8px;
                font-size: 12px;
            }

            .lr-cell {
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid var(--glass-border, rgba(255, 215, 0, 0.1));
                border-radius: 6px;
                text-align: center;
            }

            .lr-label {
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary, #a1a1aa);
            }

            .lr-value {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 700;
                color: var(--text-primary, #e4e4e7);
                min-height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* RSI color logic */
            .lr-value.rsi-neutral {
                color: var(--profit-color, #00ff88);
            }

            .lr-value.rsi-warn {
                color: var(--ml-color, #ffd700);
            }

            .lr-value.rsi-extreme {
                color: var(--loss-color, #ff3366);
            }

            /* MACD color logic */
            .lr-value.macd-positive {
                color: var(--profit-color, #00ff88);
            }

            .lr-value.macd-negative {
                color: var(--loss-color, #ff3366);
            }

            /* Live Conf progress bar */
            .lr-conf-wrapper {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .lr-conf-bar {
                width: 100%;
                height: 3px;
                background: rgba(0, 255, 136, 0.15);
                border-radius: 2px;
                overflow: hidden;
            }

            .lr-conf-fill {
                height: 100%;
                background: var(--core-color, #00d9ff);
                border-radius: 2px;
                transition: width 0.3s ease;
            }

            /* Cell flash animation on update */
            @keyframes lr-cell-flash {
                0% {
                    background: rgba(255, 255, 255, 0.02);
                }
                50% {
                    background: rgba(255, 215, 0, 0.12);
                }
                100% {
                    background: rgba(255, 255, 255, 0.02);
                }
            }

            .lr-cell.lr-flashing {
                animation: lr-cell-flash ${CELL_FLASH_MS}ms ease-out forwards;
            }

            /* Responsive on small screens */
            @media (max-width: 600px) {
                #${ROOT_ID} {
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px 10px;
                    padding: 8px;
                    font-size: 10px;
                }

                .lr-value {
                    font-size: 12px;
                }

                .lr-label {
                    font-size: 8px;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Format Helpers ─────────────────────────────────────────────────
    function formatVolume(val) {
        if (!isFinite(val) || val <= 0) return '--';
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return val.toFixed(0);
    }

    function getRSIColorClass(val) {
        if (!isFinite(val)) return '';
        if (val >= RSI_NEUTRAL_MIN && val <= RSI_NEUTRAL_MAX) {
            return 'rsi-neutral';
        } else if ((val >= RSI_WARN_LOW && val < RSI_NEUTRAL_MIN) || (val > RSI_NEUTRAL_MAX && val <= RSI_WARN_HIGH)) {
            return 'rsi-warn';
        } else {
            return 'rsi-extreme';
        }
    }

    function getMACSColorClass(val) {
        if (!isFinite(val)) return '';
        return val > 0 ? 'macd-positive' : 'macd-negative';
    }

    function flashCell(cell) {
        if (!cell) return;
        cell.classList.remove('lr-flashing');
        // Trigger reflow to restart animation
        void cell.offsetWidth;
        cell.classList.add('lr-flashing');
    }

    // ─── DOM Rendering ──────────────────────────────────────────────────
    function render() {
        if (!state.mounted) return;

        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        root.innerHTML = '';

        // RSI Cell
        const rsiCellDiv = document.createElement('div');
        rsiCellDiv.className = 'lr-cell';
        const rsiLabel = document.createElement('div');
        rsiLabel.className = 'lr-label';
        rsiLabel.textContent = 'RSI';
        const rsiValue = document.createElement('div');
        rsiValue.className = 'lr-value';
        rsiValue.textContent = String(state.rsi);
        rsiCellDiv.appendChild(rsiLabel);
        rsiCellDiv.appendChild(rsiValue);
        root.appendChild(rsiCellDiv);
        state.rsiCell = rsiCellDiv;
        const rsiValueSpan = rsiValue;
        Object.defineProperty(state, 'rsiValueSpan', {
            writable: true,
            value: rsiValueSpan,
            enumerable: false,
        });

        // MACD Cell
        const macdCellDiv = document.createElement('div');
        macdCellDiv.className = 'lr-cell';
        const macdLabel = document.createElement('div');
        macdLabel.className = 'lr-label';
        macdLabel.textContent = 'MACD';
        const macdValue = document.createElement('div');
        macdValue.className = 'lr-value';
        macdValue.textContent = String(state.macd);
        macdCellDiv.appendChild(macdLabel);
        macdCellDiv.appendChild(macdValue);
        root.appendChild(macdCellDiv);
        state.macdCell = macdCellDiv;
        Object.defineProperty(state, 'macdValueSpan', {
            writable: true,
            value: macdValue,
            enumerable: false,
        });

        // ATR Cell
        const atrCellDiv = document.createElement('div');
        atrCellDiv.className = 'lr-cell';
        const atrLabel = document.createElement('div');
        atrLabel.className = 'lr-label';
        atrLabel.textContent = 'ATR';
        const atrValue = document.createElement('div');
        atrValue.className = 'lr-value';
        atrValue.textContent = String(state.atr);
        atrCellDiv.appendChild(atrLabel);
        atrCellDiv.appendChild(atrValue);
        root.appendChild(atrCellDiv);
        state.atrCell = atrCellDiv;
        Object.defineProperty(state, 'atrValueSpan', {
            writable: true,
            value: atrValue,
            enumerable: false,
        });

        // VOLUME Cell
        const volCellDiv = document.createElement('div');
        volCellDiv.className = 'lr-cell';
        const volLabel = document.createElement('div');
        volLabel.className = 'lr-label';
        volLabel.textContent = 'VOLUME';
        const volValue = document.createElement('div');
        volValue.className = 'lr-value';
        volValue.textContent = String(state.volume);
        volCellDiv.appendChild(volLabel);
        volCellDiv.appendChild(volValue);
        root.appendChild(volCellDiv);
        state.volumeCell = volCellDiv;
        Object.defineProperty(state, 'volumeValueSpan', {
            writable: true,
            value: volValue,
            enumerable: false,
        });

        // LIVE CONF Cell
        const confCellDiv = document.createElement('div');
        confCellDiv.className = 'lr-cell';
        const confLabel = document.createElement('div');
        confLabel.className = 'lr-label';
        confLabel.textContent = 'LIVE CONF';
        const confWrapper = document.createElement('div');
        confWrapper.className = 'lr-conf-wrapper';
        const confValue = document.createElement('div');
        confValue.className = 'lr-value';
        confValue.textContent = String(state.liveConf);
        const confBar = document.createElement('div');
        confBar.className = 'lr-conf-bar';
        const confFill = document.createElement('div');
        confFill.className = 'lr-conf-fill';
        confFill.style.width = '0%';
        confBar.appendChild(confFill);
        confWrapper.appendChild(confValue);
        confWrapper.appendChild(confBar);
        confCellDiv.appendChild(confLabel);
        confCellDiv.appendChild(confWrapper);
        root.appendChild(confCellDiv);
        state.liveConfCell = confCellDiv;
        state.liveConfBar = confFill;
        Object.defineProperty(state, 'confValueSpan', {
            writable: true,
            value: confValue,
            enumerable: false,
        });

        // PATTERN Cell
        const patternCellDiv = document.createElement('div');
        patternCellDiv.className = 'lr-cell';
        const patternLabel = document.createElement('div');
        patternLabel.className = 'lr-label';
        patternLabel.textContent = 'PATTERN';
        const patternValue = document.createElement('div');
        patternValue.className = 'lr-value';
        patternValue.textContent = String(state.pattern);
        patternCellDiv.appendChild(patternLabel);
        patternCellDiv.appendChild(patternValue);
        root.appendChild(patternCellDiv);
        state.patternCell = patternCellDiv;
        Object.defineProperty(state, 'patternValueSpan', {
            writable: true,
            value: patternValue,
            enumerable: false,
        });
    }

    // ─── Update Methods ─────────────────────────────────────────────────
    function updateCell(cellName, value) {
        if (!state.mounted) return;

        let cellDiv = null;
        let valueSpan = null;
        let formattedValue = value;

        switch (cellName) {
            case 'rsi':
                cellDiv = state.rsiCell;
                valueSpan = state.rsiValueSpan;
                if (isFinite(value)) {
                    formattedValue = isFinite(value) ? Number(value).toFixed(0) : '--';
                } else {
                    formattedValue = '--';
                }
                break;
            case 'macd':
                cellDiv = state.macdCell;
                valueSpan = state.macdValueSpan;
                if (isFinite(value)) {
                    formattedValue = (value > 0 ? '+' : '') + Number(value).toFixed(2);
                } else {
                    formattedValue = '--';
                }
                break;
            case 'atr':
                cellDiv = state.atrCell;
                valueSpan = state.atrValueSpan;
                if (isFinite(value)) {
                    formattedValue = Number(value).toFixed(2);
                } else {
                    formattedValue = '--';
                }
                break;
            case 'volume':
                cellDiv = state.volumeCell;
                valueSpan = state.volumeValueSpan;
                formattedValue = isFinite(value) ? formatVolume(value) : '--';
                break;
            case 'liveConf':
                cellDiv = state.liveConfCell;
                valueSpan = state.confValueSpan;
                if (isFinite(value)) {
                    const pct = Math.max(0, Math.min(100, Number(value)));
                    formattedValue = pct.toFixed(0) + '%';
                    if (state.liveConfBar) {
                        state.liveConfBar.style.width = pct + '%';
                    }
                } else {
                    formattedValue = '--';
                    if (state.liveConfBar) {
                        state.liveConfBar.style.width = '0%';
                    }
                }
                break;
            case 'pattern':
                cellDiv = state.patternCell;
                valueSpan = state.patternValueSpan;
                formattedValue = String(value || 'Scanning...');
                break;
        }

        if (valueSpan && cellDiv) {
            valueSpan.textContent = String(formattedValue);

            // Update color classes for RSI and MACD
            if (cellName === 'rsi') {
                valueSpan.classList.remove('rsi-neutral', 'rsi-warn', 'rsi-extreme');
                const rsiClass = getRSIColorClass(value);
                if (rsiClass) {
                    valueSpan.classList.add(rsiClass);
                }
            } else if (cellName === 'macd') {
                valueSpan.classList.remove('macd-positive', 'macd-negative');
                const macdClass = getMACSColorClass(value);
                if (macdClass) {
                    valueSpan.classList.add(macdClass);
                }
            }

            // Flash the cell
            flashCell(cellDiv);
        }
    }

    // ─── WS Event Handlers ───────────────────────────────────────────────
    function onPrice(data) {
        try {
            if (!data) return;

            // Extract indicators from price event
            if (data.indicators) {
                if (isFinite(data.indicators.rsi)) {
                    updateCell('rsi', data.indicators.rsi);
                    state.rsi = Number(data.indicators.rsi).toFixed(0);
                }
                if (isFinite(data.indicators.macd)) {
                    updateCell('macd', data.indicators.macd);
                    state.macd = Number(data.indicators.macd).toFixed(2);
                }
                if (isFinite(data.indicators.atr)) {
                    updateCell('atr', data.indicators.atr);
                    state.atr = Number(data.indicators.atr).toFixed(2);
                }
                if (isFinite(data.indicators.volume)) {
                    updateCell('volume', data.indicators.volume);
                    state.volume = formatVolume(data.indicators.volume);
                }
            }

            // Extract confidence if present (alternative: signal_analysis provides this)
            if (isFinite(data.confidence)) {
                updateCell('liveConf', data.confidence);
                state.liveConf = Number(data.confidence).toFixed(0) + '%';
            }
        } catch (e) {
            // Gracefully ignore malformed price events
        }
    }

    function onSignalAnalysis(data) {
        try {
            if (!data) return;

            // Extract confidence from signal_analysis event
            // spec: data.modules.orchestrator.confidence
            if (data.modules && data.modules.orchestrator && isFinite(data.modules.orchestrator.confidence)) {
                const conf = data.modules.orchestrator.confidence;
                updateCell('liveConf', conf);
                state.liveConf = Number(conf).toFixed(0) + '%';
            }
        } catch (e) {
            // Gracefully ignore malformed signal_analysis events
        }
    }

    function onPatternAnalysis(data) {
        try {
            if (!data) return;

            // Extract pattern name from pattern_analysis event
            // spec: data.pattern.name
            if (data.pattern && data.pattern.name) {
                const patternName = String(data.pattern.name).toUpperCase();
                updateCell('pattern', patternName);
                state.pattern = patternName;
            }
        } catch (e) {
            // Gracefully ignore malformed pattern_analysis events
        }
    }

    function onWatchlistSelect(symbol) {
        try {
            if (!symbol) return;
            state.currentSymbol = String(symbol);
            // Clear cells briefly when symbol changes
            clearAll();
        } catch (e) {
            // Gracefully ignore
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────
    function init() {
        if (state.mounted) return;

        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        injectStyles();

        // Mark mounted BEFORE render() — render's defensive
        // `if (!state.mounted) return` would otherwise bail and produce
        // an empty panel. Setting mounted first preserves render's guard
        // for future callers (e.g. WS handlers that fire before init completes).
        state.mounted = true;
        render();

        // Subscribe to WS events
        const socket = OGZ.get('Socket');
        if (socket) {
            socket.registerHandler('price', onPrice);
            socket.registerHandler('signal_analysis', onSignalAnalysis);
            socket.registerHandler('pattern_analysis', onPatternAnalysis);
        }

        // Subscribe to OGZ.bus events
        OGZ.bus.on('watchlist:select', onWatchlistSelect);
    }

    function setSymbol(symbol) {
        state.currentSymbol = String(symbol || DEFAULT_SYMBOL);
        clearAll();
    }

    function updateRSI(value) {
        if (isFinite(value)) {
            state.rsi = Number(value).toFixed(0);
            updateCell('rsi', value);
        }
    }

    function updateMACD(value) {
        if (isFinite(value)) {
            state.macd = Number(value).toFixed(2);
            updateCell('macd', value);
        }
    }

    function updateATR(value) {
        if (isFinite(value)) {
            state.atr = Number(value).toFixed(2);
            updateCell('atr', value);
        }
    }

    function updateVolume(value) {
        if (isFinite(value)) {
            state.volume = formatVolume(value);
            updateCell('volume', value);
        }
    }

    function updateLiveConf(value) {
        if (isFinite(value)) {
            state.liveConf = Number(value).toFixed(0) + '%';
            updateCell('liveConf', value);
        }
    }

    function updatePattern(name) {
        if (name) {
            state.pattern = String(name).toUpperCase();
            updateCell('pattern', state.pattern);
        }
    }

    function clearAll() {
        state.rsi = '--';
        state.macd = '--';
        state.atr = '--';
        state.volume = '--';
        state.liveConf = '--';
        state.pattern = 'Scanning...';

        if (state.rsiValueSpan) state.rsiValueSpan.textContent = '--';
        if (state.macdValueSpan) state.macdValueSpan.textContent = '--';
        if (state.atrValueSpan) state.atrValueSpan.textContent = '--';
        if (state.volumeValueSpan) state.volumeValueSpan.textContent = '--';
        if (state.confValueSpan) state.confValueSpan.textContent = '--';
        if (state.patternValueSpan) state.patternValueSpan.textContent = 'Scanning...';
        if (state.liveConfBar) state.liveConfBar.style.width = '0%';
    }

    function teardown() {
        if (!state.mounted) return;

        // Unsubscribe from WS events
        const socket = OGZ.get('Socket');
        if (socket) {
            socket.unregisterHandler('price', onPrice);
            socket.unregisterHandler('signal_analysis', onSignalAnalysis);
            socket.unregisterHandler('pattern_analysis', onPatternAnalysis);
        }

        // Unsubscribe from OGZ.bus events
        OGZ.bus.off('watchlist:select', onWatchlistSelect);

        // Remove DOM
        const root = document.getElementById(ROOT_ID);
        if (root) {
            root.innerHTML = '';
        }

        // Remove injected styles
        const styleEl = document.getElementById(STYLE_ID);
        if (styleEl) {
            styleEl.remove();
        }

        state.mounted = false;
    }

    function _compute() {
        return {
            mounted: state.mounted,
            currentSymbol: state.currentSymbol,
            rsi: state.rsi,
            macd: state.macd,
            atr: state.atr,
            volume: state.volume,
            liveConf: state.liveConf,
            pattern: state.pattern,
        };
    }

    // ─── Module Registration ────────────────────────────────────────────
    OGZ.register('LiveReadouts', {
        init,
        setSymbol,
        updateRSI,
        updateMACD,
        updateATR,
        updateVolume,
        updateLiveConf,
        updatePattern,
        clearAll,
        teardown,
        _compute,
    });
})(window.OGZ);
