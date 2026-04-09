/**
 * Mercury Bridge — Searcher (Layer 2: Hybrid Retrieval)
 * ══════════════════════════════════════════════════════════════
 * Query-time retrieval with:
 *   1. Cosine similarity (semantic — existing)
 *   2. BM25 keyword scoring (lexical — new)
 *   3. Reciprocal Rank Fusion merge (RRF — new)
 *   4. Content-type-aware boost multipliers (new)
 *
 * Fallback: set HYBRID_ENABLED=false to revert to pure semantic search.
 *
 * Rewritten 2026-04-08 for Layer 2 hybrid retrieval.
 */

'use strict';

const path = require('path');

const config = require('./config');
const MongoStore = require('./mongo-store');
const { embedText } = require('./indexer');

const PersistentLLMClient = require(
  path.join(config.REPO_ROOT, 'core', 'persistent_llm_client.js')
);

// ─────────────────────────────────────────────────────────────
// COSINE SIMILARITY
// ─────────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ─────────────────────────────────────────────────────────────
// BM25 SCORING
// ─────────────────────────────────────────────────────────────

/**
 * Tokenize text into lowercase terms. Simple whitespace + punctuation split.
 * Good enough for BM25 on code — doesn't need a full NLP tokenizer.
 */
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9_]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

/**
 * Build BM25 index from an array of chunks.
 * Returns { idf, avgDl, docLengths, docTermFreqs } needed for scoring.
 */
function buildBM25Index(chunks) {
  const N = chunks.length;
  const df = {};  // document frequency: term -> count of docs containing it
  const docTermFreqs = [];  // per-doc term frequencies
  const docLengths = [];
  let totalLength = 0;

  for (let i = 0; i < chunks.length; i++) {
    const terms = tokenize(chunks[i].text || '');
    docLengths.push(terms.length);
    totalLength += terms.length;

    const tf = {};
    const seen = new Set();
    for (const t of terms) {
      tf[t] = (tf[t] || 0) + 1;
      if (!seen.has(t)) {
        df[t] = (df[t] || 0) + 1;
        seen.add(t);
      }
    }
    docTermFreqs.push(tf);
  }

  const avgDl = totalLength / N;

  // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
  const idf = {};
  for (const [term, docFreq] of Object.entries(df)) {
    idf[term] = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }

  return { idf, avgDl, docLengths, docTermFreqs };
}

/**
 * Score a single document against a query using BM25.
 */
function scoreBM25(queryTerms, docIdx, bm25Index) {
  const { idf, avgDl, docLengths, docTermFreqs } = bm25Index;
  const k1 = config.BM25_K1;
  const b = config.BM25_B;
  const dl = docLengths[docIdx];
  const tf = docTermFreqs[docIdx];

  let score = 0;
  for (const qt of queryTerms) {
    const termIdf = idf[qt] || 0;
    const termTf = tf[qt] || 0;
    const num = termTf * (k1 + 1);
    const den = termTf + k1 * (1 - b + b * (dl / avgDl));
    score += termIdf * (num / den);
  }
  return score;
}

// ─────────────────────────────────────────────────────────────
// CODE-FLAVORED QUERY DETECTION + KIND MODIFIER
// ─────────────────────────────────────────────────────────────

/**
 * Detect whether a query looks code-flavored (camelCase, snake_case,
 * dotted identifiers, code keywords, file extensions). When true,
 * kind-based modifiers are applied during RRF merge so actual code
 * chunks outrank prose docs that mention the same tokens.
 */
function isCodeFlavoredQuery(query) {
  if (!query || typeof query !== 'string') return false;
  if (/[a-z][A-Z]/.test(query)) return true;                    // camelCase
  if (/[a-zA-Z]_[a-zA-Z]/.test(query)) return true;             // snake_case
  if (/\b\w+\.\w+\b/.test(query)) return true;                  // dotted
  const codeKeywords = /\b(function|class|method|variable|const|let|return|import|require|module|export|interface|enum|async|await|throw|catch)\b/i;
  if (codeKeywords.test(query)) return true;
  if (/\.(js|ts|mjs|cjs|json|jsonl|md|py|sh)\b/i.test(query)) return true;
  return false;
}

