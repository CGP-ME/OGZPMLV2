/**
 * ============================================================================
 * DOCUMENTED_PerformanceAnalyzer.js - AI-Powered Trading Quality Analysis
 * ============================================================================
 * 
 * SYSTEM ROLE: Advanced performance analytics and edge decay detection
 * 
 * BUSINESS PURPOSE:
 * This SS-tier enhancement monitors trading performance in real-time,
 * detecting when your trading edge begins to deteriorate before it costs
 * significant money. It's your early warning system for strategy optimization.
 * 
 * HOUSTON MISSION IMPACT:
 * By maintaining peak trading performance through AI-powered analysis,
 * this system helps maximize profits and minimize losses, accelerating
 * your path to financial freedom and moving to Houston with your daughter.
 * 
 * KEY FEATURES:
 * - Trade quality scoring (0-100 scale)
 * - Edge decay detection with statistical significance
 * - Pattern effectiveness tracking
 * - Automated optimization recommendations
 * - Performance trend analysis
 * 
 * @author OGZ Prime Development Team
 * @version 10.2.0
 * @since 2025-06-16
 * ============================================================================
 */

/**
 * Advanced Performance Analysis for OGZ Prime Trading System
 * 
 * ANALYTICAL CAPABILITIES:
 * - Real-time trade quality assessment
 * - Edge decay detection with statistical validation
 * - Pattern performance tracking and optimization
 * - Entry/exit timing analysis
 * - Risk-adjusted performance metrics
 * - Automated recommendation generation
 * 
 * INTEGRATION POINTS:
 * - Called by OGZPrimeV10.processTrade() after each trade
 * - Results feed into RiskManager for dynamic adjustment
 * - Recommendations displayed in dashboard for user guidance
 * - Performance data persisted for long-term analysis
 */
class PerformanceAnalyzer {
  /**
   * Initialize the performance analysis system
   * 
   * @param {Object} config - Configuration options
   * @param {number} [config.minTradesForAnalysis=20] - Minimum trades before generating insights
   * @param {number} [config.edgeDecayLookback=50] - Trades to analyze for edge decay
   * @param {number} [config.edgeDecayThreshold=0.3] - Edge decay threshold (30% reduction)
   * @param {number} [config.entryQualityWeight=0.4] - Weight for entry timing in quality score
   * @param {number} [config.exitQualityWeight=0.4] - Weight for exit timing in quality score
   * @param {number} [config.patternAccuracyWeight=0.2] - Weight for pattern accuracy
   * @param {string} [config.tradesDbPath] - Path for trades database storage
   * @param {number} [config.recommendationInterval=50] - Trades between recommendations
   * @param {number} [config.minRecommendationConfidence=0.7] - Min confidence for recommendations
   * @param {number} [config.alertOnTradesBelow=70] - Quality score threshold for alerts
   */
  constructor(config = {}) {
    // ========================================================================
    // CONFIGURATION MANAGEMENT
    // ========================================================================
    
    /**
     * Performance analyzer configuration
     * @type {Object}
     */
    this.config = {
      // General analysis settings
      minTradesForAnalysis: 20,           // Minimum trades before generating insights
      
      // Edge decay detection parameters
      edgeDecayLookback: 50,              // Trades to analyze for edge decay
      edgeDecayThreshold: 0.3,            // 30% reduction in win rate = edge decay
      
      // Quality scoring weights
      entryQualityWeight: 0.4,            // Weight for entry timing in quality score
      exitQualityWeight: 0.4,             // Weight for exit timing in quality score
      patternAccuracyWeight: 0.2,         // Weight for pattern match accuracy
      
      // Parameter sensitivity analysis
      parameterSensitivityEnabled: true,
      parameterVariationAmount: 0.1,      // Test parameters at ±10%
      
      // File paths for data persistence
      tradesDbPath: 'data/trades.json',
      performanceDbPath: 'data/performance.json',
      
      // Recommendation system
      recommendationInterval: 50,         // Trades between recommendation generations
      minRecommendationConfidence: 0.7,   // Min confidence for recommendations
      
      // A/B testing capabilities
      enableABTesting: false,             // Auto A/B testing of parameters
      abTestCycleLength: 30,              // Trades per test cycle
      
      // Alert thresholds
      alertOnTradesBelow: 70,             // Quality score threshold for alerts
      criticalAlertThreshold: 60,         // Critical quality threshold
      
      // Logging configuration
      verboseLogging: false,
      
      // Merge user configuration
      ...config
    };
    
    // ========================================================================
    // STATE INITIALIZATION
    // ========================================================================
    
    this.reset();
    
    // Log initialization
    console.log('📊 PerformanceAnalyzer initialized with configuration:');
    console.log(`   ✅ Tracking ${config.trackingMetrics?.length || 0} metrics`);
    console.log(`   ✅ Update interval: ${config.updateInterval || 60000}ms`);
    console.log(`   ✅ Alert thresholds configured`);
    console.log(`   ✅ Min trades for analysis: ${this.config.minTradesForAnalysis}`);
    console.log(`   ✅ Edge decay lookback: ${this.config.edgeDecayLookback} trades`);
  }
  
