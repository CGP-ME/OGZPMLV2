const fs = require('fs');

const hookInput = require('../trai_brain/claude-bridge/hook-input');

function runWithRawInput(raw) {
  const originalReadFileSync = fs.readFileSync;
  const originalExit = process.exit;
  const originalStderrWrite = process.stderr.write;
  const output = { result: null, stderr: '', code: 0 };

  fs.readFileSync = jest.fn((file, ...args) => {
    if (file === 0) return raw;
    return originalReadFileSync(file, ...args);
  });
  process.exit = jest.fn((code = 0) => { output.code = code; throw Object.assign(new Error('exit'), { code }); });
  process.stderr.write = jest.fn((value) => { output.stderr += String(value); });

  try {
    output.result = hookInput.readHookInput('test-hook');
  } catch (error) {
    if (error.message !== 'exit') throw error;
  } finally {
    fs.readFileSync = originalReadFileSync;
    process.exit = originalExit;
    process.stderr.write = originalStderrWrite;
  }

  return output;
}

describe('claude bridge hook input reader', () => {
  test('returns valid hook objects', () => {
    const result = runWithRawInput(JSON.stringify({ tool_input: { file_path: 'test/file.js' } }));
    expect(result.code).toBe(0);
    expect(result.result).toEqual({ tool_input: { file_path: 'test/file.js' } });
  });

  test('session identity only comes from hook input fields', () => {
    const originalEnvSession = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'env-session';

    try {
      expect(hookInput.sessionIdFromHookInput({ session_id: ' session-a ' })).toBe('session-a');
      expect(hookInput.sessionIdFromHookInput({ sessionId: 'session-b' })).toBe('session-b');
      expect(hookInput.sessionIdFromHookInput({ session: { id: 'session-c' } })).toBe('session-c');
      expect(hookInput.sessionIdFromHookInput({ tool_input: {} })).toBe(null);
    } finally {
      if (originalEnvSession === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = originalEnvSession;
      }
    }
  });

  test('fails closed on missing, malformed, or non-object hook input', () => {
    const missing = runWithRawInput('');
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('missing hook input');

    const malformed = runWithRawInput('{nope');
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).toContain('malformed hook input');

    const arrayInput = runWithRawInput('[]');
    expect(arrayInput.code).toBe(2);
    expect(arrayInput.stderr).toContain('invalid hook input');
  });
});
