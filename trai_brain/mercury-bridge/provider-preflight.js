'use strict';

const {
  createMercuryLlmClient,
  createFableChallengerClient,
  createOpusChallengerClient,
  createKimiTieBreakerClient,
} = require('./llm-client');
const { classifyFableFallbackError } = require('./adversarial-review');

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
  return String(message == null ? '' : message)
    .replace(/("request_id"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/\borg-[a-z0-9_-]+\b/gi, 'org-[REDACTED]')
    .replace(/<ak-[^>]+>/gi, '<account-[REDACTED]>')
    .replace(/\(ref:\s*[0-9a-f-]{16,}\)/gi, '(ref: [REDACTED])');
}

function cleanProviderError(err) {
  return {
    category: classifyProviderError(err),
    message: sanitizeProviderMessage(err && err.message ? err.message : String(err)),
  };
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

async function checkClient(label, createClient) {
  let client = null;
  try {
    client = createClient();
    await withSilencedClientConsole(() => client.initialize());
    let appliedModel = null;
    if (typeof client.generateResponseWithMetadata === 'function') {
      const response = await withSilencedClientConsole(() => client.generateResponseWithMetadata(
        'Reply with exactly: PROVIDER_OK'
      ));
      appliedModel = response.metadata.appliedModel;
    }
    return {
      label,
      ok: true,
      provider: client.providerName,
      model: client.model,
      appliedModel,
      requests: client.requestCount,
      authPosture: client.authStatus || null,
    };
  } catch (err) {
    const result = {
      label,
      ok: false,
      provider: client && client.providerName ? client.providerName : null,
      model: client && client.model ? client.model : null,
      error: cleanProviderError(err),
    };
    Object.defineProperty(result, '_rawError', { value: err, enumerable: false });
    return result;
  }
}

async function runProviderPreflight({
  createMercuryClient = () => createMercuryLlmClient({ systemPrompt: 'Respond tersely.' }),
  createFableClient = () => createFableChallengerClient(),
  createOpusClient = () => createOpusChallengerClient(),
  createKimiClient = () => createKimiTieBreakerClient(),
} = {}) {
  const mercury = await checkClient('mercury', createMercuryClient);
  const fable = await checkClient('fable_challenger', createFableClient);
  let opus = null;
  if (!fable.ok) {
    const fallback = classifyFableFallbackError(fable._rawError);
    fable.fallback = fallback;
    if (fallback.opusEligible) opus = await checkClient('opus_challenger', createOpusClient);
  }
  const kimi = await checkClient('kimi_tie_breaker', createKimiClient);
  const challengerReady = fable.ok === true || !!(opus && opus.ok === true);
  return {
    ok: mercury.ok === true && challengerReady,
    challengerReady,
    tieBreakerReady: kimi.ok === true,
    checks: [mercury, fable, ...(opus ? [opus] : []), kimi],
  };
}

module.exports = {
  classifyProviderError,
  sanitizeProviderMessage,
  cleanProviderError,
  checkClient,
  runProviderPreflight,
};
