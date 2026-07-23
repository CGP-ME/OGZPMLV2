'use strict';

const config = require('./config');
const { createConsensusLlmClient } = require('./llm-client');
const { formatToolTelemetry } = require('./react-loop');

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

function parseAdversarialReviewAnswer(answer) {
  const text = String(answer || '');
  const verdict = extractField(text, 'VERDICT').split(/\s+/)[0].toLowerCase() || 'unknown';
  const blockingRaw = extractField(text, 'CONSENSUS_BLOCKING').toLowerCase()
    || extractField(text, 'ADVERSARIAL_REVIEW_BLOCKING').toLowerCase();
  const explicitBlocking = /^(yes|true|blocking)\b/.test(blockingRaw);
  const missingBlockingField = !hasStructuredField(text, 'CONSENSUS_BLOCKING')
    && !hasStructuredField(text, 'ADVERSARIAL_REVIEW_BLOCKING');
  const blocking = missingBlockingField || explicitBlocking || ['disagree', 'needs_more_evidence', 'found_break', 'blocked'].includes(verdict);
  const recheckPrompt = extractField(text, 'RECHECK_PROMPT');
  const nextCheck = extractField(text, 'NEXT_CHECK');
  return {
    verdict,
    blocking,
    parseWarnings: missingBlockingField ? ['missing_adversarial_review_blocking_field'] : [],
    disagreement: extractField(text, 'DISAGREEMENT'),
    requiredRecheck: extractField(text, 'REQUIRED_RECHECK')
      || extractField(text, 'REQUIRED_RECHECKS'),
    recheckPrompt,
    nextCheck,
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

function buildMercuryRecheckPrompt({
  originalQuery,
  mercuryAnswer,
  fableAnswer,
  parsedReview,
  parsedConsensus,
} = {}) {
  const parsed = parsedReview || parsedConsensus;
  const prompt = parsed && parsed.recheckPrompt ? parsed.recheckPrompt : '';
  const directPrompts = normalizeRecheckPrompts(prompt);
  if (directPrompts.length > 0) return directPrompts[0];

  const nextCheck = parsed && parsed.nextCheck
    ? parsed.nextCheck
    : 'Recheck Fable critique with current repo evidence.';

  return [
    'READ-ONLY AUDIT. Do not edit code.',
    'Mercury, recheck your prior answer against Fable critique.',
    '',
    'Original user prompt:',
    String(originalQuery || '').trim() || '<empty>',
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
  if (prompts.length > 0) return prompts;
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

  const sections = [
    `VERDICT: ${parsed.blocking && rechecks.length === 0 ? 'needs_more_evidence' : (parsed.verdict || 'unknown')}`,
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
    '5. Final Resolution',
    'Decision:',
    rechecks.length > 0
      ? 'Use Mercury recheck evidence plus local tests/gates as final authority.'
      : (parsed.blocking ? 'needs_more_evidence' : 'pass_pending_local_proof'),
    'Why:',
    rechecks.length > 0
      ? 'Fable challenge received a repo-tool Mercury answer.'
      : (parsed.blocking ? 'Fable found a blocking gap without a completed recheck.' : 'Fable did not identify a blocking challenge.'),
    'Residual Risk:',
    rechecks.length > 0
      ? 'Review the recheck answer for unresolved evidence gaps before using this as commit approval.'
      : (parsed.blocking ? 'Blocking critique remains unresolved.' : 'No Fable-blocking critique was raised.'),
    'Required Next Action:',
    parsed.nextCheck || '<none>'
  );

  return sections.join('\n');
}

function buildAdversarialReviewPrompt({
  query,
  mercuryResult,
  runLedgerCitation = null,
  reviewIntent = 'adversarial',
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
    `Mercury termination: ${mercuryResult.termination || 'unknown'}`,
    `Mercury iterations: ${mercuryResult.iterations == null ? 'unknown' : mercuryResult.iterations}`,
    `Mercury run ledger: ${runLedgerCitation || 'not written yet'}`,
    `Mercury tool telemetry: ${telemetry}`,
    '',
    `Mercury answer:\n${String(mercuryResult.answer || '').trim() || '<empty>'}`,
  ].join('\n');
}

async function runFableAdversarialReview({
  query,
  mercuryResult,
  runLedgerCitation = null,
  reviewIntent = 'adversarial',
  createClient = createConsensusLlmClient,
  now = Date.now,
} = {}) {
  const client = createClient({ systemPrompt: config.CONSENSUS_SYSTEM_PROMPT });
  const prompt = buildAdversarialReviewPrompt({ query, mercuryResult, runLedgerCitation, reviewIntent });
  const started = now();

  await client.initialize();
  const answer = await client.generateResponse(prompt, config.CONSENSUS_CLIENT_MAX_TOKENS);

  return {
    mode: 'adversarial_review',
    reviewIntent: normalizeReviewIntent(reviewIntent),
    enabled: true,
    ok: true,
    provider: config.CONSENSUS_PROVIDER,
    model: config.CONSENSUS_MODEL,
    latencyMs: now() - started,
    answer,
    parsed: parseAdversarialReviewAnswer(answer),
  };
}

function adversarialReviewFailure(err) {
  return {
    mode: 'adversarial_review',
    enabled: true,
    ok: false,
    provider: config.CONSENSUS_PROVIDER,
    model: config.CONSENSUS_MODEL,
    error: {
      name: err && err.name ? err.name : 'Error',
      message: err && err.message ? err.message : String(err),
    },
  };
}

module.exports = {
  adversarialReviewRequested,
  reviewModeRequested,
  normalizeReviewIntent,
  extractField,
  parseAdversarialReviewAnswer,
  buildMercuryRecheckPrompt,
  buildMercuryRecheckPrompts,
  formatAdversarialReviewPacket,
  buildAdversarialReviewPrompt,
  runFableAdversarialReview,
  adversarialReviewFailure,
};
