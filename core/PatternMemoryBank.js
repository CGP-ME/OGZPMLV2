/**
 * PatternMemoryBank - TRAI's Learning Pattern Storage
 *
 * Stores patterns that TRAI has learned from, tracking their success rates
 * for AI-driven decision improvement over time.
 */

const fs = require('fs');
const path = require('path');

class PatternMemoryBank {
    constructor(config = {}) {
        this.dbPath = config.dbPath || './trai_brain/learned_patterns.json';
        this.backupPath = config.backupPath || './trai_brain/learned_patterns.backup.json';
        this.patterns = {};
        this.loadPatterns();
    }

    loadPatterns() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.patterns = JSON.parse(data);
                console.log(`📚 [PatternMemoryBank] Loaded ${Object.keys(this.patterns).length} learned patterns`);
            } else {
                console.log('📚 [PatternMemoryBank] Starting with empty pattern bank');
            }
        } catch (error) {
            console.error('❌ [PatternMemoryBank] Failed to load patterns:', error.message);
            this.patterns = {};
        }
    }

    savePatterns() {
        try {
            // Backup existing file
            if (fs.existsSync(this.dbPath)) {
                fs.copyFileSync(this.dbPath, this.backupPath);
            }

            // Save new patterns
            fs.writeFileSync(this.dbPath, JSON.stringify(this.patterns, null, 2));
            console.log(`💾 [PatternMemoryBank] Saved ${Object.keys(this.patterns).length} patterns`);
        } catch (error) {
            console.error('❌ [PatternMemoryBank] Failed to save patterns:', error.message);
        }
    }

    recordPattern(patternId, patternData, outcome) {
        if (!this.patterns[patternId]) {
            this.patterns[patternId] = {
                data: patternData,
                occurrences: [],
                successRate: 0,
                totalTrades: 0,
                successfulTrades: 0
            };
        }

        const pattern = this.patterns[patternId];
        pattern.occurrences.push({
            timestamp: Date.now(),
            outcome: outcome,
            pnl: outcome.pnl || 0
        });

        pattern.totalTrades++;
        if (outcome.successful) {
            pattern.successfulTrades++;
        }

        pattern.successRate = pattern.successfulTrades / pattern.totalTrades;

        // Keep only last 100 occurrences
        if (pattern.occurrences.length > 100) {
            pattern.occurrences = pattern.occurrences.slice(-100);
        }

        this.savePatterns();
    }

    getPatternStats(patternId) {
        return this.patterns[patternId] || null;
    }

    getAllPatterns() {
        return this.patterns;
    }

    getSuccessfulPatterns(minSuccessRate = 0.6) {
        return Object.entries(this.patterns)
            .filter(([_, pattern]) => pattern.successRate >= minSuccessRate)
            .map(([id, pattern]) => ({ id, ...pattern }));
    }

    pruneOldPatterns(daysOld = 30) {
        const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
        let pruned = 0;

        for (const [patternId, pattern] of Object.entries(this.patterns)) {
            const recentOccurrences = pattern.occurrences.filter(o => o.timestamp > cutoff);

            if (recentOccurrences.length === 0) {
                delete this.patterns[patternId];
                pruned++;
            } else {
                pattern.occurrences = recentOccurrences;
            }
        }

        if (pruned > 0) {
            console.log(`🗑️ [PatternMemoryBank] Pruned ${pruned} old patterns`);
            this.savePatterns();
        }

        return pruned;
    }
}

module.exports = PatternMemoryBank;