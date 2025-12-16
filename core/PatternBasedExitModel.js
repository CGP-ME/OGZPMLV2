/**
 * PatternBasedExitModel.js - Pattern-Driven Exit Decision Engine
 * ==============================================================
 *
 * This module ENHANCES exit decisions based on:
 * 1. Pattern-predicted profit targets (historical avg gain)
 * 2. Pattern-detected reversal signals
 * 3. Dynamic trailing stop adjustment based on pattern behavior
 * 4. Exit confluence from multiple pattern signals
 * 5. Regime-aware exit timing
 *
 * Works WITH MaxProfitManager - doesn't replace it, enhances it.
 */

class PatternBasedExitModel {
  constructor(options = {}) {
    this.config = {
      // Pattern Exit Thresholds
      minPatternExitConfidence: options.minPatternExitConfidence || 0.60,
      minReversalConfidence: options.minReversalConfidence || 0.65,

      // Target Adjustment Settings
      enablePatternTargets: options.enablePatternTargets !== false,
      targetConfidenceWeight: options.targetConfidenceWeight || 0.3,
      minTargetAdjustment: options.minTargetAdjustment || 0.8,
      maxTargetAdjustment: options.maxTargetAdjustment || 1.5,

      // Stop Adjustment Settings
      enablePatternStops: options.enablePatternStops !== false,
      stopConfidenceWeight: options.stopConfidenceWeight || 0.25,
      minStopAdjustment: options.minStopAdjustment || 0.7,
      maxStopAdjustment: options.maxStopAdjustment || 1.3,

      // Trailing Stop Pattern Adjustment
      enablePatternTrailing: options.enablePatternTrailing !== false,
      patternTrailWeight: options.patternTrailWeight || 0.2,

      // Reversal Detection
      enableReversalDetection: options.enableReversalDetection !== false,
      reversalPatterns: options.reversalPatterns || [
        'double_top', 'double_bottom', 'head_shoulders', 'inv_head_shoulders',
        'evening_star', 'morning_star', 'bearish_engulfing', 'bullish_engulfing',
        'shooting_star', 'hammer', 'doji_star', 'dark_cloud', 'piercing_line'
      ],
      reversalExitPercent: options.reversalExitPercent || 0.5,

      // Momentum Exhaustion Detection
      enableMomentumExhaustion: options.enableMomentumExhaustion !== false,
      exhaustionThreshold: options.exhaustionThreshold || 0.7,

      // Regime-Based Exit Adjustments
      enableRegimeExits: options.enableRegimeExits !== false,
      regimeExitMultipliers: options.regimeExitMultipliers || {
        'trending': 1.2,
        'ranging': 0.7,
        'volatile': 0.8,
        'breakout': 1.1,
        'unknown': 1.0
      },

      // Profit Protection Thresholds
      profitProtectionTiers: options.profitProtectionTiers || [
        { profit: 0.005, protect: 0.3 },
        { profit: 0.010, protect: 0.5 },
        { profit: 0.015, protect: 0.7 },
        { profit: 0.020, protect: 0.85 }
      ],

      ...options
    };

    // State tracking
    this.activePosition = null;
    this.detectedReversals = [];
    this.exitSignals = [];

    // Stats
    this.stats = {
      evaluations: 0,
      exitSignalsGenerated: 0,
      reversalsDetected: 0,
      targetAdjustments: 0,
      stopAdjustments: 0,
      patternExits: 0
    };

    console.log('🎯 PatternBasedExitModel initialized');
  }

  /**
   * Start tracking a position for pattern-based exits
   */
  startTracking(position) {
    this.activePosition = {
      entryPrice: position.entryPrice,
      direction: position.direction?.toLowerCase() || 'buy',
      entryTime: position.entryTime || Date.now(),
      size: position.size || 1,
      entryPatterns: position.patterns || [],
      entryConfidence: position.confidence || 0.5,
      highestProfit: 0,
      lowestProfit: 0,
      patternTargetHit: false,
      reversalDetected: false,
      exhaustionDetected: false
    };

    // Calculate pattern-predicted target based on entry patterns
    this.activePosition.patternTarget = this.calculatePatternTarget(position.patterns);
    this.activePosition.patternStop = this.calculatePatternStop(position.patterns);

    console.log(`🎯 Exit tracking: ${position.direction?.toUpperCase()} @ ${position.entryPrice}`);
    console.log(`   Target: ${(this.activePosition.patternTarget * 100).toFixed(2)}%`);
    console.log(`   Stop: ${(this.activePosition.patternStop * 100).toFixed(2)}%`);

    return {
      patternTarget: this.activePosition.patternTarget,
      patternStop: this.activePosition.patternStop
    };
  }

