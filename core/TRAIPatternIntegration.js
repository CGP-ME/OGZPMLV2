/**
 * TRAI Pattern Integration Layer
 * ══════════════════════════════════════════════════════════════
 * 
 * Loads pattern packs from the Pattern Harvester and applies
 * confidence boost/penalty multipliers to incoming trade signals.
 * 
 * Wires into TRAIDecisionModule as a pre-processor.
 * 
 * Usage:
 *   const patterns = new TRAIPatternIntegration('./pattern-pack.json');
 *   const adjusted = patterns.evaluate(signal, tradeContext);
 *   // adjusted.confidenceMultiplier = 1.83 (boosted)
 *   // adjusted.matchedPatterns = ['PAT-1', 'PAT-5']
 *   // adjusted.matchedAntiPatterns = ['ANTI-9']
 */
'use strict';

const fs = require('fs');
const path = require('path');

class TRAIPatternIntegration {
  constructor(patternPackPath = null) {
    this.patterns = [];
    this.antiPatterns = [];
    this.metadata = {};
    this.loaded = false;

    if (patternPackPath) {
      this.load(patternPackPath);
    }
  }

  /**
   * Load pattern pack from JSON file
   */
  load(filepath) {
    try {
      const fullPath = path.resolve(filepath);
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ Pattern pack not found: ${fullPath}`);
        return false;
      }

      const pack = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      this.patterns = pack.patterns || [];
      this.antiPatterns = pack.antiPatterns || [];
      this.metadata = {
        version: pack.version,
        generated: pack.generated,
        source: pack.source,
        totalTrades: pack.totalTrades,
        filters: pack.filters,
      };
      this.loaded = true;

      console.log(`📊 TRAI Pattern Pack loaded: ${this.patterns.length} patterns, ${this.antiPatterns.length} anti-patterns`);
      console.log(`   Source: ${pack.source} | Generated: ${pack.generated}`);
      return true;
    } catch (e) {
      console.error(`❌ Failed to load pattern pack: ${e.message}`);
      return false;
    }
  }

  /**
   * Evaluate a trade signal against loaded patterns
   * 
   * @param {Object} signal - The trade signal from strategy
   *   { direction, confidence, strategy, ... }
   * @param {Object} context - Current market context
   *   { entryPrice, timestamp, holdEstimate, confidenceTier, session, dayOfWeek }
   * @returns {Object} - Pattern evaluation result
   */
  evaluate(signal, context = {}) {
    if (!this.loaded || this.patterns.length === 0) {
      return {
        confidenceMultiplier: 1.0,
        matchedPatterns: [],
        matchedAntiPatterns: [],
        patternBoost: 0,
        patternPenalty: 0,
        recommendation: 'neutral',
      };
    }

    // Build dimension values from signal + context
    const dims = this._extractDimensions(signal, context);

    // Match against patterns
    const matchedPatterns = [];
    const matchedAntiPatterns = [];
    let totalBoost = 1.0;
    let totalPenalty = 1.0;

    for (const pattern of this.patterns) {
      if (this._matchesDimensions(pattern.dimensions, dims)) {
        matchedPatterns.push({
          id: pattern.id,
          dimensions: pattern.dimensions,
          stats: pattern.stats,
          boost: pattern.confidenceBoost,
        });
        totalBoost = Math.max(totalBoost, pattern.confidenceBoost);
      }
    }

    for (const anti of this.antiPatterns) {
      if (this._matchesDimensions(anti.dimensions, dims)) {
        matchedAntiPatterns.push({
          id: anti.id,
          dimensions: anti.dimensions,
          stats: anti.stats,
          penalty: anti.confidencePenalty,
        });
        totalPenalty = Math.min(totalPenalty, anti.confidencePenalty);
      }
    }

    // Net multiplier: best boost * worst penalty
    // If anti-patterns dominate, multiplier drops below 1.0
    const netMultiplier = totalBoost * totalPenalty;

    // Recommendation
    let recommendation = 'neutral';
    if (matchedPatterns.length > 0 && matchedAntiPatterns.length === 0) {
      recommendation = 'boost';
    } else if (matchedAntiPatterns.length > 0 && matchedPatterns.length === 0) {
      recommendation = 'reduce';
    } else if (matchedPatterns.length > 0 && matchedAntiPatterns.length > 0) {
      recommendation = netMultiplier >= 1.0 ? 'cautious_boost' : 'cautious_reduce';
    }

    return {
      confidenceMultiplier: Number(netMultiplier.toFixed(3)),
      matchedPatterns,
      matchedAntiPatterns,
      patternBoost: Number(totalBoost.toFixed(3)),
      patternPenalty: Number(totalPenalty.toFixed(3)),
      recommendation,
      adjustedConfidence: signal.confidence ? Number((signal.confidence * netMultiplier).toFixed(1)) : null,
    };
  }

  /**
   * Extract dimension values from signal and context
   */
  _extractDimensions(signal, context) {
    const dims = {};

    // Direction
    dims.direction = signal.direction || context.direction || 'unknown';

    // Session (from timestamp)
    if (context.timestamp || context.entryTime) {
      const d = new Date(context.timestamp || context.entryTime);
      const utcHour = d.getUTCHours();
      const etHour = ((utcHour - 4) + 24) % 24;
      
      if (etHour >= 9 && etHour < 10) dims.session = 'open';
      else if (etHour >= 10 && etHour < 12) dims.session = 'morning';
      else if (etHour >= 12 && etHour < 14) dims.session = 'midday';
      else if (etHour >= 14 && etHour < 16) dims.session = 'afternoon';
      else dims.session = 'extended';

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      dims.dayOfWeek = dayNames[d.getUTCDay()];
    }
    if (context.session) dims.session = context.session;
    if (context.dayOfWeek) dims.dayOfWeek = context.dayOfWeek;

    // Confidence tier
    const conf = signal.confidence || context.confidence || 0;
    if (conf >= 90) dims.confTier = 'max';
    else if (conf >= 75) dims.confTier = 'high';
    else if (conf >= 60) dims.confTier = 'mid';
    else dims.confTier = 'low';

    // Hold bucket (estimated or from context)
    if (context.holdEstimate || context.holdMins) {
      const hold = context.holdEstimate || context.holdMins;
      if (hold <= 30) dims.holdBucket = 'scalp';
      else if (hold <= 120) dims.holdBucket = 'short';
      else if (hold <= 480) dims.holdBucket = 'swing';
      else dims.holdBucket = 'extended';
    }

    // Price bucket
    const price = context.entryPrice || signal.price || 0;
    if (price > 0) {
      if (price < 250) dims.priceBucket = 'low';
      else if (price < 350) dims.priceBucket = 'mid';
      else if (price < 450) dims.priceBucket = 'high';
      else dims.priceBucket = 'premium';
    }

    return dims;
  }

  /**
   * Check if trade dimensions match a pattern's required dimensions
   */
  _matchesDimensions(patternDims, tradeDims) {
    for (const [key, value] of Object.entries(patternDims)) {
      if (tradeDims[key] === undefined) return false;
      if (tradeDims[key] !== value) return false;
    }
    return true;
  }

  /**
   * Refresh patterns from file (call periodically or after new backtests)
   */
  refresh(filepath) {
    console.log('🔄 Refreshing TRAI pattern pack...');
    return this.load(filepath);
  }

  /**
   * Get summary stats
   */
  getStats() {
    return {
      loaded: this.loaded,
      patterns: this.patterns.length,
      antiPatterns: this.antiPatterns.length,
      metadata: this.metadata,
      topPattern: this.patterns.length > 0 ? {
        id: this.patterns[0].id,
        dimensions: this.patterns[0].dimensions,
        edgeScore: this.patterns[0].stats?.edgeScore,
        boost: this.patterns[0].confidenceBoost,
      } : null,
      worstAntiPattern: this.antiPatterns.length > 0 ? {
        id: this.antiPatterns[0].id,
        dimensions: this.antiPatterns[0].dimensions,
        penalty: this.antiPatterns[0].confidencePenalty,
      } : null,
    };
  }
}

module.exports = TRAIPatternIntegration;
