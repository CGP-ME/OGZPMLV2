/**
 * Mercury Bridge — Investigation Trace Memory
 * ══════════════════════════════════════════════════════════════
 * Captures successful ReAct investigation paths and retrieves
 * similar prior traces to bias future runs toward known-working
 * exploration strategies.
 *
 * DESIGN PRINCIPLE: This is a bias layer, not a lookup layer.
 * Retrieved traces are injected as HINTS into starter context,
 * not as answers. Mercury can deviate freely when the current
 * question requires different exploration. The goal is to shift
 * the probability distribution toward productive paths, not to
 * deterministically replay prior runs.
 *
 * STORAGE: mongo collection `investigation_traces` (separate from
 * the `chunks` collection used for code/doc retrieval).
 *
 * CAPTURE CRITERIA: Only traces from runs with
 * termination === 'answer_given' are recorded. Runs that hit
 * max_iterations, loop detection, or errors are NOT captured
 * (we don't want to reinforce failed paths).
 */

'use strict';

const { embedText } = require('./indexer');
const config = require('./config');

const TRACE_COLLECTION = 'investigation_traces';

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Capture a successful investigation trace.
 */
async function captureTrace({ store, query, toolCallSequence, finalAnswer, metadata }) {
  if (metadata.termination !== 'answer_given') {
    return { captured: false, reason: 'termination_not_successful' };
  }

  try {
    const queryEmbedding = await embedText(query);

    const trace = {
      query,
      query_embedding: queryEmbedding,
      tool_call_sequence: toolCallSequence.map(tc => ({
        name: tc.name,
        args: tc.args,
        result_summary: (tc.result_summary || '').slice(0, 500),
      })),
      final_answer_excerpt: (finalAnswer || '').slice(0, 2000),
      iterations: metadata.iterations,
      latency_ms: metadata.latencyMs,
      timestamp: new Date().toISOString(),
    };

    const traceCollection = store.db.collection(TRACE_COLLECTION);
    await traceCollection.insertOne(trace);

    return { captured: true };
  } catch (err) {
    console.error(`[TRACE-MEMORY] Capture failed: ${err.message}`);
    return { captured: false, reason: 'capture_error', error: err.message };
  }
}

/**
 * Retrieve the most similar prior trace for a given query.
 * Returns null if no trace exceeds the similarity threshold.
 */
async function retrieveSimilarTrace({ store, query, threshold }) {
  const minSim = threshold != null ? threshold : config.TRACE_SIMILARITY_THRESHOLD;

  try {
    const traceCollection = store.db.collection(TRACE_COLLECTION);
    const allTraces = await traceCollection.find({}).toArray();

    if (allTraces.length === 0) return null;

    const queryEmbedding = await embedText(query);

    let best = null;
    for (const trace of allTraces) {
      if (!trace.query_embedding) continue;
      const sim = cosineSimilarity(queryEmbedding, trace.query_embedding);
      if (!best || sim > best.similarity) {
        best = { trace, similarity: sim };
      }
    }

    if (best && best.similarity >= minSim) {
      return best;
    }
    return null;
  } catch (err) {
    console.error(`[TRACE-MEMORY] Retrieve failed: ${err.message}`);
    return null;
  }
}

/**
 * Format a retrieved trace as a starter-context hint block.
 */
function formatTraceAsHint(traceResult) {
  if (!traceResult) return null;

  const { trace, similarity } = traceResult;

  const lines = [];
  lines.push('─── PRIOR INVESTIGATION HINT ───');
  lines.push(`A similar query was successfully answered previously (similarity: ${similarity.toFixed(2)}).`);
  lines.push(`Prior query: "${trace.query}"`);
  lines.push(`It was solved in ${trace.iterations} iterations using this tool sequence:`);
  lines.push('');

  trace.tool_call_sequence.forEach((tc, idx) => {
    const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
    lines.push(`  ${idx + 1}. ${tc.name}(${argsStr.slice(0, 150)}${argsStr.length > 150 ? '...' : ''})`);
  });

  lines.push('');
  lines.push('This is a HINT, not a rule. Feel free to deviate if the current question requires different exploration.');
  lines.push('If the hint is irrelevant to the current question, ignore it completely.');
  lines.push('─── END HINT ───');
  lines.push('');

  return lines.join('\n');
}

/**
 * Create mongo indexes on trace collection. Idempotent.
 */
async function ensureTraceIndexes(store) {
  try {
    const traceCollection = store.db.collection(TRACE_COLLECTION);
    await traceCollection.createIndex({ timestamp: -1 });
    return { ok: true };
  } catch (err) {
    console.error(`[TRACE-MEMORY] Index creation failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  captureTrace,
  retrieveSimilarTrace,
  formatTraceAsHint,
  ensureTraceIndexes,
  TRACE_COLLECTION,
};
