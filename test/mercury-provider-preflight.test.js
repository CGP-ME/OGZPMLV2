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
    expect(classifyProviderError(new Error('HTTP 429: insufficient balance'))).toBe('quota_or_billing');
    expect(classifyProviderError(new Error('HTTP 403: this model requires a subscription'))).toBe('quota_or_billing');
    expect(classifyProviderError(new Error('HTTP 401: authentication_error invalid x-api-key'))).toBe('auth');
    expect(classifyProviderError(new Error('model not found'))).toBe('model');
    expect(classifyProviderError(new Error('ETIMEDOUT'))).toBe('network');
    expect(classifyProviderError(new Error('weird provider failure'))).toBe('unknown');
  });

  test('redacts provider request ids from preflight error messages', () => {
    expect(sanitizeProviderMessage('HTTP 401: {"request_id":"req_secret"}'))
      .toBe('HTTP 401: {"request_id":"[REDACTED]"}');
    expect(sanitizeProviderMessage('HTTP 429: org-abc123 <ak-secret-handle> insufficient balance'))
      .toBe('HTTP 429: org-[REDACTED] <account-[REDACTED]> insufficient balance');
    expect(sanitizeProviderMessage('HTTP 403: upgrade for access (ref: 582be732-c5d4-4def-8440-4e8583b126ba)'))
      .toBe('HTTP 403: upgrade for access (ref: [REDACTED])');
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
        model: 'fable',
        initialize: async () => {},
      }),
      createKimiClient: () => fakeClient({
        provider: 'openai',
        model: 'kimi-k3',
        initialize: async () => {},
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      challengerReady: true,
      tieBreakerReady: true,
      checks: [
        {
          label: 'mercury',
          ok: true,
          provider: 'mercury',
          model: 'mercury-2',
          requests: 1,
        },
        {
          label: 'fable_challenger',
          ok: true,
          provider: 'claude',
          model: 'fable',
          requests: 1,
        },
        {
          label: 'kimi_tie_breaker',
          ok: true,
          provider: 'openai',
          model: 'kimi-k3',
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
        model: 'fable',
        initialize: async () => {
          throw new Error('HTTP 401: authentication_error invalid x-api-key');
        },
      }),
      createKimiClient: () => fakeClient({
        provider: 'openai',
        model: 'kimi-k3',
        initialize: async () => {},
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
        label: 'fable_challenger',
        ok: false,
        provider: 'claude',
        model: 'fable',
        error: { category: 'auth' },
      },
      {
        label: 'kimi_tie_breaker',
        ok: true,
        provider: 'openai',
        model: 'kimi-k3',
      },
    ]);
    expect(result.challengerReady).toBe(false);
    expect(result.tieBreakerReady).toBe(true);
  });

  test('Kimi readiness never satisfies challenger readiness', async () => {
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({ provider: 'mercury', model: 'mercury-2', initialize: async () => {} }),
      createFableClient: () => fakeClient({
        provider: 'claude-code', model: 'fable', initialize: async () => { throw new Error('auth failed'); },
      }),
      createKimiClient: () => fakeClient({ provider: 'openai', model: 'kimi-k3', initialize: async () => {} }),
    });
    expect(result).toMatchObject({ ok: false, challengerReady: false, tieBreakerReady: true });
  });

  test('preflight checks Opus only after allowlisted Fable unavailability', async () => {
    const fableFailure = new Error('Fable unavailable');
    fableFailure.providerMetadata = {
      providerFrames: [{ type: 'result', error: { type: 'model_unavailable' } }],
    };
    const opusFactory = jest.fn(() => fakeClient({
      provider: 'claude-code', model: 'opus', initialize: async () => {},
    }));
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({
        provider: 'mercury', model: 'mercury-2', initialize: async () => {},
      }),
      createFableClient: () => fakeClient({
        provider: 'claude-code', model: 'fable', initialize: async () => { throw fableFailure; },
      }),
      createOpusClient: opusFactory,
      createKimiClient: () => fakeClient({
        provider: 'openai', model: 'kimi-k3', initialize: async () => { throw new Error('Kimi unavailable'); },
      }),
    });
    expect(opusFactory).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, challengerReady: true, tieBreakerReady: false });
    expect(result.checks.map(check => check.label))
      .toEqual(['mercury', 'fable_challenger', 'opus_challenger', 'kimi_tie_breaker']);
  });
});
