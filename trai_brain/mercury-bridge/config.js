/**
 * Mercury Bridge — Configuration
 * ══════════════════════════════════════════════════════════════
 * All env-driven. No hardcoded paths or keys.
 * Override any value via .env or environment.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Repo root ────────────────────────────────────────────────
// Default assumes this file lives at trai_brain/mercury-bridge/
// Going up 2 levels lands at the repo root.
const REPO_ROOT = process.env.OGZ_REPO_ROOT
  || path.resolve(__dirname, '..', '..');
const MERCURY_IGNORE_FILE = path.join(REPO_ROOT, 'mercury.ignore');

function loadMercuryIgnore(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing Mercury ignore contract: ${filePath}`);
  }

  const skipDirs = new Set();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const [idx, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!line.endsWith('/')) {
      throw new Error(`Invalid mercury.ignore line ${idx + 1}: directory entries must end with /`);
    }
    if (line.includes('*')) {
      throw new Error(`Invalid mercury.ignore line ${idx + 1}: glob entries are not supported`);
    }
    const normalized = line.replace(/\\/g, '/').replace(/\/+$/, '');
    const segments = normalized.split('/').filter(Boolean);
    const dirName = segments[segments.length - 1];
    if (!dirName || dirName === '.' || dirName === '..') {
      throw new Error(`Invalid mercury.ignore line ${idx + 1}: ${rawLine}`);
    }
    skipDirs.add(dirName);
  }

  if (skipDirs.size === 0) {
    throw new Error(`Mercury ignore contract is empty: ${filePath}`);
  }

  return { skipDirs };
}

// ─── Embeddings ───────────────────────────────────────────────
// Default Mercury retrieval is local. OpenAI-compatible embeddings remain
// available only by explicit env override:
//   EMBED_PROVIDER=openai-compatible
const EMBED_PROVIDER = (process.env.EMBED_PROVIDER || 'ollama').toLowerCase();

// ─── MongoDB ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'ogz_knowledge';
const DEFAULT_MONGO_COLLECTION_CHUNKS = EMBED_PROVIDER === 'ollama'
  ? 'chunks_local_nomic'
  : 'chunks';
const DEFAULT_MONGO_COLLECTION_STATS = EMBED_PROVIDER === 'ollama'
  ? 'index_stats_local_nomic'
  : 'index_stats';
const MONGO_COLLECTION_CHUNKS = process.env.MONGO_COLLECTION_CHUNKS || DEFAULT_MONGO_COLLECTION_CHUNKS;
const MONGO_COLLECTION_STATS = process.env.MONGO_COLLECTION_STATS || DEFAULT_MONGO_COLLECTION_STATS;

// ─── Embeddings: OpenAI-compatible endpoint ──────────────────
// Optional explicit path: OpenAI direct API with text-embedding-3-small
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
// ─── Embeddings: local Ollama opt-in ─────────────────────────
// Do not read global OLLAMA_URL here; this bridge path is for local memory
// retrieval, and the global OLLAMA_URL may point at remote inference tunnels.
const LOCAL_OLLAMA_EMBED_URL = process.env.MERCURY_LOCAL_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

const EMBED_ENDPOINT = process.env.EMBED_ENDPOINT
  || (EMBED_PROVIDER === 'ollama'
    ? `${LOCAL_OLLAMA_EMBED_URL.replace(/\/+$/, '')}/api/embed`
    : 'https://api.openai.com/v1/embeddings');
const EMBED_ENDPOINT_HOST = (() => {
  try {
    return new URL(EMBED_ENDPOINT).hostname.toLowerCase();
  } catch {
    return '';
  }
})();
const EMBED_MODEL = process.env.EMBED_MODEL
  || (EMBED_PROVIDER === 'ollama' ? OLLAMA_EMBED_MODEL : 'text-embedding-3-small');
const EMBED_API_KEY = EMBED_PROVIDER === 'openai-compatible'
  ? (process.env.EMBED_API_KEY
    || (EMBED_ENDPOINT_HOST.endsWith('github.ai') ? process.env.GITHUB_TOKEN : process.env.OPENAI_API_KEY)
    || process.env.GITHUB_TOKEN
    || '')
  : '';

if (!['openai-compatible', 'ollama'].includes(EMBED_PROVIDER)) {
  throw new Error(`Unsupported EMBED_PROVIDER=${EMBED_PROVIDER}. Use openai-compatible or ollama.`);
}

if (EMBED_PROVIDER === 'ollama') {
  const endpointUrl = new URL(EMBED_ENDPOINT);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(endpointUrl.hostname)) {
    throw new Error(`EMBED_PROVIDER=ollama requires a local endpoint, got ${EMBED_ENDPOINT}. Use MERCURY_LOCAL_OLLAMA_URL=http://localhost:11434.`);
  }
}

function slugEmbedIndexPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeEmbedEndpointIdentity(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch (err) {
    throw new Error(`Invalid EMBED_ENDPOINT=${endpoint}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('EMBED_ENDPOINT must not contain credentials, query parameters, or fragments');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}`;
}

function resolveEmbedDimensions(provider, model) {
  if (process.env.EMBED_DIMENSIONS) {
    const dimensions = parseInt(process.env.EMBED_DIMENSIONS, 10);
    if (!Number.isFinite(dimensions) || dimensions <= 0) {
      throw new Error(`Invalid EMBED_DIMENSIONS=${process.env.EMBED_DIMENSIONS}`);
    }
    return dimensions;
  }

  const normalizedProvider = String(provider).toLowerCase();
  const normalizedModel = String(model).toLowerCase();
  if (normalizedProvider === 'ollama' && normalizedModel === 'nomic-embed-text') return 768;
  if (normalizedProvider === 'openai-compatible' && normalizedModel.endsWith('text-embedding-3-small')) return 1536;

  throw new Error(`EMBED_DIMENSIONS is required for ${provider}/${model}`);
}

const EMBED_DIMENSIONS = resolveEmbedDimensions(EMBED_PROVIDER, EMBED_MODEL);
const EMBED_ENDPOINT_ID = normalizeEmbedEndpointIdentity(EMBED_ENDPOINT);
const EMBED_INDEX_ID = [
  slugEmbedIndexPart(EMBED_PROVIDER),
  slugEmbedIndexPart(EMBED_ENDPOINT_ID),
  slugEmbedIndexPart(EMBED_MODEL),
  EMBED_DIMENSIONS,
].join('__');

// ─── Batching ─────────────────────────────────────────────────
// OpenAI direct allows up to 2048 inputs per request and 8191 tokens per input.
// We use comfortable defaults that work for both OpenAI direct AND GitHub Models
// free tier (which has tighter 64K-tokens-per-request and 15-req/min limits).
// Override via env var if you want to push harder on OpenAI direct.
const DEFAULT_EMBED_BATCH_MAX_CHUNKS = EMBED_PROVIDER === 'ollama' ? 1 : 100;
const DEFAULT_EMBED_BATCH_MAX_TOKENS = EMBED_PROVIDER === 'ollama' ? 2000 : 200000;
const EMBED_BATCH_MAX_CHUNKS = parseInt(
  process.env.EMBED_BATCH_MAX_CHUNKS || String(DEFAULT_EMBED_BATCH_MAX_CHUNKS),
  10
);
const EMBED_BATCH_MAX_TOKENS = parseInt(
  process.env.EMBED_BATCH_MAX_TOKENS || String(DEFAULT_EMBED_BATCH_MAX_TOKENS),
  10
);
const EMBED_FAIL_ON_BATCH_ERROR = (process.env.EMBED_FAIL_ON_BATCH_ERROR || 'true').toLowerCase() !== 'false';
// Min ms between requests. OpenAI direct: 0 (no pacing needed). GitHub Models
// free tier: set to 4500 to stay under 15 req/min.
const EMBED_MIN_INTERVAL_MS = parseInt(process.env.EMBED_MIN_INTERVAL_MS || '0', 10);

// ─── Ollama local embedder metadata ──────────────────────────
const OLLAMA_URL = LOCAL_OLLAMA_EMBED_URL;

// ─── Chunking ─────────────────────────────────────────────────
const DEFAULT_CHUNK_WINDOW_SIZE = EMBED_PROVIDER === 'ollama' ? 1000 : 1500;
const DEFAULT_CHUNK_WINDOW_OVERLAP = EMBED_PROVIDER === 'ollama' ? 100 : 150;
const DEFAULT_MAX_CHUNK_CHARS = EMBED_PROVIDER === 'ollama' ? 1500 : 6000;
const CHUNK_WINDOW_SIZE = parseInt(process.env.CHUNK_WINDOW_SIZE || String(DEFAULT_CHUNK_WINDOW_SIZE), 10);
const CHUNK_WINDOW_OVERLAP = parseInt(process.env.CHUNK_WINDOW_OVERLAP || String(DEFAULT_CHUNK_WINDOW_OVERLAP), 10);
const MAX_FILE_BYTES = parseInt(process.env.MAX_FILE_BYTES || '500000', 10);  // 500KB
const MAX_CHUNK_CHARS = parseInt(process.env.MAX_CHUNK_CHARS || String(DEFAULT_MAX_CHUNK_CHARS), 10);

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
const TRACE_MEMORY_ENABLED = process.env.TRACE_MEMORY_ENABLED != null
  ? process.env.TRACE_MEMORY_ENABLED !== 'false'
  : EMBED_PROVIDER === 'openai-compatible';
const TRACE_INJECT_THRESHOLD = parseFloat(process.env.TRACE_INJECT_THRESHOLD || '0.75');
const TRACE_DEDUP_THRESHOLD = parseFloat(process.env.TRACE_DEDUP_THRESHOLD || '0.92');
const TRACE_STALE_DAYS = parseInt(process.env.TRACE_STALE_DAYS || '30', 10);
const TRACE_MAX_COUNT = parseInt(process.env.TRACE_MAX_COUNT || '10000', 10);
const TRACE_PROTECTED_USAGE_COUNT = parseInt(process.env.TRACE_PROTECTED_USAGE_COUNT || '3', 10);

// ─── Skip patterns ────────────────────────────────────────────
// Directory exclusions live in mercury.ignore so intake/history boundaries are
// visible and shared by the indexer, Mercury grep, and legacy repo search.
const { skipDirs: SKIP_DIRS } = loadMercuryIgnore(MERCURY_IGNORE_FILE);

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
  /call-graph-cache\.json$/,
  /rag_index\.json$/,
  /todocontext\d+\.md$/,
  /\.last-rag-query\.json$/,
  /MISSION-.*\.md$/,
  /backtest-report-.*\.json$/,
  /equity_\d{4}.*\.json$/,
  /metrics_\d{4}.*\.json$/,
  /trades_\d{4}.*\.json$/,
  /debug-.*\.js$/,
  /tuning-report-.*\.json$/,
  /round\d+-results\.json$/,
  /mission0\.md$/,
  /claudito-cognition-refactor-plan\.md$/,
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
  MERCURY_IGNORE_FILE,
  loadMercuryIgnore,
  EMBED_PROVIDER,
  EMBED_ENDPOINT,
  EMBED_ENDPOINT_ID,
  EMBED_MODEL,
  EMBED_DIMENSIONS,
  EMBED_INDEX_ID,
  EMBED_API_KEY,
  EMBED_BATCH_MAX_CHUNKS,
  EMBED_BATCH_MAX_TOKENS,
  EMBED_FAIL_ON_BATCH_ERROR,
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
