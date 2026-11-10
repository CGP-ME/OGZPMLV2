'use strict';

// These checks reject known empty/leading requests. They cannot establish
// that a question is focused or unbiased; the dispatcher must inspect it.
const LEADING_REQUESTS = [
  /\b(?:verify|confirm)\s+(?:that\s+)?(?:this|it|the fix|the change|my fix|my change)\b/i,
  /\bis\s+(?:this|it|that|the\s+fix|the\s+change)\s+(?:correct|right|fixed|resolved|closed)\b/i,
  /\bdoes\s+(?:this|it|that)\s+look\b/i,
  /\b(?:return|report|declare)\s+(?:only\s+)?(?:a\s+)?(?:pass|fail|approval|approved|found_break|no_break_found|cannot_verify)\b/i,
  /\bbeam\s+me\s+up\b/i,
];

function mercuryQuestionIssue(value) {
  if (typeof value !== 'string' || !value.trim()) return 'missing_question';
  if (/^\s*(?:Mercury\s*[,:]?\s*)?break\s+my\s+fix[\s.!?]*$/i.test(value)) {
    return 'retired_generic_prompt';
  }
  if (LEADING_REQUESTS.some(pattern => pattern.test(value))) return 'leading_question';
  return null;
}

module.exports = {
  mercuryQuestionIssue,
};
