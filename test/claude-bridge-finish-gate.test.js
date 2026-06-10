const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isAdversarialMercuryProof,
  isP0Proof,
  hasFallbackProof,
  isHotPath,
  hotPathEditedChanges,
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

  test('gates only Claude-touched hot-path dirty files, not ambient dirty files', () => {
    const dirtyFiles = [
      'core/OrderExecutor.js',
      'brokers/AlpacaAdapter.js',
      'ogz-meta/specs/intake-curation.md',
    ];

    expect(hotPathEditedChanges(dirtyFiles, ['ogz-meta/specs/intake-curation.md'])).toEqual([]);
    expect(hotPathEditedChanges(dirtyFiles, ['brokers/AlpacaAdapter.js'])).toEqual(['brokers/AlpacaAdapter.js']);
  });
});
