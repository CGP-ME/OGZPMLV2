'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./policy');
const { readHookInput } = require('./hook-input');
const editLedger = require('./edit-ledger');
const taskContract = require('./task-contract');

const PROOF_PATH = path.join(REPO_ROOT, '.claude', 'session-state', 'hot-path-proof.json');
const HOT_PATH_PREFIXES = [
  'core/',
  'brokers/',
  'modules/',
  'foundation/',
  'config/',
  'public/js/',
  'public/unified-dashboard',
  'run-empire-v2.js',
  'kraken_adapter_simple.js',
  'ogzprime-ssl-server.js',
  'start-ogzprime.sh',
];

const ADVERSARIAL_TERMS = [
  /break my fix/i,
  /find a (concrete )?state/i,
  /construct/i,
  /crash/i,
  /lie|lies|lying/i,
  /bypass/i,
  /corrupt/i,
  /silent/i,
  /new failure modes?/i,
  /underlying mechanism|root mechanism/i,
];

const SOFT_VERIFY_TERMS = [
  /is this correct/i,
  /verify (that )?(this|the fix)/i,
  /confirm (that )?(this|the fix)/i,
  /does this look/i,
  /beam me up/i,
];

const SUSPICIOUS_ADDED_LINE = [
  /\bdefault\b/i,
  /\bfallback\b/i,
  /\|\|/,
  /\?\?/,
  /catch\s*\([^)]*\)\s*{\s*}/,
  /catch\s*\([^)]*\)\s*{\s*(console\.(warn|error|log)|return\b|continue\b|;)/,
];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function isTrackedPath(filePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', filePath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch (_) {
    return false;
  }
}

function currentDiffFingerprint(filePath) {
  const diff = git(['diff', '--binary', 'HEAD', '--', filePath]);
  if (diff) {
    return sha256(`tracked\0${filePath}\0${diff}`);
  }
  if (isTrackedPath(filePath)) return null;

  const abs = path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const content = fs.readFileSync(abs);
  return sha256(Buffer.concat([
    Buffer.from(`untracked\0${filePath}\0`),
    content,
  ]));
}