const KIND_MODIFIER_CODE_QUERY = {
  doc_section: 0.7,
  method: 1.3,
  'function': 1.3,
  jsonl_record: 1.1,
  json: 1.0,
  window: 1.0,
};

// ─────────────────────────────────────────────────────────────
// QUERY CLASSIFIER
// ─────────────────────────────────────────────────────────────

/**
 * Lightweight heuristic classifier that determines which content_types
 * should get a boost for this query. Returns a map of content_type → multiplier.
 */
function classifyQuery(query) {
  const q = query.toLowerCase();
  const boosts = {};

  // Historical / debugging questions → boost fix_history + landmine
  if (/\b(bug|fix|broke|crash|error|fail|issue|landmine|gotcha)\b/.test(q) ||
      /\b(have we|has there|ever been|previously|before|history|historical)\b/.test(q)) {
    boosts['fix_history'] = config.CONTENT_TYPE_BOOST_STRONG;
    boosts['landmine'] = config.CONTENT_TYPE_BOOST_WEAK;
    boosts['recent_changes'] = config.CONTENT_TYPE_BOOST_WEAK;
  }

  // Architecture / design questions → boost project_context + guardrails
  if (/\b(architect|design|overview|purpose|vision|how does .* work|module|layer)\b/.test(q)) {
    boosts['project_context'] = config.CONTENT_TYPE_BOOST_STRONG;
    boosts['guardrails'] = config.CONTENT_TYPE_BOOST_WEAK;
  }

  // Rules / safety questions → boost guardrails
  if (/\b(rule|guardrail|forbidden|never|must not|safety|allowed)\b/.test(q)) {
    boosts['guardrails'] = config.CONTENT_TYPE_BOOST_STRONG;
    boosts['landmine'] = config.CONTENT_TYPE_BOOST_WEAK;
  }

  // Changelog / what changed questions → boost changelog + recent_changes
  if (/\b(change|changelog|recent|latest|what.*changed|update|commit)\b/.test(q)) {
    boosts['changelog'] = config.CONTENT_TYPE_BOOST_STRONG;
    boosts['recent_changes'] = config.CONTENT_TYPE_BOOST_STRONG;
  }

  return boosts;
}

// ─────────────────────────────────────────────────────────────
// RECIPROCAL RANK FUSION
// ─────────────────────────────────────────────────────────────

/**
 * Merge two ranked lists via Reciprocal Rank Fusion.
 * Each item appears at most once in the output, scored by:
 *   RRF_score = sum over lists of 1 / (k + rank_in_list)
 *
 * Then apply content_type boost multipliers from classifyQuery.
 */
function rrfMerge(semanticRanked, bm25Ranked, boosts, k) {
  const scores = new Map();  // chunkIdx → RRF score

  for (let i = 0; i < semanticRanked.length; i++) {
    const idx = semanticRanked[i].idx;
    scores.set(idx, (scores.get(idx) || 0) + 1 / (k + i + 1));
  }

  for (let i = 0; i < bm25Ranked.length; i++) {
    const idx = bm25Ranked[i].idx;
    scores.set(idx, (scores.get(idx) || 0) + 1 / (k + i + 1));
  }

  // Apply content_type boost
  if (Object.keys(boosts).length > 0) {
    for (const [idx, score] of scores) {
      const ct = semanticRanked.find(s => s.idx === idx)?.contentType ||
                 bm25Ranked.find(s => s.idx === idx)?.contentType ||
                 'general';
      const mult = boosts[ct] || 1.0;
      scores.set(idx, score * mult);
    }
  }

  // Sort by RRF score descending
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([idx, score]) => ({ idx, score }));
}

