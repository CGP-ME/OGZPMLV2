'use strict';

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
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
  }
}

describe('Mercury embedding index identity', () => {
  test('local Nomic index has a distinct provider/model/dimension identity', async () => {
    await withEnv({
      EMBED_PROVIDER: 'ollama',
      EMBED_MODEL: 'nomic-embed-text',
      MONGO_COLLECTION_CHUNKS: undefined,
      MONGO_COLLECTION_STATS: undefined,
      EMBED_DIMENSIONS: undefined,
    }, () => {
      const config = require('../trai_brain/mercury-bridge/config');

      expect(config.EMBED_PROVIDER).toBe('ollama');
      expect(config.EMBED_DIMENSIONS).toBe(768);
      expect(config.EMBED_ENDPOINT_ID).toBe('http://localhost:11434/api/embed');
      expect(config.EMBED_INDEX_ID).toBe('ollama__http_localhost_11434_api_embed__nomic_embed_text__768');
    });
  });

  test('OpenAI-compatible small embedding index has its own identity', async () => {
    await withEnv({
      EMBED_PROVIDER: 'openai-compatible',
      EMBED_MODEL: 'text-embedding-3-small',
      EMBED_DIMENSIONS: undefined,
    }, () => {
      const config = require('../trai_brain/mercury-bridge/config');

      expect(config.EMBED_PROVIDER).toBe('openai-compatible');
      expect(config.EMBED_DIMENSIONS).toBe(1536);
      expect(config.EMBED_ENDPOINT_ID).toBe('https://api.openai.com/v1/embeddings');
      expect(config.EMBED_INDEX_ID).toBe('openai_compatible__https_api_openai_com_v1_embeddings__text_embedding_3_small__1536');
    });
  });

  test('same model and dimensions get different index identities for different endpoints', async () => {
    const first = await withEnv({
      EMBED_PROVIDER: 'openai-compatible',
      EMBED_MODEL: 'text-embedding-3-small',
      EMBED_ENDPOINT: 'https://api.openai.com/v1/embeddings',
      EMBED_DIMENSIONS: undefined,
    }, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      return config.EMBED_INDEX_ID;
    });

    const second = await withEnv({
      EMBED_PROVIDER: 'openai-compatible',
      EMBED_MODEL: 'text-embedding-3-small',
      EMBED_ENDPOINT: 'https://models.github.ai/inference/embeddings',
      EMBED_DIMENSIONS: undefined,
    }, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      return config.EMBED_INDEX_ID;
    });

    expect(first).toBe('openai_compatible__https_api_openai_com_v1_embeddings__text_embedding_3_small__1536');
    expect(second).toBe('openai_compatible__https_models_github_ai_inference_embeddings__text_embedding_3_small__1536');
    expect(second).not.toBe(first);
  });

  test('embedding endpoint identity rejects ambiguous or secret-bearing URLs', async () => {
    for (const endpoint of [
      'https://api.openai.com/v1/embeddings?source=proxy',
      'https://api.openai.com/v1/embeddings#proxy',
      'https://user:pass@api.openai.com/v1/embeddings',
    ]) {
      await withEnv({
        EMBED_PROVIDER: 'openai-compatible',
        EMBED_MODEL: 'text-embedding-3-small',
        EMBED_ENDPOINT: endpoint,
        EMBED_DIMENSIONS: undefined,
      }, () => {
        expect(() => require('../trai_brain/mercury-bridge/config'))
          .toThrow(/must not contain credentials, query parameters, or fragments/);
      });
    }
  });

  test('unknown embedding models require explicit dimensions', async () => {
    await withEnv({
      EMBED_PROVIDER: 'openai-compatible',
      EMBED_MODEL: 'custom-embedding-model',
      EMBED_DIMENSIONS: undefined,
    }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config'))
        .toThrow(/EMBED_DIMENSIONS is required/);
    });
  });

  test('MongoStore filters reads and clears by active embedding index', async () => {
    await withEnv({
      EMBED_PROVIDER: 'ollama',
      EMBED_MODEL: 'nomic-embed-text',
      EMBED_DIMENSIONS: undefined,
    }, async () => {
      const config = require('../trai_brain/mercury-bridge/config');
      const MongoStore = require('../trai_brain/mercury-bridge/mongo-store');
      const store = new MongoStore();
      const toArray = jest.fn(async () => []);
      const find = jest.fn(() => ({ toArray }));
      const deleteMany = jest.fn(async () => ({ deletedCount: 3 }));
      const countDocuments = jest.fn(async () => 5);
      const activeQuery = {
        embed_index_id: config.EMBED_INDEX_ID,
        embed_provider: config.EMBED_PROVIDER,
        embed_endpoint_id: config.EMBED_ENDPOINT_ID,
        embed_model: config.EMBED_MODEL,
        embed_dimensions: config.EMBED_DIMENSIONS,
      };

      store.chunks = {
        find,
        deleteMany,
        countDocuments,
      };

      await store.clearAll();
      await store.fetchAllForScoring();
      await store.fetchByIds(['chunk-a']);

      expect(deleteMany).toHaveBeenCalledWith(activeQuery);
      expect(find).toHaveBeenNthCalledWith(
        1,
        activeQuery,
        expect.any(Object)
      );
      expect(find).toHaveBeenNthCalledWith(2, {
        ...activeQuery,
        _id: { $in: ['chunk-a'] },
      });
    });
  });

  test('MongoStore collection override still filters by active embedding lane', async () => {
    await withEnv({
      EMBED_PROVIDER: 'ollama',
      EMBED_MODEL: 'nomic-embed-text',
      EMBED_DIMENSIONS: undefined,
      MONGO_COLLECTION_CHUNKS: 'shared_chunks',
      MONGO_COLLECTION_STATS: 'shared_index_stats',
    }, async () => {
      const config = require('../trai_brain/mercury-bridge/config');
      const MongoStore = require('../trai_brain/mercury-bridge/mongo-store');
      const store = new MongoStore();
      const toArray = jest.fn(async () => []);
      const find = jest.fn(() => ({ toArray }));
      const activeQuery = {
        embed_index_id: config.EMBED_INDEX_ID,
        embed_provider: config.EMBED_PROVIDER,
        embed_endpoint_id: config.EMBED_ENDPOINT_ID,
        embed_model: config.EMBED_MODEL,
        embed_dimensions: config.EMBED_DIMENSIONS,
      };

      expect(config.MONGO_COLLECTION_CHUNKS).toBe('shared_chunks');
      expect(config.MONGO_COLLECTION_STATS).toBe('shared_index_stats');

      store.chunks = { find };
      await store.fetchAllForScoring();

      expect(find).toHaveBeenCalledWith(activeQuery, expect.any(Object));
    });
  });

  test('MongoStore rejects chunks from another embedding index', async () => {
    await withEnv({
      EMBED_PROVIDER: 'ollama',
      EMBED_MODEL: 'nomic-embed-text',
      EMBED_DIMENSIONS: undefined,
    }, () => {
      const MongoStore = require('../trai_brain/mercury-bridge/mongo-store');
      const store = new MongoStore();

      expect(() => store.assertActiveEmbedChunks([{
        embed_index_id: 'openai_compatible__https_api_openai_com_v1_embeddings__text_embedding_3_small__1536',
        embed_dimensions: 1536,
        embedding: new Array(1536).fill(0),
      }])).toThrow(/does not match active/);
    });
  });

  test('MongoStore rejects chunks with spoofed index identity metadata', async () => {
    await withEnv({
      EMBED_PROVIDER: 'ollama',
      EMBED_MODEL: 'nomic-embed-text',
      EMBED_DIMENSIONS: undefined,
    }, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      const MongoStore = require('../trai_brain/mercury-bridge/mongo-store');
      const store = new MongoStore();
      const activeChunk = {
        embed_index_id: config.EMBED_INDEX_ID,
        embed_provider: config.EMBED_PROVIDER,
        embed_endpoint_id: config.EMBED_ENDPOINT_ID,
        embed_model: config.EMBED_MODEL,
        embed_dimensions: config.EMBED_DIMENSIONS,
        embedding: new Array(config.EMBED_DIMENSIONS).fill(0),
      };

      expect(() => store.assertActiveEmbedChunks([{
        ...activeChunk,
        embed_provider: 'openai-compatible',
      }])).toThrow(/embed_provider=.*does not match active/);

      expect(() => store.assertActiveEmbedChunks([{
        ...activeChunk,
        embed_endpoint_id: 'https://models.github.ai/inference/embeddings',
      }])).toThrow(/embed_endpoint_id=.*does not match active/);

      expect(() => store.assertActiveEmbedChunks([{
        ...activeChunk,
        embed_model: 'text-embedding-3-small',
      }])).toThrow(/embed_model=.*does not match active/);
    });
  });

  test('MongoStore rejects contaminated chunks returned by active-lane reads', async () => {
    await withEnv({
      EMBED_PROVIDER: 'ollama',
      EMBED_MODEL: 'nomic-embed-text',
      EMBED_DIMENSIONS: undefined,
    }, async () => {
      const config = require('../trai_brain/mercury-bridge/config');
      const MongoStore = require('../trai_brain/mercury-bridge/mongo-store');
      const store = new MongoStore();
      const contaminatedChunk = {
        _id: 'contaminated',
        embed_index_id: config.EMBED_INDEX_ID,
        embed_provider: config.EMBED_PROVIDER,
        embed_endpoint_id: config.EMBED_ENDPOINT_ID,
        embed_model: config.EMBED_MODEL,
        embed_dimensions: config.EMBED_DIMENSIONS,
        embedding: new Array(config.EMBED_DIMENSIONS + 1).fill(0),
      };

      store.chunks = {
        find: jest.fn(() => ({
          toArray: jest.fn(async () => [contaminatedChunk]),
        })),
      };

      await expect(store.fetchAllForScoring()).rejects.toThrow(/embedding length does not match active/);
      await expect(store.fetchByIds(['contaminated'])).rejects.toThrow(/embedding length does not match active/);
    });
  });
});
