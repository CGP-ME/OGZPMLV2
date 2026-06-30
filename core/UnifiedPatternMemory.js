/**
 * UnifiedPatternMemory.js - Single Source of Truth for Pattern Learning
 * =====================================================================
 * 
 * REPLACES:
 *   - PatternMemorySystem (inside EnhancedPatternRecognition.js)
 *   - PatternMemoryStore.js (TRAI's separate store)
 * 
 * PROBLEM SOLVED:
 *   The trading pipeline recorded patterns to PatternMemorySystem.
 *   TRAI read patterns from PatternMemoryStore.
 *   They were two separate stores with different data, different matching
 *   algorithms, and different formats. Patterns never reached TRAI.
 * 
 * NOW:
 *   One store. Pipeline writes to it. TRAI reads from it. DTW matching
 *   and exact signature matching both available. Promotion, quarantine,
 *   and decay all in one place.
 * 
 * ARCHITECTURE:
 *   ┌─────────────────┐     ┌──────────────────────┐
 *   │  TradingLoop     │────▶│  UnifiedPatternMemory │
 *   │  (records PnL)   │     │                        │
 *   └─────────────────┘     │  ┌──────────────────┐  │
 *                            │  │  Observation Pool │  │  (all detected patterns)
 *   ┌─────────────────┐     │  └──────────────────┘  │
 *   │  EnhancedPattern │────▶│  ┌──────────────────┐  │
 *   │  Recognition      │     │  │  Outcome Store    │  │  (patterns with PnL)
 *   └─────────────────┘     │  └──────────────────┘  │
 *                            │  ┌──────────────────┐  │
 *   ┌─────────────────┐     │  │  Promoted Patterns│  │  (statistically proven)
 *   │  TRAI Decision   │◀───│  └──────────────────┘  │
 *   │  Module           │     │  ┌──────────────────┐  │
 *   └─────────────────┘     │  │  Quarantined      │  │  (proven losers)
 *                            │  └──────────────────┘  │
 *   ┌─────────────────┐     │  ┌──────────────────┐  │
 *   │  DTW Matcher      │◀──▶│  │  Similarity Index │  │  (fuzzy matching)
 *   └─────────────────┘     │  └──────────────────┘  │
 *                            └──────────────────────┘
 * 
 * LIFECYCLE:
 *   1. OBSERVE:  Pattern detected → recordObservation(features, scopedMetadata)
 *   2. OUTCOME:  Trade closes    → recordOutcome(features, scopedOutcome)
 *   3. QUERY:    New signal      → getConfidence(features, scope) → boost/kill/neutral
 *   4. PROMOTE:  10+ trades, >65% WR → promoted (high confidence in future)
 *   5. QUARANTINE: 10+ trades, <35% WR → quarantined (blocked from trading)
 *   6. DECAY:    Old patterns lose weight over time
 *   7. PRUNE:    Patterns with <3 trades older than 90 days get deleted
 * 
 * CONFIG:
 *   Runtime tunables are owned by TradingConfig.patternMemory.
 *   This module must not read PATTERN_* env vars or invent local fallback values.
 * 
 * @module core/UnifiedPatternMemory
 * @author Claude (Opus) for Trey / OGZPrime
 * @date 2026-03-17
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { normalizePatternScope } = require('./PatternScope');
const TradingConfig = require('./TradingConfig');
const { deriveReportAssetSlugFromDataFile } = require('./DataFileInstrument');

// ═══════════════════════════════════════════════════════════════
// DTW (Dynamic Time Warping) — fuzzy pattern matching
// ═══════════════════════════════════════════════════════════════

function normalize(series) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  if (max === min) return series.map(() => 0.5);
  return series.map(v => (v - min) / (max - min));
}

function dynamicTimeWarping(seriesA, seriesB) {
  const n = seriesA.length;
  const m = seriesB.length;
  const dtw = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const windowStart = Math.max(1, i - 20);
    const windowEnd = Math.min(m, i + 20);
    for (let j = windowStart; j <= windowEnd; j++) {
      const cost = Math.abs(seriesA[i - 1] - seriesB[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }
  return dtw[n][m];
}

// ═══════════════════════════════════════════════════════════════
// FEATURE SIGNATURE — deterministic hash of feature vector
// ═══════════════════════════════════════════════════════════════

function computeSignature(features) {
  if (!Array.isArray(features) || features.length === 0) return null;
  // Quantize to 2 decimal places for grouping similar patterns
  const quantized = features.map(f => {
    if (typeof f !== 'number' || !isFinite(f)) return '0.00';
    return Math.max(-999, Math.min(999, f)).toFixed(2);
  }).join(',');
  return crypto.createHash('md5').update(quantized).digest('hex').substring(0, 12);
}

function buildDefaultStats() {
  return {
    observations: 0,
    outcomes: 0,
    promoted: 0,
    quarantined: 0,
    dtwMatches: 0,
    exactMatches: 0,
    lastPruneTime: 0,
  };
}

const PATTERN_MEMORY_NUMERIC_FIELDS = Object.freeze({
  minSamples: { integer: true, min: 1 },
  successThreshold: { min: 0, max: 1 },
  failureThreshold: { min: 0, max: 1 },
  maxAgeDays: { integer: true, min: 1 },
  decayHalflifeDays: { min: 0 },
  maxPatterns: { integer: true, min: 1 },
  dtwThreshold: { min: 0, max: 1 },
  saveIntervalMs: { integer: true, min: 1 },
});

function assertPatternMemoryNumber(config, key, rule) {
  const value = config[key];
  if (!Number.isFinite(value)) {
    throw new Error(`[UnifiedPatternMemory] patternMemory.${key} must be a finite number`);
  }
  if (rule.integer && !Number.isInteger(value)) {
    throw new Error(`[UnifiedPatternMemory] patternMemory.${key} must be an integer`);
  }
  if (Number.isFinite(rule.min) && value < rule.min) {
    throw new Error(`[UnifiedPatternMemory] patternMemory.${key} must be >= ${rule.min}`);
  }
  if (Number.isFinite(rule.max) && value > rule.max) {
    throw new Error(`[UnifiedPatternMemory] patternMemory.${key} must be <= ${rule.max}`);
  }
}

function resolvePatternMemoryConfig(overrides) {
  const ownedConfig = TradingConfig.getSection('patternMemory');
  if (!ownedConfig || typeof ownedConfig !== 'object') {
    throw new Error('[UnifiedPatternMemory] TradingConfig.patternMemory is required');
  }

  const resolved = {
    ...ownedConfig,
    ...(overrides || {}),
  };

  for (const [key, rule] of Object.entries(PATTERN_MEMORY_NUMERIC_FIELDS)) {
    assertPatternMemoryNumber(resolved, key, rule);
  }

  if (typeof resolved.persistToDisk !== 'boolean') {
    throw new Error('[UnifiedPatternMemory] patternMemory.persistToDisk must be boolean');
  }

  if (!Array.isArray(resolved.featureWeights) || resolved.featureWeights.length === 0) {
    throw new Error('[UnifiedPatternMemory] patternMemory.featureWeights must be a non-empty number array');
  }
  resolved.featureWeights.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(`[UnifiedPatternMemory] patternMemory.featureWeights[${index}] must be finite`);
    }
  });

  return Object.freeze({
    ...resolved,
    featureWeights: Object.freeze([...resolved.featureWeights]),
  });
}

function resolveInitialMode() {
  const executionMode = String(process.env.EXECUTION_MODE || '').trim().toLowerCase();
  if (process.env.BACKTEST_MODE === 'true' || executionMode === 'backtest') return 'backtest';
  if (process.env.PAPER_TRADING === 'true' || executionMode === 'paper') return 'paper';
  if (executionMode === 'live') return 'live';
  return 'live';
}

function sanitizePatternBucket(value) {
  return String(value).trim().replace(/\//g, '-');
}

function resolveInitialAssetBucket(mode) {
  if (mode === 'backtest') {
    let ticker = sanitizePatternBucket(process.env.TRADING_PAIR || '');
    if (!ticker && process.env.CANDLE_DATA_FILE) {
      ticker = sanitizePatternBucket(deriveReportAssetSlugFromDataFile(process.env.CANDLE_DATA_FILE));
    }
    return ticker || 'default';
  }

  const cls = process.env.ASSET_CLASS
    || ((process.env.BROKER || '').toLowerCase() === 'kraken' ? 'crypto' :
        (process.env.BROKER || '').toLowerCase() === 'alpaca' ? 'stocks' : null);
  if (!cls) {
    throw new Error('[SESSION-HIGH-02] UnifiedPatternMemory: cannot determine asset class - set ASSET_CLASS or BROKER (kraken|alpaca) env');
  }
  return sanitizePatternBucket(cls.toLowerCase());
}

function storagePathForBucket(dataDir, mode, assetBucket) {
  return path.join(dataDir, `unified-patterns.${mode}.${assetBucket}.json`);
}

function backupPathForStoragePath(storagePath) {
  return storagePath.endsWith('.json')
    ? storagePath.replace(/\.json$/, '.backup.json')
    : `${storagePath}.backup.json`;
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED PATTERN MEMORY
// ═══════════════════════════════════════════════════════════════

class UnifiedPatternMemory {
  #patterns = {};

  constructor(config = {}) {
    const patternMemoryConfig = resolvePatternMemoryConfig(config);
    this.config = Object.freeze({
      ...patternMemoryConfig,
      persistToDisk: patternMemoryConfig.persistToDisk && process.env.BACKTEST_NO_PATTERN_SAVE !== 'true',
    });

    // Storage path is keyed by mode and an asset bucket. Rules:
    //   Live/paper: asset CLASS (stocks vs crypto) — stocks share one bank across
    //   tickers (TSLA/NVDA/SPY all write to unified-patterns.paper.stocks.json),
    //   crypto shares another (BTC/ETH/SOL all write to unified-patterns.paper.crypto.json).
    //   Class-level is the right granularity for live/paper because asset-class
    //   behavior traits (RTH vs 24/7, liquidity profile) dominate pattern signatures.
    //
    //   Backtest: per-TICKER — backtests are isolated research (no external pattern
    //   system writing to the same file), so each ticker produces pure training data.
    //   Per-ticker backtest banks feed the Phase 2 premium harvesting step.
    //
    // Spec: ogz-meta/specs/pattern-bank-separation-spec.md
    // Incident: 2026-04-22 crypto bank corruption on broker flip before this fix existed.
    const mode = resolveInitialMode();
    const assetBucket = resolveInitialAssetBucket(mode);
    this.dataDir = config.dataDir || process.env.DATA_DIR || (config.storagePath ? path.dirname(config.storagePath) : path.join(process.cwd(), 'data'));
    this.storagePath = config.storagePath || storagePathForBucket(this.dataDir, mode, assetBucket);
    this.storageMode = mode;
    this.assetBucket = assetBucket;

    // Stats
    this.stats = buildDefaultStats();

    // Load from disk
    this._load();

    // Periodic prune + save. The runtime cap must be enforced while the
    // process is alive, not only during shutdown cleanup.
    this._saveTimer = null;
    if (this.config.persistToDisk) {
      this._saveTimer = setInterval(() => this.pruneAndSave(), this.config.saveIntervalMs);
    }

    const patternCount = Object.keys(this.#patterns).length;
    console.log(`[UnifiedPatternMemory] Initialized: ${patternCount} patterns, mode=${mode}, persist=${this.config.persistToDisk}`);
  }

  get patterns() {
    if (typeof structuredClone === 'function') {
      return structuredClone(this.#patterns);
    }
    return JSON.parse(JSON.stringify(this.#patterns));
  }

  // ═══════════════════════════════════════════════════════════════
  // WRITE — Record observations and outcomes
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record a pattern observation (detected, no outcome yet)
   * Called on every candle by EnhancedPatternRecognition
   * 
   * @param {number[]} features - 9-element feature vector
   * @param {Object} metadata - { timestamp, strategy, price, scope fields }
   * @returns {string|null} Pattern signature
   */
  recordObservation(features, metadata = {}) {
    if (!this._validateFeatures(features)) return null;

    const scope = this._normalizeScope(metadata, 'UnifiedPatternMemory.recordObservation');
    if (!scope) return null;

    const sig = this._computeScopedSignature(features, scope);
    if (!sig) return null;

    let created = false;
    if (!this.#patterns[sig]) {
      this.#patterns[sig] = this._createPattern(sig, features, scope);
      created = true;
    }

    const p = this.#patterns[sig];
    p.timesSeen++;
    p.lastSeen = Date.now();
    this.stats.observations++;
    if (created) this._enforcePatternCapAfterMutation();

    return sig;
  }

  /**
   * Record a trade outcome (trade closed with PnL)
   * Called by OrderExecutor when position closes
   * 
   * @param {number[]} features - 9-element feature vector from entry
   * @param {Object} outcome - { pnl: number, pnlPercent: number, holdTimeMs: number, exitReason: string, strategy: string, scope fields }
   * @returns {boolean} Success
   */
  recordOutcome(features, outcome) {
    if (!this._validateFeatures(features)) return false;
    if (!outcome || !Number.isFinite(outcome.pnl) || !Number.isFinite(outcome.pnlPercent) ||
        !Number.isFinite(outcome.holdTimeMs) || !outcome.exitReason || !outcome.strategy) {
      return false;
    }

    const scope = this._normalizeScope(outcome, 'UnifiedPatternMemory.recordOutcome');
    if (!scope) return false;

    const sig = this._computeScopedSignature(features, scope);
    if (!sig) return false;

    // Create pattern if it wasn't observed first (edge case)
    let created = false;
    if (!this.#patterns[sig]) {
      this.#patterns[sig] = this._createPattern(sig, features, scope);
      created = true;
    }

    const p = this.#patterns[sig];
    const isWin = outcome.pnl > 0;

    // Update stats
    if (isWin) {
      p.wins++;
    } else if (outcome.pnl < 0) {
      p.losses++;
    }

    p.totalPnL += outcome.pnl;
    const totalTrades = p.wins + p.losses;
    p.winRate = totalTrades > 0 ? p.wins / totalTrades : 0;
    p.avgPnL = totalTrades > 0 ? p.totalPnL / totalTrades : 0;
    p.lastOutcome = Date.now();

    // Track outcome history (keep last 20)
    p.outcomes.push({
      timestamp: Date.now(),
      pnl: outcome.pnl,
      pnlPercent: outcome.pnlPercent,
      holdTimeMs: outcome.holdTimeMs,
      exitReason: outcome.exitReason,
      strategy: outcome.strategy,
      scopeKey: scope.scopeKey,
      symbol: scope.symbol,
      brokerId: scope.brokerId,
      accountId: scope.accountId,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      isWin,
    });
    if (p.outcomes.length > 20) {
      p.outcomes = p.outcomes.slice(-20);
    }

    // Check promotion / quarantine
    this._evaluateStatus(p);

    this.stats.outcomes++;
    if (created) this._enforcePatternCapAfterMutation();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // READ — Query pattern confidence for trading decisions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get confidence adjustment for current market conditions
   * Called by TRAI and StrategyOrchestrator
   * 
   * Uses two matching strategies:
   *   1. Exact signature match (fast, precise)
   *   2. DTW fuzzy match (slower, catches time-stretched patterns)
   * 
   * @param {number[]} features - 9-element feature vector
   * @returns {Object|null} { confidence, source, status, stats } or null
   */
  getConfidence(features, scopeInput = {}) {
    if (!this._validateFeatures(features)) return null;

    const scope = this._normalizeScope(scopeInput, 'UnifiedPatternMemory.getConfidence');
    if (!scope) return null;

    // Try exact match first (fast)
    const sig = this._computeScopedSignature(features, scope);
    const exactMatch = this.#patterns[sig];

    if (exactMatch) {
      const totalTrades = exactMatch.wins + exactMatch.losses;
      this.stats.exactMatches++;

      if (totalTrades < this.config.minSamples) {
        return {
          confidence: 0.5, // Neutral — not enough data
          source: 'insufficient_data',
          status: 'learning',
          stats: this._getPatternStats(exactMatch),
        };
      }

      // Apply time decay
      const decayedWR = this._applyDecay(exactMatch);

      return {
        confidence: decayedWR,
        source: decayedWR >= this.config.successThreshold ? 'learned_success' :
                decayedWR < this.config.failureThreshold ? 'learned_failure' : 'neutral',
        status: exactMatch.status,
        stats: this._getPatternStats(exactMatch),
      };
    }

    // Try DTW fuzzy match (slower, for time-stretched patterns)
    const dtwMatch = this._findDTWMatch(features, scope);
    if (dtwMatch) {
      this.stats.dtwMatches++;
      const totalTrades = dtwMatch.pattern.wins + dtwMatch.pattern.losses;

      if (totalTrades < this.config.minSamples) {
        return {
          confidence: 0.5,
          source: 'dtw_insufficient',
          status: 'learning',
          similarity: dtwMatch.similarity,
          stats: this._getPatternStats(dtwMatch.pattern),
        };
      }

      const decayedWR = this._applyDecay(dtwMatch.pattern);
      // Scale confidence by similarity (80% similar = 80% of the learned confidence)
      const scaledConfidence = 0.5 + (decayedWR - 0.5) * dtwMatch.similarity;

      return {
        confidence: scaledConfidence,
        source: decayedWR >= this.config.successThreshold ? 'dtw_success' :
                decayedWR < this.config.failureThreshold ? 'dtw_failure' : 'dtw_neutral',
        status: dtwMatch.pattern.status,
        similarity: dtwMatch.similarity,
        stats: this._getPatternStats(dtwMatch.pattern),
      };
    }

    return null; // Unknown pattern
  }

  /**
   * Check if pattern should be avoided
   * Quick check for TRAI and StrategyOrchestrator pre-trade filter
   * 
   * @param {number[]} features
   * @returns {boolean}
   */
  shouldAvoid(features, scopeInput = {}) {
    const result = this.getConfidence(features, scopeInput);
    if (!result) return false;
    return result.source === 'learned_failure' || result.source === 'dtw_failure';
  }

  /**
   * Check if pattern is promoted (proven winner)
   * 
   * @param {number[]} features
   * @returns {boolean}
   */
  isPromoted(features, scopeInput = {}) {
    const result = this.getConfidence(features, scopeInput);
    if (!result) return false;
    return result.source === 'learned_success' || result.source === 'dtw_success';
  }

  // ═══════════════════════════════════════════════════════════════
  // PROMOTION & QUARANTINE
  // ═══════════════════════════════════════════════════════════════

  _evaluateStatus(pattern) {
    const totalTrades = pattern.wins + pattern.losses;
    if (totalTrades < this.config.minSamples) {
      pattern.status = 'learning';
      return;
    }

    const decayedWR = this._applyDecay(pattern);

    if (decayedWR >= this.config.successThreshold) {
      if (pattern.status !== 'promoted') {
        pattern.status = 'promoted';
        pattern.promotedAt = Date.now();
        this.stats.promoted++;
        console.log(`🏆 [PATTERN PROMOTED] ${pattern.signature}: ${(decayedWR * 100).toFixed(1)}% WR over ${totalTrades} trades`);
      }
    } else if (decayedWR < this.config.failureThreshold) {
      if (pattern.status !== 'quarantined') {
        pattern.status = 'quarantined';
        pattern.quarantinedAt = Date.now();
        this.stats.quarantined++;
        console.log(`⛔ [PATTERN QUARANTINED] ${pattern.signature}: ${(decayedWR * 100).toFixed(1)}% WR over ${totalTrades} trades`);
      }
    } else {
      pattern.status = 'neutral';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TIME DECAY — recent trades weighted more than old ones
  // ═══════════════════════════════════════════════════════════════

  _applyDecay(pattern) {
    if (!pattern.outcomes || pattern.outcomes.length === 0) {
      return pattern.winRate;
    }

    const halflifeMs = this.config.decayHalflifeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let weightedWins = 0;
    let weightedTotal = 0;

    for (const outcome of pattern.outcomes) {
      const age = now - outcome.timestamp;
      const weight = Math.pow(0.5, age / halflifeMs);
      weightedTotal += weight;
      if (outcome.isWin) {
        weightedWins += weight;
      }
    }

    if (weightedTotal === 0) return pattern.winRate;
    return weightedWins / weightedTotal;
  }

  // ═══════════════════════════════════════════════════════════════
  // DTW FUZZY MATCHING
  // ═══════════════════════════════════════════════════════════════

  _findDTWMatch(features, scope) {
    const normFeatures = normalize(features);
    let bestMatch = null;
    let bestSimilarity = 0;

    // Only search patterns with enough data
    for (const [sig, pattern] of Object.entries(this.#patterns)) {
      if (pattern.scopeKey !== scope.scopeKey) continue;
      const totalTrades = pattern.wins + pattern.losses;
      if (totalTrades < 3) continue; // Skip very sparse patterns
      if (!pattern.features || pattern.features.length !== features.length) continue;

      const normStored = normalize(pattern.features);
      const distance = dynamicTimeWarping(normFeatures, normStored);
      const similarity = Math.max(0, 1 - (distance / (features.length * 1.8)));

      if (similarity > this.config.dtwThreshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = { pattern, similarity };
      }
    }

    return bestMatch;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRUNING — remove stale and useless patterns
  // ═══════════════════════════════════════════════════════════════

  prune() {
    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let pruned = 0;

    for (const [sig, pattern] of Object.entries(this.#patterns)) {
      const age = now - pattern.firstSeen;
      const totalTrades = pattern.wins + pattern.losses;

      // Prune old patterns with few trades
      if (age > maxAgeMs && totalTrades < 3) {
        delete this.#patterns[sig];
        pruned++;
        continue;
      }

      // Prune patterns that haven't been seen in 2x max age
      if (now - pattern.lastSeen > maxAgeMs * 2) {
        delete this.#patterns[sig];
        pruned++;
        continue;
      }
    }

    // If still over limit, prune least useful
    const entries = Object.entries(this.#patterns);
    if (entries.length > this.config.maxPatterns) {
      // Sort by usefulness: promoted > neutral > quarantined, then by recency
      entries.sort((a, b) => {
        const statusOrder = { promoted: 0, neutral: 1, learning: 2, quarantined: 3 };
        const statusDiff = (statusOrder[a[1].status] || 2) - (statusOrder[b[1].status] || 2);
        if (statusDiff !== 0) return statusDiff;
        return b[1].lastSeen - a[1].lastSeen;
      });

      // Keep only maxPatterns
      const toKeep = entries.slice(0, this.config.maxPatterns);
      this.#patterns = Object.fromEntries(toKeep);
      pruned += entries.length - toKeep.length;
    }

    if (pruned > 0) {
      console.log(`[UnifiedPatternMemory] Pruned ${pruned} patterns. Remaining: ${Object.keys(this.#patterns).length}`);
    }
    this.stats.lastPruneTime = now;
  }

  _enforcePatternCapAfterMutation() {
    if (Object.keys(this.#patterns).length <= this.config.maxPatterns) return 0;
    this.prune();
    const patternCount = Object.keys(this.#patterns).length;
    if (patternCount > this.config.maxPatterns) {
      throw new Error(`[UnifiedPatternMemory] prune failed to enforce maxPatterns cap: ${patternCount} > ${this.config.maxPatterns}`);
    }
    return patternCount;
  }

  pruneAndSave() {
    this.prune();
    this.save();
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════

  save() {
    if (!this.config.persistToDisk) return;

    try {
      this.saveOrThrow();
    } catch (err) {
      console.error(`[UnifiedPatternMemory] Save failed: ${err.message}`);
    }
  }

  saveOrThrow() {
    if (!this.config.persistToDisk) {
      return null;
    }

    return this._writeSnapshotOrThrow(this.storagePath);
  }

  _writeSnapshotOrThrow(storagePath) {
    const data = this._buildSnapshotData();
    this._snapshotPrimaryOrThrow(storagePath);
    this._writeSnapshotDataOrThrow(storagePath, data);
    return storagePath;
  }

  _buildSnapshotData() {
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      stats: this.stats,
      config: {
        minSamples: this.config.minSamples,
        successThreshold: this.config.successThreshold,
        failureThreshold: this.config.failureThreshold,
      },
      patternCount: Object.keys(this.#patterns).length,
      patterns: this.#patterns,
    };
  }

  _snapshotPrimaryOrThrow(storagePath) {
    if (!fs.existsSync(storagePath)) {
      return null;
    }

    const backupPath = backupPathForStoragePath(storagePath);
    try {
      this._readSnapshotDataOrThrow(storagePath);
      fs.copyFileSync(storagePath, backupPath);
      return backupPath;
    } catch (error) {
      console.warn(`[UnifiedPatternMemory] Skipped backup snapshot because primary pattern bank is invalid; preserving existing backup: ${error.message}`);
      return null;
    }
  }

  _writeSnapshotDataOrThrow(storagePath, data) {
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = storagePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data));
    fs.renameSync(tmpPath, storagePath);
    return storagePath;
  }

  _load() {
    if (!this.config.persistToDisk) return;

    try {
      this._loadWithRollbackOrThrow(this.storagePath);
    } catch (err) {
      console.error(`[UnifiedPatternMemory] Load failed: ${err.message}`);
      throw err;
    }
  }

  _loadWithRollbackOrThrow(storagePath) {
    if (!fs.existsSync(storagePath)) {
      const backupPath = backupPathForStoragePath(storagePath);
      if (fs.existsSync(backupPath)) {
        return this._loadBackupForMissingPrimary(storagePath, backupPath);
      }
      this.#patterns = {};
      this.stats = buildDefaultStats();
      console.warn(`[UnifiedPatternMemory] No primary or backup pattern bank found; initializing empty bank at ${storagePath}`);
      return { loaded: false, exists: false, patternCount: 0 };
    }

    try {
      return this._loadFromPathOrThrow(storagePath);
    } catch (primaryError) {
      return this._loadBackupAfterPrimaryFailure(storagePath, primaryError);
    }
  }

  _loadBackupForMissingPrimary(storagePath, backupPath) {
    try {
      const result = this._loadFromPathOrThrow(backupPath);
      this._writeSnapshotDataOrThrow(storagePath, this._buildSnapshotData());
      console.warn(`[UnifiedPatternMemory] Primary pattern bank missing; restored from backup: ${backupPath}`);
      return { ...result, recoveredFromBackup: true, backupPath };
    } catch (backupError) {
      throw new Error(`UnifiedPatternMemory primary pattern bank missing and backup failed: ${backupError.message}`);
    }
  }

  _loadBackupAfterPrimaryFailure(storagePath, primaryError) {
    const backupPath = backupPathForStoragePath(storagePath);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`UnifiedPatternMemory primary load failed and no backup exists at ${backupPath}: ${primaryError.message}`);
    }

    try {
      const result = this._loadFromPathOrThrow(backupPath);
      this._writeSnapshotDataOrThrow(storagePath, this._buildSnapshotData());
      console.warn(`[UnifiedPatternMemory] Recovered pattern bank from backup: ${backupPath}`);
      return { ...result, recoveredFromBackup: true, backupPath };
    } catch (backupError) {
      throw new Error(`UnifiedPatternMemory primary and backup pattern banks both failed. primary=${primaryError.message}; backup=${backupError.message}`);
    }
  }

  _loadFromPathOrThrow(storagePath) {
    if (!this.config.persistToDisk) {
      return { loaded: false, exists: false, patternCount: Object.keys(this.#patterns).length };
    }
    if (!fs.existsSync(storagePath)) {
      this.#patterns = {};
      this.stats = buildDefaultStats();
      return { loaded: false, exists: false, patternCount: 0 };
    }

    const data = this._readSnapshotDataOrThrow(storagePath);

    this.#patterns = data.patterns;
    this.stats = { ...buildDefaultStats(), ...(data.stats || {}) };
    console.log(`[UnifiedPatternMemory] Loaded ${Object.keys(this.#patterns).length} patterns from disk`);
    return { loaded: true, exists: true, patternCount: Object.keys(this.#patterns).length };
  }

  _readSnapshotDataOrThrow(storagePath) {
    const raw = fs.readFileSync(storagePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.version !== 2 || !data.patterns || typeof data.patterns !== 'object' || Array.isArray(data.patterns)) {
      throw new Error(`UnifiedPatternMemory incompatible pattern bank at ${storagePath}`);
    }
    return data;
  }

  _resolveStoragePathForScope(scope) {
    const mode = scope.executionMode === 'backtest' ? 'backtest'
      : scope.executionMode === 'live' ? 'live'
        : 'paper';
    const assetBucket = mode === 'backtest'
      ? sanitizePatternBucket(scope.symbol)
      : sanitizePatternBucket(scope.assetClass);
    return {
      mode,
      assetBucket,
      storagePath: storagePathForBucket(this.dataDir, mode, assetBucket)
    };
  }

  switchSessionScope(scopeInput, details = {}) {
    const scope = this._requireScope(scopeInput, 'UnifiedPatternMemory.switchSessionScope');
    const target = this._resolveStoragePathForScope(scope);
    const previousPath = this.storagePath;
    const previousMode = this.storageMode;
    const previousBucket = this.assetBucket;
    const previousPatterns = this.patterns;
    const previousStats = { ...this.stats };

    if (target.storagePath === previousPath) {
      return {
        switched: false,
        reason: 'already_active',
        storagePath: this.storagePath,
        mode: this.storageMode,
        assetBucket: this.assetBucket,
        patternCount: Object.keys(this.#patterns).length
      };
    }

    try {
      this.saveOrThrow();
      this.storagePath = target.storagePath;
      this.storageMode = target.mode;
      this.assetBucket = target.assetBucket;
      this.#patterns = {};
      this.stats = buildDefaultStats();
      const loadResult = this._loadWithRollbackOrThrow(target.storagePath);
      return {
        switched: true,
        reason: details.reason || 'session_scope_switch',
        previousPath,
        storagePath: this.storagePath,
        mode: this.storageMode,
        assetBucket: this.assetBucket,
        patternCount: Object.keys(this.#patterns).length,
        loaded: loadResult.loaded,
        targetExists: loadResult.exists
      };
    } catch (err) {
      this.storagePath = previousPath;
      this.storageMode = previousMode;
      this.assetBucket = previousBucket;
      this.#patterns = previousPatterns;
      this.stats = previousStats;
      throw err;
    }
  }

  /**
   * forceBackup - Snapshot the current pattern file to data/backups/ as a gzipped copy.
   *
   * Called by SessionRouter (future) on market session transition so crypto state is
   * preserved before the stocks session overwrites (and vice versa). No timer, no
   * retention — one call = one backup. Retention is a future concern.
   *
   * @param {string} reason - Audit trail label (e.g. 'session_transition_to_stocks')
   * @returns {Promise<string|null>} Path of the backup file, or null if nothing to back up
   */
  async forceBackup(reason = 'manual') {
    try {
      if (!fs.existsSync(this.storagePath)) {
        console.log(`[UnifiedPatternMemory] forceBackup skipped: ${this.storagePath} does not exist (nothing to back up)`);
        return null;
      }

      const zlib = require('zlib');
      const baseName = path.basename(this.storagePath, '.json');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupDir = path.join(path.dirname(this.storagePath), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const backupPath = path.join(backupDir, `${baseName}.${ts}.json.gz`);
      const raw = fs.readFileSync(this.storagePath);
      const gz = zlib.gzipSync(raw);
      fs.writeFileSync(backupPath, gz);

      const srcMB = (raw.length / 1024 / 1024).toFixed(2);
      const dstMB = (gz.length / 1024 / 1024).toFixed(2);
      console.log(`[UnifiedPatternMemory] forceBackup (${reason}): ${srcMB} MB -> ${dstMB} MB gzipped at ${backupPath}`);
      return backupPath;
    } catch (err) {
      console.error(`[UnifiedPatternMemory] forceBackup failed: ${err.message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  _normalizeScope(input, caller) {
    const scope = normalizePatternScope(input, caller);
    return scope.ok ? scope : null;
  }

  _requireScope(input, caller) {
    const scope = normalizePatternScope(input, caller);
    if (scope.ok) return scope;
    const error = new Error(scope.reason);
    error.code = scope.code;
    error.missingFields = scope.missingFields || [];
    error.suppliedScopeKey = scope.suppliedScopeKey;
    error.expectedScopeKey = scope.expectedScopeKey;
    throw error;
  }

  _computeScopedSignature(features, scope) {
    const signature = computeSignature(features);
    return signature ? `${scope.scopeKey}:${signature}` : null;
  }

  _createPattern(signature, features, scope) {
    return {
      signature,
      features: [...features],
      symbol: scope.symbol,
      brokerId: scope.brokerId,
      accountId: scope.accountId,
      accountIdSource: scope.accountIdSource,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      scopeKey: scope.scopeKey,
      scopeKeyVersion: scope.scopeKeyVersion,
      scopeComplete: scope.scopeComplete,
      status: 'learning', // learning | neutral | promoted | quarantined
      timesSeen: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      winRate: 0,
      avgPnL: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      lastOutcome: null,
      promotedAt: null,
      quarantinedAt: null,
      outcomes: [],
    };
  }

  _validateFeatures(features) {
    if (!Array.isArray(features) || features.length === 0) return false;
    if (features.length > 50) return false;
    return true;
  }

  _getPatternStats(pattern) {
    return {
      symbol: pattern.symbol || null,
      brokerId: pattern.brokerId || null,
      accountId: pattern.accountId || null,
      assetClass: pattern.assetClass || null,
      executionMode: pattern.executionMode || null,
      timeframe: pattern.timeframe || null,
      scopeKey: pattern.scopeKey || null,
      totalTrades: pattern.wins + pattern.losses,
      wins: pattern.wins,
      losses: pattern.losses,
      winRate: pattern.winRate,
      avgPnL: pattern.avgPnL,
      timesSeen: pattern.timesSeen,
      status: pattern.status,
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
      age: Date.now() - pattern.firstSeen,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC STATS — for dashboard and health checks
  // ═══════════════════════════════════════════════════════════════

  getStats() {
    const patterns = Object.values(this.#patterns);
    return {
      total: patterns.length,
      learning: patterns.filter(p => p.status === 'learning').length,
      neutral: patterns.filter(p => p.status === 'neutral').length,
      promoted: patterns.filter(p => p.status === 'promoted').length,
      quarantined: patterns.filter(p => p.status === 'quarantined').length,
      totalObservations: this.stats.observations,
      totalOutcomes: this.stats.outcomes,
      exactMatches: this.stats.exactMatches,
      dtwMatches: this.stats.dtwMatches,
    };
  }

  healthCheck() {
    const stats = this.getStats();
    const healthy = stats.total > 0 && stats.totalOutcomes > 0;
    return {
      healthy,
      ...stats,
      issues: [
        ...(stats.total === 0 ? ['No patterns stored'] : []),
        ...(stats.totalOutcomes === 0 ? ['No outcomes recorded — learning disabled?'] : []),
        ...(stats.promoted === 0 && stats.totalOutcomes > 100 ? ['No patterns promoted after 100+ outcomes'] : []),
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPATIBILITY API — for EnhancedPatternRecognition migration
  // These methods adapt the old PatternMemorySystem API to the new UnifiedPatternMemory
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record a pattern result (compatibility with PatternMemorySystem)
   * @param {number[]} features - Feature vector
   * @param {Object} result - { pnl: number, timestamp?: number }
   * @returns {boolean}
   */
  recordPattern(features, result) {
    if (!features || !Array.isArray(features) || features.length === 0 || !result) {
      return false;
    }

    // If pnl is provided, this is an outcome; otherwise it's an observation
    if (typeof result.pnl === 'number') {
      const exitReason = typeof result.exitReason === 'string' ? result.exitReason.trim() : '';
      const strategy = typeof result.strategy === 'string' ? result.strategy.trim() : '';
      if (!Number.isFinite(result.pnl) || !Number.isFinite(result.holdTimeMs) ||
          result.holdTimeMs <= 0 || !exitReason || !strategy) {
        return false;
      }
      return this.recordOutcome(features, {
        pnl: result.pnl,
        pnlPercent: result.pnl, // Old API uses pnl as percentage
        holdTimeMs: result.holdTimeMs,
        exitReason,
        strategy,
        symbol: result.symbol,
        brokerId: result.brokerId,
        accountId: result.accountId,
        accountIdSource: result.accountIdSource,
        assetClass: result.assetClass,
        executionMode: result.executionMode,
        timeframe: result.timeframe,
        scopeKey: result.scopeKey,
      });
    } else {
      // Just observation (pattern detected, no outcome yet)
      return Boolean(this.recordObservation(features, {
        timestamp: result.timestamp || Date.now(),
        strategy: result.strategy,
        symbol: result.symbol,
        brokerId: result.brokerId,
        accountId: result.accountId,
        accountIdSource: result.accountIdSource,
        assetClass: result.assetClass,
        executionMode: result.executionMode,
        timeframe: result.timeframe,
        scopeKey: result.scopeKey,
      }));
    }
  }

  /**
   * Get pattern stats (compatibility with PatternMemorySystem)
   * @param {number[]} features
   * @returns {Object|null}
   */
  getPatternStats(features, scopeInput = {}) {
    if (!this._validateFeatures(features)) return null;
    const scope = this._normalizeScope(scopeInput, 'UnifiedPatternMemory.getPatternStats');
    if (!scope) return null;
    const sig = this._computeScopedSignature(features, scope);
    const p = this.#patterns[sig];
    if (!p) return null;
    return {
      timesSeen: p.timesSeen,
      wins: p.wins,
      losses: p.losses,
      totalPnL: p.totalPnL,
      results: p.outcomes.map(o => ({ timestamp: o.timestamp, pnl: o.pnl, success: o.isWin })),
      firstSeen: p.firstSeen,
      lastSeen: p.lastSeen,
    };
  }

  /**
   * Evaluate a pattern (compatibility with PatternMemorySystem)
   * @param {number[]} features
   * @param {Object} options
   * @returns {Object}
   */
  evaluatePattern(features, options = {}) {
    const result = this.getConfidence(features, options);

    if (!result) {
      return {
        confidence: 0,
        direction: 'hold',
        reason: 'Unknown pattern',
        bestMatch: null,
      };
    }

    const direction = result.confidence >= 0.6 ? 'buy' :
                      result.confidence <= 0.4 ? 'sell' : 'hold';

    return {
      confidence: result.confidence,
      direction,
      reason: result.source,
      quality: result.stats ? result.stats.totalTrades / 10 : 0,
      bestMatch: result.stats ? { pattern: 'DTW_MATCH', ...result.stats } : null,
      timesSeen: result.stats?.timesSeen || 0,
      winRate: result.stats?.winRate || 0,
      avgPnL: result.stats?.avgPnL || 0,
    };
  }

  /**
   * Find similar patterns (compatibility with PatternMemorySystem)
   * @param {number[]|Object} featuresOrQuery
   * @param {number} threshold
   * @param {number} limit
   * @returns {Array}
   */
  findSimilarPatterns(featuresOrQuery, threshold = 0.8, limit = 5) {
    // Handle both array and object input
    const features = Array.isArray(featuresOrQuery)
      ? featuresOrQuery
      : (featuresOrQuery.features || []);

    if (!this._validateFeatures(features)) return [];
    const scope = this._normalizeScope(featuresOrQuery, 'UnifiedPatternMemory.findSimilarPatterns');
    if (!scope) return [];

    const matches = [];
    const normFeatures = normalize(features);

    for (const [sig, pattern] of Object.entries(this.#patterns)) {
      if (pattern.scopeKey !== scope.scopeKey) continue;
      if (!pattern.features || pattern.features.length !== features.length) continue;

      const normStored = normalize(pattern.features);
      const distance = dynamicTimeWarping(normFeatures, normStored);
      const similarity = Math.max(0, 1 - (distance / (features.length * 1.8)));

      if (similarity >= threshold) {
        matches.push({
          ...this._getPatternStats(pattern),
          similarity,
          signature: sig,
          successRate: pattern.winRate,
        });
      }
    }

    // Sort by similarity descending, limit results
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, limit);
  }

  /**
   * Cleanup — call on shutdown
   */
  async cleanup() {
    if (this._saveTimer) {
      clearInterval(this._saveTimer);
      this._saveTimer = null;
    }
    this.pruneAndSave();
    console.log(`[UnifiedPatternMemory] Cleanup complete. ${Object.keys(this.#patterns).length} patterns saved.`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════

let _instance = null;

function getInstance(config) {
  if (!_instance) {
    _instance = new UnifiedPatternMemory(config);
  }
  return _instance;
}

module.exports = { UnifiedPatternMemory, getInstance, computeSignature };
