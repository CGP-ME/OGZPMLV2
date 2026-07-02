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
 *   --consensus            Agentic mode only: ask Fable for a second-opinion pass
 *   --check-providers      Warm up Mercury and Fable clients, then exit
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Load .env from repo root so configured Mercury LLM key env is available.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = require('./config');
const { ask } = require('./searcher');
const { runReactLoop, formatToolTelemetry } = require('./react-loop');
const { createToolAdapter } = require('./tool-adapter');
const { routeQuery } = require('./query-router');
const { createMercuryLlmClient } = require('./llm-client');
const {
  consensusRequested,
  runFableConsensus,
  consensusFailure,
  buildMercuryRecheckPrompt,
  formatAdversarialReviewPacket,
} = require('./consensus');
const { runProviderPreflight } = require('./provider-preflight');
const { retrieveSimilarTrace, formatTraceAsHint, captureTrace, markTraceUsed, evictStaleTraces, ensureTraceIndexes, getTraceStats } = require('./trace-memory');
const { buildRunLedgerEntry, writeRunLedgerEntry } = require('./run-ledger');
const MongoStore = require('./mongo-store');
const { embedText } = require('./indexer');
const { retrieveTopK } = require('./searcher');
const { getBlastRadius, formatForMercury } = require('../../tools/serena-bridge');

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
    consensus: false,
    consensusExplicit: false,
    retrievalMode: null,   // semantic | hybrid | hybrid-classified
    boostType: null,       // manual content_type boost (e.g. recent_changes)
    explainRoute: false,   // print routing decision and exit
    explainTrace: false,   // print trace hint and exit
    traceStats: false,     // dump trace stats and exit
    pruneTraces: false,    // force eviction and exit
    checkProviders: false, // warm up configured LLM providers and exit
    captureTrace: false,   // opt-in successful trace capture
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
    } else if (arg === '--consensus') {
      args.consensus = true;
      args.consensusExplicit = true;
    } else if (arg === '--no-consensus') {
      args.consensus = false;
      args.consensusExplicit = true;
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
    } else if (arg === '--check-providers') {
      args.checkProviders = true;
    } else if (arg === '--capture-trace') {
      args.captureTrace = true;
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
  console.log(`  --consensus            Agentic only: force a Fable (${config.CONSENSUS_MODEL}) consensus pass`);
  console.log('  --no-consensus         Agentic only: suppress config-default consensus for this run');
  console.log('  --check-providers      Warm up Mercury and Fable clients, then exit');
  console.log('  --capture-trace        Agentic only: manually store a successful investigation trace');
  console.log('                         RAG/chunk writes are never done by ask.js; run indexer.js explicitly.');
  console.log('');
  console.log('Examples:');
  console.log('  node trai_brain/mercury-bridge/ask.js "What does StopLossChecker do?"');
  console.log('  node trai_brain/mercury-bridge/ask.js --agentic --show-history "Find the partial-close contract bug"');
  console.log('');
}

function parseGitNameList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitNameList(repoRoot, args) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseGitNameList(output);
}

function selectCurrentChangeNames({ cached = [], working = [], untracked = [] } = {}) {
  if (cached.length > 0) {
    return [...new Set(cached)].sort();
  }
  return [...new Set([...working, ...untracked])].sort();
}

function currentChangedFiles(repoRoot = config.REPO_ROOT) {
  return selectCurrentChangeNames({
    cached: gitNameList(repoRoot, ['diff', '--name-only', '--cached']),
    working: gitNameList(repoRoot, ['diff', '--name-only']),
    untracked: gitNameList(repoRoot, ['ls-files', '--others', '--exclude-standard']),
  });
}

function normalizeRepoRelativePath(repoRoot, relPath) {
  if (!relPath || typeof relPath !== 'string') return null;
  if (relPath.startsWith('/') || relPath.split('/').includes('..')) return null;
  const absPath = path.resolve(repoRoot, relPath);
  const normalizedRoot = path.resolve(repoRoot);
  if (absPath !== normalizedRoot && !absPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    return null;
  }
  return path.relative(normalizedRoot, absPath).replace(/\\/g, '/');
}

function isSerenaSourcePath(relPath) {
  return typeof relPath === 'string'
    && relPath.endsWith('.js')
    && !relPath.endsWith('.bak')
    && !config.isPathIgnoredByMercury(relPath);
}

