/**
 * 📊 PerformanceValidator - Track Component Profitability
 * 
 * Based on Expert Analysis: "CONSISTENT PROFITS, not cosmic complexity"
 * 
 * This class tracks which trading components and features actually generate profits,
 * providing data-driven insights to optimize the trading system.
 */

class PerformanceValidator {
  constructor(config = {}) {
    this.config = {
      // 🎯 PROFITABILITY THRESHOLDS
      minProfitabilityThreshold: config.minProfitabilityThreshold || 0.55, // 55% win rate minimum
      minProfitRatio: config.minProfitRatio || 1.2,                       // 1.2:1 profit ratio minimum
      evaluationPeriod: config.evaluationPeriod || 86400000,              // 24 hours evaluation period
      minSampleSize: config.minSampleSize || 10,                          // Min 10 trades for evaluation
      
      // 📈 PERFORMANCE CATEGORIES
      trackComponents: config.trackComponents !== false,                   // Track component performance
      trackTimeframes: config.trackTimeframes !== false,                  // Track timeframe performance
      trackStrategies: config.trackStrategies !== false,                  // Track strategy performance
      trackMarketConditions: config.trackMarketConditions !== false,      // Track market condition performance
      
      // 🔧 SYSTEM SETTINGS
      enableAutoDisable: config.enableAutoDisable || false,               // Auto-disable poor performers
      enableRecommendations: config.enableRecommendations !== false,      // Provide optimization recommendations
      enableLogging: config.enableLogging !== false                       // Enable detailed logging
    };
    
    // Component tracking
    this.components = new Map([
      // Core Trading Components
      ['OptimizedTradingBrain', { trades: [], enabled: true, profitability: 0 }],
      ['AggressiveTradingMode', { trades: [], enabled: true, profitability: 0 }],
      ['QuantumCosmicTradingCore', { trades: [], enabled: true, profitability: 0 }],
      ['QuantumPositionSizer', { trades: [], enabled: true, profitability: 0 }],
      
      // Analysis Features
      ['CosmicAnalysis', { trades: [], enabled: true, profitability: 0 }],
      ['QuantumAnalysis', { trades: [], enabled: true, profitability: 0 }],
      ['ScalperMode', { trades: [], enabled: true, profitability: 0 }],
      ['MultiTimeframeAnalysis', { trades: [], enabled: true, profitability: 0 }],
      
      // Risk Management
      ['RiskManager', { trades: [], enabled: true, profitability: 0 }],
      ['TradingSafetyNet', { trades: [], enabled: true, profitability: 0 }],
      
      // Random/Forced Trading
      ['RandomTrades', { trades: [], enabled: true, profitability: 0 }],
      ['ForcedTrades', { trades: [], enabled: true, profitability: 0 }]
    ]);
    
    // Timeframe tracking
    this.timeframes = new Map([
      ['1m', { trades: [], enabled: true, profitability: 0 }],
      ['5m', { trades: [], enabled: true, profitability: 0 }],
      ['15m', { trades: [], enabled: true, profitability: 0 }],
      ['1h', { trades: [], enabled: true, profitability: 0 }],
      ['4h', { trades: [], enabled: true, profitability: 0 }],
      ['1d', { trades: [], enabled: true, profitability: 0 }]
    ]);
    
    // Strategy tracking
    this.strategies = new Map();
    
    // Market condition tracking
    this.marketConditions = new Map([
      ['trending_up', { trades: [], enabled: true, profitability: 0 }],
      ['trending_down', { trades: [], enabled: true, profitability: 0 }],
      ['sideways', { trades: [], enabled: true, profitability: 0 }],
      ['volatile', { trades: [], enabled: true, profitability: 0 }],
      ['low_volume', { trades: [], enabled: true, profitability: 0 }],
      ['high_volume', { trades: [], enabled: true, profitability: 0 }]
    ]);
    
    // Performance metrics
    this.metrics = {
      totalTrades: 0,
      profitableTrades: 0,
      totalPnL: 0,
      bestComponent: null,
      worstComponent: null,
      lastEvaluation: Date.now(),
      recommendations: []
    };
    
    console.log('📊 PerformanceValidator initialized - Tracking component profitability');
  }
  
