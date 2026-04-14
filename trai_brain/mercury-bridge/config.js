/**
 * Mercury Bridge — Configuration
 * ══════════════════════════════════════════════════════════════
 * All env-driven. No hardcoded paths or keys.
 * Override any value via .env or environment.
 */

'use strict';

const path = require('path');

// ─── Repo root ────────────────────────────────────────────────
// Default assumes this file lives at trai_brain/mercury-bridge/
// Going up 2 levels lands at the repo root.
const REPO_ROOT = process.env.OGZ_REPO_ROOT
  || path.resolve(__dirname, '..', '..');

// ─── MongoDB ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'ogz_knowledge';
const MONGO_COLLECTION_CHUNKS = process.env.MONGO_COLLECTION_CHUNKS || 'chunks';
const MONGO_COLLECTION_STATS = process.env.MONGO_COLLECTION_STATS || 'index_stats';

// ─── Embeddings (OpenAI-compatible endpoint) ─────────────────
// Default: OpenAI direct API with text-embedding-3-small
//
// Why OpenAI direct over GitHub Models:
//   - No rate limits (Tier 1: 3000 RPM, 1M TPM — effectively unlimited for us)
//   - ~$0.02 per 1M tokens (full repo reindex = ~1-2 cents)
//   - Same model exactly (text-embedding-3-small, 1536 dims)
//   - Can reindex as often as we want during development
//
// Override any of these via .env to swap to GitHub Models, Azure OpenAI,
// or another OpenAI-compatible provider without code changes.
//
// To use GitHub Models instead (free tier, 150 req/day):
//   EMBED_ENDPOINT=https://models.github.ai/inference/embeddings
//   EMBED_MODEL=openai/text-embedding-3-small
//   EMBED_API_KEY=<github_pat>
//
// To use OpenAI direct (default — paid, but pennies/month):
//   EMBED_ENDPOINT=https://api.openai.com/v1/embeddings
//   EMBED_MODEL=text-embedding-3-small
//   EMBED_API_KEY=<openai_api_key>  (or set OPENAI_API_KEY)
const EMBED_ENDPOINT = process.env.EMBED_ENDPOINT
  || 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = process.env.EMBED_MODEL
  || 'text-embedding-3-small';
const EMBED_API_KEY = process.env.EMBED_API_KEY
  || process.env.OPENAI_API_KEY
  || process.env.GITHUB_TOKEN
  || '';

// ─── Batching ─────────────────────────────────────────────────
// OpenAI direct allows up to 2048 inputs per request and 8191 tokens per input.
// We use comfortable defaults that work for both OpenAI direct AND GitHub Models
// free tier (which has tighter 64K-tokens-per-request and 15-req/min limits).
// Override via env var if you want to push harder on OpenAI direct.
const EMBED_BATCH_MAX_CHUNKS = parseInt(process.env.EMBED_BATCH_MAX_CHUNKS || '100', 10);
const EMBED_BATCH_MAX_TOKENS = parseInt(process.env.EMBED_BATCH_MAX_TOKENS || '200000', 10);
// Min ms between requests. OpenAI direct: 0 (no pacing needed). GitHub Models
// free tier: set to 4500 to stay under 15 req/min.
const EMBED_MIN_INTERVAL_MS = parseInt(process.env.EMBED_MIN_INTERVAL_MS || '0', 10);

// ─── Ollama (deprecated, kept for fallback only) ─────────────
// No longer used by default. Kept here so the fallback path stays documented.
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

// ─── Chunking ─────────────────────────────────────────────────
const CHUNK_WINDOW_SIZE = parseInt(process.env.CHUNK_WINDOW_SIZE || '1500', 10);
const CHUNK_WINDOW_OVERLAP = parseInt(process.env.CHUNK_WINDOW_OVERLAP || '150', 10);
const MAX_FILE_BYTES = parseInt(process.env.MAX_FILE_BYTES || '500000', 10);  // 500KB
const MAX_CHUNK_CHARS = parseInt(process.env.MAX_CHUNK_CHARS || '6000', 10);  // guard

// ─── Retrieval ────────────────────────────────────────────────
const RETRIEVE_TOP_K = parseInt(process.env.RETRIEVE_TOP_K || '8', 10);

// ─── Layer 2: Hybrid retrieval ────────────────────────────────
// BM25 parameters (Robertson 1995 standard values)
const BM25_K1 = parseFloat(process.env.BM25_K1 || '1.2');
const BM25_B = parseFloat(process.env.BM25_B || '0.75');

// Reciprocal Rank Fusion constant — controls how aggressively low-ranked
// results are discounted. Standard value from Cormack et al. 2009.
const RRF_K = parseInt(process.env.RRF_K || '60', 10);

// How many candidates each scorer returns before RRF merge
const HYBRID_CANDIDATE_POOL = parseInt(process.env.HYBRID_CANDIDATE_POOL || '50', 10);

// Content-type boost multipliers applied to RRF score.
const CONTENT_TYPE_BOOST_STRONG = parseFloat(process.env.CONTENT_TYPE_BOOST_STRONG || '1.5');
const CONTENT_TYPE_BOOST_WEAK = parseFloat(process.env.CONTENT_TYPE_BOOST_WEAK || '1.2');

