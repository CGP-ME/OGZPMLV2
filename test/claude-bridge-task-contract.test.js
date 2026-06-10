const fs = require('fs');

const taskContract = require('../trai_brain/claude-bridge/task-contract');
const preBash = require('../trai_brain/claude-bridge/pre-bash');
const preEdit = require('../trai_brain/claude-bridge/pre-edit');
const preRead = require('../trai_brain/claude-bridge/pre-read');

function activeContract(overrides = {}) {
  return {
    version: 1,
    taskId: 'test-contract',
    status: 'active',
    readAllowedPaths: ['trai_brain/claude-bridge/', 'test/', 'ogz-meta/ledger/'],
    writeAllowedPaths: ['trai_brain/claude-bridge/', 'test/claude-bridge-task-contract.test.js'],
    blockedPaths: ['data/', 'ogz-meta/cognition-history/'],
    bashAllowedPatterns: ['^git status', '^git diff', '^rg ', '^sed ', '^npx jest test/claude-bridge'],
    bashBlockedPatterns: ['rm ', 'git reset'],
    requiredProof: { mercury: false, p0: false },
    ...overrides,
  };
}

function runHookWithInput(handler, input) {
  const originalReadFileSync = fs.readFileSync;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const output = { stdout: '', stderr: '', code: 0 };

  process.exit = jest.fn((code = 0) => { output.code = code; throw Object.assign(new Error('exit'), { code }); });
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

describe('claude bridge task contract', () => {
  beforeEach(() => {
    taskContract.clearContract();
  });

  afterEach(() => {
    taskContract.clearContract();
  });

  test('inactive contract leaves existing bridge policy in control', () => {
    expect(taskContract.checkPathAllowed('read', 'core/TRAIDecisionModule.js')).toMatchObject({
      allowed: true,
      active: false,
      reason: 'missing_task_contract',
    });
    expect(taskContract.checkBashAllowed('git status --short')).toMatchObject({
      allowed: true,
      active: false,
    });
  });

  test('active contract allows only declared read and write paths', () => {
    taskContract.writeContract(activeContract());

    expect(taskContract.checkPathAllowed('read', 'ogz-meta/ledger/incoming.md')).toMatchObject({
      allowed: true,
      reason: 'task_contract_read_allowed',
    });
    expect(taskContract.checkPathAllowed('write', 'ogz-meta/ledger/incoming.md')).toMatchObject({
      allowed: false,
      reason: 'task_contract_write_not_allowed',
    });
    expect(taskContract.checkPathAllowed('read', 'data/state.json')).toMatchObject({
      allowed: false,
      reason: 'task_contract_blocked_path',
    });
  });

  test('active contract boxes Bash commands to declared patterns', () => {
    taskContract.writeContract(activeContract());

    expect(taskContract.checkBashAllowed('rg -n "needle" trai_brain/claude-bridge')).toMatchObject({
      allowed: true,
      reason: 'task_contract_bash_allowed',
    });
    expect(taskContract.checkBashAllowed('git reset --hard HEAD')).toMatchObject({
      allowed: false,
      reason: 'task_contract_bash_blocked',
    });
    expect(taskContract.checkBashAllowed('node scripts/random.js')).toMatchObject({
      allowed: false,
      reason: 'task_contract_bash_not_allowed',
    });
  });

  test('pre-read blocks reads outside the active task scope', () => {
    taskContract.writeContract(activeContract());

    const blocked = runHookWithInput(preRead, {
      tool_input: { file_path: 'core/TRAIDecisionModule.js' },
    });

    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain('task_contract_read_not_allowed');
  });

  test('pre-edit blocks writes outside the active task scope before forced-read checks', () => {
    taskContract.writeContract(activeContract());

    const blocked = runHookWithInput(preEdit, {
      tool_input: { file_path: 'core/TRAIDecisionModule.js' },
    });

    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain('task_contract_write_not_allowed');
  });

  test('pre-bash blocks allowed shell reads that target out-of-contract files', () => {
    taskContract.writeContract(activeContract({
      bashAllowedPatterns: ['^nl ', '^rg '],
    }));

    const blocked = runHookWithInput(preBash, {
      tool_input: { command: 'nl -ba core/TRAIDecisionModule.js' },
    });

    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain('task_contract_read_not_allowed');

    const blockedBareDirectory = runHookWithInput(preBash, {
      tool_input: { command: 'rg -n "needle" core' },
    });

    expect(blockedBareDirectory.code).toBe(2);
    expect(blockedBareDirectory.stderr).toContain('task_contract_read_not_allowed');
  });

  test('diff checks use contract write scope for supplied file list', () => {
    taskContract.writeContract(activeContract());

    expect(taskContract.changedFilesOutsideContract([
      'test/claude-bridge-task-contract.test.js',
      'core/TRAIDecisionModule.js',
    ])).toEqual(['core/TRAIDecisionModule.js']);
  });
});
