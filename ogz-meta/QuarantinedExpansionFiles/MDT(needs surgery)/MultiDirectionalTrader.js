// ===================================================================
// MULTI-DIRECTIONAL TRADER - THE MARKET ASSASSIN! 🎯⚡
// ===================================================================
// Goes LONG in bull markets, SHORT in bear markets, BOTH in chop!
// ADAPTS to regime like a CHAMELEON ON STEROIDS!

const EventEmitter = require('events');

class MultiDirectionalTrader extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Multi-directional settings
      enableShorts: config.enableShorts !== false,
      enableHedging: config.enableHedging !== false,
      maxLongPositions: config.maxLongPositions || 3,
      maxShortPositions: config.maxShortPositions || 2,
      
      // Position management
      longShortRatio: config.longShortRatio || 0.7, // 70% long bias default
      hedgeThreshold: config.hedgeThreshold || 0.3,  // Hedge when confidence < 30%
      deltaNeutralMode: config.deltaNeutralMode || false,
      
      // Regime adaptation
      regimeAdaptive: config.regimeAdaptive !== false,
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
      
      // Risk per direction
      maxLongExposure: config.maxLongExposure || 0.6,    // 60% max long
      maxShortExposure: config.maxShortExposure || 0.4,  // 40% max short
      
      // Advanced features
      pairTrading: config.pairTrading !== false,
      arbitrage: config.arbitrage !== false,
      marketMaking: config.marketMaking || false,
      
      ...config
    };
    
    // Position tracking
    this.positions = {
      long: new Map(),
      short: new Map(),
      hedge: new Map(),
      arbitrage: new Map()
    };
    
    // Performance tracking
    this.performance = {
      long: { wins: 0, losses: 0, pnl: 0, totalTrades: 0 },
      short: { wins: 0, losses: 0, pnl: 0, totalTrades: 0 },
      hedge: { wins: 0, losses: 0, pnl: 0, totalTrades: 0 },
      arbitrage: { wins: 0, losses: 0, pnl: 0, totalTrades: 0 }
    };
    
    // Market state
    this.marketState = {
      regime: 'unknown',
      trend: 'neutral',
      volatility: 'normal',
      correlation: 'normal',
      bias: 'neutral',
      lastUpdate: 0
    };
    
    // Strategy state
    this.strategyState = {
      activeStrategies: new Set(),
      preferredDirection: 'neutral',
      riskMode: 'normal',
      adaptationLevel: 1.0
    };
    
    console.log('🎯 Multi-Directional Trader initialized');
    console.log('📈 Long positions enabled: YES');
    console.log('📉 Short positions enabled:', this.config.enableShorts ? 'YES' : 'NO');
    console.log('🛡️ Hedging enabled:', this.config.enableHedging ? 'YES' : 'NO');
    console.log('💎 Arbitrage enabled:', this.config.arbitrage ? 'YES' : 'NO');
  }
  
  /**
   * Main decision engine - THE BRAIN!
   */
  async evaluateTrade(signal, marketData) {
    console.log('🧠 MULTI-DIRECTIONAL EVALUATION ENGAGED...');
    
    // 1. Analyze market regime
    const regime = this.analyzeRegime(marketData);
    
    // 2. Calculate directional bias
    const bias = this.calculateDirectionalBias(regime, signal);
    
    // 3. Determine position type
    const positionType = this.determinePositionType(signal, bias, regime);
    
    // 4. Size the position based on regime
    const positionSize = this.calculateAdaptiveSize(signal, regime, positionType);
    
    // 5. Check if we need hedging
    const hedgeRequired = this.checkHedgeRequirement(signal, regime);
    
    // 6. Look for arbitrage opportunities
    const arbOpportunity = this.scanArbitrageOpportunity(marketData);
    
    // 7. Check pair trading opportunities
    const pairOpportunity = this.scanPairTradingOpportunity(marketData);
    
    return {
      action: positionType.action,
      direction: positionType.direction,
      size: positionSize,
      hedge: hedgeRequired,
      arbitrage: arbOpportunity,
      pairTrade: pairOpportunity,
      confidence: this.adjustConfidenceByRegime(signal.confidence, regime),
      reasoning: this.generateReasoning(signal, regime, positionType),
      regime: regime,
      positionType: positionType.type,
      timestamp: Date.now()
    };
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
    
    // Trend analysis
    if (trend && trend.strength > 0.7) {
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
    
    // Volatility analysis
    else if (volatility && volatility.current > volatility.average * 2) {
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
    
    console.log(`📊 REGIME DETECTED: ${regime.type.toUpperCase()} (${regime.tradingMode})`);
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
  
  /**
   * Open a position (long or short)
   */
  async openPosition(trade) {
    const { direction, size, asset, entry, stopLoss, takeProfit, type } = trade;
    
    const position = {
      id: this.generatePositionId(),
      direction,
      asset,
      size,
      entry,
      stopLoss,
      takeProfit,
      openTime: Date.now(),
      status: 'open',
      unrealizedPnL: 0,
      regime: trade.regime,
      type: type || 'standard',
      confidence: trade.confidence || 0.5,
      reasoning: trade.reasoning || 'Manual trade'
    };
    
    // Store in appropriate map
    if (direction === 'long') {
      this.positions.long.set(position.id, position);
      console.log(`📈 LONG POSITION OPENED: ${asset} @ ${entry} (${(size * 100).toFixed(1)}%)`);
      console.log(`🎯 Type: ${type}, Stop: ${stopLoss}, Target: ${takeProfit}`);
    } else if (direction === 'short') {
      this.positions.short.set(position.id, position);
      console.log(`📉 SHORT POSITION OPENED: ${asset} @ ${entry} (${(size * 100).toFixed(1)}%)`);
      console.log(`🎯 Type: ${type}, Stop: ${stopLoss}, Target: ${takeProfit}`);
    }
    
    // Update strategy state
    this.strategyState.activeStrategies.add(type);
    
    this.emit('positionOpened', position);
    
    return position;
  }
  
  /**
   * Execute arbitrage trade
   */
  async executeArbitrage(opportunity) {
    if (!opportunity) return null;
    
    console.log('💎 ARBITRAGE OPPORTUNITY DETECTED!');
    console.log(`Type: ${opportunity.type}`);
    console.log(`Expected Profit: ${opportunity.expectedProfit.toFixed(2)}%`);
    console.log(`Confidence: ${(opportunity.confidence * 100).toFixed(0)}%`);
    
    const arbTrade = {
      id: this.generatePositionId(),
      type: opportunity.type,
      legs: [],
      expectedProfit: opportunity.expectedProfit,
      confidence: opportunity.confidence,
      openTime: Date.now(),
      status: 'open',
      reasoning: opportunity.reasoning
    };
    
    if (opportunity.type === 'correlation_arbitrage' || opportunity.type === 'statistical_arbitrage') {
      // Determine leg sizes
      const legSize = 0.05; // 5% per leg
      
      if (opportunity.assets) {
        // Statistical arbitrage with defined assets
        const [asset1, asset2] = opportunity.assets;
        
        if (opportunity.action === 'LONG_SHORT') {
          arbTrade.legs.push({
            direction: 'long',
            asset: asset1,
            size: legSize
          });
          arbTrade.legs.push({
            direction: 'short',
            asset: asset2,
            size: legSize
          });
        } else {
          arbTrade.legs.push({
            direction: 'short',
            asset: asset1,
            size: legSize
          });
          arbTrade.legs.push({
            direction: 'long',
            asset: asset2,
            size: legSize
          });
        }
      } else {
        // Simple correlation arbitrage
        arbTrade.legs.push({
          direction: 'long',
          asset: opportunity.buy,
          size: legSize
        });
        
        if (opportunity.sell) {
          arbTrade.legs.push({
            direction: 'short',
            asset: opportunity.sell,
            size: legSize
          });
        }
      }
    }
    
    this.positions.arbitrage.set(arbTrade.id, arbTrade);
    this.emit('arbitrageExecuted', arbTrade);
    
    console.log(`💎 Arbitrage legs: ${arbTrade.legs.length}`);
    arbTrade.legs.forEach((leg, i) => {
      console.log(`  Leg ${i + 1}: ${leg.direction.toUpperCase()} ${leg.asset} (${(leg.size * 100).toFixed(1)}%)`);
    });
    
    return arbTrade;
  }
  
  /**
   * Execute pair trade
   */
  async executePairTrade(opportunity) {
    if (!opportunity || !opportunity.assets || opportunity.assets.length !== 2) return null;
    
    console.log('🤝 PAIR TRADING OPPORTUNITY!');
    console.log(`Assets: ${opportunity.assets.join(' / ')}`);
    console.log(`Correlation: ${(opportunity.correlation * 100).toFixed(1)}%`);
    console.log(`Strategy: ${opportunity.strategy}`);
    
    const [asset1, asset2] = opportunity.assets;
    const pairSize = 0.08; // 8% per leg
    
    const pairTrade = {
      id: this.generatePositionId(),
      type: 'pair_trading',
      strategy: opportunity.strategy,
      correlation: opportunity.correlation,
      assets: opportunity.assets,
      legs: [
        { direction: 'long', asset: asset1, size: pairSize },
        { direction: 'short', asset: asset2, size: pairSize }
      ],
      expectedReturn: opportunity.expectedReturn,
      confidence: opportunity.confidence,
      openTime: Date.now(),
      status: 'open',
      reasoning: opportunity.reasoning
    };
    
    this.positions.arbitrage.set(pairTrade.id, pairTrade);
    this.emit('pairTradeExecuted', pairTrade);
    
    console.log(`🤝 Pair trade: LONG ${asset1} / SHORT ${asset2}`);
    
    return pairTrade;
  }
  
  /**
   * Calculate current exposure across all positions
   */
  calculateCurrentExposure() {
    let longExposure = 0;
    let shortExposure = 0;
    
    // Sum long positions
    for (const position of this.positions.long.values()) {
      if (position.status === 'open') {
        longExposure += position.size;
      }
    }
    
    // Sum short positions
    for (const position of this.positions.short.values()) {
      if (position.status === 'open') {
        shortExposure += position.size;
      }
    }
    
    // Include hedge positions
    for (const position of this.positions.hedge.values()) {
      if (position.status === 'open') {
        if (position.direction === 'long') {
          longExposure += position.size;
        } else {
          shortExposure += position.size;
        }
      }
    }
    
    // Include arbitrage positions
    for (const position of this.positions.arbitrage.values()) {
      if (position.status === 'open' && position.legs) {
        for (const leg of position.legs) {
          if (leg.direction === 'long') {
            longExposure += leg.size;
          } else {
            shortExposure += leg.size;
          }
        }
      }
    }
    
    return {
      long: longExposure,
      short: shortExposure,
      net: longExposure - shortExposure,
      total: longExposure + shortExposure,
      utilization: (longExposure + shortExposure) / (this.config.maxLongExposure + this.config.maxShortExposure)
    };
  }
  
  /**
   * Adjust confidence based on regime
   */
  adjustConfidenceByRegime(baseConfidence, regime) {
    let adjusted = baseConfidence;
    
    switch (regime.type) {
      case 'bull':
      case 'bear':
      case 'risk-on':
      case 'risk-off':
        // Clear trending markets - boost confidence
        adjusted *= 1.2;
        break;
        
      case 'volatile':
        // Volatile markets - reduce confidence
        adjusted *= 0.8;
        break;
        
      case 'crash':
        // Crash - heavily reduce confidence
        adjusted *= 0.5;
        break;
        
      case 'ranging':
        // Ranging - slight reduction
        adjusted *= 0.9;
        break;
        
      case 'decorrelated':
        // Decorrelated - slight boost (arbitrage opportunities)
        adjusted *= 1.1;
        break;
    }
    
    // Apply regime strength
    adjusted *= (0.5 + regime.strength * 0.5);
    
    // Apply regime confidence
    adjusted *= regime.confidence;
    
    return Math.min(1.0, Math.max(0.1, adjusted));
  }
  
  /**
   * Generate human-readable reasoning
   */
  generateReasoning(signal, regime, positionType) {
    const parts = [];
    
    // Regime reasoning
    parts.push(`Market: ${regime.type.toUpperCase()} (${regime.tradingMode})`);
    
    // Position reasoning
    if (positionType.action === 'open') {
      parts.push(`${positionType.direction.toUpperCase()} ${positionType.type.replace(/_/g, ' ')}`);
    } else if (positionType.action === 'wait') {
      parts.push('WAITING for better entry');
    } else {
      parts.push('HOLDING - conditions not optimal');
    }
    
    // Signal reasoning
    parts.push(`Signal: ${signal.reason || 'Technical analysis'}`);
    
    // Regime characteristics
    if (regime.characteristics.length > 0) {
      parts.push(`Characteristics: ${regime.characteristics.join(', ')}`);
    }
    
    return parts.join(' | ');
  }
  
  /**
   * Calculate overall market bias
   */
  calculateOverallBias(regime) {
    const biasMap = {
      'bull': 'bullish',
      'bear': 'bearish',
      'risk-on': 'bullish',
      'risk-off': 'bearish',
      'volatile': 'neutral',
      'ranging': 'neutral',
      'crash': 'bearish',
      'decorrelated': 'neutral'
    };
    
    return biasMap[regime.type] || 'neutral';
  }
  
  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const exposure = this.calculateCurrentExposure();
    
    return {
      positions: {
        long: this.positions.long.size,
        short: this.positions.short.size,
        hedge: this.positions.hedge.size,
        arbitrage: this.positions.arbitrage.size,
        total: this.positions.long.size + this.positions.short.size + this.positions.hedge.size + this.positions.arbitrage.size
      },
      exposure,
      performance: {
        long: this.calculateDirectionalProfitability('long'),
        short: this.calculateDirectionalProfitability('short'),
        hedge: this.calculateDirectionalProfitability('hedge'),
        arbitrage: this.calculateDirectionalProfitability('arbitrage'),
        overall: this.calculateOverallProfitability()
      },
      marketState: this.marketState,
      strategyState: this.strategyState,
      limits: {
        longUtilization: (exposure.long / this.config.maxLongExposure * 100).toFixed(1) + '%',
        shortUtilization: (exposure.short / this.config.maxShortExposure * 100).toFixed(1) + '%',
        totalUtilization: (exposure.utilization * 100).toFixed(1) + '%'
      }
    };
  }
  
  calculateDirectionalProfitability(direction) {
    const perf = this.performance[direction];
    const totalTrades = perf.wins + perf.losses;
    
    if (totalTrades === 0) return { winRate: 0, pnl: 0, totalTrades: 0 };
    
    return {
      winRate: (perf.wins / totalTrades) * 100,
      pnl: perf.pnl,
      avgWin: perf.wins > 0 ? perf.pnl / perf.wins : 0,
      totalTrades,
      profitFactor: perf.losses > 0 ? Math.abs(perf.pnl / perf.losses) : perf.pnl > 0 ? 999 : 0
    };
  }
  
  calculateOverallProfitability() {
    const total = {
      wins: 0,
      losses: 0,
      pnl: 0,
      totalTrades: 0
    };
    
    Object.values(this.performance).forEach(perf => {
      total.wins += perf.wins;
      total.losses += perf.losses;
      total.pnl += perf.pnl;
      total.totalTrades += perf.totalTrades;
    });
    
    return {
      winRate: total.totalTrades > 0 ? (total.wins / total.totalTrades) * 100 : 0,
      pnl: total.pnl,
      totalTrades: total.totalTrades,
      profitFactor: total.losses > 0 ? Math.abs(total.pnl / total.losses) : total.pnl > 0 ? 999 : 0
    };
  }
  
  /**
   * Update performance metrics
   */
  updatePerformance(direction, pnl) {
    const perf = this.performance[direction];
    perf.totalTrades++;
    perf.pnl += pnl;
    
    if (pnl > 0) {
      perf.wins++;
    } else {
      perf.losses++;
    }
  }
  
  /**
   * Close position
   */
  async closePosition(positionId, currentPrice, reason = 'Manual close') {
    // Find position in any map
    let position = null;
    let direction = null;
    
    for (const [dir, posMap] of Object.entries(this.positions)) {
      if (posMap.has(positionId)) {
        position = posMap.get(positionId);
        direction = dir;
        break;
      }
    }
    
    if (!position) {
      console.log(`❌ Position ${positionId} not found`);
      return null;
    }
    
    // Calculate PnL
    let pnl = 0;
    if (position.direction === 'long') {
      pnl = ((currentPrice - position.entry) / position.entry) * position.size;
    } else if (position.direction === 'short') {
      pnl = ((position.entry - currentPrice) / position.entry) * position.size;
    }
    
    // Update position
    position.status = 'closed';
    position.closeTime = Date.now();
    position.closePrice = currentPrice;
    position.realizedPnL = pnl;
    position.closeReason = reason;
    
    // Update performance
    this.updatePerformance(direction, pnl);
    
    console.log(`✅ Position closed: ${position.asset} ${position.direction.toUpperCase()}`);
    console.log(`💰 PnL: ${(pnl * 100).toFixed(2)}% | Reason: ${reason}`);
    
    this.emit('positionClosed', position);
    
    return position;
  }
  
  generatePositionId() {
    return `POS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Execute trade (interface method for autonomous trader)
   */
  async executeTrade(tradeParams) {
    try {
      const { symbol, direction, quantity, price, stopLoss, metadata } = tradeParams;
      
      console.log(`🎯 MultiDirectionalTrader executing: ${direction} ${symbol} @ ${price}`);
      console.log(`📊 Quantity: ${quantity}, Stop: ${stopLoss}`);
      console.log(`🧠 Metadata: ${JSON.stringify(metadata)}`);
      
      // Calculate take profit (simple 2:1 risk/reward)
      const riskAmount = Math.abs(price - stopLoss);
      const takeProfit = direction === 'BUY'
        ? price + (riskAmount * 2)
        : price - (riskAmount * 2);
      
      // Create trade object for position opening
      const trade = {
        direction: direction === 'BUY' ? 'long' : 'short',
        asset: symbol,
        size: quantity / price, // Convert dollar amount to percentage
        entry: price,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        type: metadata?.patternType || 'standard',
        regime: metadata?.regime || 'unknown',
        confidence: metadata?.confidence || 0.5,
        reasoning: `${metadata?.regime || 'Unknown'} regime trade with ${((metadata?.confidence || 0.5) * 100).toFixed(0)}% confidence`
      };
      
      // Open the position
      const position = await this.openPosition(trade);
      
      if (position) {
        console.log(`✅ Trade executed successfully: Position ${position.id}`);
        
        // Emit trade executed event for the autonomous trader
        this.emit('trade_executed', {
          success: true,
          orderId: position.id,
          symbol: symbol,
          direction: direction,
          quantity: quantity,
          price: price,
          stopLoss: stopLoss,
          takeProfit: takeProfit,
          position: position,
          timestamp: Date.now()
        });
        
        return {
          success: true,
          orderId: position.id,
          executedPrice: price,
          executedQuantity: quantity,
          position: position,
          message: `${direction} ${symbol} position opened successfully`
        };
      } else {
        console.log('❌ Position opening failed');
        
        this.emit('trade_executed', {
          success: false,
          error: 'Position opening failed',
          symbol: symbol,
          direction: direction,
          timestamp: Date.now()
        });
        
        return {
          success: false,
          error: 'Position opening failed',
          message: 'Unable to open position'
        };
      }
      
    } catch (error) {
      console.error('❌ Trade execution error:', error);
      
      this.emit('trade_executed', {
        success: false,
        error: error.message,
        symbol: tradeParams.symbol,
        direction: tradeParams.direction,
        timestamp: Date.now()
      });
      
      return {
        success: false,
        error: error.message,
        message: 'Trade execution failed'
      };
    }
  }

  /**
   * Get current status
   */
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

module.exports = MultiDirectionalTrader;