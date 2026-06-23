/**
 * Mercury Bridge — Investigation Trace Memory
 * ══════════════════════════════════════════════════════════════
 * Captures successful ReAct investigation paths and retrieves
 * similar prior traces to bias future runs toward known-working
 * exploration strategies.
 *
 * DESIGN PRINCIPLE: This is a bias layer, not a lookup layer.
 * Retrieved traces are injected as HINTS, not answers. Mercury
 * can deviate freely. Goal: shift the opening probability
 * distribution toward productive paths, not replay prior runs.
 *
 * SELF-REGULATION:
 * 1. Dedup on capture — near-duplicates (>0.92 similarity) do
 *    not create new records. Instead, the better-quality run
 *    (fewer iterations, lower latency) replaces the worse one.
 * 2. Quality scoring — every trace has a quality_score computed
 *    from iterations and latency. Lower = better. Used for
 *    replacement decisions and eviction ordering.
 * 3. Usage tracking — usage_count increments when a trace is
 *    actually retrieved and injected as a hint. Proven-useful
 *    traces are protected from eviction.
 * 4. Eviction — scheduled cleanup drops unused + old + low-quality
 *    traces when the collection exceeds the configured cap.
 *
 * Storage: configured mongo collection (separate
 * from the `chunks` collection used for code/doc retrieval).
 *
 * CAPTURE CRITERIA: Only successful runs (termination ===
 * 'answer_given') are captured. Manual capture mode also requires
 * an explicit capture request. Failed runs do not teach.
 */

'use strict';

const { embedText } = require('./indexer');
const config = require('./config');

const TRACE_COLLECTION = config.TRACE_COLLECTION;
const CURRENT_FIX_QUERY_PATTERN = /\b(break my fix|current fix|current change|staged fix|staged change|uncommitted|working tree|latest committed|last commit)\b/i;

// ─── Cosine similarity ────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Quality scoring ──────────────────────────────────────────
// Lower is better. Dominated by iteration count (each iteration
// is expensive in tool calls + model time), latency is a tiebreaker.

function computeQualityScore({ iterations, latencyMs, latency_ms }) {
  const latency = latencyMs || latency_ms || 0;
  return iterations * 10 + (latency / 1000);
}

function hasToolCall(toolCallSequence, toolName) {
  return (toolCallSequence || []).some((toolCall) => toolCall && toolCall.name === toolName);
}

function shouldCaptureTrace({ query, toolCallSequence, metadata, captureRequested = false }) {
  if (!metadata || metadata.termination !== 'answer_given') {
    return { capture: false, reason: 'termination_not_successful' };
  }

  if (config.TRACE_CAPTURE_MODE === 'manual' && captureRequested !== true) {
    return { capture: false, reason: 'manual_capture_not_requested' };
  }

  if (CURRENT_FIX_QUERY_PATTERN.test(query || '') && !hasToolCall(toolCallSequence, 'git_diff')) {
    return { capture: false, reason: 'current_fix_without_git_diff' };
  }

  return { capture: true };
}

// ─── Capture ──────────────────────────────────────────────────

/**
 * Capture a successful investigation trace with dedup + quality replacement.
 *
 * Behavior:
 * 1. Embed the query.
 * 2. Scan existing traces for any with similarity >= DEDUP_THRESHOLD (0.92).
 * 3. If a near-duplicate exists:
 *    - If new trace has better quality, REPLACE the existing one.
 *    - If existing trace has better or equal quality, SKIP capture.
 * 4. If no near-duplicate, INSERT new trace.
 */
async function captureTrace({ store, query, toolCallSequence, finalAnswer, metadata, captureRequested = false }) {
  const captureGate = shouldCaptureTrace({ query, toolCallSequence, finalAnswer, metadata, captureRequested });
  if (!captureGate.capture) {
    return { captured: false, reason: captureGate.reason };
  }

  try {
    const queryEmbedding = await embedText(query);
    const traceCollection = store.db.collection(TRACE_COLLECTION);
    const newQuality = computeQualityScore(metadata);

    // Scan for near-duplicates
    const allTraces = await traceCollection.find({}).toArray();
    let nearDuplicate = null;
    for (const existing of allTraces) {
      const sim = cosineSimilarity(queryEmbedding, existing.query_embedding);
      if (sim >= config.TRACE_DEDUP_THRESHOLD) {
        if (!nearDuplicate || sim > nearDuplicate.similarity) {
          nearDuplicate = { existing, similarity: sim };
        }
      }
    }

    const traceDoc = {
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
      quality_score: newQuality,
      usage_count: 0,
      created_at: new Date(),
      last_used_at: null,
      updated_at: new Date(),
    };

    if (nearDuplicate) {
      const existingQuality = nearDuplicate.existing.quality_score;
      if (newQuality < existingQuality) {
        // New trace is higher quality — replace, but preserve usage_count
        traceDoc.usage_count = nearDuplicate.existing.usage_count || 0;
        traceDoc.created_at = nearDuplicate.existing.created_at || new Date();
        await traceCollection.replaceOne(
          { _id: nearDuplicate.existing._id },
          traceDoc
        );
        return {
          captured: true,
          action: 'replaced',
          similarity: nearDuplicate.similarity,
          old_quality: existingQuality,
          new_quality: newQuality,
        };
      } else {
        return {
          captured: false,
          action: 'skipped_worse_quality',
          similarity: nearDuplicate.similarity,
          existing_quality: existingQuality,
          new_quality: newQuality,
        };
      }
    }

    // No near-duplicate — insert new
    await traceCollection.insertOne(traceDoc);
    return { captured: true, action: 'inserted', quality: newQuality };

  } catch (err) {
    console.error(`[TRACE-MEMORY] Capture failed: ${err.message}`);
    return { captured: false, reason: 'capture_error', error: err.message };
  }
}

