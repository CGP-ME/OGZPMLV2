// ===================================================================
// TRADING STRATEGY ADVISOR - STRATEGY RECOMMENDATION ENGINE
// ===================================================================
// Analyzes market conditions and recommends trading strategies
// Does NOT execute trades - only provides recommendations

const EventEmitter = require('events');

class TradingStrategyAdvisor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Strategy flags from ENV
      enableLongPositions: process.env.ENABLE_LONG_POSITIONS !== 'false',
      enableShortPositions: process.env.ENABLE_SHORT_POSITIONS === 'true',
      enableHedging: process.env.ENABLE_HEDGING === 'true',
      enableArbitrage: process.env.ENABLE_ARBITRAGE === 'true',
      enableScalping: process.env.ENABLE_SCALPING === 'true',
      enableSwingTrading: process.env.ENABLE_SWING_TRADING !== 'false',
      enableMarginTrading: process.env.ENABLE_MARGIN_TRADING === 'true',

      // Market-specific flags
      cryptoMarginAllowed: process.env.CRYPTO_MARGIN_ALLOWED === 'true',
      stocksMarginAllowed: process.env.STOCKS_MARGIN_ALLOWED !== 'false',
      forexMarginAllowed: process.env.FOREX_MARGIN_ALLOWED !== 'false',

      // Risk limits per strategy type
      maxLongExposure: parseFloat(process.env.MAX_LONG_EXPOSURE) || 0.6,
      maxShortExposure: parseFloat(process.env.MAX_SHORT_EXPOSURE) || 0.4,
      maxHedgeRatio: parseFloat(process.env.MAX_HEDGE_RATIO) || 0.3,
      maxArbitrageExposure: parseFloat(process.env.MAX_ARBITRAGE_EXPOSURE) || 0.2,

      // Regime adaptation
      aggressivenessMultiplier: {
        'bull': 1.5,
        'bear': 0.5,
        'ranging': 1.0,
        'volatile': 0.7,
        'crash': 0.2,
        'risk-on': 1.3,
        'risk-off': 0.4,
        'decorrelated': 1.1
      },

      ...config
    };

    this.currentMarket = process.env.CURRENT_MARKET || 'crypto';
    this.activeStrategies = new Map();

    // Market state tracking
    this.marketState = {
      regime: 'unknown',
      trend: 'neutral',
      volatility: 'normal',
      correlation: 'normal',
      bias: 'neutral',
      lastUpdate: 0
    };

    console.log('🎯 Trading Strategy Advisor initialized');
    console.log('📈 Long positions:', this.config.enableLongPositions ? 'ENABLED' : 'DISABLED');
    console.log('📉 Short positions:', this.config.enableShortPositions ? 'ENABLED' : 'DISABLED');
    console.log('🛡️ Hedging:', this.config.enableHedging ? 'ENABLED' : 'DISABLED');
    console.log('💎 Arbitrage:', this.config.enableArbitrage ? 'ENABLED' : 'DISABLED');
    console.log('⚡ Scalping:', this.config.enableScalping ? 'ENABLED' : 'DISABLED');
  }
  
  /**
   * Main strategy evaluation - RECOMMENDATION ONLY
   */
  evaluateStrategy(marketData, patterns, confidence) {
    console.log('🧠 STRATEGY ADVISOR EVALUATION...');

    const recommendations = [];

    // 1. Analyze market regime
    const regime = this.analyzeRegime(marketData);

    // 2. Long strategy evaluation
    if (this.config.enableLongPositions) {
      const longRec = this.evaluateLongStrategy(marketData, patterns, confidence, regime);
      if (longRec) recommendations.push(longRec);
    }

    // 3. Short strategy evaluation (if enabled and allowed for current market)
    if (this.config.enableShortPositions && this.isShortAllowed()) {
      const shortRec = this.evaluateShortStrategy(marketData, patterns, confidence, regime);
      if (shortRec) recommendations.push(shortRec);
    }

    // 4. Hedging strategy evaluation
    if (this.config.enableHedging && this.isMarginAllowed()) {
      const hedgeRec = this.evaluateHedgingStrategy(marketData, patterns, confidence, regime);
      if (hedgeRec) recommendations.push(hedgeRec);
    }

    // 5. Arbitrage strategy evaluation
    if (this.config.enableArbitrage) {
      const arbRec = this.evaluateArbitrageStrategy(marketData, patterns, confidence);
      if (arbRec) recommendations.push(arbRec);
    }

    // 6. Scalping strategy evaluation
    if (this.config.enableScalping) {
      const scalpRec = this.evaluateScalpingStrategy(marketData, patterns, confidence, regime);
      if (scalpRec) recommendations.push(scalpRec);
    }

    // Return best recommendation
    return this.selectBestStrategy(recommendations);
  }

  /**
   * Check if shorting is allowed for current market
   */
  isShortAllowed() {
    switch (this.currentMarket) {
      case 'crypto':
        return this.config.cryptoMarginAllowed;
      case 'stocks':
        return this.config.stocksMarginAllowed;
      case 'forex':
        return this.config.forexMarginAllowed;
      default:
        return false;
    }
  }

  /**
   * Check if margin trading is allowed
   */
  isMarginAllowed() {
    return this.config.enableMarginTrading && this.isShortAllowed();
  }

  /**
   * Evaluate long strategy
   */
  evaluateLongStrategy(marketData, patterns, confidence, regime) {
    if (marketData.direction === 'buy' && confidence > 0.6) {
      return {
        type: 'LONG',
        direction: 'buy',
        confidence: confidence,
        size: this.calculateAdaptiveSize({ confidence, suggestedSize: 0.1 }, regime, { type: 'standard' }),
        reasoning: `Bullish signals detected in ${regime.type} market`,
        riskLevel: 'medium',
        timeHorizon: this.determineTimeHorizon(patterns),
        stopLoss: marketData.price * 0.98,
        takeProfit: marketData.price * 1.04
      };
    }
    return null;
  }

  /**
   * Evaluate short strategy
   */
  evaluateShortStrategy(marketData, patterns, confidence, regime) {
    if (marketData.direction === 'sell' && confidence > 0.7) { // Higher threshold for shorts
      return {
        type: 'SHORT',
        direction: 'sell',
        confidence: confidence,
        size: this.calculateAdaptiveSize({ confidence, suggestedSize: 0.08 }, regime, { type: 'standard' }),
        reasoning: `Bearish signals detected in ${regime.type} market`,
        riskLevel: 'high',
        timeHorizon: this.determineTimeHorizon(patterns),
        stopLoss: marketData.price * 1.02,
        takeProfit: marketData.price * 0.96,
        marginRequired: true
      };
    }
    return null;
  }

  /**
   * Evaluate hedging strategy
   */
  evaluateHedgingStrategy(marketData, patterns, confidence, regime) {
    if (regime.type === 'volatile' && marketData.volatility > 0.03) {
      return {
        type: 'HEDGE',
        direction: marketData.direction === 'buy' ? 'sell' : 'buy',
        confidence: confidence * 0.8,
        size: 0.05,
        reasoning: 'Volatility hedge for market protection',
        riskLevel: 'low',
        timeHorizon: 'short',
        isHedge: true
      };
    }
    return null;
  }

  /**
   * Evaluate arbitrage strategy
   */
  evaluateArbitrageStrategy(marketData, patterns, confidence) {
    const arbOpportunity = this.scanArbitrageOpportunity(marketData);
    if (arbOpportunity) {
      return {
        type: 'ARBITRAGE',
        ...arbOpportunity,
        confidence: arbOpportunity.confidence,
        riskLevel: 'low'
      };
    }
    return null;
  }

  /**
   * Evaluate scalping strategy
   */
  evaluateScalpingStrategy(marketData, patterns, confidence, regime) {
    if (this.config.enableScalping && marketData.volatility > 0.02 && confidence > 0.8) {
      return {
        type: 'SCALP',
        direction: marketData.direction,
        confidence: confidence,
        size: 0.05,
        reasoning: 'High-frequency scalping opportunity',
        riskLevel: 'medium',
        timeHorizon: 'very_short',
        maxHoldTime: 300000, // 5 minutes max
        tightStops: true
      };
    }
    return null;
  }

  /**
   * Select the best strategy from recommendations
   */
  selectBestStrategy(recommendations) {
    if (recommendations.length === 0) {
      return { type: 'HOLD', reasoning: 'No suitable strategies found' };
    }

    // Sort by confidence and risk-adjusted return
    recommendations.sort((a, b) => {
      const scoreA = a.confidence * (a.riskLevel === 'low' ? 1.2 : a.riskLevel === 'medium' ? 1.0 : 0.8);
      const scoreB = b.confidence * (b.riskLevel === 'low' ? 1.2 : b.riskLevel === 'medium' ? 1.0 : 0.8);
      return scoreB - scoreA;
    });

    return recommendations[0];
  }

  /**
   * Determine time horizon from patterns
   */
  determineTimeHorizon(patterns) {
    if (!patterns || patterns.length === 0) return 'medium';
    // Simple heuristic - could be enhanced
    return patterns.some(p => p.type?.includes('scalp')) ? 'short' : 'medium';
  }
  
  /**
   * Analyze market regime for adaptive trading
   */
  analyzeRegime(marketData) {
    const { volatility, trend, momentum, volume, correlations } = marketData;
    
    let regime = {
      type: 'unknown',
      strength: 0,
      characteristics: [],
      tradingMode: 'normal',
      confidence: 0.5
    };
    
    // Trend analysis - REDUCED threshold from 0.7 to 0.3 for paper trading
    if (trend && trend.strength > 0.3) {
      if (trend.direction === 'up') {
        regime.type = 'bull';
        regime.characteristics.push('strong_uptrend');
        regime.tradingMode = 'aggressive_long';
      } else {
        regime.type = 'bear';
        regime.characteristics.push('strong_downtrend');
        regime.tradingMode = 'aggressive_short';
      }
      regime.strength = trend.strength;
      regime.confidence = 0.8;
    }
    
    // Volatility analysis - REDUCED from 2x to 1.5x for paper trading
    else if (volatility && volatility.current > volatility.average * 1.5) {
      regime.type = 'volatile';
      regime.characteristics.push('high_volatility');
      regime.tradingMode = 'defensive';
      regime.strength = volatility.current / volatility.average;
      regime.confidence = 0.7;
    }
    
    // Range detection
    else if (trend && trend.strength < 0.3 && volatility && volatility.current < volatility.average) {
      regime.type = 'ranging';
      regime.characteristics.push('sideways_market');
      regime.tradingMode = 'mean_reversion';
      regime.strength = 0.5;
      regime.confidence = 0.6;
    }
    // DEFAULT TO RANGING if no other regime detected - ensures trading can occur
    else {
      regime.type = 'ranging';
      regime.characteristics.push('normal_market');
      regime.tradingMode = 'normal';
      regime.strength = 0.5;
      regime.confidence = 0.5;
    }

    // Crash detection
    if (momentum && momentum.rsi < 20 && volume && volume.ratio > 3) {
      regime.type = 'crash';
      regime.characteristics.push('panic_selling');
      regime.tradingMode = 'extreme_caution';
      regime.strength = 1.0;
      regime.confidence = 0.9;
    }
    
    // Correlation-based regime detection
    if (correlations) {
      if (correlations.regime === 'risk-on') {
        regime.type = regime.type === 'unknown' ? 'risk-on' : regime.type;
        regime.characteristics.push('risk_appetite');
        regime.tradingMode = regime.tradingMode === 'normal' ? 'aggressive_long' : regime.tradingMode;
      } else if (correlations.regime === 'risk-off') {
        regime.type = regime.type === 'unknown' ? 'risk-off' : regime.type;
        regime.characteristics.push('flight_to_safety');
        regime.tradingMode = 'defensive';
      } else if (correlations.regime === 'decorrelated') {
        regime.characteristics.push('decorrelated');
        regime.tradingMode = regime.tradingMode === 'normal' ? 'arbitrage' : regime.tradingMode;
      }
      
      // Use correlation strength
      if (correlations.strength < 0.3) {
        regime.characteristics.push('low_correlation');
      }
    }
    
    // Update market state
    this.marketState = {
      regime: regime.type,
      trend: trend?.direction || 'neutral',
      volatility: volatility?.level || 'normal',
      correlation: correlations?.strength || 0.5,
      bias: this.calculateOverallBias(regime),
      lastUpdate: Date.now()
    };
    
    console.log(`📊 MDT REGIME: ${regime.type.toUpperCase()} (mode: ${regime.tradingMode}, strength: ${regime.strength})`);
    console.log(`🎯 Characteristics: ${regime.characteristics.join(', ')}`);
    
    return regime;
  }
  
  /**
   * Calculate directional bias based on regime
   */
  calculateDirectionalBias(regime, signal) {
    let longBias = 0.5;  // Neutral start
    let shortBias = 0.5;
    
    // Regime-based bias
    switch (regime.type) {
      case 'bull':
      case 'risk-on':
        longBias = 0.8;
        shortBias = 0.2;
        console.log('📈 BULL/RISK-ON bias: Favor LONG positions');
        break;
        
      case 'bear':
      case 'risk-off':
        longBias = 0.2;
        shortBias = 0.8;
        console.log('📉 BEAR/RISK-OFF bias: Favor SHORT positions');
        break;
        
      case 'volatile':
        longBias = 0.4;
        shortBias = 0.4;
        console.log('⚡ VOLATILE bias: Prefer hedged positions');
        break;
        
      case 'ranging':
        longBias = 0.5;
        shortBias = 0.5;
        console.log('🔄 RANGING bias: Mean reversion strategies');
        break;
        
      case 'crash':
        longBias = 0.1;
        shortBias = 0.7;
        console.log('💥 CRASH bias: Heavily favor SHORT/cash');
        break;
        
      case 'decorrelated':
        longBias = 0.6;
        shortBias = 0.4;
        console.log('🌐 DECORRELATED bias: Slight long with arbitrage focus');
        break;
    }
    
    // Adjust by signal strength
    if (signal.direction === 'buy') {
      longBias *= (1 + signal.confidence * 0.3);
      shortBias *= (1 - signal.confidence * 0.3);
    } else if (signal.direction === 'sell') {
      shortBias *= (1 + signal.confidence * 0.3);
      longBias *= (1 - signal.confidence * 0.3);
    }
    
    // Historical performance adjustment
    const longPerf = this.performance.long;
    const shortPerf = this.performance.short;
    
    if (longPerf.totalTrades > 10) {
      const longWinRate = longPerf.wins / longPerf.totalTrades;
      longBias *= (0.5 + longWinRate);
    }
    
    if (shortPerf.totalTrades > 10) {
      const shortWinRate = shortPerf.wins / shortPerf.totalTrades;
      shortBias *= (0.5 + shortWinRate);
    }
    
    // Normalize
    const total = longBias + shortBias;
    
    return {
      long: longBias / total,
      short: shortBias / total,
      dominant: longBias > shortBias ? 'long' : 'short',
      strength: Math.abs(longBias - shortBias) / total
    };
  }
  
  /**
   * Determine position type based on all factors
   */
  determinePositionType(signal, bias, regime) {
    let action = 'hold';
    let direction = 'neutral';
    let type = 'standard';
    
    // Check if we should trade at all
    if (regime.type === 'crash' && signal.confidence < 0.9) {
      return { action: 'hold', direction: 'neutral', type: 'defensive' };
    }
    
    // Check position limits
    const exposure = this.calculateCurrentExposure();
    
    // Multi-directional logic
    if (signal.direction === 'buy') {
      if (bias.long > 0.6 || regime.type === 'bull' || regime.type === 'risk-on') {
        if (exposure.long < this.config.maxLongExposure) {
          action = 'open';
          direction = 'long';
          type = ['bull', 'risk-on'].includes(regime.type) ? 'trend_following' : 'standard';
        }
      } else if (this.config.enableShorts && bias.short > 0.7) {
        // Strong bear regime - consider short instead of long
        if (exposure.short < this.config.maxShortExposure) {
          action = 'open';
          direction = 'short';
          type = 'contrarian';
          console.log('🔄 CONTRARIAN: Shorting on buy signal due to bearish regime');
        }
      } else if (regime.type === 'ranging') {
        if (exposure.long < this.config.maxLongExposure) {
          action = 'open';
          direction = 'long';
          type = 'mean_reversion';
        }
      }
    } else if (signal.direction === 'sell') {
      if (this.config.enableShorts && (bias.short > 0.6 || regime.type === 'bear' || regime.type === 'risk-off')) {
        if (exposure.short < this.config.maxShortExposure) {
          action = 'open';
          direction = 'short';
          type = ['bear', 'risk-off'].includes(regime.type) ? 'trend_following' : 'standard';
        }
      } else if (bias.long > 0.7 && (regime.type === 'bull' || regime.type === 'risk-on')) {
        // Strong bull regime - this might be a pullback opportunity
        action = 'wait';
        direction = 'long';
        type = 'wait_for_dip';
        console.log('⏳ WAITING: Strong bull regime, waiting for better long entry');
      } else if (regime.type === 'ranging') {
        if (this.config.enableShorts && exposure.short < this.config.maxShortExposure) {
          action = 'open';
          direction = 'short';
          type = 'mean_reversion';
        }
      }
    }
    
    return { action, direction, type };
  }
  
  /**
   * Calculate position size with regime adaptation
   */
  calculateAdaptiveSize(signal, regime, positionType) {
    let baseSize = signal.suggestedSize || 0.1;
    
    // Apply regime multiplier
    const regimeMultiplier = this.config.aggressivenessMultiplier[regime.type] || 1.0;
    baseSize *= regimeMultiplier;
    
    console.log(`📏 Base size: ${(baseSize * 100).toFixed(1)}% (regime: ${regime.type}, multiplier: ${regimeMultiplier})`);
    
    // Adjust for position type
    switch (positionType.type) {
      case 'trend_following':
        baseSize *= 1.2; // Increase size when following strong trends
        console.log('📈 Trend following: +20% size');
        break;
        
      case 'contrarian':
        baseSize *= 0.7; // Reduce size for contrarian trades
        console.log('🔄 Contrarian: -30% size');
        break;
        
      case 'mean_reversion':
        baseSize *= 0.9; // Slightly reduce for range trading
        console.log('🔄 Mean reversion: -10% size');
        break;
        
      case 'defensive':
        baseSize *= 0.5; // Half size in defensive mode
        console.log('🛡️ Defensive: -50% size');
        break;
    }
    
    // Adjust by confidence
    baseSize *= (0.5 + signal.confidence * 0.5);
    
    // Check exposure limits
    const currentExposure = this.calculateCurrentExposure();
    
    if (positionType.direction === 'long') {
      const maxLong = this.config.maxLongExposure - currentExposure.long;
      baseSize = Math.min(baseSize, maxLong);
    } else if (positionType.direction === 'short') {
      const maxShort = this.config.maxShortExposure - currentExposure.short;
      baseSize = Math.min(baseSize, maxShort);
    }
    
    // Ensure minimum viable size
    return Math.max(0.01, baseSize);
  }
  
  /**
   * Check if hedging is required
   */
  checkHedgeRequirement(signal, regime) {
    if (!this.config.enableHedging) return null;
    
    const exposure = this.calculateCurrentExposure();
    const netExposure = exposure.long - exposure.short;
    
    // Hedge in volatile markets
    if (regime.type === 'volatile' && Math.abs(netExposure) > 0.3) {
      return {
        required: true,
        direction: netExposure > 0 ? 'short' : 'long',
        size: Math.abs(netExposure) * 0.5,
        reason: 'Volatility hedge',
        type: 'volatility'
      };
    }
    
    // Hedge when confidence is low
    if (signal.confidence < this.config.hedgeThreshold) {
      return {
        required: true,
        direction: signal.direction === 'buy' ? 'short' : 'long',
        size: signal.suggestedSize * 0.3,
        reason: 'Low confidence hedge',
        type: 'confidence'
      };
    }
    
    // Delta neutral in ranging markets
    if (this.config.deltaNeutralMode && regime.type === 'ranging') {
      if (Math.abs(netExposure) > 0.1) {
        return {
          required: true,
          direction: netExposure > 0 ? 'short' : 'long',
          size: Math.abs(netExposure),
          reason: 'Delta neutral adjustment',
          type: 'delta_neutral'
        };
      }
    }
    
    // Regime change hedge
    if (regime.type === 'crash' && exposure.long > 0.2) {
      return {
        required: true,
        direction: 'short',
        size: exposure.long * 0.8,
        reason: 'Crash protection hedge',
        type: 'crash_protection'
      };
    }
    
    return null;
  }
  
  /**
   * Scan for arbitrage opportunities
   */
  scanArbitrageOpportunity(marketData) {
    if (!this.config.arbitrage) return null;
    
    const { correlations, prices, spreads } = marketData;
    
    // Correlation arbitrage
    if (correlations && correlations.signals) {
      for (const signal of correlations.signals) {
        if (signal.type === 'DIVERGENCE' && signal.confidence > 0.7) {
          return {
            type: 'correlation_arbitrage',
            buy: signal.asset,
            sell: signal.metadata?.asset1 || 'BTC',
            expectedProfit: Math.abs(signal.metadata?.asset1Momentum - signal.metadata?.asset2Momentum) * 100,
            confidence: signal.confidence,
            timeframe: 'short',
            reasoning: signal.reason
          };
        } else if (signal.type === 'CORRELATION_BREAKOUT' && signal.confidence > 0.75) {
          return {
            type: 'breakout_arbitrage',
            action: signal.action,
            asset: signal.asset,
            expectedProfit: signal.metadata?.correlation * 100,
            confidence: signal.confidence,
            timeframe: signal.timeframe,
            reasoning: signal.reason
          };
        }
      }
    }
    
    // Statistical arbitrage from opportunities
    if (correlations && correlations.opportunities) {
      for (const opp of correlations.opportunities) {
        if (opp.type === 'STATISTICAL_ARBITRAGE' && opp.confidence > 0.65) {
          return {
            type: 'statistical_arbitrage',
            assets: opp.assets,
            action: opp.action,
            expectedProfit: opp.expectedProfit,
            confidence: opp.confidence,
            timeframe: 'short',
            reasoning: opp.reasoning
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Scan for pair trading opportunities
   */
  scanPairTradingOpportunity(marketData) {
    if (!this.config.pairTrading) return null;
    
    const { correlations } = marketData;
    
    if (correlations && correlations.opportunities) {
      for (const opp of correlations.opportunities) {
        if (opp.type === 'PAIR_TRADING' && opp.confidence > 0.75) {
          return {
            type: 'pair_trading',
            assets: opp.assets,
            strategy: opp.strategy,
            correlation: opp.correlation,
            confidence: opp.confidence,
            reasoning: opp.reasoning,
            expectedReturn: opp.correlation * 2 // Simplified expected return
          };
        }
      }
    }
    
    return null;
  }
  
  // EXECUTION METHODS REMOVED - NOW IN ExecutionLayer.js
  // (openPosition, executeArbitrage, executePairTrade, closePosition, executeTrade)

  // Get current status
  getStatus() {
    return {
      marketState: this.marketState,
      strategyState: this.strategyState,
      exposure: this.calculateCurrentExposure(),
      performance: this.getPerformanceSummary(),
      activeSystems: {
        shorts: this.config.enableShorts,
        hedging: this.config.enableHedging,
        arbitrage: this.config.arbitrage,
        pairTrading: this.config.pairTrading,
        deltaNeutral: this.config.deltaNeutralMode
      }
    };
  }
}

module.exports = TradingStrategyAdvisor;