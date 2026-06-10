const fs = require('fs');

const editLedger = require('../trai_brain/claude-bridge/edit-ledger');
const preEdit = require('../trai_brain/claude-bridge/pre-edit');
const postEdit = require('../trai_brain/claude-bridge/post-edit');

function runHookWithInput(handler, input) {
  const originalReadFileSync = fs.readFileSync;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  process.exit = jest.fn((code = 0) => { throw Object.assign(new Error('exit'), { code }); });
  process.stdout.write = jest.fn();
  process.stderr.write = jest.fn();
  fs.readFileSync = jest.fn((file, ...args) => {
    if (file === 0) return JSON.stringify(input);
    return originalReadFileSync(file, ...args);
  });

  try {
    handler.run();
  } catch (error) {
    if (error.message !== 'exit') throw error;
  } finally {
    fs.readFileSync = originalReadFileSync;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

describe('claude bridge edit ledger', () => {
  beforeEach(() => {
    editLedger.reset();
  });

  test('pre-edit gate does not record an edit before the tool succeeds', () => {
    runHookWithInput(preEdit, {
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });

    expect(editLedger.listEditedFiles()).toEqual([]);
  });

  test('post-edit records successful edit targets', () => {
    runHookWithInput(postEdit, {
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });

    expect(editLedger.listEditedFiles()).toEqual(['test/claude-bridge-edit-ledger.test.js']);
  });
});
