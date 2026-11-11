'use strict';

const crypto = require('crypto');
const readline = require('readline');

const REVIEWER_REGISTRY = Object.freeze([
  Object.freeze({ id: 'mercury', label: 'Mercury' }),
  Object.freeze({ id: 'astra', label: 'Astra' }),
  Object.freeze({ id: 'fable', label: 'Opus' }),
]);

const REVIEWERS_BY_ID = new Map(REVIEWER_REGISTRY.map(reviewer => [reviewer.id, reviewer]));

function structuredPanelVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'verdict')) {
    return 'no_claim';
  }
  if ((parsed.parseWarnings || []).some(warning => warning.startsWith('duplicate_decision_'))) return 'no_claim';
  const verdict = String(parsed.verdict || '').toLowerCase();
  if (verdict === 'no_break_found' && parsed.blocking === false) return 'no_break_found';
  if (verdict === 'found_break') return 'found_break';
  if (verdict === 'cannot_verify') return 'cannot_verify';
  // Preserve the distinction between an explicit inability to verify and a
  // missing, contradictory or retired ballot label. Do not invent a vote.
  return 'no_claim';
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

function canAttachFinalReview(astraSeat, fableSeat) {
  if (!astraSeat || !fableSeat || astraSeat.status !== 'succeeded' || fableSeat.status !== 'succeeded') return false;
  if (fableSeat.sequence <= astraSeat.sequence || !Array.isArray(fableSeat.inputDependencies)) return false;
  const answerSha256 = crypto.createHash('sha256').update(String(astraSeat.answer || '')).digest('hex');
  return fableSeat.inputDependencies.some(dependency => (
    dependency.id === 'astra'
    && dependency.sequence === astraSeat.sequence
    && dependency.answerSha256 === answerSha256
  ));
}

