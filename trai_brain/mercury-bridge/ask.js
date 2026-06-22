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
 *   --agentic              Enable ReAct loop
 *   --top-k=N              Retrieve N starter-context chunks
 *   --max-iterations=N     Agentic mode only: max tool-call iterations
 *   --max-tokens=N         Mercury max tokens per turn
 *   --quiet                Suppress progress logs
 *   --show-chunks          Print retrieved chunk text (not just filenames)
 *   --show-history         Agentic mode only: print the full tool-call trace
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

// Load .env from repo root so configured Mercury LLM key env is available.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = require('./config');
const { ask } = require('./searcher');
const { runReactLoop } = require('./react-loop');
const { createToolAdapter } = require('./tool-adapter');
const { routeQuery } = require('./query-router');
const { createMercuryLlmClient } = require('./llm-client');
const { isBreakMyFixFrame } = require('../shared/break-my-fix-frame');
const { assertBreakMyFixAnswerAccepted } = require('./break-my-fix-answer-contract');
const { retrieveSimilarTrace, formatTraceAsHint, captureTrace, markTraceUsed, evictStaleTraces, ensureTraceIndexes, getTraceStats } = require('./trace-memory');
const MongoStore = require('./mongo-store');
const { embedText } = require('./indexer');
const { retrieveTopK } = require('./searcher');

const BREAK_MY_FIX_DIFF_SOURCE = 'ogz-meta/mercury-review-input/dirty-diff.md';
const DIFF_MAX_BUFFER = 10 * 1024 * 1024;

function readGit(args, repoRoot = config.REPO_ROOT) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: DIFF_MAX_BUFFER,
  });
}

function buildBreakMyFixDirtyDiffContext({ gitReader = readGit } = {}) {
  const status = gitReader(['status', '--short']);
  const cachedNames = gitReader(['diff', '--cached', '--name-only']);
  const worktreeNames = gitReader(['diff', '--name-only']);
  const cachedDiff = gitReader(['diff', '--cached', '--no-ext-diff', '--']);
  const worktreeDiff = gitReader(['diff', '--no-ext-diff', '--']);

  return {
    source: BREAK_MY_FIX_DIFF_SOURCE,
    similarity: 1,
    text: [
      'Neutral dirty-diff context for the current break-my-fix review.',
      'This is not a conclusion or a scope limit. Use repo tools to inspect the real files before citing or deciding.',
      '',
      '## git status --short',
      status.trim() || '(clean)',
      '',
      '## git diff --cached --name-only',
      cachedNames.trim() || '(none)',
      '',
      '## git diff --name-only',
      worktreeNames.trim() || '(none)',
      '',
      '## git diff --cached --no-ext-diff --',
      cachedDiff.trim() || '(none)',
      '',
      '## git diff --no-ext-diff --',
      worktreeDiff.trim() || '(none)',
    ].join('\n'),
  };
}

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
    boostType: null,       // manual content_type boost (e.g. recent_changes)
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

function optionalPositiveInteger(value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function optionalNonNegativeInteger(value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function configExactInteger(value, configuredValue, name) {
  if (value == null) return configuredValue;
  const parsed = optionalPositiveInteger(value, name);
  if (parsed !== configuredValue) {
    throw new Error(`${name} must match mercury.config.json value ${configuredValue}`);
  }
  return configuredValue;
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
  console.log(`  --top-k=N              Starter-context chunk count (configured ${config.RETRIEVE_TOP_K})`);
  console.log(`  --max-iterations=N     Agentic only: max tool-call loops (configured ${config.AGENTIC_MAX_ITERATIONS})`);
  console.log(`  --max-tokens=N         Mercury max tokens per turn (agentic ${config.AGENTIC_MAX_TOKENS}, single-shot ${config.SINGLE_SHOT_MAX_TOKENS})`);
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
  const maxIterations = configExactInteger(opts.maxIterations, config.AGENTIC_MAX_ITERATIONS, '--max-iterations');
  const maxTokens = configExactInteger(opts.maxTokens, config.AGENTIC_MAX_TOKENS, '--max-tokens');
  const isBreakMyFixQuery = isBreakMyFixFrame(query);

  // Route the query unless caller has overridden
  const route = routeQuery(query);
  const mode = opts.retrievalMode || route.mode;
  const boostType = opts.boostType != null ? opts.boostType : route.boostType;
  const explicitTopK = optionalNonNegativeInteger(opts.topK, '--top-k');

  // Starter context policy: respect --top-k if caller set it, otherwise route decides
  let topK;
  if (explicitTopK != null) {
    topK = explicitTopK;
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

    if (isBreakMyFixQuery) {
      starterContext.push(buildBreakMyFixDirtyDiffContext());
      if (verbose) console.log('[MERCURY-BRIDGE] Break-my-fix dirty diff context injected');
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
    if (config.TRACE_MEMORY_ENABLED && !isBreakMyFixQuery) {
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

    // 3. Build the tool adapter with both repo access and mongo (for get_chunk).
    const toolAdapter = createToolAdapter({
      repoRoot: config.REPO_ROOT,
      mongoStore: store,
    });

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Tool adapter ready. Tools: ${Object.keys(toolAdapter.tools).join(', ')}`);
    }

    // 4. Initialize Mercury client for native tool calling.
    const client = createMercuryLlmClient({ systemPrompt: config.AGENTIC_SYSTEM_PROMPT });
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

    if (isBreakMyFixFrame(args.query) && !args.agentic) {
      throw new Error('break-my-fix prompts require --agentic so Mercury can use neutral dirty-diff context instead of single-shot RAG retrieval');
    }

    if (args.agentic) {
      // Agentic mode — ReAct loop with tool access
      const result = await runAgentic(args.query, args);
      if (isBreakMyFixFrame(args.query)) {
        assertBreakMyFixAnswerAccepted(result.answer, result.history || []);
      }

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
    if (err.message.includes('OPENAI') || err.message.includes('embed') || err.message.includes('Embed endpoint')) {
      console.error('');
      console.error(`Embedding provider: ${config.EMBED_PROVIDER}`);
      console.error(`Embedding endpoint: ${config.EMBED_ENDPOINT}`);
      if (config.EMBED_PROVIDER === 'ollama') {
        console.error('Check local Ollama is running and the configured embed model is pulled.');
      } else if (config.EMBED_ENDPOINT.includes('models.github.ai')) {
        console.error(`Check ${config.EMBED_API_KEY_ENV} has access to the configured GitHub Models embedding model.`);
      } else if (config.EMBED_ENDPOINT.includes('api.openai.com')) {
        console.error(`Check ${config.EMBED_API_KEY_ENV} has active quota/billing, or set embeddings.provider=ollama for local retrieval.`);
      } else {
        console.error('Check embeddings.endpoint, embeddings.model, and embeddings.apiKeyEnv in mercury.config.json.');
      }
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runAgentic, buildBreakMyFixDirtyDiffContext };
