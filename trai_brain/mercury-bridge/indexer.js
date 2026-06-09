/**
 * Mercury Bridge — Indexer
 * ══════════════════════════════════════════════════════════════
 * Walks the OGZPrime repo, chunks source files, embeds each chunk via the
 * provider configured in mercury.config.json, and stores everything in MongoDB.
 *
 * Run:
 *   node trai_brain/mercury-bridge/indexer.js
 *
 * Runtime tunables: mercury.config.json
 *
 * MVP behavior: full reindex every run (clears all chunks first).
 * v2 will add incremental reindex via git diff.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Load .env from repo root so configured provider API keys are available.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = require('./config');
const MongoStore = require('./mongo-store');

// ─────────────────────────────────────────────────────────────
// CONTENT TYPE RESOLVER
// ─────────────────────────────────────────────────────────────

/**
 * Assign a semantic content_type to chunks based on file path.
 * Used by future hybrid retrieval and query router to boost/filter
 * chunks by meaning rather than just by file extension.
 */
function resolveContentType(relPath) {
  const p = relPath.replace(/\\/g, '/');

  if (p === 'CHANGELOG.md') return 'changelog';
  if (p === 'ogz-meta/claudito_context.md') return 'project_context';
  if (p === 'ogz-meta/05_landmines-and-gotchas.md') return 'landmine';
  if (p === 'ogz-meta/04_guardrails-and-rules.md') return 'guardrails';
  if (p === 'ogz-meta/recent-changes.md') return 'recent_changes';
  if (p.startsWith('ogz-meta/proposals/') && p.endsWith('-PROPOSAL.md')) return 'proposal';
  if (p === 'CLAUDITO_MISSION_LOG.md') return 'mission_log';

  return 'general';
}

// ─────────────────────────────────────────────────────────────
// REPO WALKER
// ─────────────────────────────────────────────────────────────

/**
 * Recursively walk a directory, yielding file paths that should be indexed.
 * Respects SKIP_DIRS, SKIP_FILE_EXTENSIONS, SKIP_FILE_PATTERNS, and MAX_FILE_BYTES.
 */
function walkRepo(rootDir) {
  const files = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[walker] Cannot read ${dir}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (config.SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;  // skip hidden dirs
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (config.SKIP_FILE_EXTENSIONS.has(ext)) continue;
      if (!config.INDEX_FILE_EXTENSIONS.has(ext)) continue;

      if (config.SKIP_FILE_PATTERNS.some((pat) => pat.test(entry.name))) continue;

      // Size check
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size > config.MAX_FILE_BYTES) {
        console.warn(`[walker] Skipping ${fullPath} (${stat.size} bytes > ${config.MAX_FILE_BYTES})`);
        continue;
      }

      files.push(fullPath);
    }
  }

  walk(rootDir);
  return files;
}

// ─────────────────────────────────────────────────────────────
// CHUNKERS
// ─────────────────────────────────────────────────────────────

/**
 * Chunk JavaScript/TypeScript source by function, class, and method.
 * Uses regex to find definitions, then brace-counting to find the body end.
 * Falls back to sliding window for files where no definitions matched.
 *
 * KNOWN LIMITATION (documented, not a bug): misses functions defined inside
 * object literals, dynamically-named methods, and unusual arrow patterns.
 * Fallback window catches whatever regex misses.
 */
