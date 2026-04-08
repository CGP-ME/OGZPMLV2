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
  const topK = opts.topK != null ? opts.topK : config.RETRIEVE_TOP_K;
  const maxIterations = opts.maxIterations || 10;
  const maxTokens = opts.maxTokens || 2000;

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
      console.log('[MERCURY-BRIDGE] Embedding query for starter context...');
    }

    const queryEmbedding = await embedText(query);
    const starterContext = await retrieveTopK(store, queryEmbedding, topK);

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Starter context: ${starterContext.length} chunks`);
      starterContext.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.file_path}:${c.start_line}-${c.end_line} ` +
          `(${c.kind}: ${c.name || 'unnamed'}) sim=${c.similarity.toFixed(3)}`);
      });
    }

    // 2. Build the tool adapter with both repo access and mongo (for get_chunk)
    const adapter = createToolAdapter({
      repoRoot: config.REPO_ROOT,
      mongoStore: store,
      // readOnlyToolbox: not provided — adapter will use direct ripgrep/JS fallback
    });

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Tool adapter ready. Tools: ${Object.keys(adapter.tools).join(', ')}`);
      console.log(`[MERCURY-BRIDGE] Starting ReAct loop (max ${maxIterations} iterations)...`);
    }

    // 3. Run the loop
    const result = await runReactLoop({
      query,
      starterContext,
      toolAdapter: adapter,
      maxIterations,
      maxTokens,
      verbose,
    });

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

  if (!args.query) {
    usage();
    process.exit(1);
  }

  try {
    if (args.agentic) {
      // Agentic mode — ReAct loop with tool access
      const result = await runAgentic(args.query, args);

      console.log('');
      console.log('═══ ANSWER ═══');
      console.log('');
      console.log(result.finalAnswer);
      console.log('');
      console.log(`[iterations: ${result.iterations} | termination: ${result.terminationReason} | latency: ${result.totalLatencyMs}ms]`);

      if (args.showHistory && result.history.length > 0) {
        console.log('');
        console.log('─── TOOL CALL TRACE ───');
        for (const turn of result.history) {
          console.log('');
          console.log(`## Turn ${turn.turnNumber}`);
          if (turn.toolCall) {
            console.log(`TOOL: ${turn.toolCall.name}(${JSON.stringify(turn.toolCall.args)})`);
            const resultStr = JSON.stringify(turn.toolResult, null, 2);
            console.log(`RESULT: ${resultStr.slice(0, 1000)}${resultStr.length > 1000 ? '...[truncated]' : ''}`);
          } else {
            console.log(`(no tool call — parse error or intermediate response)`);
            console.log(`RESPONSE: ${turn.assistantResponse.slice(0, 500)}`);
          }
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