// Feature flag — set to false to fall back to pure semantic search
const HYBRID_ENABLED = (process.env.HYBRID_ENABLED || 'true').toLowerCase() !== 'false';

// ─── Investigation trace memory ──────────────────────────────
const TRACE_MEMORY_ENABLED = process.env.TRACE_MEMORY_ENABLED !== 'false';
const TRACE_INJECT_THRESHOLD = parseFloat(process.env.TRACE_INJECT_THRESHOLD || '0.75');
const TRACE_DEDUP_THRESHOLD = parseFloat(process.env.TRACE_DEDUP_THRESHOLD || '0.92');
const TRACE_STALE_DAYS = parseInt(process.env.TRACE_STALE_DAYS || '30', 10);
const TRACE_MAX_COUNT = parseInt(process.env.TRACE_MAX_COUNT || '10000', 10);
const TRACE_PROTECTED_USAGE_COUNT = parseInt(process.env.TRACE_PROTECTED_USAGE_COUNT || '3', 10);

// ─── Skip patterns ────────────────────────────────────────────
// Directories and files excluded from indexing
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'data',
  'backtest-results',
  'logs',
  'dist',
  'build',
  '.ai-specs',
  'trees',
  'backtest',
  'pinescript',
  '.claude',
  // RAG hygiene: exclude non-canonical ogz-meta subdirs from indexing
  'proposals',       // historical pipeline proposals — not ground truth
  'manifests',       // pipeline mission state files — not ground truth
  'ledger',          // audits, handoffs, plans, screenshots — not ground truth
  'health-reports',  // runtime health logs
  'sessions',        // session form outputs
  'replacements',    // pipeline replacement blocks
  'reports',         // pipeline mission reports
  'ogz-ledger',      // everything explicitly moved out of canonical space
  'cold-traces',     // forensic traces — reference only, not prescriptive
  'audits',          // audit outputs — reference, not canonical
]);

const SKIP_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.mp4', '.mp3', '.wav', '.mov',
  '.lock', '.lockb',
  '.log',
]);

const SKIP_FILE_PATTERNS = [
  /\.bak$/,
  /\.bak-/,
  /\.backup$/,
  /\.min\.js$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  // RAG hygiene: skip large noise files and non-canonical ogz-meta top-level files
  /call-graph-cache\.json$/,    // 12MB call graph cache
  /rag_index\.json$/,           // old pre-Mercury RAG index
  /todocontext\d+\.md$/,        // session handoff megadocs
  /\.last-rag-query\.json$/,    // ephemeral query state
  /MISSION-.*\.md$/,            // proposal docs (anywhere in tree)
  /backtest-report-.*\.json$/,  // backtest report outputs
];

const INDEX_FILE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs',
  '.md',
  '.json',    // only small config/docs, guarded by file size
  '.jsonl',   // structured records (fixes.jsonl, etc.)
]);

// ─── Mercury prompt guidance ──────────────────────────────────
// System prompt appended to retrieved context before Mercury call
const MERCURY_SYSTEM_PROMPT = `You are a code review and architecture assistant for the OGZPrime trading platform. You have access to the retrieved code chunks provided below as your ONLY source of ground truth. Rules:

1. Answer using ONLY the retrieved chunks. If the answer is not in the retrieved chunks, say "not in retrieved context" rather than guessing.
2. Cite file:line for every factual claim in the format \`path/to/file.js:start-end\`.
3. If chunks contradict each other, surface the contradiction explicitly.
4. Be terse. Prefer structure over prose. Lead with the answer, then evidence.
5. Do not invent functions, variables, or file paths that are not in the retrieved context.
6. If the user asks you to modify code, respond with what you would change and why — do not output code unless explicitly asked for code.`;

module.exports = {
  REPO_ROOT,
  MONGO_URI,
  MONGO_DB_NAME,
  MONGO_COLLECTION_CHUNKS,
  MONGO_COLLECTION_STATS,
  EMBED_ENDPOINT,
  EMBED_MODEL,
  EMBED_API_KEY,
  EMBED_BATCH_MAX_CHUNKS,
  EMBED_BATCH_MAX_TOKENS,
  EMBED_MIN_INTERVAL_MS,
  OLLAMA_URL,
  OLLAMA_EMBED_MODEL,
  CHUNK_WINDOW_SIZE,
  CHUNK_WINDOW_OVERLAP,
  MAX_FILE_BYTES,
  MAX_CHUNK_CHARS,
  RETRIEVE_TOP_K,
  BM25_K1,
  BM25_B,
  RRF_K,
  HYBRID_CANDIDATE_POOL,
  CONTENT_TYPE_BOOST_STRONG,
  CONTENT_TYPE_BOOST_WEAK,
  HYBRID_ENABLED,
  TRACE_MEMORY_ENABLED,
  TRACE_INJECT_THRESHOLD,
  TRACE_DEDUP_THRESHOLD,
  TRACE_STALE_DAYS,
  TRACE_MAX_COUNT,
  TRACE_PROTECTED_USAGE_COUNT,
  SKIP_DIRS,
  SKIP_FILE_EXTENSIONS,
  SKIP_FILE_PATTERNS,
  INDEX_FILE_EXTENSIONS,
  MERCURY_SYSTEM_PROMPT,
};
