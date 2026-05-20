// ===================================================================
// ADAPTIVE RISK MANAGEMENT SYSTEM - THE ACCOUNT PROTECTOR! 🛡️💎
// ===================================================================
// Professional Risk Management with Regime Awareness
// THIS IS WHAT KEEPS YOU IN THE GAME LONG ENOUGH TO WIN BIG!

const EventEmitter = require('events');

class AdaptiveRiskManagementSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Account settings
      initialBalance: config.initialBalance || 10000,
      maxDrawdown: config.maxDrawdown || 0.20, // 20% max drawdown
      
      // Position sizing (SEMI-AGGRESSIVE)
      baseRiskPerTrade: config.baseRiskPerTrade || 0.015, // 1.5% risk per trade
      maxRiskPerTrade: config.maxRiskPerTrade || 0.035, // 3.5% max risk
      maxOpenPositions: config.maxOpenPositions || 4, // 4 concurrent positions
      
      // Regime-based adjustments
      regimeMultipliers: {
        trending_up: 1.4,     // 40% larger positions in uptrends
        trending_down: 0.6,   // 40% smaller in downtrends  
        volatile: 0.4,        // 60% smaller in volatile markets
        ranging: 1.0,         // Normal size in ranging
        breakout: 1.8,        // 80% larger on breakouts
        breakdown: 0.3,       // 70% smaller on breakdowns
        risk_on: 1.3,         // Risk-on boost
        risk_off: 0.5,        // Risk-off protection
        crash: 0.1,           // Emergency mode
        quiet: 0.8            // Quiet market reduction
      },
      
      // Dynamic stop losses
      atrMultiplier: config.atrMultiplier || 2.2, // Slightly wider stops
      minStopDistance: config.minStopDistance || 0.008, // 0.8% minimum
      maxStopDistance: config.maxStopDistance || 0.045, // 4.5% maximum
      
      // Circuit breakers (relaxed for 3-day autonomous operation)
      maxDailyLoss: config.maxDailyLoss || 0.08, // 8% daily loss limit
      maxConsecutiveLosses: config.maxConsecutiveLosses || 6, // 6 consecutive losses
      cooldownPeriod: config.cooldownPeriod || 1800000, // 30 min cooldown (shorter)
      
      // Kelly Criterion
      useKellyCriterion: config.useKellyCriterion !== false,
      kellyFraction: config.kellyFraction || 0.35, // Use 35% of Kelly (more aggressive)
      
      ...config
    };
    
    // Account state
    this.accountState = {
      balance: this.config.initialBalance,
      equity: this.config.initialBalance,
      peakBalance: this.config.initialBalance,
      drawdown: 0,
      
      // Daily tracking
      dailyStartBalance: this.config.initialBalance,
      dailyPnL: 0,
      dailyLossTriggered: false,
      
      // Position tracking
      openPositions: new Map(),
      totalExposure: 0,
      
      // Performance metrics
      winRate: 0.55, // Start with 55% assumption (optimistic)
      avgWin: 0,
      avgLoss: 0,
      consecutiveLosses: 0,
      totalTrades: 0,
      profitFactor: 1.0,
      
      // Circuit breaker state
      tradingEnabled: true,
      cooldownUntil: 0,
      
      // Learning metrics
      regimePerformance: new Map(),
      patternSuccess: new Map(),
      timeOfDayPerformance: new Map()
    };
    
    // Risk calculations cache
    this.riskCache = {
      currentATR: 0.02, // Default 2% ATR
      lastATRUpdate: 0,
      volatilityRegime: 'normal',
      marketMomentum: 0
    };
    
    // Start daily reset timer
    this.setupDailyReset();
    
    console.log('🛡️ ADAPTIVE Risk Management System initialized');
    console.log(`💰 Starting Balance: $${this.config.initialBalance}`);
    console.log(`📉 Max Drawdown: ${(this.config.maxDrawdown * 100).toFixed(0)}%`);
    console.log(`🎯 Base Risk: ${(this.config.baseRiskPerTrade * 100).toFixed(1)}% (SEMI-AGGRESSIVE MODE)`);
  }
  
  /**
   * Calculate position size based on risk and market regime
   */
  calculatePositionSize(signal) {
    const { 
      confidence, 
      entryPrice, 
      stopLoss, 
      regime, 
      patternType 
    } = signal;
    
    // Check if trading is enabled
    if (!this.accountState.tradingEnabled) {
      console.log('🚫 Trading disabled by circuit breaker');
      return 0;
    }
    
    // Check daily loss limit
    if (this.accountState.dailyLossTriggered) {
      console.log('🚫 Daily loss limit reached');
      return 0;
    }
    
    // Check position limits
    if (this.accountState.openPositions.size >= this.config.maxOpenPositions) {
      console.log('🚫 Maximum positions reached');
      return 0;
    }
    
    // Base risk calculation
    let riskPerTrade = this.config.baseRiskPerTrade;
    
    // 1. Adjust for market regime (KEY FOR 3-DAY AUTONOMOUS OPERATION)
    const regimeMultiplier = this.config.regimeMultipliers[regime] || 1.0;
    riskPerTrade *= regimeMultiplier;
    
    // 2. Adjust for confidence (higher confidence = larger position)
    const confidenceMultiplier = 0.6 + (confidence * 0.4); // 0.6x to 1.0x
    riskPerTrade *= confidenceMultiplier;
    
    // 3. Adjust for pattern success rate (LEARNING COMPONENT)
    if (patternType && this.accountState.patternSuccess.has(patternType)) {
      const patternWinRate = this.accountState.patternSuccess.get(patternType);
      const patternMultiplier = 0.5 + patternWinRate; // 0.5x to 1.5x
      riskPerTrade *= patternMultiplier;
    }
    
    // 4. Adjust for win rate (Kelly Criterion)
    if (this.config.useKellyCriterion && this.accountState.totalTrades > 15) {
      const kellyPercent = this.calculateKellyPercentage();
      const kellyCapped = Math.min(kellyPercent, 0.3); // Cap at 30%
      riskPerTrade *= kellyCapped / this.config.baseRiskPerTrade;
    }
    
    // 5. Adjust for drawdown (reduce size during drawdown)
    if (this.accountState.drawdown > 0.03) {
      const drawdownMultiplier = 1 - (this.accountState.drawdown * 1.5); // Reduce up to 30%
      riskPerTrade *= Math.max(0.7, drawdownMultiplier);
    }
    
    // 6. Time of day adjustment (AUTONOMOUS LEARNING)
    const hour = new Date().getHours();
    const timeMultiplier = this.getTimeOfDayMultiplier(hour);
    riskPerTrade *= timeMultiplier;
    
    // 7. Cap at maximum risk
    riskPerTrade = Math.min(riskPerTrade, this.config.maxRiskPerTrade);
    
    // Calculate position size
    const riskAmount = this.accountState.equity * riskPerTrade;
    const stopDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
    const positionSize = riskAmount / stopDistance;
    
    // 8. Final exposure check (2.5x leverage limit for semi-aggressive)
    const newExposure = this.accountState.totalExposure + positionSize;
    if (newExposure > this.accountState.equity * 2.5) {
      console.log('⚠️ Would exceed exposure limit');
      return Math.max(0, (this.accountState.equity * 2.5) - this.accountState.totalExposure);
    }
    
    console.log(`📊 Position Size: $${positionSize.toFixed(2)} | Risk: ${(riskPerTrade * 100).toFixed(1)}% | Regime: ${regime}`);
    
    return Math.max(10, positionSize); // Minimum $10 position
  }
  
  /**
   * Calculate dynamic stop loss based on ATR and regime
   */
  calculateDynamicStopLoss(signal) {
    const { entryPrice, direction, regime } = signal;
    
    // Base stop distance using ATR
    let stopDistance = this.riskCache.currentATR * this.config.atrMultiplier;
    
    // Adjust for regime
    switch (regime) {
      case 'volatile':
        stopDistance *= 1.5; // Wider stops in volatile markets
        break;
      case 'trending_up':
      case 'trending_down':
        stopDistance *= 0.8; // Tighter stops in trends
        break;
      case 'ranging':
        stopDistance *= 1.2; // Slightly wider for whipsaws
        break;
      case 'breakout':
        stopDistance *= 0.6; // Tight stops on breakouts
        break;
    }
    
    // Ensure within limits
    stopDistance = Math.max(this.config.minStopDistance, stopDistance);
    stopDistance = Math.min(this.config.maxStopDistance, stopDistance);
    
    // Calculate stop price
    const stopPrice = direction === 'BUY' 
      ? entryPrice * (1 - stopDistance)
      : entryPrice * (1 + stopDistance);
    
    return {
      stopPrice,
      stopDistance,
      reasoning: `ATR-based stop with ${regime} adjustment`
    };
  }
  
  /**
   * Kelly Criterion calculation
   */
  calculateKellyPercentage() {
    if (this.accountState.avgWin === 0 || this.accountState.avgLoss === 0) {
      return this.config.baseRiskPerTrade;
    }
    
    const winRate = this.accountState.winRate;
    const winLossRatio = Math.abs(this.accountState.avgWin / this.accountState.avgLoss);
    
    // Kelly formula: f = p - q/b
    const kelly = winRate - ((1 - winRate) / winLossRatio);
    
    // Use fractional Kelly for safety
    const fractionalKelly = kelly * this.config.kellyFraction;
    
    // Ensure positive and reasonable
    return Math.max(0.005, Math.min(0.25, fractionalKelly));
  }
  
  /**
   * Get time of day multiplier for adaptive learning
   */
  getTimeOfDayMultiplier(hour) {
    // Learn from time of day performance
    if (this.accountState.timeOfDayPerformance.has(hour)) {
      const performance = this.accountState.timeOfDayPerformance.get(hour);
      return 0.8 + (performance * 0.4); // 0.8x to 1.2x
    }
    
    // Default time-based adjustments (market hours)
    if (hour >= 9 && hour <= 16) return 1.1; // Market hours boost
    if (hour >= 17 && hour <= 20) return 0.9; // After hours reduction
    return 1.0; // Normal
  }
  
  /**
   * Open a new position with risk management
   */
  async openPosition(signal) {
    // Calculate position size
    const positionSize = this.calculatePositionSize(signal);
    
    if (positionSize === 0) {
      return null;
    }
    
    // Calculate stop loss
    const stopLossData = this.calculateDynamicStopLoss(signal);
    
    // Create position object
    const position = {
      id: `POS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      positionSize,
      stopLoss: stopLossData.stopPrice,
      regime: signal.regime,
      patternType: signal.patternType,
      openTime: Date.now(),
      maxRisk: positionSize * stopLossData.stopDistance,
      confidence: signal.confidence
    };
    
    // Add to open positions
    this.accountState.openPositions.set(position.id, position);
    this.accountState.totalExposure += positionSize;
    
    // Emit position opened event
    this.emit('positionOpened', position);
    
    console.log(`✅ Position opened: ${position.symbol} ${position.direction} $${positionSize.toFixed(2)}`);
    
    return position;
  }
  
  /**
   * Close position and update metrics
   */
  closePosition(positionId, exitPrice, reason) {
    const position = this.accountState.openPositions.get(positionId);
    if (!position) return;
    
    // Calculate final P&L
    const priceChange = position.direction === 'BUY' 
      ? (exitPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - exitPrice) / position.entryPrice;
    
    const realizedPnL = position.positionSize * priceChange;
    const isWin = realizedPnL > 0;
    
    // Update account
    this.accountState.balance += realizedPnL;
    this.accountState.equity = this.accountState.balance;
    this.accountState.dailyPnL += realizedPnL;
    
    // Update metrics
    this.accountState.totalTrades++;
    
    if (isWin) {
      this.accountState.avgWin = (this.accountState.avgWin + realizedPnL) / 2;
      this.accountState.consecutiveLosses = 0;
    } else {
      this.accountState.avgLoss = (this.accountState.avgLoss + Math.abs(realizedPnL)) / 2;
      this.accountState.consecutiveLosses++;
    }
    
    // Update win rate
    const wins = this.accountState.winRate * (this.accountState.totalTrades - 1) + (isWin ? 1 : 0);
    this.accountState.winRate = wins / this.accountState.totalTrades;
    
    // Learn from regime performance
    this.updateRegimePerformance(position.regime, isWin);
    
    // Learn from pattern performance
    if (position.patternType) {
      this.updatePatternPerformance(position.patternType, isWin);
    }
    
    // Learn from time of day
    this.updateTimePerformance(new Date(position.openTime).getHours(), isWin);
    
    // Check drawdown and circuit breakers
    this.updateDrawdown();
    this.checkCircuitBreakers();
    
    // Remove position
    this.accountState.openPositions.delete(positionId);
    this.accountState.totalExposure -= position.positionSize;
    
    // Emit event
    this.emit('positionClosed', {
      position,
      exitPrice,
      realizedPnL,
      reason
    });
    
    console.log(`💰 Position closed: ${position.symbol} | P&L: ${realizedPnL > 0 ? '+' : ''}$${realizedPnL.toFixed(2)} | ${reason}`);
    
    return { position, realizedPnL, isWin };
  }
  
  /**
   * Update regime performance learning
   */
  updateRegimePerformance(regime, isWin) {
    if (!this.accountState.regimePerformance.has(regime)) {
      this.accountState.regimePerformance.set(regime, { wins: 0, total: 0 });
    }
    
    const perf = this.accountState.regimePerformance.get(regime);
    perf.total++;
    if (isWin) perf.wins++;
    
    console.log(`📊 Regime ${regime} performance: ${((perf.wins / perf.total) * 100).toFixed(1)}% (${perf.wins}/${perf.total})`);
  }
  
  /**
   * Update pattern performance learning
   */
  updatePatternPerformance(patternType, isWin) {
    if (!this.accountState.patternSuccess.has(patternType)) {
      this.accountState.patternSuccess.set(patternType, 0.5);
    }
    
    const currentRate = this.accountState.patternSuccess.get(patternType);
    const newRate = (currentRate * 0.9) + (isWin ? 0.1 : 0); // Exponential moving average
    this.accountState.patternSuccess.set(patternType, newRate);
  }
  
  /**
   * Update time of day performance learning
   */
  updateTimePerformance(hour, isWin) {
    if (!this.accountState.timeOfDayPerformance.has(hour)) {
      this.accountState.timeOfDayPerformance.set(hour, 0.5);
    }
    
    const currentPerf = this.accountState.timeOfDayPerformance.get(hour);
    const newPerf = (currentPerf * 0.95) + (isWin ? 0.05 : 0); // Slow learning
    this.accountState.timeOfDayPerformance.set(hour, newPerf);
  }
  
  /**
   * Update drawdown metrics
   */
  updateDrawdown() {
    if (this.accountState.balance > this.accountState.peakBalance) {
      this.accountState.peakBalance = this.accountState.balance;
      this.accountState.drawdown = 0;
    } else {
      this.accountState.drawdown = 
        (this.accountState.peakBalance - this.accountState.balance) / this.accountState.peakBalance;
    }
    
    // Check max drawdown circuit breaker
    if (this.accountState.drawdown > this.config.maxDrawdown) {
      console.error('🚨 MAX DRAWDOWN REACHED! REDUCING RISK!');
      this.accountState.tradingEnabled = false;
      this.accountState.cooldownUntil = Date.now() + (this.config.cooldownPeriod * 2); // Double cooldown
      this.emit('maxDrawdownReached', this.accountState.drawdown);
      
      // Re-enable with reduced risk after cooldown
      setTimeout(() => {
        this.accountState.tradingEnabled = true;
        this.config.baseRiskPerTrade *= 0.5; // Half the risk
        console.log('✅ Trading re-enabled with reduced risk');
      }, this.config.cooldownPeriod * 2);
    }
  }
  
  /**
   * Check and enforce circuit breakers
   */
  checkCircuitBreakers() {
    // Daily loss limit
    if (this.accountState.dailyPnL < -this.config.maxDailyLoss * this.accountState.dailyStartBalance) {
      console.warn('⚠️ Daily loss limit triggered');
      this.accountState.dailyLossTriggered = true;
      this.accountState.cooldownUntil = Date.now() + this.config.cooldownPeriod;
    }
    
    // Consecutive losses
    if (this.accountState.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      console.warn('⚠️ Consecutive loss limit triggered');
      this.accountState.tradingEnabled = false;
      this.accountState.cooldownUntil = Date.now() + this.config.cooldownPeriod;
      
      setTimeout(() => {
        this.accountState.tradingEnabled = true;
        console.log('✅ Trading re-enabled after cooldown');
      }, this.config.cooldownPeriod);
    }
  }
  
  /**
   * Setup daily reset timer
   */
  setupDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDaily();
      // Set up recurring daily reset
      setInterval(() => this.resetDaily(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }
  
  /**
   * Reset daily metrics
   */
  resetDaily() {
    this.accountState.dailyStartBalance = this.accountState.balance;
    this.accountState.dailyPnL = 0;
    this.accountState.dailyLossTriggered = false;
    console.log('📅 Daily metrics reset');
  }
  
  /**
   * Update ATR for stop loss calculations
   */
  updateATR(atr) {
    this.riskCache.currentATR = atr || 0.02; // Default 2%
    this.riskCache.lastATRUpdate = Date.now();
  }
  
  /**
   * Get current risk metrics
   */
  getRiskMetrics() {
    return {
      accountBalance: this.accountState.balance,
      equity: this.accountState.equity,
      drawdown: this.accountState.drawdown,
      drawdownPercent: (this.accountState.drawdown * 100).toFixed(1) + '%',
      openPositions: this.accountState.openPositions.size,
      totalExposure: this.accountState.totalExposure,
      exposurePercent: ((this.accountState.totalExposure / this.accountState.equity) * 100).toFixed(1) + '%',
      dailyPnL: this.accountState.dailyPnL,
      winRate: (this.accountState.winRate * 100).toFixed(1) + '%',
      avgWinLoss: this.accountState.avgLoss !== 0 ? 
        (this.accountState.avgWin / Math.abs(this.accountState.avgLoss)).toFixed(2) : 'N/A',
      tradingEnabled: this.accountState.tradingEnabled,
      consecutiveLosses: this.accountState.consecutiveLosses,
      totalTrades: this.accountState.totalTrades
    };
  }
  
  /**
   * Force enable trading (emergency override)
   */
  forceEnableTrading() {
    this.accountState.tradingEnabled = true;
    this.accountState.dailyLossTriggered = false;
    this.accountState.consecutiveLosses = 0;
    this.accountState.cooldownUntil = 0;
    console.log('🚨 TRADING FORCE ENABLED - ALL CIRCUIT BREAKERS RESET');
  }
}

module.exports = AdaptiveRiskManagementSystem;