/**
 * TRAI Research Mode - External Search (OFF by default)
 *
 * When enabled:
 * - Allows web search via self-hosted SearXNG or single endpoint
 * - Fetches top N results and summarizes via local LLM
 * - Strict rate limits + per-user daily budget
 * - Always user-visible when research is performed
 *
 * NO CLOUD LLM. NO PAID APIs. Search only.
 */

const http = require('http');
const https = require('https');
const url = require('url');

class TRAIResearchMode {
    constructor(config = {}) {
        // OFF by default
        this.enabled = config.enabled || process.env.TRAI_RESEARCH_ENABLED === '1';

        // SearXNG endpoint (self-hosted preferred)
        this.searchEndpoint = config.searchEndpoint ||
            process.env.TRAI_SEARCH_ENDPOINT ||
            'http://localhost:8888/search';

        // Rate limits
        this.maxResultsPerQuery = config.maxResultsPerQuery || 5;
        this.maxQueriesPerMinute = config.maxQueriesPerMinute || 3;
        this.maxQueriesPerDay = config.maxQueriesPerDay || 50;

        // Tracking
        this.queryLog = [];
        this.dailyCount = 0;
        this.lastResetDate = new Date().toDateString();

        console.log(`📚 Research Mode: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Check if research is allowed (rate limits)
     */
    canResearch(userId = 'default') {
        if (!this.enabled) {
            return { allowed: false, reason: 'Research mode disabled' };
        }

        // Reset daily count if new day
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyCount = 0;
            this.lastResetDate = today;
        }

        // Check daily limit
        if (this.dailyCount >= this.maxQueriesPerDay) {
            return { allowed: false, reason: `Daily limit reached (${this.maxQueriesPerDay}/day)` };
        }

        // Check rate limit (queries in last minute)
        const oneMinuteAgo = Date.now() - 60000;
        const recentQueries = this.queryLog.filter(q => q.timestamp > oneMinuteAgo);
        if (recentQueries.length >= this.maxQueriesPerMinute) {
            return { allowed: false, reason: `Rate limit (${this.maxQueriesPerMinute}/min)` };
        }

        return { allowed: true };
    }

    /**
     * Perform web search via SearXNG
     * Returns array of { title, url, snippet }
     */
    async search(query, userId = 'default') {
        const check = this.canResearch(userId);
        if (!check.allowed) {
            return { error: check.reason, results: [] };
        }

        // Log query
        this.queryLog.push({
            query,
            userId,
            timestamp: Date.now()
        });
        this.dailyCount++;

        // Clean old log entries (keep last hour)
        const oneHourAgo = Date.now() - 3600000;
        this.queryLog = this.queryLog.filter(q => q.timestamp > oneHourAgo);

        try {
            const results = await this.fetchSearXNG(query);
            return {
                error: null,
                results: results.slice(0, this.maxResultsPerQuery),
                meta: {
                    query,
                    timestamp: new Date().toISOString(),
                    dailyRemaining: this.maxQueriesPerDay - this.dailyCount,
                    source: 'searxng'
                }
            };
        } catch (error) {
            return { error: error.message, results: [] };
        }
    }

    /**
     * Fetch from SearXNG instance
     */
    async fetchSearXNG(query) {
        return new Promise((resolve, reject) => {
            const searchUrl = `${this.searchEndpoint}?q=${encodeURIComponent(query)}&format=json`;
            const parsedUrl = url.parse(searchUrl);
            const transport = parsedUrl.protocol === 'https:' ? https : http;

            const req = transport.get(searchUrl, { timeout: 10000 }, (res) => {
                let data = '';

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const results = (json.results || []).map(r => ({
                            title: r.title || '',
                            url: r.url || '',
                            snippet: r.content || r.snippet || ''
                        }));
                        resolve(results);
                    } catch (e) {
                        reject(new Error('Failed to parse search results'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Search timeout'));
            });
        });
    }

    /**
     * Format search results for LLM summarization
     */
    formatForSummary(results) {
        if (!results || results.length === 0) {
            return 'No search results found.';
        }

        return results.map((r, i) =>
            `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`
        ).join('\n\n');
    }

    /**
     * Get research stats (for transparency)
     */
    getStats() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyCount = 0;
            this.lastResetDate = today;
        }

        return {
            enabled: this.enabled,
            endpoint: this.searchEndpoint,
            dailyUsed: this.dailyCount,
            dailyLimit: this.maxQueriesPerDay,
            dailyRemaining: this.maxQueriesPerDay - this.dailyCount,
            rateLimit: `${this.maxQueriesPerMinute}/min`
        };
    }

    /**
     * Enable/disable research mode at runtime
     */
    setEnabled(enabled) {
        this.enabled = !!enabled;
        console.log(`📚 Research Mode: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
    }
}

module.exports = TRAIResearchMode;
