'use strict';

const PersistentLLMClient = require('../core/persistent_llm_client');

function createClient() {
  const client = new PersistentLLMClient({
    provider: 'openai',
    baseUrl: 'https://provider.example/v1',
    model: 'requested-model',
    apiKey: 'test-key',
    authRequired: true,
    maxTokens: 2000,
    minimumTokens: 0,
    temperature: 0.6,
    requestTimeoutMs: 300000,
    systemPrompt: 'system prompt',
  });
  client.isReady = true;
  return client;
}

describe('PersistentLLMClient metadata siblings', () => {
  test('returns exact raw response bytes and provider-applied identity', async () => {
    const client = createClient();
    const rawBody = Buffer.from(JSON.stringify({
      model: 'applied-model-202608',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 25,
        total_tokens: 125,
        prompt_tokens_details: { cached_tokens: 40 },
      },
      choices: [{ finish_reason: 'stop', message: { content: 'provider answer' } }],
    }));
    client._httpRequestWithMetadata = jest.fn(async () => ({ statusCode: 200, headers: {}, rawBody }));
    const response = await client.generateResponseWithMetadata('question');
    expect(response.answer).toBe('provider answer');
    expect(response.metadata).toMatchObject({
      provider: 'openai',
      requestedModel: 'requested-model',
      appliedModel: 'applied-model-202608',
      termination: 'stop',
      stoppedBecause: 'stop',
      parseStatus: 'parsed',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 25,
        total_tokens: 125,
        prompt_tokens_details: { cached_tokens: 40 },
      },
    });
    expect(response.metadata.rawResponse).toEqual(rawBody);
  });

  test('tool metadata sibling preserves wrapper shape and rejects missing applied identity', async () => {
    const client = createClient();
    const rawBody = Buffer.from(JSON.stringify({
      model: 'applied-model-202608',
      choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [] } }],
    }));
    client._httpRequestWithMetadata = jest.fn(async () => ({ statusCode: 200, headers: {}, rawBody }));
    await expect(client.generateWithToolsWithMetadata([], [])).resolves.toMatchObject({
      message: { role: 'assistant', tool_calls: [] },
      metadata: { appliedModel: 'applied-model-202608', termination: 'tool_calls' },
    });

    const missingIdentity = Buffer.from(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'answer' } }],
    }));
    client._httpRequestWithMetadata = jest.fn(async () => ({ statusCode: 200, headers: {}, rawBody: missingIdentity }));
    await expect(client.generateResponseWithMetadata('question'))
      .rejects.toThrow(/omitted applied model identity/);
  });

  test('metadata siblings reject provider output without termination evidence', async () => {
    const client = createClient();
    const responseWithoutTermination = Buffer.from(JSON.stringify({
      model: 'applied-model-202608',
      choices: [{ message: { content: 'answer' } }],
    }));
    client._httpRequestWithMetadata = jest.fn(async () => ({
      statusCode: 200, headers: {}, rawBody: responseWithoutTermination,
    }));
    await expect(client.generateResponseWithMetadata('question'))
      .rejects.toThrow(/omitted termination status/);
    await expect(client.generateWithToolsWithMetadata([], []))
      .rejects.toThrow(/omitted termination status/);
  });

  test('metadata siblings reject truncated and empty provider answers', async () => {
    const client = createClient();
    client._httpRequestWithMetadata = jest.fn(async () => ({
      statusCode: 200,
      headers: {},
      rawBody: Buffer.from(JSON.stringify({
        model: 'applied-model-202608',
        choices: [{ finish_reason: 'length', message: { content: 'truncated' } }],
      })),
    }));
    let truncated;
    try {
      await client.generateResponseWithMetadata('question');
    } catch (error) {
      truncated = error;
    }
    expect(truncated.message).toMatch(/terminated before completion/);
    expect(truncated.providerMetadata.stoppedBecause).toBe('length: hit 2000-token cap');

    client._httpRequestWithMetadata = jest.fn(async () => ({
      statusCode: 200,
      headers: {},
      rawBody: Buffer.from(JSON.stringify({
        model: 'applied-model-202608',
        choices: [{ finish_reason: 'stop', message: { content: '' } }],
      })),
    }));
    await expect(client.generateResponseWithMetadata('question'))
      .rejects.toThrow(/omitted answer content/);
  });

  test('captures Anthropic-style input/output and cache usage without substituting zero', async () => {
    const client = new PersistentLLMClient({
      provider: 'claude',
      baseUrl: 'https://provider.example/v1',
      model: 'claude-test',
      apiKey: 'test-key',
      authRequired: true,
      maxTokens: 2000,
      minimumTokens: 0,
      temperature: 0.6,
      requestTimeoutMs: 300000,
      systemPrompt: 'system prompt',
    });
    client.isReady = true;
    const rawBody = Buffer.from(JSON.stringify({
      model: 'claude-test-202609',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'provider answer' }],
      usage: {
        input_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
        output_tokens: 10,
      },
    }));
    client._httpRequestWithMetadata = jest.fn(async () => ({ statusCode: 200, headers: {}, rawBody }));

    const response = await client.generateResponseWithMetadata('question');

    expect(response.metadata.usage).toEqual({
      input_tokens: 20,
      cache_creation_input_tokens: 30,
      cache_read_input_tokens: 40,
      output_tokens: 10,
    });
    expect(response.metadata.stoppedBecause).toBe('end_turn');

    const withoutUsage = Buffer.from(JSON.stringify({
      model: 'claude-test-202609', stop_reason: 'end_turn', content: [{ type: 'text', text: 'answer' }],
    }));
    client._httpRequestWithMetadata = jest.fn(async () => ({ statusCode: 200, headers: {}, rawBody: withoutUsage }));
    await expect(client.generateResponseWithMetadata('question')).resolves.toMatchObject({
      metadata: { usage: null },
    });
  });
});
