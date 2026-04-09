/**
 * Mercury Bridge — Tool Adapter
 * ══════════════════════════════════════════════════════════════
 * Exposes a canonical tool API to the ReAct loop while adapting to
 * whatever method names the underlying ReadOnlyToolbox actually uses.
 *
 * Canonical tools exposed to Mercury via the ReAct loop:
 *   grep       — literal string search across the repo (ground truth)
 *   open_file  — read a specific line range from any file in the repo
 *   get_chunk  — retrieve a specific chunk by MongoDB _id (fast hydrate)
 *   list_files — list files in a directory
 *
 * Why an adapter: ReadOnlyToolbox may have different method names in
 * different versions (searchRepo vs repo_search, etc.). This adapter
 * is the ONLY place those names are referenced, so the ReAct loop
 * stays stable even if the underlying toolbox evolves.
 *
 * SAFETY: All paths are bounds-checked to the repo root. No writes.
 * No arbitrary shell execution. The adapter is a strict subset of
 * what ReadOnlyToolbox already considered safe.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('./config');

// ─── Ripgrep availability check ──────────────────────────────
// Warn loudly if rg is not installed. Without ripgrep, the grep tool
// falls back to a JS implementation with broken subdirectory glob matching
// that silently returns 0 results for files in nested paths. This caused
// an entire debugging session on 2026-04-08/09 before the root cause was
// identified. Scream early, don't fail silently.
const _rgCheck = spawnSync('which', ['rg'], { encoding: 'utf8' });
if (_rgCheck.status !== 0) {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('  WARNING: ripgrep (rg) not found on PATH');
  console.error('  mercury-bridge grep tool will use SLOW JS FALLBACK');
  console.error('  with BROKEN subdirectory glob matching!');
  console.error('  Install: apt install ripgrep (Linux) or brew install ripgrep (Mac)');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('');
}

// ─────────────────────────────────────────────────────────────
// JS GREP FALLBACK
// ─────────────────────────────────────────────────────────────
// Used when ripgrep isn't installed. Recursive walk + substring match.
// Respects the same skip dirs as the indexer (node_modules, .git, etc).
// Slower than ripgrep but zero-dependency and works everywhere.

function jsGrepFallback(query, limit, filePattern, repoRoot) {
  const matches = [];
  const SKIP_DIRS = config.SKIP_DIRS || new Set(['node_modules', '.git', 'data', 'logs', 'dist', 'build']);
  const TEXT_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.md', '.json', '.yml', '.yaml', '.sh', '.html', '.css']);

  function globMatch(filename, pattern) {
    if (!pattern) return true;
    // Very basic glob: *.js, core/**/*.js
    // Convert to regex
    const regex = new RegExp(
      '^' + pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '§DOUBLESTAR§')
        .replace(/\*/g, '[^/]*')
        .replace(/§DOUBLESTAR§/g, '.*')
        .replace(/\?/g, '.') + '$'
    );
    return regex.test(filename);
  }

  function walk(dir) {
    if (matches.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= limit) return;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTS.has(ext)) continue;

      const rel = path.relative(repoRoot, full);
      if (filePattern && !globMatch(rel, filePattern)) continue;

      let content;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      // Skip huge files
      if (content.length > 1024 * 1024) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= limit) break;
        if (lines[i].includes(query)) {
          matches.push({
            file: rel,
            line: i + 1,
            text: lines[i].trim().slice(0, 300),
          });
        }
      }
    }
  }

  walk(repoRoot);
  return {
    source: 'js_fallback',
    matches,
    total: matches.length,
    truncated: matches.length >= limit,
  };
}

/**
 * Create a tool adapter bound to a repo root and optionally a MongoStore
 * for chunk hydration. Returns an object with canonical tool methods.
 *
 * @param {Object} opts
 * @param {string} opts.repoRoot — absolute path to repo root
 * @param {Object} [opts.mongoStore] — optional, for get_chunk support
 * @param {Object} [opts.readOnlyToolbox] — optional, if caller wants to
 *   delegate to an existing ReadOnlyToolbox instance. If not provided,
 *   the adapter implements the tools directly via fs + spawnSync.
 */
