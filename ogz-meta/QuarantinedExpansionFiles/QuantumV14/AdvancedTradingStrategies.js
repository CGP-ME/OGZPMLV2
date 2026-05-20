/**
 * ADVANCED TRADING STRATEGIES
 * Combines multiple indicators with candlestick patterns for precision entries/exits
 */

const ComprehensivePatternDetector = require('./ComprehensivePatternDetector');

class AdvancedTradingStrategies {
  constructor() {
    this.patternDetector = new ComprehensivePatternDetector();
    
    // Add caching from OptimizedIndicators
    this.cache = new Map();
    this.cacheTimeout = 60000; // 60 seconds cache
    
    // 🚀 SCALPER MODE from OptimizedIndicators
    this.scalperMode = false;
    this.scalperCache = new Map();
    this.scalperCacheTimeout = 5000; // 5 seconds for scalpers (fast updates)
    
    // Cache cleanup interval
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (value.timestamp && now - value.timestamp > this.cacheTimeout) {
          this.cache.delete(key);
        }
      }
    }, 10000);
    
    // Strategy thresholds
    this.rsiOversold = 30;
    this.rsiOverbought = 70;
    this.stochOversold = 20;
    this.stochOverbought = 80;
    
    // Moving average periods
    this.maPeriods = {
      fast: 9,
      medium: 21,
      slow: 50
    };
    
    // Trend line sensitivity
    this.trendLineSensitivity = 0.02; // 2% deviation allowed
    
    console.log('🎯 Advanced Trading Strategies Initialized');
  }

  /**
   * 🚀 SCALPER MODE ACTIVATION (from OptimizedIndicators)
   * HOOKUP: Call this when user wants fast 1-minute trading
   * TEST: Will log "Scalper mode activated" when turned on
   */
  activateScalperMode() {
    this.scalperMode = true;
    // Adjust strategy thresholds for scalping
    this.rsiOversold = 35;  // Less extreme for quick trades
    this.rsiOverbought = 65; // Less extreme for quick trades
    this.trendLineSensitivity = 0.01; // Tighter for scalping
    
    console.log('🚀 SCALPER MODE ACTIVATED!');
    console.log('   - 5 second cache timeout');
    console.log('   - Tighter RSI thresholds (35/65)');
    console.log('   - 1% trend sensitivity');
    console.log('   - Optimized for 1-minute candles');
    
    return true; // So we can verify it worked
  }
  
  deactivateScalperMode() {
    this.scalperMode = false;
    // Reset to normal thresholds
    this.rsiOversold = 30;
    this.rsiOverbought = 70;
    this.trendLineSensitivity = 0.02;
    
    // Clear scalper cache
    this.scalperCache.clear();
    
    console.log('⏹️ Scalper mode deactivated');
    return false;
  }

  /**
   * Master strategy executor - combines all strategies
   */
  async executeStrategies(marketData, indicators, candles) {
    const strategies = [];
    
    // DEBUG: Log indicators to find the SELL-only issue
    console.log('📊 STRATEGY DEBUG:', {
      rsi: indicators.rsi,
      macd: indicators.macd,
      stochK: indicators.stochK,
      stochD: indicators.stochD,
      price: marketData.price,
      scalperMode: this.scalperMode,
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought
    });
    
    // 🚀 SCALPER MODE CHECK - Use faster calculations if active
    if (this.scalperMode) {
      console.log('⚡ Using SCALPER MODE optimizations');
      // Use only last 20 candles for calculations (faster)
      candles = candles.slice(-20);
    }
    
    // 🔍 HOOKUP POINT: Calculate Fibonacci levels for all strategies to use
    // This will console.log the levels so we can verify it's working
    const fibLevels = this.calculateFibonacciLevels(candles);
    
    // 🎯 HOOKUP: Use Fibonacci for stop loss and take profit
    // If price is near 38.2% fib and we get a buy signal, it's stronger
    const currentPrice = marketData.price || candles[candles.length - 1].close;
    let fibBoost = 1.0;
    if (fibLevels) {
      // Check if we're near a key Fibonacci level (within 0.5%)
      const near382 = Math.abs(currentPrice - fibLevels[0.382]) / currentPrice < 0.005;
      const near618 = Math.abs(currentPrice - fibLevels[0.618]) / currentPrice < 0.005;
      
      if (near382 || near618) {
        fibBoost = 1.2; // 20% confidence boost at key fib levels
        console.log(`🎯 FIBONACCI BOOST: Price near ${near382 ? '38.2%' : '61.8%'} level!`);
      }
    }
    
    // 1. RSI + Bullish Reversal for Long Entry
    const rsiBullish = this.rsiWithBullishReversal(indicators, candles);
    if (rsiBullish.signal) {
      rsiBullish.confidence *= fibBoost; // Apply fib boost
      strategies.push(rsiBullish);
    }
    
    // 2. RSI + Bearish Pattern for Short Entry  
    const rsiBearish = this.rsiWithBearishPattern(indicators, candles);
    if (rsiBearish.signal) strategies.push(rsiBearish);
    
    // 3. Stochastic + Bullish Reversal
    const stochBullish = this.stochasticWithBullishReversal(indicators, candles);
    if (stochBullish.signal) strategies.push(stochBullish);
    
    // 4. Stochastic + Bearish Pattern for Shorting
    const stochBearish = this.stochasticWithBearishPattern(indicators, candles);
    if (stochBearish.signal) strategies.push(stochBearish);
    
    // 5. Trend Lines + Bullish Candlestick
    const trendBullish = this.trendLineWithBullishCandle(marketData, candles);
    if (trendBullish.signal) strategies.push(trendBullish);
    
    // 6. Trend Lines + Bearish Pattern
    const trendBearish = this.trendLineWithBearishPattern(marketData, candles);
    if (trendBearish.signal) strategies.push(trendBearish);
    
    // 7. Moving Averages + Bullish Trending Patterns
    const maBullish = this.movingAveragesWithBullishPatterns(indicators, candles);
    if (maBullish.signal) strategies.push(maBullish);
    
    // 8. Moving Averages + Bearish Patterns for Shorts
    const maBearish = this.movingAveragesWithBearishPatterns(indicators, candles);
    if (maBearish.signal) strategies.push(maBearish);
    
    // 9. Combined Moving Averages Strategy
    const maCombined = this.combinedMovingAverages(indicators, marketData);
    if (maCombined.signal) strategies.push(maCombined);
    
    // 10. Bollinger Bands + Pattern Confirmation
    const bbStrategy = this.bollingerBandsWithPatterns(indicators, candles);
    if (bbStrategy.signal) strategies.push(bbStrategy);
    
    // Aggregate and score strategies
    return this.aggregateStrategies(strategies);
  }

  /**
   * 1. RSI + Bullish Reversal Candlestick Pattern
   * Uses RSI to pick long entry and exit points
   */
  rsiWithBullishReversal(indicators, candles) {
    const rsi = indicators.rsi || 50;
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.65 
    });
    
    // Find bullish reversal patterns
    const bullishReversals = patterns.filter(p => 
      p.direction === 'bullish' && p.type === 'reversal'
    );
    
    // RSI oversold + bullish reversal pattern = strong buy signal
    if (rsi < this.rsiOversold && bullishReversals.length > 0) {
      const strongestPattern = bullishReversals[0];
      
      return {
        signal: 'BUY',
        strategy: 'RSI_BULLISH_REVERSAL',
        confidence: Math.min(0.9, strongestPattern.reliability + (30 - rsi) / 100),
        entry: candles[candles.length - 1].close,
        stopLoss: candles[candles.length - 1].low * 0.98,
        takeProfit: candles[candles.length - 1].close * 1.05,
        pattern: strongestPattern.pattern,
        rsi: rsi,
        reason: `RSI oversold (${rsi.toFixed(1)}) + ${strongestPattern.pattern}`
      };
    }
    
    // Exit signal when RSI overbought
    if (rsi > this.rsiOverbought) {
      return {
        signal: 'SELL',
        strategy: 'RSI_EXIT',
        confidence: 0.7,
        reason: `RSI overbought (${rsi.toFixed(1)}) - exit long position`
      };
    }
    
    return { signal: null };
  }

  /**
   * 2. RSI + Bearish Candlestick for Short Entry
   */
  rsiWithBearishPattern(indicators, candles) {
    const rsi = indicators.rsi || 50;
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.65 
    });
    
    // Find bearish patterns
    const bearishPatterns = patterns.filter(p => 
      p.direction === 'bearish' && p.type === 'reversal'
    );
    
    // RSI overbought + bearish pattern = strong sell/short signal
    if (rsi > this.rsiOverbought && bearishPatterns.length > 0) {
      const strongestPattern = bearishPatterns[0];
      
      return {
        signal: 'SHORT',
        strategy: 'RSI_BEARISH_PATTERN',
        confidence: Math.min(0.9, strongestPattern.reliability + (rsi - 70) / 100),
        entry: candles[candles.length - 1].close,
        stopLoss: candles[candles.length - 1].high * 1.02,
        takeProfit: candles[candles.length - 1].close * 0.95,
        pattern: strongestPattern.pattern,
        rsi: rsi,
        reason: `RSI overbought (${rsi.toFixed(1)}) + ${strongestPattern.pattern}`
      };
    }
    
    // Cover short when RSI oversold
    if (rsi < this.rsiOversold) {
      return {
        signal: 'COVER',
        strategy: 'RSI_COVER',
        confidence: 0.7,
        reason: `RSI oversold (${rsi.toFixed(1)}) - cover short position`
      };
    }
    
    return { signal: null };
  }

  /**
   * 3. Stochastic + Bullish Reversal Pattern
   */
  stochasticWithBullishReversal(indicators, candles) {
    const stochK = indicators.stochK || 50;
    const stochD = indicators.stochD || 50;
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    const bullishReversals = patterns.filter(p => 
      p.direction === 'bullish' && p.type === 'reversal'
    );
    
    // Stochastic oversold + bullish reversal + K crosses above D
    if (stochK < this.stochOversold && stochD < this.stochOversold && 
        stochK > stochD && bullishReversals.length > 0) {
      
      const strongestPattern = bullishReversals[0];
      
      return {
        signal: 'BUY',
        strategy: 'STOCH_BULLISH_REVERSAL',
        confidence: Math.min(0.85, strongestPattern.reliability + (20 - stochK) / 100),
        entry: candles[candles.length - 1].close,
        stopLoss: candles[candles.length - 1].low * 0.97,
        takeProfit: candles[candles.length - 1].close * 1.06,
        pattern: strongestPattern.pattern,
        stochK: stochK,
        stochD: stochD,
        reason: `Stoch oversold (K:${stochK.toFixed(1)}, D:${stochD.toFixed(1)}) + ${strongestPattern.pattern}`
      };
    }
    
    // Exit when stochastic overbought
    if (stochK > this.stochOverbought && stochD > this.stochOverbought && stochK < stochD) {
      return {
        signal: 'SELL',
        strategy: 'STOCH_EXIT',
        confidence: 0.75,
        reason: `Stoch overbought (K:${stochK.toFixed(1)}, D:${stochD.toFixed(1)}) - exit long`
      };
    }
    
    return { signal: null };
  }

  /**
   * 4. Stochastic + Bearish Pattern for Shorting
   */
  stochasticWithBearishPattern(indicators, candles) {
    const stochK = indicators.stochK || 50;
    const stochD = indicators.stochD || 50;
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    const bearishPatterns = patterns.filter(p => 
      p.direction === 'bearish' && p.type === 'reversal'
    );
    
    // Stochastic overbought + bearish pattern + K crosses below D
    if (stochK > this.stochOverbought && stochD > this.stochOverbought && 
        stochK < stochD && bearishPatterns.length > 0) {
      
      const strongestPattern = bearishPatterns[0];
      
      return {
        signal: 'SHORT',
        strategy: 'STOCH_BEARISH_PATTERN',
        confidence: Math.min(0.85, strongestPattern.reliability + (stochK - 80) / 100),
        entry: candles[candles.length - 1].close,
        stopLoss: candles[candles.length - 1].high * 1.03,
        takeProfit: candles[candles.length - 1].close * 0.94,
        pattern: strongestPattern.pattern,
        stochK: stochK,
        stochD: stochD,
        reason: `Stoch overbought (K:${stochK.toFixed(1)}, D:${stochD.toFixed(1)}) + ${strongestPattern.pattern}`
      };
    }
    
    // Cover when stochastic oversold
    if (stochK < this.stochOversold && stochD < this.stochOversold && stochK > stochD) {
      return {
        signal: 'COVER',
        strategy: 'STOCH_COVER',
        confidence: 0.75,
        reason: `Stoch oversold (K:${stochK.toFixed(1)}, D:${stochD.toFixed(1)}) - cover short`
      };
    }
    
    return { signal: null };
  }

  /**
   * 5. Trend Lines + Bullish Candlestick Patterns
   */
  trendLineWithBullishCandle(marketData, candles) {
    const trendLine = this.calculateTrendLine(candles);
    const currentPrice = candles[candles.length - 1].close;
    const supportResistance = this.findSupportResistanceLevels(candles, currentPrice);
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    const bullishPatterns = patterns.filter(p => p.direction === 'bullish');
    
    // Check if we're near a support level
    const nearSupport = supportResistance.find(level => 
      level.type === 'support' && 
      Math.abs(currentPrice - level.price) / currentPrice < 0.01
    );
    
    // Price bouncing off uptrend line OR support level + bullish pattern
    if ((trendLine.slope > 0 && 
        Math.abs(currentPrice - trendLine.support) / currentPrice < this.trendLineSensitivity ||
        nearSupport) &&
        bullishPatterns.length > 0) {
      
      const strongestPattern = bullishPatterns[0];
      
      return {
        signal: 'BUY',
        strategy: 'TRENDLINE_BULLISH',
        confidence: Math.min(0.8, strongestPattern.reliability),
        entry: currentPrice,
        stopLoss: trendLine.support * 0.98,
        takeProfit: trendLine.resistance,
        pattern: strongestPattern.pattern,
        trendSlope: trendLine.slope,
        reason: `Uptrend support bounce + ${strongestPattern.pattern}`
      };
    }
    
    return { signal: null };
  }

  /**
   * 6. Trend Lines + Bearish Pattern for Short Entries
   */
  trendLineWithBearishPattern(marketData, candles) {
    const trendLine = this.calculateTrendLine(candles);
    const currentPrice = candles[candles.length - 1].close;
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    const bearishPatterns = patterns.filter(p => p.direction === 'bearish');
    
    // Price hitting downtrend resistance + bearish pattern
    if (trendLine.slope < 0 && 
        Math.abs(currentPrice - trendLine.resistance) / currentPrice < this.trendLineSensitivity &&
        bearishPatterns.length > 0) {
      
      const strongestPattern = bearishPatterns[0];
      
      return {
        signal: 'SHORT',
        strategy: 'TRENDLINE_BEARISH',
        confidence: Math.min(0.8, strongestPattern.reliability),
        entry: currentPrice,
        stopLoss: trendLine.resistance * 1.02,
        takeProfit: trendLine.support,
        pattern: strongestPattern.pattern,
        trendSlope: trendLine.slope,
        reason: `Downtrend resistance rejection + ${strongestPattern.pattern}`
      };
    }
    
    return { signal: null };
  }

  /**
   * 7. Moving Averages + Bullish Trending Patterns
   */
  movingAveragesWithBullishPatterns(indicators, candles) {
    const ma9 = indicators.ma9 || 0;
    const ma21 = indicators.ma21 || 0;
    const ma50 = indicators.ma50 || 0;
    const currentPrice = candles[candles.length - 1].close;
    
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    const bullishTrending = patterns.filter(p => 
      p.direction === 'bullish' && (p.type === 'continuation' || p.type === 'reversal')
    );
    
    // Golden cross setup: MA9 > MA21 > MA50 + bullish pattern
    if (ma9 > ma21 && ma21 > ma50 && currentPrice > ma9 && bullishTrending.length > 0) {
      const strongestPattern = bullishTrending[0];
      
      return {
        signal: 'BUY',
        strategy: 'MA_BULLISH_TREND',
        confidence: Math.min(0.85, strongestPattern.reliability + 0.1),
        entry: currentPrice,
        stopLoss: ma21, // Use MA21 as dynamic stop
        takeProfit: currentPrice * 1.08,
        pattern: strongestPattern.pattern,
        mas: { ma9, ma21, ma50 },
        reason: `Golden cross alignment + ${strongestPattern.pattern}`
      };
    }
    
    // Price bouncing off MA support + bullish pattern
    if (Math.abs(currentPrice - ma21) / currentPrice < 0.01 && 
        currentPrice > ma21 && ma9 > ma50 && bullishTrending.length > 0) {
      
      const strongestPattern = bullishTrending[0];
      
      return {
        signal: 'BUY',
        strategy: 'MA_SUPPORT_BOUNCE',
        confidence: Math.min(0.75, strongestPattern.reliability),
        entry: currentPrice,
        stopLoss: ma21 * 0.98,
        takeProfit: currentPrice * 1.05,
        pattern: strongestPattern.pattern,
        reason: `MA21 support bounce + ${strongestPattern.pattern}`
      };
    }
    
    return { signal: null };
  }

  /**
   * 8. Moving Averages + Bearish Patterns for Shorts
   */
  movingAveragesWithBearishPatterns(indicators, candles) {
    const ma9 = indicators.ma9 || 0;
    const ma21 = indicators.ma21 || 0;
    const ma50 = indicators.ma50 || 0;
    const currentPrice = candles[candles.length - 1].close;
    
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    const bearishPatterns = patterns.filter(p => 
      p.direction === 'bearish'
    );
    
    // Death cross setup: MA9 < MA21 < MA50 + bearish pattern
    if (ma9 < ma21 && ma21 < ma50 && currentPrice < ma9 && bearishPatterns.length > 0) {
      const strongestPattern = bearishPatterns[0];
      
      return {
        signal: 'SHORT',
        strategy: 'MA_BEARISH_TREND',
        confidence: Math.min(0.85, strongestPattern.reliability + 0.1),
        entry: currentPrice,
        stopLoss: ma21, // Use MA21 as dynamic stop
        takeProfit: currentPrice * 0.92,
        pattern: strongestPattern.pattern,
        mas: { ma9, ma21, ma50 },
        reason: `Death cross alignment + ${strongestPattern.pattern}`
      };
    }
    
    // Price rejection at MA resistance + bearish pattern
    if (Math.abs(currentPrice - ma21) / currentPrice < 0.01 && 
        currentPrice < ma21 && ma9 < ma50 && bearishPatterns.length > 0) {
      
      const strongestPattern = bearishPatterns[0];
      
      return {
        signal: 'SHORT',
        strategy: 'MA_RESISTANCE_REJECTION',
        confidence: Math.min(0.75, strongestPattern.reliability),
        entry: currentPrice,
        stopLoss: ma21 * 1.02,
        takeProfit: currentPrice * 0.95,
        pattern: strongestPattern.pattern,
        reason: `MA21 resistance rejection + ${strongestPattern.pattern}`
      };
    }
    
    return { signal: null };
  }

  /**
   * 9. Combined Moving Averages Strategy (2 or 3 MAs)
   */
  combinedMovingAverages(indicators, marketData) {
    const ma9 = indicators.ma9 || 0;
    const ma21 = indicators.ma21 || 0;
    const ma50 = indicators.ma50 || 0;
    const currentPrice = marketData.price;
    
    // Triple MA alignment
    const bullishAlignment = ma9 > ma21 && ma21 > ma50;
    const bearishAlignment = ma9 < ma21 && ma21 < ma50;
    
    // MA crossover signals
    const goldenCross = indicators.ma9Previous < indicators.ma21Previous && ma9 > ma21;
    const deathCross = indicators.ma9Previous > indicators.ma21Previous && ma9 < ma21;
    
    if (goldenCross && currentPrice > ma9) {
      return {
        signal: 'BUY',
        strategy: 'MA_GOLDEN_CROSS',
        confidence: 0.8,
        entry: currentPrice,
        stopLoss: ma21 * 0.97,
        takeProfit: currentPrice * 1.1,
        reason: 'Golden cross detected (MA9 crossed above MA21)'
      };
    }
    
    if (deathCross && currentPrice < ma9) {
      return {
        signal: 'SHORT',
        strategy: 'MA_DEATH_CROSS',
        confidence: 0.8,
        entry: currentPrice,
        stopLoss: ma21 * 1.03,
        takeProfit: currentPrice * 0.9,
        reason: 'Death cross detected (MA9 crossed below MA21)'
      };
    }
    
    // Strong trend confirmation
    if (bullishAlignment && currentPrice > ma9) {
      const momentum = (currentPrice - ma50) / ma50;
      return {
        signal: 'BUY',
        strategy: 'MA_BULLISH_ALIGNMENT',
        confidence: Math.min(0.75 + momentum, 0.9),
        entry: currentPrice,
        stopLoss: ma21,
        takeProfit: currentPrice * (1 + momentum * 2),
        reason: 'Bullish MA alignment (9 > 21 > 50)'
      };
    }
    
    if (bearishAlignment && currentPrice < ma9) {
      const momentum = (ma50 - currentPrice) / ma50;
      return {
        signal: 'SHORT',
        strategy: 'MA_BEARISH_ALIGNMENT',
        confidence: Math.min(0.75 + momentum, 0.9),
        entry: currentPrice,
        stopLoss: ma21,
        takeProfit: currentPrice * (1 - momentum * 2),
        reason: 'Bearish MA alignment (9 < 21 < 50)'
      };
    }
    
    return { signal: null };
  }

  /**
   * 10. Bollinger Bands + Pattern Confirmation
   */
  bollingerBandsWithPatterns(indicators, candles) {
    const bbUpper = indicators.bbUpper || 0;
    const bbLower = indicators.bbLower || 0;
    const bbMiddle = indicators.bbMiddle || 0;
    const currentPrice = candles[candles.length - 1].close;
    
    const patterns = this.patternDetector.scanAllPatterns(candles, { 
      minReliability: 0.6 
    });
    
    // Price at lower band + bullish pattern = buy
    if (currentPrice <= bbLower && patterns.some(p => p.direction === 'bullish')) {
      const bullishPattern = patterns.find(p => p.direction === 'bullish');
      
      return {
        signal: 'BUY',
        strategy: 'BB_LOWER_BULLISH',
        confidence: Math.min(0.8, bullishPattern.reliability),
        entry: currentPrice,
        stopLoss: bbLower * 0.98,
        takeProfit: bbMiddle,
        pattern: bullishPattern.pattern,
        reason: `BB lower band touch + ${bullishPattern.pattern}`
      };
    }
    
    // Price at upper band + bearish pattern = sell/short
    if (currentPrice >= bbUpper && patterns.some(p => p.direction === 'bearish')) {
      const bearishPattern = patterns.find(p => p.direction === 'bearish');
      
      return {
        signal: 'SHORT',
        strategy: 'BB_UPPER_BEARISH',
        confidence: Math.min(0.8, bearishPattern.reliability),
        entry: currentPrice,
        stopLoss: bbUpper * 1.02,
        takeProfit: bbMiddle,
        pattern: bearishPattern.pattern,
        reason: `BB upper band touch + ${bearishPattern.pattern}`
      };
    }
    
    return { signal: null };
  }

  /**
   * Calculate Fibonacci retracement levels
   * HOOKUP: Called in executeStrategies() to find entry/exit levels
   * OUTPUT: Logs fib levels to console so we can verify it's working
   */
  calculateFibonacciLevels(candles) {
    if (candles.length < 20) return null;
    
    // Find swing high and low from last 50 candles
    const lookback = Math.min(50, candles.length);
    const recentCandles = candles.slice(-lookback);
    
    let swingHigh = Math.max(...recentCandles.map(c => c.high));
    let swingLow = Math.min(...recentCandles.map(c => c.low));
    
    const diff = swingHigh - swingLow;
    
    // Calculate Fibonacci levels
    const fibLevels = {
      0: swingLow,
      0.236: swingLow + (diff * 0.236),
      0.382: swingLow + (diff * 0.382),
      0.5: swingLow + (diff * 0.5),
      0.618: swingLow + (diff * 0.618),
      0.786: swingLow + (diff * 0.786),
      1: swingHigh
    };
    
    // 🔍 TESTING OUTPUT - Remove this after confirming it works
    console.log('📐 FIBONACCI LEVELS CALCULATED:');
    console.log(`   0%: $${fibLevels[0].toFixed(2)} (Low)`);
    console.log(`   23.6%: $${fibLevels[0.236].toFixed(2)}`);
    console.log(`   38.2%: $${fibLevels[0.382].toFixed(2)}`);
    console.log(`   50%: $${fibLevels[0.5].toFixed(2)}`);
    console.log(`   61.8%: $${fibLevels[0.618].toFixed(2)}`);
    console.log(`   78.6%: $${fibLevels[0.786].toFixed(2)}`);
    console.log(`   100%: $${fibLevels[1].toFixed(2)} (High)`);
    
    return fibLevels;
  }

  /**
   * Find support/resistance levels using price clustering (from SupportResistanceDetector)
   */
  findSupportResistanceLevels(candles, currentPrice) {
    const priceFrequency = {};
    const lookback = Math.min(100, candles.length);
    
    // Count price touches at highs and lows
    for (let i = candles.length - lookback; i < candles.length; i++) {
      const highRounded = Math.round(candles[i].high);
      const lowRounded = Math.round(candles[i].low);
      
      priceFrequency[highRounded] = (priceFrequency[highRounded] || 0) + 1;
      priceFrequency[lowRounded] = (priceFrequency[lowRounded] || 0) + 1;
    }
    
    // Find levels with 3+ touches
    const levels = Object.entries(priceFrequency)
      .filter(([_, count]) => count >= 3)
      .map(([price, count]) => ({
        price: parseFloat(price),
        strength: count,
        type: parseFloat(price) < currentPrice ? 'support' : 'resistance'
      }))
      .sort((a, b) => b.strength - a.strength);
    
    return levels;
  }

  /**
   * Calculate trend line from candles
   */
  calculateTrendLine(candles) {
    if (candles.length < 20) {
      return { slope: 0, support: 0, resistance: 0 };
    }
    
    // Simple linear regression for trend
    const prices = candles.slice(-20).map(c => c.close);
    const n = prices.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * prices[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate support and resistance
    const currentTrend = intercept + slope * (n - 1);
    const support = currentTrend * 0.98;
    const resistance = currentTrend * 1.02;
    
    return { slope, support, resistance, current: currentTrend };
  }

  /**
   * Aggregate multiple strategy signals
   */
  aggregateStrategies(strategies) {
    if (strategies.length === 0) {
      return { action: 'HOLD', confidence: 0, strategies: [] };
    }
    
    // Count buy/sell signals
    const buySignals = strategies.filter(s => s.signal === 'BUY');
    const sellSignals = strategies.filter(s => s.signal === 'SELL' || s.signal === 'SHORT');
    
    // DEBUG: Log what strategies are firing
    console.log('📊 AGGREGATION DEBUG:', {
      totalStrategies: strategies.length,
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      strategies: strategies.map(s => ({ signal: s.signal, strategy: s.strategy, confidence: s.confidence }))
    });
    
    // Calculate weighted confidence
    const buyConfidence = buySignals.reduce((sum, s) => sum + s.confidence, 0) / Math.max(1, buySignals.length);
    const sellConfidence = sellSignals.reduce((sum, s) => sum + s.confidence, 0) / Math.max(1, sellSignals.length);
    
    // Determine action based on consensus
    let action = 'HOLD';
    let confidence = 0;
    let selectedStrategies = [];
    
    if (buySignals.length > sellSignals.length && buyConfidence > 0.6) {
      action = 'BUY';
      confidence = buyConfidence;
      selectedStrategies = buySignals;
    } else if (sellSignals.length > buySignals.length && sellConfidence > 0.6) {
      action = 'SELL';
      confidence = sellConfidence;
      selectedStrategies = sellSignals;
    } else if (buySignals.length === sellSignals.length) {
      // Tie breaker - use highest confidence
      if (buyConfidence > sellConfidence) {
        action = 'BUY';
        confidence = buyConfidence;
        selectedStrategies = buySignals;
      } else if (sellConfidence > buyConfidence) {
        action = 'SELL';
        confidence = sellConfidence;
        selectedStrategies = sellSignals;
      }
    }
    
    // Calculate average stops and targets
    let stopLoss = 0;
    let takeProfit = 0;
    
    if (selectedStrategies.length > 0) {
      stopLoss = selectedStrategies.reduce((sum, s) => sum + (s.stopLoss || 0), 0) / selectedStrategies.length;
      takeProfit = selectedStrategies.reduce((sum, s) => sum + (s.takeProfit || 0), 0) / selectedStrategies.length;
    }
    
    return {
      action,
      confidence: Math.min(confidence * (1 + strategies.length * 0.05), 0.95), // Boost for consensus
      totalStrategies: strategies.length,
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      stopLoss,
      takeProfit,
      strategies: selectedStrategies.map(s => ({
        name: s.strategy,
        confidence: s.confidence,
        reason: s.reason,
        pattern: s.pattern
      })),
      primaryReason: selectedStrategies[0]?.reason || 'No clear signal'
    };
  }
}

module.exports = AdvancedTradingStrategies;