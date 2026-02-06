#!/usr/bin/env node

/**
 * rag-embeddings.js
 * Semantic RAG with vector embeddings for the Claudito pipeline
 *
 * PURPOSE: Stop going in circles. Before trying a fix, CHECK WHAT WE TRIED BEFORE.
 *
 * Uses local embeddings (no API calls) via @xenova/transformers
 * Hybrid search: keyword matching + semantic similarity
 */

const fs = require('fs');
const path = require('path');
const { ragQuery } = require('./rag-query');

const META_DIR = __dirname;
const LEDGER_FILE = path.join(META_DIR, 'ledger', 'fixes.jsonl');
const VECTOR_DB_FILE = path.join(META_DIR, 'ledger', 'vector_index.json');

class SemanticRAG {
  constructor() {
    this.embedder = null;
    this.vectorDB = [];
    this.initialized = false;
  }

  /**
   * Initialize the embedding model (downloads on first run, ~30MB)
   */
  async init() {
    if (this.initialized) return;

    console.log('🧠 Initializing Semantic RAG...');

    try {
      // Dynamic import for ES module
      const { pipeline } = await import('@xenova/transformers');

      // Use local embedding model - no API calls, runs on CPU
      // all-MiniLM-L6-v2 is small (22M params) but effective
      console.log('📥 Loading embedding model (first run downloads ~30MB)...');
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('✅ Embedding model loaded');

      // Load existing vector index or build from scratch
      await this.loadOrBuildIndex();

      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize SemanticRAG:', error.message);
      console.log('💡 Falling back to keyword-only search');
      this.initialized = false;
    }
  }

  /**
   * Load existing vector index or build from ledger
   */
  async loadOrBuildIndex() {
    if (fs.existsSync(VECTOR_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(VECTOR_DB_FILE, 'utf8'));
      this.vectorDB = data.entries || [];
      console.log(`📚 Loaded ${this.vectorDB.length} entries from vector index`);

      // Check if ledger has new entries
      await this.syncWithLedger();
    } else {
      console.log('🔨 Building vector index from scratch...');
      await this.indexLedger();
    }
  }

