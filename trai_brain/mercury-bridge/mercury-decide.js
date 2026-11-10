'use strict';

const crypto = require('crypto');
const { sanitizeForLedger, redactSensitiveText } = require('./run-ledger');
const { reportedPanelDecision } = require('./reviewer-panel');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

// This is a report about completed reviews. It is never a reviewer seat, a
// substitute verdict, or an instruction to the bot or the review dispatcher.
function buildDecideState(query, result) {
  const panel = result.reviewerPanel;
  return sanitizeForLedger({
    scope: 'Engineering review reports only; source correctness is not certified.',
    query,
    selected_reviewers: panel.selected,
    reported_decision: reportedPanelDecision(panel),
    diagnostics: panel.diagnostics,
    reviewers: panel.seats.map(seat => ({
      id: seat.id, sequence: seat.sequence, status: seat.status,
      answer: seat.answer, parsed: seat.parsed, absence: seat.absence,
      identity_conflict: seat.identityConflict,
      applied_models: seat.appliedModels,
      evidence_basis: seat.evidenceBasis,
      evidence_checks_passed: seat.evidenceChecksPassed,
      named_absences: seat.doctrineReview?.namedAbsences || [],
      named_breaks: seat.doctrineReview?.namedBreaks || [],
      recheck_absences: seat.recheckDiagnostics?.namedAbsences || [],
      input_dependencies: seat.inputDependencies,
    })),
    evidence_sources: (result.evidenceSources || []).map(source => ({
      path: source.path, artifact_sha256: source.artifact_sha256,
      excerpt_sha256: source.excerpt_sha256,
      line_start: source.line_start, line_end: source.line_end,
    })),
    quarantines: result.reviewQuarantines || [],
  });
}

function configurationError(settings) {
  if (settings == null) return 'decide_configuration_absent';
  if (!object(settings)) return 'decide_configuration_invalid';
  if (typeof settings.enabled !== 'boolean') return 'decide_enabled_not_boolean';
  if (!settings.enabled) return null;
  if (typeof settings.baseUrl !== 'string') return 'decide_base_url_invalid';
  let endpoint;
  try { endpoint = new URL(settings.baseUrl); }
  catch { return 'decide_base_url_invalid'; }
  if (!['http:', 'https:'].includes(endpoint.protocol)) return 'decide_base_url_invalid';
  if (settings.model !== 'mercury-decide') return 'decide_model_invalid';
  if (settings.apiKeyEnv !== 'INCEPTION_API_KEY_DEV') return 'decide_credential_lane_invalid';
  if (!Number.isInteger(settings.requestTimeoutMs) || settings.requestTimeoutMs <= 0
      || settings.requestTimeoutMs > 2147483647) return 'decide_deadline_invalid';
  if (!Number.isInteger(settings.maxRequestBytes) || settings.maxRequestBytes <= 0) return 'decide_request_size_invalid';
  if (typeof settings.rubricVersion !== 'string' || !settings.rubricVersion.trim()) return 'decide_rubric_version_absent';
  if (!object(settings.questions) || Object.keys(settings.questions).length === 0) return 'decide_questions_absent';
  for (const question of Object.values(settings.questions)) {
    if (!object(question) || question.type !== 'choice' || !object(question.criteria)
        || Object.keys(question.criteria).length < 1 || Object.keys(question.criteria).length > 255
        || typeof question.instructions !== 'string' || !question.instructions.trim()
        || Object.values(question.criteria).some(value => typeof value !== 'string' || !value.trim())) {
      return 'decide_choice_rubric_invalid';
    }
  }
  return null;
}

function responseError(body, settings) {
  if (!object(body)) return 'decide_response_not_object';
  if (body.model !== settings.model) return 'decide_response_model_mismatch';
  if (!object(body.answers) || Object.keys(body.answers).length !== Object.keys(settings.questions).length) {
    return 'decide_answer_set_mismatch';
  }
  for (const [name, question] of Object.entries(settings.questions)) {
    const answer = body.answers[name];
    const choices = Object.keys(question.criteria);
    if (!object(answer) || answer.type !== 'choice' || !choices.includes(answer.choice)
        || !probability(answer.confidence) || !object(answer.probabilities)
        || Object.keys(answer.probabilities).length !== choices.length
        || choices.some(choice => !probability(answer.probabilities[choice]))) return `decide_answer_invalid:${name}`;
    const total = Object.values(answer.probabilities).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 0.001) return `decide_probabilities_invalid:${name}`;
  }
  return null;
}

