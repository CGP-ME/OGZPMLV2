'use strict';

const config = require('./config');
const { createConsensusLlmClient } = require('./llm-client');
const { formatToolTelemetry } = require('./react-loop');

function consensusRequested(opts = {}) {
  if (opts.consensusExplicit === true) return opts.consensus === true;
  return config.CONSENSUS_DEFAULT_ENABLED === true;
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
  buildConsensusPrompt,
  runFableConsensus,
  consensusFailure,
};
