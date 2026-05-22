#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function tryGit(args, fallback = '') {
  try {
    return git(args);
  } catch (_) {
    return fallback;
  }
}

function parseArgs(argv) {
  const parsed = {
    out: path.join('ogz-meta', 'REPO-HISTORY.md'),
    maxCount: 80,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      parsed.out = argv[i + 1];
      i++;
    } else if (argv[i] === '--max-count' && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(n) && n > 0) parsed.maxCount = n;
      i++;
    }
  }

  return parsed;
}

function buildHistory({ maxCount }) {
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const branch = tryGit(['branch', '--show-current'], '(detached)');
  const head = git(['rev-parse', 'HEAD']);
  const shortHead = git(['rev-parse', '--short=12', 'HEAD']);
  const upstream = tryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], '(none)');
  const remote = tryGit(['config', '--get', 'remote.origin.url'], '(none)');
  const generatedAt = new Date().toISOString();
  const commitCount = tryGit(['rev-list', '--count', 'HEAD'], 'unknown');
  const rootCommit = tryGit(['rev-list', '--max-parents=0', 'HEAD'], '(unknown)');
  const conciseLog = git([
    'log',
    `--max-count=${maxCount}`,
    '--date=iso-strict',
    '--pretty=format:%h %ad %s',
  ]);
  const statLog = git([
    'log',
    `--max-count=${maxCount}`,
    '--date=iso-strict',
    '--pretty=format:commit %H%nshort %h%nauthor %an <%ae>%ndate %ad%nsubject %s%n',
    '--stat',
  ]);

  return `# Repo History Snapshot

Generated: ${generatedAt}
Repo root: ${repoRoot}
Branch: ${branch}
HEAD: ${head}
HEAD short: ${shortHead}
Upstream: ${upstream}
Origin: ${remote}
Commit count: ${commitCount}
Root commit: ${rootCommit}
Recent commit limit: ${maxCount}

## Purpose

GitHub source archives and downloaded zip files do not include the .git
directory. This tracked snapshot preserves recent commit history inside the zip.

The snapshot is generated from committed git history only. It intentionally does
not serialize the local working tree, untracked files, secrets, or broker state.

Self-reference note: when the pipeline creates a metadata commit containing this
file, this file records history through the commit that existed immediately
before the metadata commit. A file cannot reliably contain its own final commit
SHA without changing that SHA.

## Recent Commits

\`\`\`
${conciseLog}
\`\`\`

## Recent Commits With Stats

\`\`\`
${statLog}
\`\`\`
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const outPath = path.isAbsolute(args.out)
    ? args.out
    : path.join(repoRoot, args.out);
  const relOut = path.relative(repoRoot, outPath);

  if (relOut === '..' || relOut.startsWith(`..${path.sep}`) || path.isAbsolute(relOut)) {
    throw new Error(`Refusing to write repo history outside repo: ${args.out}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buildHistory(args), 'utf8');
  console.log(`Updated ${relOut}`);
}

main();
