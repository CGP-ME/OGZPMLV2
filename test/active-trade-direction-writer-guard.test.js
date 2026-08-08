'use strict';

const fs = require('fs');
const path = require('path');
const {
  findJSFiles,
  getPropertyReferences,
} = require('../tools/serena-symbol-scanner');

const ROOT = path.resolve(__dirname, '..');
const SCOPES = ['core/**/*.js', 'modules/**/*.js', 'brokers/**/*.js', 'run-empire-v2.js'];
const PRODUCTION_DIRS = ['core', 'modules', 'brokers'];
const PRODUCTION_FILES = ['run-empire-v2.js'];

const OBJECT_ASSIGN_DIRECTION_RE = /\bObject\.assign\(\s*([^,\n]+)\s*,\s*\{[\s\S]{0,400}?\bdirection\s*:/g;
const BRACKET_DIRECTION_WRITE_RE = /\b([A-Za-z_$][\w$]*(?:(?:\[[^\]]+\])|\.[A-Za-z_$][\w$]*)*)\s*\[\s*['"]direction['"]\s*\]\s*=(?!=)/g;
const REFLECT_SET_DIRECTION_RE = /\bReflect\.set\(\s*[^,\n]+,\s*['"]direction['"]/g;
const DEFINE_PROPERTY_DIRECTION_RE = /\bObject\.defineProperty\(\s*[^,\n]+,\s*['"]direction['"]/g;

function productionFiles() {
  const files = new Set();
  for (const dir of PRODUCTION_DIRS) {
    for (const file of findJSFiles(path.join(ROOT, dir), ROOT)) {
      files.add(file);
    }
  }
  for (const file of PRODUCTION_FILES) {
    files.add(path.join(ROOT, file));
  }
  return Array.from(files).sort();
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function lineAt(source, index) {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end === -1 ? undefined : end).trim();
}

function regexOffenders(regex) {
  const offenders = [];
  for (const file of productionFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = regex.exec(source)) !== null) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      offenders.push(`${rel}:${lineNumber(source, match.index)}:${lineAt(source, match.index)}`);
    }
  }
  return offenders;
}

function isAllowedAnalysisDirectionWrite(ref) {
  if (ref.file === 'core/FibonacciDetector.js' && ref.receiverPath === 'levels' && ref.enclosing === 'update') {
    return true;
  }
  if (ref.file === 'core/TRAIPatternIntegration.js' && ref.receiverPath === 'dims' && ref.enclosing === '_extractDimensions') {
    return true;
  }
  if (ref.file === 'modules/MultiTimeframeAdapter.js' && ref.receiverPath === 'analysis' && ref.enclosing === 'crossFrameScore') {
    return true;
  }
  return false;
}

describe('active trade direction writer guard', () => {
  test('does not mutate direction on existing active-trade-scoped objects', () => {
    // Direction is also Fibonacci, MTF, signal, and TRAI vocabulary. This guard
    // deliberately allows only the named analysis writers above; every other
    // production direction write is a potential active-trade identity bypass.
    const refs = getPropertyReferences('direction', {
      scope: SCOPES,
      op: ['write', 'write:compound', 'delete'],
      limit: 500,
    });

    expect(refs.errors).toEqual([]);
    expect(refs.truncated).toBe(false);

    const directWriteOffenders = refs.references
      .filter((ref) => !isAllowedAnalysisDirectionWrite(ref))
      .map((ref) => `${ref.file}:${ref.line}:${ref.context}`);
    const assignOffenders = regexOffenders(OBJECT_ASSIGN_DIRECTION_RE);
    const bracketOffenders = regexOffenders(BRACKET_DIRECTION_WRITE_RE);
    const reflectOffenders = regexOffenders(REFLECT_SET_DIRECTION_RE);
    const definePropertyOffenders = regexOffenders(DEFINE_PROPERTY_DIRECTION_RE);

    expect([
      ...directWriteOffenders,
      ...assignOffenders,
      ...bracketOffenders,
      ...reflectOffenders,
      ...definePropertyOffenders,
    ]).toEqual([]);
  });
});