  /**
   * Reset analyzer state to initial conditions
   * 
   * RESET FUNCTIONALITY:
   * Clears all tracking data while preserving configuration.
   * Used for system restarts or when switching trading strategies.
   */
  reset() {
    /**
     * Complete performance analysis state
     * @type {Object}
     */
    this.state = {
      // ====================================================================
      // TRADE TRACKING METRICS
      // ====================================================================
      tradeHistory: [],                   // Complete trade record history
      totalTrades: 0,                     // Total number of trades processed
      winningTrades: 0,                   // Count of profitable trades
      losingTrades: 0,                    // Count of losing trades
      totalPnL: 0,                        // Cumulative profit/loss
      
      // ====================================================================
      // PATTERN PERFORMANCE TRACKING
      // ====================================================================
      patternPerformance: {},             // Pattern-specific performance data
      
      // ====================================================================
      // QUALITY ASSESSMENT METRICS
      // ====================================================================
      qualityScores: [],                  // Individual trade quality scores
      averageQuality: 0,                  // Running average quality score
      
      // ====================================================================
      // EDGE DECAY DETECTION
      // ====================================================================
      edgeMetrics: {
        historicalWinRate: 0,             // Overall historical win rate
        recentWinRate: 0,                 // Recent period win rate
        edgeDecay: 0,                     // Calculated edge decay amount
        edgeDecayDetected: false          // Whether edge decay is detected
      },
      
      // ====================================================================
      // PARAMETER SENSITIVITY ANALYSIS
      // ====================================================================
      parameterSensitivity: {},           // Parameter sensitivity results
      
      // ====================================================================
      // A/B TESTING RESULTS
      // ====================================================================
      abTestResults: [],                  // A/B test outcome data
      currentABTest: null,                // Active A/B test configuration
      
      // ====================================================================
      // RECOMMENDATION SYSTEM
      // ====================================================================
      recommendations: [],                // Current recommendations
      lastAnalysisTime: 0,                // Last recommendation generation time
      
      // ====================================================================
      // TIME-BASED STATISTICS
      // ====================================================================
      dailyStats: {},                     // Daily performance breakdown
      weeklyStats: {},                    // Weekly performance trends
      monthlyStats: {}                    // Monthly performance analysis
    };
  }
  
  /**
   * Process a completed trade for performance analysis
   * 
   * TRADE PROCESSING PIPELINE:
   * 1. Extract and validate trade data
   * 2. Calculate comprehensive quality metrics
   * 3. Update pattern performance tracking
   * 4. Detect edge decay conditions
   * 5. Generate recommendations if needed
   * 6. Return actionable insights
   * 
   * @param {Object} trade - Trade result data
   * @param {number} trade.entryPrice - Trade entry price
   * @param {number} trade.exitPrice - Trade exit price
   * @param {Date} trade.entryTime - Trade entry timestamp
   * @param {Date} trade.exitTime - Trade exit timestamp
   * @param {number} trade.pnl - Trade profit/loss amount
   * @param {string} trade.direction - Trade direction ('buy' or 'sell')
   * @param {string} trade.entryReason - Reason for trade entry
   * @param {string} trade.exitReason - Reason for trade exit
   * @param {Object} [analysisData={}] - Analysis data when trade was initiated
   * @returns {Object|null} Trade quality assessment and recommendations
   */
  processTrade(trade, analysisData = {}) {
    if (!trade) {
      this.log('Invalid trade data provided', 'error');
      return null;
    }
    
    // ====================================================================
    // TRADE DATA EXTRACTION AND VALIDATION
    // ====================================================================
    
    const {
      entryPrice,
      exitPrice,
      entryTime,
      exitTime,
      pnl,
      direction,
      entryReason,
      exitReason
    } = trade;
    
    // Extract pattern data if available
    const patternData = analysisData.patternEvaluation || null;
    
    // ====================================================================
    // TRADE METRICS CALCULATION
    // ====================================================================
    
    const holdTimeMs = new Date(exitTime) - new Date(entryTime);
    const holdTimeMin = holdTimeMs / 60000;
    const isProfitable = pnl > 0;
    
    // ====================================================================
    // TRADE RECORD CREATION
    // ====================================================================
    
    /**
     * Comprehensive trade record for analysis
     * @type {Object}
     */
    const tradeRecord = {
      id: this.state.totalTrades + 1,
      timestamp: new Date(),
      entryTime: new Date(entryTime),
      exitTime: new Date(exitTime),
      entryPrice,
      exitPrice,
      direction,
      pnl,
      holdTimeMin,
      profitable: isProfitable,
      entryReason,
      exitReason,
      pattern: patternData ? {
        exactMatch: patternData.exactMatch,
        confidence: patternData.confidence,
        direction: patternData.direction
      } : null
    };
    
    // ====================================================================
    // STATE UPDATES
    // ====================================================================
    
    // Add to trade history
    this.state.tradeHistory.push(tradeRecord);
    this.state.totalTrades++;
    
    // Update win/loss counts
    if (isProfitable) {
      this.state.winningTrades++;
    } else {
      this.state.losingTrades++;
    }
    
    // Update total PnL
    this.state.totalPnL += pnl;
    
    // ====================================================================
    // QUALITY ASSESSMENT
    // ====================================================================
    
    const qualityScore = this.scoreTradeQuality(tradeRecord, analysisData);
    tradeRecord.qualityScore = qualityScore;
    
    // ====================================================================
    // PATTERN PERFORMANCE TRACKING
    // ====================================================================
    
    if (patternData) {
      this.updatePatternPerformance(patternData, isProfitable, pnl);
    }
    
    // ====================================================================
    // EDGE DECAY DETECTION
    // ====================================================================
    
    this.updateEdgeMetrics();
    const edgeDecay = this.detectEdgeDecay();
    
    // ====================================================================
    // RECOMMENDATION GENERATION
    // ====================================================================
    
    if (this.state.totalTrades % this.config.recommendationInterval === 0) {
      this.generateRecommendations();
    }
    
    // ====================================================================
    // RETURN COMPREHENSIVE ASSESSMENT
    // ====================================================================
    
    return {
      tradeId: tradeRecord.id,
      qualityScore,
      qualityCategory: this.getQualityCategory(qualityScore),
      edgeDecay,
      recommendationsAvailable: this.state.recommendations.length > 0,
      improvements: this.getTradeImprovements(tradeRecord, qualityScore)
    };
  }
  
