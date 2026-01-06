const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

class TRAIMemoryStore {
    constructor(config = {}) {
        this.storePath = config.storePath || path.join(__dirname, 'trai_memory_store.json');
        this.embeddingDimensions = config.embeddingDimensions || 128;
        this.chunkSize = config.chunkSize || 600;
        this.topK = config.topK || 5;
        this.embeddingProvider = (config.embeddingProvider || process.env.TRAI_EMBEDDING_PROVIDER || 'lexical').toLowerCase();
        this.embeddingConfig = {
            model: config.embeddingModel || process.env.TRAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            apiKey: config.embeddingApiKey || process.env.OPENAI_API_KEY,
            endpoint: config.embeddingEndpoint || process.env.TRAI_EMBEDDING_ENDPOINT,
            dimensions: config.embeddingDimensions || Number(process.env.TRAI_EMBEDDING_DIMENSIONS) || this.embeddingDimensions
        };
        this.store = this.loadStore();
    }

    loadStore() {
        try {
            if (fs.existsSync(this.storePath)) {
                const data = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
                return this.validateStore(data);
            }
        } catch (error) {
            console.warn('⚠️ [TRAI Memory] Failed to load store, creating new:', error.message);
        }

        return {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            entries: []
        };
    }

    validateStore(data) {
        return {
            version: data.version || '1.0.0',
            createdAt: data.createdAt || new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            entries: Array.isArray(data.entries) ? data.entries : []
        };
    }

    saveStore() {
        const payload = {
            ...this.store,
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(this.storePath, JSON.stringify(payload, null, 2));
    }

    chunkContent(text) {
        if (!text || typeof text !== 'string') return [];

        const normalized = text.replace(/\s+/g, ' ').trim();
        if (!normalized) return [];

        const chunks = [];
        for (let i = 0; i < normalized.length; i += this.chunkSize) {
            chunks.push(normalized.slice(i, i + this.chunkSize));
        }

        return chunks;
    }

    normalizeVector(vector = []) {
        const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
        return vector.map(value => value / magnitude);
    }

    lexicalEmbed(text) {
        const vector = new Array(this.embeddingDimensions).fill(0);
        const tokens = (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];

        for (const token of tokens) {
            const hash = crypto.createHash('md5').update(token).digest('hex');
            const bucket = parseInt(hash.slice(0, 8), 16) % this.embeddingDimensions;
            vector[bucket] += 1;
        }

        return this.normalizeVector(vector);
    }

    async fetchOpenAIEmbedding(text) {
        if (!this.embeddingConfig.apiKey) return null;

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.embeddingConfig.apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: this.embeddingConfig.model
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI embedding failed: ${response.status} ${errorText}`);
            }

            const payload = await response.json();
            const embedding = payload?.data?.[0]?.embedding;
            return Array.isArray(embedding) ? this.normalizeVector(embedding) : null;
        } catch (error) {
            console.warn('⚠️ [TRAI Memory] OpenAI embedding fallback to lexical:', error.message);
            return null;
        }
    }

    async fetchHttpEmbedding(text) {
        if (!this.embeddingConfig.endpoint) return null;

        try {
            const response = await fetch(this.embeddingConfig.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text, model: this.embeddingConfig.model })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP embedding failed: ${response.status} ${errorText}`);
            }

            const payload = await response.json();
            const embedding = payload?.embedding || payload?.data?.embedding;
            return Array.isArray(embedding) ? this.normalizeVector(embedding) : null;
        } catch (error) {
            console.warn('⚠️ [TRAI Memory] HTTP embedding fallback to lexical:', error.message);
            return null;
        }
    }

    async embed(text) {
        let vector = null;

        if (this.embeddingProvider === 'openai') {
            vector = await this.fetchOpenAIEmbedding(text);
        } else if (this.embeddingProvider === 'http') {
            vector = await this.fetchHttpEmbedding(text);
        }

        if (!vector) {
            vector = this.lexicalEmbed(text);
        }

        return vector;
    }

    cosineSimilarity(a, b) {
        const length = Math.min(a.length, b.length);
        let dot = 0;
        let magA = 0;
        let magB = 0;

        for (let i = 0; i < length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }

        if (magA === 0 || magB === 0) return 0;
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    async ingestEntries(entries = []) {
        if (!Array.isArray(entries)) {
            throw new Error('Memory ingestion expects an array of entries');
        }

        const ingested = [];
        for (const entry of entries) {
            if (!entry || typeof entry.content !== 'string' || !entry.content.trim()) {
                continue;
            }

            const base = {
                authority: Math.max(0, Math.min(Number(entry.authority) || 0.5, 1)),
                source: entry.source || 'unknown',
                tags: Array.isArray(entry.tags) ? entry.tags : [],
                createdAt: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString()
            };

            const chunks = this.chunkContent(entry.content);
            for (const chunk of chunks) {
                const embedding = await this.embed(chunk);
                const record = {
                    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                    content: chunk,
                    embedding,
                    ...base
                };

                this.store.entries.push(record);
                ingested.push(record);
            }
        }

        if (ingested.length > 0) {
            this.saveStore();
        }

        return ingested;
    }

    recencyBoost(createdAt) {
        const ageMs = Date.now() - new Date(createdAt).getTime();
        const decay = 1000 * 60 * 60 * 24 * 14; // two weeks half-life
        return Math.exp(-ageMs / decay);
    }

    rerank(results) {
        const deduped = [];
        for (const result of results.sort((a, b) => b.score - a.score)) {
            const isDuplicate = deduped.some(existing => {
                const overlap = this.cosineSimilarity(existing.entry.embedding, result.entry.embedding);
                return overlap > 0.92;
            });

            if (!isDuplicate) {
                deduped.push(result);
            }
        }

        return deduped
            .map((result, index) => ({ ...result, rank: index + 1 }))
            .slice(0, this.topK);
    }

    async retrieve(query, options = {}) {
        const topK = options.topK || this.topK;
        const queryEmbedding = await this.embed(query);
        const scored = [];

        for (const entry of this.store.entries) {
            const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
            if (similarity <= 0) continue;

            const recency = this.recencyBoost(entry.createdAt);
            const authorityMultiplier = 0.6 + entry.authority * 0.4;
            const score = similarity * authorityMultiplier + recency * 0.2;

            if (score > 0) {
                scored.push({ entry, score, similarity, recency });
            }
        }

        const reranked = this.rerank(scored);
        return reranked.slice(0, topK);
    }

    getStats() {
        return {
            entries: this.store.entries.length,
            lastUpdated: this.store.lastUpdated,
            createdAt: this.store.createdAt
        };
    }
}

module.exports = TRAIMemoryStore;
