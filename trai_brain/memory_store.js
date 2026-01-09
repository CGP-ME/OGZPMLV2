/**
 * TRAI Memory Store - Local-First Journal System
 *
 * NO EMBEDDINGS. NO CLOUD CALLS.
 * Uses keyword+recency retrieval over append-only jsonl journal.
 * Static brain files are read-only at runtime.
 */

const fs = require('fs');
const path = require('path');

class TRAIMemoryStore {
    constructor(config = {}) {
        this.journalPath = config.journalPath || path.join(__dirname, 'trai_journal.jsonl');
        this.staticBrainPath = config.staticBrainPath || __dirname;
        this.maxJournalEntries = config.maxJournalEntries || 1000;
        this.topK = config.topK || 5;

        // Ensure journal file exists
        if (!fs.existsSync(this.journalPath)) {
            fs.writeFileSync(this.journalPath, '');
        }
    }

    /**
     * Append entry to journal (interactions, decisions, mistakes, outcomes)
     */
    appendToJournal(entry) {
        const record = {
            id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            type: entry.type || 'interaction',
            content: entry.content,
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            outcome: entry.outcome || null,
            source: entry.source || 'unknown'
        };

        fs.appendFileSync(this.journalPath, JSON.stringify(record) + '\n');
        return record;
    }

    /**
     * Read last N entries from journal
     */
    readRecentJournal(limit = 100) {
        if (!fs.existsSync(this.journalPath)) {
            return [];
        }

        const content = fs.readFileSync(this.journalPath, 'utf8').trim();
        if (!content) return [];

        const lines = content.split('\n').filter(Boolean);
        const entries = [];

        // Read from end (most recent first)
        const start = Math.max(0, lines.length - limit);
        for (let i = lines.length - 1; i >= start; i--) {
            try {
                entries.push(JSON.parse(lines[i]));
            } catch (e) {
                // Skip malformed lines
            }
        }

        return entries;
    }

    /**
     * Keyword+recency retrieval (NO EMBEDDINGS)
     * Searches journal and static brain for matching keywords
     */
    retrieve(query, options = {}) {
        const topK = options.topK || this.topK;
        const keywords = this.extractKeywords(query);
        const results = [];

        // Search recent journal entries
        const journalEntries = this.readRecentJournal(this.maxJournalEntries);
        for (const entry of journalEntries) {
            const score = this.scoreEntry(entry.content, keywords, entry.timestamp);
            if (score > 0) {
                results.push({
                    entry: {
                        content: entry.content,
                        source: entry.source,
                        tags: entry.tags,
                        type: entry.type
                    },
                    score,
                    recency: this.recencyScore(entry.timestamp)
                });
            }
        }

        // Sort by score (keyword match + recency)
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, topK);
    }

    /**
     * Extract keywords from query (simple tokenization)
     */
    extractKeywords(text) {
        if (!text || typeof text !== 'string') return [];

        // Remove common stop words, keep significant terms
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'could', 'should', 'may', 'might', 'must', 'shall',
            'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
            'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
            'through', 'during', 'before', 'after', 'above', 'below',
            'between', 'under', 'again', 'further', 'then', 'once',
            'here', 'there', 'when', 'where', 'why', 'how', 'all',
            'each', 'few', 'more', 'most', 'other', 'some', 'such',
            'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
            'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
            'until', 'while', 'although', 'though', 'after', 'before',
            'what', 'which', 'who', 'whom', 'this', 'that', 'these',
            'those', 'am', 'it', 'its', 'i', 'me', 'my', 'myself',
            'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
            'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
            'she', 'her', 'hers', 'herself', 'they', 'them', 'their'
        ]);

        return text.toLowerCase()
            .match(/[a-z0-9]+/g)
            ?.filter(word => word.length > 2 && !stopWords.has(word)) || [];
    }

    /**
     * Score entry based on keyword matches and recency
     */
    scoreEntry(content, keywords, timestamp) {
        if (!content || !keywords.length) return 0;

        const contentLower = content.toLowerCase();
        let matches = 0;

        for (const keyword of keywords) {
            if (contentLower.includes(keyword)) {
                matches++;
            }
        }

        if (matches === 0) return 0;

        // Keyword match ratio (0-1)
        const keywordScore = matches / keywords.length;

        // Recency boost (0-1)
        const recency = this.recencyScore(timestamp);

        // Combined score: 70% keywords, 30% recency
        return keywordScore * 0.7 + recency * 0.3;
    }

    /**
     * Calculate recency score (exponential decay, 7-day half-life)
     */
    recencyScore(timestamp) {
        const ageMs = Date.now() - new Date(timestamp).getTime();
        const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days
        return Math.exp(-ageMs / halfLife);
    }

    /**
     * Record interaction for learning
     */
    recordInteraction(query, response, context = {}) {
        return this.appendToJournal({
            type: 'interaction',
            content: `Q: ${query}\nA: ${typeof response === 'string' ? response : JSON.stringify(response)}`,
            tags: context.tags || [],
            source: 'chat'
        });
    }

    /**
     * Record decision (trade signal, pattern promotion, etc.)
     */
    recordDecision(decision, reasoning, outcome = null) {
        return this.appendToJournal({
            type: 'decision',
            content: `Decision: ${decision}\nReasoning: ${reasoning}`,
            outcome,
            source: 'system'
        });
    }

    /**
     * Record mistake for learning
     */
    recordMistake(description, context = {}) {
        return this.appendToJournal({
            type: 'mistake',
            content: description,
            tags: context.tags || ['error'],
            source: context.source || 'system'
        });
    }

    /**
     * Record outcome (trade result, pattern performance, etc.)
     */
    recordOutcome(description, metrics = {}) {
        return this.appendToJournal({
            type: 'outcome',
            content: `${description}\nMetrics: ${JSON.stringify(metrics)}`,
            outcome: metrics,
            source: 'system'
        });
    }

    /**
     * Get journal statistics
     */
    getStats() {
        const entries = this.readRecentJournal(this.maxJournalEntries);
        const byType = {};

        for (const entry of entries) {
            byType[entry.type] = (byType[entry.type] || 0) + 1;
        }

        return {
            totalEntries: entries.length,
            byType,
            journalPath: this.journalPath,
            oldestEntry: entries.length > 0 ? entries[entries.length - 1].timestamp : null,
            newestEntry: entries.length > 0 ? entries[0].timestamp : null
        };
    }

    /**
     * Prune old entries (keep last N)
     */
    pruneJournal(keepCount = 500) {
        const entries = this.readRecentJournal(this.maxJournalEntries);

        if (entries.length <= keepCount) {
            return 0;
        }

        // Keep only the most recent entries
        const toKeep = entries.slice(0, keepCount);

        // Rewrite journal file (oldest first)
        const lines = toKeep.reverse().map(e => JSON.stringify(e)).join('\n') + '\n';
        fs.writeFileSync(this.journalPath, lines);

        return entries.length - keepCount;
    }
}

module.exports = TRAIMemoryStore;