// ─── Retrieve ─────────────────────────────────────────────────

/**
 * Retrieve the most similar prior trace for a query, above the
 * injection threshold. Returns null if nothing qualifies.
 */
async function retrieveSimilarTrace({ store, query, threshold }) {
  const minSim = threshold != null ? threshold : config.TRACE_INJECT_THRESHOLD;

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
 * Mark a trace as used (increment usage_count, update last_used_at).
 * Called AFTER a trace has actually been injected into starter context.
 */
async function markTraceUsed({ store, traceId }) {
  try {
    const traceCollection = store.db.collection(TRACE_COLLECTION);
    await traceCollection.updateOne(
      { _id: traceId },
      {
        $inc: { usage_count: 1 },
        $set: { last_used_at: new Date() },
      }
    );
  } catch (err) {
    console.error(`[TRACE-MEMORY] Usage update failed: ${err.message}`);
  }
}

// ─── Format hint ──────────────────────────────────────────────

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
  lines.push('Never copy the prior answer — the current question may have a different answer even if the path is similar.');
  lines.push('─── END HINT ───');
  lines.push('');

  return lines.join('\n');
}

// ─── Eviction ─────────────────────────────────────────────────

/**
 * Scheduled cleanup. Call at startup and/or periodically.
 *
 * Eviction rules (applied in order):
 * 1. Delete unused traces (usage_count === 0) older than STALE_DAYS.
 * 2. If collection still exceeds MAX_TRACES, delete lowest-quality
 *    unused traces until under cap.
 * 3. Traces with usage_count >= PROTECTED_USAGE_COUNT are never evicted.
 */
async function evictStaleTraces({ store, verbose = false }) {
  try {
    const traceCollection = store.db.collection(TRACE_COLLECTION);
    const staleMs = config.TRACE_STALE_DAYS * 24 * 60 * 60 * 1000;
    const staleCutoff = new Date(Date.now() - staleMs);

    // Phase 1: delete unused + old
    const phase1 = await traceCollection.deleteMany({
      usage_count: 0,
      created_at: { $lt: staleCutoff },
    });

    // Phase 2: if still over cap, delete lowest-quality unused traces
    const total = await traceCollection.countDocuments({});
    let phase2Deleted = 0;
    if (total > config.TRACE_MAX_COUNT) {
      const overBy = total - config.TRACE_MAX_COUNT;
      const toDelete = await traceCollection
        .find({ usage_count: { $lt: config.TRACE_PROTECTED_USAGE_COUNT } })
        .sort({ quality_score: -1 })  // highest score = worst quality
        .limit(overBy)
        .toArray();

      if (toDelete.length > 0) {
        const ids = toDelete.map(t => t._id);
        const phase2 = await traceCollection.deleteMany({ _id: { $in: ids } });
        phase2Deleted = phase2.deletedCount;
      }
    }

    const finalCount = await traceCollection.countDocuments({});

    if (verbose) {
      console.log(`[TRACE-MEMORY] Eviction: ${phase1.deletedCount} stale + ${phase2Deleted} over-cap, ${finalCount} remaining`);
    }

    return {
      stale_deleted: phase1.deletedCount,
      over_cap_deleted: phase2Deleted,
      final_count: finalCount,
    };
  } catch (err) {
    console.error(`[TRACE-MEMORY] Eviction failed: ${err.message}`);
    return { error: err.message };
  }
}

// ─── Indexes ──────────────────────────────────────────────────

async function ensureTraceIndexes(store) {
  try {
    const traceCollection = store.db.collection(TRACE_COLLECTION);
    await traceCollection.createIndex({ created_at: -1 });
    await traceCollection.createIndex({ usage_count: -1 });
    await traceCollection.createIndex({ quality_score: 1 });
    await traceCollection.createIndex({ last_used_at: -1 });
    return { ok: true };
  } catch (err) {
    console.error(`[TRACE-MEMORY] Index creation failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ─── Stats ────────────────────────────────────────────────────

async function getTraceStats(store) {
  const traceCollection = store.db.collection(TRACE_COLLECTION);
  const total = await traceCollection.countDocuments({});
  const used = await traceCollection.countDocuments({ usage_count: { $gt: 0 } });
  const protected_ = await traceCollection.countDocuments({
    usage_count: { $gte: config.TRACE_PROTECTED_USAGE_COUNT },
  });
  const avgQuality = await traceCollection.aggregate([
    { $group: { _id: null, avg: { $avg: '$quality_score' } } },
  ]).toArray();

  return {
    total,
    used,
    protected: protected_,
    unused: total - used,
    avg_quality: avgQuality[0]?.avg || 0,
  };
}

module.exports = {
  captureTrace,
  retrieveSimilarTrace,
  markTraceUsed,
  formatTraceAsHint,
  evictStaleTraces,
  ensureTraceIndexes,
  getTraceStats,
  computeQualityScore,
  cosineSimilarity,
  shouldCaptureTrace,
  TRACE_COLLECTION,
};
