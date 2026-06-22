'use strict';

const CONCRETE_MARKER = 'CONCRETE_BREAK_FOUND';
const NO_BREAK_MARKER = 'NO_CONCRETE_BREAK_FOUND';

function extractOpenedRanges(history = []) {
  const ranges = [];
  for (const turn of history) {
    if (turn?.toolName !== 'open_file') continue;
    const result = turn.toolResult || {};
    if (!result.file || !Number.isInteger(result.start_line) || !Number.isInteger(result.end_line)) continue;
    ranges.push({
      file: normalizePath(result.file),
      start: result.start_line,
      end: result.end_line,
    });
  }
  return ranges;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function lineWasOpened(file, line, openedRanges) {
  const normalized = normalizePath(file);
  return openedRanges.some((range) => {
    return range.file === normalized && line >= range.start && line <= range.end;
  });
}

function extractCitations(answer) {
  const citations = [];
  const text = String(answer || '');
  const inlinePattern = /(?:^|[`(\s])([A-Za-z0-9_.\-\/]+?\.(?:js|ts|mjs|cjs|json|md)):(\d+)(?:-(\d+))?/g;
  let match;
  while ((match = inlinePattern.exec(text)) !== null) {
    const file = normalizePath(match[1]);
    const start = Number(match[2]);
    const end = Number(match[3] || match[2]);
    if (Number.isInteger(start) && Number.isInteger(end)) citations.push({ file, start, end });
  }

  const fileLinePattern = /([A-Za-z0-9_.\-\/]+?\.(?:js|ts|mjs|cjs|json|md))[\s\S]{0,120}?lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/gi;
  while ((match = fileLinePattern.exec(text)) !== null) {
    const file = normalizePath(match[1]);
    const start = Number(match[2]);
    const end = Number(match[3] || match[2]);
    if (Number.isInteger(start) && Number.isInteger(end)) citations.push({ file, start, end });
  }

  return citations;
}

function citationWasOpened(citation, openedRanges) {
  for (let line = citation.start; line <= citation.end; line += 1) {
    if (!lineWasOpened(citation.file, line, openedRanges)) return false;
  }
  return true;
}

function hasSameFileLineOrderContradiction(answer) {
  const text = String(answer || '');
  const sameFileBlockPattern = /([A-Za-z0-9_.\-\/]+?\.(?:js|ts|mjs|cjs|json|md))[\s\S]{0,900}/g;
  let blockMatch;
  while ((blockMatch = sameFileBlockPattern.exec(text)) !== null) {
    const block = blockMatch[0];
    const referenceMatch = /(referenc(?:e|es|ed|ing)|use(?:s|d|ing)?|read(?:s|ing)?)[\s\S]{0,180}?lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(block);
    const definedLaterMatch = /(defined|created|declared)[\s\S]{0,80}?\b(later|after)\b[\s\S]{0,140}?lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(block);
    if (referenceMatch && definedLaterMatch) {
      const referenceLine = Number(referenceMatch[2]);
      const definitionLine = Number(definedLaterMatch[3]);
      if (Number.isInteger(referenceLine) && Number.isInteger(definitionLine) && definitionLine < referenceLine) {
        return true;
      }
    }

    const referenceBeforeMatch = /(referenc(?:e|es|ed|ing)|use(?:s|d|ing)?|read(?:s|ing)?)[\s\S]{0,120}?\b(before)\b[\s\S]{0,140}?lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(block);
    const definedMatch = /(defined|created|declared)[\s\S]{0,140}?lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(block);
    if (referenceBeforeMatch && definedMatch) {
      const referencedOtherLine = Number(referenceBeforeMatch[3]);
      const definitionLine = Number(definedMatch[2]);
      if (Number.isInteger(referencedOtherLine) && Number.isInteger(definitionLine) && definitionLine < referencedOtherLine) {
        return true;
      }
    }
  }
  return false;
}

function hasUnsupportedTestFailureClaim(answer) {
  const text = String(answer || '').toLowerCase();
  return /\b(test|jest|suite)\b/.test(text)
    && /\b(fail|fails|failed|break|breaks|throw|throws|referenceerror)\b/.test(text)
    && !/\bnot run\b|\bwas not run\b|\bneeds to be run\b/.test(text);
}

function validateBreakMyFixAnswer(answer, history = []) {
  const errors = [];
  const text = String(answer || '');
  const firstNonEmptyLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
  const hasConcrete = firstNonEmptyLine === CONCRETE_MARKER;
  const hasNoBreak = firstNonEmptyLine === NO_BREAK_MARKER;

  if (!hasConcrete && !hasNoBreak) {
    errors.push(`answer must start with ${CONCRETE_MARKER} or ${NO_BREAK_MARKER}`);
  }

  if (hasNoBreak) {
    return { ok: errors.length === 0, errors };
  }

  if (hasConcrete) {
    const openedRanges = extractOpenedRanges(history);
    const citations = extractCitations(text)
      .filter((citation) => !normalizePath(citation.file).startsWith('ogz-meta/mercury-review-input/'));

    if (citations.length === 0) {
      errors.push('concrete break answer must cite at least one non-artifact repo file line');
    }

    const unopened = citations.filter((citation) => !citationWasOpened(citation, openedRanges));
    if (unopened.length > 0) {
      const preview = unopened
        .slice(0, 5)
        .map((citation) => `${citation.file}:${citation.start}${citation.end !== citation.start ? `-${citation.end}` : ''}`)
        .join(', ');
      errors.push(`cited line(s) were not opened via open_file: ${preview}`);
    }

    if (hasSameFileLineOrderContradiction(text)) {
      errors.push('answer contains a same-file line-order contradiction');
    }

    if (hasUnsupportedTestFailureClaim(text)) {
      errors.push('answer claims a test/runtime failure without a tool-backed execution result');
    }
  }

  return { ok: errors.length === 0, errors };
}

function assertBreakMyFixAnswerAccepted(answer, history = []) {
  const validation = validateBreakMyFixAnswer(answer, history);
  if (!validation.ok) {
    const error = new Error(`Break-my-fix answer rejected: ${validation.errors.join('; ')}`);
    error.code = 'MERCURY_BREAK_MY_FIX_ANSWER_REJECTED';
    error.validationErrors = validation.errors;
    throw error;
  }
  return true;
}

module.exports = {
  CONCRETE_MARKER,
  NO_BREAK_MARKER,
  validateBreakMyFixAnswer,
  assertBreakMyFixAnswerAccepted,
};