  /**
   * 📈 RECORD TRADE: Track trade performance by component
   * @param {Object} trade - Trade details
   * @param {Array} involvedComponents - Components that influenced this trade
   */
  recordTrade(trade, involvedComponents = []) {
    const tradeData = {
      timestamp: Date.now(),
      pnl: trade.pnl || 0,
      winRate: trade.pnl > 0 ? 1 : 0,
      size: trade.size || 0,
      duration: trade.duration || 0,
      fees: trade.fees || 0,
      netPnL: (trade.pnl || 0) - (trade.fees || 0),
      strategy: trade.strategy || 'unknown',
      timeframe: trade.timeframe || '1m',
      marketCondition: trade.marketCondition || 'unknown',
      metadata: trade.metadata || {}
    };
    
    this.metrics.totalTrades++;
    if (tradeData.netPnL > 0) {
      this.metrics.profitableTrades++;
    }
    this.metrics.totalPnL += tradeData.netPnL;
    
    // Track by components
    if (this.config.trackComponents) {
      involvedComponents.forEach(componentName => {
        if (this.components.has(componentName)) {
          this.components.get(componentName).trades.push(tradeData);
          this.calculateComponentProfitability(componentName);
        }
      });
    }
    
    // Track by timeframe
    if (this.config.trackTimeframes && this.timeframes.has(tradeData.timeframe)) {
      this.timeframes.get(tradeData.timeframe).trades.push(tradeData);
      this.calculateTimeframeProfitability(tradeData.timeframe);
    }
    
    // Track by strategy
    if (this.config.trackStrategies) {
      if (!this.strategies.has(tradeData.strategy)) {
        this.strategies.set(tradeData.strategy, { trades: [], enabled: true, profitability: 0 });
      }
      this.strategies.get(tradeData.strategy).trades.push(tradeData);
      this.calculateStrategyProfitability(tradeData.strategy);
    }
    
    // Track by market condition
    if (this.config.trackMarketConditions && this.marketConditions.has(tradeData.marketCondition)) {
      this.marketConditions.get(tradeData.marketCondition).trades.push(tradeData);
      this.calculateMarketConditionProfitability(tradeData.marketCondition);
    }
    
    // Periodic evaluation
    if (Date.now() - this.metrics.lastEvaluation > this.config.evaluationPeriod) {
      this.performPeriodicEvaluation();
    }
    
    if (this.config.enableLogging) {
      console.log(`📊 Trade recorded: ${tradeData.netPnL.toFixed(2)} PnL, Components: [${involvedComponents.join(', ')}]`);
    }
  }
  
  /**
   * 🎯 EVALUATE COMPONENT: Calculate component profitability metrics
   * @param {string} componentName - Name of component to evaluate
   */
  calculateComponentProfitability(componentName) {
    const component = this.components.get(componentName);
    if (!component || component.trades.length === 0) return;
    
    const recentTrades = this.getRecentTrades(component.trades);
    if (recentTrades.length < this.config.minSampleSize) return;
    
    const winningTrades = recentTrades.filter(t => t.netPnL > 0);
    const winRate = winningTrades.length / recentTrades.length;
    const totalPnL = recentTrades.reduce((sum, t) => sum + t.netPnL, 0);
    const avgWin = winningTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.netPnL, 0) / winningTrades.length : 0;
    const losingTrades = recentTrades.filter(t => t.netPnL <= 0);
    const avgLoss = losingTrades.length > 0 ? 
      Math.abs(losingTrades.reduce((sum, t) => sum + t.netPnL, 0) / losingTrades.length) : 0;
    const profitRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin;
    
    // Calculate profitability score (combination of win rate and profit ratio)
    component.profitability = (winRate * 0.6) + (Math.min(profitRatio / 2, 0.4));
    component.metrics = {
      winRate,
      totalPnL,
      avgWin,
      avgLoss,
      profitRatio,
      tradeCount: recentTrades.length,
      lastUpdated: Date.now()
    };
    