function changedFiles() {
  return git(['diff', '--name-only', 'HEAD', '--'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stagedFiles() {
  return git(['diff', '--cached', '--name-only', '--'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function untrackedFilesForPaths(paths = []) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  return git(['ls-files', '--others', '--exclude-standard', '--', ...paths])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function changedFilesForPaths(paths = []) {
  if (!Array.isArray(paths) || paths.length === 0) return changedFiles();
  const changed = git(['diff', '--name-only', 'HEAD', '--', ...paths])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set([...changed, ...untrackedFilesForPaths(paths)])];
}

function isHotPath(filePath) {
  return HOT_PATH_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

function hotPathChanges(files = changedFiles()) {
  return files.filter(isHotPath);
}

function editedChangedFiles(files = changedFiles(), editedFiles = []) {
  const edited = new Set(editedFiles);
  return files.filter((file) => edited.has(file));
}

function hotPathEditedChanges(files = changedFiles(), editedFiles = []) {
  return editedChangedFiles(files, editedFiles).filter(isHotPath);
}

function loadProof() {
  if (!fs.existsSync(PROOF_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(PROOF_PATH, 'utf8'));
}

function resolveProofEvidencePath(proofPath) {
  if (!proofPath || typeof proofPath !== 'string') return null;
  const abs = path.resolve(REPO_ROOT, proofPath);
  const rel = path.relative(REPO_ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

function proofEvidenceFileHasText(proofPath) {
  const abs = resolveProofEvidencePath(proofPath);
  return Boolean(abs && fs.existsSync(abs) && fs.readFileSync(abs, 'utf8').trim());
}

function proofCoversFiles(proof, files) {
  const covered = new Set(Array.isArray(proof?.changedFiles) ? proof.changedFiles : []);
  return files.every((file) => covered.has(file));
}

function readProofText(proofSection, fieldName) {
  const text = [];
  if (proofSection?.prompt) text.push(String(proofSection.prompt));
  const proofPath = proofSection?.[fieldName];
  if (proofPath) {
    const abs = resolveProofEvidencePath(proofPath);
    if (abs && fs.existsSync(abs)) text.push(fs.readFileSync(abs, 'utf8'));
  }
  return text.join('\n');
}

function isAdversarialMercuryProof(proof) {
  const mercury = proof?.mercury || {};
  const promptText = readProofText(mercury, 'promptPath');
  if (!promptText) return false;
  if (SOFT_VERIFY_TERMS.some((term) => term.test(promptText))) return false;
  const hitCount = ADVERSARIAL_TERMS.filter((term) => term.test(promptText)).length;
  return hitCount >= 3 && mercury.completed === true;
}

function hasMercuryResult(proof) {
  const mercury = proof?.mercury || {};
  if (typeof mercury.result === 'string' && mercury.result.trim()) return true;
  if (typeof mercury.response === 'string' && mercury.response.trim()) return true;
  for (const fieldName of ['resultPath', 'responsePath']) {
    const proofPath = mercury[fieldName];
    if (!proofPath) continue;
    if (proofEvidenceFileHasText(proofPath)) return true;
  }
  return false;
}

function perFileProofFor(proof, file) {
  if (!proof?.hotPathProofs || typeof proof.hotPathProofs !== 'object' || Array.isArray(proof.hotPathProofs)) {
    return null;
  }
  return proof.hotPathProofs[file] || null;
}

function hasPerFileProofs(proof) {
  return proof?.hotPathProofs && typeof proof.hotPathProofs === 'object' && !Array.isArray(proof.hotPathProofs);
}

function invalidEvidencePathFields(proof) {
  const invalid = [];
  const mercury = proof?.mercury || {};
  for (const fieldName of ['promptPath', 'resultPath', 'responsePath']) {
    const proofPath = mercury[fieldName];
    if (proofPath === undefined || proofPath === null || proofPath === '') continue;
    if (typeof proofPath !== 'string' || !proofEvidenceFileHasText(proofPath)) {
      invalid.push(`mercury.${fieldName}`);
    }
  }

  return invalid;
}

function proofMatchesCurrentDiff(fileProof, file) {
  return typeof fileProof?.diffFingerprint === 'string'
    && fileProof.diffFingerprint === currentDiffFingerprint(file);
}

function addedDiffLines(files) {
  if (files.length === 0) return [];
  const diff = git(['diff', '--unified=0', 'HEAD', '--', ...files]);
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function suspiciousFallbackLines(files) {
  return addedDiffLines(files).filter((line) => (
    SUSPICIOUS_ADDED_LINE.some((pattern) => pattern.test(line))
  ));
}

function hasFallbackProof(proof, suspiciousLines) {
  if (suspiciousLines.length === 0) return true;
  const scan = proof?.fallbackDefaultScan || {};
  return scan.completed === true
    && Array.isArray(scan.reviewedAddedLines)
    && scan.reviewedAddedLines.length >= suspiciousLines.length
    && scan.noUnapprovedFallbacksOrDefaults === true;
}

function proofFailuresForHotFiles(proof, hotFiles) {
  const failures = [];
  if (!proofCoversFiles(proof, hotFiles)) {
    failures.push('proof_changed_files_do_not_cover_current_hot_path_diff');
  }

  if (!hasPerFileProofs(proof)) {
    const suspiciousLines = suspiciousFallbackLines(hotFiles);
    failures.push('missing_hot_path_file_proofs');
    return { failures, suspiciousLines };
  }

  const allSuspiciousLines = [];
  for (const file of hotFiles) {
    const fileProof = perFileProofFor(proof, file);
    const suspiciousLines = suspiciousFallbackLines([file]);
    allSuspiciousLines.push(...suspiciousLines);
    if (!fileProof) {
      failures.push(`missing_hot_path_file_proof:${file}`);
      continue;
    }
    if (!proofMatchesCurrentDiff(fileProof, file)) {
      failures.push(`stale_hot_path_file_proof:${file}`);
    }
    if (!isAdversarialMercuryProof(fileProof) || !hasMercuryResult(fileProof)) {
      failures.push(`missing_adversarial_mercury_break_my_fix_proof:${file}`);
    }
    for (const fieldName of invalidEvidencePathFields(fileProof)) {
      failures.push(`invalid_proof_evidence_path:${file}:${fieldName}`);
    }
    if (!hasFallbackProof(fileProof, suspiciousLines)) {
      failures.push(`unapproved_fallback_or_default_added_lines:${file}`);
    }
  }

  return { failures, suspiciousLines: allSuspiciousLines };
}

function evaluateFinishGate(files = changedFiles(), editedFiles, options = {}) {
  if (!Array.isArray(editedFiles)) {
    return {
      allowed: false,
      reason: 'missing_explicit_edit_scope',
      failures: ['missing_explicit_edit_scope'],
      hotFiles: [],
    };
  }

  const allFiles = files;
  const claudeChangedFiles = editedChangedFiles(allFiles, editedFiles);
  const taskViolations = taskContract.changedFilesOutsideContract(claudeChangedFiles);
  if (taskViolations.length > 0) {
    return {
      allowed: false,
      reason: 'task_contract_diff_outside_write_scope',
      failures: ['task_contract_diff_outside_write_scope'],
      hotFiles: [],
      taskViolations,
    };
  }

  const hotFiles = options.hotPathScope === 'edited'
    ? hotPathEditedChanges(allFiles, editedFiles)
    : hotPathChanges(allFiles);
  if (hotFiles.length === 0) {
    return { allowed: true, reason: 'no_hot_path_changes', hotFiles };
  }

  const proof = Object.prototype.hasOwnProperty.call(options, 'proof')
    ? options.proof
    : loadProof();
  if (!proof) {
    return { allowed: false, reason: 'missing_hot_path_proof', hotFiles };
  }

  const { failures, suspiciousLines } = proofFailuresForHotFiles(proof, hotFiles);

  return {
    allowed: failures.length === 0,
    reason: failures.length === 0 ? 'hot_path_proof_complete' : 'hot_path_proof_incomplete',
    failures,
    hotFiles,
    suspiciousLines,
  };
}

function run() {
  let result;
  try {
    const input = readHookInput('claude-bridge finish gate');
    const sessionId = editLedger.sessionIdFromHookInput(input);
    if (!sessionId) {
      throw new Error('missing session identity. Finish gate policy fails closed.');
    }
    result = evaluateFinishGate(
      changedFiles(),
      editLedger.listEditedFiles({ sessionId }),
      { hotPathScope: 'edited' }
    );
  } catch (error) {
    process.stderr.write(`BLOCKED (claude-bridge finish gate): ${error.message}\n`);
    process.exit(2);
  }

  if (!result.allowed) {
    process.stderr.write(
      `BLOCKED (claude-bridge finish gate): ${result.reason}\n` +
      `Hot-path files:\n${result.hotFiles.map((file) => `  - ${file}`).join('\n')}\n` +
      `Failures:\n${(result.failures || [result.reason]).map((failure) => `  - ${failure}`).join('\n')}\n` +
      `Required proof file: .claude/session-state/hot-path-proof.json\n`
    );
    if (result.taskViolations?.length) {
      process.stderr.write(
        `Task-contract diff violations:\n${result.taskViolations.map((file) => `  - ${file}`).join('\n')}\n`
      );
    }
    if (result.suspiciousLines?.length) {
      process.stderr.write(
        `Suspicious added fallback/default lines:\n${result.suspiciousLines.map((line) => `  + ${line}`).join('\n')}\n`
      );
    }
    process.exit(2);
  }

  process.exit(0);
}

if (require.main === module) run();

module.exports = {
  PROOF_PATH,
  HOT_PATH_PREFIXES,
  changedFiles,
  changedFilesForPaths,
  currentDiffFingerprint,
  stagedFiles,
  isHotPath,
  hotPathChanges,
  editedChangedFiles,
  hotPathEditedChanges,
  isAdversarialMercuryProof,
  hasMercuryResult,
  resolveProofEvidencePath,
  proofEvidenceFileHasText,
  invalidEvidencePathFields,
  proofMatchesCurrentDiff,
  proofFailuresForHotFiles,
  suspiciousFallbackLines,
  hasFallbackProof,
  evaluateFinishGate,
  run,
  mutationPatterns: SUSPICIOUS_ADDED_LINE,
};
