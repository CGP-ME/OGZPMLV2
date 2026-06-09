'use strict';

const fs = require('fs');
const path = require('path');
const mercuryConfig = require('../mercury-bridge/config');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Paths Mercury intentionally ignores, but that I (claude-bridge) need to read.
// Mercury must keep its RAG memory uncontaminated by drafts/audits/proposals —
// so mercury.ignore correctly excludes these. But I'm the implementer + curator:
// I ingest raw material from ledger/, curate it into clean specs/, and Mercury
// indexes the specs. Reading is fine here because I'm not the verifier.
//
// .claude/memory/ is the canonical Claude persistent memory store. It is a
// real directory inside the repo (allowed via .claude/ prefix). The harness
// reads it via the legacy $HOME path which is a symlink pointing here; the
// resolveRealPath() call below dereferences that symlink before policy check
// so paths that look outside-repo but actually resolve inside-repo are allowed
// while genuinely outside-repo paths stay blocked.
const CLAUDE_ALLOW_PREFIXES = [
  '.claude/',
  'ogz-meta/ledger/',
];

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

function checkPath(targetPath) {
  const r = relToRepo(targetPath);
  if (!r) {
    return { allowed: false, reason: 'no_path' };
  }
  if (r.outsideRepo) {
    return { allowed: false, reason: 'outside_repo', path: targetPath };
  }
  if (isClaudeAllowed(r.rel)) {
    return { allowed: true, reason: 'claude_owned', path: r.rel };
  }
  if (mercuryConfig.isPathIgnoredByMercury(r.rel)) {
    return { allowed: false, reason: 'mercury_ignored', path: r.rel };
  }
  return { allowed: true, reason: 'ok', path: r.rel };
}

module.exports = { checkPath, relToRepo, REPO_ROOT };
