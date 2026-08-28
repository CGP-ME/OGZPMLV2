'use strict';

const config = require('./config');
const {
  claudeAppliedModelMatchesAlias,
  createFableChallengerClient,
  createOpusChallengerClient,
  createKimiTieBreakerClient,
} = require('./llm-client');
const { formatToolTelemetry } = require('./react-loop');
const {
  buildPromptProvenance,
  extractClaimedFileCitations,
  sanitizeForLedger,
} = require('./run-ledger');

function flagFromEnv(name) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) return null;
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (value === '') return null;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return false;
}

function adversarialReviewRequested(opts = {}) {
  if (opts.adversarialReviewExplicit === true) {
    return opts.adversarialReview === true;
  }
  const envFlag = flagFromEnv('MERCURY_ADVERSARIAL_REVIEW');
  if (envFlag !== null) return envFlag;
  return config.ADVERSARIAL_REVIEW_DEFAULT_ENABLED === true;
}

function reviewModeRequested(opts = {}) {
  if (adversarialReviewRequested(opts)) return 'adversarial_review';
  if (opts.consensusExplicit === true) return opts.consensus === true ? 'consensus' : null;
  return config.CONSENSUS_DEFAULT_ENABLED === true ? 'consensus' : null;
}

function normalizeReviewIntent(value) {
  const intent = String(value || '').trim().toLowerCase();
  if (intent === 'architecture' || intent === 'planning') return intent;
  return 'adversarial';
}

function kimiTieBreakerRequired(review, reviewIntent = 'adversarial') {
  return normalizeReviewIntent(reviewIntent) === 'adversarial'
    && !!(review && review.ok === true && review.parsed && review.parsed.blocking === true);
}

function extractField(text, fieldName) {
  const source = String(text || '');
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?${escapedField}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*)?[A-Z][A-Z0-9_ ]{2,}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?|(?![\\s\\S]))`,
    'i'
  );
  const match = source.match(pattern);
  return match ? match[1].trim() : '';
}

function hasStructuredField(text, fieldName) {
  const source = String(text || '');
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?${escapedField}(?:\\*\\*)?\\s*:`, 'i').test(source);
}

function hasMeaningfulFieldValue(value) {
  const text = String(value || '').trim();
  return text !== '' && !/^none\b/i.test(text);
}

function parseAdversarialReviewAnswer(answer) {
  const text = String(answer || '');
  const verdict = (extractField(text, 'VERDICT') || extractField(text, 'FINAL_VERDICT'))
    .split(/\s+/)[0].toLowerCase() || 'unknown';
  const blockingRaw = extractField(text, 'CONSENSUS_BLOCKING').toLowerCase()
    || extractField(text, 'ADVERSARIAL_REVIEW_BLOCKING').toLowerCase()
    || extractField(text, 'FINAL_BLOCKING').toLowerCase();
  const explicitBlocking = /^(yes|true|blocking)\b/.test(blockingRaw);
  const missingBlockingField = !hasStructuredField(text, 'CONSENSUS_BLOCKING')
    && !hasStructuredField(text, 'ADVERSARIAL_REVIEW_BLOCKING')
    && !hasStructuredField(text, 'FINAL_BLOCKING');
  const consensus = extractField(text, 'CONSENSUS');
  const contradictions = extractField(text, 'CONTRADICTIONS');
  const partial = extractField(text, 'PARTIAL');
  const unique = extractField(text, 'UNIQUE');
  const blindSpots = extractField(text, 'BLIND_SPOTS');
  const disagreement = extractField(text, 'DISAGREEMENT');
  const parseWarnings = [];
  if (missingBlockingField) parseWarnings.push('missing_adversarial_review_blocking_field');
  if (verdict === 'pass' && hasMeaningfulFieldValue(contradictions)) {
    parseWarnings.push('pass_with_contradictions');
  }
  const blocking = missingBlockingField
    || explicitBlocking
    || hasMeaningfulFieldValue(disagreement)
    || ['disagree', 'needs_more_evidence', 'found_break', 'blocked', 'models_disagree'].includes(verdict);
  const recheckPrompt = extractField(text, 'RECHECK_PROMPT');
  const nextCheck = extractField(text, 'NEXT_CHECK');
  return {
    consensus,
    contradictions,
    partial,
    unique,
    blindSpots,
    verdict,
    blocking,
    parseWarnings,
    disagreement,
    requiredRecheck: extractField(text, 'REQUIRED_RECHECK')
      || extractField(text, 'REQUIRED_RECHECKS'),
    recheckPrompt,
    nextCheck,
    sharedConclusion: extractField(text, 'SHARED_CONCLUSION'),
    mercurySupported: extractField(text, 'MERCURY_SUPPORTED'),
    fableSupported: extractField(text, 'FABLE_SUPPORTED'),
    kimiSupported: extractField(text, 'KIMI_SUPPORTED'),
    citedReasoning: extractField(text, 'CITED_REASONING') || extractField(text, 'RATIONALE'),
  };
}

function normalizeRecheckPrompts(value) {
  const text = String(value || '').trim();
  if (!text || /^none\b/i.test(text)) return [];

  const lines = text.split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const listLines = lines
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean);

  if (listLines.length > 1) return listLines;
  return [text];
}

function evidenceManifest(evidenceSources = []) {
  if (!Array.isArray(evidenceSources) || evidenceSources.length === 0) return 'none';
  return evidenceSources.map((source, index) => [
    `${index + 1}. ${source.path}:${source.line_start}-${source.line_end}`,
    `artifact_sha256=${source.artifact_sha256} artifact_bytes=${source.artifact_bytes}`,
    `excerpt_sha256=${source.excerpt_sha256} excerpt_bytes=${source.excerpt_bytes}`,
    'delivery=verbatim_in_original_query access=prompt_supplied_not_repo_tool',
  ].join(' | ')).join('\n');
}

