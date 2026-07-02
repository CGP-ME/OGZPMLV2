'use strict';

const { createMercuryLlmClient, createConsensusLlmClient } = require('./llm-client');

function classifyProviderError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/free_tier_quota_exceeded|free tier limit|HTTP 402/i.test(message)) {
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
    .replace(/("request_id"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');
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
    return {
      label,
      ok: true,
      provider: client.providerName,
      model: client.model,
      requests: client.requestCount,
    };
  } catch (err) {
    return {
      label,
      ok: false,
      provider: client && client.providerName ? client.providerName : null,
      model: client && client.model ? client.model : null,
      error: cleanProviderError(err),
    };
  }
}

async function runProviderPreflight({
  createMercuryClient = () => createMercuryLlmClient({ systemPrompt: 'Respond tersely.' }),
  createFableClient = () => createConsensusLlmClient(),
} = {}) {
  const mercury = await checkClient('mercury', createMercuryClient);
  const fable = await checkClient('fable_consensus', createFableClient);
  return {
    ok: mercury.ok === true && fable.ok === true,
    checks: [mercury, fable],
  };
}

module.exports = {
  classifyProviderError,
  sanitizeProviderMessage,
  cleanProviderError,
  checkClient,
  runProviderPreflight,
};