  /**
   * Score trade quality on a 0-100 scale
   * 
   * QUALITY SCORING METHODOLOGY:
   * Combines entry quality, exit quality, and pattern accuracy
   * using configurable weights to produce an overall quality score.
   * 
   * SCORING COMPONENTS:
   * - Entry Quality (40%): Timing, indicators, market conditions
   * - Exit Quality (40%): Exit timing, discipline, profit capture
   * - Pattern Accuracy (20%): Pattern match quality and historical performance
   * 
   * @param {Object} trade - Trade record
   * @param {Object} [analysisData={}] - Analysis data when trade was initiated
   * @returns {number} Quality score (0-100)
   */
  scoreTradeQuality(trade, analysisData = {}) {
    // Start with base score
    let score = 50;
    
    // ====================================================================
    // COMPONENT SCORING
    // ====================================================================
    
    const entryQuality = this.scoreEntryQuality(trade, analysisData);
    const exitQuality = this.scoreExitQuality(trade, analysisData);
    const patternAccuracy = this.scorePatternAccuracy(trade, analysisData);
    
    // ====================================================================
    // WEIGHTED COMBINATION
    // ====================================================================
    
    score = (
      entryQuality * this.config.entryQualityWeight +
      exitQuality * this.config.exitQualityWeight +
      patternAccuracy * this.config.patternAccuracyWeight
    ) * 100;
    
    // Ensure score is within valid range
    score = Math.max(0, Math.min(100, score));
    
    // ====================================================================
    // QUALITY TRACKING UPDATE
    // ====================================================================
    
    this.updateAverageQuality(score);
    
    // ====================================================================
    // ALERT GENERATION
    // ====================================================================
    
    if (score < this.config.alertOnTradesBelow) {
      this.log(`⚠️ Low quality trade detected (${score.toFixed(1)}/100)`, 'warning');
    }
    
    return score;
  }
  