function hasEvidenceAttestation(source) {
  return source && Object.prototype.hasOwnProperty.call(source, 'artifact_sha256');
}

function buildAttestedPromptProvenance(prompt, suppliedSources = []) {
  const provenance = buildPromptProvenance(prompt, suppliedSources);
  const text = String(prompt || '');
  for (const source of suppliedSources.filter(hasEvidenceAttestation)) {
    const excerpt = String(source.excerpt);
    let occurrences = 0;
    let offset = 0;
    while ((offset = text.indexOf(excerpt, offset)) !== -1) {
      occurrences += 1;
      offset += Math.max(excerpt.length, 1);
    }
    if (occurrences < 1) {
      const error = new Error(`Evidence source ${source.path} is missing from provider prompt`);
      error.code = 'EVIDENCE_PROVENANCE_INVALID';
      throw error;
    }
  }
  return provenance;
}

function buildMercuryRecheckPrompt({
  originalQuery,
  mercuryAnswer,
  fableAnswer,
  parsedReview,
  parsedConsensus,
  evidenceSources = [],
  focusedInstruction = null,
} = {}) {
  const parsed = parsedReview || parsedConsensus;
  const directPrompts = normalizeRecheckPrompts(parsed && parsed.recheckPrompt);
  const nextCheck = focusedInstruction || directPrompts[0] || (parsed && parsed.nextCheck)
    || 'Recheck Fable critique with current repo evidence.';

  return [
    'READ-ONLY AUDIT. Do not edit code.',
    'Mercury, recheck your prior answer against Fable critique.',
    '',
    'Original user prompt:',
    String(originalQuery || '').trim() || '<empty>',
    '',
    'Host-attested evidence manifest (the verbatim excerpts are supplied inside the original prompt above; they were not opened by model tools):',
    evidenceManifest(evidenceSources),
    '',
    'Your prior answer:',
    String(mercuryAnswer || '').trim() || '<empty>',
    '',
    'Fable critique:',
    String(fableAnswer || '').trim() || '<empty>',
    '',
    'Required recheck:',
    nextCheck,
    '',
    'Use current repo tools and file:line evidence. Answer only the disputed point, then say whether your original verdict changes.',
  ].join('\n');
}

function buildMercuryRecheckPrompts(args = {}) {
  const parsed = args.parsedReview || args.parsedConsensus;
  const prompts = normalizeRecheckPrompts(parsed && parsed.recheckPrompt);
  if (prompts.length > 0) {
    return prompts.map(focusedInstruction => buildMercuryRecheckPrompt({ ...args, focusedInstruction }));
  }
  return [buildMercuryRecheckPrompt(args)];
}

function formatRecheck(recheck, index, prompt) {
  return [
    `${index}. MERCURY RECHECK ${index}`,
    'Prompt:',
    prompt || '<empty>',
    `Verdict: ${recheck && recheck.termination ? recheck.termination : 'unknown'}`,
    `Iterations: ${recheck && recheck.iterations == null ? 'unknown' : recheck.iterations}`,
    'Evidence:',
    String(recheck && recheck.answer || '').trim() || '<empty>',
    'Commands:',
    recheck && recheck.toolTelemetry ? formatToolTelemetry(recheck.toolTelemetry) : '<none recorded>',
    'Result:',
    String(recheck && recheck.answer || '').trim() || '<empty>',
  ].join('\n');
}

function formatFinalReview(finalReview) {
  if (!finalReview) {
    return [
      'Verdict: missing',
      'Blocking: yes',
      'Shared conclusion: none',
      'Mercury supported:',
      '<not adjudicated>',
      'Fable supported:',
      '<not adjudicated>',
      'Kimi supported:',
      '<not adjudicated>',
      'Full Kimi answer:',
      '<missing>',
    ].join('\n');
  }

  const parsed = finalReview.parsed || parseAdversarialReviewAnswer(finalReview.answer);
  return [
    'Consensus:',
    parsed.consensus || '<not specified>',
    'Contradictions:',
    parsed.contradictions || '<not specified>',
    'Partial:',
    parsed.partial || '<not specified>',
    'Unique:',
    parsed.unique || '<not specified>',
    'Blind spots:',
    parsed.blindSpots || '<not specified>',
    `Verdict: ${parsed.verdict || 'unknown'}`,
    `Blocking: ${parsed.blocking ? 'yes' : 'no'}`,
    'Shared conclusion:',
    parsed.sharedConclusion || '<none>',
    'Mercury supported:',
    parsed.mercurySupported || '<not specified>',
    'Fable supported:',
    parsed.fableSupported || '<not specified>',
    'Kimi supported:',
    parsed.kimiSupported || '<not specified>',
    'Cited reasoning:',
    parsed.citedReasoning || '<not specified>',
    'Full Kimi answer:',
    String(finalReview.answer || '').trim() || '<empty>',
  ].join('\n');
}

