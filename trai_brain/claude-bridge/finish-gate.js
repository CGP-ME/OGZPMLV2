'use strict';

const fs = require('fs');
const path = require('path');
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

function changedFiles() {
  return git(['diff', '--name-only', 'HEAD', '--'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
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

function proofCoversFiles(proof, files) {
  const covered = new Set(Array.isArray(proof?.changedFiles) ? proof.changedFiles : []);
  return files.every((file) => covered.has(file));
}

function readProofText(proofSection, fieldName) {
  const text = [];
  if (proofSection?.prompt) text.push(String(proofSection.prompt));
  const proofPath = proofSection?.[fieldName];
  if (proofPath) {
    const abs = path.isAbsolute(proofPath) ? proofPath : path.join(REPO_ROOT, proofPath);
    if (fs.existsSync(abs)) text.push(fs.readFileSync(abs, 'utf8'));
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

function isP0Proof(proof) {
  const p0 = proof?.p0 || {};
  const command = String(p0.command || '');
  const logPath = p0.logPath ? path.join(REPO_ROOT, p0.logPath) : null;
  return p0.completed === true
    && p0.exitCode === 0
    && command.includes('node ogz-meta/gates/multi-runtime-gate-runner.js --p0')
    && logPath
    && fs.existsSync(logPath);
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

  const proof = loadProof();
  if (!proof) {
    return { allowed: false, reason: 'missing_hot_path_proof', hotFiles };
  }

  const suspiciousLines = suspiciousFallbackLines(hotFiles);
  const failures = [];
  if (!proofCoversFiles(proof, hotFiles)) failures.push('proof_changed_files_do_not_cover_current_hot_path_diff');
  if (!isAdversarialMercuryProof(proof)) failures.push('missing_adversarial_mercury_break_my_fix_proof');
  if (!isP0Proof(proof)) failures.push('missing_p0_gate_proof');
  if (!hasFallbackProof(proof, suspiciousLines)) failures.push('unapproved_fallback_or_default_added_lines');

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
  isHotPath,
  hotPathChanges,
  editedChangedFiles,
  hotPathEditedChanges,
  isAdversarialMercuryProof,
  isP0Proof,
  suspiciousFallbackLines,
  hasFallbackProof,
  evaluateFinishGate,
  run,
  mutationPatterns: SUSPICIOUS_ADDED_LINE,
};
