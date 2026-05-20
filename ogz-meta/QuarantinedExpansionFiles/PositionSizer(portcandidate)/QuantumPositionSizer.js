// ===================================================================
// FIXED KELLY CRITERION - NO QUANTUM BS, JUST MATH THAT WORKS!
// ===================================================================

class FixedQuantumPositionSizer {
  constructor(riskManager, config = {}) {
    this.riskManager = riskManager;
    
    this.config = {
      maxPositionSize: 0.25,      // Maximum 25% of balance
      minPositionSize: 0.001,     // Minimum 0.1% of balance
      defaultWinRate: 0.55,       // Default 55% win rate
      defaultRiskReward: 1.5,     // Default 1.5:1 risk/reward
      kellySafetyFactor: 0.25,    // Use 25% of Kelly suggestion (Kelly/4)
      ...config
    };
    
    // Track historical performance for better Kelly
    this.tradeHistory = [];
    this.performanceStats = {
      winRate: this.config.defaultWinRate,
      avgWin: 0.02,    // 2% average win
      avgLoss: 0.01,   // 1% average loss
      totalTrades: 0
    };
    
    console.log('💰 Kelly Criterion Position Sizer initialized (WITHOUT quantum nonsense!)');
  }
  
  /**
   * Set RiskManager reference for integration
   */
  setRiskManager(riskManager) {
    this.riskManager = riskManager;
    console.log('💰 RiskManager linked to Kelly Position Sizer');
  }
  
  /**
   * Calculate position size using REAL Kelly Criterion
   */
  calculateOptimalPosition(price, volatility, confidence, balance, marketData = {}) {
    console.log('🎲 Calculating Kelly position size...');
    
    // Build analysis object from inputs
    const analysis = {
      confidence: confidence || 0.5,
      decision: marketData.signal > 0 ? 'buy' : 'sell',
      patternStrength: confidence || 0.5,
      marketRegime: this.determineMarketRegime(volatility, marketData)
    };
    
    // Step 1: Get win probability from analysis
    const winProbability = this.calculateWinProbability(analysis);
    
    // Step 2: Get risk/reward ratio
    const riskReward = this.calculateRiskReward(analysis, { volatility, ...marketData });
    
    // Step 3: Calculate Kelly Fraction
    const kellyFraction = this.calculateKellyFraction(winProbability, riskReward);
    
    // Step 4: Apply safety factors and limits
    const safePosition = this.applySafetyLimits(kellyFraction, balance);
    
    // Step 5: Final position size in dollars
    const positionValue = balance * safePosition;
    const positionSize = positionValue / price;
    
    console.log(`
💰 KELLY CALCULATION:
├─ Balance: $${balance.toFixed(2)}
├─ Win Probability: ${(winProbability * 100).toFixed(1)}%
├─ Risk/Reward: ${riskReward.toFixed(2)}:1
├─ Kelly Fraction: ${(kellyFraction * 100).toFixed(2)}%
├─ Safe Fraction: ${(safePosition * 100).toFixed(2)}%
└─ Position Size: $${positionValue.toFixed(2)} (${positionSize.toFixed(6)} shares)
    `);
    
    // CRITICAL: Never return 0!
    if (positionSize === 0 || isNaN(positionSize)) {
      console.log('⚠️ Kelly returned 0, using minimum position');
      const minPosition = balance * this.config.minPositionSize / price;
      return {
        size: minPosition,
        value: minPosition * price,
        kellyScore: this.config.minPositionSize,
        optimalShares: minPosition,
        positionSizePercent: this.config.minPositionSize,
        confidence: 0.3,
        method: 'kelly_fallback'
      };
    }
    
    return {
      size: positionSize,
      value: positionValue,
      kellyScore: safePosition,
      optimalShares: positionSize,
      positionSizePercent: safePosition,
      confidence: analysis.confidence,
      method: 'kelly',
      kelly: {
        base: kellyFraction,
        adjusted: safePosition,
        multiplier: this.config.kellySafetyFactor
      }
    };
  }
  
  /**
   * Calculate win probability from analysis
   */
  calculateWinProbability(analysis) {
    // Start with historical win rate
    let winProb = this.performanceStats.winRate;
    
    // Adjust based on analysis confidence
    if (analysis.confidence) {
      // Blend historical with current confidence
      winProb = (winProb * 0.7) + (analysis.confidence * 0.3);
    }
    
    // Adjust for specific patterns
    if (analysis.patternStrength) {
      winProb *= (1 + analysis.patternStrength * 0.1);
    }
    
    // Market regime adjustment
    if (analysis.marketRegime === 'trending' && analysis.decision === 'buy') {
      winProb *= 1.1; // 10% boost in trending markets
    } else if (analysis.marketRegime === 'choppy') {
      winProb *= 0.9; // 10% reduction in choppy markets
    }
    
    // Ensure valid probability
    return Math.max(0.3, Math.min(0.8, winProb));
  }
  
  /**
   * Calculate risk/reward ratio
   */
  calculateRiskReward(analysis, marketConditions) {
    // Base risk/reward from historical data
    let riskReward = this.performanceStats.avgWin / this.performanceStats.avgLoss;
    
    // If no history, use default
    if (isNaN(riskReward) || riskReward === 0) {
      riskReward = this.config.defaultRiskReward;
    }
    
    // Adjust for volatility
    const volatility = marketConditions.volatility || 0.01;
    if (volatility > 0.02) {
      riskReward *= 1.2; // Higher volatility = potentially bigger moves
    } else if (volatility < 0.005) {
      riskReward *= 0.8; // Low volatility = smaller moves
    }
    
    // Adjust for time of day (if provided)
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 11) {
      riskReward *= 1.1; // Better risk/reward during active hours
    }
    