async function runDecideAdvisory({ query, result, settings, providerAudit, env = process.env }) {
  const receipt = {
    authority: 'advisory_only', status: 'unavailable', absence: null,
    requested_model: settings?.model || null,
    rubric_version: settings?.rubricVersion || null,
    providerAttempts: [],
  };
  const invalid = configurationError(settings);
  if (invalid) return { ...receipt, absence: invalid };
  if (!settings.enabled) return { ...receipt, status: 'disabled', absence: 'disabled_in_mercury_config' };
  const apiKey = env[settings.apiKeyEnv];
  if (typeof apiKey !== 'string' || !apiKey.trim()) return { ...receipt, absence: 'decide_credential_absent' };

  // Reuse the receipt redactor before transport. Also remove this exact key if
  // quoted in a report, even when it would not match a generic secret pattern.
  const state = JSON.stringify(buildDecideState(query, result)).split(apiKey).join('[REDACTED]');
  const payload = JSON.stringify({ model: settings.model, state, questions: settings.questions });
  receipt.state_sha256 = sha256(state);
  receipt.rubric_sha256 = sha256(JSON.stringify(settings.questions));
  receipt.request_sha256 = sha256(payload);
  receipt.request_bytes = Buffer.byteLength(payload);
  receipt.request_timeout_ms = settings.requestTimeoutMs;
  if (receipt.request_bytes > settings.maxRequestBytes) {
    return { ...receipt, absence: 'decide_request_too_large', request_max_bytes: settings.maxRequestBytes };
  }

  const started = Date.now();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  let rawResponse = Buffer.alloc(0);
  let body = null;
  let statusCode = null;
  let absence = null;
  let error = null;
  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/decisions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: payload, signal: controller.signal, redirect: 'error',
    });
    statusCode = response.status;
    rawResponse = Buffer.from(await response.arrayBuffer());
    try { body = JSON.parse(rawResponse.toString('utf8')); }
    catch { absence = 'decide_response_not_json'; }
    if (!response.ok) absence = `decide_http_${statusCode}`;
    if (!absence) absence = responseError(body, settings);
  } catch (err) {
    absence = controller.signal.aborted ? 'decide_deadline_exceeded' : 'decide_transport_failed';
    error = redactSensitiveText(String(err.message || err).split(apiKey).join('[REDACTED]'));
  } finally {
    clearTimeout(deadline);
  }
  const metadata = {
    provider: 'mercury', requestedModel: settings.model,
    appliedModel: typeof body?.model === 'string' ? body.model : null,
    startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(),
    latencyMs: Date.now() - started, statusCode, rawResponse,
    usage: object(body?.usage) ? body.usage : null,
    parseStatus: absence || 'typed_decisions_response',
    stoppedBecause: absence || 'decisions_response_received',
    identityPosture: {
      status: body?.model === settings.model ? 'provider_attested_response' : 'identity_unverified',
      authority: 'advisory_only', requested_model: settings.model,
      applied_models: typeof body?.model === 'string' ? [body.model] : [],
    },
  };
  const attempt = providerAudit.record(metadata, { status: absence ? 'failed' : 'succeeded', retry: false, error: error || absence });
  // A foreign/absent model response cannot be priced as the requested model.
  if (metadata.appliedModel !== settings.model) {
    attempt.cost = null;
    attempt.cost_absence = 'decide_response_model_unverified';
  }
  providerAudit.attempts.push(attempt);
  return {
    ...receipt, status: absence ? 'unavailable' : 'succeeded', absence, error,
    applied_model: metadata.appliedModel,
    answers: absence ? null : body.answers,
    usage: metadata.usage,
    providerAttempts: providerAudit.attempts,
  };
}

module.exports = { buildDecideState, runDecideAdvisory };
