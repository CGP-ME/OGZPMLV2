'use strict';

const crypto = require('crypto');
const readline = require('readline');

const REVIEWER_REGISTRY = Object.freeze([
  Object.freeze({ id: 'mercury', label: 'Mercury' }),
  Object.freeze({ id: 'fable', label: 'Fable' }),
  Object.freeze({ id: 'kimi', label: 'Kimi' }),
]);

const REVIEWERS_BY_ID = new Map(REVIEWER_REGISTRY.map(reviewer => [reviewer.id, reviewer]));

function structuredPanelVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'verdict')) {
    return 'no_claim';
  }
  const verdict = String(parsed.verdict || '').toLowerCase();
  if (['pass', 'no_break_found'].includes(verdict) && parsed.blocking !== true) return 'pass';
  if (['found_break', 'blocked'].includes(verdict)) return 'found_break';
  return 'cannot_verify';
}

function positiveEvidenceBasis({ toolTelemetry = {}, autoBlastRadius = null, evidenceSources = [] } = {}) {
  const basis = [];
  const calls = Array.isArray(toolTelemetry.calls) ? toolTelemetry.calls : [];
  const byTool = toolTelemetry.byTool || {};
  const successfulRepoTool = calls.some(call => call && call.status === 'succeeded' && call.name !== 'run_check')
    || Object.entries(byTool).some(([name, stats]) => name !== 'run_check' && stats && stats.succeeded > 0);
  const trustedRunCheck = (toolTelemetry.runChecks || []).some(check => (
    check && check.status === 'passed'
    && ['trusted_path', 'host', 'host_attested'].includes(check.execution_provenance)
  ));
  const verifiedCurrentDiff = autoBlastRadius
    && Number(autoBlastRadius.changedFileCount) > 0
    && (!Array.isArray(autoBlastRadius.errors) || autoBlastRadius.errors.length === 0);
  if (successfulRepoTool) basis.push('successful_repo_tool');
  if (trustedRunCheck) basis.push('trusted_run_check');
  if (verifiedCurrentDiff) basis.push('verified_current_diff');
  if (Array.isArray(evidenceSources) && evidenceSources.length > 0) basis.push('host_attested_evidence');
  return basis;
}

function effectiveIdentityFingerprint(reviewerId, attempts = []) {
  const applied = attempts.filter(attempt => attempt && attempt.status !== 'failed').at(-1)
    || attempts.filter(Boolean).at(-1);
  if (!applied) return null;
  const provider = applied.requested_provider || applied.provider || null;
  const models = applied.applied_models || (applied.applied_model ? [applied.applied_model] : []);
  const identity = applied.identity_posture || applied.identityPosture || null;
  const trust = applied.executable_trust || applied.executableTrust || null;
  const identityAttested = identity && identity.status && identity.status !== 'identity_conflict';
  const executableAttested = trust && trust.trusted === true;
  if (!provider || models.length === 0 || (!identityAttested && !executableAttested)) return null;
  return crypto.createHash('sha256').update(JSON.stringify({
    provider,
    applied_model: models.at(-1),
    identity: identityAttested ? {
      status: identity.status,
      authority: identity.authority || null,
      reason: identity.reason || null,
    } : null,
    executable: executableAttested ? {
      trusted: true,
      realpath: trust.realpath || null,
      version: trust.version || null,
    } : null,
  })).digest('hex');
}

function canAttachFinalReview(fableSeat, kimiSeat) {
  if (!fableSeat || !kimiSeat || fableSeat.status !== 'succeeded' || kimiSeat.status !== 'succeeded') return false;
  if (kimiSeat.sequence <= fableSeat.sequence || !Array.isArray(kimiSeat.inputDependencies)) return false;
  const answerSha256 = crypto.createHash('sha256').update(String(fableSeat.answer || '')).digest('hex');
  return kimiSeat.inputDependencies.some(dependency => (
    dependency.id === 'fable'
    && dependency.sequence === fableSeat.sequence
    && dependency.answerSha256 === answerSha256
  ));
}

