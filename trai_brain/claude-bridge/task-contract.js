'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, relToRepo } = require('./policy');

const TASK_CONTRACT_PATH = path.join(REPO_ROOT, '.claude', 'session-state', 'task-contract.json');
const VALID_STATUSES = new Set(['active', 'complete', 'blocked', 'paused']);

function readContract() {
  if (!fs.existsSync(TASK_CONTRACT_PATH)) {
    return { active: false, reason: 'missing_task_contract' };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(TASK_CONTRACT_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`task contract is not valid JSON: ${error.message}`);
  }

  validateContractShape(parsed);
  if (parsed.status !== 'active') {
    return { active: false, reason: `task_contract_${parsed.status}`, contract: parsed };
  }

  return { active: true, contract: parsed };
}

function validateStringArray(contract, key) {
  if (!Array.isArray(contract[key]) || contract[key].length === 0) {
    throw new Error(`active task contract requires non-empty ${key}`);
  }
  for (const value of contract[key]) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`active task contract ${key} contains a non-string entry`);
    }
  }
}

function validateOptionalStringArray(contract, key) {
  if (contract[key] === undefined) return;
  if (!Array.isArray(contract[key])) {
    throw new Error(`task contract ${key} must be an array when present`);
  }
  for (const value of contract[key]) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`task contract ${key} contains a non-string entry`);
    }
  }
}

function validateContractShape(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('task contract must be an object');
  }
  if (contract.version !== 1) {
    throw new Error('task contract version must be 1');
  }
  if (typeof contract.taskId !== 'string' || contract.taskId.trim() === '') {
    throw new Error('task contract taskId must be a non-empty string');
  }
  if (!VALID_STATUSES.has(contract.status)) {
    throw new Error(`task contract status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  if (contract.status !== 'active') return;

  validateStringArray(contract, 'readAllowedPaths');
  validateStringArray(contract, 'writeAllowedPaths');
  validateStringArray(contract, 'bashAllowedPatterns');

  validateOptionalStringArray(contract, 'blockedPaths');
  validateOptionalStringArray(contract, 'bashBlockedPatterns');
  if (contract.requiredProof !== undefined && (typeof contract.requiredProof !== 'object' || Array.isArray(contract.requiredProof))) {
    throw new Error('task contract requiredProof must be an object when present');
  }
}

function normalizeRelPath(value) {
  const result = relToRepo(value);
  if (!result || result.outsideRepo || !result.rel) {
    return { outsideRepo: true, rel: null };
  }
  return { outsideRepo: false, rel: result.rel };
}

function matchesPathPattern(relPath, pattern) {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized === '*') return true;
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -2);
    return relPath.startsWith(prefix);
  }
  if (normalized.endsWith('/')) {
    return relPath.startsWith(normalized);
  }
  return relPath === normalized || relPath.startsWith(`${normalized}/`);
}

function blockedPathMatch(contract, relPath) {
  const blocked = Array.isArray(contract.blockedPaths) ? contract.blockedPaths : [];
  return blocked.find((pattern) => matchesPathPattern(relPath, pattern));
}

function allowedPathMatch(contract, mode, relPath) {
  const key = mode === 'write' ? 'writeAllowedPaths' : 'readAllowedPaths';
  return contract[key].find((pattern) => matchesPathPattern(relPath, pattern));
}

function checkPathAllowed(mode, targetPath) {
  const state = readContract();
  if (!state.active) {
    return { allowed: true, reason: state.reason, active: false };
  }

  const normalized = normalizeRelPath(targetPath);
  if (normalized.outsideRepo) {
    return { allowed: false, reason: 'task_contract_outside_repo', active: true, taskId: state.contract.taskId, path: targetPath };
  }

  const blocked = blockedPathMatch(state.contract, normalized.rel);
  if (blocked) {
    return {
      allowed: false,
      reason: 'task_contract_blocked_path',
      active: true,
      taskId: state.contract.taskId,
      path: normalized.rel,
      matched: blocked,
    };
  }

  const allowed = allowedPathMatch(state.contract, mode, normalized.rel);
  if (!allowed) {
    return {
      allowed: false,
      reason: `task_contract_${mode}_not_allowed`,
      active: true,
      taskId: state.contract.taskId,
      path: normalized.rel,
    };
  }

  return {
    allowed: true,
    reason: `task_contract_${mode}_allowed`,
    active: true,
    taskId: state.contract.taskId,
    path: normalized.rel,
    matched: allowed,
  };
}

function compilePatterns(patterns, fieldName) {
  return patterns.map((pattern) => {
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      throw new Error(`active task contract ${fieldName} contains a non-string entry`);
    }
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new Error(`active task contract ${fieldName} has invalid regex ${pattern}: ${error.message}`);
    }
  });
}

function checkBashAllowed(command) {
  const state = readContract();
  if (!state.active) {
    return { allowed: true, reason: state.reason, active: false };
  }

  const cmd = String(command || '');
  const blockedPatterns = compilePatterns(state.contract.bashBlockedPatterns || [], 'bashBlockedPatterns');
  const blocked = blockedPatterns.find((pattern) => pattern.test(cmd));
  if (blocked) {
    return {
      allowed: false,
      reason: 'task_contract_bash_blocked',
      active: true,
      taskId: state.contract.taskId,
      matched: blocked.source,
    };
  }

  const allowedPatterns = compilePatterns(state.contract.bashAllowedPatterns, 'bashAllowedPatterns');
  const allowed = allowedPatterns.find((pattern) => pattern.test(cmd));
  if (!allowed) {
    return {
      allowed: false,
      reason: 'task_contract_bash_not_allowed',
      active: true,
      taskId: state.contract.taskId,
    };
  }

  return {
    allowed: true,
    reason: 'task_contract_bash_allowed',
    active: true,
    taskId: state.contract.taskId,
    matched: allowed.source,
  };
}

function changedFilesOutsideContract(files) {
  const state = readContract();
  if (!state.active) return [];
  return files.filter((file) => !checkPathAllowed('write', file).allowed);
}

function writeContract(contract) {
  validateContractShape(contract);
  fs.mkdirSync(path.dirname(TASK_CONTRACT_PATH), { recursive: true });
  fs.writeFileSync(TASK_CONTRACT_PATH, JSON.stringify(contract, null, 2));
}

function clearContract() {
  if (fs.existsSync(TASK_CONTRACT_PATH)) fs.unlinkSync(TASK_CONTRACT_PATH);
}

function run() {
  try {
    const state = readContract();
    process.stdout.write(JSON.stringify({
      ok: true,
      active: state.active,
      reason: state.reason || 'task_contract_active',
      taskId: state.contract?.taskId || null,
    }));
    process.exit(0);
  } catch (error) {
    process.stderr.write(`BLOCKED (claude task-contract): ${error.message}\n`);
    process.exit(2);
  }
}

if (require.main === module) run();

module.exports = {
  TASK_CONTRACT_PATH,
  readContract,
  checkPathAllowed,
  checkBashAllowed,
  changedFilesOutsideContract,
  writeContract,
  clearContract,
  matchesPathPattern,
  run,
};