function finalReviewDecision(finalReview, parsedFirstReview, rechecks) {
  if (!finalReview || finalReview.ok !== true) {
    if (!parsedFirstReview.blocking) {
      return {
        verdict: parsedFirstReview.verdict || 'pass',
        decision: 'pass_pending_local_proof',
        why: 'Fable did not identify a blocking challenge, so Kimi tie-break adjudication was not required.',
        residualRisk: 'Local tests/gates still control commit approval.',
        nextAction: parsedFirstReview.nextCheck || '<none>',
      };
    }
    return {
      verdict: 'needs_more_evidence',
      decision: 'needs_more_evidence',
      why: 'Kimi final adjudication did not complete.',
      residualRisk: 'Mercury and Fable disagreement remains unresolved.',
      nextAction: parsedFirstReview.nextCheck || parsedFirstReview.requiredRecheck || '<rerun final adjudication>',
    };
  }

  const parsedFinal = finalReview.parsed || parseAdversarialReviewAnswer(finalReview.answer);
  const verdict = parsedFinal.verdict || 'unknown';
  if (verdict === 'models_disagree') {
    return {
      verdict,
      decision: 'models_disagree',
      why: parsedFinal.sharedConclusion || 'No shared conclusion across Mercury, Fable, and Kimi.',
      residualRisk: 'Do not treat this review as green; inspect each model-supported claim separately.',
      nextAction: parsedFinal.nextCheck || parsedFirstReview.nextCheck || '<operator adjudication required>',
    };
  }

  if (parsedFinal.blocking) {
    return {
      verdict,
      decision: verdict === 'found_break' ? 'found_break' : 'needs_more_evidence',
      why: parsedFinal.citedReasoning || parsedFinal.disagreement || 'Kimi final adjudication remained blocking.',
      residualRisk: parsedFinal.sharedConclusion || 'Blocking adjudication remains unresolved.',
      nextAction: parsedFinal.nextCheck || parsedFirstReview.nextCheck || '<resolve final blocking finding>',
    };
  }

  return {
    verdict,
    decision: verdict === 'found_break' ? 'found_break' : 'pass_pending_local_proof',
    why: parsedFinal.citedReasoning || (rechecks.length > 0
      ? 'Kimi adjudicated the Fable challenge after Mercury recheck evidence.'
      : 'Fable did not identify a blocking challenge and Kimi found no unresolved disagreement.'),
    residualRisk: parsedFinal.sharedConclusion || 'Local tests/gates still control commit approval.',
    nextAction: parsedFinal.nextCheck || '<none>',
  };
}

function formatAdversarialReviewPacket({
  originalQuery,
  mercuryResult,
  review,
  consensus,
  reviewIntent = 'adversarial',
} = {}) {
  const intent = normalizeReviewIntent(reviewIntent);
  const reviewData = review || consensus;
  const parsed = reviewData && reviewData.parsed ? reviewData.parsed : parseAdversarialReviewAnswer(reviewData && reviewData.answer);
  if (intent === 'architecture' || intent === 'planning') {
    return [
      `MODE: ${intent}`,
      'VERDICT: synthesis',
      '',
      '1. Original Prompt',
      String(originalQuery || '').trim() || '<empty>',
      '',
      '2. Mercury Pass 1',
      `Verdict: ${mercuryResult && mercuryResult.termination ? mercuryResult.termination : 'unknown'}`,
      'Claims:',
      String(mercuryResult && mercuryResult.answer || '').trim() || '<empty>',
      'Evidence:',
      mercuryResult && mercuryResult.toolTelemetry && Array.isArray(mercuryResult.toolTelemetry.filesOpened)
        ? mercuryResult.toolTelemetry.filesOpened.map((ref) => `- ${ref} -> opened by Mercury`).join('\n') || '- <none recorded>'
        : '- <none recorded>',
      'Commands:',
      mercuryResult && mercuryResult.toolTelemetry ? `- ${formatToolTelemetry(mercuryResult.toolTelemetry)} -> tool telemetry` : '- <none recorded>',
      '',
      '3. Fable Synthesis Review',
      `Verdict: ${parsed.verdict || 'synthesis'}`,
      'Full Fable answer:',
      String(reviewData && reviewData.answer || '').trim() || '<empty>',
      '',
      '4. Final Resolution',
      'Decision:',
      intent === 'architecture' ? 'architecture_synthesis_complete' : 'planning_synthesis_complete',
      'Why:',
      'This mode is advisory/synthesis-oriented. It does not create commit-blocking verdicts or Mercury rechecks.',
      'Residual Risk:',
      'Operator must decide which recommendations become implementation lanes with their own scoped proofs.',
      'Required Next Action:',
      'Convert selected recommendations into one-lane implementation missions.',
    ].join('\n');
  }
  const rechecks = Array.isArray(reviewData && reviewData.rechecks)
    ? reviewData.rechecks
    : (reviewData && reviewData.recheck ? [reviewData.recheck] : []);
  const recheckPrompts = Array.isArray(reviewData && reviewData.recheckPrompts)
    ? reviewData.recheckPrompts
    : (reviewData && reviewData.recheckPrompt ? [reviewData.recheckPrompt] : []);
  const finalReview = reviewData && reviewData.finalReview ? reviewData.finalReview : null;
  const finalDecision = finalReviewDecision(finalReview, parsed, rechecks);

  const sections = [
    `VERDICT: ${finalDecision.verdict}`,
    '',
    '1. Original Prompt',
    String(originalQuery || '').trim() || '<empty>',
    '',
    '2. Mercury Pass 1',
    `Verdict: ${mercuryResult && mercuryResult.termination ? mercuryResult.termination : 'unknown'}`,
    'Claims:',
    String(mercuryResult && mercuryResult.answer || '').trim() || '<empty>',
    'Evidence:',
    mercuryResult && mercuryResult.toolTelemetry && Array.isArray(mercuryResult.toolTelemetry.filesOpened)
      ? mercuryResult.toolTelemetry.filesOpened.map((ref) => `- ${ref} -> opened by Mercury`).join('\n') || '- <none recorded>'
      : '- <none recorded>',
    'Commands:',
    mercuryResult && mercuryResult.toolTelemetry ? `- ${formatToolTelemetry(mercuryResult.toolTelemetry)} -> tool telemetry` : '- <none recorded>',
    'Gaps:',
    parsed.blocking ? (parsed.disagreement || parsed.requiredRecheck || parsed.nextCheck || '<not specified>') : '<none from Fable>',
    '',
    '3. Fable Review',
    `Verdict: ${parsed.verdict || 'unknown'}`,
    'Agreements:',
    '<see Fable answer>',
    'Disagreements:',
    parsed.disagreement ? `- ${parsed.disagreement}` : '- none',
    'Required Rechecks:',
    parsed.requiredRecheck || parsed.nextCheck || '<none>',
    'Full Fable answer:',
    String(reviewData && reviewData.answer || '').trim() || '<empty>',
    '',
    '4. Mercury Recheck',
  ];

  if (rechecks.length > 0) {
    rechecks.forEach((recheck, index) => {
      sections.push(formatRecheck(recheck, index + 1, recheckPrompts[index]));
    });
  } else {
    sections.push(parsed.blocking
      ? 'Not run: no executable recheck prompt was available.'
      : 'Not run: Fable did not mark the review blocking.');
  }

  sections.push(
    '',
    '5. Kimi Final Adjudication',
    formatFinalReview(finalReview),
    '',
    '6. Final Resolution',
    'Decision:',
    finalDecision.decision,
    'Why:',
    finalDecision.why,
    'Residual Risk:',
    finalDecision.residualRisk,
    'Required Next Action:',
    finalDecision.nextAction
  );

  return sections.join('\n');
}

