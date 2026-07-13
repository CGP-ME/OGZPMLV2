'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const config = require('../trai_brain/mercury-bridge/config');
const {
  buildIndexRunMetadata,
  embedBatchWithRetry,
  isRetriableEmbedError,
  packBatches,
  walkRepo,
} = require('../trai_brain/mercury-bridge/indexer');
const { routeQuery } = require('../trai_brain/mercury-bridge/query-router');
const { retrieveTopK } = require('../trai_brain/mercury-bridge/searcher');
const { buildCurrentChangeBlastRadius, isSerenaSourcePath, selectCurrentChangeNames } = require('../trai_brain/mercury-bridge/ask');
const { createToolAdapter, buildSkipDirGlobArgs } = require('../trai_brain/mercury-bridge/tool-adapter');
const ReadOnlyToolbox = require('../trai_brain/read_only_tools');
const TRAICore = require('../core/trai_core');

const NON_CANONICAL_INDEX_DIRS = [
  'ledger',
  'cognition-history',
  'proposals',
  'inbox',
  'evidence',
  'codex-design',
  'cognition',
  'ast',
  'automation',
  'gates',
  'QuarantinedExpansionFiles',
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

function git(root, args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
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

  afterAll(() => {
    jest.unmock('child_process');
    jest.resetModules();
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

  test('mercury.ignore entries apply by exact directory name anywhere under repo root', () => {
    expect(config.isPathIgnoredByMercury('ogz-meta/ledger/stale.md')).toBe(true);
    expect(config.isPathIgnoredByMercury('src/ledger/stale.md')).toBe(true);
    expect(config.isPathIgnoredByMercury('src/ledger-data/live.md')).toBe(false);
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
    writeFixture(tmpRoot, 'ogz-meta/inbox/queued.md', '# inbox');
    writeFixture(tmpRoot, 'ogz-meta/evidence/proof.md', '# evidence');
    writeFixture(tmpRoot, 'ogz-meta/codex-design/plan.md', '# design');
    writeFixture(tmpRoot, 'ogz-meta/cognition/rules.md', '# cognition');
    writeFixture(tmpRoot, 'ogz-meta/ast/symbols.json', '{"ast":true}');
    writeFixture(tmpRoot, 'ogz-meta/automation/job.md', '# automation');
    writeFixture(tmpRoot, 'ogz-meta/gates/p0.js', 'module.exports = true;');
    writeFixture(tmpRoot, 'ogz-meta/QuarantinedExpansionFiles/file.md', '# quarantine');
    writeFixture(tmpRoot, 'ogz-meta/todocontext47.md', '# stale top-level handoff');
    writeFixture(tmpRoot, 'ogz-meta/MISSION-177-PROPOSAL.md', '# stale mission');

    const indexed = toRelSet(tmpRoot, walkRepo(tmpRoot));

    expect(indexed.has('core/live-path.js')).toBe(true);
    expect(indexed.has('ogz-meta/BACKTEST-OPS.md')).toBe(false);
    expect(indexed.has('ogz-meta/specs/current-contract.md')).toBe(true);
    expect(indexed.has('ogz-meta/Alignment/README.md')).toBe(true);

    expect(indexed.has('ogz-meta/ledger/stale-audit.md')).toBe(false);
    expect(indexed.has('ogz-meta/cognition-history/mercury/old-response.md')).toBe(false);
    expect(indexed.has('ogz-meta/sessions/session-old.md')).toBe(false);
    expect(indexed.has('ogz-meta/proposals/MISSION-1-PROPOSAL.md')).toBe(false);
    expect(indexed.has('ogz-meta/inbox/queued.md')).toBe(false);
    expect(indexed.has('ogz-meta/evidence/proof.md')).toBe(false);
    expect(indexed.has('ogz-meta/codex-design/plan.md')).toBe(false);
    expect(indexed.has('ogz-meta/cognition/rules.md')).toBe(false);
    expect(indexed.has('ogz-meta/ast/symbols.json')).toBe(false);
    expect(indexed.has('ogz-meta/automation/job.md')).toBe(false);
    expect(indexed.has('ogz-meta/gates/p0.js')).toBe(false);
    expect(indexed.has('ogz-meta/QuarantinedExpansionFiles/file.md')).toBe(false);
    expect(indexed.has('ogz-meta/todocontext47.md')).toBe(false);
    expect(indexed.has('ogz-meta/MISSION-177-PROPOSAL.md')).toBe(false);
  });

  test('index metadata stamps git freshness and explicit ogz-meta eligibility', () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'module.exports = true;\n');
    git(tmpRoot, ['add', 'core/live-path.js']);
    git(tmpRoot, ['-c', 'user.name=OGZ Test', '-c', 'user.email=ogz@example.test', 'commit', '-m', 'base commit']);

    const metadata = buildIndexRunMetadata({
      repoRoot: tmpRoot,
      files: [path.join(tmpRoot, 'core/live-path.js')],
      chunks: [{ embedding: [1, 2, 3] }],
      embedErrors: 0,
      elapsedMs: 10,
    });

    expect(metadata.index_scope.ogz_meta_eligible_dirs).toEqual([
      'ogz-meta/Alignment',
      'ogz-meta/specs',
    ]);
    expect(metadata.index_freshness.head_sha).toMatch(/^[a-f0-9]{40}$/);
    expect(metadata.index_freshness.dirty_tracked).toBe(false);
    expect(metadata.files_walked).toBe(1);
    expect(metadata.chunks_embedded).toBe(1);
  });

  test('packBatches respects token budget before configured chunk count', () => {
    const chunks = [
      { text: 'a'.repeat(1200) },
      { text: 'b'.repeat(1200) },
      { text: 'c'.repeat(1200) },
      { text: 'd'.repeat(1200) },
    ];

    const batches = packBatches(chunks, 600, 64);

    expect(batches).toEqual([[0, 1], [2, 3]]);
  });

  test('embedBatchWithRetry retries one 5xx failure against the same embed function', async () => {
    const embedFn = jest.fn()
      .mockRejectedValueOnce(new Error('Embed endpoint returned 503: upstream connect error'))
      .mockResolvedValueOnce([[1, 2, 3]]);
    const retrySpy = jest.fn();

    await expect(embedBatchWithRetry(['fixture'], { embedFn, onRetry: retrySpy }))
      .resolves.toEqual([[1, 2, 3]]);

    expect(isRetriableEmbedError(new Error('Embed endpoint returned 503'))).toBe(true);
    expect(embedFn).toHaveBeenCalledTimes(2);
    expect(embedFn).toHaveBeenNthCalledWith(1, ['fixture']);
    expect(embedFn).toHaveBeenNthCalledWith(2, ['fixture']);
    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  test('embedBatchWithRetry does not retry non-5xx provider failures', async () => {
    const embedFn = jest.fn().mockRejectedValue(new Error('Embed endpoint returned 401: unauthorized'));

    await expect(embedBatchWithRetry(['fixture'], { embedFn }))
      .rejects.toThrow('401');

    expect(embedFn).toHaveBeenCalledTimes(1);
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

  test('search alias uses grep semantics without bypassing ignored paths', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_SEARCH_ALIAS_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_SEARCH_ALIAS_MARKER');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('search', { query: 'MERCURY_SEARCH_ALIAS_MARKER', limit: 20 });
    const files = result.matches.map((match) => match.file);
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.md');
    expect(schemaNames).toContain('search');
  });

  test('broad search streams to the requested global cap instead of buffering all matches', async () => {
    for (let i = 0; i < 80; i += 1) {
      writeFixture(tmpRoot, `core/many-${i}.js`, `const marker${i} = "MERCURY_BROAD_STREAM_MARKER";`);
    }

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('search', {
      query: 'MERCURY_BROAD_STREAM_MARKER',
      file_pattern: '*',
      limit: 20,
    });

    expect(result.error).toBeUndefined();
    expect(result.matches).toHaveLength(20);
    expect(result.total).toBeGreaterThanOrEqual(20);
    expect(result.truncated).toBe(true);
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

  test('find_definition returns likely definitions with uncertainty metadata', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', [
      'function executeTrade(ctx) {',
      '  return ctx;',
      '}',
      'const executeTradeAlias = executeTrade;',
    ].join('\n'));
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.js', 'function executeTrade(ctx) { return ctx; }');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('find_definition', {
      symbol: 'executeTrade',
      limit: 20,
    });
    const files = result.matches.map((match) => match.file);
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(result.source).toBe('find_definition_regex');
    expect(result.precision).toBe('regex');
    expect(result.uncertainty).toMatch(/regex definition search/);
    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.js');
    expect(schemaNames).toContain('find_definition');
  });

  test('find_references returns likely usages without bypassing ignored paths', async () => {
    writeFixture(tmpRoot, 'core/live-path.js', [
      'function executeTrade(ctx) {',
      '  return ctx;',
      '}',
      'module.exports = { executeTrade };',
      'executeTrade({ ok: true });',
    ].join('\n'));
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/mercury/old-response.js', 'executeTrade({ stale: true });');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('find_references', {
      symbol: 'executeTrade',
      limit: 20,
    });
    const files = result.matches.map((match) => match.file);
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(result.source).toBe('find_references_regex');
    expect(result.precision).toBe('regex');
    expect(result.uncertainty).toMatch(/regex reference search/);
    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/cognition-history/mercury/old-response.js');
    expect(schemaNames).toContain('find_references');
  });

  test('rule_scan runs codified rules without bypassing ignored paths', async () => {
    writeFixture(tmpRoot, 'ogz-meta/cognition/mercury-rules/no-marker.json', JSON.stringify({
      name: 'no-marker',
      mode: 'fixed',
      pattern: 'MERCURY_RULE_MARKER',
      file_pattern: '**/*.js',
      prevents: 'fixture marker must not appear',
      source_incident: 'test',
      worked_example: 'fixture',
      prune_condition: 'fixture',
    }));
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_RULE_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.js', 'const marker = "MERCURY_RULE_MARKER";');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('rule_scan', {
      rule: 'no-marker',
      limit: 20,
    });
    const rule = result.results[0];
    const files = rule.matches.map((match) => match.file);
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(result.source).toBe('mercury_rule_scan');
    expect(result.rules_scanned).toBe(1);
    expect(rule.name).toBe('no-marker');
    expect(rule.prevents).toBe('fixture marker must not appear');
    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.js');
    expect(schemaNames).toContain('rule_scan');
  });

  test.each([
    [String.raw`[^\x00-\x7F]`, String.raw`const marker = "[^\x00-\x7F]";`],
    [String.raw`\p{Extended_Pictographic}`, String.raw`const marker = "\p{Extended_Pictographic}";`],
    [String.raw`\u{1F600}`, String.raw`const marker = "\u{1F600}";`],
    [String.raw`\d+`, String.raw`const marker = "\d+";`],
  ])('literal grep accepts regex-looking proof query %s as fixed text', async (query, fileText) => {
    writeFixture(tmpRoot, 'core/live-path.js', fileText);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('grep', { query, limit: 20 });

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('direct_ripgrep_fixed');
    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'core/live-path.js', line: 1 }),
    ]));
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

  test('explicit file tools can read vetted cognition evidence without re-including ledger intake', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const live = true;\n');
    git(tmpRoot, ['add', 'core/live-path.js']);
    git(tmpRoot, ['-c', 'user.name=OGZ Test', '-c', 'user.email=ogz@example.test', 'commit', '-m', 'base commit']);
    writeFixture(tmpRoot, 'ogz-meta/cognition-history/session-router-phase05/STATE-HOLDER-INVENTORY.json', '{"evidence":true}\n');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'stale\n');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const evidenceRead = await adapter.execute('open_file', {
      path: 'ogz-meta/cognition-history/session-router-phase05/STATE-HOLDER-INVENTORY.json',
      start_line: 1,
      end_line: 1,
    });
    const evidenceList = await adapter.execute('list_files', {
      path: 'ogz-meta/cognition-history/session-router-phase05',
    });
    const evidenceGitShow = await adapter.execute('git_show', {
      ref: 'HEAD',
      path: 'ogz-meta/cognition-history/session-router-phase05/STATE-HOLDER-INVENTORY.json',
    });
    const ledgerRead = await adapter.execute('open_file', {
      path: 'ogz-meta/ledger/stale-audit.md',
      start_line: 1,
      end_line: 1,
    });

    expect(evidenceRead.error).toBeUndefined();
    expect(evidenceRead.text).toContain('"evidence":true');
    expect(evidenceList.error).toBeUndefined();
    expect(evidenceList.files).toEqual(['STATE-HOLDER-INVENTORY.json']);
    expect(evidenceGitShow.error).toContain('git_show path not present at ref HEAD');
    expect(ledgerRead.error).toContain('open_file blocked by mercury.ignore');
  });

  test('git_diff exposes staged changes and filters ignored intake paths', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_DIFF_MARKER";\n');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale-audit.md', 'MERCURY_DIFF_MARKER\n');
    git(tmpRoot, ['add', 'core/live-path.js', 'ogz-meta/ledger/stale-audit.md']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('git_diff', { target: 'staged' });

    expect(result.files).toEqual(['core/live-path.js']);
    expect(result.diff).toContain('MERCURY_DIFF_MARKER');
    expect(result.diff).not.toContain('ogz-meta/ledger/stale-audit.md');

    const ignoredPathResult = await adapter.execute('git_diff', {
      target: 'staged',
      path: 'ogz-meta/ledger/stale-audit.md',
    });

    expect(ignoredPathResult.error).toContain('git_diff blocked by mercury.ignore');

    const ignoredDirResult = await adapter.execute('git_diff', {
      target: 'staged',
      path: 'ogz-meta/ledger',
    });

    expect(ignoredDirResult.error).toContain('git_diff blocked by mercury.ignore');
  });

  test('git_diff exposes the latest committed fix for post-commit Mercury review', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_LAST_COMMIT_MARKER";\n');
    git(tmpRoot, ['add', 'core/live-path.js']);
    git(tmpRoot, ['-c', 'user.name=OGZ Test', '-c', 'user.email=ogz@example.test', 'commit', '-m', 'test commit']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('git_diff', { target: 'last_commit' });

    expect(result.files).toEqual(['core/live-path.js']);
    expect(result.diff).toContain('MERCURY_LAST_COMMIT_MARKER');
  });

  test('git_diff current target prefers staged changes over last commit', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/committed.js', 'const marker = "MERCURY_COMMITTED_MARKER";\n');
    git(tmpRoot, ['add', 'core/committed.js']);
    git(tmpRoot, ['-c', 'user.name=OGZ Test', '-c', 'user.email=ogz@example.test', 'commit', '-m', 'base commit']);

    writeFixture(tmpRoot, 'core/current.js', 'const marker = "MERCURY_CURRENT_MARKER";\n');
    git(tmpRoot, ['add', 'core/current.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('git_diff', {});

    expect(result.requested_target).toBe('current');
    expect(result.target).toBe('staged');
    expect(result.files).toEqual(['core/current.js']);
    expect(result.diff).toContain('MERCURY_CURRENT_MARKER');
    expect(result.diff).not.toContain('MERCURY_COMMITTED_MARKER');
  });

  test('git_diff current path reads unstaged path changes when unrelated files are staged', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/staged.js', 'const marker = "BASE_STAGED";\n');
    writeFixture(tmpRoot, 'core/unstaged.js', 'const marker = "BASE_UNSTAGED";\n');
    git(tmpRoot, ['add', 'core/staged.js', 'core/unstaged.js']);
    git(tmpRoot, ['-c', 'user.name=OGZ Test', '-c', 'user.email=ogz@example.test', 'commit', '-m', 'base commit']);

    writeFixture(tmpRoot, 'core/staged.js', 'const marker = "MERCURY_STAGED_MARKER";\n');
    writeFixture(tmpRoot, 'core/unstaged.js', 'const marker = "MERCURY_UNSTAGED_MARKER";\n');
    git(tmpRoot, ['add', 'core/staged.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('git_diff', {
      target: 'current',
      path: 'core/unstaged.js',
    });

    expect(result.requested_target).toBe('current');
    expect(result.target).toBe('working');
    expect(result.files).toEqual(['core/unstaged.js']);
    expect(result.diff).toContain('MERCURY_UNSTAGED_MARKER');
    expect(result.diff).not.toContain('MERCURY_STAGED_MARKER');
  });

  test('git_diff current path reports no files when requested path has no changes', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/staged.js', 'const marker = "BASE_STAGED";\n');
    writeFixture(tmpRoot, 'core/unchanged.js', 'const marker = "BASE_UNCHANGED";\n');
    git(tmpRoot, ['add', 'core/staged.js', 'core/unchanged.js']);
    git(tmpRoot, ['-c', 'user.name=OGZ Test', '-c', 'user.email=ogz@example.test', 'commit', '-m', 'base commit']);

    writeFixture(tmpRoot, 'core/staged.js', 'const marker = "MERCURY_STAGED_ONLY";\n');
    git(tmpRoot, ['add', 'core/staged.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('git_diff', {
      target: 'current',
      path: 'core/unchanged.js',
    });

    expect(result.requested_target).toBe('current');
    expect(result.target).toBe('working');
    expect(result.files).toEqual([]);
    expect(result.file_count).toBe(0);
    expect(result.diff).toBe('');
  });

  test('run_check executes proof commands in an isolated tracked snapshot', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_RUN_CHECK_MARKER";\n');
    git(tmpRoot, ['add', 'core/live-path.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('run_check', {
      command: ['node', '--check', 'core/live-path.js'],
      profile: 'syntax-proof',
    });
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('run_check');
    expect(result.exit_code).toBe(0);
    expect(result.execution_cwd).toBe('isolated_tracked_snapshot');
    expect(result.tracked_mutation_detected).toBe(false);
    expect(result.artifact).toMatch(/^ogz-meta\/cognition-history\/mercury-execution\/.*syntax-proof\.log$/);
    expect(result.artifact_citation).toMatch(/^ogz-meta\/cognition-history\/mercury-execution\/.*syntax-proof\.log:1-\d+$/);
    expect(fs.existsSync(path.join(tmpRoot, result.artifact))).toBe(true);
    expect(schemaNames).toContain('run_check');
  });

  test('run_check snapshot preserves git ls-files visibility for git-aware tests', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_RUN_CHECK_MARKER";\n');
    writeFixture(tmpRoot, 'core/check-git-files.js', [
      "const { execFileSync } = require('child_process');",
      "process.stdout.write(execFileSync('git', ['ls-files', 'core/live-path.js'], { encoding: 'utf8' }));",
    ].join('\n'));
    git(tmpRoot, ['add', 'core/live-path.js', 'core/check-git-files.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('run_check', {
      command: ['node', 'core/check-git-files.js'],
      profile: 'git-aware-proof',
    });

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('run_check');
    expect(result.exit_code).toBe(0);
    expect(result.execution_cwd).toBe('isolated_tracked_snapshot');
    expect(result.stdout).toContain('core/live-path.js');
  });

  test('run_check allows node inline eval inside the isolated snapshot', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_RUN_CHECK_MARKER";\n');
    git(tmpRoot, ['add', 'core/live-path.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('run_check', {
      command: ['node', '-e', "const fs=require('fs'); process.stdout.write(fs.readFileSync('core/live-path.js','utf8'))"],
      profile: 'inline-node-proof',
    });

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('run_check');
    expect(result.exit_code).toBe(0);
    expect(result.execution_cwd).toBe('isolated_tracked_snapshot');
    expect(result.stdout).toContain('MERCURY_RUN_CHECK_MARKER');
    expect(fs.readFileSync(path.join(tmpRoot, 'core/live-path.js'), 'utf8')).toContain('MERCURY_RUN_CHECK_MARKER');
  });

  test('run_check node inline eval cannot read host absolute paths', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "MERCURY_RUN_CHECK_MARKER";\n');
    git(tmpRoot, ['add', 'core/live-path.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('run_check', {
      command: ['node', '-e', "const fs=require('fs'); process.stdout.write(fs.readFileSync('/etc/passwd','utf8'))"],
      profile: 'inline-node-host-read',
    });

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('run_check');
    expect(result.exit_code).not.toBe(0);
    expect(result.execution_cwd).toBe('isolated_tracked_snapshot');
    expect(result.stdout).not.toContain('root:x:0:0');
    expect(result.stderr).toMatch(/permission|access|ERR_ACCESS_DENIED/i);
  });

  test('run_check prevents proof commands from mutating live repo code', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const marker = "ORIGINAL_LIVE_CODE";\n');
    writeFixture(tmpRoot, 'core/mutator.js', [
      "const fs = require('fs');",
      "fs.writeFileSync('core/live-path.js', 'const marker = \"MUTATED_IN_SANDBOX\";\\n');",
    ].join('\n'));
    git(tmpRoot, ['add', 'core/live-path.js', 'core/mutator.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('run_check', {
      command: ['node', 'core/mutator.js'],
      profile: 'sandbox-mutation-proof',
    });

    expect(result.error).toBeUndefined();
    expect(result.exit_code).toBe(0);
    expect(result.execution_cwd).toBe('isolated_tracked_snapshot');
    expect(result.tracked_mutation_detected).toBe(false);
    expect(fs.readFileSync(path.join(tmpRoot, 'core/live-path.js'), 'utf8')).toContain('ORIGINAL_LIVE_CODE');
  });

  test('run_check strips sensitive environment variables from child commands', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/env-check.js', [
      "if (process.env.MERCURY_TEST_SECRET_TOKEN) {",
      "  console.error('secret leaked');",
      "  process.exit(1);",
      "}",
      "if (process.env.MERCURY_RUN_CHECK_SANITIZED_ENV !== 'true') {",
      "  console.error('sanitized marker missing');",
      "  process.exit(2);",
      "}",
      "console.log('env sanitized');",
    ].join('\n'));
    git(tmpRoot, ['add', 'core/env-check.js']);
    process.env.MERCURY_TEST_SECRET_TOKEN = 'super-secret-fixture-value';

    try {
      const adapter = createToolAdapter({ repoRoot: tmpRoot });
      const result = await adapter.execute('run_check', {
        command: ['node', 'core/env-check.js'],
        profile: 'env-sanitized',
      });

      expect(result.error).toBeUndefined();
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toContain('env sanitized');
      expect(result.stderr).not.toContain('super-secret-fixture-value');
    } finally {
      delete process.env.MERCURY_TEST_SECRET_TOKEN;
    }
  });

  test('run_check blocks ignored paths and live repo mutation commands', async () => {
    git(tmpRoot, ['init']);
    writeFixture(tmpRoot, 'core/live-path.js', 'const ok = true;\n');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale.js', 'const stale = true;\n');
    git(tmpRoot, ['add', 'core/live-path.js', 'ogz-meta/ledger/stale.js']);

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const ignoredPath = await adapter.execute('run_check', {
      command: ['node', '--check', 'ogz-meta/ledger/stale.js'],
      profile: 'ignored-path',
    });
    const gitMutation = await adapter.execute('run_check', {
      command: ['git', 'reset', '--hard'],
      profile: 'git-mutation',
    });
    const gitFetch = await adapter.execute('run_check', {
      command: ['git', 'fetch'],
      profile: 'git-fetch',
    });
    const gitStatus = await adapter.execute('run_check', {
      command: ['git', 'status', '--short'],
      profile: 'git-status',
    });
    const destructiveBinary = await adapter.execute('run_check', {
      command: ['rm', '-rf', 'core/live-path.js'],
      profile: 'destructive',
    });
    const networkBinary = await adapter.execute('run_check', {
      command: ['curl', 'https://example.com'],
      profile: 'network',
    });
    const interpreterBinary = await adapter.execute('run_check', {
      command: ['python3', '-c', 'print("hi")'],
      profile: 'interpreter',
    });
    const absoluteExecutable = await adapter.execute('run_check', {
      command: ['/bin/ls'],
      profile: 'absolute-executable',
    });
    const absoluteArgument = await adapter.execute('run_check', {
      command: ['node', '--check', path.join(tmpRoot, 'core/live-path.js')],
      profile: 'absolute-argument',
    });

    expect(ignoredPath.error).toContain('run_check blocked by mercury.ignore');
    expect(gitMutation.error).toContain('only allows read-only git subcommands');
    expect(gitFetch.error).toContain('only allows read-only git subcommands');
    expect(gitStatus.error).toBeUndefined();
    expect(gitStatus.execution_cwd).toBe('live_repo_read_only_git');
    expect(destructiveBinary.error).toContain('blocked executable');
    expect(networkBinary.error).toContain('blocked executable');
    expect(interpreterBinary.error).toContain('blocked executable');
    expect(absoluteExecutable.error).toContain('blocks absolute paths');
    expect(absoluteArgument.error).toContain('blocks absolute paths');
  });

  test('open_file honors line_start alias used by model tool calls', async () => {
    writeFixture(tmpRoot, 'core/line-alias.js', [
      'const first = true;',
      'const second = "MERCURY_LINE_ALIAS";',
      'const third = true;',
    ].join('\n'));

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const result = await adapter.execute('open_file', {
      path: 'core/line-alias.js',
      line_start: 2,
      end_line: 2,
    });

    expect(result.start_line).toBe(2);
    expect(result.text).toContain('MERCURY_LINE_ALIAS');
    expect(result.text).not.toContain('const first');
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
      jest.unmock('child_process');
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
      jest.unmock('child_process');
      jest.resetModules();
    }
  });

  test('ripgrep skip args are generated from the same non-canonical directory list', () => {
    const skipArgs = buildSkipDirGlobArgs();

    expect(skipArgs).toContain('!**/ledger/**');
    expect(skipArgs).toContain('!**/cognition-history/**');
    expect(skipArgs).toContain('!**/proposals/**');
  });

  test('Mercury tool access remains repo-wide inside mercury.ignore', async () => {
    writeFixture(tmpRoot, 'core/changed.js', 'const marker = "MERCURY_FULL_SCOPE_MARKER";');
    writeFixture(tmpRoot, 'core/sibling.js', 'const marker = "MERCURY_FULL_SCOPE_MARKER";');
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale.md', 'const marker = "MERCURY_FULL_SCOPE_MARKER";');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });

    const siblingRead = await adapter.execute('open_file', { path: 'core/sibling.js', start_line: 1, end_line: 1 });
    const ignoredRead = await adapter.execute('open_file', { path: 'ogz-meta/ledger/stale.md', start_line: 1, end_line: 1 });
    const grepResult = await adapter.execute('grep', { query: 'MERCURY_FULL_SCOPE_MARKER', limit: 20 });
    const rootList = await adapter.execute('list_files', { path: '.' });

    expect(siblingRead.file).toBe('core/sibling.js');
    expect(ignoredRead.error).toContain('blocked by mercury.ignore');
    expect(grepResult.matches.map((match) => match.file).sort()).toEqual([
      'core/changed.js',
      'core/sibling.js',
    ]);
    expect(rootList.scoped).toBeUndefined();
  });

  test('Mercury exposes Serena blast-radius evidence as a normal read-only tool', async () => {
    const adapter = createToolAdapter({ repoRoot: path.resolve(__dirname, '..') });

    const result = await adapter.execute('serena_blast_radius', {
      path: 'core/ProfitExitPlanner.js',
    });
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('serena_blast_radius');
    expect(result.file).toBe('core/ProfitExitPlanner.js');
    expect(result.callerCount).toBeGreaterThan(0);
    expect(result.text).toContain('## Blast Radius — core/ProfitExitPlanner.js');
    expect(result.text).toContain('**Callers (file:line):**');
    expect(schemaNames).toContain('serena_blast_radius');
  });

  test('plain Mercury CLI auto-blast-radius only considers current source files', () => {
    expect(isSerenaSourcePath('core/EvalRuleEngine.js')).toBe(true);
    expect(isSerenaSourcePath('foundation/ConfigLoader.js')).toBe(true);
    expect(isSerenaSourcePath('ogz-meta/ledger/stale.js')).toBe(false);
    expect(isSerenaSourcePath('ogz-meta/cognition-history/mercury/old-response.js')).toBe(false);
    expect(isSerenaSourcePath('core/EvalRuleEngine.md')).toBe(false);
    expect(isSerenaSourcePath('core/EvalRuleEngine.js.bak')).toBe(false);
  });

  test('plain Mercury CLI auto-blast-radius follows git_diff current semantics', () => {
    expect(selectCurrentChangeNames({
      cached: ['trai_brain/mercury-bridge/ask.js'],
      working: ['core/EvalRuleEngine.js'],
      untracked: ['new-tool.js'],
    })).toEqual(['trai_brain/mercury-bridge/ask.js']);

    expect(selectCurrentChangeNames({
      cached: [],
      working: ['core/EvalRuleEngine.js'],
      untracked: ['new-tool.js'],
    })).toEqual(['core/EvalRuleEngine.js', 'new-tool.js']);
  });

  test('plain Mercury CLI builds Serena blast-radius context from changed JS files', async () => {
    const result = await buildCurrentChangeBlastRadius({
      changedFiles: [
        'core/EvalRuleEngine.js',
        'ogz-meta/ledger/stale.js',
        'README.md',
      ],
    });

    expect(result.source).toBe('current_changes');
    expect(result.meta).toEqual([
      expect.objectContaining({
        file: 'core/EvalRuleEngine.js',
        callerCount: expect.any(Number),
        riskLevel: expect.any(String),
      }),
    ]);
    expect(result.text).toContain('## core/EvalRuleEngine.js');
    expect(result.text).toContain('## Blast Radius — core/EvalRuleEngine.js');
    expect(result.text).toContain('run-empire-v2.js');
    expect(result.text).not.toContain('ogz-meta/ledger/stale.js');
  });

  test('plain Mercury CLI reports Serena failures without aborting the review', async () => {
    const result = await buildCurrentChangeBlastRadius({
      changedFiles: ['core/EvalRuleEngine.js'],
      getBlastRadiusFn: async () => {
        throw new Error('Serena timeout (5000ms)');
      },
    });

    expect(result.text).toBeNull();
    expect(result.meta).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: 'core/EvalRuleEngine.js',
        error: 'Serena timeout (5000ms)',
      },
    ]);
  });

  test('plain Mercury CLI reports current-change discovery failures without aborting the review', async () => {
    const result = await buildCurrentChangeBlastRadius({
      currentChangedFilesFn: () => {
        throw new Error('git unavailable');
      },
    });

    expect(result.text).toBeNull();
    expect(result.meta).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: '<current_changes>',
        error: 'git unavailable',
      },
    ]);
  });

  test('plain Mercury CLI reports malformed Serena radius output without aborting the review', async () => {
    const result = await buildCurrentChangeBlastRadius({
      changedFiles: ['core/EvalRuleEngine.js'],
      getBlastRadiusFn: async () => ({
        file: 'core/EvalRuleEngine.js',
      }),
    });

    expect(result.text).toBeNull();
    expect(result.meta).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe('core/EvalRuleEngine.js');
    expect(result.errors[0].error).toMatch(/format failed/);
  });

  test('historical Mercury routing does not boost ignored ledger fix history', () => {
    const route = routeQuery('have we seen this bug before');

    expect(route.queryType).toBe('historical');
    expect(route.boostType).toBeNull();
    expect(route.rationale).not.toContain('fix_history');
  });

  test('plain break-my-fix wording uses normal Mercury retrieval instead of a special cage', () => {
    const route = routeQuery('Mercury, break my fix.');

    expect(route.queryType).toBe('general');
    expect(route.starterContextPolicy).toBe('mixed');
    expect(route.boostType).toBeNull();
  });

  test('break-my-fix Mercury routing does not hijack mid-sentence phrase mentions', () => {
    const route = routeQuery('have we seen a bug where a change had to break my fix before');

    expect(route.queryType).toBe('historical');
    expect(route.starterContextPolicy).toBe('prefer');
  });
});
