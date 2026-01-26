/**
 * UNIFIED FEATURE FLAG MANAGER
 *
 * Single source of truth for ALL feature flags in OGZ Prime.
 * Combines config/features.json (toggles) with tier-based scaling.
 *
 * WHY THIS EXISTS:
 * Previously there were TWO independent systems:
 * 1. config/features.json - runtime toggles
 * 2. TierFeatureFlags.js - hardcoded tier features
 * They didn't communicate, causing flags to be ignored.
 *
 * NOW:
 * - features.json is the ONLY source of truth for toggles
 * - Tier logic provides SCALING on top (multipliers, limits)
 * - All code uses this singleton
 *
 * @author Claudito Pipeline
 * @version 1.0.0
 * @created 2026-01-26
 */

const fs = require('fs');
const path = require('path');

// Singleton instance
let instance = null;

class FeatureFlagManager {
  constructor() {
    if (instance) {
      return instance;
    }

    // Detect mode from environment
    this.mode = this._detectMode();
    this.tier = process.env.TRADING_TIER || 'ml';

    // Load features from JSON (single source of truth)
    this.features = this._loadFeatures();

    // Tier-specific scaling factors (not toggles - those come from features.json)
    this.tierScaling = this._loadTierScaling();

    console.log(`🎛️ [FeatureFlagManager] Initialized: mode=${this.mode}, tier=${this.tier}`);
    console.log(`🎛️ [FeatureFlagManager] Enabled features:`,
      Object.keys(this.features).filter(f => this.features[f]?.enabled));

    instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!instance) {
      instance = new FeatureFlagManager();
    }
    return instance;
  }

  /**
   * Reset instance (for testing only)
   */
  static resetInstance() {
    instance = null;
  }

  /**
   * Detect trading mode from environment
   */
  _detectMode() {
    if (process.env.BACKTEST_MODE === 'true') return 'backtest';
    if (process.env.TEST_MODE === 'true') return 'test';
    if (process.env.TRADING_MODE === 'live' || process.env.ENABLE_LIVE_TRADING === 'true') return 'live';
    if (process.env.PAPER_TRADING === 'true' || process.env.TRADING_MODE === 'paper') return 'paper';
    return 'paper'; // Safe default
  }

  /**
   * Load features from config/features.json
   */
  _loadFeatures() {
    try {
      const featuresPath = path.join(__dirname, '..', 'config', 'features.json');
      const data = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
      return data.features || {};
    } catch (error) {
      console.error('❌ [FeatureFlagManager] Failed to load features.json:', error.message);
      return {};
    }
  }

  /**
   * Reload features from disk (for runtime updates)
   */
  reload() {
    this.features = this._loadFeatures();
    this.mode = this._detectMode();
    console.log(`🔄 [FeatureFlagManager] Reloaded features`);
  }

  /**
   * Tier-specific scaling factors
   * These are MULTIPLIERS and LIMITS, not toggles
   * Toggles come from features.json
   */
  _loadTierScaling() {
    return {
      starter: {
        maxPositions: 5,
        leverage: 1,
        maxDailyTrades: 50,
        patternLimit: 10
      },
      pro: {
        maxPositions: 10,
        leverage: 2,
        maxDailyTrades: 200,
        patternLimit: 50
      },
      elite: {
        maxPositions: 20,
        leverage: 5,
        maxDailyTrades: 500,
        patternLimit: 100
      },
      ml: {
        maxPositions: 50,
        leverage: 10,
        maxDailyTrades: 1000,
        patternLimit: 10000
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CORE API - Use these methods everywhere
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if a feature is enabled
   * This is the PRIMARY method for checking feature flags
   *
   * @param {string} featureName - Feature name (e.g., 'PATTERN_DOMINANCE', 'ml_enhanced_signals')
   * @returns {boolean}
   */
  isEnabled(featureName) {
    // Check in features.json first (canonical source)
    const feature = this.features[featureName];
    if (feature !== undefined) {
      return feature.enabled === true;
    }

    // Legacy support: Map old TierFeatureFlags names to features.json
    const legacyMapping = {
      'ml_enhanced_signals': 'ML_ENHANCED_SIGNALS',
      'advanced_indicators': 'ADVANCED_INDICATORS',
      'ml_volume_analysis': 'ML_VOLUME_ANALYSIS',
      'ogzTpoEnabled': 'OGZ_TPO',
      'ogzTpoDynamicSL': 'OGZ_TPO',
      'ogzTpoConfluence': 'OGZ_TPO',
      'ogzTpoAdaptive': 'OGZ_TPO',
      'patternsEnabled': 'PATTERN_DOMINANCE',
      'quantumPositionSizer': 'PATTERN_BASED_SIZING',
      'traiEnabled': 'TRAI_INFERENCE'
    };

    const mappedName = legacyMapping[featureName];
    if (mappedName && this.features[mappedName]) {
      return this.features[mappedName].enabled === true;
    }

    // Not found - default to false (safe)
    return false;
  }

  /**
   * Alias for isEnabled (backward compatibility with TierFeatureFlags)
   */
  hasFeature(featureName) {
    return this.isEnabled(featureName);
  }

  /**
   * Get feature settings
   *
   * @param {string} featureName - Feature name
   * @returns {Object} Settings object or empty object
   */
  getSettings(featureName) {
    const feature = this.features[featureName];
    return feature?.settings || {};
  }

  /**
   * Get a specific setting value
   *
   * @param {string} featureName - Feature name
   * @param {string} settingKey - Setting key within the feature
   * @param {*} defaultValue - Default if not found
   * @returns {*}
   */
  getSetting(featureName, settingKey, defaultValue = null) {
    const settings = this.getSettings(featureName);
    return settings[settingKey] !== undefined ? settings[settingKey] : defaultValue;
  }

  /**
   * Check if feature is in shadow mode (logging only, no behavior change)
   *
   * @param {string} featureName - Feature name
   * @returns {boolean}
   */
  isShadowMode(featureName) {
    const feature = this.features[featureName];
    return feature?.shadowMode === true;
  }

  /**
   * Get tier scaling value
   *
   * @param {string} key - Scaling key (maxPositions, leverage, etc.)
   * @returns {number}
   */
  getTierValue(key) {
    const tierConfig = this.tierScaling[this.tier] || this.tierScaling.elite;
    return tierConfig[key];
  }

  /**
   * Get current mode
   * @returns {string} 'live' | 'paper' | 'backtest' | 'test'
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get current tier
   * @returns {string}
   */
  getTier() {
    return this.tier;
  }

  /**
   * Check if in backtest mode
   * @returns {boolean}
   */
  isBacktestMode() {
    return this.mode === 'backtest';
  }

  /**
   * Check if in test mode (signal testing without pattern corruption)
   * @returns {boolean}
   */
  isTestMode() {
    return this.mode === 'test';
  }

  /**
   * Check if in paper trading mode
   * @returns {boolean}
   */
  isPaperMode() {
    return this.mode === 'paper';
  }

  /**
   * Check if in live trading mode
   * @returns {boolean}
   */
  isLiveMode() {
    return this.mode === 'live';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIER HELPER METHODS (preserved from TierFeatureFlags)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if user can trade a specific asset type
   * @param {string} asset - 'crypto', 'forex', 'options', 'futures'
   * @returns {boolean}
   */
  canTrade(asset) {
    // All tiers can trade crypto
    if (asset === 'crypto') return true;

    // Check tier-specific access
    const tierAccess = {
      starter: ['crypto'],
      pro: ['crypto', 'forex'],
      elite: ['crypto', 'forex', 'options', 'futures'],
      ml: ['crypto', 'forex', 'options', 'futures']
    };

    const allowed = tierAccess[this.tier] || tierAccess.starter;
    return allowed.includes(asset.toLowerCase());
  }

  /**
   * Check if user can make more trades today
   * @param {number} currentTrades - Number of trades made today
   * @returns {boolean}
   */
  canMakeMoreTrades(currentTrades) {
    return currentTrades < this.getTierValue('maxDailyTrades');
  }

  /**
   * Get max position size with tier scaling
   * @param {number} baseSize - Base position size
   * @returns {number}
   */
  getMaxPositionSize(baseSize) {
    return baseSize * this.getTierValue('leverage');
  }

  /**
   * Get all enabled features as array
   * @returns {string[]}
   */
  getEnabledFeatures() {
    return Object.keys(this.features).filter(f => this.features[f]?.enabled);
  }

  /**
   * Get feature flag summary for logging
   * @returns {Object}
   */
  getSummary() {
    return {
      mode: this.mode,
      tier: this.tier,
      enabledFeatures: this.getEnabledFeatures(),
      tierScaling: this.tierScaling[this.tier]
    };
  }
}

module.exports = FeatureFlagManager;
