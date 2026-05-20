// EnsembleVotingSystem.js - REAL ENSEMBLE VOTING WITH REAL DATA
// NO FAKE DATA, NO RANDOM NUMBERS, JUST REAL MARKET ANALYSIS

const EventEmitter = require('events');

class EnsembleVotingSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      rsiPeriod: config.rsiPeriod || 14,
      macdFast: config.macdFast || 12,
      macdSlow: config.macdSlow || 26,
      macdSignal: config.macdSignal || 9,
      bollingerPeriod: config.bollingerPeriod || 20,
      minDataPoints: config.minDataPoints || 30,
      ...config
    };
    
    // Real market data storage
    this.priceHistory = [];
    this.volumeHistory = [];
    this.lastVotes = null;
    this.currentPrice = null;
    
    console.log('🧠 Ensemble Voting System initialized - REAL DATA ONLY');
  }
  
  /**
   * Update market data from Polygon feed
   */
  updateMarketData(priceData) {
    this.currentPrice = priceData.price;
    this.priceHistory.push(priceData.price);
    this.volumeHistory.push(priceData.volume || 1);
    
    // Keep last 200 data points
    if (this.priceHistory.length > 200) {
      this.priceHistory.shift();
      this.volumeHistory.shift();
    }
  }
  
  /**
   * Generate ensemble votes based on REAL market analysis
   */
  generateVotes() {
    if (this.priceHistory.length < this.config.minDataPoints) {
      return null; // Not enough data yet
    }
    
    // Calculate REAL indicators
    const indicators = this.calculateIndicators();
    
    // Generate votes for each brain based on REAL data
    const votes = {
      pattern: this.getPatternVote(indicators),
      momentum: this.getMomentumVote(indicators),
      sentiment: this.getSentimentVote(indicators),
      risk: this.getRiskVote(indicators),
      quantum: this.getQuantumVote(indicators)
    };
    
    this.lastVotes = votes;
    return votes;
  }
  
  /**
   * Pattern Brain - Analyzes price patterns
   */
  getPatternVote(indicators) {
    const { trend, volatility, pricePosition } = indicators;
    
    let vote = 'HOLD';
    let confidence = 0;
    
    // Strong uptrend with low volatility = bullish pattern
    if (trend > 0.02 && volatility < 0.03) {
      vote = 'LONG';
      confidence = Math.min(95, 60 + (trend * 1000));
    }
    // Strong downtrend with low volatility = bearish pattern
    else if (trend < -0.02 && volatility < 0.03) {
      vote = 'SHORT';
      confidence = Math.min(95, 60 + (Math.abs(trend) * 1000));
    }
    // High volatility = hedge
    else if (volatility > 0.05) {
      vote = 'HEDGE';
      confidence = Math.min(95, 40 + (volatility * 500));
    }
    // Sideways market
    else {
      vote = 'HOLD';
      confidence = 50 - (volatility * 100);
    }
    
    return { vote, confidence: Math.max(10, Math.round(confidence)) };
  }
  
  /**
   * Momentum Brain - RSI and MACD based
   */
  getMomentumVote(indicators) {
    const { rsi, macd } = indicators;
    
    let vote = 'HOLD';
    let confidence = 0;
    
    // Strong bullish momentum
    if (rsi < 30 && macd.histogram > 0) {
      vote = 'LONG';
      confidence = 85;
    }
    // Bullish momentum
    else if (rsi < 40 && macd.histogram > 0) {
      vote = 'LONG';
      confidence = 70;
    }
    // Strong bearish momentum
    else if (rsi > 70 && macd.histogram < 0) {
      vote = 'SHORT';
      confidence = 85;
    }
    // Bearish momentum
    else if (rsi > 60 && macd.histogram < 0) {
      vote = 'SHORT';
      confidence = 70;
    }
    // MACD crossover
    else if (macd.crossover) {
      vote = macd.histogram > 0 ? 'LONG' : 'SHORT';
      confidence = 75;
    }
    // Neutral momentum
    else {
      vote = 'HOLD';
      confidence = 50 + Math.abs(50 - rsi) / 2;
    }
    
    return { vote, confidence: Math.round(confidence) };
  }
  
  /**
   * Sentiment Brain - Volume and price action based
   */
  getSentimentVote(indicators) {
    const { volumeRatio, priceChange, volumeTrend } = indicators;
    
    let vote = 'HOLD';
    let confidence = 0;
    
    // High volume with positive price = bullish sentiment
    if (volumeRatio > 1.5 && priceChange > 0.001) {
      vote = 'LONG';
      confidence = Math.min(90, 50 + (volumeRatio * 20));
    }
    // High volume with negative price = bearish sentiment
    else if (volumeRatio > 1.5 && priceChange < -0.001) {
      vote = 'SHORT';
      confidence = Math.min(90, 50 + (volumeRatio * 20));
    }
    // Increasing volume trend = follow the direction
    else if (volumeTrend > 0.2) {
      vote = priceChange > 0 ? 'LONG' : 'SHORT';
      confidence = Math.min(80, 40 + (volumeTrend * 100));
    }
    // Low volume = uncertain sentiment
    else if (volumeRatio < 0.5) {
      vote = 'HOLD';
      confidence = 30;
    }
    // Normal volume
    else {
      vote = 'HOLD';
      confidence = 50;
    }
    
    return { vote, confidence: Math.round(confidence) };
  }
  
  /**
   * Risk Brain - Conservative analysis
   */
  getRiskVote(indicators) {
    const { volatility, drawdown, bollinger } = indicators;
    
    let vote = 'HOLD';
    let confidence = 0;
    
    // High volatility = high risk = hedge
    if (volatility > 0.04) {
      vote = 'HEDGE';
      confidence = Math.min(90, 40 + (volatility * 1000));
    }
    // Price outside Bollinger bands = risky
    else if (bollinger.position > 1 || bollinger.position < 0) {
      vote = 'HEDGE';
      confidence = 70;
    }
    // Significant drawdown = defensive
    else if (drawdown > 0.05) {
      vote = 'HOLD';
      confidence = Math.min(80, 40 + (drawdown * 800));
    }
    // Low risk environment
    else if (volatility < 0.02 && Math.abs(bollinger.position - 0.5) < 0.3) {
      vote = indicators.trend > 0 ? 'LONG' : 'SHORT';
      confidence = 60;
    }
    // Normal risk
    else {
      vote = 'HOLD';
      confidence = 50;
    }
    
    return { vote, confidence: Math.round(confidence) };
  }
  
  /**
   * Quantum Brain - Combined analysis
   */
  getQuantumVote(indicators) {
    const { rsi, macd, trend, volatility, bollinger } = indicators;
    
    let score = 0;
    
    // Bullish signals
    if (rsi < 40) score += 2;
    if (macd.histogram > 0) score += 2;
    if (trend > 0.01) score += 2;
    if (bollinger.position < 0.3) score += 1;
    
    // Bearish signals
    if (rsi > 60) score -= 2;
    if (macd.histogram < 0) score -= 2;
    if (trend < -0.01) score -= 2;
    if (bollinger.position > 0.7) score -= 1;
    
    // Volatility adjustment
    if (volatility > 0.04) score = score * 0.5;
    
    let vote = 'HOLD';
    let confidence = 50;
    
    if (score >= 4) {
      vote = 'LONG';
      confidence = Math.min(90, 60 + (score * 5));
    } else if (score <= -4) {
      vote = 'SHORT';
      confidence = Math.min(90, 60 + (Math.abs(score) * 5));
    } else if (Math.abs(score) <= 1) {
      vote = 'HOLD';
      confidence = 60 - (Math.abs(score) * 10);
    } else {
      vote = score > 0 ? 'LONG' : 'SHORT';
      confidence = 50 + (Math.abs(score) * 5);
    }
    
    return { vote, confidence: Math.round(confidence) };
  }
  
  /**
   * Calculate all indicators from REAL data
   */
  calculateIndicators() {
    const prices = this.priceHistory;
    const volumes = this.volumeHistory;
    
    // RSI
    const rsi = this.calculateRSI(prices, this.config.rsiPeriod);
    
    // MACD
    const macd = this.calculateMACD(prices);
    
    // Trend (linear regression slope)
    const trend = this.calculateTrend(prices.slice(-20));
    
    // Volatility (standard deviation)
    const volatility = this.calculateVolatility(prices.slice(-20));
    
    // Bollinger Bands
    const bollinger = this.calculateBollinger(prices, this.config.bollingerPeriod);
    
    // Volume analysis
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / avgVolume;
    const volumeTrend = this.calculateTrend(volumes.slice(-10));
    
    // Price change
    const priceChange = (prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2];
    
    // Drawdown
    const recentHigh = Math.max(...prices.slice(-50));
    const drawdown = (recentHigh - this.currentPrice) / recentHigh;
    
    // Price position in Bollinger Bands (0 = lower, 1 = upper)
    const pricePosition = (this.currentPrice - bollinger.lower) / (bollinger.upper - bollinger.lower);
    
    return {
      rsi,
      macd,
      trend,
      volatility,
      bollinger: { ...bollinger, position: pricePosition },
      volumeRatio,
      volumeTrend,
      priceChange,
      drawdown,
      pricePosition
    };
  }
  
  // Technical indicator calculations
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / (avgLoss || 0.0001);
    return 100 - (100 / (1 + rs));
  }
  
  calculateMACD(prices) {
    if (prices.length < 26) return { macdLine: 0, signalLine: 0, histogram: 0, crossover: false };
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const signalLine = macdLine * 0.2; // Simplified signal
    const histogram = macdLine - signalLine;
    
    // Check for crossover
    const prevMACD = this.lastMACD || 0;
    const crossover = (prevMACD <= 0 && histogram > 0) || (prevMACD >= 0 && histogram < 0);
    this.lastMACD = histogram;
    
    return { macdLine, signalLine, histogram, crossover };
  }
  
  calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[prices.length - period];
    
    for (let i = prices.length - period + 1; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  calculateBollinger(prices, period = 20) {
    if (prices.length < period) {
      return { 
        upper: this.currentPrice * 1.02, 
        lower: this.currentPrice * 0.98, 
        middle: this.currentPrice 
      };
    }
    
    const recent = prices.slice(-period);
    const sma = recent.reduce((a, b) => a + b) / period;
    const variance = recent.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * 2),
      lower: sma - (stdDev * 2),
      middle: sma
    };
  }
  
  calculateTrend(data) {
    if (data.length < 2) return 0;
    
    // Simple linear regression slope
    const n = data.length;
    const xSum = (n * (n - 1)) / 2; // Sum of indices
    const xSqSum = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squared indices
    
    let ySum = 0;
    let xySum = 0;
    
    for (let i = 0; i < n; i++) {
      ySum += data[i];
      xySum += i * data[i];
    }
    
    const slope = (n * xySum - xSum * ySum) / (n * xSqSum - xSum * xSum);
    return slope / (ySum / n); // Normalized by average
  }
  
  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
  
  /**
   * Get ensemble consensus - what most brains agree on
   */
  getConsensus() {
    if (!this.lastVotes) return null;
    
    const voteCount = { LONG: 0, SHORT: 0, HEDGE: 0, HOLD: 0 };
    let totalConfidence = 0;
    let brainCount = 0;
    
    Object.values(this.lastVotes).forEach(brain => {
      voteCount[brain.vote]++;
      totalConfidence += brain.confidence;
      brainCount++;
    });
    
    // Find the majority vote
    let consensus = 'HOLD';
    let maxVotes = 0;
    
    for (const [vote, count] of Object.entries(voteCount)) {
      if (count > maxVotes) {
        maxVotes = count;
        consensus = vote;
      }
    }
    
    return {
      decision: consensus,
      confidence: Math.round(totalConfidence / brainCount),
      agreement: maxVotes / brainCount
    };
  }
}

module.exports = EnsembleVotingSystem;