function createToolAdapter(opts = {}) {
  const repoRoot = opts.repoRoot || config.REPO_ROOT;
  const mongoStore = opts.mongoStore || null;
  const toolbox = opts.readOnlyToolbox || null;

  // ─────────────────────────────────────────────────────────
  // Path safety — all file operations must stay within repo
  // ─────────────────────────────────────────────────────────
  function ensureWithinRepo(targetPath) {
    const abs = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(repoRoot, targetPath);
    const resolved = path.resolve(abs);
    const rootResolved = path.resolve(repoRoot);
    if (!resolved.startsWith(rootResolved)) {
      throw new Error(`Path outside repository boundary: ${targetPath}`);
    }
    return resolved;
  }

  // ─────────────────────────────────────────────────────────
  // grep — literal string search across the repo
  // ─────────────────────────────────────────────────────────
  // Strategy: try toolbox delegate first (so we inherit any toolbox
  // customizations like file-type filters), fall back to direct ripgrep.
  async function grep(args) {
    const query = args.query;
    const limit = Number.isInteger(args.limit) ? args.limit : 40;
    const filePattern = args.file_pattern || null; // e.g. "*.js" or "core/**/*.js"

    if (!query || typeof query !== 'string') {
      return { error: 'grep requires a non-empty query string' };
    }

    // Try to delegate to an existing ReadOnlyToolbox if provided, trying
    // both common method names.
    if (toolbox) {
      if (typeof toolbox.searchRepo === 'function') {
        try {
          const result = toolbox.searchRepo(query, { limit });
          return { source: 'readonly_toolbox.searchRepo', ...result };
        } catch (err) {
          // Fall through to direct impl
        }
      }
      if (typeof toolbox.repo_search === 'function') {
        try {
          const result = toolbox.repo_search(query, { limit });
          return { source: 'readonly_toolbox.repo_search', ...result };
        } catch (err) {
          // Fall through to direct impl
        }
      }
    }

    // Direct ripgrep implementation
    const rgArgs = [
      '--max-count', String(limit),
      '--line-number',
      '--no-heading',
      '--color', 'never',
      '--fixed-strings', // literal string match (no regex surprises)
    ];
    if (filePattern) {
      rgArgs.push('--glob', filePattern);
    }
    rgArgs.push('--', query, repoRoot);

    let result;
    try {
      result = spawnSync('rg', rgArgs, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    } catch (err) {
      // ripgrep spawn failure (e.g. rg not installed) → fall through to JS fallback
      return jsGrepFallback(query, limit, filePattern, repoRoot);
    }

    if (result.error) {
      // ENOENT means rg is not installed → fall through to JS fallback
      if (result.error.code === 'ENOENT') {
        return jsGrepFallback(query, limit, filePattern, repoRoot);
      }
      return { error: `ripgrep error: ${result.error.message}` };
    }

    // rg exits 1 when no matches found — not an error for us
    if (result.status !== 0 && result.status !== 1) {
      return {
        error: `ripgrep exited with status ${result.status}`,
        stderr: (result.stderr || '').slice(0, 500),
      };
    }

    const stdout = result.stdout || '';
    if (!stdout.trim()) {
      return { matches: [], total: 0, truncated: false };
    }

    // Parse matches: format is path:line:text
    const matches = [];
    const lines = stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      // ripgrep output can contain colons in the text portion, so we only
      // split on the first two
      const firstColon = line.indexOf(':');
      if (firstColon === -1) continue;
      const secondColon = line.indexOf(':', firstColon + 1);
      if (secondColon === -1) continue;

      const filePath = line.slice(0, firstColon);
      const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
      const text = line.slice(secondColon + 1).trim();

      // Make path relative to repo root for cleaner output
      const relPath = path.relative(repoRoot, filePath);

      matches.push({
        file: relPath,
        line: lineNum,
        text: text.slice(0, 300), // cap per-match text
      });
    }

    return {
      source: 'direct_ripgrep',
      matches: matches.slice(0, limit),
      total: matches.length,
      truncated: matches.length > limit,
    };
  }

  // ─────────────────────────────────────────────────────────
  // open_file — read a specific range of a file
  // ─────────────────────────────────────────────────────────
  async function open_file(args) {
    const filePath = args.path;
    const startLine = Math.max(1, parseInt(args.start_line || 1, 10));
    const endLine = parseInt(args.end_line || startLine + 50, 10);

    if (!filePath || typeof filePath !== 'string') {
      return { error: 'open_file requires a path string' };
    }
    if (endLine < startLine) {
      return { error: 'end_line must be >= start_line' };
    }
    if (endLine - startLine > 500) {
      return { error: 'range too large (max 500 lines per call)' };
    }

    let absPath;
    try {
      absPath = ensureWithinRepo(filePath);
    } catch (err) {
      return { error: err.message };
    }

    let text;
    try {
      text = fs.readFileSync(absPath, 'utf8');
    } catch (err) {
      return { error: `cannot read file: ${err.message}` };
    }

    const allLines = text.split('\n');
    const totalLines = allLines.length;
    const actualEnd = Math.min(endLine, totalLines);
    const slice = allLines.slice(startLine - 1, actualEnd);

    // Number the lines for Mercury's benefit
    const numbered = slice
      .map((line, idx) => `${String(startLine + idx).padStart(5, ' ')}\t${line}`)
      .join('\n');

    return {
      file: path.relative(repoRoot, absPath),
      start_line: startLine,
      end_line: actualEnd,
      total_lines: totalLines,
      text: numbered,
    };
  }

  // ─────────────────────────────────────────────────────────
  // get_chunk — fetch a specific chunk from MongoDB by id
  // ─────────────────────────────────────────────────────────
  async function get_chunk(args) {
    if (!mongoStore) {
      return { error: 'get_chunk requires a MongoStore instance (not provided to adapter)' };
    }
    const id = args.id || args._id;
    if (!id) {
      return { error: 'get_chunk requires an id' };
    }

    try {
      // Lazy-import ObjectId to avoid requiring mongodb at adapter load time
      const { ObjectId } = require('mongodb');
      let objectId;
      try {
        objectId = new ObjectId(id);
      } catch (err) {
        return { error: `invalid chunk id format: ${id}` };
      }

      const docs = await mongoStore.fetchByIds([objectId]);
      if (!docs || docs.length === 0) {
        return { error: `chunk not found: ${id}` };
      }
      const doc = docs[0];
      return {
        id: String(doc._id),
        file: doc.file_path,
        kind: doc.kind,
        name: doc.name,
        start_line: doc.start_line,
        end_line: doc.end_line,
        text: doc.text,
      };
    } catch (err) {
      return { error: `get_chunk failed: ${err.message}` };
    }
  }

  // ─────────────────────────────────────────────────────────
  // list_files — list files in a directory
  // ─────────────────────────────────────────────────────────
  async function list_files(args) {
    const dir = args.path || '.';
    const pattern = args.pattern || null;

    let absDir;
    try {
      absDir = ensureWithinRepo(dir);
    } catch (err) {
      return { error: err.message };
    }

    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      return { error: `cannot list directory: ${err.message}` };
    }

    const files = [];
    const dirs = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (pattern && !entry.name.includes(pattern)) continue;
      if (entry.isDirectory()) {
        dirs.push(entry.name + '/');
      } else if (entry.isFile()) {
        files.push(entry.name);
      }
    }

    return {
      dir: path.relative(repoRoot, absDir) || '.',
      directories: dirs.sort(),
      files: files.sort(),
      total: dirs.length + files.length,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Canonical tool registry
  // ─────────────────────────────────────────────────────────
  const tools = {
    grep: {
      description: 'Literal string search across the entire repo. Returns file, line, text matches. This is your ground-truth lookup — use it when you need to find every place a symbol, identifier, or phrase appears.',
      args_schema: {
        query: 'string (required) — literal text to search for',
        limit: 'integer (optional, default 40) — max matches to return',
        file_pattern: 'string (optional) — glob filter like "*.js" or "core/**/*.js"',
      },
      handler: grep,
    },
    open_file: {
      description: 'Read a specific line range from any file in the repo. Use after grep to see code context around a match.',
      args_schema: {
        path: 'string (required) — file path relative to repo root',
        start_line: 'integer (optional, default 1) — first line (1-indexed)',
        end_line: 'integer (optional, default start+50) — last line (max 500 line span)',
      },
      handler: open_file,
    },
    get_chunk: {
      description: 'Fetch a specific indexed chunk by MongoDB id. Use this to hydrate a chunk referenced in your starter context when you need the full text.',
      args_schema: {
        id: 'string (required) — MongoDB _id of the chunk',
      },
      handler: get_chunk,
    },
    list_files: {
      description: 'List files and directories at a path within the repo. Use to discover what files exist when you are not sure where something lives.',
      args_schema: {
        path: 'string (optional, default ".") — directory relative to repo root',
        pattern: 'string (optional) — filter to entries containing this substring',
      },
      handler: list_files,
    },
  };

  /**
   * Execute a tool call by name with args. Returns a result object that
   * is safe to serialize back to Mercury.
   */
  async function execute(toolName, toolArgs) {
    const tool = tools[toolName];
    if (!tool) {
      return {
        error: `unknown tool: ${toolName}. Available: ${Object.keys(tools).join(', ')}`,
      };
    }
    try {
      const result = await tool.handler(toolArgs || {});
      return result;
    } catch (err) {
      return { error: `tool ${toolName} threw: ${err.message}` };
    }
  }

  /**
   * Build the tool documentation block for the system prompt.
   * Mercury reads this to know what tools are available.
   */
  function buildToolDocs() {
    // Example-driven tool docs. Mercury-2 pattern-matches on filled-in
    // examples far more reliably than on abstract arg-schema descriptions.
    // Each tool gets ONE real example call and a one-line description.
    return `# Available Tools

## grep — search code with ripgrep

Example call:
\`\`\`tool_call
{"tool": "grep", "args": {"query": "exitSize", "file_pattern": "core/**/*.js"}}
\`\`\`

Use grep to find where a symbol, function, or string appears in the codebase.

## open_file — read a file or line range

Example call:
\`\`\`tool_call
{"tool": "open_file", "args": {"path": "core/MaxProfitManager.js", "start_line": 425, "end_line": 475}}
\`\`\`

Use open_file after grep to read the actual code at a specific location.

## get_chunk — hydrate a chunk by MongoDB id

Example call:
\`\`\`tool_call
{"tool": "get_chunk", "args": {"id": "65f2a8b1c3d4e5f6a7b8c9d0"}}
\`\`\`

Use get_chunk to read the full text of a starter-context chunk referenced by id.

## list_files — list files in a directory

Example call:
\`\`\`tool_call
{"tool": "list_files", "args": {"path": "core/exit"}}
\`\`\`

Use list_files to discover what files exist in a directory.`;
  }

  function buildToolSchema() {
    return [
      {
        type: "function",
        function: {
          name: "grep",
          description: "Literal string search across the entire repo using ripgrep. Returns file path, line number, and matching text. Use this as your ground-truth lookup to find where a symbol, function name, or phrase appears in the codebase.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The literal text to search for" },
              file_pattern: { type: "string", description: "Optional glob filter like '*.js' or 'core/**/*.js'" },
              limit: { type: "integer", description: "Maximum matches to return (default 40)" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "open_file",
          description: "Read a specific line range from a file in the repo. Use after grep to see the exact code around a match. Before citing any line in your final answer, open a narrow range (5-10 lines) around that line to confirm the claim is in the visible text.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path relative to repo root" },
              start_line: { type: "integer", description: "First line to read, 1-indexed (default 1)" },
              end_line: { type: "integer", description: "Last line to read, max 500 line span (default start_line+50)" }
            },
            required: ["path"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_chunk",
          description: "Fetch a specific indexed chunk by MongoDB id from the RAG index.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "MongoDB _id of the chunk" }
            },
            required: ["id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_files",
          description: "List files and directories at a path within the repo. Use this when you need to discover what files exist in a directory.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Directory path relative to repo root (default '.')" },
              pattern: { type: "string", description: "Optional filter — only return entries whose name contains this substring" }
            },
            required: []
          }
        }
      }
    ];
  }

  return { execute, buildToolDocs, buildToolSchema, tools };
}

module.exports = { createToolAdapter };