  /**
   * Sync vector index with ledger (add new entries)
   */
  async syncWithLedger() {
    if (!fs.existsSync(LEDGER_FILE)) return;

    const ledgerEntries = fs.readFileSync(LEDGER_FILE, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    const indexedIds = new Set(this.vectorDB.map(e => e.id));
    const newEntries = ledgerEntries.filter(e => !indexedIds.has(e.id));

    if (newEntries.length > 0) {
      console.log(`📝 Indexing ${newEntries.length} new ledger entries...`);
      for (const entry of newEntries) {
        await this.indexEntry(entry);
      }
      this.saveIndex();
    }
  }

  /**
   * Index the entire ledger
   */
  async indexLedger() {
    if (!fs.existsSync(LEDGER_FILE)) {
      console.log('⚠️ No ledger file found');
      return;
    }

    const entries = fs.readFileSync(LEDGER_FILE, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    console.log(`📝 Indexing ${entries.length} ledger entries...`);

    for (const entry of entries) {
      await this.indexEntry(entry);
      process.stdout.write('.');
    }
    console.log(' Done!');

    this.saveIndex();
  }

  /**
   * Index a single entry
   */
  async indexEntry(entry) {
    // Combine relevant fields for embedding
    const text = [
      entry.symptom || '',
      entry.root_cause || '',
      entry.minimal_fix || '',
      (entry.tags || []).join(' '),
      (entry.files || []).join(' '),
      (entry.what_worked || []).join(' '),
      (entry.what_failed || []).join(' ')
    ].join(' ').trim();

    const embedding = await this.embed(text);

    this.vectorDB.push({
      id: entry.id,
      date: entry.date,
      severity: entry.severity,
      tags: entry.tags,
      files: entry.files,
      symptom: entry.symptom,
      root_cause: entry.root_cause,
      minimal_fix: entry.minimal_fix,
      what_worked: entry.what_worked || [],
      what_failed: entry.what_failed || [],
      outcome: entry.outcome,
      embedding: embedding,
      indexed_at: new Date().toISOString()
    });
  }

  /**
   * Generate embedding for text
   */
  async embed(text) {
    if (!this.embedder) {
      throw new Error('Embedder not initialized');
    }

    const output = await this.embedder(text, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(output.data);
  }

  /**
   * Save vector index to disk
   */
  saveIndex() {
    const data = {
      version: 1,
      model: 'Xenova/all-MiniLM-L6-v2',
      updated_at: new Date().toISOString(),
      entry_count: this.vectorDB.length,
      entries: this.vectorDB
    };

    fs.writeFileSync(VECTOR_DB_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Saved vector index: ${this.vectorDB.length} entries`);
  }

  /**
   * Cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }

  /**
   * Semantic search - find similar past fixes
   */
  async semanticSearch(query, limit = 5) {
    if (!this.initialized || !this.embedder) {
      console.log('⚠️ Semantic search unavailable, using keyword search');
      return [];
    }

    const queryEmbedding = await this.embed(query);

    const scored = this.vectorDB.map(item => ({
      ...item,
      similarity: this.cosineSimilarity(queryEmbedding, item.embedding)
    }));

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .filter(item => item.similarity > 0.3); // Minimum relevance threshold
  }

  /**
   * HYBRID SEARCH: Combine keyword + semantic for best results
   * This is the main entry point for the Claudito pipeline
   */
  async hybridSearch(query, options = {}) {
    const limit = options.limit || 5;

    console.log(`\n🔍 Hybrid Search: "${query}"\n`);

    // Get keyword results from existing RAG
    const keywordResults = ragQuery(query, { limit });

    // Get semantic results
    let semanticResults = [];
    if (this.initialized) {
      semanticResults = await this.semanticSearch(query, limit);
    }

    // Merge and deduplicate
    const merged = this.mergeResults(keywordResults.ledger, semanticResults);

    return {
      query,
      timestamp: new Date().toISOString(),
      results: merged,
      keyword_count: keywordResults.ledger.length,
      semantic_count: semanticResults.length,
      merged_count: merged.length
    };
  }

  /**
   * Merge keyword and semantic results
   */
  mergeResults(keywordResults, semanticResults) {
    const merged = new Map();

    // Add keyword results (score normalized to 0-100)
    keywordResults.forEach(item => {
      const normalizedScore = Math.min(item._score, 100);
      merged.set(item.id, {
        ...item,
        keyword_score: normalizedScore,
        semantic_score: 0,
        combined_score: normalizedScore,
        match_type: 'keyword'
      });
    });

    // Add/merge semantic results (similarity * 100)
    semanticResults.forEach(item => {
      const semanticScore = item.similarity * 100;
      const existing = merged.get(item.id);

      if (existing) {
        existing.semantic_score = semanticScore;
        existing.combined_score = existing.keyword_score + semanticScore;
        existing.match_type = 'both';
      } else {
        merged.set(item.id, {
          ...item,
          keyword_score: 0,
          semantic_score: semanticScore,
          combined_score: semanticScore,
          match_type: 'semantic'
        });
      }
    });

    // Sort by combined score
    return Array.from(merged.values())
      .sort((a, b) => b.combined_score - a.combined_score);
  }

  /**
   * CRITICAL: Check what FAILED before for similar issues
   * This is what prevents going in circles
   */
  async whatFailedBefore(query) {
    const results = await this.hybridSearch(query, { limit: 10 });

    const failures = [];

    for (const result of results.results) {
      if (result.what_failed && result.what_failed.length > 0) {
        failures.push({
          fix_id: result.id,
          symptom: result.symptom,
          what_failed: result.what_failed,
          why_relevant: result.match_type,
          similarity: result.semantic_score / 100
        });
      }
    }

    if (failures.length > 0) {
      console.log('\n⚠️ THINGS THAT FAILED BEFORE FOR SIMILAR ISSUES:');
      failures.forEach(f => {
        console.log(`\n  [${f.fix_id}] ${f.symptom.slice(0, 60)}...`);
        f.what_failed.forEach(fail => {
          console.log(`    ❌ FAILED: ${fail}`);
        });
      });
      console.log('\n  🛑 DO NOT REPEAT THESE APPROACHES\n');
    }

    return failures;
  }

  /**
   * CRITICAL: Check what WORKED before for similar issues
   */
  async whatWorkedBefore(query) {
    const results = await this.hybridSearch(query, { limit: 10 });

    const successes = [];

    for (const result of results.results) {
      if (result.what_worked && result.what_worked.length > 0) {
        successes.push({
          fix_id: result.id,
          symptom: result.symptom,
          minimal_fix: result.minimal_fix,
          what_worked: result.what_worked,
          files: result.files,
          why_relevant: result.match_type,
          similarity: result.semantic_score / 100
        });
      }
    }

    if (successes.length > 0) {
      console.log('\n✅ APPROACHES THAT WORKED BEFORE FOR SIMILAR ISSUES:');
      successes.forEach(s => {
        console.log(`\n  [${s.fix_id}] ${s.symptom.slice(0, 60)}...`);
        console.log(`    Fix: ${s.minimal_fix.slice(0, 100)}...`);
        s.what_worked.forEach(worked => {
          console.log(`    ✅ WORKED: ${worked}`);
        });
      });
    }

    return successes;
  }

  /**
   * Full context for Claudito pipeline
   * Called before Forensics/Fixer starts work
   */
  async getContextForIssue(issueDescription) {
    console.log('═'.repeat(60));
    console.log('SEMANTIC RAG: CHECKING INSTITUTIONAL MEMORY');
    console.log('═'.repeat(60));

    const failures = await this.whatFailedBefore(issueDescription);
    const successes = await this.whatWorkedBefore(issueDescription);

    return {
      issue: issueDescription,
      timestamp: new Date().toISOString(),
      do_not_repeat: failures,
      try_these_approaches: successes,
      summary: {
        failures_found: failures.length,
        successes_found: successes.length,
        has_prior_knowledge: failures.length > 0 || successes.length > 0
      }
    };
  }
}

// Singleton instance
let instance = null;

async function getSemanticRAG() {
  if (!instance) {
    instance = new SemanticRAG();
    await instance.init();
  }
  return instance;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const query = args.slice(1).join(' ');

  (async () => {
    const rag = await getSemanticRAG();

    if (command === 'index') {
      console.log('Re-indexing entire ledger...');
      rag.vectorDB = [];
      await rag.indexLedger();
    } else if (command === 'search' && query) {
      const results = await rag.hybridSearch(query);
      console.log('\n📊 Results:', JSON.stringify(results, null, 2));
    } else if (command === 'failed' && query) {
      await rag.whatFailedBefore(query);
    } else if (command === 'worked' && query) {
      await rag.whatWorkedBefore(query);
    } else if (command === 'context' && query) {
      const context = await rag.getContextForIssue(query);
      console.log('\n📋 Full Context:', JSON.stringify(context, null, 2));
    } else {
      console.log('Usage:');
      console.log('  node rag-embeddings.js index                    # Rebuild vector index');
      console.log('  node rag-embeddings.js search <query>           # Hybrid search');
      console.log('  node rag-embeddings.js failed <query>           # What failed before?');
      console.log('  node rag-embeddings.js worked <query>           # What worked before?');
      console.log('  node rag-embeddings.js context <issue>          # Full context for pipeline');
      console.log('');
      console.log('Examples:');
      console.log('  node rag-embeddings.js search "pattern memory not saving"');
      console.log('  node rag-embeddings.js failed "state desync"');
      console.log('  node rag-embeddings.js context "bot buying on wrong signals"');
    }
  })();
}

module.exports = { SemanticRAG, getSemanticRAG };