  /**
   * Score entry quality (0-1 scale)
   * 
   * ENTRY QUALITY FACTORS:
   * - Pattern confidence and historical accuracy
   * - Trend alignment with trade direction
   * - Technical indicator confirmations
   * - Proximity to support/resistance levels
   * 
   * @param {Object} trade - Trade record
   * @param {Object} [analysisData={}] - Analysis data when trade was initiated
   * @returns {number} Entry quality (0-1)
   */
  scoreEntryQuality(trade, analysisData = {}) {
    // Default to moderate score
    let entryQuality = 0.5;
    
    // ====================================================================
    // PATTERN CONFIDENCE ASSESSMENT
    // ====================================================================
    
    if (analysisData.patternEvaluation) {
      const confidence = analysisData.patternEvaluation.confidence || 0;
      entryQuality += confidence * 0.3; // Max 0.3 boost from pattern confidence
    }
    
    // ====================================================================
    // TREND ALIGNMENT ANALYSIS
    // ====================================================================
    
    if (analysisData.trend && trade.direction) {
      // Check if trade direction matches trend
      // CHANGE 614: Normalize direction and trend to lowercase for case-insensitive comparison
      const normalizedTrend = (analysisData.trend || '').toLowerCase();
      const normalizedDirection = (trade.direction || '').toLowerCase();
      const trendAligned = (
        (normalizedTrend === 'uptrend' && normalizedDirection === 'buy') ||
        (normalizedTrend === 'downtrend' && normalizedDirection === 'sell')
      );

      if (trendAligned) {
        entryQuality += 0.1;
      } else {
        entryQuality -= 0.1;
      }
    }
    
    // ====================================================================
    // TECHNICAL INDICATOR CONFIRMATIONS
    // ====================================================================
    
    if (analysisData.rsi !== undefined) {
      // Check for extreme RSI conditions
      // CHANGE 614: Normalize direction to lowercase for case-insensitive comparison
      const normalizedDirection = (trade.direction || '').toLowerCase();
      if ((analysisData.rsi < 30 && normalizedDirection === 'buy') ||
          (analysisData.rsi > 70 && normalizedDirection === 'sell')) {
        entryQuality += 0.1;
      }
    }
    
    // ====================================================================
    // SUPPORT/RESISTANCE LEVEL PROXIMITY
    // ====================================================================
    
    if (analysisData.srLevels && analysisData.srLevels.length > 0) {
      const nearLevel = this.isNearSupportResistance(trade.entryPrice, analysisData.srLevels, trade.direction);
      if (nearLevel) {
        entryQuality += 0.15;
      }
    }
    
    // Final quality clamped to 0-1 range
    return Math.max(0, Math.min(1, entryQuality));
  }
  
  /**
   * Score exit quality (0-1 scale)
   * 
   * EXIT QUALITY FACTORS:
   * - Exit discipline (target/stop vs emotional)
   * - Hold time appropriateness
   * - Profit capture efficiency
   * - Exit timing relative to S/R levels
   * 
   * @param {Object} trade - Trade record
   * @param {Object} [analysisData={}] - Analysis data when trade was initiated
   * @returns {number} Exit quality (0-1)
   */
  scoreExitQuality(trade, analysisData = {}) {
    // Default to moderate score
    let exitQuality = 0.5;
    
    // ====================================================================
    // EXIT DISCIPLINE ASSESSMENT
    // ====================================================================
    
    if (trade.exitReason) {
      if (trade.exitReason.includes('target') || 
          trade.exitReason.includes('profit') ||
          trade.exitReason.includes('stop') ||
          trade.exitReason.includes('trailing')) {
        exitQuality += 0.15; // Disciplined exit
      }
    }
    
    // ====================================================================
    // HOLD TIME EVALUATION
    // ====================================================================
    
    if (trade.holdTimeMin < 5) {
      if (trade.profitable) {
        // Quick profit is acceptable
        exitQuality += 0.05;
      } else {
        // Quick loss might indicate poor entry
        exitQuality -= 0.1;
      }
    } else if (trade.holdTimeMin > 120) {
      // Very long hold times should result in larger profits
      if (trade.profitable && Math.abs(trade.pnl) > 100) {
        exitQuality += 0.1;
      } else {
        exitQuality -= 0.05; // Holding too long without significant profit
      }
    }
    
    // ====================================================================
    // SUPPORT/RESISTANCE EXIT TIMING
    // ====================================================================
    
    if (analysisData.srLevels && analysisData.srLevels.length > 0) {
      // Good exit points are near appropriate S/R levels
      // CHANGE 614: Normalize direction to lowercase for case-insensitive comparison
      const normalizedDirection = (trade.direction || '').toLowerCase();
      const nearLevel = this.isNearSupportResistance(
        trade.exitPrice,
        analysisData.srLevels,
        normalizedDirection === 'buy' ? 'sell' : 'buy'
      );

      if (nearLevel) {
        exitQuality += 0.15;
      }
    }
    
    // Final quality clamped to 0-1 range
    return Math.max(0, Math.min(1, exitQuality));
  }
  
