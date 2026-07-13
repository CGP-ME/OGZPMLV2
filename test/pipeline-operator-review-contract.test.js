'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourceRef = process.env.PIPELINE_CONTRACT_REF || '';

function readRepoFile(...parts) {
  if (sourceRef) {
    return execFileSync('git', ['show', `${sourceRef}:${parts.join('/')}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  }
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  expect(start).toBeGreaterThanOrEqual(0);

  const braceStart = source.indexOf('{', start);
  expect(braceStart).toBeGreaterThan(start);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Could not extract ${functionName}`);
}

function listFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('pipeline operator-review contract', () => {
  test('pipeline arrays cannot auto-advance into commit-producing stages', () => {
    const pipelineSource = readRepoFile('ogz-meta', 'pipeline.js');

    expect(pipelineSource).not.toMatch(/const\s+\w+_PIPELINE\s*=\s*\[[\s\S]*['"]\/committer['"]/);
    expect(pipelineSource).not.toMatch(/const\s+\w+_PIPELINE\s*=\s*\[[\s\S]*['"]\/repo-history-snapshot['"]/);
    expect(pipelineSource).not.toContain('--resume-after-mercury-ack');
  });

  test('slash-router handlers cannot stage, commit, or push git changes', () => {
    const slashSource = readRepoFile('ogz-meta', 'slash-router.js');

    expect(slashSource).not.toMatch(/git\s+add\b/);
    expect(slashSource).not.toMatch(/git\s+commit\b/);
    expect(slashSource).not.toMatch(/git\s+push\b/);
    expect(slashSource).not.toMatch(/exec(?:File)?Sync\(\s*['"]git['"]\s*,\s*\[[^\]]*['"]add['"]/);
    expect(slashSource).not.toMatch(/exec(?:File)?Sync\(\s*['"]git['"]\s*,\s*\[[^\]]*['"]commit['"]/);
    expect(slashSource).not.toMatch(/exec(?:File)?Sync\(\s*['"]git['"]\s*,\s*\[[^\]]*['"]push['"]/);
  });

  test('mercury critic is report-only and cannot halt through ack files', () => {
    const slashSource = readRepoFile('ogz-meta', 'slash-router.js');
    const mercuryCritic = extractFunctionBody(slashSource, 'mercuryCritic');

    expect(mercuryCritic).toContain('mercury_critic');
    expect(mercuryCritic).not.toContain('forensics_critical');
    expect(mercuryCritic).not.toContain('mercury-ack');
    expect(mercuryCritic).not.toContain('human_ack');
    expect(mercuryCritic).not.toMatch(/gate:\s*['"]ack['"]/);
    expect(mercuryCritic).not.toMatch(/fail-findings/);
  });

  test('pipeline tooling cannot preserve legacy Mercury halt machinery', () => {
    const sources = [
      readRepoFile('ogz-meta', 'pipeline.js'),
      readRepoFile('ogz-meta', 'slash-router.js'),
    ].join('\n');

    expect(sources).not.toContain('forensics_critical');
    expect(sources).not.toContain('mercury-ack');
    expect(sources).not.toContain('human_ack');
    expect(sources).not.toContain('fail-findings');
    expect(sources).not.toContain('resume-after-ack');
  });

  test('verification tooling has zero live-trading-path references', () => {
    const targets = [
      path.join(repoRoot, 'run-empire-v2.js'),
      ...listFilesRecursive(path.join(repoRoot, 'core')),
      ...listFilesRecursive(path.join(repoRoot, 'foundation')),
    ];
    const forbidden = /\b(?:slash-router|mercuryCritic|forensics_critical)\b/;
    const hits = [];

    for (const target of targets) {
      const source = fs.readFileSync(target, 'utf8');
      if (forbidden.test(source)) {
        hits.push(path.relative(repoRoot, target));
      }
    }

    expect(hits).toEqual([]);
  });
});