async function buildCurrentChangeBlastRadius({
  repoRoot = config.REPO_ROOT,
  changedFiles = null,
  currentChangedFilesFn = currentChangedFiles,
  getBlastRadiusFn = getBlastRadius,
  formatForMercuryFn = formatForMercury,
} = {}) {
  let candidates;
  try {
    candidates = changedFiles || currentChangedFilesFn(repoRoot);
  } catch (err) {
    return {
      text: null,
      meta: [],
      errors: [
        {
          file: '<current_changes>',
          error: err.message,
        },
      ],
      source: 'current_changes',
    };
  }
  const targetFiles = [];
  for (const candidate of candidates) {
    const relPath = normalizeRepoRelativePath(repoRoot, candidate);
    if (!relPath || !isSerenaSourcePath(relPath)) continue;
    if (!fs.existsSync(path.join(repoRoot, relPath))) continue;
    targetFiles.push(relPath);
  }

  if (targetFiles.length === 0) {
    return {
      text: null,
      meta: [],
      errors: [],
      source: 'current_changes',
    };
  }

  const sections = [];
  const meta = [];
  const errors = [];
  for (const targetFile of targetFiles) {
    let blastRadius;
    try {
      blastRadius = await getBlastRadiusFn(targetFile);
    } catch (err) {
      errors.push({
        file: targetFile,
        error: err.message,
      });
      continue;
    }
    let formatted;
    try {
      formatted = formatForMercuryFn(blastRadius);
    } catch (err) {
      errors.push({
        file: targetFile,
        error: `format failed: ${err.message}`,
      });
      continue;
    }
    meta.push({
      file: targetFile,
      callerCount: blastRadius.callerCount,
      riskLevel: blastRadius.riskLevel,
      latencyMs: blastRadius.latencyMs,
    });
    sections.push(`## ${targetFile}\n${formatted}`);
  }

  return {
    text: sections.length > 0 ? sections.join('\n\n') : null,
    meta,
    errors,
    source: 'current_changes',
  };
}

// ─────────────────────────────────────────────────────────────
// Agentic mode — hybrid retrieval (current semantic-only) + ReAct loop
// ─────────────────────────────────────────────────────────────

