'use strict';

const fs = require('fs');
const path = require('path');
const ignorePolicy = require('./ignore-policy.json');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Claude bridge uses a cloned ignore-policy snapshot. It must not import or
// mutate Mercury runtime modules; Mercury owns Mercury state.
//
// .claude/memory/ is the canonical Claude persistent memory store. It is a
// real directory inside the repo (allowed via .claude/ prefix). The harness
// reads it via the legacy $HOME path which is a symlink pointing here; the
// resolveRealPath() call below dereferences that symlink before policy check
// so paths that look outside-repo but actually resolve inside-repo are allowed
// while genuinely outside-repo paths stay blocked.
const CLAUDE_ALLOW_PREFIXES = normalizePolicyList(ignorePolicy.allowedPrefixes, 'allowedPrefixes');
const IGNORED_DIRECTORIES = normalizePolicyList(ignorePolicy.ignoredDirectories, 'ignoredDirectories');
const PROTECTED_WRITE_PATHS = Object.freeze([
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks/',
  '.claude/hookify.',
  '.claude/commands/',
  'trai_brain/claude-bridge/',
]);

function normalizePolicyList(values, fieldName) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`claude-bridge ignore policy ${fieldName} must be a non-empty array`);
  }
  return values.map((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`claude-bridge ignore policy ${fieldName} contains a non-string entry`);
    }
    return value.replace(/\\/g, '/');
  });
}

function resolveRealPath(targetPath) {
  // Resolve symlinks if the target exists. If it doesn't (e.g. a new file
  // being created), fall back to the literal abs path — Write paths get
  // checked before the file exists, so realpathSync would throw otherwise.
  try {
    return fs.realpathSync(targetPath);
  } catch (_) {
    return path.resolve(targetPath);
  }
}

function relToRepo(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return null;
  const abs = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(REPO_ROOT, targetPath);
  const real = resolveRealPath(abs);
  const rel = path.relative(REPO_ROOT, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { outsideRepo: true, rel: null };
  }
  return { outsideRepo: false, rel: rel.split(path.sep).join('/') };
}

function isClaudeAllowed(rel) {
  return CLAUDE_ALLOW_PREFIXES.some((p) => rel === p.replace(/\/$/, '') || rel.startsWith(p));
}

function isIgnoredByClaudeBridge(rel) {
  const segments = rel.split('/').filter(Boolean);
  return IGNORED_DIRECTORIES.some((entry) => {
    const dir = entry.replace(/\/$/, '');
    return segments.includes(dir);
  });
}

function isProtectedWritePath(rel) {
  return PROTECTED_WRITE_PATHS.some((entry) => {
    if (entry.endsWith('/')) {
      return rel === entry.replace(/\/$/, '') || rel.startsWith(entry);
    }
    return rel === entry || rel.startsWith(entry);
  });
}

function normalizeOperation(operation) {
  if (operation == null || operation === '') return 'read';
  if (operation !== 'read' && operation !== 'write') {
    throw new Error(`Unsupported claude-bridge policy operation: ${operation}`);
  }
  return operation;
}

function checkPath(targetPath, options = {}) {
  const operation = normalizeOperation(options.operation);
  const r = relToRepo(targetPath);
  if (!r) {
    return { allowed: false, reason: 'no_path' };
  }
  if (r.outsideRepo) {
    return { allowed: false, reason: 'outside_repo', path: targetPath };
  }
  if (operation === 'write' && isProtectedWritePath(r.rel)) {
    return { allowed: false, reason: 'claude_bridge_protected_write', path: r.rel };
  }
  if (isClaudeAllowed(r.rel)) {
    return { allowed: true, reason: 'claude_owned', path: r.rel };
  }
  if (isIgnoredByClaudeBridge(r.rel)) {
    return { allowed: false, reason: 'claude_bridge_ignored', path: r.rel };
  }
  return { allowed: true, reason: 'ok', path: r.rel };
}

module.exports = {
  checkPath,
  relToRepo,
  isIgnoredByClaudeBridge,
  isProtectedWritePath,
  REPO_ROOT,
};
