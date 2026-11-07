'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MERCURY_IGNORE_FILE = path.join(REPO_ROOT, 'mercury.ignore');

function loadMercuryIgnore(filePath = MERCURY_IGNORE_FILE) {
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

const { skipDirs: SKIP_DIRS } = loadMercuryIgnore();

const TEST_FIXTURE_DIRS = Object.freeze(new Set([
  'test',
  'tests',
  '__tests__',
  'fixtures',
  '__fixtures__',
  'test-fixtures',
]));

function isTestFixturePath(pathLike) {
  if (!pathLike || typeof pathLike !== 'string') return false;
  const normalized = pathLike.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(part => TEST_FIXTURE_DIRS.has(part.toLowerCase()))) return true;
  const basename = parts[parts.length - 1] || '';
  return /(?:^|\.)(?:test|spec|fixture)\.[^.]+$/i.test(basename)
    || /^(?:test[-_.]|smoke[-_.]?test(?:\.|$))/i.test(basename);
}

function isPathIgnoredByMercury(pathLike, skipDirs = SKIP_DIRS) {
  if (!pathLike || typeof pathLike !== 'string') return false;
  const normalized = pathLike.replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.some(part => skipDirs.has(part)) || isTestFixturePath(pathLike);
}

const EXPLICIT_IGNORED_TOOL_READ_PREFIXES = Object.freeze([
  'ogz-meta/cognition-history/mercury-runs/',
  'ogz-meta/cognition-history/mercury-execution/',
  'ogz-meta/cognition-history/session-router-phase05/',
]);

function isExplicitIgnoredToolReadAllowed(pathLike) {
  const normalized = String(pathLike).replace(/\\/g, '/');
  return EXPLICIT_IGNORED_TOOL_READ_PREFIXES.some(prefix =>
    normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

module.exports = {
  isExplicitIgnoredToolReadAllowed,
  REPO_ROOT,
  MERCURY_IGNORE_FILE,
  SKIP_DIRS,
  TEST_FIXTURE_DIRS,
  loadMercuryIgnore,
  isTestFixturePath,
  isPathIgnoredByMercury,
};
