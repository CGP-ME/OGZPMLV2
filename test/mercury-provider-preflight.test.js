'use strict';

const {
  classifyProviderError,
  sanitizeProviderMessage,
  runProviderPreflight,
} = require('../trai_brain/mercury-bridge/provider-preflight');

function fakeClient({ provider, model, initialize }) {
  return {
    providerName: provider,
    model,
    requestCount: 0,
    initialize: jest.fn(async function doInitialize() {
      await initialize();
      this.requestCount += 1;
    }),
  };
}

describe('Mercury provider preflight', () => {
  test('classifies provider access failures into operator-action buckets', () => {
    expect(classifyProviderError(new Error('HTTP 402: free_tier_quota_exceeded'))).toBe('quota_or_billing');
    expect(classifyProviderError(new Error('HTTP 401: authentication_error invalid x-api-key'))).toBe('auth');
    expect(classifyProviderError(new Error('model not found'))).toBe('model');
    expect(classifyProviderError(new Error('ETIMEDOUT'))).toBe('network');
    expect(classifyProviderError(new Error('weird provider failure'))).toBe('unknown');
  });

  test('redacts provider request ids from preflight error messages', () => {
    expect(sanitizeProviderMessage('HTTP 401: {"request_id":"req_secret"}'))
      .toBe('HTTP 401: {"request_id":"[REDACTED]"}');
  });

  test('preflight returns ok only when Mercury and Fable both warm up', async () => {
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({
        provider: 'mercury',
        model: 'mercury-2',
        initialize: async () => {},
      }),
      createFableClient: () => fakeClient({
        provider: 'claude',
        model: 'claude-fable-5',
        initialize: async () => {},
      }),
    });

    expect(result).toEqual({
      ok: true,
      checks: [
        {
          label: 'mercury',
          ok: true,
          provider: 'mercury',
          model: 'mercury-2',
          requests: 1,
        },
        {
          label: 'fable_consensus',
          ok: true,
          provider: 'claude',
          model: 'claude-fable-5',
          requests: 1,
        },
      ],
    });
  });

  test('preflight preserves individual provider failures without hiding the second check', async () => {
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({
        provider: 'mercury',
        model: 'mercury-2',
        initialize: async () => {
          throw new Error('HTTP 402: free_tier_quota_exceeded');
        },
      }),
      createFableClient: () => fakeClient({
        provider: 'claude',
        model: 'claude-fable-5',
        initialize: async () => {
          throw new Error('HTTP 401: authentication_error invalid x-api-key');
        },
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toMatchObject([
      {
        label: 'mercury',
        ok: false,
        provider: 'mercury',
        model: 'mercury-2',
        error: { category: 'quota_or_billing' },
      },
      {
        label: 'fable_consensus',
        ok: false,
        provider: 'claude',
        model: 'claude-fable-5',
        error: { category: 'auth' },
      },
    ]);
  });
});
