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
      enableQuantumSizing: tierFlags.hasQuantumPositionSizer,
      tier: tierFlags.tier,

      // CHANGE 2026-02-28: All trading params from ConfigLoader (single source of truth)
      // Confidence
      minConfidenceThreshold: ConfigLoader.get('confidence.minTradeConfidence'),
      maxConfidenceThreshold: ConfigLoader.get('confidence.maxConfidence'),
      confidencePenalty: ConfigLoader.get('confidence.confidencePenalty'),
      confidenceBoost: ConfigLoader.get('confidence.confidenceBoost'),

      // Risk management
      maxRiskPerTrade: ConfigLoader.get('risk.maxRiskPerTrade'),

      // Exit parameters
      stopLossPercent: ConfigLoader.get('exits.stopLossPercent'),
      takeProfitPercent: ConfigLoader.get('exits.takeProfitPercent'),
      trailingStopPercent: ConfigLoader.get('exits.trailingStopPercent'),
      trailingStopActivation: ConfigLoader.get('exits.trailingActivation'),
      profitProtectionLevel: ConfigLoader.get('exits.profitProtectionLevel'),
      breakevenTrigger: ConfigLoader.get('exits.breakevenTrigger'),
      breakevenPercentage: ConfigLoader.get('exits.breakevenExitPercent'),
      postBreakevenTrailing: ConfigLoader.get('exits.postBreakevenTrail'),

      // Position sizing
      basePositionSize: ConfigLoader.get('positionSizing.basePositionSize'),
      maxPositionSize: ConfigLoader.get('positionSizing.maxPositionSize'),
      lowVolatilityMultiplier: ConfigLoader.get('positionSizing.lowVolMultiplier'),
      highVolatilityMultiplier: ConfigLoader.get('positionSizing.highVolMultiplier'),
      volatilityThresholds: {
        low: ConfigLoader.get('positionSizing.lowVolThreshold'),
        high: ConfigLoader.get('positionSizing.highVolThreshold')
      },

      // Fund target
      houstonFundTarget: ConfigLoader.get('fundTarget'),

      // Feature flags
      featureFlags: featureFlags.features || {},
      patternDominance: featureFlags.features?.PATTERN_DOMINANCE?.enabled || false
    };
  }
}

module.exports = ModuleInitializer;