  /**
   * Score pattern accuracy (0-1 scale)
   * 
   * PATTERN ACCURACY FACTORS:
   * - Pattern match confidence
   * - Exact vs similar match quality
   * - Direction prediction accuracy
   * - Historical pattern performance
   * 
   * @param {Object} trade - Trade record
   * @param {Object} [analysisData={}] - Analysis data when trade was initiated
   * @returns {number} Pattern accuracy (0-1)
   */
  scorePatternAccuracy(trade, analysisData = {}) {
    // Default to moderate score
    let patternAccuracy = 0.5;
    
    // If no pattern data, return default
    if (!analysisData.patternEvaluation || !trade.pattern) {
      return patternAccuracy;
    }
    
    // ====================================================================
    // PATTERN DATA EXTRACTION
    // ====================================================================
    
    const { exactMatch, confidence, direction } = trade.pattern;
    
    // ====================================================================
    // PATTERN CONFIDENCE SCORING
    // ====================================================================
    
    patternAccuracy = confidence || 0.5;
    
    // ====================================================================
    // EXACT MATCH BONUS
    // ====================================================================
    
    if (exactMatch) {
      patternAccuracy += 0.1;
    }
    
    // ====================================================================
    // DIRECTION PREDICTION ACCURACY
    // ====================================================================
    // CHANGE 614: Normalize direction to lowercase for case-insensitive comparison
    const normalizedDirection = (direction || '').toLowerCase();
    const directionCorrect = (
      (normalizedDirection === 'buy' && trade.profitable) ||
      (normalizedDirection === 'sell' && trade.profitable)
    );

    if (directionCorrect) {
      patternAccuracy += 0.2;
    } else {
      patternAccuracy -= 0.2;
    }
    
    // ====================================================================
    // HISTORICAL PATTERN PERFORMANCE
    // ====================================================================
    
    const patternKey = this.getPatternKey(analysisData.patternEvaluation);
    if (patternKey && this.state.patternPerformance[patternKey]) {
      const history = this.state.patternPerformance[patternKey];
      
      // Adjust based on historical accuracy
      if (history.trades > 5) {
        const historicalWinRate = history.wins / history.trades;
        
        // Boost score if pattern historically accurate
        if (historicalWinRate > 0.6) {
          patternAccuracy += 0.1;
        } else if (historicalWinRate < 0.4) {
          patternAccuracy -= 0.1;
        }
      }
    }
    
    // Final accuracy clamped to 0-1 range
    return Math.max(0, Math.min(1, patternAccuracy));
  }
  
  /**
   * Check if price is near support/resistance level
   * 
   * @param {number} price - Price to check
   * @param {Array} levels - Support/resistance levels
   * @param {string} direction - Trade direction
   * @returns {boolean} True if near an appropriate level
   */
  isNearSupportResistance(price, levels, direction) {
    // Default proximity threshold (0.5%)
    const proximityThreshold = 0.005;
    // CHANGE 614: Normalize direction and type to lowercase for case-insensitive comparison
    const normalizedDirection = (direction || '').toLowerCase();

    for (const level of levels) {
      // Calculate percentage distance
      const percentDistance = Math.abs(price - level.price) / price;

      // Check if near level
      if (percentDistance <= proximityThreshold) {
        // For buys, being near support is good
        // For sells, being near resistance is good
        const normalizedLevelType = (level.type || '').toLowerCase();
        if ((normalizedDirection === 'buy' && normalizedLevelType === 'support') ||
            (normalizedDirection === 'sell' && normalizedLevelType === 'resistance')) {
          return true;
        }
      }
    }

    return false;
  }
  
  /**
   * Update average quality score
   * 
   * @param {number} newScore - New quality score to include
   */
  updateAverageQuality(newScore) {
    // Add to quality scores
    this.state.qualityScores.push(newScore);
    
    // Calculate new average
    const sum = this.state.qualityScores.reduce((total, score) => total + score, 0);
    this.state.averageQuality = sum / this.state.qualityScores.length;
  }
  
  /**
   * Get trade improvements based on quality score
   * 
   * @param {Object} trade - Trade record
   * @param {number} qualityScore - Trade quality score
   * @returns {Array} Improvement suggestions
   */
  getTradeImprovements(trade, qualityScore) {
    const improvements = [];
    
    // Suggest improvements based on quality
    if (qualityScore < 70) {
      // Entry improvements
      if (trade.qualityComponents && trade.qualityComponents.entryQuality < 0.6) {
        improvements.push({
          aspect: 'entry',
          suggestion: 'Look for stronger entry confirmation signals',
          priority: 'high'
        });
      }
      
      // Exit improvements
      if (trade.qualityComponents && trade.qualityComponents.exitQuality < 0.6) {
        improvements.push({
          aspect: 'exit',
          suggestion: 'Consider using more disciplined exit criteria',
          priority: 'medium'
        });
      }
      
      // Hold time issues
      if (trade.holdTimeMin < 2 && !trade.profitable) {
        improvements.push({
          aspect: 'patience',
          suggestion: 'Avoid quick exits on losing trades',
          priority: 'high'
        });
      }
      
      if (trade.holdTimeMin > 180 && !trade.profitable) {
        improvements.push({
          aspect: 'discipline',
          suggestion: 'Consider tighter stop loss to avoid extended losing trades',
          priority: 'high'
        });
      }
    }
    
    return improvements;
  }
  
