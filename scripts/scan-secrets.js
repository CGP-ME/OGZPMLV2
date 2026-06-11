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

const BURNED_TOKEN_HASH_FILES = [
  path.join(__dirname, '..', 'ogz-meta', 'security', 'burned-dashboard-token-sha256.txt'),
  path.join(__dirname, '..', 'ogz-meta', 'security', 'burned-env-template-sha256.txt')
];

const VENDOR_TOKEN_PREFIX = /\b(sk_live_[A-Za-z0-9]{8,}|sk_test_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[bp]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{30,})\b/;
const SPLIT_VENDOR_TOKEN = /(?:["'`](?:sk_live_|sk_test_|sk-)[A-Za-z0-9]{0,8}["'`]\s*\+\s*["'`][A-Za-z0-9${}_-]{4,}["'`]|`(?:sk_live_|sk_test_|sk-)[^`]*\$\{[^}]+\}[^`]*`)/;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._-]{10,}\b/i;
const JWT_LITERAL = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const URL_WITH_USERINFO = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i;
const URL_WITH_CREDENTIAL_QUERY = /[?&]([A-Za-z0-9_-]*(?:token|key|secret|password|passphrase)[A-Za-z0-9_-]*)=([^&#\s'"<>]+)/ig;
const CREDENTIAL_ASSIGNMENT = /^\s*(?:export\s+|let\s+|const\s+|var\s+)?([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/;
const JSON_CREDENTIAL_PROPERTY = /["']([A-Za-z][A-Za-z0-9_-]*)["']\s*:\s*["']([^"']+)["']/g;
const OBJECT_CREDENTIAL_PROPERTY = /\b([A-Za-z][A-Za-z0-9_-]*)\s*:\s*["']([^"']+)["']/g;
const ANY_ENV_ASSIGNMENT = /^\s*[A-Z0-9_]+\s*=\s*["']?([^"'#\s]+)/i;
const CREDENTIAL_KEY_QUALIFIERS = new Set([
  'ACCESS',
  'ALPACA',
  'API',
  'AUTH',
  'COINBASE',
  'DID',
  'EMBED',
  'INCEPTION',
  'KRAKEN',
  'MOVER',
  'OPENAI',
  'PRIVATE',
  'SECRET',
  'SUPABASE'
]);
const CREDENTIAL_EXACT_NAMES = new Set([
  'AUTH_TOKEN',
  'CLIENT_SECRET',
  'DATABASE_URL',
  'JWT',
  'PRIVATE_KEY',
  'REDIS_URL',
  'SECRET_KEY',
  'SESSION_TOKEN',
  'SUPABASE_URL',
  'VOICE_ID',
  'WALLET_ADDRESS'
]);

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
  const hashes = new Set();
  for (const filePath of BURNED_TOKEN_HASH_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const normalized = line.trim();
      if (!normalized || normalized.startsWith('#')) continue;
      const hash = normalized.split(/\s+/)[0];
      if (/^[a-f0-9]{64}$/i.test(hash)) hashes.add(hash.toLowerCase());
    }
  }
  return hashes;
}

function normalizeAssignmentValue(value) {
  const withoutComment = value.trim().split(/\s+#/)[0].trim().replace(/[;,]$/, '').trim();
  return withoutComment.replace(/^['"]|['"]$/g, '').trim();
}

function credentialNameTokens(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function isCredentialName(name) {
  const tokens = credentialNameTokens(name);
  const joined = tokens.join('_');
  if (joined.endsWith('_TOKEN_ID') || joined === 'TOKEN_ID') return false;
  if (tokens.includes('TOKEN') && tokens.some((token) => ['COUNT', 'LENGTH', 'META', 'PATTERN', 'PRESENT'].includes(token))) {
    return false;
  }
  if (CREDENTIAL_EXACT_NAMES.has(joined)) return true;
  if (tokens.includes('PASSWORD') || tokens.includes('PASSPHRASE') || tokens.includes('SECRET')) return true;
  if (tokens.includes('TOKEN') && !tokens.includes('TOKENS')) return true;
  return tokens.includes('KEY') && tokens.some((token) => CREDENTIAL_KEY_QUALIFIERS.has(token));
}

function isDynamicAssignmentValue(value) {
  const raw = value.trim().split(/\s+#/)[0].trim().replace(/[;,]$/, '').trim();
  const normalized = normalizeAssignmentValue(value);
  if (/^(['"`])(?:\\.|(?!\1).)*\1$/.test(raw)) return false;
  return (
    normalized.startsWith('$') ||
    raw.startsWith('[') ||
    raw.startsWith('/') ||
    normalized.includes('$(') ||
    normalized.includes('${') ||
    normalized.includes('process.env') ||
    normalized.includes('import.meta.env') ||
    normalized.includes('this.') ||
    normalized.includes('.') ||
    raw.includes(' ? ') ||
    normalized.includes('=>') ||
    normalized.includes('(')
  );
}

function isAllowedTokenAssignment(value) {
  const normalized = normalizeAssignmentValue(value);
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  if (/^\[REDACTED(?::[a-z0-9_-]+)?\]$/i.test(normalized)) return true;
  if (/^<[^>]+>$/.test(normalized)) return true;
  if (/^\{[^}]+\}$/.test(normalized)) return true;
  if (/^your[-_a-z0-9]*(?:here)?$/i.test(normalized)) return true;
  if (/placeholder/i.test(normalized)) return true;
  return false;
}

function isEnvReferenceProperty(name, value) {
  return /env$/i.test(name) && /^[A-Z][A-Z0-9_-]*$/.test(normalizeAssignmentValue(value));
}

function isFixtureLikeFile(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  return (
    normalized.startsWith('test/') ||
    normalized.startsWith('tests/') ||
    normalized.includes('/fixtures/') ||
    /\.test\.[cm]?js$/i.test(normalized) ||
    /backtest/i.test(normalized)
  );
}

function isAllowedFixtureCredentialValue(filePath, value) {
  if (!isFixtureLikeFile(filePath)) return false;
  const normalized = normalizeAssignmentValue(value);
  return /^(?:test|fake|dummy|mock|fixture|backtest|fallback-must-not-be-read|placeholder|audit-test|configured-key|secret-runtime-token|secret-ollama-key|parent-live|ambient|key|secret)(?:[-_a-z0-9]*)?$/i.test(normalized) ||
    /must-not-be-read/i.test(normalized) ||
    /^do-not-[a-z0-9_-]+$/i.test(normalized) ||
    /^[ks]$/i.test(normalized);
}

function isSubmodule(filePath) {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  return Boolean(stat && stat.isDirectory());
}

function isBurnedHashFile(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  return normalized.startsWith('ogz-meta/security/') && /sha256\.txt$/i.test(normalized);
}

function isTemplateFile(filePath) {
  return /\.env\.(example|template|sample)$/i.test(filePath);
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
  const inspectLine = filePath === 'scripts/scan-secrets.js'
    ? stripSelfReferentialScannerLiterals(line)
    : line;

  const hexCandidates = inspectLine.match(/[a-f0-9]{64}/gi) || [];
  for (const candidate of hexCandidates) {
    const normalizedCandidate = candidate.toLowerCase();
    if (!isBurnedHashFile(filePath) && burnedTokenHashes.has(normalizedCandidate)) {
      findings.push({
        filePath,
        lineNumber,
        reason: 'known-burned secret hash copied outside security denylist'
      });
    }
    if (burnedTokenHashes.has(hashTokenLiteral(normalizedCandidate))) {
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

  if (PRIVATE_KEY_BLOCK.test(inspectLine)) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'private key block committed'
    });
  }

  if (JWT_LITERAL.test(inspectLine)) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'JWT-shaped literal committed'
    });
  }

  if (VENDOR_TOKEN_PREFIX.test(inspectLine)) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'vendor-prefixed token literal committed'
    });
  }

  if (SPLIT_VENDOR_TOKEN.test(inspectLine)) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'split vendor-prefixed token literal committed'
    });
  }

  if (BEARER_TOKEN.test(inspectLine)) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'Bearer token literal committed'
    });
  }

  if (URL_WITH_USERINFO.test(inspectLine)) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'URL contains embedded credentials'
    });
  }

  for (const queryMatch of inspectLine.matchAll(URL_WITH_CREDENTIAL_QUERY)) {
    if (
      !isAllowedTokenAssignment(queryMatch[2]) &&
      !isDynamicAssignmentValue(queryMatch[2])
    ) {
      findings.push({
        filePath,
        lineNumber,
        reason: 'URL contains credential query parameter'
      });
    }
  }

  const credentialAssignment = inspectLine.match(CREDENTIAL_ASSIGNMENT);
  if (
    credentialAssignment &&
    isCredentialName(credentialAssignment[1]) &&
    credentialAssignment[1].toUpperCase() !== 'WEBSOCKET_AUTH_TOKEN' &&
    !isAllowedTokenAssignment(credentialAssignment[2]) &&
    (isTemplateFile(filePath) || !isDynamicAssignmentValue(credentialAssignment[2]))
  ) {
    findings.push({
      filePath,
      lineNumber,
      reason: isTemplateFile(filePath)
        ? `template credential ${credentialAssignment[1]} contains a non-placeholder value`
        : `credential assignment ${credentialAssignment[1]} contains a non-placeholder value`
    });
  }

  const anyAssignment = inspectLine.match(ANY_ENV_ASSIGNMENT);
  if (anyAssignment && burnedTokenHashes.has(hashTokenLiteral(normalizeAssignmentValue(anyAssignment[1])))) {
    findings.push({
      filePath,
      lineNumber,
      reason: 'known-burned secret literal re-committed'
    });
  }

  for (const jsonMatch of inspectLine.matchAll(JSON_CREDENTIAL_PROPERTY)) {
    if (
      isCredentialName(jsonMatch[1]) &&
      !isAllowedTokenAssignment(jsonMatch[2]) &&
      !isEnvReferenceProperty(jsonMatch[1], jsonMatch[2]) &&
      !isDynamicAssignmentValue(jsonMatch[2])
    ) {
      findings.push({
        filePath,
        lineNumber,
        reason: `JSON credential ${jsonMatch[1]} contains a non-placeholder value`
      });
    }
  }

  for (const propertyMatch of inspectLine.matchAll(OBJECT_CREDENTIAL_PROPERTY)) {
    if (
      isCredentialName(propertyMatch[1]) &&
      !isAllowedTokenAssignment(propertyMatch[2]) &&
      !isEnvReferenceProperty(propertyMatch[1], propertyMatch[2]) &&
      !isAllowedFixtureCredentialValue(filePath, propertyMatch[2]) &&
      !isDynamicAssignmentValue(propertyMatch[2])
    ) {
      findings.push({
        filePath,
        lineNumber,
        reason: `object credential ${propertyMatch[1]} contains a non-placeholder value`
      });
    }
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
    console.error(`[secret-scan] Found ${result.findings.length} secret finding(s):`);
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
  isCredentialName,
  isAllowedTokenAssignment,
  isBurnedHashFile,
  isTemplateFile,
  loadBurnedTokenHashes
};
