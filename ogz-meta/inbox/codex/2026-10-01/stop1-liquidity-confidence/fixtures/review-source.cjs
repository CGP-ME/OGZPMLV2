'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

module.exports = function selectReviewSource(tree, packet, repo) {
  assert.match(tree, /^[0-9a-f]{40}$/i, 'LIQUIDITY_REVIEW_TREE must be an exact 40-hex tree');
  assert.equal(cp.execFileSync('git', ['cat-file', '-t', tree], { cwd: repo, encoding: 'utf8' }).trim(),
    'tree', 'LIQUIDITY_REVIEW_TREE must identify a tree object');
  const tracked = new Set(cp.execFileSync('git', ['ls-tree', '-r', '--name-only', tree],
    { cwd: repo, encoding: 'utf8', maxBuffer: 20e6 }).trim().split('\n'));
  const sourceHashes = {};
  const loadedHashes = {};
  const cache = new Map();
  const sourceCache = new Map();
  const privateDir = path.join(packet, 'private');
  fs.mkdirSync(privateDir, { recursive: true });
  const root = fs.mkdtempSync(path.join(privateDir, `review-${tree}-`));
  const resultPath = path.join(privateDir, `verification-review-${tree}.json`);
  const projectRequire = Module.createRequire(path.join(repo, 'package.json'));
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  function read(file) {
    assert.ok(tracked.has(file), `Source absent from selected review tree: ${file}`);
    if (!sourceCache.has(file)) {
      const bytes = cp.execFileSync('git', ['show', `${tree}:${file}`], { cwd: repo, maxBuffer: 50e6 });
      sourceCache.set(file, bytes);
      sourceHashes[file] = hash(bytes);
    }
    return sourceCache.get(file);
  }
  function resolveTracked(request, parentFile) {
    const absolute = path.isAbsolute(request) ? request : path.resolve(repo, path.dirname(parentFile), request);
    const relative = path.relative(repo, absolute).split(path.sep).join('/');
    assert.ok(!relative.startsWith('../') && !path.isAbsolute(relative), `Repository dependency escaped selected tree: ${request}`);
    const match = [relative, relative + '.js', relative + '.json', relative + '/index.js', relative + '/index.json']
      .find(file => tracked.has(file));
    assert.ok(match, `Untracked repository dependency outside selected review tree: ${relative}`);
    return match;
  }
  function requireFrom(parentFile, request) {
    if (Module.isBuiltin(request)) return require(request);
    if (request.startsWith('.') || path.isAbsolute(request)) return load(resolveTracked(request, parentFile));
    const resolved = projectRequire.resolve(request);
    const relative = path.relative(repo, resolved).split(path.sep).join('/');
    if (!relative.startsWith('../') && !path.isAbsolute(relative) && !relative.startsWith('node_modules/')) {
      return load(resolveTracked(resolved, parentFile));
    }
    return projectRequire(request);
  }
  function load(file, suffix = '') {
    if (cache.has(file)) return cache.get(file).exports;
    const bytes = read(file);
    loadedHashes[file] = hash(bytes);
    const filename = path.join(root, file);
    const m = new Module(filename, module);
    m.filename = filename;
    m.paths = Module._nodeModulePaths(repo);
    m.require = request => requireFrom(file, request);
    cache.set(file, m);
    if (file.endsWith('.json')) m.exports = JSON.parse(bytes);
    else m._compile(bytes.toString('utf8') + suffix, filename);
    m.loaded = true;
    return m.exports;
  }
  for (const file of ['config/settings.json', 'config/internals.json']) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, read(file));
  }
  const selection = { mode: 'immutable_review_tree', tree, patchesApplied: false };
  // Explicitly verify that a missing local dependency cannot resolve from the
  // working tree or prior generated candidate files.
  assert.throws(() => requireFrom('modules/LiquiditySweepDetector.js', './__liquidity_untracked_dependency_probe__'),
    /Untracked repository dependency outside selected review tree/);
  return { root, resultPath, selection, sourceHashes, loadedHashes, read, load,
    untrackedDependencyFallbackRejected: true };
};