  /**
   * Get pattern key for storage and tracking
   * 
   * @param {Object} patternData - Pattern evaluation data
   * @returns {string|null} Pattern key or null
   */
  getPatternKey(patternData) {
    if (!patternData || !patternData.features) {
      return null;
    }
    
    // Create key from feature vector
    return patternData.features.map(f => f.toFixed(2)).join(',');
  }
  
  /**
   * Update pattern performance statistics
   * 
   * @param {Object} patternData - Pattern evaluation data
   * @param {boolean} profitable - Whether trade was profitable
   * @param {number} pnl - Profit/loss amount
   */
  updatePatternPerformance(patternData, profitable, pnl) {
    const patternKey = this.getPatternKey(patternData);
    if (!patternKey) return;
    
    // Create or update pattern record
    if (!this.state.patternPerformance[patternKey]) {
      this.state.patternPerformance[patternKey] = {
        firstSeen: new Date(),
        trades: 0,
        wins: 0,
        losses: 0,
        totalPnL: 0,
        direction: patternData.direction,
        confidence: patternData.confidence
      };
    }
    
    // Update pattern stats
    const stats = this.state.patternPerformance[patternKey];
    stats.trades++;
    stats.totalPnL += pnl;
    stats.lastSeen = new Date();
    
    if (profitable) {
      stats.wins++;
    } else {
      stats.losses++;
    }
    
    // Calculate win rate
    stats.winRate = stats.trades > 0 ? (stats.wins / stats.trades) : 0;
  }
  
  /**
   * Update edge metrics for decay detection
   */
  updateEdgeMetrics() {
    if (this.state.totalTrades < 10) {
      return; // Not enough trades for meaningful metrics
    }
    
    // Calculate overall win rate
    const historicalWinRate = this.state.winningTrades / this.state.totalTrades;
    
    // Calculate recent win rate
    const recentTrades = Math.min(this.config.edgeDecayLookback, this.state.totalTrades);
    let recentWins = 0;
    
    for (let i = 1; i <= recentTrades; i++) {
      const index = this.state.tradeHistory.length - i;
      if (index >= 0 && this.state.tradeHistory[index].profitable) {
        recentWins++;
      }
    }
    
    const recentWinRate = recentWins / recentTrades;
    
    // Calculate edge decay
    let edgeDecay = 0;
    if (historicalWinRate > 0) {
      edgeDecay = 1 - (recentWinRate / historicalWinRate);
    }
    
    // Update metrics
    this.state.edgeMetrics = {
      historicalWinRate,
      recentWinRate,
      edgeDecay,
      edgeDecayDetected: edgeDecay >= this.config.edgeDecayThreshold
    };
  }
  
  /**
   * Detect edge decay in trading system
   * 
   * @returns {Object} Edge decay information
   */
  detectEdgeDecay() {
    if (this.state.totalTrades < this.config.minTradesForAnalysis) {
      return {
        detected: false,
        message: 'Not enough trades for edge decay analysis'
      };
    }
    
    const { historicalWinRate, recentWinRate, edgeDecay, edgeDecayDetected } = this.state.edgeMetrics;
    
    // Log decay if detected
    if (edgeDecayDetected && !this.state.edgeDetectionLogged) {
      this.log(`⚠️ Edge decay detected! Historical win rate: ${(historicalWinRate * 100).toFixed(1)}%, Recent: ${(recentWinRate * 100).toFixed(1)}%`, 'warning');
      this.state.edgeDetectionLogged = true;
    }
    
    return {
      detected: edgeDecayDetected,
      historicalWinRate,
      recentWinRate,
      decayAmount: edgeDecay,
      significance: this.calculateStatisticalSignificance(historicalWinRate, recentWinRate, this.config.edgeDecayLookback),
      message: edgeDecayDetected ? 
        `Trading edge decay detected (${(edgeDecay * 100).toFixed(1)}% reduction in win rate)` : 
        'Trading edge stable'
    };
  }
  
  /**
   * Calculate statistical significance of win rate change
   * 
   * @param {number} historicalRate - Historical win rate
   * @param {number} recentRate - Recent win rate
   * @param {number} sampleSize - Recent sample size
   * @returns {number} Significance (0-1)
   */
  calculateStatisticalSignificance(historicalRate, recentRate, sampleSize) {
    // Simple version - more sophisticated would use z-test
    const delta = Math.abs(historicalRate - recentRate);
    const expectedVariation = Math.sqrt(historicalRate * (1 - historicalRate) / sampleSize);
    
    // If delta is more than 2x the expected variation, we consider it significant
    const significance = Math.min(1, delta / (2 * expectedVariation));
    return significance;
  }
  