function buildAdversarialReviewPrompt({
  query,
  mercuryResult,
  runLedgerCitation = null,
  reviewIntent = 'adversarial',
  evidenceSources = [],
} = {}) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error('Adversarial review prompt requires the original query');
  }
  if (!mercuryResult || typeof mercuryResult !== 'object') {
    throw new Error('Adversarial review prompt requires a Mercury result object');
  }

  const telemetry = mercuryResult.toolTelemetry
    ? formatToolTelemetry(mercuryResult.toolTelemetry)
    : 'unavailable';
  const intent = normalizeReviewIntent(reviewIntent);

  if (intent === 'architecture') {
    return [
      'READ-ONLY ARCHITECTURE REVIEW. Do not edit code.',
      'Review Mercury as the second tier in an architecture synthesis, not as a commit gate.',
      '',
      'Rules for this pass:',
      '- You do not have repo tools in this review pass.',
      '- Treat Mercury citations, run telemetry, and the original prompt as your evidence base.',
      '- Critique Mercury concretely: unsupported claims, stale context, missing ownership boundaries, missing data flow, missing invariants, missing build-vs-buy, missing migration detail, and weak governance.',
      '- Do not invent file:line citations or current-code facts.',
      '- If evidence is insufficient, label the evidence gap and state what a later repo-tool pass must inspect.',
      '- Produce an evolved Mercury+Fable architecture report, not a pass/fail verdict and not a short summary.',
      '',
      'Return these sections:',
      'VERDICT: architecture_synthesis | needs_more_evidence',
      'MERCURY_CRITIQUE: <specific weaknesses and what you kept>',
      'EVIDENCE_LIMITS: <what Mercury proved vs what remains unproven>',
      'EVOLVED_ARCHITECTURE: <full architecture synthesis>',
      'BUILD_VS_BUY: <recommendations>',
      'MIGRATION_ROADMAP: <incremental phases>',
      'RISKS_AND_CRITICISMS: <strongest criticisms>',
      'NEXT_LANES: <operator-sized follow-up lanes>',
      '',
      `Original user prompt:\n${query.trim()}`,
      '',
      `Host-attested evidence manifest:\n${evidenceManifest(evidenceSources)}`,
      '',
      `Mercury termination: ${mercuryResult.termination || 'unknown'}`,
      `Mercury iterations: ${mercuryResult.iterations == null ? 'unknown' : mercuryResult.iterations}`,
      `Mercury run ledger: ${runLedgerCitation || 'not written yet'}`,
      `Mercury tool telemetry: ${telemetry}`,
      '',
      `Mercury answer:\n${String(mercuryResult.answer || '').trim() || '<empty>'}`,
    ].join('\n');
  }

  if (intent === 'planning') {
    return [
      'READ-ONLY PLANNING REVIEW. Do not edit code.',
      'Review Mercury as the second tier in an implementation planning pass, not as a commit gate.',
      '',
      'Rules for this pass:',
      '- You do not have repo tools in this review pass.',
      '- Critique Mercury for missing prior art, wrong sequencing, missing tests, missing rollback, hidden scope expansion, and unresolved operator decisions.',
      '- Do not invent file:line citations or current-code facts.',
      '- Produce an evolved Mercury+Fable plan that can be handed to an implementation agent.',
      '',
      'Return these sections:',
      'VERDICT: planning_synthesis | needs_more_evidence',
      'MERCURY_CRITIQUE: <specific weaknesses and what you kept>',
      'EVIDENCE_LIMITS: <what Mercury proved vs what remains unproven>',
      'IMPLEMENTATION_PLAN: <ordered lanes and exact proof requirements>',
      'ROLLBACK_PLAN: <how to revert safely>',
      'TEST_PLAN: <behavior tests, static tests, gates>',
      'OPEN_DECISIONS: <operator rulings needed>',
      'NEXT_LANES: <operator-sized follow-up lanes>',
      '',
      `Original user prompt:\n${query.trim()}`,
      '',
      `Host-attested evidence manifest:\n${evidenceManifest(evidenceSources)}`,
      '',
      `Mercury termination: ${mercuryResult.termination || 'unknown'}`,
      `Mercury iterations: ${mercuryResult.iterations == null ? 'unknown' : mercuryResult.iterations}`,
      `Mercury run ledger: ${runLedgerCitation || 'not written yet'}`,
      `Mercury tool telemetry: ${telemetry}`,
      '',
      `Mercury answer:\n${String(mercuryResult.answer || '').trim() || '<empty>'}`,
    ].join('\n');
  }

  return [
    'READ-ONLY AUDIT. Do not edit code.',
    'Review Mercury as an adversarial reviewer, not a consensus collaborator.',
    '',
    'Rules for this pass:',
    '- You do not have repo tools in this Fable review pass.',
    '- Do not agree by default.',
    '- Identify weak assumptions, stale context, unsupported claims, missing file:line evidence, missing tests, and scope drift.',
    '- Do not invent file:line citations or current-code facts.',
    '- Treat Mercury citations and run-check artifacts as the only evidence available here.',
    '- If the evidence is insufficient, say needs_more_evidence and name the exact recheck.',
    '- If Mercury missed a blocking check, set CONSENSUS_BLOCKING: yes and provide RECHECK_PROMPT with the exact Mercury follow-up prompt.',
    '- If no recheck is needed, set RECHECK_PROMPT: none.',
    '',
    'Return exactly these fields:',
    'VERDICT: pass | needs_more_evidence | found_break | blocked',
    'CONSENSUS_BLOCKING: yes | no',
    'RATIONALE: <why>',
    'DISAGREEMENT: <specific Mercury claim challenged, or none>',
    'REQUIRED_RECHECK: <specific file:line/command/scenario, or none>',
    'RECHECK_PROMPT: <exact prompt to send Mercury next, or none>',
    'NEXT_CHECK: <operator/local proof still needed, or none>',
    '',
    `Original user prompt:\n${query.trim()}`,
    '',
    `Host-attested evidence manifest:\n${evidenceManifest(evidenceSources)}`,
    '',
    `Mercury termination: ${mercuryResult.termination || 'unknown'}`,
    `Mercury iterations: ${mercuryResult.iterations == null ? 'unknown' : mercuryResult.iterations}`,
    `Mercury run ledger: ${runLedgerCitation || 'not written yet'}`,
    `Mercury tool telemetry: ${telemetry}`,
    '',
    `Mercury answer:\n${String(mercuryResult.answer || '').trim() || '<empty>'}`,
  ].join('\n');
}

