/**
 * ModuleInitializer - Phase 21 Extraction
 *
 * Configuration factory helpers for the trading bot constructor.
 * Centralizes config creation logic to reduce constructor size.
 *
 * @module core/ModuleInitializer
 */

'use strict';

// Config - the only required import for config factory methods
const ConfigLoader = require('../foundation/ConfigLoader');

class ModuleInitializer {
  constructor() {
    console.log('[ModuleInitializer] Initialized (Phase 21)');
  }

  /**
   * Create trading brain configuration object
   * EXACT COPY from run-empire-v2.js constructor
   */
  createTradingBrainConfig(tierFlags, featureFlags) {
    return {
      // Tier settings
      tier: tierFlags.tier,

      // Values retained for the legacy factory's remaining callers.
      minConfidenceThreshold: ConfigLoader.get('confidence.minTradeConfidence'),
      basePositionSize: ConfigLoader.get('positionSizing.basePositionSize'),
      maxPositionSize: ConfigLoader.get('positionSizing.maxPositionSize'),
      houstonFundTarget: ConfigLoader.get('fundTarget'),
      featureFlags: featureFlags.features
    };
  }
}

module.exports = ModuleInitializer;
