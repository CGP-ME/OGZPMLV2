'use strict';

const {
  accountProviderAttempt,
  normalizeProviderUsage,
  sumAttemptAccounting,
} = require('../trai_brain/mercury-bridge/cost-accounting');

const pricing = {
  inception: {
    'mercury-2': {
      inputPerMillion: 0.25,
      outputPerMillion: 0.75,
      cachedInputPerMillion: 0.025,
      currency: 'USD',
      source: 'invoice',
    },
  },
  moonshot: {
    'kimi-k3': {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cachedInputPerMillion: 0.3,
      currency: 'USD',
      source: 'console',
    },
  },
};

describe('Mercury provider cost accounting', () => {
  test('separates cached and uncached OpenAI-compatible input and prices Mercury', () => {
    const receipt = accountProviderAttempt({
      provider: 'mercury',
      requestedModel: 'mercury-2',
      usage: {
        prompt_tokens: 1_000_000,
        completion_tokens: 100_000,
        total_tokens: 1_100_000,
        prompt_tokens_details: { cached_tokens: 400_000 },
      },
    }, { pricingCatalog: pricing });

    expect(receipt.tokens).toEqual({
      input: 1_000_000,
      uncached_input: 600_000,
      cached_input: 400_000,
      output: 100_000,
      total: 1_100_000,
    });
    expect(receipt.cost).toEqual({ amount: 0.235, currency: 'USD', pricing_source: 'invoice' });
    expect(receipt.cost_absence).toBeNull();
  });

  test('normalizes Anthropic cache fields and uses an exact provider-reported cost', () => {
    expect(normalizeProviderUsage({
      input_tokens: 2,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 50,
      output_tokens: 10,
    })).toEqual({
      input: 152,
      uncached_input: 102,
      cached_input: 50,
      output: 10,
      total: 162,
    });

    const receipt = accountProviderAttempt({
      provider: 'claude-code',
      requestedModel: 'fable',
      usage: { input_tokens: 2, output_tokens: 10 },
      providerReportedCost: 0.1234567894,
      providerReportedCurrency: 'USD',
    }, { pricingCatalog: pricing });
    expect(receipt.cost).toEqual({
      amount: 0.123456789,
      currency: 'USD',
      pricing_source: 'provider_reported',
    });
  });

  test('names absent usage or pricing and never substitutes a zero cost', () => {
    expect(accountProviderAttempt({ provider: 'openai', requestedModel: 'unknown' }, { pricingCatalog: pricing }))
      .toMatchObject({ usage_absence: 'provider_usage_absent', cost: null, cost_absence: 'provider_usage_absent' });
    expect(accountProviderAttempt({
      provider: 'openai', requestedModel: 'unknown',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }, { pricingCatalog: pricing })).toMatchObject({
      cost: null,
      cost_absence: 'pricing_absent:openai/unknown',
    });
  });

  test('sums tokens and dollars while retaining incomplete-attempt absences', () => {
    const priced = {
      attempt: 1,
      tokens: { input: 10, uncached_input: 8, cached_input: 2, output: 5, total: 15 },
      cost: { amount: 0.25, currency: 'USD' },
      cost_absence: null,
    };
    const missing = {
      attempt: 2,
      tokens: { input: null, uncached_input: null, cached_input: null, output: null, total: null },
      cost: null,
      cost_absence: 'provider_usage_absent',
    };
    expect(sumAttemptAccounting([priced, missing])).toEqual({
      seat_tokens: {
        input: 10, uncached_input: 8, cached_input: 2, output: 5, total: 15,
        complete: false, attempts_with_usage: 1, total_attempts: 2,
      },
      seat_cost: {
        amount: 0.25, currency: 'USD', complete: false,
        priced_attempts: 1, total_attempts: 2, cost_absences: ['provider_usage_absent'],
      },
    });
  });
});