function reportedPanelDecision(panel) {
  // Report the last selected reviewer's own conclusion, not host certification.
  // A failed last seat must not silently fall back to an earlier passing answer.
  const seat = (panel && panel.seats || []).at(-1);
  const rawVerdict = seat && seat.status === 'succeeded'
    && typeof seat.answer === 'string' && seat.answer.trim()
    ? seat.parsed && seat.parsed.verdict : null;
  return {
    verdict: !seat || seat.status !== 'succeeded' ? 'review_incomplete'
      : !rawVerdict ? 'no_claim'
        : rawVerdict === 'pass' ? 'no_break_found' : rawVerdict,
    rawVerdict: rawVerdict || null,
    reviewer: seat ? seat.id : null,
    sequence: seat ? seat.sequence : null,
    answerSha256: seat && seat.answer
      ? crypto.createHash('sha256').update(seat.answer).digest('hex') : null,
    basis: 'reviewer report; not certification',
  };
}

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

function summarizePanelDiagnostics(seats) {
  const selectedSeats = seats || [];
  const failedSelected = selectedSeats.filter(seat => seat.status !== 'succeeded');
  const successful = selectedSeats.filter(seat => (
    seat.status === 'succeeded'
    && seat.qualifying !== false
    && seat.identityConflict !== true
  ));
  const claimingSeats = successful.filter(seat => seat.verdict !== 'no_claim');
  const verdicts = [...new Set(claimingSeats.map((seat) => {
    if (['pass', 'no_break_found'].includes(seat.verdict)) return 'pass';
    if (['found_break', 'blocked'].includes(seat.verdict)) return 'found_break';
    return seat.verdict || 'cannot_verify';
  }))];
  const agreement = successful.length >= 2 && claimingSeats.length > 0 && verdicts.length === 1;
  const evidenceChecksPassed = successful.length > 0
    && successful.every(seat => seat.evidenceChecksPassed === true);
  const fingerprints = successful.map(seat => seat.effectiveIdentityFingerprint).filter(Boolean);
  const identitiesAttested = fingerprints.length === successful.length;
  const identitiesIndependent = identitiesAttested && new Set(fingerprints).size === fingerprints.length;
  const issues = [];
  if (failedSelected.length > 0) issues.push('selected_seat_unavailable');
  if (successful.length < 2) issues.push('insufficient_qualifying_seats');
  if (selectedSeats.some(seat => seat.identityConflict === true)) issues.push('identity_conflict');
  if (!evidenceChecksPassed) issues.push('evidence_failure');
  if (successful.length >= 2 && !identitiesIndependent) {
    issues.push(identitiesAttested ? 'identity_collision' : 'identity_attestation_absent');
  }
  if (successful.length >= 2 && claimingSeats.length === 0) issues.push('reviewer_claim_absent');
  if (claimingSeats.length > 1 && verdicts.length > 1) issues.push('reviewer_disagreement');
  return {
    qualifyingSeats: successful.length,
    agreement,
    evidenceChecksPassed,
    identitiesAttested,
    identitiesIndependent,
    issues,
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
    const sequence = seats.length + 1;
    try {
      const result = await runSeat(reviewer, seats);
      seats.push({
        ...result,
        id,
        label: reviewer.label,
        sequence,
        status: 'succeeded',
        qualifying: result && result.qualifying !== false,
      });
    } catch (error) {
      if (isHardStop(error)) throw error;
      seats.push({
        id,
        label: reviewer.label,
        sequence,
        status: 'failed',
        qualifying: false,
        absence: error.absence || 'reviewer_answer_absent',
        error,
      });
    }
  }
  return { seats, diagnostics: summarizePanelDiagnostics(seats) };
}

module.exports = {
  REVIEWER_REGISTRY,
  canAttachFinalReview,
  effectiveIdentityFingerprint,
  ensureReviewerAnswer,
  summarizePanelDiagnostics,
  parseReviewerSelection,
  reportedPanelDecision,
  positiveEvidenceBasis,
  promptReviewerSelection,
  resolveReviewerSelection,
  runReviewerPanel,
  structuredPanelVerdict,
};
