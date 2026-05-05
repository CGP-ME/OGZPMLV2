#!/usr/bin/env node
/**
 * Mercury Bridge — CLI Entry
 * ══════════════════════════════════════════════════════════════
 * Ask Mercury questions about the OGZPrime codebase with either:
 *   (default) single-shot RAG — fast but can be fooled by docs
 *   --agentic  ReAct loop with tool access — Mercury iteratively
 *              greps the repo and opens files until it has ground truth
 *
 * Usage:
 *   node trai_brain/mercury-bridge/ask.js "How does MPM handle BE scale-out?"
 *   node trai_brain/mercury-bridge/ask.js --agentic "Find the partial-close contract bug"
 *
 * Flags:
 *   --agentic              Enable ReAct loop (default: off)
 *   --top-k=N              Retrieve N starter-context chunks (default 8)
 *   --max-iterations=N     Agentic mode only: max tool-call iterations (default 10)
 *   --max-tokens=N         Mercury max tokens per turn (default 2000)
 *   --quiet                Suppress progress logs
 *   --show-chunks          Print retrieved chunk text (not just filenames)
 *   --show-history         Agentic mode only: print the full tool-call trace
 */

'use strict';

const path = require('path');

// Load .env from repo root so OPENAI_API_KEY / INCEPTION_API_KEY are available
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = require('./config');
const { ask } = require('./searcher');
const { runReactLoop } = require('./react-loop');
const { createToolAdapter } = require('./tool-adapter');
const { routeQuery } = require('./query-router');
const { retrieveSimilarTrace, formatTraceAsHint, captureTrace, markTraceUsed, evictStaleTraces, ensureTraceIndexes, getTraceStats } = require('./trace-memory');
const MongoStore = require('./mongo-store');
const { embedText } = require('./indexer');
const { retrieveTopK } = require('./searcher');