// ─────────────────────────────────────────────────────────────
// HYBRID RETRIEVAL
// ─────────────────────────────────────────────────────────────

/**
 * Retrieve top-K chunks.
 *
 * Modes (via opts.retrievalMode):
 *   'semantic'           — pure cosine similarity (Layer 1 behavior)
 *   'hybrid'             — BM25 + semantic + RRF, NO auto-classifier boost
 *   'hybrid-classified'  — full Layer 2: BM25 + semantic + RRF + classifyQuery boost
 *   null/undefined       — uses config.HYBRID_ENABLED to pick hybrid-classified or semantic
 *
 * opts.boostType: manual content_type to boost (e.g. 'fix_history'). Takes
 * priority over classifyQuery auto-detection.
 */
async function retrieveTopK(store, queryEmbedding, k, query, opts = {}) {
  const allChunks = await store.fetchAllForScoring();
  if (allChunks.length === 0) return [];

  const pool = config.HYBRID_CANDIDATE_POOL;

  // Determine effective mode
  let mode = opts.retrievalMode || (config.HYBRID_ENABLED ? 'hybrid-classified' : 'semantic');

  // --- Semantic scoring (always needed) ---
  const semanticScored = [];
  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    if (!chunk.embedding || chunk.embedding.length !== queryEmbedding.length) continue;
    const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
    semanticScored.push({ idx: i, sim, contentType: chunk.content_type || 'general' });
  }
  semanticScored.sort((a, b) => b.sim - a.sim);
  const semanticTop = semanticScored.slice(0, pool);

  // --- Pure semantic mode ---
  if (mode === 'semantic' || !query) {
    const topK = semanticTop.slice(0, k);
    const topIds = topK.map(s => allChunks[s.idx]._id);
    const fullDocs = await store.fetchByIds(topIds);
    const fullById = new Map(fullDocs.map(d => [String(d._id), d]));

    return topK.map(s => ({
      ...fullById.get(String(allChunks[s.idx]._id)),
      similarity: s.sim,
      retrieval_mode: 'semantic',
    }));
  }

  // --- BM25 scoring ---
  const bm25Index = buildBM25Index(allChunks);
  const queryTerms = tokenize(query);
  const bm25Scored = [];
  for (let i = 0; i < allChunks.length; i++) {
    const score = scoreBM25(queryTerms, i, bm25Index);
    if (score > 0) {
      bm25Scored.push({ idx: i, score, contentType: allChunks[i].content_type || 'general' });
    }
  }
  bm25Scored.sort((a, b) => b.score - a.score);
  const bm25Top = bm25Scored.slice(0, pool);

  // --- Determine boosts ---
  let boosts = {};
  if (opts.boostType) {
    // Manual boost takes priority
    boosts[opts.boostType] = config.CONTENT_TYPE_BOOST_STRONG;
  } else if (mode === 'hybrid-classified') {
    // Auto-classify only in hybrid-classified mode
    boosts = classifyQuery(query);
  }
  // mode === 'hybrid' with no boostType → empty boosts → raw RRF

  // --- RRF merge ---
  let merged = rrfMerge(semanticTop, bm25Top, boosts, config.RRF_K);

  // Kind-aware modifier for code-flavored queries — penalizes doc_section
  // chunks that BM25 over-rewards with prose containing query terms
  if (isCodeFlavoredQuery(query)) {
    merged = merged.map(({ idx, score }) => {
      const kind = allChunks[idx].kind || 'window';
      const modifier = KIND_MODIFIER_CODE_QUERY[kind] || 1.0;
      return { idx, score: score * modifier };
    });
    merged.sort((a, b) => b.score - a.score);
  }

  const topK = merged.slice(0, k);

  // Hydrate winners with full text
  const topIds = topK.map(s => allChunks[s.idx]._id);
  const fullDocs = await store.fetchByIds(topIds);
  const fullById = new Map(fullDocs.map(d => [String(d._id), d]));

  return topK.map(s => {
    const full = fullById.get(String(allChunks[s.idx]._id)) || {};
    return {
      ...full,
      similarity: semanticScored.find(ss => ss.idx === s.idx)?.sim || 0,
      rrf_score: s.score,
      retrieval_mode: mode,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// PROMPT ASSEMBLY (unchanged from Layer 1)
// ─────────────────────────────────────────────────────────────

function buildPrompt(userQuery, retrievedChunks) {
  const lines = [];

  lines.push(config.MERCURY_SYSTEM_PROMPT);
  lines.push('');
  lines.push('─── RETRIEVED CODE CONTEXT ───');
  lines.push('');

  retrievedChunks.forEach((chunk, idx) => {
    const header = `### [${idx + 1}] ${chunk.file_path}:${chunk.start_line}-${chunk.end_line}`;
    const subheader = `[kind: ${chunk.kind} | name: ${chunk.name} | similarity: ${(chunk.similarity || 0).toFixed(3)}]`;
    lines.push(header);
    lines.push(subheader);
    lines.push('```');
    lines.push(chunk.text);
    lines.push('```');
    lines.push('');
  });

  lines.push('─── END RETRIEVED CONTEXT ───');
  lines.push('');
  lines.push('USER QUERY:');
  lines.push(userQuery);
  lines.push('');
  lines.push('Answer using ONLY the retrieved context above. Cite file:line for every factual claim.');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// MAIN ASK FUNCTION
// ─────────────────────────────────────────────────────────────

async function ask(query, opts = {}) {
  const topK = opts.topK || config.RETRIEVE_TOP_K;
  const maxTokens = opts.maxTokens || 2000;
  const verbose = opts.verbose !== false;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('ask() requires a non-empty query string');
  }

  const t0 = Date.now();
  const store = new MongoStore();
  await store.connect();

  try {
    const health = await store.healthCheck();
    if (!health.ok) throw new Error(`MongoDB health check failed: ${health.error}`);
    if (health.chunkCount === 0) throw new Error('No chunks in index. Run indexer.js first.');

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Index contains ${health.chunkCount} chunks`);
      console.log(`[MERCURY-BRIDGE] Hybrid retrieval: ${config.HYBRID_ENABLED ? 'ON' : 'OFF (pure semantic)'}`);
      console.log('[MERCURY-BRIDGE] Embedding query...');
    }

    const queryEmbedding = await embedText(query);

    if (verbose) console.log(`[MERCURY-BRIDGE] Retrieving top ${topK} chunks...`);
    const topChunks = await retrieveTopK(store, queryEmbedding, topK, query);

    if (topChunks.length === 0) {
      return { answer: 'No matching chunks found in the index.', chunks: [], latencyMs: Date.now() - t0 };
    }

    if (verbose) {
      console.log('[MERCURY-BRIDGE] Top matches:');
      topChunks.forEach((c, idx) => {
        const rrfTag = c.rrf_score ? ` rrf=${c.rrf_score.toFixed(4)}` : '';
        console.log(`  ${idx + 1}. ${c.file_path}:${c.start_line}-${c.end_line} ` +
          `(${c.kind}: ${c.name}) sim=${(c.similarity || 0).toFixed(3)}${rrfTag}`);
      });
    }

    const prompt = buildPrompt(query, topChunks);

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Prompt length: ${prompt.length} chars`);
      console.log('[MERCURY-BRIDGE] Calling Mercury-2...');
    }

    const client = new PersistentLLMClient({ provider: 'mercury' });
    await client.initialize();
    const answer = await client.generateResponse(prompt, maxTokens);

    const latencyMs = Date.now() - t0;
    if (verbose) console.log(`[MERCURY-BRIDGE] Mercury responded in ${latencyMs}ms`);

    return { answer, chunks: topChunks, latencyMs };

  } finally {
    await store.disconnect();
  }
}

module.exports = { ask, retrieveTopK, buildPrompt, cosineSimilarity, isCodeFlavoredQuery };
