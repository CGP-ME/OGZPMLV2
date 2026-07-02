'use strict';

const config = require('./config');
const { createConsensusLlmClient } = require('./llm-client');
const { formatToolTelemetry } = require('./react-loop');

function consensusRequested(opts = {}) {
  if (opts.consensusExplicit === true) return opts.consensus === true;
  return config.CONSENSUS_DEFAULT_ENABLED === true;
}

function extractField(text, fieldName) {
  const source = String(text || '');
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^\\s*(?:\\*\\*)?${escapedField}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*)?[A-Z][A-Z0-9_ ]{2,}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?|$)`,
    'im'
  );
  const match = source.match(pattern);
  return match ? match[1].trim() : '';
}

function hasStructuredField(text, fieldName) {
  const source = String(text || '');
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*(?:\\*\\*)?${escapedField}(?:\\*\\*)?\\s*:`, 'im').test(source);
}

function parseConsensusAnswer(answer) {
  const text = String(answer || '');
  const verdict = extractField(text, 'VERDICT').split(/\s+/)[0].toLowerCase() || 'unknown';
  const blockingRaw = extractField(text, 'CONSENSUS_BLOCKING').toLowerCase();
  const explicitBlocking = /^(yes|true|blocking)\b/.test(blockingRaw);
  const missingBlockingField = !hasStructuredField(text, 'CONSENSUS_BLOCKING');
  const blocking = missingBlockingField || explicitBlocking || ['disagree', 'needs_more_evidence', 'found_break', 'blocked'].includes(verdict);
  const recheckPrompt = extractField(text, 'RECHECK_PROMPT');
  const nextCheck = extractField(text, 'NEXT_CHECK');
  return {
    verdict,
    blocking,
    parseWarnings: missingBlockingField ? ['missing_consensus_blocking_field'] : [],
    disagreement: extractField(text, 'DISAGREEMENT'),
    requiredRecheck: extractField(text, 'REQUIRED_RECHECK'),
    recheckPrompt,
    nextCheck,
  };
}

function buildMercuryRecheckPrompt({
  originalQuery,
  mercuryAnswer,
  fableAnswer,
  parsedConsensus,
} = {}) {
  const prompt = parsedConsensus && parsedConsensus.recheckPrompt
    ? parsedConsensus.recheckPrompt
    : '';
  if (prompt && !/^none\b/i.test(prompt)) {
    return prompt;
  }

  const nextCheck = parsedConsensus && parsedConsensus.nextCheck
    ? parsedConsensus.nextCheck
    : 'Recheck Fable critique with current repo evidence.';

  return [
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

function formatAdversarialReviewPacket({
  originalQuery,
  mercuryResult,
  consensus,
} = {}) {
  const parsed = consensus && consensus.parsed ? consensus.parsed : parseConsensusAnswer(consensus && consensus.answer);
  const recheck = consensus && consensus.recheck;
  const sections = [
    'VERDICT_PACKET: adversarial_review',
    '',
    '1. ORIGINAL PROMPT',
    String(originalQuery || '').trim() || '<empty>',
    '',
    '2. MERCURY PASS 1',
    `Termination: ${mercuryResult && mercuryResult.termination ? mercuryResult.termination : 'unknown'}`,
    `Iterations: ${mercuryResult && mercuryResult.iterations == null ? 'unknown' : mercuryResult.iterations}`,
    'Answer:',
    String(mercuryResult && mercuryResult.answer || '').trim() || '<empty>',
    '',
    '3. FABLE ADVERSARIAL REVIEW',
    `Verdict: ${parsed.verdict || 'unknown'}`,
    `Blocking: ${parsed.blocking ? 'yes' : 'no'}`,
    'Disagreement:',
    parsed.disagreement || '<none>',
    'Required recheck:',
    parsed.requiredRecheck || parsed.nextCheck || '<none>',
    'Full Fable answer:',
    String(consensus && consensus.answer || '').trim() || '<empty>',
  ];

  if (recheck) {
    sections.push(
      '',
      '4. MERCURY RECHECK',
      'Prompt:',
      consensus.recheckPrompt || '<empty>',
      `Termination: ${recheck.termination || 'unknown'}`,
      `Iterations: ${recheck.iterations == null ? 'unknown' : recheck.iterations}`,
      'Answer:',
      String(recheck.answer || '').trim() || '<empty>'
    );
  } else {
    sections.push(
      '',
      '4. MERCURY RECHECK',
      parsed.blocking ? 'Not run: no executable recheck prompt was available.' : 'Not run: Fable did not mark the review blocking.'
    );
  }

  sections.push(
    '',
    '5. RESOLUTION',
    recheck
      ? 'Final decision requires the Mercury recheck answer plus local command/test proof.'
      : (parsed.blocking ? 'Final decision is needs_more_evidence.' : 'Final decision may proceed if local command/test proof is green.'),
    'Residual risk:',
    recheck
      ? 'Review the recheck answer for new evidence gaps before using this as commit approval.'
      : (parsed.blocking ? 'Blocking critique remains unresolved.' : 'No Fable-blocking critique was raised.')
  );

  return sections.join('\n');
}

function buildConsensusPrompt({
  query,
  mercuryResult,
  runLedgerCitation = null,
} = {}) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error('Consensus prompt requires the original query');
  }
  if (!mercuryResult || typeof mercuryResult !== 'object') {
    throw new Error('Consensus prompt requires a Mercury result object');
  }

  const telemetry = mercuryResult.toolTelemetry
    ? formatToolTelemetry(mercuryResult.toolTelemetry)
    : 'unavailable';

  return [
    'Review Mercury as an independent consensus collaborator.',
    '',
    'Rules for this pass:',
    '- You do not have repo tools in this Fable consensus pass.',
    '- Do not invent file:line citations or current-code facts.',
    '- Treat Mercury citations and run-check artifacts as the only evidence available here.',
    '- If the evidence is insufficient, say needs_more_evidence and name the next check.',
    '- Be adversarial to Mercury. Agreement requires cited proof, not vibes.',
    '- If Mercury missed a blocking check, set CONSENSUS_BLOCKING: yes and provide RECHECK_PROMPT with the exact Mercury follow-up prompt.',
    '- If no recheck is needed, set RECHECK_PROMPT: none.',
    '',
    'Return exactly these fields:',
    'VERDICT: agree | disagree | needs_more_evidence',
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

async function runFableConsensus({
  query,
  mercuryResult,
  runLedgerCitation = null,
  createClient = createConsensusLlmClient,
  now = Date.now,
} = {}) {
  const client = createClient({ systemPrompt: config.CONSENSUS_SYSTEM_PROMPT });
  const prompt = buildConsensusPrompt({ query, mercuryResult, runLedgerCitation });
  const started = now();

  await client.initialize();
  const answer = await client.generateResponse(prompt, config.CONSENSUS_CLIENT_MAX_TOKENS);

  return {
    enabled: true,
    ok: true,
    provider: config.CONSENSUS_PROVIDER,
    model: config.CONSENSUS_MODEL,
    latencyMs: now() - started,
    answer,
    parsed: parseConsensusAnswer(answer),
  };
}

function consensusFailure(err) {
  return {
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
  consensusRequested,
  extractField,
  parseConsensusAnswer,
  buildMercuryRecheckPrompt,
  formatAdversarialReviewPacket,
  buildConsensusPrompt,
  runFableConsensus,
  consensusFailure,
};
