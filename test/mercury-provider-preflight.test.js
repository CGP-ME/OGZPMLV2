'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

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

function trustedFableMetadata(overrides = {}) {
  return {
    provider: 'claude-code',
    requestedModel: 'fable',
    appliedModel: 'claude-fable-5',
    appliedModels: ['claude-fable-5'],
    authStatus: { authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' },
    executableTrust: {
      trusted: true,
      realpath: '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe',
      version: '2.1.236',
    },
    ...overrides,
  };
}

describe('Mercury provider preflight', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-provider-preflight-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

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
    fableFailure.providerMetadata = trustedFableMetadata({
      providerFrames: [{ type: 'result', is_error: true, error: { type: 'model_unavailable' } }],
    });
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

  test('preflight stamps identity conflict and continues without misreporting pipeline Opus fallback', async () => {
    const opusFactory = jest.fn(() => fakeClient({ provider: 'claude-code', model: 'opus', initialize: async () => {} }));
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({ provider: 'mercury', model: 'mercury-2', initialize: async () => {} }),
      createFableClient: () => ({
        providerName: 'claude-code', model: 'fable', requestCount: 0,
        initialize: jest.fn(async () => {}),
        generateResponseWithMetadata: jest.fn(async () => ({
          answer: 'PROVIDER_OK',
          metadata: trustedFableMetadata({
            appliedModels: ['claude-fable-5', 'claude-sonnet-4-5'],
            verdictModels: ['claude-sonnet-4-5'],
            identityPosture: {
              status: 'identity_conflict', authority: 'unverified', reason: 'undocumented_model_mismatch',
              requested_model: 'fable', applied_models: ['claude-fable-5', 'claude-sonnet-4-5'],
              verdict_models: ['claude-sonnet-4-5'], undocumented_models: ['claude-sonnet-4-5'],
              observations: [], transitions: [],
            },
          }),
        })),
      }),
      createOpusClient: opusFactory,
      createKimiClient: () => fakeClient({ provider: 'openai', model: 'kimi-k3', initialize: async () => {} }),
    });

    expect(result).toMatchObject({ ok: true, challengerReady: true });
    expect(result.checks[1]).toMatchObject({
      ok: true,
      identityPosture: { status: 'identity_conflict', authority: 'unverified' },
      attemptReceipt: {
        status: 'succeeded',
        applied_models: ['claude-fable-5', 'claude-sonnet-4-5'],
        verdict_models: ['claude-sonnet-4-5'],
        identity_posture: {
          status: 'identity_conflict',
          authority: 'unverified',
          reason: 'undocumented_model_mismatch',
        },
      },
    });
    expect(opusFactory).not.toHaveBeenCalled();
    expect(result.checks.map(check => check.label))
      .toEqual(['mercury', 'fable_challenger', 'kimi_tie_breaker']);
  });

  test('preflight cannot route around a genuinely untrusted Claude executable', async () => {
    const trustFailure = new Error('Trusted first-party Claude Code executable was not found in a rooted system installation');
    trustFailure.code = 'CLAUDE_CODE_EXECUTABLE_UNTRUSTED';
    trustFailure.providerMetadata = trustedFableMetadata({
      appliedModel: null,
      appliedModels: [],
      executableTrust: { trusted: false, failedCheck: 'rooted_system_launcher' },
    });
    const opusFactory = jest.fn();
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({ provider: 'mercury', model: 'mercury-2', initialize: async () => {} }),
      createFableClient: () => fakeClient({
        provider: 'claude-code', model: 'fable', initialize: async () => { throw trustFailure; },
      }),
      createOpusClient: opusFactory,
      createKimiClient: () => fakeClient({ provider: 'openai', model: 'kimi-k3', initialize: async () => {} }),
    });

    expect(result).toMatchObject({ ok: false, challengerReady: false });
    expect(result.checks[1]).toMatchObject({
      error: { code: 'CLAUDE_CODE_EXECUTABLE_UNTRUSTED' },
      fallback: { category: 'untrusted_provider_error', opusEligible: false },
      attemptReceipt: { executable_trust: { trusted: false, failedCheck: 'rooted_system_launcher' } },
    });
    expect(opusFactory).not.toHaveBeenCalled();
  });

  test('ambiguous nested Fable error fails loud and never invokes Opus during preflight', async () => {
    const fableFailure = new Error('Fable malformed output');
    fableFailure.providerMetadata = trustedFableMetadata({
      providerFrames: [{ payload: { type: 'model_unavailable' } }],
    });
    const opusFactory = jest.fn();
    const result = await runProviderPreflight({
      createMercuryClient: () => fakeClient({ provider: 'mercury', model: 'mercury-2', initialize: async () => {} }),
      createFableClient: () => fakeClient({
        provider: 'claude-code', model: 'fable', initialize: async () => { throw fableFailure; },
      }),
      createOpusClient: opusFactory,
      createKimiClient: () => fakeClient({ provider: 'openai', model: 'kimi-k3', initialize: async () => {} }),
    });
    expect(opusFactory).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, challengerReady: false, tieBreakerReady: true });
    expect(result.checks[1].fallback).toMatchObject({ opusEligible: false });
  });

  test('failed ambiguous Fable preflight writes complete schema-v2 and mode-0600 raw receipts without Opus', async () => {
    const secretFixture = 'API_KEY=preflight-secret-value';
    const fableRaw = Buffer.from(`fable raw ${secretFixture}`);
    const fableError = new Error(`Claude Code response was incomplete: unexpected_exposed_tools ${secretFixture}`);
    fableError.code = 'CLAUDE_CODE_INCOMPLETE_RESPONSE';
    fableError.subcondition = 'unexpected_exposed_tools';
    fableError.subconditions = ['unexpected_exposed_tools'];
    fableError.providerMetadata = {
      provider: 'claude-code',
      requestedModel: 'fable',
      appliedModel: 'claude-fable-5',
      startedAt: '2026-08-27T00:00:00.000Z',
      finishedAt: '2026-08-27T00:00:01.000Z',
      latencyMs: 1000,
      termination: 'success',
      parseStatus: 'parsed',
      rawResponse: fableRaw,
      rawError: Buffer.from('provider stderr'),
      toolsAvailable: ['Read'],
      authStatus: { authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' },
      executableTrust: {
        trusted: true,
        realpath: '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe',
        version: '2.1.236',
      },
      providerFrames: [],
    };
    const metadataClient = ({ provider, model, raw }) => ({
      providerName: provider,
      model,
      requestCount: 0,
      initialize: jest.fn(async () => {}),
      generateResponseWithMetadata: jest.fn(async function generate() {
        this.requestCount += 1;
        return {
          answer: 'PROVIDER_OK',
          metadata: {
            provider,
            requestedModel: model,
            appliedModel: model,
            startedAt: '2026-08-27T00:00:00.000Z',
            finishedAt: '2026-08-27T00:00:01.000Z',
            latencyMs: 1000,
            termination: 'stop',
            parseStatus: 'parsed',
            rawResponse: raw,
            toolsAvailable: [],
          },
        };
      }),
    });
    const opusFactory = jest.fn();
    const result = await runProviderPreflight({
      repoRoot: tmpRoot,
      createMercuryClient: () => metadataClient({ provider: 'mercury', model: 'mercury-2', raw: Buffer.from('mercury') }),
      createFableClient: () => ({
        providerName: 'claude-code', model: 'fable', requestCount: 0,
        initialize: jest.fn(async () => {}),
        generateResponseWithMetadata: jest.fn(async () => { throw fableError; }),
      }),
      createOpusClient: opusFactory,
      createKimiClient: () => metadataClient({ provider: 'openai', model: 'kimi-k3', raw: Buffer.from('kimi') }),
    });

    expect(result).toMatchObject({
      ok: false,
      challengerReady: false,
      tieBreakerReady: true,
      checks: [
        { label: 'mercury', ok: true, appliedModel: 'mercury-2' },
        {
          label: 'fable_challenger',
          ok: false,
          error: {
            code: 'CLAUDE_CODE_INCOMPLETE_RESPONSE',
            subcondition: 'unexpected_exposed_tools',
          },
          fallback: { opusEligible: false },
        },
        { label: 'kimi_tie_breaker', ok: true, appliedModel: 'kimi-k3' },
      ],
      runLedger: { line: 1 },
    });
    expect(opusFactory).not.toHaveBeenCalled();
    expect(result.attempts.map(attempt => attempt.role))
      .toEqual(['mercury', 'fable_challenger', 'kimi_tie_breaker']);
    const fableAttempt = result.attempts[1];
    expect(fableAttempt).toMatchObject({
      applied_model: 'claude-fable-5',
      applied_models: ['claude-fable-5'],
      termination: 'success',
      parse_status: 'parsed',
      tools: { enabled: false, available: ['Read'], calls: [], total: 0 },
      files_mechanically_opened: [],
      executable_trust: { trusted: true, version: '2.1.236' },
      raw_output: { bytes: fableRaw.length, mode: '0600' },
      raw_error: { bytes: 15, mode: '0600' },
      repo_adjudication: { status: 'pending', authority: 'live_repo_required' },
    });
    const rawPath = path.join(tmpRoot, fableAttempt.raw_output.path);
    expect(fs.readFileSync(rawPath)).toEqual(fableRaw);
    expect(fs.statSync(rawPath).mode & 0o777).toBe(0o600);

    const ledgerPath = path.join(tmpRoot, result.runLedger.path);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim());
    expect(ledger).toMatchObject({
      schema_version: 2,
      receipt_type: 'provider_preflight',
      verdict: 'provider_preflight_failed',
      provider_attempts: [{ role: 'mercury' }, { role: 'fable_challenger' }, { role: 'kimi_tie_breaker' }],
    });
    expect(JSON.stringify(result)).not.toContain('preflight-secret-value');
    expect(JSON.stringify(ledger)).not.toContain('preflight-secret-value');
  });
});
