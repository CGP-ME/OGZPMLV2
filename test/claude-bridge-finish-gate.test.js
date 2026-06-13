const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isAdversarialMercuryProof,
  isP0Proof,
  hasFallbackProof,
  isHotPath,
  hotPathEditedChanges,
  evaluateFinishGate,
} = require('../trai_brain/claude-bridge/finish-gate');

describe('claude bridge finish gate', () => {
  test('classifies hot path files that require Mercury and P0 proof', () => {
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

  test('requires P0 command, zero exit, and existing log path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-claude-finish-gate-'));
    const relLog = path.relative(path.join(__dirname, '..'), path.join(tmpDir, 'p0.log'));
    fs.writeFileSync(path.join(tmpDir, 'p0.log'), 'P0 passed\n');

    expect(isP0Proof({
      p0: {
        completed: true,
        exitCode: 0,
        command: 'node ogz-meta/gates/multi-runtime-gate-runner.js --p0',
        logPath: relLog,
      },
    })).toBe(true);

    expect(isP0Proof({
      p0: {
        completed: true,
        exitCode: 0,
        command: 'npm test',
        logPath: relLog,
      },
    })).toBe(false);
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
    ]);

    expect(result).toMatchObject({
      allowed: false,
      reason: 'missing_hot_path_proof',
      hotFiles: ['core/OrderExecutor.js'],
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
      ['ogz-meta/specs/intake-curation.md']
    );
    expect(gitMutationResult).toMatchObject({
      allowed: false,
      reason: 'missing_hot_path_proof',
      hotFiles: ['core/OrderExecutor.js', 'run-empire-v2.js'],
    });
  });
});
