/**
 * Mercury Bridge — Configuration
 * ══════════════════════════════════════════════════════════════
 * Runtime tunables live in mercury.config.json.
 * Secrets are read only through explicitly configured env key names.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Repo root ────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const explicitConfigFile = typeof process.env.MERCURY_CONFIG_FILE === 'string'
  ? process.env.MERCURY_CONFIG_FILE.trim()
  : '';
const MERCURY_CONFIG_FILE = explicitConfigFile
  ? path.resolve(explicitConfigFile)
  : path.join(REPO_ROOT, 'mercury.config.json');
const MERCURY_IGNORE_FILE = path.join(REPO_ROOT, 'mercury.ignore');

function getConfigValue(config, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => (
    current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), config);
}

function readMercuryConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing Mercury config contract: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid Mercury config JSON at ${filePath}: ${err.message}`);
  }
}

function requiredString(config, dottedPath) {
  const value = getConfigValue(config, dottedPath);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing mercury.config.json value: ${dottedPath}`);
  }
  return value.trim();
}

function optionalString(config, dottedPath) {
  const value = getConfigValue(config, dottedPath);
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`Invalid mercury.config.json value: ${dottedPath} must be a string`);
  }
  return value.trim();
}

function requiredBoolean(config, dottedPath) {
  const value = getConfigValue(config, dottedPath);
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid mercury.config.json value: ${dottedPath} must be a boolean`);
  }
  return value;
}

function optionalBoolean(config, dottedPath, defaultValue) {
  const value = getConfigValue(config, dottedPath);
  if (value == null) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid mercury.config.json value: ${dottedPath} must be a boolean`);
  }
  return value;
}

function requiredNumber(config, dottedPath, { integer = false, min = Number.NEGATIVE_INFINITY } = {}) {
  const value = getConfigValue(config, dottedPath);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid mercury.config.json value: ${dottedPath} must be a finite number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`Invalid mercury.config.json value: ${dottedPath} must be an integer`);
  }
  if (value < min) {
    throw new Error(`Invalid mercury.config.json value: ${dottedPath} must be >= ${min}`);
  }
  return value;
}

function optionalNumber(config, dottedPath, defaultValue, options = {}) {
  const value = getConfigValue(config, dottedPath);
  if (value == null) return defaultValue;
  return requiredNumber(config, dottedPath, options);
}

function requiredText(config, dottedPath) {
  const value = getConfigValue(config, dottedPath);
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (Array.isArray(value) && value.every((line) => typeof line === 'string')) {
    const joined = value.join('\n').trim();
    if (joined !== '') return joined;
  }
  throw new Error(`Missing mercury.config.json text value: ${dottedPath}`);
}

function optionalText(config, dottedPath, defaultValue) {
  const value = getConfigValue(config, dottedPath);
  if (value == null || value === '') return defaultValue;
  return requiredText(config, dottedPath);
}

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

function isPathIgnoredByMercury(pathLike, skipDirs = SKIP_DIRS) {
  if (!pathLike || typeof pathLike !== 'string') return false;
  const parts = pathLike.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.some(part => skipDirs.has(part));
}

const MERCURY_CONFIG = readMercuryConfig(MERCURY_CONFIG_FILE);

// ─── Embeddings ───────────────────────────────────────────────
const EMBED_PROVIDER = requiredString(MERCURY_CONFIG, 'embeddings.provider').toLowerCase();

// ─── MongoDB ──────────────────────────────────────────────────
const MONGO_URI = requiredString(MERCURY_CONFIG, 'mongo.uri');
const MONGO_DB_NAME = requiredString(MERCURY_CONFIG, 'mongo.dbName');
const MONGO_COLLECTION_CHUNKS = requiredString(MERCURY_CONFIG, 'mongo.chunksCollection');
const MONGO_COLLECTION_STATS = requiredString(MERCURY_CONFIG, 'mongo.statsCollection');

const EMBED_ENDPOINT = requiredString(MERCURY_CONFIG, 'embeddings.endpoint');
const EMBED_MODEL = requiredString(MERCURY_CONFIG, 'embeddings.model');
const EMBED_API_KEY_ENV = optionalString(MERCURY_CONFIG, 'embeddings.apiKeyEnv');
let EMBED_API_KEY = '';

if (!['openai-compatible', 'ollama'].includes(EMBED_PROVIDER)) {
  throw new Error(`Unsupported EMBED_PROVIDER=${EMBED_PROVIDER}. Use openai-compatible or ollama.`);
}

if (EMBED_PROVIDER === 'openai-compatible') {
  if (!EMBED_API_KEY_ENV) {
    throw new Error('embeddings.apiKeyEnv is required when EMBED_PROVIDER=openai-compatible');
  }
  EMBED_API_KEY = process.env[EMBED_API_KEY_ENV];
  if (!EMBED_API_KEY) {
    throw new Error(`Configured embedding API key env is missing: ${EMBED_API_KEY_ENV}`);
  }
} else if (EMBED_API_KEY_ENV) {
  throw new Error('embeddings.apiKeyEnv must be empty when EMBED_PROVIDER=ollama');
}

if (EMBED_PROVIDER === 'ollama') {
  const endpointUrl = new URL(EMBED_ENDPOINT);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(endpointUrl.hostname)) {
    throw new Error(`EMBED_PROVIDER=ollama requires a local endpoint, got ${EMBED_ENDPOINT}. Set embeddings.endpoint in mercury.config.json.`);
  }
}

function slugEmbedIndexPart(value) {
  return String(value == null ? '' : value)
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
  const trimmedPathname = parsed.pathname.replace(/\/+$/, '');
  const pathname = trimmedPathname === '' ? '/' : trimmedPathname;
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}`;
}

const EMBED_DIMENSIONS = requiredNumber(MERCURY_CONFIG, 'embeddings.dimensions', { integer: true, min: 1 });
const EMBED_ENDPOINT_ID = normalizeEmbedEndpointIdentity(EMBED_ENDPOINT);
const EMBED_INDEX_ID = [
  slugEmbedIndexPart(EMBED_PROVIDER),
  slugEmbedIndexPart(EMBED_ENDPOINT_ID),
  slugEmbedIndexPart(EMBED_MODEL),
  EMBED_DIMENSIONS,
].join('__');

// ─── Batching ─────────────────────────────────────────────────
const EMBED_BATCH_MAX_CHUNKS = requiredNumber(MERCURY_CONFIG, 'batching.maxChunks', { integer: true, min: 1 });
const EMBED_BATCH_MAX_TOKENS = requiredNumber(MERCURY_CONFIG, 'batching.maxTokens', { integer: true, min: 1 });
const EMBED_FAIL_ON_BATCH_ERROR = requiredBoolean(MERCURY_CONFIG, 'batching.failOnBatchError');
const EMBED_MIN_INTERVAL_MS = requiredNumber(MERCURY_CONFIG, 'batching.minIntervalMs', { integer: true, min: 0 });

// ─── Ollama local embedder metadata ──────────────────────────
const OLLAMA_URL = EMBED_PROVIDER === 'ollama'
  ? new URL(EMBED_ENDPOINT).origin
  : null;
const OLLAMA_EMBED_MODEL = EMBED_PROVIDER === 'ollama'
  ? EMBED_MODEL
  : null;

// ─── Chunking ─────────────────────────────────────────────────
const CHUNK_WINDOW_SIZE = requiredNumber(MERCURY_CONFIG, 'chunking.windowSize', { integer: true, min: 1 });
const CHUNK_WINDOW_OVERLAP = requiredNumber(MERCURY_CONFIG, 'chunking.windowOverlap', { integer: true, min: 0 });
const MAX_FILE_BYTES = requiredNumber(MERCURY_CONFIG, 'chunking.maxFileBytes', { integer: true, min: 1 });
const MAX_CHUNK_CHARS = requiredNumber(MERCURY_CONFIG, 'chunking.maxChunkChars', { integer: true, min: 1 });

// ─── Retrieval ────────────────────────────────────────────────
const RETRIEVE_TOP_K = requiredNumber(MERCURY_CONFIG, 'retrieval.topK', { integer: true, min: 1 });

// ─── Layer 2: Hybrid retrieval ────────────────────────────────
// BM25 parameters (Robertson 1995 standard values)
const BM25_K1 = requiredNumber(MERCURY_CONFIG, 'retrieval.bm25K1', { min: 0 });
const BM25_B = requiredNumber(MERCURY_CONFIG, 'retrieval.bm25B', { min: 0 });

// Reciprocal Rank Fusion constant — controls how aggressively low-ranked
// results are discounted. Standard value from Cormack et al. 2009.
const RRF_K = requiredNumber(MERCURY_CONFIG, 'retrieval.rrfK', { integer: true, min: 1 });

// How many candidates each scorer returns before RRF merge
const HYBRID_CANDIDATE_POOL = requiredNumber(MERCURY_CONFIG, 'retrieval.hybridCandidatePool', { integer: true, min: 1 });

// Content-type boost multipliers applied to RRF score.
const CONTENT_TYPE_BOOST_STRONG = requiredNumber(MERCURY_CONFIG, 'retrieval.contentTypeBoostStrong', { min: 0 });
const CONTENT_TYPE_BOOST_WEAK = requiredNumber(MERCURY_CONFIG, 'retrieval.contentTypeBoostWeak', { min: 0 });

const HYBRID_ENABLED = requiredBoolean(MERCURY_CONFIG, 'retrieval.hybridEnabled');

// ─── Investigation trace memory ──────────────────────────────
const TRACE_MEMORY_ENABLED = requiredBoolean(MERCURY_CONFIG, 'traceMemory.enabled');
const TRACE_COLLECTION = requiredString(MERCURY_CONFIG, 'traceMemory.collection');
const TRACE_CAPTURE_MODE = requiredString(MERCURY_CONFIG, 'traceMemory.captureMode').toLowerCase();
const TRACE_INJECT_THRESHOLD = requiredNumber(MERCURY_CONFIG, 'traceMemory.injectThreshold', { min: 0 });
const TRACE_DEDUP_THRESHOLD = requiredNumber(MERCURY_CONFIG, 'traceMemory.dedupThreshold', { min: 0 });
const TRACE_STALE_DAYS = requiredNumber(MERCURY_CONFIG, 'traceMemory.staleDays', { integer: true, min: 0 });
const TRACE_MAX_COUNT = requiredNumber(MERCURY_CONFIG, 'traceMemory.maxCount', { integer: true, min: 1 });
const TRACE_PROTECTED_USAGE_COUNT = requiredNumber(MERCURY_CONFIG, 'traceMemory.protectedUsageCount', { integer: true, min: 0 });
const supportedTraceCaptureModes = new Set(['manual']);
if (!supportedTraceCaptureModes.has(TRACE_CAPTURE_MODE)) {
  throw new Error(`Unsupported traceMemory.captureMode=${TRACE_CAPTURE_MODE}. Use manual.`);
}

// ─── Mercury LLM client ───────────────────────────────────────
const MERCURY_LLM_PROVIDER = requiredString(MERCURY_CONFIG, 'llm.provider').toLowerCase();
const MERCURY_LLM_BASE_URL = requiredString(MERCURY_CONFIG, 'llm.baseUrl');
const MERCURY_LLM_MODEL = requiredString(MERCURY_CONFIG, 'llm.model');
const MERCURY_LLM_API_KEY_ENV = optionalString(MERCURY_CONFIG, 'llm.apiKeyEnv');
const MERCURY_LLM_CLIENT_MAX_TOKENS = requiredNumber(MERCURY_CONFIG, 'llm.clientMaxTokens', { integer: true, min: 1 });
const MERCURY_LLM_CLIENT_MIN_TOKENS = requiredNumber(MERCURY_CONFIG, 'llm.clientMinTokens', { integer: true, min: 0 });
const MERCURY_LLM_REQUEST_TIMEOUT_MS = requiredNumber(MERCURY_CONFIG, 'llm.requestTimeoutMs', { integer: true, min: 1000 });
const MERCURY_LLM_TEMPERATURE = requiredNumber(MERCURY_CONFIG, 'llm.temperature', { min: 0 });
const AGENTIC_MAX_ITERATIONS = requiredNumber(MERCURY_CONFIG, 'agentic.maxIterations', { integer: true, min: 1 });
const AGENTIC_MAX_TOKENS = requiredNumber(MERCURY_CONFIG, 'agentic.maxTokens', { integer: true, min: 1 });
const SINGLE_SHOT_MAX_TOKENS = requiredNumber(MERCURY_CONFIG, 'singleShot.maxTokens', { integer: true, min: 1 });
const AGENTIC_SYSTEM_PROMPT = requiredText(MERCURY_CONFIG, 'agentic.systemPrompt');
const MERCURY_SYSTEM_PROMPT = requiredText(MERCURY_CONFIG, 'singleShot.systemPrompt');

const supportedLlmProviders = new Set(['mercury', 'ollamacloud', 'openai', 'claude', 'ollama']);
if (!supportedLlmProviders.has(MERCURY_LLM_PROVIDER)) {
  throw new Error(`Unsupported llm.provider=${MERCURY_LLM_PROVIDER}. Use ${Array.from(supportedLlmProviders).join(', ')}.`);
}
try {
  const llmBaseUrl = new URL(MERCURY_LLM_BASE_URL);
  if (llmBaseUrl.username || llmBaseUrl.password || llmBaseUrl.search || llmBaseUrl.hash) {
    throw new Error('llm.baseUrl must not contain credentials, query parameters, or fragments');
  }
} catch (err) {
  throw new Error(`Invalid mercury.config.json value: llm.baseUrl: ${err.message}`);
}
if (MERCURY_LLM_PROVIDER === 'ollama') {
  if (MERCURY_LLM_API_KEY_ENV) {
    throw new Error('llm.apiKeyEnv must be empty when llm.provider=ollama');
  }
} else if (!MERCURY_LLM_API_KEY_ENV) {
  throw new Error('llm.apiKeyEnv is required for non-local Mercury LLM providers');
}

// ─── Fable consensus client ──────────────────────────────────
const CONSENSUS_DEFAULT_ENABLED = optionalBoolean(MERCURY_CONFIG, 'consensus.defaultEnabled', false);
const CONSENSUS_PROVIDER = (optionalString(MERCURY_CONFIG, 'consensus.provider') || 'claude').toLowerCase();
const CONSENSUS_BASE_URL = optionalString(MERCURY_CONFIG, 'consensus.baseUrl') || 'https://api.anthropic.com/v1';
const CONSENSUS_MODEL = optionalString(MERCURY_CONFIG, 'consensus.model') || 'claude-fable-5';
const CONSENSUS_API_KEY_ENV = optionalString(MERCURY_CONFIG, 'consensus.apiKeyEnv');
const CONSENSUS_COMMAND = optionalString(MERCURY_CONFIG, 'consensus.command') || 'claude';
const CONSENSUS_PERMISSION_MODE = optionalString(MERCURY_CONFIG, 'consensus.permissionMode') || 'dontAsk';
const CONSENSUS_CLIENT_MAX_TOKENS = optionalNumber(MERCURY_CONFIG, 'consensus.clientMaxTokens', 2000, { integer: true, min: 1 });
const CONSENSUS_CLIENT_MIN_TOKENS = optionalNumber(MERCURY_CONFIG, 'consensus.clientMinTokens', 0, { integer: true, min: 0 });
const CONSENSUS_REQUEST_TIMEOUT_MS = optionalNumber(MERCURY_CONFIG, 'consensus.requestTimeoutMs', 300000, { integer: true, min: 1000 });
const CONSENSUS_TEMPERATURE = optionalNumber(MERCURY_CONFIG, 'consensus.temperature', 0, { min: 0 });
const CONSENSUS_SYSTEM_PROMPT = optionalText(MERCURY_CONFIG, 'consensus.systemPrompt', [
  'You are Fable, the consensus collaborator for OGZPrime Mercury reviews.',
  'Evaluate Mercury evidence. Do not invent repo facts or file:line citations.',
].join('\n'));

if (!new Set(['claude', 'claude-code']).has(CONSENSUS_PROVIDER)) {
  throw new Error(`Unsupported consensus.provider=${CONSENSUS_PROVIDER}. Use claude or claude-code.`);
}
if (CONSENSUS_PROVIDER === 'claude') {
  if (!CONSENSUS_API_KEY_ENV) {
    throw new Error('consensus.apiKeyEnv is required when consensus.provider=claude');
  }
  try {
    const consensusBaseUrl = new URL(CONSENSUS_BASE_URL);
    if (consensusBaseUrl.username || consensusBaseUrl.password || consensusBaseUrl.search || consensusBaseUrl.hash) {
      throw new Error('consensus.baseUrl must not contain credentials, query parameters, or fragments');
    }
  } catch (err) {
    throw new Error(`Invalid mercury.config.json value: consensus.baseUrl: ${err.message}`);
  }
} else if (CONSENSUS_API_KEY_ENV) {
  throw new Error('consensus.apiKeyEnv must be empty when consensus.provider=claude-code');
}

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

module.exports = {
  REPO_ROOT,
  MONGO_URI,
  MONGO_DB_NAME,
  MONGO_COLLECTION_CHUNKS,
  MONGO_COLLECTION_STATS,
  MERCURY_CONFIG_FILE,
  readMercuryConfig,
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
  TRACE_COLLECTION,
  TRACE_CAPTURE_MODE,
  TRACE_INJECT_THRESHOLD,
  TRACE_DEDUP_THRESHOLD,
  TRACE_STALE_DAYS,
  TRACE_MAX_COUNT,
  TRACE_PROTECTED_USAGE_COUNT,
  MERCURY_LLM_PROVIDER,
  MERCURY_LLM_BASE_URL,
  MERCURY_LLM_MODEL,
  MERCURY_LLM_API_KEY_ENV,
  MERCURY_LLM_CLIENT_MAX_TOKENS,
  MERCURY_LLM_CLIENT_MIN_TOKENS,
  MERCURY_LLM_REQUEST_TIMEOUT_MS,
  MERCURY_LLM_TEMPERATURE,
  CONSENSUS_DEFAULT_ENABLED,
  CONSENSUS_PROVIDER,
  CONSENSUS_BASE_URL,
  CONSENSUS_MODEL,
  CONSENSUS_API_KEY_ENV,
  CONSENSUS_COMMAND,
  CONSENSUS_PERMISSION_MODE,
  CONSENSUS_CLIENT_MAX_TOKENS,
  CONSENSUS_CLIENT_MIN_TOKENS,
  CONSENSUS_REQUEST_TIMEOUT_MS,
  CONSENSUS_TEMPERATURE,
  CONSENSUS_SYSTEM_PROMPT,
  AGENTIC_MAX_ITERATIONS,
  AGENTIC_MAX_TOKENS,
  SINGLE_SHOT_MAX_TOKENS,
  AGENTIC_SYSTEM_PROMPT,
  SKIP_DIRS,
  SKIP_FILE_EXTENSIONS,
  SKIP_FILE_PATTERNS,
  INDEX_FILE_EXTENSIONS,
  MERCURY_SYSTEM_PROMPT,
  isPathIgnoredByMercury,
};