function buildKimiFinalAdjudicationPrompt({
  query,
  mercuryResult,
  review,
  evidenceSources = [],
} = {}) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error('Kimi final adjudication prompt requires the original query');
  }
  if (!mercuryResult || typeof mercuryResult !== 'object') {
    throw new Error('Kimi final adjudication prompt requires a Mercury result object');
  }
  if (!review || typeof review !== 'object') {
    throw new Error('Kimi final adjudication prompt requires the Fable review object');
  }

  const rechecks = Array.isArray(review.rechecks)
    ? review.rechecks
    : (review.recheck ? [review.recheck] : []);
  const recheckPrompts = Array.isArray(review.recheckPrompts)
    ? review.recheckPrompts
    : (review.recheckPrompt ? [review.recheckPrompt] : []);
  const mercuryTelemetry = mercuryResult.toolTelemetry
    ? formatToolTelemetry(mercuryResult.toolTelemetry)
    : 'unavailable';
  const answerQualityFlags = mercuryResult.answerQuality && Array.isArray(mercuryResult.answerQuality.flags)
    ? mercuryResult.answerQuality.flags.join(', ') || 'none'
    : 'unavailable';
  const answerQualityEvidence = mercuryResult.answerQuality && Array.isArray(mercuryResult.answerQuality.evidence)
    ? JSON.stringify(mercuryResult.answerQuality.evidence)
    : 'unavailable';

  const recheckSections = rechecks.length > 0
    ? rechecks.map((recheck, index) => formatRecheck(recheck, index + 1, recheckPrompts[index])).join('\n\n')
    : '<none>';

  return [
    'READ-ONLY FINAL ADJUDICATION. Do not edit code.',
    'You are Kimi, the reasoning adjudicator for the OGZPrime adversarial layer.',
    '',
    'Your job is not to agree with Mercury or Fable. Compare their answers before verdict and decide whether the end state is supported by cited evidence.',
    'Use only the material below: the original prompt, Mercury pass 1, Mercury tool telemetry, answer-quality flags, Fable critique, and Mercury rechecks.',
    'Do not invent repo facts or file:line citations. If evidence is missing, say so.',
    'Do not merge the answers into a blended narrative. Attribute every item to the reporter that holds it by name.',
    'If Mercury, Fable, and you still do not converge, return VERDICT: disagree and preserve what each model individually supported.',
    '',
    'Return exactly these fields in this order, one label per line. VERDICT must be last:',
    'CONSENSUS: claims all reporters agree on, with citations, or none',
    'CONTRADICTIONS: reporter disagreements with each position and repo-supported resolution, or none',
    'PARTIAL: claims only one reporter reached and others did not verify, or none',
    'UNIQUE: supported insight one reporter surfaced that the others missed, or none',
    'BLIND_SPOTS: required question areas no reporter addressed, or none',
    'DISAGREEMENT: one-line live dispute if any, else none',
    'CONSENSUS_BLOCKING: yes | no',
    'REQUIRED_RECHECKS: list, may be empty',
    'RECHECK_PROMPT: exact question for the recheck, or empty',
    'VERDICT: pass | disagree | needs_more_evidence',
    '',
    'Rules: VERDICT: pass with non-empty CONTRADICTIONS contradicts the tape; resolve or route to recheck. BLIND_SPOTS must be recorded but does not block by itself. Never quote model confidence as evidence.',
    '',
    `Original user prompt:\n${query.trim()}`,
    '',
    `Host-attested evidence manifest:\n${evidenceManifest(evidenceSources)}`,
    '',
    `Mercury termination: ${mercuryResult.termination || 'unknown'}`,
    `Mercury iterations: ${mercuryResult.iterations == null ? 'unknown' : mercuryResult.iterations}`,
    `Mercury tool telemetry: ${mercuryTelemetry}`,
    `Mercury answer quality flags: ${answerQualityFlags}`,
    `Mercury answer quality evidence: ${answerQualityEvidence}`,
    '',
    `Mercury pass 1 answer:\n${String(mercuryResult.answer || '').trim() || '<empty>'}`,
    '',
    `Fable parsed verdict: ${review.parsed && review.parsed.verdict ? review.parsed.verdict : 'unknown'}`,
    `Fable blocking: ${review.parsed && review.parsed.blocking ? 'yes' : 'no'}`,
    `Fable answer:\n${String(review.answer || '').trim() || '<empty>'}`,
    '',
    `Mercury rechecks:\n${recheckSections}`,
  ].join('\n');
}