  /**
   * Main Exit Evaluation - Should we exit or adjust?
   */
  evaluateExit(params) {
    const {
      currentPrice,
      currentPatterns,
      indicators,
      regime,
      profitPercent,
      maxProfitManagerState
    } = params;

    this.stats.evaluations++;

    if (!this.activePosition) {
      return { action: 'none', reason: 'No active position' };
    }

    const decision = {
      action: 'hold',
      exitRecommended: false,
      exitUrgency: 'low',
      exitPercent: 0,
      reasons: [],
      warnings: [],
      adjustments: {
        targetMultiplier: 1.0,
        stopMultiplier: 1.0,
        trailMultiplier: 1.0
      },
      patternSignals: [],
      reversalDetected: false,
      exhaustionDetected: false,
      timestamp: Date.now()
    };

    // Track profit extremes
    if (profitPercent > this.activePosition.highestProfit) {
      this.activePosition.highestProfit = profitPercent;
    }
    if (profitPercent < this.activePosition.lowestProfit) {
      this.activePosition.lowestProfit = profitPercent;
    }

    // Check for reversal patterns
    if (this.config.enableReversalDetection && currentPatterns) {
      const reversalCheck = this.checkReversalPatterns(currentPatterns, this.activePosition.direction);
      if (reversalCheck.detected) {
        decision.reversalDetected = true;
        decision.exitRecommended = true;
        decision.exitUrgency = reversalCheck.urgency;
        decision.exitPercent = Math.max(decision.exitPercent, this.config.reversalExitPercent);
        decision.reasons.push(`Reversal: ${reversalCheck.pattern} (${(reversalCheck.confidence * 100).toFixed(0)}%)`);
        this.stats.reversalsDetected++;
      }
    }

    // Check momentum exhaustion
    if (this.config.enableMomentumExhaustion && indicators) {
      const exhaustionCheck = this.checkMomentumExhaustion(indicators, this.activePosition.direction, profitPercent);
      if (exhaustionCheck.detected) {
        decision.exhaustionDetected = true;
        decision.exitRecommended = true;
        decision.exitUrgency = this.combineUrgency(decision.exitUrgency, exhaustionCheck.urgency);
        decision.exitPercent = Math.max(decision.exitPercent, 0.3);
        decision.reasons.push(`Exhaustion: ${exhaustionCheck.reason}`);
      }
    }

    // Check pattern target
    if (this.config.enablePatternTargets && profitPercent > 0) {
      if (profitPercent >= this.activePosition.patternTarget) {
        decision.exitRecommended = true;
        decision.exitPercent = Math.max(decision.exitPercent, 0.4);
        decision.reasons.push(`Target hit: ${(profitPercent * 100).toFixed(2)}%`);
        this.activePosition.patternTargetHit = true;
      }
    }

    // Adjust stops based on patterns
    if (this.config.enablePatternStops) {
      const stopAdjustment = this.evaluatePatternStop(profitPercent, currentPatterns);
      decision.adjustments.stopMultiplier = stopAdjustment.stopMultiplier;
      if (stopAdjustment.tighten) {
        this.stats.stopAdjustments++;
      }
    }

    // Adjust trailing based on patterns
    if (this.config.enablePatternTrailing && profitPercent > 0) {
      const trailAdjustment = this.evaluatePatternTrailing(profitPercent, currentPatterns);
      decision.adjustments.trailMultiplier = trailAdjustment.trailMultiplier;
    }

    // Apply regime adjustments
    if (this.config.enableRegimeExits && regime) {
      const regimeMultiplier = this.config.regimeExitMultipliers[regime] || 1.0;
      if (regimeMultiplier < 1.0 && decision.exitRecommended) {
        decision.exitUrgency = this.combineUrgency(decision.exitUrgency, 'medium');
        decision.exitPercent = Math.min(1.0, decision.exitPercent * (1 / regimeMultiplier));
        decision.reasons.push(`${regime} regime`);
      }
      decision.adjustments.trailMultiplier *= regimeMultiplier;
    }

    // Check profit protection
    const protectionLevel = this.getProtectionLevel(profitPercent);
    if (protectionLevel > 0 && this.activePosition.highestProfit > profitPercent * 1.2) {
      decision.exitRecommended = true;
      decision.exitUrgency = this.combineUrgency(decision.exitUrgency, 'high');
      decision.exitPercent = Math.max(decision.exitPercent, protectionLevel);
      decision.reasons.push(`Protecting gains from ${(this.activePosition.highestProfit * 100).toFixed(2)}%`);
    }

    // Set final action
    if (decision.exitRecommended) {
      decision.action = decision.exitUrgency === 'critical' ? 'exit_urgent' : 'exit_signal';
      this.stats.exitSignalsGenerated++;
      if (decision.exitPercent >= 1.0) {
        this.stats.patternExits++;
      }
    } else if (decision.adjustments.stopMultiplier !== 1.0 ||
               decision.adjustments.targetMultiplier !== 1.0) {
      decision.action = 'adjust';
    }

    return decision;
  }

