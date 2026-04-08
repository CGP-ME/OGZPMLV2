/**
 * Mercury Bridge — Searcher
 * ══════════════════════════════════════════════════════════════
 * Query-time logic: embed the question, retrieve top-K chunks via
 * cosine similarity, assemble a Mercury prompt with those chunks as
 * context, call Mercury via the existing persistent_llm_client, and
 * return the answer.
 *
 * Used by ask.js (CLI) and can be imported by TRAI for in-process
 * queries during refactor validation.
 */

'use strict';

const path = require('path');

const config = require('./config');
const MongoStore = require('./mongo-store');
const { embedText } = require('./indexer');

// Resolve the existing persistent_llm_client from the repo's core/ directory
// Avoids depending on the trai_brain/ shim and keeps the import path explicit.
const PersistentLLMClient = require(
  path.join(config.REPO_ROOT, 'core', 'persistent_llm_client.js')
);

// ─────────────────────────────────────────────────────────────
// COSINE SIMILARITY
// ─────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * Both vectors must have the same length (768 for nomic-embed-text).
 */
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
// RETRIEVAL
// ─────────────────────────────────────────────────────────────

/**
 * Given a query embedding, retrieve the top-K chunks by cosine similarity.
 * Fetches all chunk metadata + embeddings, scores in JS, returns winners.
 */
async function retrieveTopK(store, queryEmbedding, k) {
  const allChunks = await store.fetchAllForScoring();
  if (allChunks.length === 0) {
    return [];
  }

  // Score everything
  const scored = [];
  for (const chunk of allChunks) {
    if (!chunk.embedding || chunk.embedding.length !== queryEmbedding.length) continue;
    const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
    scored.push({ chunk, sim });
  }

  // Sort descending by similarity
  scored.sort((a, b) => b.sim - a.sim);

  // Take top-K
  const topK = scored.slice(0, k);

  // Hydrate with full text
  const topIds = topK.map((s) => s.chunk._id);
  const fullDocs = await store.fetchByIds(topIds);
  const fullById = new Map(fullDocs.map((d) => [String(d._id), d]));

  return topK.map((s) => ({
    ...fullById.get(String(s.chunk._id)),
    similarity: s.sim,
  }));
}

// ─────────────────────────────────────────────────────────────
// PROMPT ASSEMBLY
// ─────────────────────────────────────────────────────────────

/**
 * Build the prompt string that gets sent to Mercury.
 * The existing persistent_llm_client sends the system prompt separately
 * via its own configuration, but we want a mercury-bridge-specific system
 * prompt, so we prepend it to the user prompt and rely on Mercury to
 * follow the most recent instruction block.
 *
 * An alternative (cleaner) approach would be to extend persistent_llm_client
 * with a method that accepts a custom system prompt per call. Deferred to v2.
 */
function buildPrompt(userQuery, retrievedChunks) {
  const lines = [];

  lines.push(config.MERCURY_SYSTEM_PROMPT);
  lines.push('');
  lines.push('─── RETRIEVED CODE CONTEXT ───');
  lines.push('');

  retrievedChunks.forEach((chunk, idx) => {
    const header = `### [${idx + 1}] ${chunk.file_path}:${chunk.start_line}-${chunk.end_line}`;
    const subheader = `[kind: ${chunk.kind} | name: ${chunk.name} | similarity: ${chunk.similarity.toFixed(3)}]`;
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

/**
 * Ask Mercury a question about the codebase.
 *
 * @param {string} query - The user's question
 * @param {Object} [opts]
 * @param {number} [opts.topK] - Number of chunks to retrieve (default from config)
 * @param {number} [opts.maxTokens] - Max tokens for Mercury response
 * @param {boolean} [opts.verbose] - Print progress and retrieval details
 *
 * @returns {Promise<{answer: string, chunks: Array, latencyMs: number}>}
 */
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
    // Ensure we actually have an index to search
    const health = await store.healthCheck();
    if (!health.ok) {
      throw new Error(`MongoDB health check failed: ${health.error}`);
    }
    if (health.chunkCount === 0) {
      throw new Error('No chunks in index. Run indexer.js first.');
    }

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Index contains ${health.chunkCount} chunks`);
      console.log('[MERCURY-BRIDGE] Embedding query...');
    }

    // Embed the query
    const queryEmbedding = await embedText(query);

    // Retrieve top-K
    if (verbose) console.log(`[MERCURY-BRIDGE] Retrieving top ${topK} chunks by cosine similarity...`);
    const topChunks = await retrieveTopK(store, queryEmbedding, topK);

    if (topChunks.length === 0) {
      return {
        answer: 'No matching chunks found in the index.',
        chunks: [],
        latencyMs: Date.now() - t0,
      };
    }

    if (verbose) {
      console.log('[MERCURY-BRIDGE] Top matches:');
      topChunks.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.file_path}:${c.start_line}-${c.end_line} ` +
          `(${c.kind}: ${c.name}) sim=${c.similarity.toFixed(3)}`);
      });
    }

    // Build prompt
    const prompt = buildPrompt(query, topChunks);

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Prompt length: ${prompt.length} chars`);
      console.log('[MERCURY-BRIDGE] Calling Mercury-2...');
    }

    // Call Mercury via existing client
    const client = new PersistentLLMClient({ provider: 'mercury' });
    await client.initialize();
    const answer = await client.generateResponse(prompt, maxTokens);

    const latencyMs = Date.now() - t0;
    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Mercury responded in ${latencyMs}ms`);
    }

    return { answer, chunks: topChunks, latencyMs };

  } finally {
    await store.disconnect();
  }
}

module.exports = { ask, retrieveTopK, buildPrompt, cosineSimilarity };
