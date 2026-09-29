'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const target = 'core/OrderExecutor.js';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const {collectExplicitTargetCorpus} = require(path.join(root, 'trai_brain/mercury-bridge/evidence-ingestion'));
const corpus = collectExplicitTargetCorpus({repoRoot: root, explicitPaths: [target]});
const candidate = cp.execFileSync('git', ['show', 'e6d80e0a12ad8051cf81a09e7c104985d64502e0:' + target], {cwd: root});
const working = fs.readFileSync(path.join(root, target));
const captured = corpus.artifacts.find(a => a.kind === 'source');
const result = {
  target, candidateRef: 'e6d80e0a12ad8051cf81a09e7c104985d64502e0',
  candidateSha256: hash(candidate), workingSha256: hash(working),
  capturedSha256: captured.sha256, capturedRef: captured.source_ref,
  capturedMatchesWorking: captured.sha256 === hash(working),
  capturedMatchesCandidate: captured.sha256 === hash(candidate),
  candidateCapBasis: candidate.toString().match(/const absoluteCapSizeUsd = ([^;]+);/)[1],
  capturedCapBasis: captured.content.match(/const absoluteCapSizeUsd = ([^;]+);/)[1],
  boundary: 'Actual existing corpus collector, read only; no provider request or source mutation',
};
fs.writeFileSync(path.join(packet, 'private/reproduction.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
