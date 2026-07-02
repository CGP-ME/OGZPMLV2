'use strict';

const fs = require('fs');
const path = require('path');
const {
  PROOF_PATH,
  currentDiffFingerprint,
  isHotPath,
  isAdversarialMercuryProof,
  hasMercuryResult,
  isP0Proof,
  proofEvidenceFileHasText,
  proofFailuresForHotFiles,
  resolveProofEvidencePath,
} = require('./finish-gate');
const { REPO_ROOT } = require('./policy');

function loadJsonFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function loadExistingProof(proofPath) {
  if (!fs.existsSync(proofPath)) return {};
  return JSON.parse(fs.readFileSync(proofPath, 'utf8'));
}

function normalizeChangedFiles(payload) {
  if (!Array.isArray(payload?.changedFiles) || payload.changedFiles.length === 0) {
    throw new Error('record-proof requires non-empty changedFiles array');
  }
  const files = payload.changedFiles.map((file) => {
    if (typeof file !== 'string' || !file.trim()) {
      throw new Error('record-proof changedFiles entries must be non-empty strings');
    }
    return file.trim().replace(/\\/g, '/');
  });
  for (const file of files) {
    if (!isHotPath(file)) {
      throw new Error(`record-proof only accepts hot-path files: ${file}`);
    }
  }
  return [...new Set(files)];
}

function validateHotPathProof(file, fileProof) {
  if (!fileProof || typeof fileProof !== 'object' || Array.isArray(fileProof)) {
    throw new Error(`record-proof missing proof object for ${file}`);
  }
  if (!isAdversarialMercuryProof(fileProof)) {
    throw new Error(`record-proof missing adversarial Mercury prompt for ${file}`);
  }
  if (!hasMercuryResult(fileProof)) {
    throw new Error(`record-proof missing Mercury result for ${file}`);
  }
  if (!isP0Proof(fileProof)) {
    throw new Error(`record-proof missing P0 command/log proof for ${file}`);
  }
  validateEvidencePaths(file, fileProof);

  const failures = proofFailuresForHotFiles({
    changedFiles: [file],
    hotPathProofs: { [file]: fileProof },
  }, [file]).failures;
  if (failures.length > 0) {
    throw new Error(`record-proof rejected ${file}: ${failures.join(', ')}`);
  }
}

function validateEvidencePaths(file, fileProof) {
  const mercury = fileProof?.mercury || {};
  for (const fieldName of ['promptPath', 'resultPath', 'responsePath']) {
    validateOptionalEvidencePath(file, `mercury.${fieldName}`, mercury[fieldName]);
  }
  validateRequiredEvidencePath(file, 'p0.logPath', fileProof?.p0?.logPath);
}

function validateOptionalEvidencePath(file, fieldName, proofPath) {
  if (proofPath === undefined || proofPath === null || proofPath === '') return;
  validateRequiredEvidencePath(file, fieldName, proofPath);
}

function validateRequiredEvidencePath(file, fieldName, proofPath) {
  if (!proofPath || typeof proofPath !== 'string') {
    throw new Error(`record-proof ${fieldName} is required for ${file}`);
  }
  if (!resolveProofEvidencePath(proofPath)) {
    throw new Error(`record-proof ${fieldName} must stay inside repo for ${file}`);
  }
  if (!proofEvidenceFileHasText(proofPath)) {
    throw new Error(`record-proof ${fieldName} must point to a non-empty file for ${file}`);
  }
}

function validateProofPayload(payload) {
  const changedFiles = normalizeChangedFiles(payload);
  const hotPathProofs = payload.hotPathProofs;
  if (!hotPathProofs || typeof hotPathProofs !== 'object' || Array.isArray(hotPathProofs)) {
    throw new Error('record-proof requires hotPathProofs object keyed by file path');
  }
  for (const file of changedFiles) {
    if (hotPathProofs[file] && typeof hotPathProofs[file] === 'object' && !Array.isArray(hotPathProofs[file])) {
      const diffFingerprint = currentDiffFingerprint(file);
      if (!diffFingerprint) {
        throw new Error(`record-proof cannot prove unchanged hot-path file: ${file}`);
      }
      hotPathProofs[file] = {
        ...hotPathProofs[file],
        diffFingerprint,
      };
    }
    validateHotPathProof(file, hotPathProofs[file]);
  }
  return changedFiles;
}

function saveProof(proofPath, proof) {
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  const tmpPath = `${proofPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(proof, null, 2));
  fs.renameSync(tmpPath, proofPath);
}

function recordProof(payload, options = {}) {
  const proofPath = options.proofPath || PROOF_PATH;
  const changedFiles = validateProofPayload(payload);
  const existing = loadExistingProof(proofPath);
  const existingChanged = Array.isArray(existing.changedFiles) ? existing.changedFiles : [];
  const next = {
    ...existing,
    changeset: payload.changeset || existing.changeset || 'hot-path proof',
    changedFiles: [...new Set([...existingChanged, ...changedFiles])],
    hotPathProofs: {
      ...(existing.hotPathProofs && typeof existing.hotPathProofs === 'object' && !Array.isArray(existing.hotPathProofs)
        ? existing.hotPathProofs
        : {}),
    },
  };

  for (const file of changedFiles) {
    next.hotPathProofs[file] = payload.hotPathProofs[file];
  }

  saveProof(proofPath, next);
  return next;
}

function run() {
  try {
    const inputPath = process.argv[3];
    if (!inputPath) {
      throw new Error('Usage: node trai_brain/claude-bridge/cli.js record-proof <proof-payload.json>');
    }
    const proof = recordProof(loadJsonFile(inputPath));
    process.stdout.write(JSON.stringify({
      ok: true,
      proofPath: path.relative(REPO_ROOT, PROOF_PATH),
      changedFiles: proof.changedFiles,
    }, null, 2));
    process.stdout.write('\n');
  } catch (error) {
    process.stderr.write(`BLOCKED (claude-bridge record-proof): ${error.message}\n`);
    process.exit(2);
  }
}

if (require.main === module) run();

module.exports = {
  validateHotPathProof,
  validateProofPayload,
  recordProof,
  run,
};
