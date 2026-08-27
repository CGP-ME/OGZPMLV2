'use strict';

const {
  createMercuryLlmClient,
  createFableChallengerClient,
  createOpusChallengerClient,
  createKimiTieBreakerClient,
} = require('./llm-client');
const { classifyFableFallbackError } = require('./adversarial-review');
const {
  buildPromptProvenance,
  buildProviderPreflightLedgerEntry,
  createRawRunId,
  redactSensitiveText,
  writeRawProviderOutput,
  writeRunLedgerEntry,
} = require('./run-ledger');

const PREFLIGHT_PROMPT = 'Reply with exactly: PROVIDER_OK';

function classifyProviderError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/free_tier_quota_exceeded|free tier limit|insufficient balance|rate limit|requires a subscription|upgrade for access|HTTP 402|HTTP 403|HTTP 429/i.test(message)) {
    return 'quota_or_billing';
  }
  if (/authentication_error|invalid x-api-key|HTTP 401|api key env is missing|missing/i.test(message)) {
    return 'auth';
  }
  if (/model.*not.*found|not_found|does not exist|unsupported/i.test(message)) {
    return 'model';
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return 'network';
  }
  return 'unknown';
}

function sanitizeProviderMessage(message) {
  return redactSensitiveText(String(message == null ? '' : message))
    .replace(/("request_id"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/\borg-[a-z0-9_-]+\b/gi, 'org-[REDACTED]')
    .replace(/<ak-[^>]+>/gi, '<account-[REDACTED]>')
    .replace(/\(ref:\s*[0-9a-f-]{16,}\)/gi, '(ref: [REDACTED])');
}

function cleanProviderError(err) {
  const clean = {
    category: classifyProviderError(err),
    message: sanitizeProviderMessage(err && err.message ? err.message : String(err)),
  };
  if (err && ['string', 'number'].includes(typeof err.code)) clean.code = err.code;
  if (err && typeof err.subcondition === 'string') clean.subcondition = err.subcondition;
  if (err && Array.isArray(err.subconditions)) clean.subconditions = [...err.subconditions];
  return clean;
}

async function withSilencedClientConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function attemptReceipt({ label, attempt, client, metadata = {}, status, phase, error = null, rawOutput = null, rawError = null }) {
  const promptDispatched = phase === 'generate' || phase === 'complete';
  return {
    role: label,
    attempt,
    status,
    request_phase: phase,
    requested_provider: metadata.provider || (client && client.providerName) || null,
    requested_model: metadata.requestedModel || (client && client.model) || null,
    applied_model: metadata.appliedModel || null,
    applied_models: Array.isArray(metadata.appliedModels)
      ? [...metadata.appliedModels]
      : (metadata.appliedModel ? [metadata.appliedModel] : []),
    started_at: metadata.startedAt || null,
    finished_at: metadata.finishedAt || null,
    latency_ms: metadata.latencyMs == null ? null : metadata.latencyMs,
    status_code: metadata.statusCode == null ? null : metadata.statusCode,
    exit_code: metadata.exitCode == null ? null : metadata.exitCode,
    termination: metadata.termination || null,
    parse_status: metadata.parseStatus || null,
    input_provenance: promptDispatched ? buildPromptProvenance(PREFLIGHT_PROMPT) : null,
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
    auth_posture: metadata.authStatus || (client && client.authStatus) || null,
    executable_trust: metadata.executableTrust || (client && client.executableTrust) || null,
    error: error ? cleanProviderError(error) : null,
    repo_adjudication: { status: 'pending', authority: 'live_repo_required' },
  };
}

function persistAttemptRaw({ repoRoot, runId, label, attempt, metadata }) {
  if (!repoRoot) return { rawOutput: null, rawError: null };
  const rawOutput = writeRawProviderOutput({
    repoRoot,
    runId,
    stage: label,
    attempt,
    bytes: metadata.rawResponse || Buffer.alloc(0),
  });
  const rawError = metadata.rawError && metadata.rawError.length > 0
    ? writeRawProviderOutput({
      repoRoot,
      runId,
      stage: `${label}-stderr`,
      attempt,
      bytes: metadata.rawError,
    })
    : null;
  return { rawOutput, rawError };
}

async function checkClient(label, createClient, { attempt = 1, repoRoot = null, runId = null } = {}) {
  const startedAt = new Date();
  const startedMs = Date.now();
  let client = null;
  let phase = 'create';
  try {
    client = createClient();
    phase = 'initialize';
    await withSilencedClientConsole(() => client.initialize());
    let appliedModel = null;
    let metadata = {
      provider: client.providerName,
      requestedModel: client.model,
      appliedModel: null,
      toolsAvailable: [],
    };
    if (typeof client.generateResponseWithMetadata === 'function') {
      phase = 'generate';
      const response = await withSilencedClientConsole(() => client.generateResponseWithMetadata(
        PREFLIGHT_PROMPT
      ));
      appliedModel = response.metadata.appliedModel;
      metadata = response.metadata;
    }
    phase = 'complete';
    const raw = persistAttemptRaw({ repoRoot, runId, label, attempt, metadata });
    const result = {
      label,
      ok: true,
      provider: client.providerName,
      model: client.model,
      appliedModel,
      requests: client.requestCount,
      authPosture: client.authStatus || null,
    };
    result.attemptReceipt = attemptReceipt({
      label, attempt, client, metadata, status: 'succeeded', phase, ...raw,
    });
    return result;
  } catch (err) {
    const metadata = err && err.providerMetadata ? err.providerMetadata : {
      provider: client && client.providerName,
      requestedModel: client && client.model,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedMs,
      termination: 'error',
      parseStatus: 'request_failed',
      toolsAvailable: [],
    };
    const raw = persistAttemptRaw({ repoRoot, runId, label, attempt, metadata });
    const result = {
      label,
      ok: false,
      provider: client && client.providerName ? client.providerName : null,
      model: client && client.model ? client.model : null,
      error: cleanProviderError(err),
    };
    result.attemptReceipt = attemptReceipt({
      label, attempt, client, metadata, status: 'failed', phase, error: err, ...raw,
    });
    Object.defineProperty(result, '_rawError', { value: err, enumerable: false });
    return result;
  }
}

async function runProviderPreflight({
  createMercuryClient = () => createMercuryLlmClient({ systemPrompt: 'Respond tersely.' }),
  createFableClient = () => createFableChallengerClient(),
  createOpusClient = () => createOpusChallengerClient(),
  createKimiClient = () => createKimiTieBreakerClient(),
  repoRoot = null,
} = {}) {
  const startedAt = new Date();
  const runId = createRawRunId(startedAt);
  const attempts = [];
  const mercury = await checkClient('mercury', createMercuryClient, { attempt: 1, repoRoot, runId });
  attempts.push(mercury.attemptReceipt);
  const fable = await checkClient('fable_challenger', createFableClient, { attempt: 2, repoRoot, runId });
  attempts.push(fable.attemptReceipt);
  let opus = null;
  if (!fable.ok) {
    const fallback = classifyFableFallbackError(fable._rawError);
    fable.fallback = fallback;
    if (fallback.opusEligible) {
      opus = await checkClient('opus_challenger', createOpusClient, { attempt: 3, repoRoot, runId });
      attempts.push(opus.attemptReceipt);
    }
  }
  const kimi = await checkClient('kimi_tie_breaker', createKimiClient, {
    attempt: attempts.length + 1, repoRoot, runId,
  });
  attempts.push(kimi.attemptReceipt);
  const challengerReady = fable.ok === true || !!(opus && opus.ok === true);
  const result = {
    ok: mercury.ok === true && challengerReady,
    challengerReady,
    tieBreakerReady: kimi.ok === true,
    checks: [mercury, fable, ...(opus ? [opus] : []), kimi],
    attempts,
  };
  if (repoRoot) {
    const entry = buildProviderPreflightLedgerEntry({
      repoRoot, runId, startedAt, result, attempts,
    });
    result.runLedger = writeRunLedgerEntry({ repoRoot, entry });
  }
  return result;
}

module.exports = {
  classifyProviderError,
  sanitizeProviderMessage,
  cleanProviderError,
  attemptReceipt,
  checkClient,
  runProviderPreflight,
};
