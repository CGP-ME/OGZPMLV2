/**
 * TRAI PATTERN MEMORY BANK
 *
 * Persistent learning system that remembers successful and failed trading patterns.
 * Only saves statistically significant patterns (10+ occurrences, 65%+ win rate).
 *
 * Features:
 * - Pattern hashing for consistent identification
 * - Statistical significance filtering (prevents noise)
 * - Success/failure tracking
 * - News correlation memory
 * - Market regime detection
 * - Automatic pruning of outdated patterns
 *
 * Memory Structure:
 * {
 *   successfulPatterns: { hash: { pattern, wins, losses, totalPnL, ... } },
 *   failedPatterns: { hash: { pattern, wins, losses, ... } },
 *   newsCorrelations: { keyword: { priceImpact, occurrences } },
 *   marketRegimes: { regime: { volatility, winRate } },
 *   metadata: { lastUpdated, totalTrades, version }
 * }
 *
 * @author TRAI Core Team
 * @version 1.0.0
 * @created 2025-11-22
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PatternMemoryBank {
    constructor(config = {}) {
        // Mode-aware pattern memory persistence to prevent contamination
        const mode = process.env.TRADING_MODE || process.env.BACKTEST_MODE === 'true' ? 'backtest' : 'paper';
        const featureFlags = config.featureFlags || {};
        const partitionSettings = featureFlags.PATTERN_MEMORY_PARTITION?.settings || {};

        // Determine file based on mode
        let memoryFile = 'learned_patterns.json';
        if (partitionSettings[mode]) {
            memoryFile = partitionSettings[mode];
        } else if (mode === 'live') {
            memoryFile = 'pattern_memory.live.json';
        } else if (mode === 'paper') {
            memoryFile = 'pattern_memory.paper.json';
        } else if (mode === 'backtest') {
            memoryFile = 'pattern_memory.backtest.json';
        }

        this.dbPath = config.dbPath || path.join(__dirname, '..', memoryFile);
        this.backupPath = config.backupPath || path.join(__dirname, '..', memoryFile.replace('.json', '.backup.json'));

        // Disable persistence for backtest mode if configured
        this.persistenceEnabled = mode !== 'backtest' || partitionSettings.backtestPersist !== false;

        console.log(`🧠 [TRAI Memory] Mode: ${mode}, File: ${memoryFile}, Persist: ${this.persistenceEnabled}`);

        // Statistical thresholds
        this.minTradesSample = config.minTradesSample || 10;  // Need 10+ occurrences
        this.successThreshold = config.successThreshold || 0.65;  // 65%+ win rate = success
        this.failureThreshold = config.failureThreshold || 0.35;  // <35% win rate = avoid
        this.maxPatternAge = config.maxPatternAge || 90 * 24 * 60 * 60 * 1000;  // 90 days in ms

        // Load existing memory or create new
        this.memory = this.loadMemory();

        console.log('🧠 [TRAI Memory] Initialized with',
            Object.keys(this.memory.successfulPatterns).length, 'successful patterns,',
            Object.keys(this.memory.failedPatterns).length, 'failed patterns');
    }

    /**
     * Load memory from disk or initialize new memory structure
     */
    loadMemory() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
                console.log('💾 [TRAI Memory] Loaded from disk:', this.dbPath);
                return this.validateMemoryStructure(data);
            }
        } catch (error) {
            console.warn('⚠️ [TRAI Memory] Failed to load, creating new:', error.message);
        }

        return this.createEmptyMemory();
    }

    /**
     * Create empty memory structure
     */
    createEmptyMemory() {
        return {
            successfulPatterns: {},
            failedPatterns: {},
            newsCorrelations: {},
            marketRegimes: {},
            metadata: {
                version: '1.0.0',
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                totalTrades: 0,
                totalWins: 0,
                totalLosses: 0
            }
        };
    }

    /**
     * Validate and migrate memory structure if needed
     */
    validateMemoryStructure(data) {
        const empty = this.createEmptyMemory();

        return {
            successfulPatterns: data.successfulPatterns || {},
            failedPatterns: data.failedPatterns || {},
            newsCorrelations: data.newsCorrelations || {},
            marketRegimes: data.marketRegimes || {},
            metadata: {
                ...empty.metadata,
                ...data.metadata,
                lastUpdated: new Date().toISOString()
            }
        };
    }

    /**
     * Record the outcome of a closed trade
     * This is called after every trade closes to build TRAI's memory
     *
     * @param {Object} trade - Trade data including entry, exit, and P&L
     */
    recordTradeOutcome(trade) {
        try {
            const pattern = this.extractPattern(trade);

            if (!pattern || !pattern.hash) {
                console.warn('⚠️ [TRAI Memory] Invalid pattern extracted, skipping');
                return;
            }

            // Initialize pattern record if it doesn't exist
            if (!this.memory.successfulPatterns[pattern.hash] &&
                !this.memory.failedPatterns[pattern.hash]) {
                this.memory.successfulPatterns[pattern.hash] = {
                    pattern: pattern.data,
                    name: pattern.name,
                    wins: 0,
                    losses: 0,
                    totalPnL: 0,
                    avgPnL: 0,
                    bestTrade: 0,
                    worstTrade: 0,
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    occurrences: []
                };
            }

            // Get existing record (could be in success or failed)
            const record = this.memory.successfulPatterns[pattern.hash] ||
                          this.memory.failedPatterns[pattern.hash];

            // Update statistics
            const isWin = trade.profitLoss > 0;

            if (isWin) {
                record.wins++;
                this.memory.metadata.totalWins++;
            } else {
                record.losses++;
                this.memory.metadata.totalLosses++;
            }

            record.totalPnL += trade.profitLoss;
            record.lastSeen = new Date().toISOString();

            // Track best and worst trades
            if (trade.profitLoss > record.bestTrade) {
                record.bestTrade = trade.profitLoss;
            }
            if (trade.profitLoss < record.worstTrade) {
                record.worstTrade = trade.profitLoss;
            }

            // Store occurrence details (keep last 20 for analysis)
            record.occurrences.push({
                timestamp: trade.exit.timestamp,
                profitLoss: trade.profitLoss,
                profitLossPercent: trade.profitLossPercent,
                holdDuration: trade.holdDuration
            });

            if (record.occurrences.length > 20) {
                record.occurrences = record.occurrences.slice(-20);
            }

            // Calculate statistics
            const totalTrades = record.wins + record.losses;
            const winRate = record.wins / totalTrades;
            record.avgPnL = record.totalPnL / totalTrades;
            record.winRate = winRate;

            // Update metadata
            this.memory.metadata.totalTrades++;
            this.memory.metadata.lastUpdated = new Date().toISOString();

            // Classify pattern based on statistical significance
            if (totalTrades >= this.minTradesSample) {
                if (winRate >= this.successThreshold) {
                    // Pattern is successful - keep in successful patterns
                    if (this.memory.failedPatterns[pattern.hash]) {
                        delete this.memory.failedPatterns[pattern.hash];
                    }
                    this.memory.successfulPatterns[pattern.hash] = record;

                    console.log(`📚 [TRAI Memory] Pattern learned: "${pattern.name}" - ` +
                               `${(winRate * 100).toFixed(1)}% win rate over ${totalTrades} trades ` +
                               `(Avg: ${record.avgPnL > 0 ? '+' : ''}${record.avgPnL.toFixed(2)}%)`);

                } else if (winRate < this.failureThreshold) {
                    // Pattern is failing - move to failed patterns
                    if (this.memory.successfulPatterns[pattern.hash]) {
                        delete this.memory.successfulPatterns[pattern.hash];
                    }
                    this.memory.failedPatterns[pattern.hash] = record;

                    console.log(`🚫 [TRAI Memory] Pattern marked as failed: "${pattern.name}" - ` +
                               `Only ${(winRate * 100).toFixed(1)}% win rate over ${totalTrades} trades ` +
                               `(Will avoid in future)`);
                }
            }

            // Save to disk
            this.saveMemory();

        } catch (error) {
            console.error('❌ [TRAI Memory] Error recording trade outcome:', error.message);
        }
    }

    /**
     * Get confidence boost/penalty for a pattern based on learned history
     * Returns: { confidence, source, stats } or null if pattern unknown
     *
     * @param {Object} currentPattern - Current market pattern to check
     */
    getPatternConfidence(currentPattern) {
        try {
            const hash = this.hashPattern(currentPattern);

            // Check successful patterns
            if (this.memory.successfulPatterns[hash]) {
                const record = this.memory.successfulPatterns[hash];
                const totalTrades = record.wins + record.losses;

                if (totalTrades >= this.minTradesSample) {
                    const winRate = record.wins / totalTrades;

                    console.log(`🧠 [TRAI Memory] MATCH FOUND: "${record.name}" - ` +
                               `${(winRate * 100).toFixed(1)}% win rate over ${totalTrades} trades ` +
                               `(Avg: ${record.avgPnL > 0 ? '+' : ''}${record.avgPnL.toFixed(2)}%)`);

                    return {
                        confidence: winRate,
                        source: 'learned_success',
                        stats: {
                            totalTrades,
                            wins: record.wins,
                            losses: record.losses,
                            avgPnL: record.avgPnL,
                            bestTrade: record.bestTrade,
                            worstTrade: record.worstTrade
                        }
                    };
                }
            }

            // Check failed patterns
            if (this.memory.failedPatterns[hash]) {
                const record = this.memory.failedPatterns[hash];
                const totalTrades = record.wins + record.losses;

                if (totalTrades >= this.minTradesSample) {
                    const winRate = record.wins / totalTrades;

                    console.log(`⚠️ [TRAI Memory] AVOID: "${record.name}" - ` +
                               `Only ${(winRate * 100).toFixed(1)}% win rate over ${totalTrades} trades ` +
                               `(Pattern has failed historically)`);

                    return {
                        confidence: 0.0,
                        source: 'learned_failure',
                        stats: {
                            totalTrades,
                            wins: record.wins,
                            losses: record.losses,
                            avgPnL: record.avgPnL,
                            reason: 'Historical failure pattern'
                        }
                    };
                }
            }

            // Pattern not in memory yet
            return null;

        } catch (error) {
            console.error('❌ [TRAI Memory] Error getting pattern confidence:', error.message);
            return null;
        }
    }

    /**
     * Extract pattern signature from trade data
     * Creates a consistent hash for pattern matching
     *
     * @param {Object} trade - Trade data or current market data
     */
    extractPattern(trade) {
        try {
            // Handle both closed trades and current market data
            const indicators = trade.entry?.indicators || trade.indicators;
            const trend = trade.entry?.trend || trade.trend;
            const timestamp = trade.entry?.timestamp || trade.timestamp || new Date().toISOString();

            if (!indicators || !trend) {
                return null;
            }

            // Bucket values to create pattern signatures
            // This allows similar (but not identical) market conditions to match
            const patternData = {
                // RSI in buckets of 10 (30-40, 40-50, etc)
                rsi: Math.round((indicators.rsi || 50) / 10) * 10,

                // MACD direction
                macd: (indicators.macd || 0) > 0 ? 'positive' : 'negative',

                // MACD histogram strength
                macdHistogram: Math.abs(indicators.macdHistogram || 0) > 0.001 ? 'strong' : 'weak',

                // Trend
                trend: trend,

                // Primary pattern
                pattern: indicators.primaryPattern || 'none',

                // Volatility bucketed
                volatility: (trade.entry?.volatility || trade.volatility || 0) > 0.03 ? 'high' : 'low',

                // Time of day (could be relevant for crypto)
                hour: new Date(timestamp).getUTCHours()
            };

            // Create hash from pattern data
            const hash = this.hashPattern(patternData);

            // Create human-readable name
            const name = `${patternData.trend}_${patternData.pattern}_RSI${patternData.rsi}_${patternData.macd}MACD`;

            return {
                hash,
                name,
                data: patternData
            };

        } catch (error) {
            console.error('❌ [TRAI Memory] Error extracting pattern:', error.message);
            return null;
        }
    }

    /**
     * Create consistent hash from pattern data
     */
    hashPattern(patternData) {
        const str = JSON.stringify(patternData, Object.keys(patternData).sort());
        return crypto.createHash('md5').update(str).digest('hex');
    }

    /**
     * Record news correlation (keyword → price movement)
     */
    recordNewsCorrelation(keyword, priceImpact, timestamp) {
        if (!this.memory.newsCorrelations[keyword]) {
            this.memory.newsCorrelations[keyword] = {
                occurrences: 0,
                totalImpact: 0,
                avgImpact: 0,
                positiveImpacts: 0,
                negativeImpacts: 0,
                lastSeen: null
            };
        }

        const record = this.memory.newsCorrelations[keyword];
        record.occurrences++;
        record.totalImpact += priceImpact;
        record.avgImpact = record.totalImpact / record.occurrences;
        record.lastSeen = timestamp;

        if (priceImpact > 0) {
            record.positiveImpacts++;
        } else {
            record.negativeImpacts++;
        }

        // Only log if statistically significant
        if (record.occurrences >= 5) {
            console.log(`📰 [TRAI Memory] News correlation: "${keyword}" → ` +
                       `${record.avgImpact > 0 ? '+' : ''}${(record.avgImpact * 100).toFixed(2)}% ` +
                       `(${record.occurrences} occurrences)`);
        }
    }

    /**
     * Get news correlation impact for a keyword
     */
    getNewsCorrelation(keyword) {
        const record = this.memory.newsCorrelations[keyword];

        if (record && record.occurrences >= 5) {
            return {
                avgImpact: record.avgImpact,
                confidence: Math.min(record.occurrences / 20, 1.0),  // Max confidence at 20 occurrences
                occurrences: record.occurrences
            };
        }

        return null;
    }

    /**
     * Prune old and irrelevant patterns
     * Removes patterns that haven't been seen in 90 days
     */
    pruneOldPatterns() {
        let pruned = 0;
        const now = Date.now();

        // Prune successful patterns
        for (const [hash, record] of Object.entries(this.memory.successfulPatterns)) {
            const lastSeen = new Date(record.lastSeen).getTime();
            const age = now - lastSeen;

            if (age > this.maxPatternAge) {
                delete this.memory.successfulPatterns[hash];
                pruned++;
                console.log(`🗑️ [TRAI Memory] Pruned old pattern: "${record.name}" (not seen in ${Math.floor(age / (24 * 60 * 60 * 1000))} days)`);
            }
        }

        // Prune failed patterns
        for (const [hash, record] of Object.entries(this.memory.failedPatterns)) {
            const lastSeen = new Date(record.lastSeen).getTime();
            const age = now - lastSeen;

            if (age > this.maxPatternAge) {
                delete this.memory.failedPatterns[hash];
                pruned++;
            }
        }

        if (pruned > 0) {
            console.log(`🗑️ [TRAI Memory] Pruned ${pruned} old patterns`);
            this.saveMemory();
        }

        return pruned;
    }

    /**
     * Save memory to disk with backup
     */
    saveMemory() {
        // Skip saving if persistence is disabled (e.g., backtest mode)
        if (!this.persistenceEnabled) {
            console.log(`⏭️ [TRAI Memory] Skipping save (persistence disabled for mode)`);
            return;
        }

        try {
            // Create backup of existing file
            if (fs.existsSync(this.dbPath)) {
                fs.copyFileSync(this.dbPath, this.backupPath);
            }

            // Write new memory
            fs.writeFileSync(this.dbPath, JSON.stringify(this.memory, null, 2));

            console.log(`💾 [TRAI Memory] Saved - ${Object.keys(this.memory.successfulPatterns).length} successful, ` +
                       `${Object.keys(this.memory.failedPatterns).length} failed patterns`);

        } catch (error) {
            console.error('❌ [TRAI Memory] Failed to save:', error.message);
        }
    }

    /**
     * Export memory for analysis or backup
     */
    exportMemory() {
        return JSON.parse(JSON.stringify(this.memory));
    }

    /**
     * Import memory from backup or migration
     */
    importMemory(data) {
        this.memory = this.validateMemoryStructure(data);
        this.saveMemory();
        console.log('📥 [TRAI Memory] Imported memory with',
                   Object.keys(this.memory.successfulPatterns).length, 'patterns');
    }

    /**
     * Get statistics about TRAI's learning
     */
    getStats() {
        const successfulCount = Object.keys(this.memory.successfulPatterns).length;
        const failedCount = Object.keys(this.memory.failedPatterns).length;

        // Calculate average win rate of learned patterns
        let totalWinRate = 0;
        let maturePatterns = 0;

        for (const record of Object.values(this.memory.successfulPatterns)) {
            const totalTrades = record.wins + record.losses;
            if (totalTrades >= this.minTradesSample) {
                totalWinRate += record.wins / totalTrades;
                maturePatterns++;
            }
        }

        const avgWinRate = maturePatterns > 0 ? totalWinRate / maturePatterns : 0;

        return {
            successfulPatterns: successfulCount,
            failedPatterns: failedCount,
            maturePatterns,  // Patterns with 10+ trades
            totalTrades: this.memory.metadata.totalTrades,
            totalWins: this.memory.metadata.totalWins,
            totalLosses: this.memory.metadata.totalLosses,
            overallWinRate: this.memory.metadata.totalTrades > 0
                ? this.memory.metadata.totalWins / this.memory.metadata.totalTrades
                : 0,
            avgLearnedPatternWinRate: avgWinRate,
            newsCorrelations: Object.keys(this.memory.newsCorrelations).length,
            lastUpdated: this.memory.metadata.lastUpdated,
            created: this.memory.metadata.created
        };
    }

    /**
     * Reset all memory (use with caution!)
     */
    reset() {
        console.warn('⚠️ [TRAI Memory] RESETTING ALL LEARNED PATTERNS');
        this.memory = this.createEmptyMemory();
        this.saveMemory();
    }
}

module.exports = PatternMemoryBank;