  /**
   * Generate trading recommendations
   * 
   * @returns {Array} Recommendations
   */
  generateRecommendations() {
    if (this.state.totalTrades < this.config.minTradesForAnalysis) {
      return []; // Not enough trades for meaningful recommendations
    }
    
    const recommendations = [];
    
    // Edge decay recommendations
    if (this.state.edgeMetrics.edgeDecayDetected) {
      recommendations.push({
        type: 'warning',
        aspect: 'edge_decay',
        priority: 'high',
        message: 'Trading edge decay detected. Consider adjusting strategy parameters.',
        confidence: this.state.edgeMetrics.edgeDecay,
        suggestedAction: 'Increase confidence threshold or take a trading break'
      });
    }
    
    // Quality score recommendations
    if (this.state.averageQuality < 70 && this.state.qualityScores.length >= 10) {
      recommendations.push({
        type: 'improvement',
        aspect: 'trade_quality',
        priority: 'medium',
        message: `Average trade quality (${this.state.averageQuality.toFixed(1)}/100) below optimal level.`,
        confidence: 0.8,
        suggestedAction: 'Review recent trade entries and exits for improvement opportunities'
      });
    }
    
    // Pattern recommendations
    const ineffectivePatterns = this.identifyIneffectivePatterns();
    if (ineffectivePatterns.length > 0) {
      recommendations.push({
        type: 'improvement',
        aspect: 'pattern_performance',
        priority: 'medium',
        message: `Identified ${ineffectivePatterns.length} underperforming patterns.`,
        confidence: 0.75,
        suggestedAction: 'Consider avoiding these pattern types or increasing entry criteria',
        details: ineffectivePatterns
      });
    }
    
    // Store and return recommendations
    this.state.recommendations = recommendations;
    this.state.lastAnalysisTime = Date.now();
    
    return recommendations;
  }
  
  /**
   * Identify ineffective trading patterns
   * 
   * @returns {Array} Ineffective patterns
   */
  identifyIneffectivePatterns() {
    const ineffective = [];
    
    // Check each pattern with sufficient trades
    Object.entries(this.state.patternPerformance).forEach(([key, stats]) => {
      if (stats.trades >= 5 && stats.winRate < 0.4) {
        ineffective.push({
          patternKey: key,
          trades: stats.trades,
          winRate: stats.winRate,
          avgPnL: stats.totalPnL / stats.trades,
          direction: stats.direction,
          lastSeen: stats.lastSeen
        });
      }
    });
    
    return ineffective;
  }
  
  /**
   * Get quality category for a score
   * 
   * @param {number} score - Quality score
   * @returns {string} Quality category
   */
  getQualityCategory(score) {
    if (score >= 90) return 'excellent';
    if (score >= 80) return 'good';
    if (score >= 70) return 'satisfactory';
    if (score >= 60) return 'needs improvement';
    if (score >= 50) return 'poor';
    return 'critical';
  }
  
  /**
   * Get recent trade summaries
   * 
   * @param {number} count - Number of trades to summarize
   * @returns {Array} Recent trade summaries
   */
  getRecentTrades(count = 10) {
    const recentTrades = this.state.tradeHistory
      .slice(-count)
      .map(trade => ({
        id: trade.id,
        time: trade.exitTime,
        direction: trade.direction,
        pnl: trade.pnl,
        profitable: trade.profitable,
        holdTimeMin: trade.holdTimeMin,
        qualityScore: trade.qualityScore,
        qualityCategory: this.getQualityCategory(trade.qualityScore)
      }));
    
    return recentTrades;
  }
  
  /**
   * Get top performing patterns
   * 
   * @param {number} count - Number of patterns to return
   * @returns {Array} Top performing patterns
   */
  getTopPatterns(count = 5) {
    return Object.entries(this.state.patternPerformance)
      .filter(([_, stats]) => stats.trades >= 3)
      .sort((a, b) => b[1].winRate - a[1].winRate)
      .slice(0, count)
      .map(([key, stats]) => ({
        patternKey: key.substring(0, 20) + '...',
        trades: stats.trades,
        winRate: stats.winRate,
        avgPnL: stats.totalPnL / stats.trades,
        direction: stats.direction
      }));
  }
  
  /**
   * Get performance summary
   * 
   * @returns {Object} Performance summary
   */
  getPerformanceSummary() {
    return {
      trades: {
        total: this.state.totalTrades,
        winning: this.state.winningTrades,
        losing: this.state.losingTrades,
        winRate: this.state.totalTrades > 0 ? 
                (this.state.winningTrades / this.state.totalTrades) : 0
      },
      pnl: {
        total: this.state.totalPnL,
        average: this.state.totalTrades > 0 ?
                (this.state.totalPnL / this.state.totalTrades) : 0
      },
      quality: {
        average: this.state.averageQuality,
        category: this.getQualityCategory(this.state.averageQuality)
      },
      edge: {
        decay: this.state.edgeMetrics.edgeDecay,
        decayDetected: this.state.edgeMetrics.edgeDecayDetected
      },
      recommendations: this.state.recommendations.length
    };
  }
  
