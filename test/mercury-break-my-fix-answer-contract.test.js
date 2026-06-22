'use strict';

const {
  validateBreakMyFixAnswer,
  assertBreakMyFixAnswerAccepted,
} = require('../trai_brain/mercury-bridge/break-my-fix-answer-contract');

function opened(file, start, end) {
  return {
    toolName: 'open_file',
    toolResult: {
      file,
      start_line: start,
      end_line: end,
    },
  };
}

describe('Mercury break-my-fix answer contract', () => {
  test('accepts explicit no-break answers', () => {
    const result = validateBreakMyFixAnswer(
      'NO_CONCRETE_BREAK_FOUND\nChecked changed files and no concrete failure survived.'
    );

    expect(result).toEqual({ ok: true, errors: [] });
  });

  test('rejects answers without an acceptance marker', () => {
    const result = validateBreakMyFixAnswer('This might break if quantityUnit is null.');

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('answer must start with CONCRETE_BREAK_FOUND or NO_CONCRETE_BREAK_FOUND');
  });

  test('rejects concrete breaks whose cited repo lines were not opened', () => {
    const result = validateBreakMyFixAnswer(
      'CONCRETE_BREAK_FOUND\ncore/BacktestRecorder.js:216 proves the break.',
      [opened('core/BacktestRecorder.js', 100, 120)]
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('cited line(s) were not opened via open_file');
  });

  test('rejects same-file line-order contradictions', () => {
    const answer = [
      'CONCRETE_BREAK_FOUND',
      'In core/BacktestRecorder.js, the record object references entryFeeQuantity at line 216 before those variables are defined later at lines 149-161.',
      'core/BacktestRecorder.js:216',
      'core/BacktestRecorder.js:149-161',
    ].join('\n');

    const result = validateBreakMyFixAnswer(answer, [
      opened('core/BacktestRecorder.js', 140, 220),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('answer contains a same-file line-order contradiction');
  });

  test('rejects test failure claims without execution evidence', () => {
    const answer = [
      'CONCRETE_BREAK_FOUND',
      'core/BacktestRecorder.js:216 throws a ReferenceError and breaks the Jest test.',
    ].join('\n');

    const result = validateBreakMyFixAnswer(answer, [
      opened('core/BacktestRecorder.js', 210, 220),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('answer claims a test/runtime failure without a tool-backed execution result');
  });

  test('throws fail-closed error on rejected answers', () => {
    expect(() => assertBreakMyFixAnswerAccepted('bad answer')).toThrow(/Break-my-fix answer rejected/);
  });
});
