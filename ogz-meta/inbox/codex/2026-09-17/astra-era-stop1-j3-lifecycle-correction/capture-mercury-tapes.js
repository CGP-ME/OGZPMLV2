#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { redactSensitiveText } = require('../../../../../trai_brain/mercury-bridge/run-ledger');

const packetDir = __dirname;
const repoRoot = path.resolve(packetDir, '..', '..', '..', '..', '..');
const requestedRunId = process.argv[2];
if (!requestedRunId) throw new Error('run id argument is required');

const ledgerPath = path.join(repoRoot, 'ogz-meta', 'cognition-history', 'mercury-runs', '2026-09-17.jsonl');
const ledgerLines = fs.readFileSync(ledgerPath, 'utf8').split(/\n/).filter(Boolean);
const sourceLine = ledgerLines.find((line) => JSON.parse(line).run_id === requestedRunId);
if (!sourceLine) throw new Error(`run ${requestedRunId} not found in ${ledgerPath}`);
const receipt = JSON.parse(sourceLine);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function redactTapeText(value) {
  return redactSensitiveText(value)
    .replace(/\b(NTFY_TOPIC\b\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]');
}

function collectRawReceipts(value, collected = new Map()) {
  if (!value || typeof value !== 'object') return collected;
  if (
    typeof value.path === 'string'
    && value.path.startsWith('ogz-meta/cognition-history/mercury-runs/raw/')
    && typeof value.sha256 === 'string'
  ) {
    collected.set(value.path, value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectRawReceipts(entry, collected);
  } else {
    for (const entry of Object.values(value)) collectRawReceipts(entry, collected);
  }
  return collected;
}

const tapesDir = path.join(packetDir, 'tapes');
const manifestPath = path.join(packetDir, 'TAPE-MANIFEST.json');
fs.mkdirSync(tapesDir, { recursive: true });

if (fs.existsSync(manifestPath)) {
  const previousManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const previousTape of previousManifest.tapes || []) {
    const previousPath = path.resolve(repoRoot, previousTape.committed_path);
    const relativeToTapes = path.relative(tapesDir, previousPath);
    if (relativeToTapes.startsWith('..') || path.isAbsolute(relativeToTapes)) {
      throw new Error(`refusing to replace evidence outside packet tapes: ${previousTape.committed_path}`);
    }
    if (!fs.existsSync(previousPath)) continue;
    const previousBytes = fs.readFileSync(previousPath);
    if (sha256(previousBytes) !== previousTape.committed_sha256) {
      throw new Error(`refusing to replace changed evidence: ${previousTape.committed_path}`);
    }
    fs.unlinkSync(previousPath);
  }
}

const tapeManifest = [];
for (const rawReceipt of collectRawReceipts(receipt).values()) {
  const sourcePath = path.join(repoRoot, rawReceipt.path);
  const originalBytes = fs.readFileSync(sourcePath);
  const originalSha256 = sha256(originalBytes);
  if (originalSha256 !== rawReceipt.sha256) {
    throw new Error(`raw tape hash mismatch for ${rawReceipt.path}`);
  }
  const redactedBytes = Buffer.from(redactTapeText(originalBytes.toString('utf8')), 'utf8');
  const committedName = `${path.basename(path.dirname(rawReceipt.path))}-${path.basename(rawReceipt.path)}.redacted`;
  const committedPath = path.join(tapesDir, committedName);
  fs.writeFileSync(committedPath, redactedBytes, { mode: 0o600 });
  tapeManifest.push({
    original_path: rawReceipt.path,
    original_sha256: originalSha256,
    original_bytes: originalBytes.length,
    committed_path: path.relative(repoRoot, committedPath).replace(/\\/g, '/'),
    committed_sha256: sha256(redactedBytes),
    committed_bytes: redactedBytes.length,
  });
}

const redactedLedgerBytes = Buffer.from(`${redactTapeText(sourceLine)}\n`, 'utf8');
const committedLedgerPath = path.join(tapesDir, 'run-ledger.redacted.jsonl');
fs.writeFileSync(committedLedgerPath, redactedLedgerBytes, { mode: 0o600 });
tapeManifest.push({
  original_path: path.relative(repoRoot, ledgerPath).replace(/\\/g, '/'),
  original_sha256: sha256(Buffer.from(sourceLine, 'utf8')),
  original_bytes: Buffer.byteLength(sourceLine, 'utf8'),
  committed_path: path.relative(repoRoot, committedLedgerPath).replace(/\\/g, '/'),
  committed_sha256: sha256(redactedLedgerBytes),
  committed_bytes: redactedLedgerBytes.length,
});

tapeManifest.sort((left, right) => left.original_path.localeCompare(right.original_path));
const manifest = {
  schema_version: 1,
  run_id: requestedRunId,
  generated_at: receipt.created_at || null,
  redactor: 'run-ledger.redactSensitiveText plus NTFY_TOPIC capability redaction',
  tapes: tapeManifest,
};
fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  { mode: 0o600 }
);
console.log(JSON.stringify({ run_id: requestedRunId, tapes: tapeManifest.length }, null, 2));
