'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const baseMercuryConfig = require('../mercury.config.json');
const { createToolAdapter } = require('../trai_brain/mercury-bridge/tool-adapter');

function mergeConfig(base, overrides = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
      ? mergeConfig(base[key], value)
      : value;
  }
  return result;
}

async function withMercuryConfig(overrides, fn, env = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-mercury-llm-config-'));
  const configPath = path.join(tmpRoot, 'mercury.config.json');
  fs.writeFileSync(configPath, JSON.stringify(mergeConfig(baseMercuryConfig, overrides), null, 2));
  const changedEnv = { MERCURY_CONFIG_FILE: configPath, ...env };
  const previous = Object.fromEntries(Object.keys(changedEnv).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(changedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.resetModules();
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.resetModules();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

describe('Mercury LLM config contract', () => {
  test('locks Mercury, challenger, and tie-breaker to distinct configured roles', async () => {
    await withMercuryConfig({}, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      expect(config).toMatchObject({
        MERCURY_LLM_PROVIDER: 'mercury',
        MERCURY_LLM_MODEL: 'mercury-2',
        CONSENSUS_PROVIDER: 'claude-code',
        CONSENSUS_MODEL: 'fable',
        CONSENSUS_EMERGENCY_MODEL: 'opus',
        CONSENSUS_API_KEY_ENV: null,
        TIE_BREAKER_PROVIDER: 'openai',
        TIE_BREAKER_MODEL: 'kimi-k3',
        TIE_BREAKER_API_KEY_ENV: 'MOONSHOT_API_KEY',
        AGENTIC_MAX_ITERATIONS: 60,
        AGENTIC_MAX_TOKENS: 7750,
      });
      expect(config.CONSENSUS_BASE_URL).toBeNull();
    }, {
      LLM_PROVIDER: 'openai',
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'gpt-4o-mini',
      LLM_MAX_TOKENS: '1',
      LLM_TEMPERATURE: '0.1',
      MERCURY_MAX_ITERATIONS: '1',
    });
  });

  test('resolves subscription challenger and API tie-breaker independently', async () => {
    await withMercuryConfig({}, () => {
      const {
        resolveConsensusLlmClientOptions,
        resolveKimiTieBreakerClientOptions,
      } = require('../trai_brain/mercury-bridge/llm-client');
      expect(resolveConsensusLlmClientOptions()).toMatchObject({
        provider: 'claude-code', model: 'fable', apiKey: '', authRequired: false,
      });
      expect(resolveConsensusLlmClientOptions({ model: 'opus' })).toMatchObject({
        provider: 'claude-code', model: 'opus', apiKey: '', authRequired: false,
      });
      expect(resolveKimiTieBreakerClientOptions()).toMatchObject({
        provider: 'openai', model: 'kimi-k3', apiKey: 'moonshot-test-key', authRequired: true,
      });
    }, { MOONSHOT_API_KEY: 'moonshot-test-key' });
  });

  test('rejects lower Claude tiers, generic selectors, Kimi challenger, and arbitrary fallback lists', async () => {
    for (const model of ['sonnet', 'haiku', 'default', 'best', 'opusplan', 'kimi-k3']) {
      await withMercuryConfig({ consensus: { model } }, () => {
        expect(() => require('../trai_brain/mercury-bridge/config')).toThrow(/stable fable alias/);
      });
    }
    await withMercuryConfig({ consensus: { provider: 'openai' } }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config')).toThrow(/must be claude-code/);
    });
    await withMercuryConfig({ consensus: { emergencyModel: 'sonnet' } }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config')).toThrow(/stable opus alias/);
    });
    await withMercuryConfig({ consensus: { emergencyModel: ['opus', 'sonnet'] } }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config')).toThrow(/consensus\.emergencyModel/);
    });
  });

  test('rejects challenger API and gateway routing overrides in config', async () => {
    await withMercuryConfig({ consensus: { apiKeyEnv: 'ANTHROPIC_API_KEY' } }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config')).toThrow(/first-party Claude Code subscription routing/);
    });
    await withMercuryConfig({ consensus: { baseUrl: 'https://gateway.example/v1' } }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config')).toThrow(/first-party Claude Code subscription routing/);
    });
  });

  test('scrubs higher-precedence auth, gateway, and cloud-provider environment routing', async () => {
    await withMercuryConfig({}, () => {
      const {
        buildClaudeSubscriptionEnv,
        CLAUDE_SUBSCRIPTION_OVERRIDE_ENV,
      } = require('../trai_brain/mercury-bridge/llm-client');
      const source = Object.fromEntries(CLAUDE_SUBSCRIPTION_OVERRIDE_ENV.map(name => [name, 'divert']));
      source.PATH = '/usr/bin';
      source.MCP_CONFIG = '/tmp/inherited-mcp.json';
      source.CLAUDE_CODE_MCP_CONFIG = '/tmp/claude-mcp.json';
      source.WORKSPACE_MCP_PATH = '/tmp/workspace-mcp.json';
      const child = buildClaudeSubscriptionEnv(source);
      expect(child.PATH).toBe('/usr/bin');
      for (const name of CLAUDE_SUBSCRIPTION_OVERRIDE_ENV) expect(child).not.toHaveProperty(name);
      expect(Object.keys(child).filter(name => /(^|_)MCP(_|$)/i.test(name))).toEqual([]);
    });
  });

  test('Fable and Opus always disable built-ins, slash commands, and inherited MCP servers', async () => {
    await withMercuryConfig({}, async () => {
      const {
        ClaudeCodeConsensusClient,
        resolveConsensusLlmClientOptions,
      } = require('../trai_brain/mercury-bridge/llm-client');
      const authStatus = Buffer.from(JSON.stringify({
        loggedIn: true,
        authMethod: 'claude.ai',
        apiProvider: 'firstParty',
        subscriptionType: 'max',
      }));

      for (const model of ['fable', 'opus']) {
        const appliedModel = `claude-${model}-test`;
        const rawResponse = Buffer.from([
          JSON.stringify({ type: 'system', subtype: 'init', model: appliedModel, tools: [] }),
          JSON.stringify({ type: 'result', subtype: 'success', result: 'PROVIDER_OK' }),
        ].join('\n'));
        const execFileAsync = jest.fn()
          .mockResolvedValueOnce({ stdout: authStatus, stderr: Buffer.alloc(0) })
          .mockResolvedValueOnce({ stdout: rawResponse, stderr: Buffer.alloc(0) });
        const client = new ClaudeCodeConsensusClient(resolveConsensusLlmClientOptions({
          model, execFileAsync,
        }));

        await expect(client.generateResponseWithMetadata('preflight')).resolves.toMatchObject({
          answer: 'PROVIDER_OK',
          metadata: { appliedModel, toolsAvailable: [] },
        });
        const [command, args, options] = execFileAsync.mock.calls[1];
        expect(command).toBe('claude');
        expect(args).toContain('--disable-slash-commands');
        expect(args).toContain('--strict-mcp-config');
        expect(args).not.toContain('--mcp-config');
        expect(args[args.indexOf('--tools') + 1]).toBe('');
        expect(args).not.toContain('/tmp/inherited-mcp.json');
        expect(Object.keys(options.env).filter(name => /(^|_)MCP(_|$)/i.test(name))).toEqual([]);
      }
    }, {
      MCP_CONFIG: '/tmp/inherited-mcp.json',
      CLAUDE_CODE_MCP_CONFIG: '/tmp/claude-mcp.json',
      WORKSPACE_MCP_PATH: '/tmp/workspace-mcp.json',
    });
  });

  test('requires first-party claude.ai subscription auth posture', async () => {
    await withMercuryConfig({}, () => {
      const { parseClaudeAuthStatus } = require('../trai_brain/mercury-bridge/llm-client');
      expect(parseClaudeAuthStatus(JSON.stringify({
        loggedIn: true,
        authMethod: 'claude.ai',
        apiProvider: 'firstParty',
        subscriptionType: 'max',
      }))).toMatchObject({ authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' });
      expect(() => parseClaudeAuthStatus(JSON.stringify({
        loggedIn: true,
        authMethod: 'apiKey',
        apiProvider: 'firstParty',
        subscriptionType: 'max',
      }))).toThrow(/not a first-party claude\.ai subscription/);
      expect(() => parseClaudeAuthStatus('not-json')).toThrow(/malformed JSON/);
    });
  });

  test('extracts applied Claude identity only from provider frames', async () => {
    await withMercuryConfig({}, () => {
      const {
        claudeAppliedModelMatchesAlias,
        extractClaudeCodeAppliedModel,
        extractClaudeCodeResult,
        parseClaudeCodeFrames,
      } = require('../trai_brain/mercury-bridge/llm-client');
      const raw = [
        JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-fable-5' }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'VERDICT: pass' }),
      ].join('\n');
      const frames = parseClaudeCodeFrames(raw);
      expect(extractClaudeCodeAppliedModel(frames)).toBe('claude-fable-5');
      expect(extractClaudeCodeResult(raw)).toBe('VERDICT: pass');
      expect(extractClaudeCodeAppliedModel([{ type: 'result', result: 'answer' }])).toBeNull();
      expect(claudeAppliedModelMatchesAlias('fable', 'claude-fable-5')).toBe(true);
      expect(claudeAppliedModelMatchesAlias('opus', 'claude-opus-4-1')).toBe(true);
      expect(claudeAppliedModelMatchesAlias('fable', 'claude-sonnet-4-5')).toBe(false);
    });
  });

  test('Claude Code result parser retains prior frame and malformed-tail handling', async () => {
    await withMercuryConfig({}, () => {
      const { extractClaudeCodeResult } = require('../trai_brain/mercury-bridge/llm-client');
      expect(extractClaudeCodeResult(JSON.stringify([
        { type: 'assistant', message: { content: [{ type: 'text', text: 'draft answer' }] } },
        { type: 'result', result: 'final answer' },
      ]))).toBe('final answer');
      expect(extractClaudeCodeResult(JSON.stringify({
        type: 'assistant', message: { content: 'assistant answer' },
      }))).toBe('assistant answer');
      expect(extractClaudeCodeResult([
        JSON.stringify({ type: 'result', result: 'real result' }),
        '{ invalid snippet',
      ].join('\n'))).toBe('real result');
      expect(extractClaudeCodeResult('{"type":"result","result":"same-line"}{ invalid snippet'))
        .toBe('same-line');
      expect(extractClaudeCodeResult('[{"type":"result","result":"final"}]{"extra":"data"}'))
        .toBe('final');
    });
  });

  test('Claude Code incomplete responses retain exact machine subconditions and metadata', async () => {
    await withMercuryConfig({}, async () => {
      const {
        ClaudeCodeConsensusClient,
        ClaudeCodeIncompleteResponseError,
        resolveConsensusLlmClientOptions,
      } = require('../trai_brain/mercury-bridge/llm-client');
      const authStatus = Buffer.from(JSON.stringify({
        loggedIn: true,
        authMethod: 'claude.ai',
        apiProvider: 'firstParty',
        subscriptionType: 'max',
      }));
      const cases = [
        {
          expected: ['empty_answer'],
          frames: [
            { type: 'system', subtype: 'init', model: 'claude-fable-5', tools: [] },
            { type: 'result', subtype: 'success', result: '' },
          ],
        },
        {
          expected: ['missing_termination'],
          frames: [
            { type: 'system', subtype: 'init', model: 'claude-fable-5', tools: [] },
            { type: 'assistant', message: { model: 'claude-fable-5', content: 'answer without result frame' } },
          ],
        },
        {
          expected: ['provider_error_termination'],
          frames: [
            { type: 'system', subtype: 'init', model: 'claude-fable-5', tools: [] },
            { type: 'result', subtype: 'error', is_error: true, result: 'provider failed' },
          ],
        },
        {
          expected: ['unexpected_exposed_tools'],
          frames: [
            { type: 'system', subtype: 'init', model: 'claude-fable-5', tools: ['Read'] },
            { type: 'result', subtype: 'success', result: 'answer with tools exposed' },
          ],
        },
      ];

      for (const testCase of cases) {
        const rawResponse = Buffer.from(testCase.frames.map(frame => JSON.stringify(frame)).join('\n'));
        const execFileAsync = jest.fn()
          .mockResolvedValueOnce({ stdout: authStatus, stderr: Buffer.alloc(0) })
          .mockResolvedValueOnce({ stdout: rawResponse, stderr: Buffer.alloc(0) });
        const client = new ClaudeCodeConsensusClient(resolveConsensusLlmClientOptions({
          model: 'fable', execFileAsync,
        }));
        let caught;
        try {
          await client.generateResponseWithMetadata('preflight');
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(ClaudeCodeIncompleteResponseError);
        expect(caught).toMatchObject({
          name: 'ClaudeCodeIncompleteResponseError',
          code: 'CLAUDE_CODE_INCOMPLETE_RESPONSE',
          subcondition: testCase.expected[0],
          subconditions: testCase.expected,
          providerMetadata: {
            appliedModel: 'claude-fable-5',
            rawResponse,
          },
        });
      }
    });
  });

  test('malformed adversarial-review env remains non-fatal', async () => {
    await withMercuryConfig({}, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      expect(config.ADVERSARIAL_REVIEW_DEFAULT_ENABLED).toBe(false);
    }, { MERCURY_ADVERSARIAL_REVIEW: 'maybe' });
  });

  test('Mercury API key must come from the configured key env', async () => {
    await withMercuryConfig({ llm: { apiKeyEnv: 'MERCURY_TEST_LLM_KEY' } }, () => {
      const { resolveMercuryLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      expect(() => resolveMercuryLlmClientOptions({ systemPrompt: 'configured prompt' }))
        .toThrow(/Configured Mercury LLM API key env is missing/);
    }, { MERCURY_TEST_LLM_KEY: undefined });
  });

  test('Mercury client options require a config-owned system prompt', async () => {
    await withMercuryConfig({}, () => {
      const { resolveMercuryLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      expect(() => resolveMercuryLlmClientOptions())
        .toThrow(/Mercury LLM systemPrompt must be supplied from mercury\.config\.json/);
    }, { INCEPTION_API_KEY: 'configured-key' });
  });

  test('agentic numeric overrides fail loud before provider work', async () => {
    await withMercuryConfig({}, async () => {
      const { runAgentic } = require('../trai_brain/mercury-bridge/ask');
      await expect(runAgentic('break this', { quiet: true, maxIterations: 0 }))
        .rejects.toThrow(/--max-iterations must be a positive integer/);
      await expect(runAgentic('break this', { quiet: true, maxIterations: 59 }))
        .rejects.toThrow(/must match mercury\.config\.json value 60/);
      await expect(runAgentic('break this', { quiet: true, maxTokens: Number.NaN }))
        .rejects.toThrow(/--max-tokens must be a positive integer/);
      await expect(runAgentic('break this', { quiet: true, maxTokens: 2000 }))
        .rejects.toThrow(/must match mercury\.config\.json value 7750/);
      await expect(runAgentic('break this', { quiet: true, topK: Number.NaN }))
        .rejects.toThrow(/--top-k must be a non-negative integer/);
    });
  });

  test('single-shot numeric overrides retain their config contract', async () => {
    await withMercuryConfig({}, async () => {
      const { ask } = require('../trai_brain/mercury-bridge/searcher');
      await expect(ask('break this', { topK: 0, verbose: false }))
        .rejects.toThrow(/topK must be a positive integer/);
      await expect(ask('break this', { maxTokens: Number.NaN, verbose: false }))
        .rejects.toThrow(/maxTokens must be a positive integer/);
      await expect(ask('break this', { maxTokens: 7750, verbose: false }))
        .rejects.toThrow(/maxTokens must match mercury\.config\.json value 2000/);
    });
  });

  test('Mercury evidence posture remains deconstrained and tool-backed', () => {
    const prompt = baseMercuryConfig.agentic.systemPrompt.join('\n');
    expect(prompt).toContain('Every concrete claim must be backed by file:line citations');
    expect(prompt).toContain('Use indexed RAG chunks as orientation and memory');
    expect(prompt).toContain('AST TOOLS ARE MANDATORY FOR STRUCTURE CLAIMS');
    expect(prompt).not.toContain('Use git_diff target=current first');
  });

  test('Mercury tool docs remain deconstrained from current-diff-first guidance', () => {
    const toolDocs = createToolAdapter().buildToolDocs();
    expect(toolDocs).toContain('do not assume the current diff is the whole answer');
    expect(toolDocs).not.toContain('Use git_diff target=current first');
  });
});
