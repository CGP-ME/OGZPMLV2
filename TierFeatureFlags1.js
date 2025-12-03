// TierFeatureFlags.js - Subscription tier management for OGZ Trading System
// Controls feature access based on subscription levels

class TierFeatureFlags {
  constructor(tier = 'starter') {
    this.tier = tier.toLowerCase();
    this.features = this.loadTierFeatures();

    console.log(`🎭 TierFeatureFlags initialized for ${this.tier} tier`);
  }

  /**
   * Load features based on subscription tier
   */
  loadTierFeatures() {
    const tiers = {
      elite: {
        patterns: 'All (25+)',
        maxPositions: 20,
        multiDirectional: true,
        quantum: true,
        leverage: 5,
        riskManagement: 'Elite',
        analytics: 'Elite',
        strategies: ['All Available'],
        maxDailyTrades: 500,
        stopLoss: true,
        takeProfit: true,
        trailingStop: true,
        arbitrage: true,
        optionsTrading: true,
        futuresTrading: true,
        forexTrading: true,
        cryptoTrading: true,
        mlLearning: true,
        customIndicators: true,
        backtesting: 'Professional',
        liveAlerts: true,
        apiAccess: 'Full',
        priority: 'VIP',
        traiEnabled: false,
        // Derived features for compatibility
        quantumPositionSizer: true,
        patternsEnabled: true,
        patternsMaxPatterns: 25,
        // OGZ Two-Pole Oscillator (Empire V2 Ready)
        ogzTpoEnabled: true,
        ogzTpoMode: 'standard',        // 'standard' | 'aggressive' | 'conservative'
        ogzTpoDynamicSL: true,         // Use ATR-based dynamic stop loss
        ogzTpoConfluence: false,       // Require both TPOs to agree (A/B mode)
        ogzTpoVoteWeight: 0.25         // Weight in voting system
      },

      ml: {
        patterns: 'AI-Powered (Unlimited)',
        maxPositions: 50,
        multiDirectional: true,
        quantum: true,
        leverage: 10,
        riskManagement: 'Quantum AI + TRAI',
        analytics: 'Quantum AI + TRAI',
        strategies: ['All Available + AI Custom'],
        maxDailyTrades: 1000,
        stopLoss: true,
        takeProfit: true,
        trailingStop: true,
        arbitrage: true,
        optionsTrading: true,
        futuresTrading: true,
        forexTrading: true,
        cryptoTrading: true,
        mlLearning: true,
        customIndicators: true,
        backtesting: 'Quantum AI + TRAI',
        liveAlerts: true,
        apiAccess: 'Full + AI + TRAI',
        priority: 'GOD MODE',
        traiEnabled: true,
        traiBacktestAnalysis: true,  // TRAI backtest performance analysis
        unlimitedFeatures: true,
        // Derived features for compatibility
        quantumPositionSizer: true,
        patternsEnabled: true,
        patternsMaxPatterns: 1000,  // Unlimited AI patterns
        // OGZ Two-Pole Oscillator (Empire V2 Ready) - FULL POWER
        ogzTpoEnabled: true,
        ogzTpoMode: 'aggressive',      // ML tier gets aggressive mode
        ogzTpoDynamicSL: true,         // Use ATR-based dynamic stop loss
        ogzTpoConfluence: true,        // A/B testing mode - both TPOs must agree
        ogzTpoVoteWeight: 0.35,        // Higher weight for ML tier
        ogzTpoAdaptive: true           // ML tier gets adaptive parameters
      }
    };

    return tiers[this.tier] || tiers.elite;
  }

  /**
   * Check if a feature is enabled for current tier
   */
  isEnabled(feature) {
    // Handle nested feature paths like 'trading.multiDirectional'
    const parts = feature.split('.');
    let value = this.features;

    for (const part of parts) {
      value = value && value[part];
    }

    return value || false;
  }

  /**
   * Get feature value for current tier
   */
  getValue(feature) {
    return this.features[feature];
  }

  /**
   * Get feature value with nested path support (alias for getValue)
   */
  getFeatureValue(feature) {
    // Handle nested feature paths like 'trading.maxPositions'
    const parts = feature.split('.');
    let value = this.features;

    for (const part of parts) {
      value = value && value[part];
    }

    return value;
  }