  /**
   * Calculate pattern-predicted profit target
   */
  calculatePatternTarget(patterns) {
    if (!patterns || patterns.length === 0) {
      return 0.015; // Default 1.5%
    }

    let totalWeight = 0;
    let weightedTarget = 0;

    patterns.forEach(pattern => {
      const stats = pattern.stats || pattern;
      const avgGain = stats.avgPnL || stats.averageGain || 0.01;
      const winRate = stats.winRate || (stats.wins / stats.timesSeen) || 0.5;
      const occurrences = stats.timesSeen || stats.occurrences || 1;

      const weight = occurrences * winRate;

      if (avgGain > 0) {
        weightedTarget += avgGain * weight;
        totalWeight += weight;
      }
    });

    if (totalWeight === 0) return 0.015;

    const patternTarget = weightedTarget / totalWeight;
    return Math.max(0.005, Math.min(0.05, patternTarget));
  }

  /**
   * Calculate pattern-predicted stop distance
   */
  calculatePatternStop(patterns) {
    if (!patterns || patterns.length === 0) {
      return 0.02; // Default 2%
    }

    let totalWeight = 0;
    let weightedStop = 0;

    patterns.forEach(pattern => {
      const stats = pattern.stats || pattern;
      const maxDrawdown = stats.maxDrawdown || stats.avgDrawdown || 0.015;
      const winRate = stats.winRate || 0.5;
      const occurrences = stats.timesSeen || 1;

      const weight = occurrences * winRate;
      weightedStop += maxDrawdown * 1.2 * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) return 0.02;

    const patternStop = weightedStop / totalWeight;
    return Math.max(0.01, Math.min(0.05, patternStop));
  }

  /**
   * Check for reversal patterns
   */
  checkReversalPatterns(currentPatterns, direction) {
    const result = {
      detected: false,
      pattern: null,
      confidence: 0,
      urgency: 'low'
    };

    if (!currentPatterns || currentPatterns.length === 0) return result;

    const bearishReversals = ['double_top', 'head_shoulders', 'evening_star',
                             'bearish_engulfing', 'shooting_star', 'dark_cloud'];
    const bullishReversals = ['double_bottom', 'inv_head_shoulders', 'morning_star',
                             'bullish_engulfing', 'hammer', 'piercing_line'];

    const relevantReversals = direction === 'buy' ? bearishReversals : bullishReversals;

    for (const pattern of currentPatterns) {
      const patternType = (pattern.type || pattern.name || '').toLowerCase().replace(/\s+/g, '_');

      if (relevantReversals.some(r => patternType.includes(r))) {
        const confidence = pattern.confidence || pattern.stats?.winRate || 0.6;

        if (confidence >= this.config.minReversalConfidence) {
          result.detected = true;
          result.pattern = patternType;
          result.confidence = confidence;
          result.urgency = confidence >= 0.8 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
          break;
        }
      }
    }

    return result;
  }

  /**
   * Check for momentum exhaustion
   */
  checkMomentumExhaustion(indicators, direction, profitPercent) {
    const result = {
      detected: false,
      reason: '',
      urgency: 'low'
    };

    if (profitPercent <= 0) return result;

    const rsi = indicators.rsi;
    const macd = indicators.macd;

    if (direction === 'buy') {
      if (rsi && rsi > 75) {
        result.detected = true;
        result.reason = `RSI overbought (${rsi.toFixed(1)})`;
        result.urgency = rsi > 85 ? 'high' : 'medium';
      }

      if (macd && macd.histogram < 0 && macd.previousHistogram > 0) {
        result.detected = true;
        result.reason = 'MACD bearish cross';
        result.urgency = 'medium';
      }
    } else {
      if (rsi && rsi < 25) {
        result.detected = true;
        result.reason = `RSI oversold (${rsi.toFixed(1)})`;
        result.urgency = rsi < 15 ? 'high' : 'medium';
      }

      if (macd && macd.histogram > 0 && macd.previousHistogram < 0) {
        result.detected = true;
        result.reason = 'MACD bullish cross';
        result.urgency = 'medium';
      }
    }

    return result;
  }

  /**
   * Evaluate pattern-based stop adjustment
   */
  evaluatePatternStop(profitPercent, currentPatterns) {
    const result = {
      stopMultiplier: 1.0,
      tighten: false
    };

    if (profitPercent > 0.005) {
      const protectionLevel = this.getProtectionLevel(profitPercent);
      if (protectionLevel > 0) {
        result.stopMultiplier = Math.max(this.config.minStopAdjustment, 1 - protectionLevel * 0.3);
        result.tighten = true;
      }
    }

    if (currentPatterns && currentPatterns.length > 0) {
      const volatilityFromPatterns = this.assessPatternVolatility(currentPatterns);

      if (volatilityFromPatterns > 1.2) {
        result.stopMultiplier = Math.min(this.config.maxStopAdjustment, result.stopMultiplier * 1.1);
      } else if (volatilityFromPatterns < 0.8) {
        result.stopMultiplier = Math.max(this.config.minStopAdjustment, result.stopMultiplier * 0.9);
        result.tighten = true;
      }
    }

    return result;
  }

  /**
   * Evaluate pattern-based trailing adjustment
   */
  evaluatePatternTrailing(profitPercent, currentPatterns) {
    const result = {
      trailMultiplier: 1.0
    };

    if (profitPercent > 0.02) {
      result.trailMultiplier = 0.7;
    } else if (profitPercent > 0.01) {
      result.trailMultiplier = 0.85;
    }

    if (currentPatterns && currentPatterns.length > 0) {
      const continuationStrength = this.assessContinuationStrength(currentPatterns, this.activePosition.direction);

      if (continuationStrength > 0.7) {
        result.trailMultiplier *= 1.2;
      } else if (continuationStrength < 0.3) {
        result.trailMultiplier *= 0.8;
      }
    }

    result.trailMultiplier = Math.max(0.5, Math.min(1.5, result.trailMultiplier));
    return result;
  }

  /**
   * Assess continuation strength from patterns
   */
  assessContinuationStrength(patterns, direction) {
    if (!patterns || patterns.length === 0) return 0.5;

    let continuationScore = 0;
    let totalWeight = 0;

    const bullishContinuation = ['bull_flag', 'ascending_triangle', 'cup_handle', 'rising_wedge'];
    const bearishContinuation = ['bear_flag', 'descending_triangle', 'falling_wedge'];

    const relevantPatterns = direction === 'buy' ? bullishContinuation : bearishContinuation;

    patterns.forEach(pattern => {
      const patternType = (pattern.type || pattern.name || '').toLowerCase().replace(/\s+/g, '_');
      const confidence = pattern.confidence || 0.5;

      if (relevantPatterns.some(r => patternType.includes(r))) {
        continuationScore += confidence;
        totalWeight += 1;
      }
    });

    return totalWeight > 0 ? continuationScore / totalWeight : 0.5;
  }

  /**
   * Assess volatility from pattern history
   */
  assessPatternVolatility(patterns) {
    if (!patterns || patterns.length === 0) return 1.0;

    let totalVolatility = 0;
    let count = 0;

    patterns.forEach(pattern => {
      const stats = pattern.stats || pattern;
      if (stats.avgVolatility || stats.volatility) {
        totalVolatility += stats.avgVolatility || stats.volatility;
        count++;
      }
    });

    return count > 0 ? totalVolatility / count : 1.0;
  }

  /**
   * Get profit protection level
   */
  getProtectionLevel(profitPercent) {
    for (let i = this.config.profitProtectionTiers.length - 1; i >= 0; i--) {
      const tier = this.config.profitProtectionTiers[i];
      if (profitPercent >= tier.profit) {
        return tier.protect;
      }
    }
    return 0;
  }

  /**
   * Combine urgency levels
   */
  combineUrgency(current, additional) {
    const levels = ['low', 'medium', 'high', 'critical'];
    const currentIndex = levels.indexOf(current);
    const additionalIndex = levels.indexOf(additional);
    return levels[Math.max(currentIndex, additionalIndex)];
  }

  /**
   * Stop tracking the current position
   */
  stopTracking(result = {}) {
    if (this.activePosition) {
      console.log(`🎯 Exit tracking stopped. P&L: ${(result.pnl || 0).toFixed(2)}`);
    }

    this.activePosition = null;
    this.detectedReversals = [];
    this.exitSignals = [];
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      exitSignalRate: this.stats.evaluations > 0
        ? `${(this.stats.exitSignalsGenerated / this.stats.evaluations * 100).toFixed(1)}%`
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      evaluations: 0,
      exitSignalsGenerated: 0,
      reversalsDetected: 0,
      targetAdjustments: 0,
      stopAdjustments: 0,
      patternExits: 0
    };
  }
}

module.exports = PatternBasedExitModel;