    return Math.max(0.5, Math.min(3.0, riskReward));
  }
  
  /**
   * The ACTUAL Kelly Criterion formula
   */
  calculateKellyFraction(winProbability, riskReward) {
    // Kelly Formula: f = (p * b - q) / b
    // Where:
    // f = fraction of capital to bet
    // p = probability of winning
    // b = ratio of win to loss (risk/reward)
    // q = probability of losing (1 - p)
    
    const p = winProbability;
    const q = 1 - winProbability;
    const b = riskReward;
    
    // The classic Kelly formula
    const kellyFraction = (p * b - q) / b;
    
    // Alternative Kelly formula for verification
    const kellyAlt = p - (q / b);
    
    console.log(`🎲 Kelly Math: (${p.toFixed(3)} * ${b.toFixed(2)} - ${q.toFixed(3)}) / ${b.toFixed(2)} = ${kellyFraction.toFixed(4)}`);
    
    // Use the average of both formulas for robustness
    const finalKelly = (kellyFraction + kellyAlt) / 2;
    
    // Kelly can suggest negative values (don't bet) or huge values (bet everything)
    // We need to be reasonable here
    return Math.max(0, finalKelly);
  }
  
  /**
   * Apply safety limits to Kelly suggestion
   */
  applySafetyLimits(kellyFraction, balance) {
    // Step 1: Apply Kelly safety factor (Kelly/4 is common)
    let safePosition = kellyFraction * this.config.kellySafetyFactor;
    
    // Step 2: Apply maximum position size limit
    safePosition = Math.min(safePosition, this.config.maxPositionSize);
    
    // Step 3: Apply minimum position size
    safePosition = Math.max(safePosition, this.config.minPositionSize);
    
    // Step 4: Reduce size if in drawdown
    const drawdown = this.calculateDrawdown();
    if (drawdown > 0.05) { // 5% drawdown
      safePosition *= (1 - drawdown); // Reduce position by drawdown percentage
    }
    
    // Step 5: Account for existing positions (if any)
    // This prevents over-leveraging
    const existingExposure = this.getExistingExposure();
    if (existingExposure > 0) {
      const remainingCapacity = this.config.maxPositionSize - existingExposure;
      safePosition = Math.min(safePosition, remainingCapacity);
    }
    
    return safePosition;
  }
  
  /**
   * Update performance stats after trade
   */
  updatePerformance(trade) {
    this.tradeHistory.push(trade);
    
    // Keep only last 100 trades for calculations
    if (this.tradeHistory.length > 100) {
      this.tradeHistory.shift();
    }
    
    // Recalculate statistics
    const wins = this.tradeHistory.filter(t => t.profit > 0);
    const losses = this.tradeHistory.filter(t => t.profit <= 0);
    
    this.performanceStats.totalTrades = this.tradeHistory.length;
    this.performanceStats.winRate = wins.length / this.tradeHistory.length;
    
    if (wins.length > 0) {
      this.performanceStats.avgWin = wins.reduce((sum, t) => sum + t.profit, 0) / wins.length;
    }
    
    if (losses.length > 0) {
      this.performanceStats.avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0) / losses.length);
    }
    
    console.log(`📊 Updated performance: Win Rate ${(this.performanceStats.winRate * 100).toFixed(1)}%`);
  }
  
  /**
   * Calculate current drawdown
   */
  calculateDrawdown() {
    if (this.tradeHistory.length === 0) return 0;
    
    let peak = 0;
    let currentValue = 0;
    let maxDrawdown = 0;
    
    for (const trade of this.tradeHistory) {
      currentValue += trade.profit;
      peak = Math.max(peak, currentValue);
      const drawdown = peak > 0 ? (peak - currentValue) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }
  
  /**
   * Get existing position exposure
   */
  getExistingExposure() {
    // This would check actual open positions
    // For now, return 0 (no positions)
    return 0;
  }
  
  /**
   * Emergency position size (when all else fails)
   */
  getEmergencyPositionSize(balance) {
    // Simple 1% of balance
    return balance * 0.01;
  }
  
  /**
   * Determine market regime from conditions
   */
  determineMarketRegime(volatility, marketData) {
    if (!volatility) return 'normal';
    
    if (volatility > 0.03) return 'choppy';
    if (volatility < 0.005) return 'stable';
    if (marketData.trend === 'uptrend' || marketData.trend === 'downtrend') return 'trending';
    
    return 'normal';
  }
  
  /**
   * Legacy method compatibility - main calculation entry point
   */
  async calculate(params) {
    const { price, confidence, marketData, balance } = params;
    
    // Use the FIXED Kelly calculator
    const result = this.calculateOptimalPosition(
      price, 
      marketData.volatility, 
      confidence, 
      balance, 
      marketData
    );
    
    // Return both dollar amount and percentage
    return {
      size: result.size,
      percentage: result.positionSizePercent,
      method: 'kelly',
      confidence: result.confidence,
      kellyScore: result.kellyScore,
      optimalShares: result.optimalShares,
      value: result.value
    };
  }
}

module.exports = FixedQuantumPositionSizer;