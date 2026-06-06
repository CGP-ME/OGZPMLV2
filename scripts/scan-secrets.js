#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PLACEHOLDER_VALUES = new Set([
  '',
  '[REDACTED]',
  '<REDACTED>',
  'REDACTED',
  'CHANGE_ME_IN_PRODUCTION'
]);

const BURNED_TOKEN_HASH_FILE = path.join(
  __dirname,
  '..',
  'ogz-meta',
  'security',
  'burned-dashboard-token-sha256.txt'
);

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout;
}

function splitLines(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function listTrackedFiles() {
  return splitLines(git(['ls-files']));
}

function listStagedFiles() {
  return splitLines(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']));
}

function loadBurnedTokenHashes() {
  if (!fs.existsSync(BURNED_TOKEN_HASH_FILE)) return new Set();
  const content = fs.readFileSync(BURNED_TOKEN_HASH_FILE, 'utf8');
  return new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  );
}

function isAllowedTokenAssignment(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '');
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  return /^<[^>]+>$/.test(normalized) || /^your[-_A-Z0-9]*$/i.test(normalized);
}

function isSubmodule(filePath) {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  return Boolean(stat && stat.isDirectory());
}

function hashTokenLiteral(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function stripSelfReferentialScannerLiterals(line) {
  let next = line;
  next = next.replace(/\/<meta\\s\+name=[^\n]+?\/[a-z]*/gi, '');
  next = next.replace(/\/\^?\\s\*WEBSOCKET_AUTH_TOKEN[^\n]+?\/[a-z]*/gi, '');
  next = next.replace(/<meta\\s\+name=\[[^\n]+/gi, '');
  return next;
}

function inspectLine(filePath, lineNumber, line, burnedTokenHashes) {
  const findings = [];
  const inspectLine = stripSelfReferentialScannerLiterals(line);

  const hexCandidates = inspectLine.match(/[a-f0-9]{64}/gi) || [];
  for (const candidate of hexCandidates) {
    if (burnedTokenHashes.has(hashTokenLiteral(candidate.toLowerCase()))) {
      findings.push({
        filePath,
        lineNumber,
        reason: 'known-burned dashboard token literal'
      });
    }
  }

  const wsTokenMeta = inspectLine.match(/<meta\s+name=["']ws-token["']\s+content=["']([^"']+)["']/i);
  if (wsTokenMeta && wsTokenMeta[1] !== '[REDACTED]') {
    findings.push({
      filePath,
      lineNumber,
      reason: 'non-empty ws-token meta value'
    });
  }

  const envAssignment = inspectLine.match(/^\s*WEBSOCKET_AUTH_TOKEN\s*=\s*([^#\s]+)/);
  if (envAssignment && !isAllowedTokenAssignment(envAssignment[1])) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'WEBSOCKET_AUTH_TOKEN assignment contains a non-placeholder value'
    });
  }

  return findings;
}

function createTrackedStream(filePath) {
  return fs.createReadStream(filePath);
}

function createStagedStream(filePath) {
  const child = spawn('git', ['show', `:${filePath}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  child.stdout.gitChild = child;
  child.stdout.gitStderr = () => stderr;
  return child.stdout;
}

async function inspectStream(filePath, stream, burnedTokenHashes) {
  const findings = [];
  let lineNumber = 0;
  let sawNul = false;
  let readError = null;

  stream.on('data', (chunk) => {
    if (chunk.includes(0)) sawNul = true;
  });
  stream.on('error', (error) => {
    readError = error;
  });

  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    lineNumber += 1;
    findings.push(...inspectLine(filePath, lineNumber, line, burnedTokenHashes));
  }

  if (stream.gitChild) {
    const status = await new Promise((resolve) => {
      stream.gitChild.on('close', resolve);
    });
    if (status !== 0) {
      findings.push({
        filePath,
        lineNumber: 0,
        reason: `could not fully read staged file: ${stream.gitStderr().trim()}`
      });
    }
  }

  if (readError) {
    findings.push({
      filePath,
      lineNumber: 0,
      reason: `could not fully read file: ${readError.message}`
    });
  }

  return {
    findings,
    skippedBinary: sawNul
  };
}

async function scan(files, createStream, burnedTokenHashes) {
  const findings = [];
  let scanned = 0;
  let skippedBinary = 0;
  let skippedSubmodules = 0;

  for (const filePath of files) {
    if (isSubmodule(filePath)) {
      skippedSubmodules += 1;
      continue;
    }

    const result = await inspectStream(filePath, createStream(filePath), burnedTokenHashes);
    if (result.skippedBinary) {
      skippedBinary += 1;
      continue;
    }
    scanned += 1;
    findings.push(...result.findings);
  }

  return {
    findings,
    scanned,
    skippedBinary,
    skippedSubmodules
  };
}

async function main() {
  const mode = process.argv.includes('--staged') ? 'staged' : 'tracked';
  const files = mode === 'staged' ? listStagedFiles() : listTrackedFiles();
  const burnedTokenHashes = loadBurnedTokenHashes();
  const result = await scan(
    files,
    mode === 'staged' ? createStagedStream : createTrackedStream,
    burnedTokenHashes
  );

  if (result.findings.length > 0) {
    console.error(`[secret-scan] Found ${result.findings.length} dashboard-token secret finding(s):`);
    for (const finding of result.findings) {
      console.error(`- ${finding.filePath}:${finding.lineNumber} ${finding.reason}`);
    }
    process.exit(1);
  }

  console.log(
    `[secret-scan] PASS ${mode} files scanned=${result.scanned} ` +
    `binarySkipped=${result.skippedBinary} submodulesSkipped=${result.skippedSubmodules}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[secret-scan] ERROR ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  inspectLine,
  loadBurnedTokenHashes
};
