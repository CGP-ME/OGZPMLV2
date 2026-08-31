'use strict';

const readline = require('readline');

const REVIEWER_REGISTRY = Object.freeze([
  Object.freeze({ id: 'mercury', label: 'Mercury' }),
  Object.freeze({ id: 'fable', label: 'Fable' }),
  Object.freeze({ id: 'kimi', label: 'Kimi' }),
]);

const REVIEWERS_BY_ID = new Map(REVIEWER_REGISTRY.map(reviewer => [reviewer.id, reviewer]));

function parseReviewerSelection(value) {
  const parts = String(value == null ? '' : value)
    .split(',')
    .map(part => part.trim().toLowerCase());
  if (parts.length === 0 || parts.some(part => part === '')) {
    throw new Error('--reviewers requires at least one reviewer');
  }
  const selected = [];
  for (const id of parts) {
    if (!REVIEWERS_BY_ID.has(id)) {
      throw new Error(`Unknown reviewer "${id}"; choose from ${REVIEWER_REGISTRY.map(item => item.id).join(',')}`);
    }
    if (!selected.includes(id)) selected.push(id);
  }
  return selected;
}

function selectionReceipt(selected, { requested = null, source }) {
  return {
    requested,
    selected,
    unselected: REVIEWER_REGISTRY.map(reviewer => reviewer.id).filter(id => !selected.includes(id)),
    source,
  };
}

async function resolveReviewerSelection({
  explicit = null,
  interactive = false,
  prompt = null,
  defaultReviewers = ['mercury'],
} = {}) {
  if (explicit !== null) {
    const selected = parseReviewerSelection(explicit);
    return selectionReceipt(selected, { requested: selected, source: 'explicit' });
  }
  if (interactive) {
    if (typeof prompt !== 'function') {
      throw new Error('Interactive reviewer selection requires a prompt implementation');
    }
    const response = await prompt({
      message: 'Select reviewers for this adversarial run',
      choices: REVIEWER_REGISTRY,
    });
    const selected = Array.isArray(response)
      ? parseReviewerSelection(response.join(','))
      : parseReviewerSelection(response);
    return selectionReceipt(selected, { requested: selected, source: 'interactive' });
  }
  const selected = parseReviewerSelection(defaultReviewers.join(','));
  return selectionReceipt(selected, { source: 'configured_default' });
}

async function promptReviewerSelection({ message, choices }, {
  input = process.stdin,
  output = process.stdout,
} = {}) {
  output.write(`${message}\n`);
  choices.forEach((choice, index) => output.write(`  ${index + 1}. ${choice.label} (${choice.id})\n`));
  const interface_ = readline.createInterface({ input, output });
  const answer = await new Promise(resolve => interface_.question(
    'Reviewer IDs or numbers (comma-separated): ', resolve
  ));
  interface_.close();
  return answer.split(',').map((item) => {
    const value = item.trim();
    if (/^\d+$/.test(value)) {
      const choice = choices[Number(value) - 1];
      return choice ? choice.id : value;
    }
    return value;
  });
}

function evaluatePanelAuthority(seats) {
  const successful = (seats || []).filter(seat => (
    seat.status === 'succeeded'
    && seat.qualifying !== false
    && seat.identityConflict !== true
  ));
  const verdicts = [...new Set(successful.map((seat) => {
    if (['pass', 'no_break_found'].includes(seat.verdict)) return 'pass';
    if (['found_break', 'blocked'].includes(seat.verdict)) return 'found_break';
    return seat.verdict || 'cannot_verify';
  }))];
  const agreement = successful.length >= 2 && verdicts.length === 1;
  const evidenceChecksPassed = successful.length > 0
    && successful.every(seat => seat.evidenceChecksPassed === true);
  const full = successful.length >= 2 && agreement && evidenceChecksPassed;
  return {
    ceiling: full ? 'FULL' : 'UNVERIFIED',
    qualifyingSeats: successful.length,
    agreement,
    evidenceChecksPassed,
    rerunRequired: successful.length >= 2 && !agreement,
    agreedVerdict: agreement ? verdicts[0] : null,
  };
}

function ensureReviewerAnswer(result, reviewerId) {
  if (result && result.termination === 'answer_given' && String(result.answer || '').trim() !== '') {
    return result;
  }
  const message = String(result && result.answer || `${reviewerId} reviewer answer absent`);
  const error = new Error(message);
  error.absence = /quota|rate.?limit|HTTP 402|HTTP 429|usage.limit/i.test(message)
    ? 'quota_or_rate_limit'
    : 'reviewer_answer_absent';
  error.reviewerResult = result || null;
  throw error;
}

async function runReviewerPanel({ selected, runSeat, isHardStop }) {
  const seats = [];
  for (const id of selected) {
    const reviewer = REVIEWERS_BY_ID.get(id);
    try {
      const result = await runSeat(reviewer, seats);
      seats.push({ id, label: reviewer.label, status: 'succeeded', ...result });
    } catch (error) {
      if (isHardStop(error)) throw error;
      seats.push({
        id,
        label: reviewer.label,
        status: 'failed',
        absence: error.absence || 'reviewer_answer_absent',
        error,
      });
    }
  }
  return { seats, authority: evaluatePanelAuthority(seats) };
}

module.exports = {
  REVIEWER_REGISTRY,
  ensureReviewerAnswer,
  evaluatePanelAuthority,
  parseReviewerSelection,
  promptReviewerSelection,
  resolveReviewerSelection,
  runReviewerPanel,
};