  /**
   * Save analysis data to file
   * 
   * @returns {boolean} Success status
   */
  saveToFile() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Ensure directory exists
      const dataDir = path.dirname(this.config.performanceDbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Save performance data
      const performanceData = {
        timestamp: new Date().toISOString(),
        summary: this.getPerformanceSummary(),
        edgeMetrics: this.state.edgeMetrics,
        recommendations: this.state.recommendations,
        patternStats: Object.keys(this.state.patternPerformance).length
      };
      
      fs.writeFileSync(
        this.config.performanceDbPath,
        JSON.stringify(performanceData, null, 2),
        'utf8'
      );
      
      return true;
    } catch (err) {
      this.log(`Error saving analysis data: ${err.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Load analysis data from file
   * 
   * @returns {boolean} Success status
   */
  loadFromFile() {
    try {
      const fs = require('fs');
      
      if (!fs.existsSync(this.config.performanceDbPath)) {
        return false;
      }
      
      const data = JSON.parse(fs.readFileSync(this.config.performanceDbPath, 'utf8'));
      
      // Restore state from saved data
      if (data.edgeMetrics) {
        this.state.edgeMetrics = data.edgeMetrics;
      }
      
      if (data.recommendations) {
        this.state.recommendations = data.recommendations;
      }
      
      return true;
    } catch (err) {
      this.log(`Error loading analysis data: ${err.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Logging with severity levels
   * 
   * @param {string} message - Log message
   * @param {string} level - Log level
   */
  log(message, level = 'info') {
    // Only log debug messages if verbose logging is enabled
    if (level === 'debug' && !this.config.verboseLogging) {
      return;
    }
    
    // Format based on severity
    let prefix = '🔄';
    
    switch (level) {
      case 'error':
        prefix = '❌';
        break;
      case 'warning':
        prefix = '⚠️';
        break;
      case 'info':
        prefix = 'ℹ️';
        break;
      case 'debug':
        prefix = '🔍';
        break;
    }
    
    console.log(`${prefix} [PerformanceAnalyzer] ${message}`);
  }
}

module.exports = PerformanceAnalyzer;

/**
 * ============================================================================
 * USAGE EXAMPLES FOR DEVELOPMENT TEAM
 * ============================================================================
 * 
 * // 1. INITIALIZE PERFORMANCE ANALYZER
 * const PerformanceAnalyzer = require('./core/PerformanceAnalyzer');
 * 
 * const analyzer = new PerformanceAnalyzer({
 *   minTradesForAnalysis: 20,
 *   edgeDecayLookback: 50,
 *   tradesDbPath: './data/trades_analysis.json'
 * });
 * 
 * // 2. PROCESS TRADE FOR ANALYSIS
 * const tradeResult = {
 *   entryPrice: 50000,
 *   exitPrice: 50250,
 *   entryTime: new Date('2025-06-16T10:00:00Z'),
 *   exitTime: new Date('2025-06-16T10:15:00Z'),
 *   pnl: 250,
 *   direction: 'buy',
 *   entryReason: 'Pattern match with high confidence',
 *   exitReason: 'Take profit target reached'
 * };
 * 
 * const analysisData = {
 *   patternEvaluation: {
 *     confidence: 0.85,
 *     direction: 'buy',
 *     exactMatch: true
 *   },
 *   trend: 'uptrend',
 *   rsi: 35,
 *   srLevels: [
 *     { price: 49800, type: 'support' },
 *     { price: 50500, type: 'resistance' }
 *   ]
 * };
 * 
 * const assessment = analyzer.processTrade(tradeResult, analysisData);
 * console.log(`Trade quality: ${assessment.qualityScore}/100`);
 * console.log(`Category: ${assessment.qualityCategory}`);
 * 
 * // 3. CHECK FOR EDGE DECAY
 * const edgeStatus = analyzer.detectEdgeDecay();
 * if (edgeStatus.detected) {
 *   console.log('⚠️ Trading edge decay detected!');
 *   console.log(`Decay amount: ${(edgeStatus.decayAmount * 100).toFixed(1)}%`);
 * }
 * 
 * // 4. GET PERFORMANCE SUMMARY
 * const summary = analyzer.getPerformanceSummary();
 * console.log(`Win rate: ${(summary.trades.winRate * 100).toFixed(1)}%`);
 * console.log(`Average quality: ${summary.quality.average.toFixed(1)}/100`);
 * 
 * // 5. GET RECOMMENDATIONS
 * const recommendations = analyzer.generateRecommendations();
 * recommendations.forEach(rec => {
 *   console.log(`${rec.priority.toUpperCase()}: ${rec.message}`);
 *   console.log(`Suggested action: ${rec.suggestedAction}`);
 * });
 * 
 * ============================================================================
 */