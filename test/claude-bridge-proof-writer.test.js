const fs = require('fs');
const path = require('path');

const {
  validateProofPayload,
  recordProof,
} = require('../trai_brain/claude-bridge/proof-writer');
const {
  currentDiffFingerprint,
} = require('../trai_brain/claude-bridge/finish-gate');

const REPO_ROOT = path.join(__dirname, '..');
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
  const dir = fs.mkdtempSync(path.join(REPO_ROOT, 'test', '.tmp-claude-proof-writer-'));
  tempDirs.push(dir);
  return dir;
}

function makeHotFile() {
  const relPath = `core/.tmp-claude-proof-writer-${process.pid}-${Date.now()}-${tempFiles.length}.js`;
  const absPath = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(absPath, `module.exports = ${tempFiles.length};\n`);
  tempFiles.push(absPath);
  return relPath;
}

function validFileProof() {
  return {
    mercury: {
      completed: true,
      prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
      result: 'No bypass found with file:line evidence.',
    },
    fallbackDefaultScan: {
      completed: true,
      noUnapprovedFallbacksOrDefaults: true,
      reviewedAddedLines: [],
    },
  };
}

describe('claude bridge proof writer', () => {
  test('rejects blank paperwork for a hot-path file', () => {
    const hotFile = makeHotFile();
    expect(() => validateProofPayload({
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: {},
      },
    })).toThrow(/missing adversarial Mercury prompt/);
  });

  test('rejects hot-path proof without a Mercury result', () => {
    const hotFile = makeHotFile();
    const proof = validFileProof();
    delete proof.mercury.result;

    expect(() => validateProofPayload({
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: proof,
      },
    })).toThrow(/missing Mercury result/);
  });

  test('rejects outside Mercury prompt path even when inline prompt is valid', () => {
    const hotFile = makeHotFile();
    const proof = validFileProof();
    proof.mercury.promptPath = '/tmp/outside-mercury-prompt.md';

    expect(() => validateProofPayload({
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: proof,
      },
    })).toThrow(/mercury\.promptPath must stay inside repo/);
  });

  test('rejects outside Mercury result path even when inline result is valid', () => {
    const hotFile = makeHotFile();
    const proof = validFileProof();
    proof.mercury.resultPath = '../outside-mercury-result.md';

    expect(() => validateProofPayload({
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: proof,
      },
    })).toThrow(/mercury\.resultPath must stay inside repo/);
  });

  test('rejects non-hot files', () => {
    expect(() => validateProofPayload({
      changedFiles: ['docs/readme.md'],
      hotPathProofs: {
        'docs/readme.md': validFileProof(),
      },
    })).toThrow(/only accepts hot-path files/);
  });

  test('writes merged per-file proof without touching live session-state in tests', () => {
    const tmpDir = makeTempDir();
    const hotFile = makeHotFile();
    const proofPath = path.join(tmpDir, 'hot-path-proof.json');

    const written = recordProof({
      changeset: 'test bridge proof',
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: validFileProof(),
      },
    }, { proofPath });

    expect(written.changedFiles).toEqual([hotFile]);
    expect(written.hotPathProofs[hotFile].mercury.result).toContain('No bypass');
    expect(written.hotPathProofs[hotFile].diffFingerprint).toBe(currentDiffFingerprint(hotFile));
    expect(JSON.parse(fs.readFileSync(proofPath, 'utf8')).hotPathProofs[hotFile]).toBeTruthy();
  });

  test('overwrites stale proof for a re-recorded hot-path file with current diff fingerprint', () => {
    const tmpDir = makeTempDir();
    const hotFile = makeHotFile();
    const proofPath = path.join(tmpDir, 'hot-path-proof.json');
    fs.writeFileSync(proofPath, JSON.stringify({
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: {
          diffFingerprint: 'old-fingerprint',
          mercury: {
            completed: true,
            prompt: 'Mercury, break my fix. Find a concrete state where this lies, construct a bypass, and name new failure modes in the underlying mechanism.',
            result: 'Old result.',
          },
        },
      },
    }));

    const written = recordProof({
      changedFiles: [hotFile],
      hotPathProofs: {
        [hotFile]: validFileProof(),
      },
    }, { proofPath });

    expect(written.hotPathProofs[hotFile].diffFingerprint).toBe(currentDiffFingerprint(hotFile));
    expect(written.hotPathProofs[hotFile].diffFingerprint).not.toBe('old-fingerprint');
  });
});