const OPUS_ELIGIBLE_CLAUDE_CODES = Object.freeze(new Set([
  'rate_limit_error',
  'rate_limit_exceeded',
  'usage_limit_reached',
  'model_unavailable',
  'model_not_found',
  'overloaded_error',
]));

function trustedFableErrorMetadata(metadata) {
  const auth = metadata.authStatus || {};
  const trust = metadata.executableTrust || {};
  const appliedModels = Array.isArray(metadata.appliedModels) ? metadata.appliedModels : [];
  return metadata.provider === 'claude-code'
    && metadata.requestedModel === 'fable'
    && claudeAppliedModelMatchesAlias('fable', metadata.appliedModel)
    && appliedModels.length > 0
    && appliedModels.includes(metadata.appliedModel)
    && appliedModels.every(model => claudeAppliedModelMatchesAlias('fable', model))
    && auth.authMethod === 'claude.ai'
    && auth.apiProvider === 'firstParty'
    && trust.trusted === true
    && typeof trust.realpath === 'string'
    && typeof trust.version === 'string';
}

function classifyClaudeProviderErrorFrame(frame) {
  if (!frame || frame.type !== 'result' || frame.is_error !== true) return null;
  if (
    frame.api_error_status != null
    && frame.api_error_status !== 429
    && frame.api_error_status !== 503
  ) return null;
  if (frame.error && typeof frame.error === 'object' && !Array.isArray(frame.error)) {
    const machineFields = ['type', 'code', 'error_code']
      .filter(key => Object.prototype.hasOwnProperty.call(frame.error, key))
      .map(key => ({ key, value: typeof frame.error[key] === 'string' ? frame.error[key].toLowerCase() : null }));
    if (machineFields.length > 0) {
      const uniqueValues = new Set(machineFields.map(field => field.value));
      if (uniqueValues.size !== 1) return null;
      const [{ key, value }] = machineFields;
      if (!OPUS_ELIGIBLE_CLAUDE_CODES.has(value)) return null;
      return { category: value, opusEligible: true, evidence: `provider_frame:result.error.${key}:${value}` };
    }
  }
  if (frame.api_error_status === 429) {
    return { category: 'rate_limited', opusEligible: true, evidence: 'provider_frame:result.api_error_status:429' };
  }
  if (frame.api_error_status === 503) {
    return { category: 'provider_unavailable', opusEligible: true, evidence: 'provider_frame:result.api_error_status:503' };
  }
  return null;
}

function cleanStageError(error) {
  if (!error) return null;
  const clean = {
    name: error.name || 'Error',
    message: error.message || String(error),
  };
  if (['string', 'number'].includes(typeof error.code)) clean.code = error.code;
  if (typeof error.subcondition === 'string') clean.subcondition = error.subcondition;
  if (Array.isArray(error.subconditions)) clean.subconditions = [...error.subconditions];
  return sanitizeForLedger(clean);
}

function classifyFableFallbackError(error) {
  if (error && error.rawPersistenceFailed) {
    return { category: 'receipt_persistence_failure', opusEligible: false, evidence: 'raw_receipt_write_failed' };
  }
  const metadata = error && error.providerMetadata ? error.providerMetadata : {};
  if (!trustedFableErrorMetadata(metadata)) {
    return { category: 'untrusted_provider_error', opusEligible: false, evidence: 'missing_trusted_fable_error_provenance' };
  }
  const terminalResult = [...(metadata.providerFrames || [])]
    .reverse()
    .find(frame => frame && frame.type === 'result');
  const classification = classifyClaudeProviderErrorFrame(terminalResult);
  if (classification) return classification;
  return { category: 'non_fallback_error', opusEligible: false, evidence: 'no_allowlisted_machine_signal' };
}

