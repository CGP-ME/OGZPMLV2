'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  readPromptInput,
  runDirectToolLoop,
  executeDirectQuestion,
} = require('../trai_brain/mercury-bridge/direct-question');

function selectedProvider(overrides = {}) {
  return {
    id: 'glm',
    transportProvider: 'openai',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    model: 'glm-5.3',
    apiKeyEnv: 'ZAI_API_KEY',
    systemPrompt: 'Answer the supplied question directly and independently.',
    decisionSteerIteration: 200,
    maxTokens: 32768,
    minimumTokens: 0,
    requestTimeoutMs: 600000,
    temperature: 0.6,
    openaiExtraBody: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    pricing: {
      inputPerMillion: 1.4,
      outputPerMillion: 4.4,
      cachedInputPerMillion: 0.26,
      currency: 'USD',
      source: 'test pricing',
      key: 'pricing.zai.glm53',
    },
    ...overrides,
  };
}

function toolSchema(name) {
  return { type: 'function', function: { name, description: name, parameters: { type: 'object' } } };
}

describe('direct model question mode', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-direct-question-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('parses provider and mode independently from reviewer flags', () => {
    expect(parseArgs([
      'node', 'direct-question.js', '--mode=direct', '--provider=deepseek',
      '--max-iterations=1000', '--max-tokens=4096', 'question',
    ])).toMatchObject({
      mode: 'direct', provider: 'deepseek', maxIterations: 1000, maxTokens: 4096,
      prompt: 'question',
    });
    expect(() => parseArgs([
      'node', 'direct-question.js', '--mode=adversarial', '--provider=glm', 'question',
    ])).toThrow(/only --mode=direct/);
    expect(() => parseArgs([
      'node', 'direct-question.js', '--provider=glm', '--reviewers=kimi', 'question',
    ])).toThrow(/Unknown direct-question flag/);
  });

  test('materially identical prompt/context files dispatch identical input despite different folders', () => {
    for (const folder of ['kimi', 'glm']) {
      fs.mkdirSync(path.join(tmpRoot, folder));
      fs.writeFileSync(path.join(tmpRoot, folder, 'question.md'), 'What is STOP 2?');
      fs.writeFileSync(path.join(tmpRoot, folder, 'walk.md'), 'Trey source text');
    }
    const first = readPromptInput({
      promptFile: 'kimi/question.md', contextFiles: ['kimi/walk.md'], prompt: '',
    }, tmpRoot);
    const second = readPromptInput({
      promptFile: 'glm/question.md', contextFiles: ['glm/walk.md'], prompt: '',
    }, tmpRoot);

    expect(first.prompt).toBe(second.prompt);
    expect(first.prompt).toContain('AUTHORIZED CONTEXT FILES');
    expect(first.prompt).toContain('Trey source text');
    expect(first.promptSource.sha256).toBe(second.promptSource.sha256);
    expect(first.contextSources[0].sha256).toBe(second.contextSources[0].sha256);
  });

  test('neutral tool loop searches the repo without adversarial or candidate-set injection', async () => {
    const calls = [];
    const client = {
      temperature: 0.6,
      generateWithTools: jest.fn(async (messages, tools, options) => {
        calls.push({ messages: JSON.parse(JSON.stringify(messages)), tools, options });
        if (calls.length === 1) {
          return {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call-1', type: 'function',
              function: { name: 'open_file', arguments: '{"path":"core/example.js"}' },
            }],
          };
        }
        return { role: 'assistant', content: 'My independent answer.', tool_calls: [] };
      }),
    };
    const toolAdapter = {
      buildToolSchema: () => [toolSchema('open_file'), toolSchema('get_chunk'), toolSchema('run_check')],
      execute: jest.fn(async () => ({ file: 'core/example.js', content: 'evidence' })),
    };

    const result = await runDirectToolLoop({
      client,
      toolAdapter,
      prompt: 'Trey literal question',
      systemPrompt: 'Answer independently.',
      maxIterations: 5,
      maxTokens: 4096,
      providerAudit: null,
    });

    expect(result.answer).toBe('My independent answer.');
    expect(result.iterations).toBe(2);
    expect(result.toolsAvailable).toEqual(['open_file']);
    expect(toolAdapter.execute).toHaveBeenCalledWith('open_file', { path: 'core/example.js' });
    expect(calls[0].messages[1]).toEqual({ role: 'user', content: 'Trey literal question' });
    expect(calls[0].messages[0].content).not.toMatch(/CANDIDATE SET|VERDICT:|Fable|Mercury/);
    expect(calls[0].tools.map(tool => tool.function.name)).toEqual(['open_file']);
  });

  test('default loop is uncapped and sends one neutral decision steer without forcing an answer', async () => {
    const calls = [];
    const client = {
      temperature: 0.6,
      generateWithTools: jest.fn(async (messages) => {
        calls.push(JSON.parse(JSON.stringify(messages)));
        if (calls.length <= 60) {
          return {
            role: 'assistant', content: null,
            tool_calls: [{
              id: `call-${calls.length}`, type: 'function',
              function: { name: 'open_file', arguments: '{"path":"core/example.js"}' },
            }],
          };
        }
        return { role: 'assistant', content: 'Answer after the former ceiling.', tool_calls: [] };
      }),
    };
    const toolAdapter = {
      buildToolSchema: () => [toolSchema('open_file')],
      execute: jest.fn(async () => ({ file: 'core/example.js', content: 'evidence' })),
    };

    const result = await runDirectToolLoop({
      client, toolAdapter, prompt: 'Investigate fully', systemPrompt: 'Answer directly.',
      maxIterations: null, decisionSteerIteration: 2, maxTokens: 1000,
    });

    expect(result.answer).toBe('Answer after the former ceiling.');
    expect(result.iterations).toBe(61);
    expect(result.iterationLimit).toBeNull();
    expect(result.decisionSteerSentAt).toBe(2);
    expect(calls[2].filter(message => message.role === 'user')).toHaveLength(2);
    expect(calls[2].at(-1).content).toMatch(/If materially relevant paths remain unread, continue/);
    expect(calls[60].filter(message => message.content && message.content.includes('investigation iterations')))
      .toHaveLength(1);
  });

  test('explicit operator iteration limit still stops a direct run when requested', async () => {
    const client = {
      temperature: 0.6,
      generateWithTools: jest.fn(async () => ({
        role: 'assistant', content: null,
        tool_calls: [{
          id: 'call', type: 'function',
          function: { name: 'open_file', arguments: '{"path":"core/example.js"}' },
        }],
      })),
    };
    const toolAdapter = {
      buildToolSchema: () => [toolSchema('open_file')],
      execute: jest.fn(async () => ({ file: 'core/example.js', content: 'evidence' })),
    };

    await expect(runDirectToolLoop({
      client, toolAdapter, prompt: 'Operator bounded', systemPrompt: 'Answer directly.',
      maxIterations: 2, decisionSteerIteration: 200, maxTokens: 1000,
    })).resolves.toMatchObject({
      answer: null, termination: 'max_iterations', iterations: 2, iterationLimit: 2,
    });
  });

  test('unadvertised mutation-capable tool calls are rejected without execution', async () => {
    const seenMessages = [];
    const client = {
      temperature: 0.6,
      generateWithTools: jest.fn(async (messages) => {
        seenMessages.push(JSON.parse(JSON.stringify(messages)));
        if (seenMessages.length === 1) {
          return {
            role: 'assistant', content: null,
            tool_calls: [{
              id: 'call-1', type: 'function',
              function: { name: 'run_check', arguments: '{"command":["npm","test"]}' },
            }],
          };
        }
        return { role: 'assistant', content: 'Stopped without executing it.', tool_calls: [] };
      }),
    };
    const toolAdapter = {
      buildToolSchema: () => [toolSchema('open_file'), toolSchema('run_check')],
      execute: jest.fn(),
    };

    await expect(runDirectToolLoop({
      client, toolAdapter, prompt: 'Read only', systemPrompt: 'Answer directly.',
      maxIterations: 3, maxTokens: 1000,
    })).resolves.toMatchObject({ answer: 'Stopped without executing it.' });
    expect(toolAdapter.execute).not.toHaveBeenCalled();
    expect(seenMessages[1].at(-1).content).toMatch(/unavailable in direct read-only mode/);
  });

  test('writes a direct receipt with every provider turn, tool receipt, model identity, and cost', async () => {
    const rawWrites = [];
    const ledgerWrites = [];
    const responses = [
      {
        message: {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'call-1', type: 'function',
            function: { name: 'open_file', arguments: '{"path":"core/example.js"}' },
          }],
        },
        metadata: {
          provider: 'openai', requestedModel: 'glm-5.3', appliedModel: 'glm-5.3',
          startedAt: '2026-09-10T12:00:00.000Z', finishedAt: '2026-09-10T12:00:01.000Z',
          latencyMs: 1000, statusCode: 200, termination: 'tool_calls', stoppedBecause: 'tool_calls',
          parseStatus: 'parsed', usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
          rawResponse: Buffer.from('turn one'),
        },
      },
      {
        message: { role: 'assistant', content: 'Independent final.', tool_calls: [] },
        metadata: {
          provider: 'openai', requestedModel: 'glm-5.3', appliedModel: 'glm-5.3',
          startedAt: '2026-09-10T12:00:01.000Z', finishedAt: '2026-09-10T12:00:02.000Z',
          latencyMs: 1000, statusCode: 200, termination: 'stop', stoppedBecause: 'stop',
          parseStatus: 'parsed', usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 },
          rawResponse: Buffer.from('turn two'),
        },
      },
    ];
    const client = {
      providerName: 'openai', model: 'glm-5.3', temperature: 0.6,
      initialize: jest.fn(async () => {}),
      generateWithToolsWithMetadata: jest.fn(async () => responses.shift()),
    };
    const toolAdapter = {
      buildToolSchema: () => [toolSchema('open_file')],
      execute: jest.fn(async () => ({ file: 'core/example.js', content: 'evidence' })),
    };
    const result = await executeDirectQuestion({
      providerId: 'glm',
      prompt: 'Question plus authorized context',
      promptSource: { type: 'file', path: 'question.md', sha256: 'a'.repeat(64), bytes: 32 },
      contextSources: [{ type: 'file', path: 'walk.md', sha256: 'b'.repeat(64), bytes: 10 }],
      selected: selectedProvider(),
      createClient: () => client,
      toolAdapter,
      repoRoot: tmpRoot,
      now: () => new Date('2026-09-10T12:00:03.000Z'),
      writeRaw: (args) => {
        rawWrites.push(args);
        return { path: `raw/${args.attempt}.raw`, sha256: 'c'.repeat(64), bytes: args.bytes.length, mode: '0600' };
      },
      writeLedger: (args) => {
        ledgerWrites.push(args);
        return { path: 'runs/2026-09-10.jsonl', citation: 'runs/2026-09-10.jsonl:1', line: 1 };
      },
    });

    expect(result.answer).toBe('Independent final.');
    expect(result.attempts).toHaveLength(2);
    expect(rawWrites).toHaveLength(2);
    expect(ledgerWrites).toHaveLength(1);
    expect(result.entry).toMatchObject({
      receipt_type: 'direct_model_question', mode: 'direct', selected_provider: 'glm',
      requested_model: 'glm-5.3', applied_model: 'glm-5.3',
      adversarial_pipeline_entered: false, reviewer_panel: null, doctrine_review: null,
      termination: 'answer_given', iterations: 2, answer_full: 'Independent final.',
      loop_policy: {
        iteration_limit: null,
        decision_steer_iteration: 200,
        decision_steer_sent_at: null,
      },
      tools_available: ['open_file'], files_opened: ['core/example.js:1-1'],
      run_tokens: { input: 300, output: 30, total: 330, complete: true },
    });
    expect(result.entry.provider_attempts.every(attempt => attempt.cost && attempt.cost.currency === 'USD')).toBe(true);
    expect(result.entry.system_prompt).not.toMatch(/CANDIDATE SET|VERDICT:|Fable|Mercury/);
  });
});
