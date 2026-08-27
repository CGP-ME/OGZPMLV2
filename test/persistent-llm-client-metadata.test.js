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
      parseStatus: 'parsed',
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
    await expect(client.generateResponseWithMetadata('question'))
      .rejects.toThrow(/terminated before completion/);

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
});
