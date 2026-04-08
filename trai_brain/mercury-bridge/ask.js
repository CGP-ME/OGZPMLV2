#!/usr/bin/env node
/**
 * Mercury Bridge — CLI Entry
 * ══════════════════════════════════════════════════════════════
 * One-off CLI for asking Mercury questions about the OGZPrime codebase
 * with full RAG-retrieved context.
 *
 * Usage:
 *   node trai_brain/mercury-bridge/ask.js "How does MPM handle BE scale-out?"
 *
 * Flags:
 *   --top-k=N         Retrieve N chunks (default 8)
 *   --max-tokens=N    Mercury max tokens (default 2000)
 *   --quiet           Suppress progress logs
 *   --show-chunks     Print the retrieved chunk text (not just filenames)
 */

'use strict';

const { ask } = require('./searcher');

function parseArgs(argv) {
  const args = { query: '', topK: null, maxTokens: null, quiet: false, showChunks: false };
  const positional = [];

  for (const arg of argv.slice(2)) {
    if (arg === '--quiet') {
      args.quiet = true;
    } else if (arg === '--show-chunks') {
      args.showChunks = true;
    } else if (arg.startsWith('--top-k=')) {
      args.topK = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-tokens=')) {
      args.maxTokens = parseInt(arg.split('=')[1], 10);
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
  console.log('');
  console.log('Flags:');
  console.log('  --top-k=N         Retrieve N chunks (default 8)');
  console.log('  --max-tokens=N    Mercury max tokens (default 2000)');
  console.log('  --quiet           Suppress progress logs');
  console.log('  --show-chunks     Print retrieved chunk text, not just filenames');
  console.log('');
  console.log('Examples:');
  console.log('  node trai_brain/mercury-bridge/ask.js "What does StopLossChecker do?"');
  console.log('  node trai_brain/mercury-bridge/ask.js --top-k=12 "Explain the per-trade sealed env architecture"');
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.query) {
    usage();
    process.exit(1);
  }

  try {
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

  } catch (err) {
    console.error('');
    console.error('[MERCURY-BRIDGE] ERROR:', err.message);
    if (err.message.includes('No chunks in index')) {
      console.error('');
      console.error('Run the indexer first:');
      console.error('  node trai_brain/mercury-bridge/indexer.js');
    }
    if (err.message.includes('MongoDB')) {
      console.error('');
      console.error('Check MongoDB is running:');
      console.error('  sudo systemctl status mongod');
    }
    if (err.message.includes('Ollama')) {
      console.error('');
      console.error('Check Ollama is running and nomic-embed-text is pulled:');
      console.error('  ollama list');
      console.error('  ollama pull nomic-embed-text');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
