'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../trai_brain/mercury-bridge/config');
const { walkRepo } = require('../trai_brain/mercury-bridge/indexer');
const { routeQuery } = require('../trai_brain/mercury-bridge/query-router');
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
    const result = await adapter.execute('regex_grep', { query: '[^\\x00-\\x7F]', limit: 20 });
    const files = result.matches.map((match) => match.file);

    expect(result.source).toBe('direct_ripgrep_regex');
    expect(files).toContain('core/live-path.js');
    expect(files).not.toContain('ogz-meta/ledger/stale-audit.md');
    expect(files).not.toContain('ogz-meta/cognition-history/mercury/old-response.md');
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
});
