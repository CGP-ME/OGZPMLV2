const fs = require('fs');

const editLedger = require('../trai_brain/claude-bridge/edit-ledger');
const readLedger = require('../trai_brain/claude-bridge/read-ledger');
const preEdit = require('../trai_brain/claude-bridge/pre-edit');
const postRead = require('../trai_brain/claude-bridge/post-read');
const postEdit = require('../trai_brain/claude-bridge/post-edit');

function runHookWithInput(handler, input) {
  const originalReadFileSync = fs.readFileSync;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const output = { stdout: '', stderr: '', exitCode: null };

  process.exit = jest.fn((code = 0) => {
    output.exitCode = code;
    throw Object.assign(new Error('exit'), { code });
  });
  process.stdout.write = jest.fn((value) => { output.stdout += String(value); });
  process.stderr.write = jest.fn((value) => { output.stderr += String(value); });
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

  return output;
}

describe('claude bridge edit ledger', () => {
  beforeEach(() => {
    editLedger.reset();
    readLedger.reset();
  });

  test('pre-edit gate does not record an edit before the tool succeeds', () => {
    runHookWithInput(preEdit, {
      session_id: 'session-a',
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });

    expect(editLedger.listEditedFiles()).toEqual([]);
  });

  test('forced-read proof is scoped to the same session', () => {
    const readOutput = runHookWithInput(postRead, {
      session_id: 'session-a',
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });
    expect(readOutput.exitCode).toBe(0);
    expect(readLedger.listReads({ sessionId: 'session-a' })).toHaveLength(1);
    expect(readLedger.listReads({ sessionId: 'session-b' })).toEqual([]);

    const wrongSessionEdit = runHookWithInput(preEdit, {
      session_id: 'session-b',
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });
    expect(wrongSessionEdit.exitCode).toBe(2);
    expect(wrongSessionEdit.stderr).toContain('has not been Read in this session');

    const sameSessionEdit = runHookWithInput(preEdit, {
      session_id: 'session-a',
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });
    expect(sameSessionEdit.exitCode).toBe(0);
    expect(sameSessionEdit.stdout).toContain('read_verified');
  });

  test('pre-edit fails closed when session identity is missing even if another session read the file', () => {
    runHookWithInput(postRead, {
      session_id: 'session-a',
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });

    const originalEnvSession = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'session-a';
    let output;
    try {
      output = runHookWithInput(preEdit, {
        tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
      });
    } finally {
      if (originalEnvSession === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = originalEnvSession;
      }
    }

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain('missing session identity');
  });

  test('post-read fails closed when session identity is missing', () => {
    const originalEnvSession = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'env-session';
    let output;
    try {
      output = runHookWithInput(postRead, {
        tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
      });
    } finally {
      if (originalEnvSession === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = originalEnvSession;
      }
    }

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain('missing session identity');
    expect(readLedger.listReads()).toEqual([]);
  });

  test('post-edit records successful edit targets', () => {
    runHookWithInput(postEdit, {
      session_id: 'session-a',
      tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
    });

    expect(editLedger.listEditedFiles()).toEqual(['test/claude-bridge-edit-ledger.test.js']);
    expect(editLedger.listEditedFiles({ sessionId: 'session-a' })).toEqual(['test/claude-bridge-edit-ledger.test.js']);
    expect(editLedger.listEditedFiles({ sessionId: 'session-b' })).toEqual([]);
  });

  test('post-edit does not record protected enforcement surface targets', () => {
    runHookWithInput(postEdit, {
      session_id: 'session-a',
      tool_input: { file_path: 'trai_brain/claude-bridge/pre-bash.js' },
    });

    expect(editLedger.listEditedFiles()).toEqual([]);
  });

  test('post-edit records separate session ownership for concurrent sessions', () => {
    runHookWithInput(postEdit, {
      session_id: 'session-a',
      tool_input: { file_path: 'core/OrderExecutor.js' },
    });
    runHookWithInput(postEdit, {
      session_id: 'session-b',
      tool_input: { file_path: 'run-empire-v2.js' },
    });

    expect(editLedger.listEditedFiles().sort()).toEqual(['core/OrderExecutor.js', 'run-empire-v2.js']);
    expect(editLedger.listEditedFiles({ sessionId: 'session-a' })).toEqual(['core/OrderExecutor.js']);
    expect(editLedger.listEditedFiles({ sessionId: 'session-b' })).toEqual(['run-empire-v2.js']);
  });

  test('post-edit fails closed when session identity is missing', () => {
    const originalEnvSession = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'env-session';
    let output;
    try {
      output = runHookWithInput(postEdit, {
        tool_input: { file_path: 'test/claude-bridge-edit-ledger.test.js' },
      });
    } finally {
      if (originalEnvSession === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = originalEnvSession;
      }
    }

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain('missing session identity');
    expect(editLedger.listEditedFiles()).toEqual([]);
  });
});
