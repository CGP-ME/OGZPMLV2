const fs = require('fs');
const path = require('path');

const {
  isAdversarialMercuryProof,
  hasFallbackProof,
  isHotPath,
  hotPathEditedChanges,
  evaluateFinishGate,
  currentDiffFingerprint,
  resolveProofEvidencePath,
} = require('../trai_brain/claude-bridge/finish-gate');

describe('claude bridge finish gate', () => {
  const repoRoot = path.join(__dirname, '..');
  const tempDirs = [];
  const tempFiles = [];

  afterEach(() => {
    while (tempFiles.length) {
      fs.rmSync(tempFiles.pop(), { force: true });
    }
    while (tempDirs.length) {
      fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(repoRoot, 'test', '.tmp-claude-finish-gate-'));
    tempDirs.push(dir);
    return dir;
  }

  function makeHotFile() {
    const relPath = `core/.tmp-claude-proof-${process.pid}-${Date.now()}-${tempFiles.length}.js`;
    const absPath = path.join(repoRoot, relPath);
    fs.writeFileSync(absPath, `module.exports = ${tempFiles.length};\n`);
    tempFiles.push(absPath);
    return relPath;
  }

  test('classifies hot path files that require Mercury proof', () => {
    expect(isHotPath('core/OrderExecutor.js')).toBe(true);
    expect(isHotPath('brokers/AlpacaAdapter.js')).toBe(true);
    expect(isHotPath('run-empire-v2.js')).toBe(true);
    expect(isHotPath('ogz-meta/sessions/session.md')).toBe(false);
  });

  test('requires adversarial Mercury wording, not soft verification wording', () => {
    expect(isAdversarialMercuryProof({
      mercury: {
        completed: true,
        prompt: 'Mercury, break my fix. Find a concrete state where this lies, bypasses the gate, or creates new failure modes.',
      },
    })).toBe(true);

    expect(isAdversarialMercuryProof({
      mercury: {
        completed: true,
        prompt: 'Please verify the fix is correct and confirm it looks good.',
      },
    })).toBe(false);
  });

  test('rejects proof evidence paths outside the repo', () => {
    expect(resolveProofEvidencePath('/tmp/outside-proof.log')).toBeNull();
    expect(resolveProofEvidencePath('../outside-proof.log')).toBeNull();
    expect(resolveProofEvidencePath('ogz-meta/ledger/proof.log')).toContain('ogz-meta/ledger/proof.log');
  });

  test('requires explicit fallback/default review when suspicious lines exist', () => {
    expect(hasFallbackProof({}, ['const x = value || defaultValue;'])).toBe(false);
    expect(hasFallbackProof({
      fallbackDefaultScan: {
        completed: true,
        reviewedAddedLines: ['const x = value || defaultValue;'],
        noUnapprovedFallbacksOrDefaults: true,
      },
    }, ['const x = value || defaultValue;'])).toBe(true);
  });

  test('tracks legacy Claude-touched hot-path helper separately from final gate', () => {
    const dirtyFiles = [
      'core/OrderExecutor.js',
      'brokers/AlpacaAdapter.js',
      'ogz-meta/specs/intake-curation.md',
    ];

    expect(hotPathEditedChanges(dirtyFiles, ['ogz-meta/specs/intake-curation.md'])).toEqual([]);
    expect(hotPathEditedChanges(dirtyFiles, ['brokers/AlpacaAdapter.js'])).toEqual(['brokers/AlpacaAdapter.js']);
  });

  test('requires proof for hot-path git diff even when edit ledger did not record it', () => {
    const result = evaluateFinishGate([
      'core/OrderExecutor.js',
      'ogz-meta/specs/intake-curation.md',
    ], [
      'ogz-meta/specs/intake-curation.md',
    ], { proof: null });

    expect(result).toMatchObject({
      allowed: false,
      reason: 'missing_hot_path_proof',
      hotFiles: ['core/OrderExecutor.js'],
    });
  });

  test('rejects legacy top-level hot-path proof without per-file evidence', () => {
    const tmpDir = makeTempDir();
    const relLog = path.relative(repoRoot, path.join(tmpDir, 'p0.log'));
    fs.writeFileSync(path.join(tmpDir, 'p0.log'), 'P0 passed\n');

    const result = evaluateFinishGate(
      ['core/OrderExecutor.js'],
      ['core/OrderExecutor.js'],
      {
        proof: {
          changedFiles: ['core/OrderExecutor.js'],
          mercury: {
            completed: true,
            prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
            result: 'No bypass found.',
          },
          p0: {
            completed: true,
            exitCode: 0,
            command: 'node ogz-meta/gates/multi-runtime-gate-runner.js --p0',
            logPath: relLog,
          },
        },
      }
    );

    expect(result).toMatchObject({
      allowed: false,
      reason: 'hot_path_proof_incomplete',
      failures: ['missing_hot_path_file_proofs'],
    });
  });

  test('fails closed when finish gate is evaluated without an explicit edit scope', () => {
    const result = evaluateFinishGate(['core/OrderExecutor.js']);

    expect(result).toMatchObject({
      allowed: false,
      reason: 'missing_explicit_edit_scope',
      failures: ['missing_explicit_edit_scope'],
    });
  });

  test('can scope Stop hot-path proof to this session without weakening git mutation scope', () => {
    const dirtyFiles = [
      'core/OrderExecutor.js',
      'run-empire-v2.js',
      'ogz-meta/specs/intake-curation.md',
    ];

    const stopResult = evaluateFinishGate(
      dirtyFiles,
      ['ogz-meta/specs/intake-curation.md'],
      { hotPathScope: 'edited' }
    );
    expect(stopResult).toMatchObject({
      allowed: true,
      reason: 'no_hot_path_changes',
      hotFiles: [],
    });

    const gitMutationResult = evaluateFinishGate(
      dirtyFiles,
      ['ogz-meta/specs/intake-curation.md'],
      { proof: null }
    );
    expect(gitMutationResult).toMatchObject({
      allowed: false,
      reason: 'missing_hot_path_proof',
      hotFiles: ['core/OrderExecutor.js', 'run-empire-v2.js'],
    });
  });

  test('accepts complete per-file hot-path proof with Mercury result and P0 log', () => {
    const tmpDir = makeTempDir();
    const hotFile = makeHotFile();
    const relLog = path.relative(repoRoot, path.join(tmpDir, 'p0.log'));
    fs.writeFileSync(path.join(tmpDir, 'p0.log'), 'P0 passed\n');

    const result = evaluateFinishGate(
      [hotFile],
      [hotFile],
      {
        proof: {
          changedFiles: [hotFile],
          hotPathProofs: {
            [hotFile]: {
              diffFingerprint: currentDiffFingerprint(hotFile),
              mercury: {
                completed: true,
                prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
                result: 'No bypass found.',
              },
              p0: {
                completed: true,
                exitCode: 0,
                command: 'node ogz-meta/gates/multi-runtime-gate-runner.js --p0',
                logPath: relLog,
              },
            },
          },
        },
      }
    );

    expect(result).toMatchObject({
      allowed: true,
      reason: 'hot_path_proof_complete',
      hotFiles: [hotFile],
    });
  });

  test('rejects invalid evidence paths even when inline proof fields are present', () => {
    const tmpDir = makeTempDir();
    const hotFile = makeHotFile();
    const relLog = path.relative(repoRoot, path.join(tmpDir, 'p0.log'));
    const emptyPromptPath = path.relative(repoRoot, path.join(tmpDir, 'empty-prompt.md'));
    fs.writeFileSync(path.join(tmpDir, 'p0.log'), 'P0 passed\n');
    fs.writeFileSync(path.join(tmpDir, 'empty-prompt.md'), '');

    const result = evaluateFinishGate(
      [hotFile],
      [hotFile],
      {
        proof: {
          changedFiles: [hotFile],
          hotPathProofs: {
            [hotFile]: {
              diffFingerprint: currentDiffFingerprint(hotFile),
              mercury: {
                completed: true,
                prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
                promptPath: emptyPromptPath,
                result: 'No bypass found.',
                resultPath: '../outside-result.md',
              },
              p0: {
                completed: true,
                exitCode: 0,
                command: 'node ogz-meta/gates/multi-runtime-gate-runner.js --p0',
                logPath: relLog,
              },
            },
          },
        },
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      `invalid_proof_evidence_path:${hotFile}:mercury.promptPath`,
      `invalid_proof_evidence_path:${hotFile}:mercury.resultPath`,
    ]));
  });

  test('rejects stale per-file proof that does not match current diff fingerprint', () => {
    const tmpDir = makeTempDir();
    const hotFile = makeHotFile();
    const relLog = path.relative(repoRoot, path.join(tmpDir, 'p0.log'));
    fs.writeFileSync(path.join(tmpDir, 'p0.log'), 'P0 passed\n');

    const result = evaluateFinishGate(
      [hotFile],
      [hotFile],
      {
        proof: {
          changedFiles: [hotFile],
          hotPathProofs: {
            [hotFile]: {
              diffFingerprint: 'stale-proof-fingerprint',
              mercury: {
                completed: true,
                prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
                result: 'No bypass found.',
              },
              p0: {
                completed: true,
                exitCode: 0,
                command: 'node ogz-meta/gates/multi-runtime-gate-runner.js --p0',
                logPath: relLog,
              },
            },
          },
        },
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.failures).toContain(`stale_hot_path_file_proof:${hotFile}`);
  });

  test('rejects proof recorded before a second hot-path edit', () => {
    const tmpDir = makeTempDir();
    const hotFile = makeHotFile();
    const relLog = path.relative(repoRoot, path.join(tmpDir, 'p0.log'));
    const recordedFingerprint = currentDiffFingerprint(hotFile);
    fs.writeFileSync(path.join(tmpDir, 'p0.log'), 'P0 passed\n');

    fs.appendFileSync(path.join(repoRoot, hotFile), 'module.exports.secondEdit = true;\n');

    const result = evaluateFinishGate(
      [hotFile],
      [hotFile],
      {
        proof: {
          changedFiles: [hotFile],
          hotPathProofs: {
            [hotFile]: {
              diffFingerprint: recordedFingerprint,
              mercury: {
                completed: true,
                prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
                result: 'No bypass found.',
              },
              p0: {
                completed: true,
                exitCode: 0,
                command: 'node ogz-meta/gates/multi-runtime-gate-runner.js --p0',
                logPath: relLog,
              },
            },
          },
        },
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.failures).toContain(`stale_hot_path_file_proof:${hotFile}`);
  });
});