function parseArgs(argv) {
  const args = {
    query: '',
    topK: null,
    maxTokens: null,
    maxIterations: null,
    quiet: false,
    showChunks: false,
    showHistory: false,
    agentic: false,
    retrievalMode: null,   // semantic | hybrid | hybrid-classified
    boostType: null,       // manual content_type boost (e.g. fix_history)
    explainRoute: false,   // print routing decision and exit
    explainTrace: false,   // print trace hint and exit
    traceStats: false,     // dump trace stats and exit
    pruneTraces: false,    // force eviction and exit
  };
  const positional = [];

  for (const arg of argv.slice(2)) {
    if (arg === '--quiet') {
      args.quiet = true;
    } else if (arg === '--show-chunks') {
      args.showChunks = true;
    } else if (arg === '--show-history') {
      args.showHistory = true;
    } else if (arg === '--agentic') {
      args.agentic = true;
    } else if (arg.startsWith('--top-k=')) {
      args.topK = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-tokens=')) {
      args.maxTokens = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-iterations=')) {
      args.maxIterations = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--retrieval-mode=')) {
      args.retrievalMode = arg.split('=')[1];
    } else if (arg.startsWith('--boost-type=')) {
      args.boostType = arg.split('=')[1];
    } else if (arg === '--explain-route') {
      args.explainRoute = true;
    } else if (arg === '--explain-trace') {
      args.explainTrace = true;
    } else if (arg === '--trace-stats') {
      args.traceStats = true;
    } else if (arg === '--prune-traces') {
      args.pruneTraces = true;
    } else if (arg.startsWith('--')) {
      console.warn(`[ask] Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  args.query = positional.join(' ').trim();
  return args;
}

function usage() {
  console.log('');
  console.log('Mercury Bridge — Ask a question about the OGZPrime codebase');
  console.log('');
  console.log('Usage:');
  console.log('  node trai_brain/mercury-bridge/ask.js "your question here"');
  console.log('  node trai_brain/mercury-bridge/ask.js --agentic "your question here"');
  console.log('');
  console.log('Modes:');
  console.log('  (default)   Single-shot RAG — embed query, retrieve top-K, one Mercury call');
  console.log('  --agentic   ReAct loop — Mercury can grep/open files iteratively (more accurate)');
  console.log('');
  console.log('Flags:');
  console.log('  --top-k=N              Starter-context chunk count (default 8)');
  console.log('  --max-iterations=N     Agentic only: max tool-call loops (default 10)');
  console.log('  --max-tokens=N         Mercury max tokens per turn (default 2000)');
  console.log('  --quiet                Suppress progress logs');
  console.log('  --show-chunks          Print retrieved chunk text');
  console.log('  --show-history         Agentic only: print full tool-call trace');
  console.log('');
  console.log('Examples:');
  console.log('  node trai_brain/mercury-bridge/ask.js "What does StopLossChecker do?"');
  console.log('  node trai_brain/mercury-bridge/ask.js --agentic --show-history "Find the partial-close contract bug"');
  console.log('');
}

// ─────────────────────────────────────────────────────────────
// Agentic mode — hybrid retrieval (current semantic-only) + ReAct loop
// ─────────────────────────────────────────────────────────────

async function runAgentic(query, opts) {
  const verbose = !opts.quiet;
  const maxIterations = opts.maxIterations || parseInt(process.env.MERCURY_MAX_ITERATIONS || '50', 10);
  const maxTokens = opts.maxTokens || 2000;

  // Route the query unless caller has overridden
  const route = routeQuery(query);
  const mode = opts.retrievalMode || route.mode;
  const boostType = opts.boostType != null ? opts.boostType : route.boostType;

  // Starter context policy: respect --top-k if caller set it, otherwise route decides
  let topK;
  if (opts.topK != null) {
    topK = opts.topK;
  } else if (route.starterContextPolicy === 'skip') {
    topK = 0;
  } else {
    topK = config.RETRIEVE_TOP_K;
  }

  // 1. Retrieve starter context from the existing indexed corpus
  const store = new MongoStore();
  await store.connect();

  try {
    const health = await store.healthCheck();
    if (!health.ok) {
      throw new Error(`MongoDB health check failed: ${health.error}`);
    }
    if (health.chunkCount === 0) {
      throw new Error('No chunks in index. Run indexer.js first.');
    }

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Index contains ${health.chunkCount} chunks`);
      console.log(`[MERCURY-BRIDGE] Query router: type=${route.queryType} mode=${mode} boost=${boostType || 'none'} top-k=${topK}`);
      console.log(`[MERCURY-BRIDGE] Rationale: ${route.rationale}`);
    }

    let starterContext = [];
    if (topK > 0) {
      if (verbose) console.log('[MERCURY-BRIDGE] Embedding query for starter context...');
      const queryEmbedding = await embedText(query);
      starterContext = await retrieveTopK(store, queryEmbedding, topK, query, {
        retrievalMode: mode,
        boostType: boostType,
      });
    } else {
      if (verbose) console.log('[MERCURY-BRIDGE] Starter context: skipped (router policy=skip)');
    }

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Starter context: ${starterContext.length} chunks`);
      starterContext.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.file_path}:${c.start_line}-${c.end_line} ` +
          `(${c.kind}: ${c.name || 'unnamed'}) sim=${c.similarity.toFixed(3)}`);
      });
    }

    // 2. Investigation trace memory — retrieve prior hint if available
    let traceHintText = null;
    let traceUsed = null;
    if (config.TRACE_MEMORY_ENABLED) {
      await ensureTraceIndexes(store);
      await evictStaleTraces({ store, verbose });

      const traceResult = await retrieveSimilarTrace({ store, query });
      if (traceResult) {
        traceHintText = formatTraceAsHint(traceResult);
        traceUsed = traceResult.trace;
        if (verbose) {
          console.log(`[MERCURY-BRIDGE] Prior trace hint found (similarity: ${traceResult.similarity.toFixed(2)}, ${traceResult.trace.iterations} iters, used ${traceResult.trace.usage_count}x)`);
        }
      } else if (verbose) {
        console.log('[MERCURY-BRIDGE] No similar prior trace found');
      }
    }

    // 3. Build the tool adapter with both repo access and mongo (for get_chunk)
    const toolAdapter = createToolAdapter({
      repoRoot: config.REPO_ROOT,
      mongoStore: store,
    });

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Tool adapter ready. Tools: ${Object.keys(toolAdapter.tools).join(', ')}`);
    }

    // 4. Initialize Mercury client for native tool calling
    const PersistentLLMClient = require(path.join(config.REPO_ROOT, 'core', 'persistent_llm_client.js'));
    const client = new PersistentLLMClient({ provider: 'mercury' });
    await client.initialize();

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Starting ReAct loop (max ${maxIterations} iterations)...`);
    }

    // 5. Run the loop with native tool calling
    const t0 = Date.now();
    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: query,
      starterContext,
      traceHint: traceHintText,
      blastRadius: opts.blastRadius || null,
      maxIterations,
      maxTokens,
      verbose,
    });
    result.totalLatencyMs = Date.now() - t0;

    // 6. Mark trace as used if we injected one
    if (traceUsed && result.termination === 'answer_given') {
      await markTraceUsed({ store, traceId: traceUsed._id });
    }

    // 7. Capture successful investigation trace (with dedup + quality)
    if (config.TRACE_MEMORY_ENABLED && result.termination === 'answer_given') {
      const toolCallSequence = (result.history || []).map(h => ({
        name: h.toolName,
        args: h.toolArgs,
        result_summary: JSON.stringify(h.toolResult || {}).slice(0, 500),
      }));

      const captureResult = await captureTrace({
        store,
        query,
        toolCallSequence,
        finalAnswer: result.answer,
        metadata: {
          iterations: result.iterations,
          latencyMs: result.totalLatencyMs,
          termination: result.termination,
        },
      });

      if (verbose) {
        if (captureResult.captured) {
          console.log(`[MERCURY-BRIDGE] Trace ${captureResult.action} (quality=${(captureResult.new_quality || captureResult.quality || 0).toFixed(1)})`);
        } else {
          console.log(`[MERCURY-BRIDGE] Trace not captured: ${captureResult.reason || captureResult.action}`);
        }
      }
    }

    return result;

  } finally {
    await store.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Flags that don't require a query
  try {
    if (args.traceStats) {
      const store = new MongoStore();
      await store.connect();
      await ensureTraceIndexes(store);
      const stats = await getTraceStats(store);
      console.log('Trace memory stats:');
      console.log(`  total:       ${stats.total}`);
      console.log(`  used:        ${stats.used}`);
      console.log(`  protected:   ${stats.protected}`);
      console.log(`  unused:      ${stats.unused}`);
      console.log(`  avg quality: ${stats.avg_quality.toFixed(2)}`);
      await store.disconnect();
      return;
    }

    if (args.pruneTraces) {
      const store = new MongoStore();
      await store.connect();
      await ensureTraceIndexes(store);
      const result = await evictStaleTraces({ store, verbose: true });
      console.log(`Eviction result: ${JSON.stringify(result)}`);
      await store.disconnect();
      return;
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }

  if (!args.query) {
    usage();
    process.exit(1);
  }

  try {
    // --explain-trace: print trace hint and exit
    if (args.explainTrace) {
      const store = new MongoStore();
      await store.connect();
      await ensureTraceIndexes(store);
      const traceResult = await retrieveSimilarTrace({ store, query: args.query });
      if (traceResult) {
        console.log(`Similarity: ${traceResult.similarity.toFixed(3)}`);
        console.log(`Prior query: "${traceResult.trace.query}"`);
        console.log(`Iterations: ${traceResult.trace.iterations}`);
        console.log(`Quality: ${traceResult.trace.quality_score.toFixed(1)}`);
        console.log(`Usage count: ${traceResult.trace.usage_count}`);
        console.log(`Tool calls: ${traceResult.trace.tool_call_sequence.length}`);
        console.log('');
        console.log(formatTraceAsHint(traceResult));
      } else {
        console.log('No similar prior trace found (threshold: ' + config.TRACE_INJECT_THRESHOLD + ')');
      }
      await store.disconnect();
      return;
    }

    // --explain-route: print routing decision and exit
    if (args.explainRoute) {
      const route = routeQuery(args.query);
      console.log(JSON.stringify(route, null, 2));
      return;
    }

    if (args.agentic) {
      // Agentic mode — ReAct loop with tool access
      const result = await runAgentic(args.query, args);

      console.log('');
      console.log('═══ ANSWER ═══');
      console.log('');
      console.log(result.answer);
      console.log('');
      console.log(`[iterations: ${result.iterations} | termination: ${result.termination} | latency: ${result.totalLatencyMs}ms]`);

      if (args.showHistory && result.history.length > 0) {
        console.log('');
        console.log('─── TOOL CALL TRACE ───');
        for (const turn of result.history) {
          console.log('');
          console.log(`## Iteration ${turn.iteration} — ${turn.toolName}`);
          console.log(`TOOL: ${turn.toolName}(${JSON.stringify(turn.toolArgs)})`);
          const resultStr = JSON.stringify(turn.toolResult, null, 2);
          console.log(`RESULT: ${resultStr.slice(0, 1000)}${resultStr.length > 1000 ? '...[truncated]' : ''}`);
        }
        console.log('');
        console.log('─── END TRACE ───');
      }

    } else {
      // Legacy single-shot mode — unchanged
      const result = await ask(args.query, {
        topK: args.topK,
        maxTokens: args.maxTokens,
        verbose: !args.quiet,
      });

      if (args.showChunks) {
        console.log('');
        console.log('─── RETRIEVED CHUNKS ───');
        result.chunks.forEach((c, idx) => {
          console.log('');
          console.log(`### [${idx + 1}] ${c.file_path}:${c.start_line}-${c.end_line} (sim=${c.similarity.toFixed(3)})`);
          console.log(c.text);
          console.log('');
        });
        console.log('─── END CHUNKS ───');
      }

      console.log('');
      console.log('═══ ANSWER ═══');
      console.log('');
      console.log(result.answer);
      console.log('');
      console.log(`[latency: ${result.latencyMs}ms | chunks used: ${result.chunks.length}]`);
    }

  } catch (err) {
    console.error('');
    console.error('[MERCURY-BRIDGE] ERROR:', err.message);
    if (err.message.includes('No chunks in index')) {
      console.error('');
      console.error('Run the indexer first:');
      console.error('  node trai_brain/mercury-bridge/indexer.js');
    }
    if (err.message.includes('MongoDB') || err.message.includes('mongo')) {
      console.error('');
      console.error('Check MongoDB is running:');
      console.error('  sudo systemctl status mongod');
    }
    if (err.message.includes('OPENAI') || err.message.includes('embed')) {
      console.error('');
      console.error('Check OPENAI_API_KEY is set in .env');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runAgentic };