async function runAgentic(query, opts) {
  const startedAt = new Date();
  const verbose = !opts.quiet;
  const maxIterations = configExactInteger(opts.maxIterations, config.AGENTIC_MAX_ITERATIONS, '--max-iterations');
  const maxTokens = configExactInteger(opts.maxTokens, config.AGENTIC_MAX_TOKENS, '--max-tokens');

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
  let storeConnected = false;
  let autoBlastRadius = null;

  try {
    await store.connect();
    storeConnected = true;

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

    // 4. Initialize Mercury client for native tool calling.
    const client = createMercuryLlmClient({ systemPrompt: config.AGENTIC_SYSTEM_PROMPT });
    await client.initialize();

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Starting ReAct loop (max ${maxIterations} iterations)...`);
    }

    let blastRadius = opts.blastRadius || null;
    if (!blastRadius) {
      autoBlastRadius = await buildCurrentChangeBlastRadius();
      blastRadius = autoBlastRadius.text;
      if (verbose) {
        if (autoBlastRadius.meta.length > 0) {
          console.log(`[MERCURY-BRIDGE] Serena current-change blast radius: ${autoBlastRadius.meta.length} file(s)`);
          autoBlastRadius.meta.forEach((meta) => {
            console.log(`  ${meta.file}: ${meta.callerCount} caller(s), risk=${meta.riskLevel}, ${meta.latencyMs}ms`);
          });
        } else {
          console.log('[MERCURY-BRIDGE] Serena current-change blast radius: no changed JS files to scan');
        }
        if (autoBlastRadius.errors.length > 0) {
          console.log(`[MERCURY-BRIDGE] Serena current-change blast radius unavailable for ${autoBlastRadius.errors.length} file(s)`);
          autoBlastRadius.errors.forEach((entry) => {
            console.log(`  ${entry.file}: ${entry.error}`);
          });
        }
      }
    }

    // 5. Run the loop with native tool calling
    const t0 = Date.now();
    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: query,
      starterContext,
      traceHint: traceHintText,
      blastRadius,
      maxIterations,
      maxTokens,
      verbose,
    });
    result.totalLatencyMs = Date.now() - t0;
    if (autoBlastRadius) {
      result.serenaBlastRadius = autoBlastRadius;
    }

    if (consensusRequested(opts)) {
      if (verbose) {
        console.log(`[MERCURY-BRIDGE] Fable consensus requested: ${config.CONSENSUS_MODEL}`);
      }
      try {
        result.consensus = await runFableConsensus({
          query,
          mercuryResult: result,
        });
        if (result.consensus.ok && result.consensus.parsed && result.consensus.parsed.blocking) {
          result.consensus.recheckPrompt = buildMercuryRecheckPrompt({
            originalQuery: query,
            mercuryAnswer: result.answer,
            fableAnswer: result.consensus.answer,
            parsedConsensus: result.consensus.parsed,
          });
          if (verbose) {
            console.log('[MERCURY-BRIDGE] Fable marked consensus blocking; launching one Mercury recheck.');
          }
          const recheckStarted = Date.now();
          result.consensus.recheck = await runReactLoop({
            client,
            toolAdapter,
            userQuery: result.consensus.recheckPrompt,
            starterContext,
            traceHint: null,
            blastRadius,
            maxIterations,
            maxTokens,
            verbose,
          });
          result.consensus.recheck.totalLatencyMs = Date.now() - recheckStarted;
        }
        result.adversarialReviewPacket = formatAdversarialReviewPacket({
          originalQuery: query,
          mercuryResult: result,
          consensus: result.consensus,
        });
      } catch (err) {
        result.consensus = consensusFailure(err);
        if (verbose) {
          console.log(`[MERCURY-BRIDGE] Fable consensus failed: ${err.message}`);
        }
      }
    }

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
        captureRequested: opts.captureTrace === true,
        metadata: {
          iterations: result.iterations,
          latencyMs: result.totalLatencyMs,
          termination: result.termination,
          captureRequested: opts.captureTrace === true,
        },
      });

      if (verbose) {
        if (captureResult.captured) {
          console.log(`[MERCURY-BRIDGE] Trace ${captureResult.action} (quality=${(captureResult.new_quality || captureResult.quality || 0).toFixed(1)})`);
        } else {
          const reason = captureResult.reason || captureResult.action;
          console.log(`[MERCURY-BRIDGE] Trace not captured: ${reason}`);
          if (reason === 'manual_capture_not_requested') {
            console.log('[MERCURY-BRIDGE] Manual capture mode: rerun with --capture-trace only if this answer should teach trace memory.');
          }
        }
      }
    }

    const ledgerEntry = buildRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      query,
      opts: { ...opts, maxIterations, maxTokens },
      result,
      startedAt,
      finishedAt: new Date(),
      autoBlastRadius,
    });
    result.runLedger = writeRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      entry: ledgerEntry,
    });

    return result;

  } catch (err) {
    const ledgerEntry = buildRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      query,
      opts: { ...opts, maxIterations, maxTokens },
      error: err,
      startedAt,
      finishedAt: new Date(),
      autoBlastRadius,
    });
    err.mercuryRunLedger = writeRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      entry: ledgerEntry,
    });
    throw err;
  } finally {
    if (storeConnected) {
      await store.disconnect();
    }
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

    if (args.checkProviders) {
      const result = await runProviderPreflight();
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
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
      if (result.answerQuality && Array.isArray(result.answerQuality.flags) && result.answerQuality.flags.length > 0) {
        console.log(`[answer quality warnings: ${result.answerQuality.flags.join(', ')}]`);
      }
      if (result.toolTelemetry) {
        console.log(`[tool telemetry: ${formatToolTelemetry(result.toolTelemetry)}]`);
      }
      if (result.runLedger) {
        console.log(`[run ledger: ${result.runLedger.citation}]`);
      }
      if (result.consensus) {
        console.log('');
        console.log('═══ FABLE CONSENSUS ═══');
        console.log('');
        if (result.consensus.ok) {
          console.log(result.consensus.answer);
          console.log('');
          console.log(`[consensus: ${result.consensus.provider}/${result.consensus.model} | latency: ${result.consensus.latencyMs}ms]`);
          if (result.consensus.recheck) {
            console.log('');
            console.log('═══ MERCURY RECHECK ═══');
            console.log('');
            console.log(`Prompt:\n${result.consensus.recheckPrompt}`);
            console.log('');
            console.log(result.consensus.recheck.answer);
            console.log('');
            console.log(`[recheck iterations: ${result.consensus.recheck.iterations} | termination: ${result.consensus.recheck.termination} | latency: ${result.consensus.recheck.totalLatencyMs}ms]`);
            if (result.consensus.recheck.toolTelemetry) {
              console.log(`[recheck tool telemetry: ${formatToolTelemetry(result.consensus.recheck.toolTelemetry)}]`);
            }
          }
          if (result.adversarialReviewPacket) {
            console.log('');
            console.log('═══ ADVERSARIAL REVIEW PACKET ═══');
            console.log('');
            console.log(result.adversarialReviewPacket);
          }
        } else {
          console.log(`Consensus unavailable: ${result.consensus.error.message}`);
          console.log(`[consensus: ${result.consensus.provider}/${result.consensus.model}]`);
        }
      }

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
    if (err.mercuryRunLedger) {
      console.error(`[MERCURY-BRIDGE] Run ledger: ${err.mercuryRunLedger.citation}`);
    }
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

module.exports = {
  parseArgs,
  runAgentic,
  buildCurrentChangeBlastRadius,
  currentChangedFiles,
  isSerenaSourcePath,
  selectCurrentChangeNames,
};