function reportedPanelDecision(panel) {
  const seats = panel && panel.seats || [];
  const selected = panel && panel.selected || seats.map(seat => seat.id);
  const synthesis = ['architecture', 'planning'].includes(panel && panel.reviewIntent);
  const votes = selected.map(id => {
    const seat = seats.find(item => item.id === id);
    const available = seat && seat.status === 'succeeded' && seat.qualifying !== false
      && seat.identityConflict !== true && typeof seat.answer === 'string' && seat.answer.trim();
    return { reviewer: id, status: seat ? seat.status : 'absent',
      outcome: available && !synthesis ? structuredPanelVerdict(seat.parsed) : null,
      rawVerdict: seat && seat.parsed && seat.parsed.verdict || null,
      answerSha256: seat && seat.answer ? crypto.createHash('sha256').update(seat.answer).digest('hex') : null,
      absence: available ? null : seat && seat.absence || 'reviewer_answer_absent' };
  });
  if (synthesis) {
    const complete = selected.length > 0 && votes.every(vote => !vote.absence);
    return { verdict: complete ? 'synthesis_received' : 'synthesis_incomplete',
      reviewIntent: panel.reviewIntent, codeOutcome: null, reviewComplete: complete,
      selectedCount: selected.length, responses: votes,
      basis: 'independent synthesis responses; receipt of answers is not code approval or agreement' };
  }
  const tally = { found_break: 0, no_break_found: 0, cannot_verify: 0, absent: 0 };
  for (const vote of votes) tally[vote.outcome in tally ? vote.outcome : 'absent']++;
  const majorityRequired = Math.floor(selected.length / 2) + 1;
  const majorityOutcome = ['found_break', 'no_break_found', 'cannot_verify']
    .find(outcome => tally[outcome] >= majorityRequired) || null;
  const complete = selected.length > 0 && votes.every(vote => vote.outcome && vote.outcome !== 'no_claim');
  return {
    verdict: !complete ? 'review_incomplete' : majorityOutcome || 'unresolved_vote',
    majorityOutcome, majorityRequired, selectedCount: selected.length, tally, votes,
    reviewComplete: complete,
    agreement: complete && majorityOutcome && tally[majorityOutcome] === selected.length ? 'unanimous'
      : majorityOutcome ? 'majority' : 'unresolved',
    dissent: votes.filter(vote => vote.outcome && vote.outcome !== majorityOutcome),
    basis: 'equal peer votes on code outcome; raw evidence and dissent retained',
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

function formatPeerReviewPacket(panel) {
  const decision = reportedPanelDecision(panel);
  if (['architecture', 'planning'].includes(panel.reviewIntent)) {
    return [
      `PANEL SYNTHESIS: ${panel.reviewIntent}; ${decision.verdict}`,
      'CODE OUTCOME: not applicable; synthesis is not commit approval or a vote on code correctness.',
      ...(panel.seats || []).map(seat => `${seat.label || seat.id}: ${seat.status}\nArchived provider receipt references: ${JSON.stringify(seat.providerRawReceipts || [])}\n${seat.answer || `Response unavailable: ${seat.absence || 'answer absent'}`}`),
    ].join('\n\n');
  }
  const render = (label, seats) => [label, ...seats.map(seat => [
    `${seat.label || seat.id}: ${seat.status}; reported verdict: ${seat.parsed?.verdict || 'absent'}`,
    `Archived provider receipt references: ${JSON.stringify(seat.providerRawReceipts || [])}`,
    seat.answer || `Review unavailable: ${seat.absence || 'answer absent'}`,
  ].join('\n'))].join('\n\n');
  return [
    `PANEL CODE OUTCOME: ${decision.verdict}`,
    `VOTES: ${JSON.stringify(decision.tally)}; majority required: ${decision.majorityRequired}; review complete: ${decision.reviewComplete}`,
    `AGREEMENT: ${decision.agreement}; dissent: ${decision.dissent.map(vote => `${vote.reviewer}=${vote.outcome}`).join(', ') || 'none'}`,
    render('INDEPENDENT EVIDENCE', panel.independentSeats || panel.seats || []),
    ...(panel.evidenceRound?.required ? [render('VOTES AFTER SHARED EVIDENCE', panel.seats)] : []),
  ].join('\n\n');
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

function summarizePanelDiagnostics(seats, reviewIntent = 'adversarial') {
  const selectedSeats = seats || [];
  const failedSelected = selectedSeats.filter(seat => seat.status !== 'succeeded');
  const successful = selectedSeats.filter(seat => (
    seat.status === 'succeeded'
    && seat.qualifying !== false
    && seat.identityConflict !== true
  ));
  const synthesis = ['architecture', 'planning'].includes(reviewIntent);
  const claimingSeats = synthesis ? [] : successful.filter(seat => seat.verdict !== 'no_claim');
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
  if (!synthesis && successful.length >= 2 && claimingSeats.length === 0) issues.push('reviewer_claim_absent');
  if (claimingSeats.length > 1 && verdicts.length > 1) issues.push('reviewer_verdict_labels_differ');
  return {
    qualifyingSeats: successful.length,
    verdictLabelsMatch: agreement,
    evidenceChecksPassed,
    identitiesAttested,
    identitiesIndependent,
    issues,
    sharedVerdictLabel: agreement ? verdicts[0] : null,
  };
}

function hasReviewerAnswer(result) {
  if (!result || typeof result.answer !== 'string' || !result.answer.trim()) return false;
  if (result.termination === 'answer_given') return true;
  // A final model response can omit report fields without being absent.
  // Require the actual final message; transport errors and partial tool loops
  // also carry text in `answer`, but that text is not a delivered review.
  const finalMessage = result.rawFinalAnswer;
  return result.termination === 'review_receipt_incomplete'
    && finalMessage && typeof finalMessage.content === 'string'
    && finalMessage.content.trim() !== ''
    && finalMessage.content === result.answer
    && !(finalMessage.tool_calls && finalMessage.tool_calls.length);
}

function ensureReviewerAnswer(result, reviewerId) {
  if (hasReviewerAnswer(result)) {
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

async function runReviewerPanel({ selected, runSeat, isHardStop, reviewIntent = 'adversarial' }) {
  async function collect(phase, evidence) {
    const seats = [];
    for (const id of selected) {
    const reviewer = REVIEWERS_BY_ID.get(id);
    const sequence = seats.length + 1;
    try {
      // Every peer sees the same question and, in the voting round, the same
      // frozen first-round evidence. Earlier votes never steer later voters.
      const result = await runSeat(reviewer, { phase, evidence });
      seats.push({
        ...result,
        id,
        label: reviewer.label,
        sequence,
        phase,
        status: 'succeeded',
        qualifying: result && result.qualifying !== false,
      });
    } catch (error) {
      if (isHardStop(error)) throw error;
      // Preserve available partial evidence before the shared packet is frozen.
      // Failure status still excludes this response from the vote.
      const failedOutput = error.reviewFailure || error.reviewerResult;
      const stageReceipt = failedOutput?.stageReceipt || error.stageAttempt || null;
      const providerAttempts = failedOutput?.attempts || failedOutput?.providerAttempts
        || error.reviewerAttempts || (stageReceipt ? [stageReceipt] : []);
      seats.push({
        answer: failedOutput?.answer || null,
        parsed: failedOutput?.parsed || null,
        termination: failedOutput?.termination || null,
        stageReceipt,
        inputReceipt: failedOutput?.inputProvenance || stageReceipt?.input_provenance || null,
        providerAttempts,
        providerRawReceipts: providerAttempts.map(attempt => attempt.raw_output).filter(Boolean),
        id,
        label: reviewer.label,
        sequence,
        phase,
        status: 'failed',
        qualifying: false,
        absence: error.absence || 'reviewer_answer_absent',
        error,
      });
    }
    }
    return seats;
  }
  const independentSeats = await collect('independent', []);
  const evidence = independentSeats.map(seat => ({
    id: seat.id, status: seat.status, absence: seat.absence || null,
    answer: seat.answer || null, parsed: seat.parsed || null,
    answerSha256: seat.answer ? crypto.createHash('sha256').update(seat.answer).digest('hex') : null,
    providerRawReceipts: seat.providerRawReceipts || [],
    inputReceipt: seat.inputReceipt || null,
    stageReceipt: seat.stageReceipt || null,
  }));
  const outcomes = new Set(independentSeats.filter(seat => seat.status === 'succeeded')
    .map(seat => structuredPanelVerdict(seat.parsed)));
  const disputed = reviewIntent === 'adversarial' && outcomes.size > 1;
  const seats = disputed ? await collect('evidence_vote', evidence) : independentSeats;
  return { selected, seats, independentSeats, reviewIntent,
    evidenceRound: { required: disputed, status: disputed ? 'dispatched_to_all_selected_peers' : 'not_required', evidence },
    diagnostics: summarizePanelDiagnostics(seats, reviewIntent) };
}

module.exports = {
  REVIEWER_REGISTRY,
  canAttachFinalReview,
  effectiveIdentityFingerprint,
  formatPeerReviewPacket,
  ensureReviewerAnswer,
  hasReviewerAnswer,
  summarizePanelDiagnostics,
  parseReviewerSelection,
  reportedPanelDecision,
  positiveEvidenceBasis,
  promptReviewerSelection,
  resolveReviewerSelection,
  runReviewerPanel,
  structuredPanelVerdict,
};