function stageAttemptReceipt({
  role,
  metadata = {},
  status,
  attemptNumber,
  error = null,
  prompt,
  suppliedSources = [],
  rawOutput = null,
  rawError = null,
  inputProvenance = null,
}) {
  return {
    role,
    attempt: attemptNumber,
    status,
    requested_provider: metadata.provider || null,
    requested_model: metadata.requestedModel || null,
    applied_model: metadata.appliedModel || null,
    applied_models: Array.isArray(metadata.appliedModels)
      ? [...metadata.appliedModels]
      : (metadata.appliedModel ? [metadata.appliedModel] : []),
    started_at: metadata.startedAt || null,
    finished_at: metadata.finishedAt || null,
    latency_ms: metadata.latencyMs == null ? null : metadata.latencyMs,
    termination: metadata.termination || null,
    parse_status: metadata.parseStatus || null,
    exit_code: metadata.exitCode == null ? null : metadata.exitCode,
    retry_status: role === 'opus_challenger' ? 'emergency_replacement' : 'primary_attempt',
    input_provenance: inputProvenance || buildAttestedPromptProvenance(prompt, suppliedSources),
    raw_output: rawOutput,
    raw_error: rawError,
    tools: {
      enabled: false,
      available: Array.isArray(metadata.toolsAvailable) ? metadata.toolsAvailable : [],
      calls: [],
      total: 0,
      succeeded: 0,
      failed: 0,
    },
    files_mechanically_opened: [],
    claimed_file_citations: [],
    auth_posture: metadata.authStatus || null,
    executable_trust: metadata.executableTrust || null,
    error: cleanStageError(error),
    repo_adjudication: { status: 'pending', authority: 'live_repo_required' },
  };
}

async function executePromptOnlyStage({
  role,
  prompt,
  suppliedSources = [],
  createClient,
  persistRaw,
  attemptNumber,
}) {
  const startedAt = new Date();
  let client = null;
  const inputProvenance = buildAttestedPromptProvenance(prompt, suppliedSources);
  try {
    client = createClient({ systemPrompt: config.CONSENSUS_SYSTEM_PROMPT });
    await client.initialize();
    if (typeof client.generateResponseWithMetadata !== 'function') {
      throw new Error(`${role} client lacks metadata-returning response support`);
    }
    const response = await client.generateResponseWithMetadata(prompt, client.maxTokens);
    if (!response.metadata || !response.metadata.appliedModel) {
      const error = new Error(`${role} response omitted provider-applied model identity`);
      error.providerMetadata = response.metadata || {};
      throw error;
    }
    if (Array.isArray(response.metadata.toolsAvailable) && response.metadata.toolsAvailable.length > 0) {
      const error = new Error(`${role} unexpectedly exposed tools in a prompt-only stage`);
      error.providerMetadata = response.metadata;
      throw error;
    }
    let rawOutput;
    let rawError;
    try {
      rawOutput = persistRaw(role, attemptNumber, response.metadata.rawResponse || Buffer.alloc(0));
      rawError = response.metadata.rawError && response.metadata.rawError.length > 0
        ? persistRaw(`${role}-stderr`, attemptNumber, response.metadata.rawError)
        : null;
    } catch (persistError) {
      persistError.providerMetadata = response.metadata;
      persistError.rawPersistenceFailed = true;
      persistError.persistedRawOutput = rawOutput || null;
      throw persistError;
    }
    const receipt = stageAttemptReceipt({
      role, attemptNumber, metadata: response.metadata, status: 'succeeded',
      prompt, suppliedSources, rawOutput, rawError, inputProvenance,
    });
    receipt.claimed_file_citations = extractClaimedFileCitations(response.answer);
    return { answer: response.answer, receipt };
  } catch (error) {
    const roleIdentity = role === 'kimi_tie_breaker'
      ? { provider: config.TIE_BREAKER_PROVIDER, requestedModel: config.TIE_BREAKER_MODEL }
      : {
        provider: config.CONSENSUS_PROVIDER,
        requestedModel: role === 'opus_challenger' ? config.CONSENSUS_EMERGENCY_MODEL : config.CONSENSUS_MODEL,
      };
    const metadata = {
      provider: client && client.providerName ? client.providerName : roleIdentity.provider,
      requestedModel: client && client.model ? client.model : roleIdentity.requestedModel,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt.getTime(),
      termination: 'error',
      parseStatus: 'request_failed',
      ...(error.providerMetadata || {}),
    };
    let rawOutput = error.persistedRawOutput || null;
    let rawError = null;
    if (!error.rawPersistenceFailed) {
      try {
        rawOutput = persistRaw(role, attemptNumber, metadata.rawResponse || Buffer.alloc(0));
        rawError = metadata.rawError && metadata.rawError.length > 0
          ? persistRaw(`${role}-stderr`, attemptNumber, metadata.rawError)
          : null;
      } catch (persistError) {
        persistError.providerMetadata = metadata;
        persistError.rawPersistenceFailed = true;
        persistError.providerFailure = sanitizeForLedger(error.message);
        error = persistError;
      }
    }
    error.stageAttempt = stageAttemptReceipt({
      role, attemptNumber, metadata, status: 'failed', error,
      prompt, suppliedSources, rawOutput, rawError, inputProvenance,
    });
    throw error;
  }
}

