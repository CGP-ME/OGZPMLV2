/**
 * ============================================================================
 * OgzTpoIntegration.js - Two-Pole Oscillator Integration Layer
 * ============================================================================
 *
 * PURPOSE: Bridge the new OGZ TPO indicator into the existing trading flow
 *
 * ARCHITECTURAL ROLE:
 * - Wraps the pure-function ogzTwoPoleOscillator for stateful use
 * - Provides voting system integration for ensemble decisions
 * - Manages dual-TPO A/B testing (new vs existing)
 * - Calculates dynamic SL/TP using ATR
 * - Ready for Empire V2 migration (modular, feature-flagged)
 *
 * EMPIRE V2 READY:
 * - Uses FeatureFlagManager (unified source of truth for feature flags)
 * - Event-driven architecture for decoupling
 * - Pure indicator math separated from strategy logic
 * - Configurable via JSON profiles
 *
 * @author OGZPrime Team (Opus-Valhalla)
 * @version 1.1.0
 * @since 2025-12
 * ============================================================================
 */

const EventEmitter = require('events');
const FeatureFlagManager = require('./FeatureFlagManager');
const ConfigLoader = require('../foundation/ConfigLoader');

// FIX 2026-02-16: Use centralized candle helper for format compatibility
const { c, h, l, t } = require('./CandleHelper');

const {
    computeOgzTpo,
    detectTpoCrossover,
    calculateDynamicLevels,
} = require('../src/indicators/ogzTwoPoleOscillator');
const ExistingTwoPoleOscillator = require('./indicators/TwoPoleOscillator');

const REQUIRED_MODES = ['conservative', 'standard', 'aggressive'];
const MISSING_TIMESTAMP_BAR = 'missing-timestamp-bar';

function requirePlainObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[OGZTPO-CONFIG] ${path} must be an object`);
    }
    return value;
}

function requireBoolean(value, path) {
    if (typeof value !== 'boolean') {
        throw new Error(`[OGZTPO-CONFIG] ${path} must be a boolean`);
    }
    return value;
}

function requireFiniteNumber(value, path, { minExclusive = null, minInclusive = null } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`[OGZTPO-CONFIG] ${path} must be a finite number`);
    }
    if (minExclusive !== null && !(numeric > minExclusive)) {
        throw new Error(`[OGZTPO-CONFIG] ${path} must be greater than ${minExclusive}`);
    }
    if (minInclusive !== null && !(numeric >= minInclusive)) {
        throw new Error(`[OGZTPO-CONFIG] ${path} must be at least ${minInclusive}`);
    }
    return numeric;
}

function requireInteger(value, path, options = {}) {
    const numeric = requireFiniteNumber(value, path, options);
    if (!Number.isInteger(numeric)) {
        throw new Error(`[OGZTPO-CONFIG] ${path} must be an integer`);
    }
    return numeric;
}

function normalizeTimestampIdentity(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    if (text.length === 0) {
        return null;
    }
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
        return numeric;
    }
    const parsedDate = Date.parse(text);
    return Number.isFinite(parsedDate) ? parsedDate : null;
}

function candleBarTimestamp(candle) {
    return normalizeTimestampIdentity(t(candle) ?? candle?.etime);
}

function normalizeModeSettings(modes) {
    const source = requirePlainObject(modes, 'strategies.OGZTPO.modes');
    const normalized = {};
    for (const mode of REQUIRED_MODES) {
        const modePath = `strategies.OGZTPO.modes.${mode}`;
        const cfg = requirePlainObject(source[mode], modePath);
        normalized[mode] = {
            minStrength: requireFiniteNumber(cfg.minStrength, `${modePath}.minStrength`, { minInclusive: 0 }),
            zoneRequired: requireBoolean(cfg.zoneRequired, `${modePath}.zoneRequired`),
            voteMultiplier: requireFiniteNumber(cfg.voteMultiplier, `${modePath}.voteMultiplier`, { minExclusive: 0 }),
        };
    }
    return normalized;
}

function normalizeDynamicLevelMultipliers(multipliers) {
    const source = requirePlainObject(multipliers, 'strategies.OGZTPO.dynamicLevelMultipliers');
    const normalized = {};
    for (const mode of REQUIRED_MODES) {
        normalized[mode] = requireFiniteNumber(
            source[mode],
            `strategies.OGZTPO.dynamicLevelMultipliers.${mode}`,
            { minExclusive: 0 }
        );
    }
    return normalized;
}

function normalizeConfig(config) {
    const source = requirePlainObject(config, 'strategies.OGZTPO');
    const mode = String(source.mode || '').trim();
    if (!REQUIRED_MODES.includes(mode)) {
        throw new Error(`[OGZTPO-CONFIG] strategies.OGZTPO.mode must be one of ${REQUIRED_MODES.join(', ')}`);
    }

    return {
        enabled: requireBoolean(source.enabled, 'strategies.OGZTPO.enabled'),
        mode,
        dynamicSL: requireBoolean(source.dynamicSL, 'strategies.OGZTPO.dynamicSL'),
        confluence: requireBoolean(source.confluence, 'strategies.OGZTPO.confluence'),
        voteWeight: requireFiniteNumber(source.voteWeight, 'strategies.OGZTPO.voteWeight', { minInclusive: 0 }),
        adaptive: requireBoolean(source.adaptive, 'strategies.OGZTPO.adaptive'),
        tpoLength: requireFiniteNumber(source.tpoLength, 'strategies.OGZTPO.tpoLength', { minExclusive: 0 }),
        normLength: requireFiniteNumber(source.normLength, 'strategies.OGZTPO.normLength', { minExclusive: 0 }),
        volLength: requireFiniteNumber(source.volLength, 'strategies.OGZTPO.volLength', { minExclusive: 0 }),
        lagBars: requireFiniteNumber(source.lagBars, 'strategies.OGZTPO.lagBars', { minInclusive: 1 }),
        maxHistory: requireFiniteNumber(source.maxHistory, 'strategies.OGZTPO.maxHistory', { minExclusive: 0 }),
        lastSignalTtlBars: requireInteger(source.lastSignalTtlBars, 'strategies.OGZTPO.lastSignalTtlBars', { minInclusive: 0 }),
        confluenceBonusStrength: requireFiniteNumber(source.confluenceBonusStrength, 'strategies.OGZTPO.confluenceBonusStrength', { minInclusive: 0 }),
        strengthConfidenceMultiplier: requireFiniteNumber(source.strengthConfidenceMultiplier, 'strategies.OGZTPO.strengthConfidenceMultiplier', { minExclusive: 0 }),
        tradingLoopOverrideMinStrength: requireFiniteNumber(source.tradingLoopOverrideMinStrength, 'strategies.OGZTPO.tradingLoopOverrideMinStrength', { minInclusive: 0 }),
        modes: normalizeModeSettings(source.modes),
        dynamicLevelMultipliers: normalizeDynamicLevelMultipliers(source.dynamicLevelMultipliers),
    };
}

class OgzTpoIntegration extends EventEmitter {
    constructor(config = ConfigLoader.get('strategies.OGZTPO')) {
        super();
        this.config = normalizeConfig(config);
        
        // Candle history for batch processing
        this.candleHistory = {
            closes: [],
            highs: [],
            lows: [],
            timestamps: []
        };
        this.maxHistory = this.config.maxHistory;
        this.barCounter = 0;
        this.lastBarTimestamp = null;
        
        // Last computed results
        this.lastResult = null;
        this.lastSignal = null;
        this.lastSignalBarIndex = null;
        
        // Existing TPO for A/B testing
        this.existingTpo = new ExistingTwoPoleOscillator({
            normLength: this.config.normLength,
            tpoLength: this.config.tpoLength,
            volLength: this.config.volLength,
            lagBars: this.config.lagBars,
        });
        
        // Statistics for A/B comparison
        this.stats = {
            newTpoSignals: 0,
            existingTpoSignals: 0,
            confluenceMatches: 0,
            totalUpdates: 0
        };
        
        console.log('[OGZTPO] OgzTpoIntegration initialized');
        console.log(`   Mode: ${this.config.mode}`);
        console.log(`   Dynamic SL: ${this.config.dynamicSL ? 'YES' : 'NO'}`);
        console.log(`   Confluence: ${this.config.confluence ? 'ENABLED' : 'DISABLED'}`);
        console.log(`   Vote Weight: ${this.config.voteWeight}`);
    }
    
    /**
     * Initialize from FeatureFlagManager (preferred method)
     * Uses the unified feature flag system
     * @returns {OgzTpoIntegration|null}
     */
    static fromFeatureFlags() {
        const flagManager = FeatureFlagManager.getInstance();

        if (!flagManager.isEnabled('OGZ_TPO')) {
            return null;
        }

        return new OgzTpoIntegration(ConfigLoader.get('strategies.OGZTPO'));
    }

    /**
     * Initialize from TierFeatureFlags (legacy - delegates to FeatureFlagManager)
     * @deprecated Use fromFeatureFlags() instead
     * @param {TierFeatureFlags} tierFlags - Feature flags instance (ignored, uses singleton)
     */
    static fromTierFlags(tierFlags) {
        // Delegate to unified FeatureFlagManager
        return OgzTpoIntegration.fromFeatureFlags();
    }
    
    /**
     * Update with new candle data
     * @param {Object} candle - OHLC candle {o, h, l, c, t}
     * @returns {Object} Update result with signals and votes
     */
    update(candle) {
        if (!this.config.enabled) {
            return { enabled: false };
        }
        const rawBarTimestamp = candleBarTimestamp(candle);
        const candleTimestamp = rawBarTimestamp ?? this.lastBarTimestamp ?? MISSING_TIMESTAMP_BAR;
        const isSameBarUpdate = this.lastBarTimestamp !== null && this.lastBarTimestamp === candleTimestamp;
        if (!isSameBarUpdate) {
            this.barCounter += 1;
            this.lastBarTimestamp = candleTimestamp;
        }
        const currentBarIndex = this.barCounter;
        
        // Add to history, replacing same-timestamp updates so TTL tracks closed bars.
        if (isSameBarUpdate && this.candleHistory.closes.length > 0) {
            const lastIdx = this.candleHistory.closes.length - 1;
            this.candleHistory.closes[lastIdx] = c(candle);
            this.candleHistory.highs[lastIdx] = h(candle);
            this.candleHistory.lows[lastIdx] = l(candle);
            this.candleHistory.timestamps[lastIdx] = candleTimestamp;
        } else {
            this.candleHistory.closes.push(c(candle));
            this.candleHistory.highs.push(h(candle));
            this.candleHistory.lows.push(l(candle));
            this.candleHistory.timestamps.push(candleTimestamp);
        }
        
        // Trim to max history
        if (this.candleHistory.closes.length > this.maxHistory) {
            this.candleHistory.closes.shift();
            this.candleHistory.highs.shift();
            this.candleHistory.lows.shift();
            this.candleHistory.timestamps.shift();
        }
        
        this.stats.totalUpdates++;
        
        // Need minimum data for calculation
        if (this.candleHistory.closes.length < this.config.normLength + 5) {
            this._expireLastSignal(currentBarIndex);
            return { 
                enabled: true, 
                ready: false, 
                message: `Warming up (${this.candleHistory.closes.length}/${this.config.normLength + 5})` 
            };
        }
        
        // Compute new TPO
        const tpoResult = computeOgzTpo({
            closes: this.candleHistory.closes,
            highs: this.candleHistory.highs,
            lows: this.candleHistory.lows,
            tpoLength: this.config.tpoLength,
            normLength: this.config.normLength,
            volLength: this.config.volLength,
            lagBars: this.config.lagBars
        });
        
        this.lastResult = tpoResult;
        
        const lastIdx = this.candleHistory.closes.length - 1;
        
        // Detect signals from new TPO
        const newSignal = detectTpoCrossover(tpoResult, lastIdx);
        
        // Update existing TPO if available (for A/B)
        let existingSignal = null;
        this.existingTpo.update(candle);
        existingSignal = this.existingTpo.getValues()?.signal || null;
        
        // Track statistics
        if (newSignal && newSignal.type !== 'INVALID') this.stats.newTpoSignals++;
        if (existingSignal && existingSignal.type !== 'INVALID') this.stats.existingTpoSignals++;
        
        // Confluence check
        let confluenceMatch = false;
        if (newSignal && existingSignal) {
            const newAction = newSignal.action;
            const existingAction = existingSignal.action;
            if (newAction === existingAction) {
                confluenceMatch = true;
                this.stats.confluenceMatches++;
            }
        }
        
        const filters = this._evaluateSignalFilters(newSignal, confluenceMatch);
        let finalSignal = null;

        if (filters.passed) {
            finalSignal = {
                ...newSignal,
                source: 'ogzTpo',
                confluenceConfirmed: confluenceMatch,
                mode: this.config.mode,
                filters,
                price: c(candle),
                barIndex: currentBarIndex,
                ttlBars: this.config.lastSignalTtlBars,
                timestamp: Date.now()
            };

            if (this.config.dynamicSL) {
                const vol = tpoResult.vol[lastIdx];
                const direction = newSignal.action === 'BUY' ? 'LONG' : 'SHORT';
                const levels = calculateDynamicLevels(
                    c(candle),
                    vol,
                    direction,
                    this._dynamicLevelMultiplier()
                );
                finalSignal.levels = levels;
            }

            this.lastSignal = finalSignal;
            this.lastSignalBarIndex = currentBarIndex;

            // Emit event for decoupled architecture
            this.emit('signal', finalSignal);

            console.log(`\n[OGZTPO] Signal: ${finalSignal.action}`);
            console.log(`   Zone: ${finalSignal.zone}`);
            console.log(`   Strength: ${(finalSignal.strength * 100).toFixed(2)}%`);
            console.log(`   High Probability: ${finalSignal.highProbability ? 'YES' : 'NO'}`);
            console.log(`   Confluence: ${finalSignal.confluenceConfirmed ? 'CONFIRMED' : 'NEW TPO ONLY'}`);
            if (finalSignal.levels) {
                console.log(`   Dynamic SL: $${finalSignal.levels.stopLoss.toFixed(2)}`);
                console.log(`   Dynamic TP: $${finalSignal.levels.takeProfit.toFixed(2)}`);
            }
        }
        
        if (!finalSignal) {
            this._expireLastSignal(currentBarIndex);
        }

        return {
            enabled: true,
            ready: true,
            tpo: tpoResult.tpo[lastIdx],
            tpoLag: tpoResult.tpoLag[lastIdx],
            norm: tpoResult.norm[lastIdx],
            vol: tpoResult.vol[lastIdx],
            bands: tpoResult.bands,
            signal: finalSignal,
            newTpoRaw: newSignal,
            existingTpoRaw: existingSignal,
            confluenceMatch,
            filters,
            stats: this.stats
        };
    }

    _evaluateSignalFilters(newSignal, confluenceMatch) {
        const modeSettings = this.config.modes[this.config.mode];
        const validCrossover = Boolean(newSignal && newSignal.type !== 'INVALID');
        const strength = validCrossover ? Number(newSignal.strength) : null;
        const meetsStrength = validCrossover && Number.isFinite(strength) && strength >= modeSettings.minStrength;
        const meetsZone = validCrossover && (!modeSettings.zoneRequired || newSignal.highProbability === true);
        const meetsConfluence = validCrossover && (!this.config.confluence || confluenceMatch === true);

        return {
            mode: this.config.mode,
            minStrength: modeSettings.minStrength,
            zoneRequired: modeSettings.zoneRequired,
            confluenceRequired: this.config.confluence,
            validCrossover,
            meetsStrength,
            meetsZone,
            meetsConfluence,
            passed: validCrossover && meetsStrength && meetsZone && meetsConfluence,
        };
    }

    _dynamicLevelMultiplier() {
        return this.config.dynamicLevelMultipliers[this.config.mode];
    }

    _isLastSignalFresh(currentBarIndex = this.barCounter) {
        if (!this.lastSignal || this.lastSignalBarIndex === null) {
            return false;
        }
        const barsElapsed = currentBarIndex - this.lastSignalBarIndex;
        return barsElapsed >= 0 && barsElapsed <= this.config.lastSignalTtlBars;
    }

    _expireLastSignal(currentBarIndex = this.barCounter) {
        if (this._isLastSignalFresh(currentBarIndex)) {
            return this.lastSignal;
        }
        this.lastSignal = null;
        this.lastSignalBarIndex = null;
        return null;
    }
    
    /**
     * Get votes for the ensemble voting system
     * Compatible with OptimizedIndicators.getAllVotes()
     * @returns {Array} Array of vote objects
     */
    getVotes() {
        const activeSignal = this._expireLastSignal();
        if (!activeSignal || !this.config.enabled) {
            return [];
        }
        
        const votes = [];
        const modeSettings = this.config.modes[this.config.mode] || this.config.modes.standard;
        const weight = this.config.voteWeight * modeSettings.voteMultiplier;
        
        // Main signal vote
        if (activeSignal.action === 'BUY') {
            votes.push({
                tag: `TPO:${activeSignal.zone}`,
                vote: 1,
                strength: weight * (activeSignal.highProbability ? 1.5 : 1.0)
            });
        } else if (activeSignal.action === 'SELL') {
            votes.push({
                tag: `TPO:${activeSignal.zone}`,
                vote: -1,
                strength: weight * (activeSignal.highProbability ? 1.5 : 1.0)
            });
        }
        
        // Confluence bonus vote
        if (activeSignal.confluenceConfirmed) {
            votes.push({
                tag: 'TPO:confluence',
                vote: activeSignal.action === 'BUY' ? 1 : -1,
                strength: this.config.confluenceBonusStrength
            });
        }
        
        return votes;
    }
    
    /**
     * Get TPO state for dashboard/visualization
     * @returns {Object} Current TPO state
     */
    getState() {
        if (!this.lastResult) {
            return { ready: false };
        }
        
        const lastIdx = this.candleHistory.closes.length - 1;
        const activeSignal = this._expireLastSignal();
        
        return {
            ready: true,
            enabled: this.config.enabled,
            mode: this.config.mode,
            current: {
                tpo: this.lastResult.tpo[lastIdx],
                tpoLag: this.lastResult.tpoLag[lastIdx],
                norm: this.lastResult.norm[lastIdx],
                vol: this.lastResult.vol[lastIdx]
            },
            bands: this.lastResult.bands,
            lastSignal: activeSignal,
            stats: this.stats,
            history: {
                tpo: this.lastResult.tpo.slice(-50),
                tpoLag: this.lastResult.tpoLag.slice(-50)
            }
        };
    }
    
    /**
     * Get dynamic SL/TP levels for current price
     * @param {number} entryPrice - Entry price
     * @param {string} direction - 'LONG' or 'SHORT'
     * @param {number} multiplier - ATR multiplier (default from mode)
     * @returns {Object} Stop loss and take profit levels
     */
    getDynamicLevels(entryPrice, direction, multiplier = null) {
        if (!this.lastResult) {
            return null;
        }
        
        const lastIdx = this.candleHistory.closes.length - 1;
        const vol = this.lastResult.vol[lastIdx];
        
        // Use mode-appropriate multiplier if not specified
        const resolvedMultiplier = multiplier === null || multiplier === undefined
            ? this._dynamicLevelMultiplier()
            : multiplier;
        
        return calculateDynamicLevels(entryPrice, vol, direction, resolvedMultiplier);
    }
    
    /**
     * Reset state (useful for backtesting)
     */
    reset() {
        this.candleHistory = { closes: [], highs: [], lows: [], timestamps: [] };
        this.barCounter = 0;
        this.lastBarTimestamp = null;
        this.lastResult = null;
        this.lastSignal = null;
        this.lastSignalBarIndex = null;
        this.stats = {
            newTpoSignals: 0,
            existingTpoSignals: 0,
            confluenceMatches: 0,
            totalUpdates: 0
        };
        
        this.existingTpo.reset();
        
        console.log('[OGZTPO] OgzTpoIntegration reset');
    }
    
    /**
     * Get configuration summary
     */
    getConfigSummary() {
        return {
            enabled: this.config.enabled,
            mode: this.config.mode,
            dynamicSL: this.config.dynamicSL,
            confluence: this.config.confluence,
            voteWeight: this.config.voteWeight,
            strengthConfidenceMultiplier: this.config.strengthConfidenceMultiplier,
            lastSignalTtlBars: this.config.lastSignalTtlBars,
            parameters: {
                tpoLength: this.config.tpoLength,
                normLength: this.config.normLength,
                volLength: this.config.volLength,
                lagBars: this.config.lagBars
            }
        };
    }
}

module.exports = OgzTpoIntegration;

// Export static factories
module.exports.fromFeatureFlags = OgzTpoIntegration.fromFeatureFlags;
module.exports.fromTierFlags = OgzTpoIntegration.fromTierFlags; // Legacy