function chunkJavaScript(text, filePath) {
  const chunks = [];
  const lines = text.split('\n');

  // Patterns that indicate the start of a function/method definition.
  // NOTE: NO class pattern — class containers would consume the entire class body.
  // Methods inside classes are picked up individually by the method pattern.
  // Each pattern captures the name in a known group for metadata.
  const patterns = [
    // function name(...)  /  async function name(...)
    { re: /^(\s*)(?:async\s+)?function\s+(\w+)\s*\(/, kind: 'function', nameGroup: 2 },
    // const name = (...) =>  /  const name = async (...) =>
    { re: /^(\s*)(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/, kind: 'function', nameGroup: 2 },
    // const name = function(...)
    { re: /^(\s*)(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function\s*\(/, kind: 'function', nameGroup: 2 },
    // module.exports.name = function(...) / exports.name = function(...)
    { re: /^(\s*)(?:module\.)?exports\.(\w+)\s*=\s*(?:async\s*)?function\s*\(/, kind: 'function', nameGroup: 2 },
    // class methods:  name(...) {   or   async name(...) {
    // Loose; filtered with KEYWORD_BLACKLIST below.
    { re: /^(\s+)(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/, kind: 'method', nameGroup: 2 },
    // static methods
    { re: /^(\s+)static\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/, kind: 'method', nameGroup: 2 },
  ];

  // Reserved words that look like methods to the loose regex but aren't
  const KEYWORD_BLACKLIST = new Set([
    'if', 'else', 'for', 'while', 'switch', 'catch', 'try', 'do',
    'return', 'function', 'class', 'const', 'let', 'var', 'new',
    'typeof', 'instanceof', 'throw', 'await', 'yield',
  ]);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    let matched = null;
    for (const { re, kind, nameGroup } of patterns) {
      const m = line.match(re);
      if (!m) continue;

      const name = m[nameGroup];
      if (!name || KEYWORD_BLACKLIST.has(name)) continue;

      matched = { kind, name, startLine: i + 1 };
      break;
    }

    if (!matched) {
      i++;
      continue;
    }

    // Find the matching brace to determine the end line
    const endLine = findMatchingBrace(lines, i);
    if (endLine === -1) {
      i++;
      continue;
    }

    const chunkText = lines.slice(i, endLine + 1).join('\n');

    // Skip tiny chunks (less than 2 lines of body)
    if (chunkText.split('\n').length < 3) {
      i = endLine + 1;
      continue;
    }

    // Guard against chunks larger than our max
    if (chunkText.length > config.MAX_CHUNK_CHARS) {
      // Split this oversized chunk into sliding windows
      const windows = slidingWindow(chunkText, config.CHUNK_WINDOW_SIZE, config.CHUNK_WINDOW_OVERLAP);
      windows.forEach((winText, idx) => {
        chunks.push({
          kind: matched.kind,
          name: `${matched.name}#part${idx + 1}`,
          start_line: matched.startLine,
          end_line: endLine + 1,
          text: winText,
        });
      });
    } else {
      chunks.push({
        kind: matched.kind,
        name: matched.name,
        start_line: matched.startLine,
        end_line: endLine + 1,
        text: chunkText,
      });
    }

    i = endLine + 1;
  }

  // Fallback: if no matched chunks, use sliding window on the whole file
  if (chunks.length === 0) {
    const windows = slidingWindow(text, config.CHUNK_WINDOW_SIZE, config.CHUNK_WINDOW_OVERLAP);
    windows.forEach((winText, idx) => {
      // Estimate line range for the window
      const startChar = idx * (config.CHUNK_WINDOW_SIZE - config.CHUNK_WINDOW_OVERLAP);
      const charsBeforeStart = text.slice(0, startChar);
      const startLine = charsBeforeStart.split('\n').length;
      const endLine = startLine + winText.split('\n').length - 1;
      chunks.push({
        kind: 'window',
        name: `window_${idx + 1}`,
        start_line: startLine,
        end_line: endLine,
        text: winText,
      });
    });
  }

  return chunks;
}

/**
 * Find the line index of the closing brace that matches the function body's
 * opening brace, starting from the given line. Returns -1 if not found.
 *
 * IMPORTANT: skips the parameter list on the first line so that empty default
 * parameters like `constructor(config = {})` don't trip the brace counter.
 * The body's opening brace is the FIRST `{` that comes after the closing `)`
 * of the parameter list on the start line. Counting begins from that brace.
 */
function findMatchingBrace(lines, startLineIndex) {
  let depth = 0;
  let foundOpen = false;
  let inString = false;
  let stringChar = null;
  let inComment = false;

  // Find the body-opening brace position on the start line.
  // It's the first `{` that comes after the closing `)` of the parameter list.
  const startLine = lines[startLineIndex];
  let startCol = 0;
  const closeParenIdx = startLine.lastIndexOf(')');
  if (closeParenIdx !== -1) {
    const braceIdx = startLine.indexOf('{', closeParenIdx);
    if (braceIdx !== -1) {
      startCol = braceIdx;
    }
  }

  for (let i = startLineIndex; i < lines.length; i++) {
    const line = lines[i];
    // First line starts at the body brace; subsequent lines start at column 0.
    const colStart = (i === startLineIndex) ? startCol : 0;

    for (let j = colStart; j < line.length; j++) {
      const ch = line[j];
      const next = line[j + 1];

      // Very light-touch string/comment handling — not a full JS parser
      if (inComment) {
        if (ch === '*' && next === '/') {
          inComment = false;
          j++;
        }
        continue;
      }
      if (inString) {
        if (ch === '\\') { j++; continue; }
        if (ch === stringChar) { inString = false; stringChar = null; }
        continue;
      }
      if (ch === '/' && next === '/') break;        // line comment — skip rest of line
      if (ch === '/' && next === '*') { inComment = true; j++; continue; }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '{') {
        depth++;
        foundOpen = true;
      } else if (ch === '}') {
        depth--;
        if (foundOpen && depth === 0) {
          return i;
        }
      }
    }
  }
  return -1;
}

/**
 * Chunk a Markdown file by ## and ### headers.
 * Each section (header + body until next header of same-or-higher level) = one chunk.
 */
function chunkMarkdown(text, filePath) {
  const chunks = [];
  const lines = text.split('\n');

  let currentHeader = null;
  let currentStartLine = 1;
  let currentBody = [];

  const flush = () => {
    if (currentBody.length === 0) return;
    const body = currentBody.join('\n');
    if (body.trim().length < 20) return;  // skip trivially short sections

    // Oversized sections get split into sliding windows
    if (body.length > config.MAX_CHUNK_CHARS) {
      const windows = slidingWindow(body, config.CHUNK_WINDOW_SIZE, config.CHUNK_WINDOW_OVERLAP);
      windows.forEach((winText, idx) => {
        chunks.push({
          kind: 'doc_section',
          name: `${currentHeader || 'root'}#part${idx + 1}`,
          start_line: currentStartLine,
          end_line: currentStartLine + currentBody.length - 1,
          text: winText,
        });
      });
    } else {
      chunks.push({
        kind: 'doc_section',
        name: currentHeader || 'root',
        start_line: currentStartLine,
        end_line: currentStartLine + currentBody.length - 1,
        text: body,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match H1-H6 headers
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      flush();
      currentHeader = headerMatch[2].trim();
      currentStartLine = i + 1;
      currentBody = [line];
    } else {
      currentBody.push(line);
    }
  }
  flush();

  // Fallback: if no headers at all, sliding window the whole file
  if (chunks.length === 0) {
    const windows = slidingWindow(text, config.CHUNK_WINDOW_SIZE, config.CHUNK_WINDOW_OVERLAP);
    windows.forEach((winText, idx) => {
      const charsBeforeStart = idx * (config.CHUNK_WINDOW_SIZE - config.CHUNK_WINDOW_OVERLAP);
      const startLine = text.slice(0, charsBeforeStart).split('\n').length;
      const endLine = startLine + winText.split('\n').length - 1;
      chunks.push({
        kind: 'doc_section',
        name: `window_${idx + 1}`,
        start_line: startLine,
        end_line: endLine,
        text: winText,
      });
    });
  }

  return chunks;
}

/**
 * Chunk a JSONL file. Each non-empty line is parsed as a JSON object
 * and becomes one chunk. The chunk text is a human-readable rendering
 * (header line + pretty-printed JSON body) so embedding captures the
 * semantic meaning and Mercury can read the content naturally via tools.
 *
 * Designed for structured records like fixes.jsonl where each line is
 * one bug-fix entry with fields like id, symptom, root_cause, lesson.
 *
 * Invalid lines (parse errors) are skipped with a warning, not a crash.
 */
function chunkJsonl(text, filePath) {
  const chunks = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch (err) {
      console.warn(`[chunkJsonl] ${filePath}:${i + 1} parse error: ${err.message.slice(0, 80)}`);
      continue;
    }

    // Build a human-readable text representation
    const headerParts = [];
    if (record.id) headerParts.push(`ID: ${record.id}`);
    if (record.date) headerParts.push(`Date: ${record.date}`);
    if (record.severity) headerParts.push(`Severity: ${record.severity}`);
    if (Array.isArray(record.tags) && record.tags.length > 0) {
      headerParts.push(`Tags: ${record.tags.join(', ')}`);
    }

    const header = headerParts.join(' | ');
    const body = JSON.stringify(record, null, 2);
    const chunkText = header ? `${header}\n\n${body}` : body;

    // Guard oversized records
    if (chunkText.length > config.MAX_CHUNK_CHARS) {
      const windows = slidingWindow(chunkText, config.CHUNK_WINDOW_SIZE, config.CHUNK_WINDOW_OVERLAP);
      windows.forEach((winText, idx) => {
        chunks.push({
          kind: 'jsonl_record',
          name: `${record.id || `line_${i + 1}`}#part${idx + 1}`,
          start_line: i + 1,
          end_line: i + 1,
          text: winText,
        });
      });
    } else {
      chunks.push({
        kind: 'jsonl_record',
        name: record.id || `line_${i + 1}`,
        start_line: i + 1,
        end_line: i + 1,
        text: chunkText,
      });
    }
  }

  return chunks;
}

/**
 * Sliding window chunker for files without a structural chunker.
 */
function slidingWindow(text, windowSize, overlap) {
  const chunks = [];
  const step = windowSize - overlap;
  if (step <= 0) throw new Error('overlap must be less than windowSize');

  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + windowSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
  }
  return chunks;
}

// ─────────────────────────────────────────────────────────────
// EMBEDDER (provider, endpoint, model, and dimensions are owned by mercury.config.json)
// ─────────────────────────────────────────────────────────────

/**
 * Call the configured embeddings endpoint with a BATCH of strings.
 * Returns an array of embedding vectors in the same order as the input.
 */
function embedBatch(texts) {
  if (config.EMBED_PROVIDER === 'ollama') {
    return embedBatchOllama(texts);
  }
  return embedBatchOpenAICompatible(texts);
}

function assertEmbeddingDimensions(embeddings, expectedCount) {
  if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
    throw new Error(`Embed response count mismatch: expected ${expectedCount}, got ${Array.isArray(embeddings) ? embeddings.length : 'non-array'}`);
  }
  embeddings.forEach((embedding, idx) => {
    if (!Array.isArray(embedding) || embedding.length !== config.EMBED_DIMENSIONS) {
      throw new Error(`Embedding ${idx} length mismatch: expected ${config.EMBED_DIMENSIONS}, got ${Array.isArray(embedding) ? embedding.length : 'non-array'}`);
    }
  });
}

function embedBatchOllama(texts) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(texts) || texts.length === 0) {
      return reject(new Error('embedBatch requires a non-empty array of strings'));
    }

    const url = new URL(config.EMBED_ENDPOINT);
    const payload = JSON.stringify({
      model: config.EMBED_MODEL,
      input: texts,
    });

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
      },
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Ollama embed endpoint returned ${res.statusCode}: ${data.slice(0, 500)}`));
        }
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed.embeddings)) {
            if (parsed.embeddings.length !== texts.length) {
              return reject(new Error(`Ollama embed response count mismatch: expected ${texts.length}, got ${parsed.embeddings.length}`));
            }
            return resolve(parsed.embeddings);
          }
          if (Array.isArray(parsed.embedding) && texts.length === 1) {
            return resolve([parsed.embedding]);
          }
          reject(new Error(`Unrecognized Ollama embed response shape: ${data.slice(0, 300)}`));
        } catch (err) {
          reject(new Error(`Failed to parse Ollama embed response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function embedBatchOpenAICompatible(texts) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(texts) || texts.length === 0) {
      return reject(new Error('embedBatch requires a non-empty array of strings'));
    }

    const url = new URL(config.EMBED_ENDPOINT);
    const payload = JSON.stringify({
      model: config.EMBED_MODEL,
      input: texts,
    });

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
      },
    };

    if (config.EMBED_API_KEY) {
      reqOptions.headers['Authorization'] = `Bearer ${config.EMBED_API_KEY}`;
    }

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 429) {
          return reject(new Error(`Rate limited (429): ${data.slice(0, 300)}`));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Embed endpoint returned ${res.statusCode}: ${data.slice(0, 500)}`));
        }
        try {
          const parsed = JSON.parse(data);
          // OpenAI-compatible response: { data: [{ embedding: [...], index: 0 }, ...] }
          if (parsed.data && Array.isArray(parsed.data)) {
            // Sort by index to guarantee order matches input
            const sorted = [...parsed.data].sort((a, b) => (a.index || 0) - (b.index || 0));
            const embeddings = sorted.map((d) => d.embedding);
            if (embeddings.length !== texts.length) {
              return reject(new Error(`Embed response count mismatch: expected ${texts.length}, got ${embeddings.length}`));
            }
            return resolve(embeddings);
          }
          reject(new Error(`Unrecognized embed response shape: ${data.slice(0, 300)}`));
        } catch (err) {
          reject(new Error(`Failed to parse embed response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Single-string convenience wrapper. Used by searcher.js for query embedding
 * (one string at a time at query time). Internally calls embedBatch with a
 * 1-element array.
 */
async function embedText(text) {
  const [embedding] = await embedBatch([text]);
  return embedding;
}

/**
 * Estimate token count for a string. Rough heuristic: ~4 chars per token.
 * Used to pack batches without exceeding the per-request token limit.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Pack chunks into batches that fit within the per-request token budget
 * AND a maximum chunk count per batch. Returns an array of batches, each
 * a list of chunk indices into the source array.
 */
function packBatches(chunks, maxTokensPerBatch, maxChunksPerBatch) {
  const batches = [];
  let current = [];
  let currentTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkTokens = estimateTokens(chunks[i].text);
    // If adding this chunk would exceed limits, flush the current batch
    if (current.length > 0 &&
        (currentTokens + chunkTokens > maxTokensPerBatch ||
         current.length >= maxChunksPerBatch)) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(i);
    currentTokens += chunkTokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ─────────────────────────────────────────────────────────────
// FILE PROCESSING
// ─────────────────────────────────────────────────────────────

async function processFile(fullPath, repoRoot) {
  const relPath = path.relative(repoRoot, fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  let text;
  try {
    text = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    console.warn(`[indexer] Cannot read ${relPath}: ${err.message}`);
    return [];
  }

  if (text.trim().length === 0) return [];

  let rawChunks;
  if (ext === '.md') {
    rawChunks = chunkMarkdown(text, relPath);
  } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    rawChunks = chunkJavaScript(text, relPath);
  } else if (ext === '.jsonl') {
    rawChunks = chunkJsonl(text, relPath);
  } else if (ext === '.json') {
    // JSON: treat as a single chunk if small enough
    if (text.length <= config.MAX_CHUNK_CHARS) {
      rawChunks = [{
        kind: 'json',
        name: path.basename(fullPath),
        start_line: 1,
        end_line: text.split('\n').length,
        text,
      }];
    } else {
      return [];  // oversized JSON files (data files) skipped
    }
  } else {
    return [];
  }

  // Compute file content hash for potential incremental reindex later
  const fileSha = crypto.createHash('sha1').update(text).digest('hex');
  const contentType = resolveContentType(relPath);

  // Decorate chunks with file metadata
  return rawChunks.map((ch) => ({
    file_path: relPath,
    kind: ch.kind,
    name: ch.name,
    content_type: contentType,
    start_line: ch.start_line,
    end_line: ch.end_line,
    text: ch.text,
    file_sha: fileSha,
    indexed_at: new Date(),
    // embedding added in the next step
  }));
}

// ─────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────

function progressBar(current, total, width = 20) {
  const pct = total === 0 ? 1 : current / total;
  const filled = Math.round(pct * width);
  const bar = '#'.repeat(filled) + '-'.repeat(width - filled);
  return `[${bar}] ${current}/${total} (${(pct * 100).toFixed(1)}%)`;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('[MERCURY-BRIDGE] Indexer starting...');
  console.log(`[MERCURY-BRIDGE] Repo:    ${config.REPO_ROOT}`);
  console.log(`[MERCURY-BRIDGE] Mongo:   ${config.MONGO_URI} → ${config.MONGO_DB_NAME}.${config.MONGO_COLLECTION_CHUNKS}`);
  console.log(`[MERCURY-BRIDGE] Ollama:  ${config.OLLAMA_URL} (${config.OLLAMA_EMBED_MODEL})`);
  console.log('');

  const store = new MongoStore();
  await store.connect();

  // Clear previous index
  console.log('[MERCURY-BRIDGE] Clearing previous index...');
  const cleared = await store.clearAll();
  console.log(`[MERCURY-BRIDGE] Cleared ${cleared.deleted} old chunks`);
  console.log('');

  // Walk repo
  console.log('[MERCURY-BRIDGE] Walking repo...');
  const files = walkRepo(config.REPO_ROOT);
  console.log(`[MERCURY-BRIDGE] Found ${files.length} files to process`);
  console.log('');

  // Process files → chunks
  console.log('[MERCURY-BRIDGE] Chunking files...');
  const allChunks = [];
  for (const file of files) {
    const fileChunks = await processFile(file, config.REPO_ROOT);
    allChunks.push(...fileChunks);
  }
  console.log(`[MERCURY-BRIDGE] Produced ${allChunks.length} chunks across ${files.length} files`);
  console.log('');

  // Embed chunks in BATCHES (rate-limit safe)
  console.log('[MERCURY-BRIDGE] Embedding chunks via embed endpoint...');
  console.log(`[MERCURY-BRIDGE] Endpoint: ${config.EMBED_ENDPOINT}`);
  console.log(`[MERCURY-BRIDGE] Model:    ${config.EMBED_MODEL}`);
  console.log(`[MERCURY-BRIDGE] Batching: max ${config.EMBED_BATCH_MAX_CHUNKS} chunks or ${config.EMBED_BATCH_MAX_TOKENS} tokens per request`);
  console.log(`[MERCURY-BRIDGE] Batch failure mode: ${config.EMBED_FAIL_ON_BATCH_ERROR ? 'fatal' : 'skip failed chunks'}`);

  // Pack all chunks into batches that respect both per-request token limit
  // and per-request chunk count limit. Then send them with rate-limit pacing.
  const batches = packBatches(
    allChunks,
    config.EMBED_BATCH_MAX_TOKENS,
    config.EMBED_BATCH_MAX_CHUNKS
  );
  console.log(`[MERCURY-BRIDGE] Packed ${allChunks.length} chunks into ${batches.length} batches`);

  // Pacing: minimum interval between requests to stay under requests/min limit
  const minIntervalMs = config.EMBED_MIN_INTERVAL_MS;
  let lastRequestAt = 0;

  let embedErrors = 0;
  let batchesSent = 0;

  for (const batchIndices of batches) {
    // Rate-limit pacing
    const now = Date.now();
    const sinceLast = now - lastRequestAt;
    if (sinceLast < minIntervalMs) {
      await new Promise((r) => setTimeout(r, minIntervalMs - sinceLast));
    }

    const batchTexts = batchIndices.map((i) => allChunks[i].text);

    try {
      const embeddings = await embedBatch(batchTexts);
      assertEmbeddingDimensions(embeddings, batchTexts.length);
      // Assign embeddings back to the chunks in order
      batchIndices.forEach((chunkIdx, j) => {
        allChunks[chunkIdx].embedding = embeddings[j];
      allChunks[chunkIdx].embed_index_id = config.EMBED_INDEX_ID;
      allChunks[chunkIdx].embed_provider = config.EMBED_PROVIDER;
      allChunks[chunkIdx].embed_endpoint_id = config.EMBED_ENDPOINT_ID;
      allChunks[chunkIdx].embed_model = config.EMBED_MODEL;
      allChunks[chunkIdx].embed_dimensions = config.EMBED_DIMENSIONS;
      });
    } catch (err) {
      embedErrors += batchIndices.length;
      const failureMessage = `Batch ${batchesSent + 1}/${batches.length} failed: ${err.message}`;
      console.warn(`\n[MERCURY-BRIDGE] ${failureMessage}`);
      if (config.EMBED_FAIL_ON_BATCH_ERROR) {
        await store.disconnect();
        throw new Error(`${failureMessage}; refusing to write partial index`);
      }
      // Mark these chunks as un-embeddable; they will be skipped during storage
      batchIndices.forEach((chunkIdx) => {
        allChunks[chunkIdx].embedding = null;
      });

      // If we hit a rate limit, back off harder
      if (err.message.includes('429') || err.message.includes('Rate limited')) {
        console.warn('[MERCURY-BRIDGE] Rate limited — backing off 60s');
        await new Promise((r) => setTimeout(r, 60000));
      }
    }

    lastRequestAt = Date.now();
    batchesSent++;

    // Progress
    const chunksProcessed = batches
      .slice(0, batchesSent)
      .reduce((sum, b) => sum + b.length, 0);
    process.stdout.write(`\r[MERCURY-BRIDGE] ${progressBar(batchesSent, batches.length)} (${chunksProcessed} chunks)`);
  }
  console.log('\n');

  const embedded = allChunks.filter((c) => c.embedding !== null);
  if (embedded.length === 0) {
    console.error(`[MERCURY-BRIDGE] FATAL: no chunks successfully embedded. Check embed provider=${config.EMBED_PROVIDER} model=${config.EMBED_MODEL}.`);
    await store.disconnect();
    process.exit(1);
  }

  if (embedErrors > 0) {
    if (config.EMBED_FAIL_ON_BATCH_ERROR) {
      await store.disconnect();
      throw new Error(`${embedErrors} chunks failed to embed; refusing to write partial index`);
    }
    console.warn(`[MERCURY-BRIDGE] WARNING: ${embedErrors} chunks failed to embed and will be skipped`);
  }

  // Store
  console.log('[MERCURY-BRIDGE] Storing chunks in MongoDB...');
  const inserted = await store.bulkInsert(embedded);
  console.log(`[MERCURY-BRIDGE] Inserted ${inserted.inserted} chunks`);

  // Record run metadata
  const elapsedMs = Date.now() - startTime;
  await store.recordIndexRun({
    files_walked: files.length,
    chunks_produced: allChunks.length,
    chunks_embedded: embedded.length,
    embed_errors: embedErrors,
    embed_index_id: config.EMBED_INDEX_ID,
    embed_provider: config.EMBED_PROVIDER,
    embed_endpoint_id: config.EMBED_ENDPOINT_ID,
    embed_model: config.EMBED_MODEL,
    embed_dimensions: config.EMBED_DIMENSIONS,
    elapsed_ms: elapsedMs,
  });

  await store.disconnect();

  console.log('');
  console.log(`[MERCURY-BRIDGE] Done in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`[MERCURY-BRIDGE] Files: ${files.length} | Chunks: ${embedded.length}${embedErrors ? ` (${embedErrors} errors)` : ''}`);
}

// ─────────────────────────────────────────────────────────────
// ENTRY
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch((err) => {
    console.error('[MERCURY-BRIDGE] FATAL:', err);
    process.exit(1);
  });
}

module.exports = { walkRepo, chunkJavaScript, chunkMarkdown, chunkJsonl, embedText, processFile, assertEmbeddingDimensions };