async function runFableAdversarialReview({
  query,
  mercuryResult,
  runLedgerCitation = null,
  reviewIntent = 'adversarial',
  createFableClient = createFableChallengerClient,
  createOpusClient = createOpusChallengerClient,
  persistRaw = () => null,
  now = Date.now,
  evidenceSources = [],
} = {}) {
  const prompt = buildAdversarialReviewPrompt({
    query, mercuryResult, runLedgerCitation, reviewIntent, evidenceSources,
  });
  const suppliedSources = [
    { path: 'input://original-query', excerpt: query.trim() },
    ...evidenceSources,
    { path: 'mercury://primary-answer', excerpt: String(mercuryResult.answer || '').trim() || '<empty>' },
    ...(runLedgerCitation ? [{ path: 'mercury://run-ledger-citation', excerpt: runLedgerCitation }] : []),
  ];
  buildAttestedPromptProvenance(prompt, suppliedSources);
  const started = now();
  const attempts = [];
  let stage;
  try {
    stage = await executePromptOnlyStage({
      role: 'fable_challenger', prompt, suppliedSources,
      createClient: createFableClient, persistRaw, attemptNumber: 1,
    });
    attempts.push(stage.receipt);
  } catch (fableError) {
    attempts.push(fableError.stageAttempt);
    const classification = classifyFableFallbackError(fableError);
    attempts[0].fallback_classification = classification;
    if (!classification.opusEligible) {
      fableError.challengerAttempts = attempts;
      throw fableError;
    }
    try {
      stage = await executePromptOnlyStage({
        role: 'opus_challenger', prompt, suppliedSources,
        createClient: createOpusClient, persistRaw, attemptNumber: 2,
      });
      attempts.push(stage.receipt);
    } catch (opusError) {
      attempts.push(opusError.stageAttempt);
      opusError.challengerAttempts = attempts;
      throw opusError;
    }
  }
  const answer = stage.answer;

  return {
    mode: 'adversarial_review',
    reviewIntent: normalizeReviewIntent(reviewIntent),
    enabled: true,
    ok: true,
    provider: stage.receipt.requested_provider,
    model: stage.receipt.requested_model,
    appliedModel: stage.receipt.applied_model,
    latencyMs: now() - started,
    answer,
    parsed: parseAdversarialReviewAnswer(answer),
    attempts,
    stageReceipt: stage.receipt,
    repoAdjudication: { status: 'pending', authority: 'live_repo_required' },
  };
}

async function runKimiFinalAdjudication({
  query,
  mercuryResult,
  review,
  createClient = createKimiTieBreakerClient,
  persistRaw = () => null,
  now = Date.now,
  evidenceSources = [],
} = {}) {
  const prompt = buildKimiFinalAdjudicationPrompt({ query, mercuryResult, review, evidenceSources });
  const rechecks = Array.isArray(review.rechecks) ? review.rechecks : [];
  const suppliedSources = [
    { path: 'input://original-query', excerpt: query.trim() },
    ...evidenceSources,
    { path: 'mercury://primary-answer', excerpt: String(mercuryResult.answer || '').trim() || '<empty>' },
    { path: 'challenger://answer', excerpt: String(review.answer || '').trim() || '<empty>' },
    ...rechecks.flatMap((recheck, index) => [
      {
        path: `mercury://recheck-${index + 1}-prompt`,
        excerpt: String((review.recheckPrompts || [])[index] || '').trim() || '<empty>',
      },
      {
        path: `mercury://recheck-${index + 1}-answer`,
        excerpt: String(recheck.answer || '').trim() || '<empty>',
      },
      {
        path: `mercury://recheck-${index + 1}-telemetry`,
        excerpt: recheck.toolTelemetry ? formatToolTelemetry(recheck.toolTelemetry) : 'unavailable',
      },
    ]),
  ];
  buildAttestedPromptProvenance(prompt, suppliedSources);
  const started = now();
  const stage = await executePromptOnlyStage({
    role: 'kimi_tie_breaker', prompt, suppliedSources, createClient, persistRaw, attemptNumber: 1,
  });
  const answer = stage.answer;

  return {
    mode: 'kimi_final_adjudication',
    enabled: true,
    ok: true,
    provider: stage.receipt.requested_provider,
    model: stage.receipt.requested_model,
    appliedModel: stage.receipt.applied_model,
    latencyMs: now() - started,
    answer,
    parsed: parseAdversarialReviewAnswer(answer),
    stageReceipt: stage.receipt,
    repoAdjudication: { status: 'pending', authority: 'live_repo_required' },
  };
}

function adversarialReviewFailure(err, { role = 'challenger' } = {}) {
  const stageAttempt = err && err.stageAttempt ? err.stageAttempt : null;
  const kimiFailure = role === 'kimi_tie_breaker';
  return {
    mode: kimiFailure ? 'kimi_final_adjudication' : 'adversarial_review',
    enabled: true,
    ok: false,
    provider: stageAttempt && stageAttempt.requested_provider
      ? stageAttempt.requested_provider
      : (kimiFailure ? config.TIE_BREAKER_PROVIDER : 'claude-code'),
    model: stageAttempt && stageAttempt.requested_model
      ? stageAttempt.requested_model
      : (kimiFailure ? config.TIE_BREAKER_MODEL : config.CONSENSUS_MODEL),
    attempts: err && Array.isArray(err.challengerAttempts)
      ? err.challengerAttempts
      : (stageAttempt ? [stageAttempt] : []),
    stageReceipt: stageAttempt,
    kimiSkipped: !kimiFailure,
    repoAdjudication: { status: 'pending', authority: 'live_repo_required' },
    error: cleanStageError(err),
  };
}

module.exports = {
  adversarialReviewRequested,
  reviewModeRequested,
  normalizeReviewIntent,
  kimiTieBreakerRequired,
  extractField,
  parseAdversarialReviewAnswer,
  buildMercuryRecheckPrompt,
  buildMercuryRecheckPrompts,
  formatAdversarialReviewPacket,
  buildAdversarialReviewPrompt,
  buildKimiFinalAdjudicationPrompt,
  buildAttestedPromptProvenance,
  evidenceManifest,
  OPUS_ELIGIBLE_CLAUDE_CODES,
  classifyClaudeProviderErrorFrame,
  classifyFableFallbackError,
  executePromptOnlyStage,
  runFableAdversarialReview,
  runKimiFinalAdjudication,
  adversarialReviewFailure,
};