    // Auto-disable if performance is poor
    if (this.config.enableAutoDisable && 
        component.profitability < this.config.minProfitabilityThreshold &&
        recentTrades.length >= this.config.minSampleSize * 2) {
      
      component.enabled = false;
      console.warn(`📊 Auto-disabled ${componentName}: Profitability ${(component.profitability * 100).toFixed(1)}% below threshold`);
    }
  }
  
  /**
   * Similar methods for timeframes, strategies, and market conditions
   */
  calculateTimeframeProfitability(timeframe) {
    const data = this.timeframes.get(timeframe);
    this.calculateProfitabilityForData(data, `Timeframe ${timeframe}`);
  }
  
  calculateStrategyProfitability(strategy) {
    const data = this.strategies.get(strategy);
    this.calculateProfitabilityForData(data, `Strategy ${strategy}`);
  }
  
  calculateMarketConditionProfitability(condition) {
    const data = this.marketConditions.get(condition);
    this.calculateProfitabilityForData(data, `Market ${condition}`);
  }
  
  /**
   * 📊 GENERIC PROFITABILITY CALCULATION
   * @param {Object} data - Data object with trades array
   * @param {string} name - Name for logging
   */
  calculateProfitabilityForData(data, name) {
    if (!data || data.trades.length === 0) return;
    
    const recentTrades = this.getRecentTrades(data.trades);
    if (recentTrades.length < this.config.minSampleSize) return;
    
    const winningTrades = recentTrades.filter(t => t.netPnL > 0);
    const winRate = winningTrades.length / recentTrades.length;
    const totalPnL = recentTrades.reduce((sum, t) => sum + t.netPnL, 0);
    
    data.profitability = winRate;
    data.metrics = {
      winRate,
      totalPnL,
      tradeCount: recentTrades.length,
      lastUpdated: Date.now()
    };
  }
  
  /**
   * ⏰ GET RECENT TRADES: Filter trades within evaluation period
   * @param {Array} trades - All trades
   * @returns {Array} Recent trades within evaluation period
   */
  getRecentTrades(trades) {
    const cutoffTime = Date.now() - this.config.evaluationPeriod;
    return trades.filter(trade => trade.timestamp > cutoffTime);
  }
  
  /**
   * 🔄 PERIODIC EVALUATION: Comprehensive performance analysis
   */
  performPeriodicEvaluation() {
    this.metrics.lastEvaluation = Date.now();
    
    // Find best and worst performing components
    let bestComponent = null;
    let worstComponent = null;
    let bestScore = 0;
    let worstScore = 1;
    
    for (const [name, component] of this.components) {
      if (component.trades.length >= this.config.minSampleSize) {
        if (component.profitability > bestScore) {
          bestScore = component.profitability;
          bestComponent = name;
        }
        if (component.profitability < worstScore) {
          worstScore = component.profitability;
          worstComponent = name;
        }
      }
    }
    
    this.metrics.bestComponent = bestComponent;
    this.metrics.worstComponent = worstComponent;
    
    // Generate recommendations
    if (this.config.enableRecommendations) {
      this.generateRecommendations();
    }
    
    if (this.config.enableLogging) {
      console.log(`📊 Periodic evaluation completed:`);
      console.log(`   Best component: ${bestComponent} (${(bestScore * 100).toFixed(1)}%)`);
      console.log(`   Worst component: ${worstComponent} (${(worstScore * 100).toFixed(1)}%)`);
      console.log(`   Total trades: ${this.metrics.totalTrades}, Win rate: ${((this.metrics.profitableTrades / this.metrics.totalTrades) * 100).toFixed(1)}%`);
    }
  }
  
  /**
   * 💡 GENERATE RECOMMENDATIONS: Data-driven optimization suggestions
   */
  generateRecommendations() {
    this.metrics.recommendations = [];
    
    // Component recommendations
    for (const [name, component] of this.components) {
      if (component.trades.length >= this.config.minSampleSize) {
        if (component.profitability < this.config.minProfitabilityThreshold) {
          this.metrics.recommendations.push({
            type: 'DISABLE_COMPONENT',
            component: name,
            reason: `Low profitability: ${(component.profitability * 100).toFixed(1)}%`,
            priority: 'HIGH',
            action: `Consider disabling ${name} to improve overall performance`
          });
        } else if (component.profitability > 0.8) {
          this.metrics.recommendations.push({
            type: 'OPTIMIZE_COMPONENT',
            component: name,
            reason: `High profitability: ${(component.profitability * 100).toFixed(1)}%`,
            priority: 'MEDIUM',
            action: `Consider increasing allocation to ${name}`
          });
        }
      }
    }
    
    // Cosmic complexity warning
    const cosmicComponent = this.components.get('QuantumCosmicTradingCore');
    if (cosmicComponent && cosmicComponent.profitability < 0.6) {
      this.metrics.recommendations.push({
        type: 'SIMPLIFY_SYSTEM',
        component: 'QuantumCosmicTradingCore',
        reason: 'Complex cosmic features not generating consistent profits',
        priority: 'HIGH',
        action: 'Consider simplifying to basic technical analysis for more consistent profits'
      });
    }
    
    // Random trade warning
    const randomComponent = this.components.get('RandomTrades');
    if (randomComponent && randomComponent.profitability < 0.4) {
      this.metrics.recommendations.push({
        type: 'DISABLE_RANDOM',
        component: 'RandomTrades',
        reason: 'Random trades generating losses',
        priority: 'CRITICAL',
        action: 'Disable random trading immediately - focus on signal-based trades only'
      });
    }
  }
  
  /**
   * 📊 GET PERFORMANCE REPORT: Comprehensive performance analysis
   * @returns {Object} Detailed performance report
   */
  getPerformanceReport() {
    const report = {
      timestamp: Date.now(),
      overview: {
        totalTrades: this.metrics.totalTrades,
        winRate: this.metrics.totalTrades > 0 ? this.metrics.profitableTrades / this.metrics.totalTrades : 0,
        totalPnL: this.metrics.totalPnL,
        bestComponent: this.metrics.bestComponent,
        worstComponent: this.metrics.worstComponent
      },
      components: {},
      timeframes: {},
      strategies: {},
      marketConditions: {},
      recommendations: this.metrics.recommendations
    };
    
    // Component performance
    for (const [name, component] of this.components) {
      if (component.trades.length > 0) {
        report.components[name] = {
          enabled: component.enabled,
          profitability: component.profitability,
          tradeCount: component.trades.length,
          metrics: component.metrics || {}
        };
      }
    }
    
    // Timeframe performance
    for (const [timeframe, data] of this.timeframes) {
      if (data.trades.length > 0) {
        report.timeframes[timeframe] = {
          profitability: data.profitability,
          tradeCount: data.trades.length,
          metrics: data.metrics || {}
        };
      }
    }
    
    return report;
  }
  
  /**
   * 🎯 IS COMPONENT ENABLED: Check if component should be used
   * @param {string} componentName - Name of component
   * @returns {boolean} True if component is enabled and performing well
   */
  isComponentEnabled(componentName) {
    const component = this.components.get(componentName);
    return component ? component.enabled : true; // Default to enabled if not tracked
  }
  
  /**
   * 🔧 MANUAL OVERRIDE: Manually enable/disable components
   * @param {string} componentName - Component to modify
   * @param {boolean} enabled - Enable/disable state
   * @param {string} reason - Reason for override
   */
  overrideComponent(componentName, enabled, reason = 'Manual override') {
    if (this.components.has(componentName)) {
      this.components.get(componentName).enabled = enabled;
      console.log(`📊 ${componentName} ${enabled ? 'enabled' : 'disabled'}: ${reason}`);
    }
  }
}

module.exports = PerformanceValidator;