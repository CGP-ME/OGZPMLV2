'use strict';

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeProviderUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) return null;

  const promptTokens = finiteNonNegative(rawUsage.prompt_tokens);
  const anthropicInput = finiteNonNegative(rawUsage.input_tokens);
  const output = finiteNonNegative(rawUsage.completion_tokens) ?? finiteNonNegative(rawUsage.output_tokens);
  const openAiCached = finiteNonNegative(
    rawUsage.prompt_tokens_details && rawUsage.prompt_tokens_details.cached_tokens
  ) ?? finiteNonNegative(rawUsage.cached_tokens);
  const cacheRead = finiteNonNegative(rawUsage.cache_read_input_tokens);
  const cacheCreation = finiteNonNegative(rawUsage.cache_creation_input_tokens);

  let input = null;
  let cachedInput = null;
  let uncachedInput = null;
  if (promptTokens != null) {
    cachedInput = Math.min(openAiCached || 0, promptTokens);
    uncachedInput = promptTokens - cachedInput;
    input = promptTokens;
  } else if (anthropicInput != null || cacheRead != null || cacheCreation != null) {
    cachedInput = cacheRead || 0;
    uncachedInput = (anthropicInput || 0) + (cacheCreation || 0);
    input = cachedInput + uncachedInput;
  }

  const reportedTotal = finiteNonNegative(rawUsage.total_tokens);
  const total = reportedTotal != null
    ? reportedTotal
    : (input != null && output != null ? input + output : null);
  if (input == null && output == null && total == null) return null;

  return {
    input,
    uncached_input: uncachedInput,
    cached_input: cachedInput,
    output,
    total,
  };
}

function pricingKeyFor(provider, model) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedModel = String(model || '').trim().toLowerCase();
  if (normalizedProvider === 'mercury' && normalizedModel === 'mercury-2') {
    return { provider: 'inception', model: normalizedModel };
  }
  if (normalizedProvider === 'openai' && normalizedModel === 'kimi-k3') {
    return { provider: 'moonshot', model: normalizedModel };
  }
  return { provider: normalizedProvider, model: normalizedModel };
}

function resolvePricing(pricingCatalog, provider, model) {
  const key = pricingKeyFor(provider, model);
  const providerPrices = pricingCatalog && pricingCatalog[key.provider];
  const price = providerPrices && providerPrices[key.model];
  return price ? { ...price, key: `pricing.${key.provider}.${key.model}` } : null;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 1e9) / 1e9;
}

function accountProviderAttempt(metadata = {}, {
  provider = metadata.provider,
  model = metadata.requestedModel || metadata.appliedModel,
  pricingCatalog = {},
} = {}) {
  const normalizedUsage = normalizeProviderUsage(metadata.usage);
  const tokens = normalizedUsage || {
    input: null,
    uncached_input: null,
    cached_input: null,
    output: null,
    total: null,
  };
  const usageAbsence = normalizedUsage ? null : 'provider_usage_absent';
  const providerReportedCost = finiteNonNegative(metadata.providerReportedCost);
  const providerReportedCurrency = String(metadata.providerReportedCurrency || 'USD').trim().toUpperCase();

  if (providerReportedCost != null) {
    return {
      tokens,
      usage_absence: usageAbsence,
      cost: {
        amount: roundCurrency(providerReportedCost),
        currency: providerReportedCurrency,
        pricing_source: 'provider_reported',
      },
      cost_absence: null,
    };
  }

  if (!normalizedUsage) {
    return { tokens, usage_absence: usageAbsence, cost: null, cost_absence: usageAbsence };
  }

  const pricing = resolvePricing(pricingCatalog, provider, model);
  if (!pricing) {
    return {
      tokens,
      usage_absence: null,
      cost: null,
      cost_absence: `pricing_absent:${String(provider || 'unknown')}/${String(model || 'unknown')}`,
    };
  }
  if ([tokens.uncached_input, tokens.cached_input, tokens.output].some(value => value == null)) {
    return {
      tokens,
      usage_absence: null,
      cost: null,
      cost_absence: 'provider_usage_unusable_for_pricing',
    };
  }

  const amount = (
    (tokens.uncached_input * pricing.inputPerMillion)
    + (tokens.cached_input * pricing.cachedInputPerMillion)
    + (tokens.output * pricing.outputPerMillion)
  ) / 1_000_000;
  return {
    tokens,
    usage_absence: null,
    cost: {
      amount: roundCurrency(amount),
      currency: pricing.currency,
      pricing_source: pricing.source || `mercury.config.json:${pricing.key}`,
    },
    cost_absence: null,
  };
}

function sumAttemptAccounting(attempts = []) {
  const normalizedAttempts = Array.isArray(attempts) ? attempts.filter(Boolean) : [];
  const tokenFields = ['input', 'uncached_input', 'cached_input', 'output', 'total'];
  const tokenSums = Object.fromEntries(tokenFields.map(field => [field, 0]));
  let attemptsWithUsage = 0;
  let pricedAttempts = 0;
  const costAbsences = [];
  const currencies = new Set();
  let amount = 0;
  if (normalizedAttempts.length === 0) costAbsences.push('provider_attempt_absent');

  for (const attempt of normalizedAttempts) {
    const usableTokens = attempt.tokens && tokenFields.every(field => finiteNonNegative(attempt.tokens[field]) != null);
    if (usableTokens) {
      attemptsWithUsage += 1;
      for (const field of tokenFields) tokenSums[field] += attempt.tokens[field];
    }
    if (attempt.cost && finiteNonNegative(attempt.cost.amount) != null && attempt.cost.currency) {
      pricedAttempts += 1;
      amount += attempt.cost.amount;
      currencies.add(String(attempt.cost.currency).toUpperCase());
    } else {
      costAbsences.push(attempt.cost_absence || `attempt_${attempt.attempt || costAbsences.length + 1}_cost_absent`);
    }
  }

  const tokensComplete = normalizedAttempts.length > 0 && attemptsWithUsage === normalizedAttempts.length;
  const singleCurrency = currencies.size === 1 ? [...currencies][0] : null;
  const costComplete = normalizedAttempts.length > 0
    && pricedAttempts === normalizedAttempts.length
    && singleCurrency != null;
  return {
    seat_tokens: {
      ...Object.fromEntries(tokenFields.map(field => [field, attemptsWithUsage > 0 ? tokenSums[field] : null])),
      complete: tokensComplete,
      attempts_with_usage: attemptsWithUsage,
      total_attempts: normalizedAttempts.length,
    },
    seat_cost: {
      amount: pricedAttempts > 0 && singleCurrency ? roundCurrency(amount) : null,
      currency: singleCurrency,
      complete: costComplete,
      priced_attempts: pricedAttempts,
      total_attempts: normalizedAttempts.length,
      cost_absences: costAbsences,
    },
  };
}

function sumSeatAccounting(seatSummaries = []) {
  const attempts = [];
  for (const seat of seatSummaries || []) {
    if (seat && Array.isArray(seat.attempts)) attempts.push(...seat.attempts);
  }
  const summary = sumAttemptAccounting(attempts);
  return {
    run_tokens: summary.seat_tokens,
    run_cost: summary.seat_cost,
  };
}

module.exports = {
  accountProviderAttempt,
  normalizeProviderUsage,
  pricingKeyFor,
  resolvePricing,
  roundCurrency,
  sumAttemptAccounting,
  sumSeatAccounting,
};