  /**
   * Get tier summary for display
   */
  getTierSummary() {
    return {
      tier: this.tier,
      patterns: this.features.patterns,
      maxPositions: this.features.maxPositions,
      multiDirectional: this.features.multiDirectional,
      quantum: this.features.quantum,
      leverage: this.features.leverage,
      analytics: this.features.analytics,
      strategies: this.features.strategies.join(', '),
      maxDailyTrades: this.features.maxDailyTrades
    };
  }

  /**
   * Check if user can access a specific trading feature
   */
  canTrade(asset) {
    switch(asset.toLowerCase()) {
      case 'crypto':
        return this.features.cryptoTrading;
      case 'options':
        return this.features.optionsTrading;
      case 'futures':
        return this.features.futuresTrading;
      case 'forex':
        return this.features.forexTrading;
      default:
        return true; // Stocks are available to all tiers
    }
  }

  /**
   * Check if user can use a specific strategy
   */
  canUseStrategy(strategy) {
    if (this.features.strategies.includes('All Available')) {
      return true;
    }
    return this.features.strategies.includes(strategy);
  }

  /**
   * Get maximum position size based on tier
   */
  getMaxPositionSize(baseSize) {
    const multiplier = this.features.leverage;
    return baseSize * multiplier;
  }

  /**
  * Check if user has reached daily trade limit
  */
  canMakeMoreTrades(currentTrades) {
  return currentTrades < this.features.maxDailyTrades;
  }

  /**
   * Get pattern detector based on tier
   */
  getPatternDetector() {
    switch(this.tier) {
      case 'ml':
        // ML tier gets EnhancedPatternRecognition
        try {
          const EnhancedPatternRecognition = require('./core/EnhancedPatternRecognition.js');
          return new EnhancedPatternRecognition({
            unlimitedPatterns: true,
            aiPowered: true,
            maxPatterns: 1000
          });
        } catch (error) {
          console.log('⚠️ EnhancedPatternRecognition not available, falling back to basic');
          return null;
        }

      case 'elite':
        // Elite tier gets ComprehensivePatternDetector
        try {
          const ComprehensivePatternDetector = require('./core/ComprehensivePatternDetector.js');
          return new ComprehensivePatternDetector();
        } catch (error) {
          console.log('⚠️ ComprehensivePatternDetector not available');
          return null;
        }

      case 'pro':
        // Pro tier gets AdvancedPatternRecognition
        try {
          const AdvancedPatternRecognition = require('./core/AdvancedPatternRecognition.js');
          return new AdvancedPatternRecognition();
        } catch (error) {
          console.log('⚠️ AdvancedPatternRecognition not available');
          return null;
        }

      case 'starter':
      default:
        // Starter tier gets no pattern recognition
        return null;
    }
  }

  /**
   * Get tier upgrade recommendations
   */
  getUpgradeRecommendations() {
    if (this.tier === 'starter') {
      return {
        nextTier: 'pro',
        benefits: [
          'Multi-directional trading',
          'Advanced patterns',
          'ML learning systems',
          'Forex trading',
          'Live alerts'
        ]
      };
    } else if (this.tier === 'pro') {
      return {
        nextTier: 'elite',
        benefits: [
          'Quantum features',
          'Options & Futures trading',
          'Professional backtesting',
          'Full API access',
          'VIP support'
        ]
      };
    }

    return { nextTier: null, benefits: ['You have the highest tier!'] };
  }

  /**
   * Display tier information
   */
  displayTierInfo() {
    const summary = this.getTierSummary();
    console.log(`\n🏆 SUBSCRIPTION TIER: ${summary.tier.toUpperCase()}`);
    console.log(`📊 Patterns: ${summary.patterns}`);
    console.log(`💼 Max Positions: ${summary.maxPositions}`);
    console.log(`🔄 Multi-Directional: ${summary.multiDirectional ? 'YES' : 'NO'}`);
    console.log(`⚛️ Quantum Features: ${summary.quantum ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📈 Max Leverage: ${summary.leverage}x`);
    console.log(`🎯 Strategies: ${summary.strategies}`);
    console.log(`📈 Daily Trades: ${summary.maxDailyTrades}`);
  }
}

module.exports = TierFeatureFlags;