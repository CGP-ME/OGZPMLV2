'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../trai_brain/mercury-bridge/config');
const { walkRepo } = require('../trai_brain/mercury-bridge/indexer');
const { routeQuery } = require('../trai_brain/mercury-bridge/query-router');
const { retrieveTopK } = require('../trai_brain/mercury-bridge/searcher');
const { createToolAdapter, buildSkipDirGlobArgs } = require('../trai_brain/mercury-bridge/tool-adapter');
const ReadOnlyToolbox = require('../trai_brain/read_only_tools');
const TRAICore = require('../core/trai_core');

const NON_CANONICAL_INDEX_DIRS = [
  'ledger',
  'cognition-history',
  'proposals',
  'manifests',
  'sessions',
  'replacements',
  'reports',
  'health-reports',
  'cold-traces',
  'audits',
  'backups',
  'quarantine',
  'review-artifacts',
];

function writeFixture(root, relPath, text = 'fixture') {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, text);
}

function toRelSet(root, files) {
  return new Set(files.map((file) => path.relative(root, file).replace(/\\/g, '/')));
}

describe('Mercury index scope hygiene', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-mercury-index-'));
  });

  afterEach(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test('skip configuration excludes non-canonical intake and history directories', () => {
    const mercuryIgnore = fs.readFileSync(config.MERCURY_IGNORE_FILE, 'utf8');

    for (const dir of NON_CANONICAL_INDEX_DIRS) {
      expect(mercuryIgnore).toContain(`${dir}/`);
      expect(config.SKIP_DIRS.has(dir)).toBe(true);
    }
  });

  test('mercury.ignore rejects ambiguous non-directory entries', () => {
    const badIgnore = path.join(tmpRoot, 'mercury.ignore');
    fs.writeFileSync(badIgnore, 'ledger\n');

    expect(() => config.loadMercuryIgnore(badIgnore))
      .toThrow(/directory entries must end with \//);
  });

  test('walkRepo indexes source and canonical specs, not stale intake/history artifacts', () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'module.exports = true;');
    writeFixture(tmpRoot, 'ogz-meta/BACKTEST-OPS.md', '# root operational doc');
    writeFixture(tmpRoot, 'ogz-meta/specs/current-contract.md', '# canonical spec');
    writeFixture(tmpRoot, 'ogz-meta/Alignment/README.md', '# current alignment');

    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', '# stale audit');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', '# old Mercury answer');
    writeFixture(tmpRoot, 'ogz-meta/sessions/session-old.md', '# old session');
    writeFixture(tmpRoot, 'ogz-meta/proposals/MISSION-1-PROPOSAL.md', '# proposal');
    writeFixture(tmpRoot, 'ogz-meta/todocontext47.md', '# stale top-level handoff');
    writeFixture(tmpRoot, 'ogz-meta/MISSION-177-PROPOSAL.md', '# stale mission');

    const indexed = toRelSet(tmpRoot, walkRepo(tmpRoot));

    expect(indexed.has('core/live-path.js')).toBe(true);
    expect(indexed.has('ogz-meta/BACKTEST-OPS.md')).toBe(true);
    expect(indexed.has('ogz-meta/specs/current-contract.md')).toBe(true);
    expect(indexed.has('ogz-meta/Alignment/README.md')).toBe(true);

    expect(indexed.has('ogz-meta/ledger/stale-audit.md')).toBe(false);
    expect(indexed.has('ogz-meta/cognition-history/mercury/old-response.md')).toBe(false);
    expect(indexed.has('ogz-meta/sessions/session-old.md')).toBe(false);
    expect(indexed.has('ogz-meta/proposals/MISSION-1-PROPOSAL.md')).toBe(false);
    expect(indexed.has('ogz-meta/todocontext47.md')).toBe(false);
    expect(indexed.has('ogz-meta/MISSION-177-PROPOSAL.md')).toBe(false);
  });

  test('grep tool excludes stale intake/history artifacts with ripgrep', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_SCOPE_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_SCOPE_MARKER');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', 'MERCURY_SCOPE_MARKER');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('grep', { query: 'MERCURY_SCOPE_MARKER', limit: 20 });
    const files = result.matches.map((match) => match.file);

    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.md');
    expect(files).not.toContain('ogz-meta/cognition-history/mercury/old-response.md');
  });

  test('grep file_pattern cannot re-include ignored intake/history artifacts', async () => {
    writeFixture(tmpRoot, 'core/live-path.md', 'MERCURY_PATTERN_BOUNDARY_MARKER');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_PATTERN_BOUNDARY_MARKER');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', 'MERCURY_PATTERN_BOUNDARY_MARKER');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('grep', {
      query: 'MERCURY_PATTERN_BOUNDARY_MARKER',
      file_pattern: '**/*.md',
      limit: 20,
    });
    const files = result.matches.map((match) => match.file);

    expect(files).toContain('core/live-path.md');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.md');
    expect(files).not.toContain('ogz-meta/cognition-history/mercury/old-response.md');
    expect(result.filtered_ignored).toBeGreaterThan(0);
  });

  test('break-my-fix review scope blocks tool access outside changed files', async () => {
    writeFixture(tmpRoot, 'core/changed.js', 'const marker = "MERCURY_REVIEW_SCOPE_MARKER";');
    writeFixture(tmpRoot, 'core/unrelated.js', 'const marker = "MERCURY_REVIEW_SCOPE_MARKER";');

    const adapter = createToolAdapter({
      repoRoot: tmpRoot,
      allowedFiles: ['core/changed.js'],
    });

    const allowedRead = await adapter.execute('open_file', { path: 'core/changed.js', start_line: 1, end_line: 1 });
    const blockedRead = await adapter.execute('open_file', { path: 'core/unrelated.js', start_line: 1, end_line: 1 });
    const grepResult = await adapter.execute('grep', { query: 'MERCURY_REVIEW_SCOPE_MARKER', limit: 20 });
    const rootList = await adapter.execute('list_files', { path: '.' });

    expect(allowedRead.file).toBe('core/changed.js');
    expect(blockedRead.error).toContain('blocked by break-my-fix review scope');
    expect(grepResult.matches.map((match) => match.file)).toEqual(['core/changed.js']);
    expect(rootList).toEqual(expect.objectContaining({
      directories: ['core/'],
      files: [],
      scoped: true,
      total: 1,
    }));
  });

  test.each([
    '[^\\x00-\\x7F]',
    '\\p{Extended_Pictographic}',
    '\\u{1F600}',
    '\\d+',
  ])('literal grep rejects regex-looking proof query %s', async (query) => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "ascii";');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('grep', { query, limit: 20 });

    expect(result.error).toContain('literal-only');
    expect(result.matches).toBeUndefined();
  });

  test('regex_grep supports regex proof queries with the shared skip policy', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "plain";\nconst symbol = "é";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'é');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', 'é');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('regex_grep', {
      query: '[^\\x00-\\x7F]',
      file_pattern: '**/*',
      limit: 20,
    });
    const files = result.matches.map((match) => match.file);

    expect(result.source).toBe('direct_ripgrep_regex');
    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.md');
    expect(files).not.toContain('ogz-meta/cognition-history/mercury/old-response.md');
    expect(result.filtered_ignored).toBeGreaterThan(0);
  });

  test('grep tool does not delegate around the shared skip policy', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_TOOLBOX_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_TOOLBOX_MARKER');
    const searchRepo = jest.fn(() => ({
      matches: [{ file: 'ogz-meta/ledger/stale-audit.md', line: 1, text: 'MERCURY_TOOLBOX_MARKER' }],
      total: 1,
      truncated: false,
    }));

    const adapter = createToolAdapter({ repoRoot: tmpRoot, readOnlyToolbox: { searchRepo } });
    const result = await adapter.execute('grep', { query: 'MERCURY_TOOLBOX_MARKER', limit: 20 });
    const files = result.matches.map((match) => match.file);

    expect(searchRepo).not.toHaveBeenCalled();
    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.md');
  });

  test('open_file tool rejects ignored intake/history paths', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_OPEN_FILE_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_OPEN_FILE_MARKER');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const liveResult = await adapter.execute('open_file', {
      path: 'core/live-path.js',
      start_line: 1,
      end_line: 1,
    });
    const ignoredResult = await adapter.execute('open_file', {
      path: 'ogz-meta/ledger/stale-audit.md',
      start_line: 1,
      end_line: 1,
    });

    expect(liveResult.text).toContain('MERCURY_OPEN_FILE_MARKER');
    expect(ignoredResult.error).toContain('open_file blocked by mercury.ignore');
  });

  test('list_files tool rejects and filters ignored intake/history paths', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_LIST_FILE_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_LIST_FILE_MARKER');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const rootResult = await adapter.execute('list_files', { path: 'ogz-meta' });
    const ignoredResult = await adapter.execute('list_files', { path: 'ogz-meta/ledger' });

    expect(rootResult.directories).not.toContain('ledger/');
    expect(ignoredResult.error).toContain('list_files blocked by mercury.ignore');
  });

  test('get_chunk tool rejects ignored indexed chunks and missing source metadata', async () => {
    const ignoredChunkId = '507f1f77bcf86cd799439011';
    const missingPathChunkId = '507f1f77bcf86cd799439012';
    const mongoStore = {
      fetchByIds: jest.fn(async ([objectId]) => {
        const id = String(objectId);
        if (id === ignoredChunkId) {
          return [{
            _id: objectId,
            file_path: 'ogz-meta/ledger/stale-audit.md',
            kind: 'file',
            name: 'stale-audit.md',
            start_line: 1,
            end_line: 1,
            text: 'MERCURY_CHUNK_MARKER',
          }];
        }
        if (id === missingPathChunkId) {
          return [{
            _id: objectId,
            kind: 'file',
            name: 'unknown.md',
            start_line: 1,
            end_line: 1,
            text: 'MERCURY_CHUNK_MARKER',
          }];
        }
        return [];
      }),
    };

    const adapter = createToolAdapter({ repoRoot: tmpRoot, mongoStore });
    const ignoredResult = await adapter.execute('get_chunk', { id: ignoredChunkId });
    const missingPathResult = await adapter.execute('get_chunk', { id: missingPathChunkId });

    expect(ignoredResult.error).toContain('get_chunk failed: get_chunk blocked by mercury.ignore');
    expect(missingPathResult.error).toContain('get_chunk missing file_path metadata');
  });

  test('git_show tool rejects ignored paths before git history reads', async () => {
    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const ignoredResult = await adapter.execute('git_show', {
      ref: 'HEAD',
      path: 'ogz-meta/ledger/stale-audit.md',
      start_line: 1,
      end_line: 1,
    });

    expect(ignoredResult.error).toContain('git_show blocked by mercury.ignore');
  });

  test('legacy ReadOnlyToolbox repo search excludes stale intake/history artifacts', () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_LEGACY_TOOL_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_LEGACY_TOOL_MARKER');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', 'MERCURY_LEGACY_TOOL_MARKER');

    const toolbox = new ReadOnlyToolbox({ repoRoot: tmpRoot });
    const result = toolbox.searchRepo('MERCURY_LEGACY_TOOL_MARKER', { limit: 20 });
    const results = result.results || [];

    expect(results.some((line) => line.includes('core/live-path.js'))).toBe(true);
    expect(results.some((line) => line.includes('ogz-meta/ledger/stale-audit.md'))).toBe(false);
    expect(results.some((line) => line.includes('ogz-meta/cognition-history/mercury/old-response.md'))).toBe(false);
  });

  test('legacy ReadOnlyToolbox repo search post-filters ignored search output', () => {
    jest.resetModules();
    jest.doMock('child_process', () => ({
      spawnSync: jest.fn((command) => {
        if (command === 'rg') {
          return {
            status: 0,
            stdout: [
              `${tmpRoot}/core/live-path.js:1:MERCURY_LEGACY_FILTER_MARKER`,
              `${tmpRoot}/ogz-meta/ledger/stale-audit.md:1:MERCURY_LEGACY_FILTER_MARKER`,
            ].join('\n'),
            stderr: '',
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      }),
    }));

    try {
      let IsolatedReadOnlyToolbox;
      jest.isolateModules(() => {
        IsolatedReadOnlyToolbox = require('../trai_brain/read_only_tools');
      });

      const toolbox = new IsolatedReadOnlyToolbox({ repoRoot: tmpRoot });
      const result = toolbox.searchRepo('MERCURY_LEGACY_FILTER_MARKER', { limit: 20 });
      const results = result.results || [];

      expect(results.some((line) => line.includes('core/live-path.js'))).toBe(true);
      expect(results.some((line) => line.includes('ogz-meta/ledger/stale-audit.md'))).toBe(false);
      expect(result.filteredIgnored).toBe(1);
    } finally {
      jest.dontMock('child_process');
      jest.resetModules();
    }
  });

  test('legacy ReadOnlyToolbox file open rejects ignored intake/history artifacts', () => {
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_LEGACY_OPEN_MARKER');

    const toolbox = new ReadOnlyToolbox({ repoRoot: tmpRoot });
    const result = toolbox.openFile('ogz-meta/ledger/stale-audit.md');

    expect(result.error).toContain('file_open blocked by mercury.ignore');
  });

  test('TRAICore repo_search delegates through the filtered read-only toolbox', () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_CORE_TOOL_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_CORE_TOOL_MARKER');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', 'MERCURY_CORE_TOOL_MARKER');

    const trai = Object.create(TRAICore.prototype);
    trai.readOnlyTools = new ReadOnlyToolbox({ repoRoot: tmpRoot });
    const result = trai.runReadOnlyTool('repo_search', { query: 'MERCURY_CORE_TOOL_MARKER', limit: 20 });
    const results = result.results || [];

    expect(results.some((line) => line.includes('core/live-path.js'))).toBe(true);
    expect(results.some((line) => line.includes('ogz-meta/ledger/stale-audit.md'))).toBe(false);
    expect(results.some((line) => line.includes('ogz-meta/cognition-history/mercury/old-response.md'))).toBe(false);
  });

  test('starter-context retrieval fails closed on ignored or sourceless active chunks', async () => {
    const ignoredStore = {
      fetchAllForScoring: jest.fn(async () => [{
        _id: 'ignored',
        file_path: 'ogz-meta/ledger/stale-audit.md',
        kind: 'file',
        name: 'stale-audit.md',
        content_type: 'general',
        start_line: 1,
        end_line: 1,
        embedding: [1, 0],
        text: 'MERCURY_RETRIEVAL_MARKER',
      }]),
      fetchByIds: jest.fn(async () => []),
    };
    const sourcelessStore = {
      fetchAllForScoring: jest.fn(async () => [{
        _id: 'sourceless',
        kind: 'file',
        name: 'unknown.md',
        content_type: 'general',
        start_line: 1,
        end_line: 1,
        embedding: [1, 0],
        text: 'MERCURY_RETRIEVAL_MARKER',
      }]),
      fetchByIds: jest.fn(async () => []),
    };

    await expect(retrieveTopK(ignoredStore, [1, 0], 1, 'break my fix'))
      .rejects.toThrow('Mercury retrieval scoring contains ignored path ogz-meta/ledger/stale-audit.md');
    await expect(retrieveTopK(sourcelessStore, [1, 0], 1, 'break my fix'))
      .rejects.toThrow('is missing file_path');
  });

  test('starter-context hydration fails closed when fetched chunk source is ignored', async () => {
    const store = {
      fetchAllForScoring: jest.fn(async () => [{
        _id: 'clean',
        file_path: 'core/live-path.js',
        kind: 'file',
        name: 'live-path.js',
        content_type: 'general',
        start_line: 1,
        end_line: 1,
        embedding: [1, 0],
        text: 'MERCURY_RETRIEVAL_MARKER',
      }]),
      fetchByIds: jest.fn(async () => [{
        _id: 'clean',
        file_path: 'ogz-meta/ledger/stale-audit.md',
        kind: 'file',
        name: 'stale-audit.md',
        content_type: 'general',
        start_line: 1,
        end_line: 1,
        embedding: [1, 0],
        text: 'MERCURY_RETRIEVAL_MARKER',
      }]),
    };

    await expect(retrieveTopK(store, [1, 0], 1, 'break my fix'))
      .rejects.toThrow('Mercury retrieval hydration contains ignored path ogz-meta/ledger/stale-audit.md');
  });

  test('grep fails closed when ripgrep spawn fails', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_FALLBACK_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_FALLBACK_MARKER');
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.md', 'MERCURY_FALLBACK_MARKER');

    const rgMissing = Object.assign(new Error('spawn rg ENOENT'), { code: 'ENOENT' });
    jest.resetModules();
    jest.doMock('child_process', () => ({
      spawnSync: jest.fn((command) => {
        if (command === 'rg') return { error: rgMissing };
        return { status: 0, stdout: '', stderr: '' };
      }),
    }));

    try {
      let isolatedCreateToolAdapter;
      jest.isolateModules(() => {
        ({ createToolAdapter: isolatedCreateToolAdapter } = require('../trai_brain/mercury-bridge/tool-adapter'));
      });

      const adapter = isolatedCreateToolAdapter({ repoRoot: tmpRoot });
      const result = await adapter.execute('grep', { query: 'MERCURY_FALLBACK_MARKER', limit: 20 });

      expect(result.error).toContain('ripgrep unavailable');
      expect(result.matches).toBeUndefined();
    } finally {
      jest.dontMock('child_process');
      jest.resetModules();
    }
  });

  test('ripgrep skip args are generated from the same non-canonical directory list', () => {
    const skipArgs = buildSkipDirGlobArgs();

    expect(skipArgs).toContain('!**/ledger/**');
    expect(skipArgs).toContain('!**/cognition-history/**');
    expect(skipArgs).toContain('!**/proposals/**');
  });

  test('historical Mercury routing does not boost ignored ledger fix history', () => {
    const route = routeQuery('have we seen this bug before');

    expect(route.queryType).toBe('historical');
    expect(route.boostType).toBeNull();
    expect(route.rationale).not.toContain('fix_history');
  });

  test('break-my-fix Mercury routing skips indexed starter context even when prompt mentions rules', () => {
    const route = routeQuery('Mercury, break my fix. Find any way this fails, skips a required rule, or creates a new failure mode.');

    expect(route.queryType).toBe('break_my_fix');
    expect(route.starterContextPolicy).toBe('skip');
    expect(route.boostType).toBeNull();
  });

  test('break-my-fix Mercury routing does not hijack mid-sentence phrase mentions', () => {
    const route = routeQuery('have we seen a bug where a change had to break my fix before');

    expect(route.queryType).toBe('historical');
    expect(route.starterContextPolicy).toBe('prefer');
  });
});
