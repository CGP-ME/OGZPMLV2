'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const baseMercuryConfig = require('../mercury.config.json');

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

function mergeConfig(base, overrides = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === 'object'
      && !Array.isArray(base[key])
    ) {
      result[key] = mergeConfig(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function withMercuryConfig(overrides, fn, env = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-mercury-config-'));
  const configPath = path.join(tmpRoot, 'mercury.config.json');
  const config = mergeConfig(baseMercuryConfig, overrides);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  try {
    return await withEnv({
      MERCURY_CONFIG_FILE: configPath,
      MERCURY_TEST_EMBED_API_KEY: 'test-key',
      OPENAI_API_KEY: 'test-openai-key',
      ...env,
    }, fn);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

const openAiSmallConfig = {
  mongo: {
    chunksCollection: 'chunks',
    statsCollection: 'index_stats',
  },
  embeddings: {
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/embeddings',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    apiKeyEnv: 'MERCURY_TEST_EMBED_API_KEY',
  },
};

const localOllamaConfig = {
  embeddings: {
    provider: 'ollama',
    endpoint: 'http://localhost:11434/api/embed',
    model: 'nomic-embed-text',
    dimensions: 768,
    apiKeyEnv: null,
  },
};

describe('Mercury embedding index identity', () => {
  test('local Nomic index has a distinct provider/model/dimension identity', async () => {
    await withMercuryConfig(localOllamaConfig, () => {
      const config = require('../trai_brain/mercury-bridge/config');

      expect(config.EMBED_PROVIDER).toBe('ollama');
      expect(config.EMBED_DIMENSIONS).toBe(768);
      expect(config.EMBED_ENDPOINT_ID).toBe('http://localhost:11434/api/embed');
      expect(config.EMBED_INDEX_ID).toBe('ollama__http_localhost_11434_api_embed__nomic_embed_text__768');
    });
  });

  test('OpenAI-compatible small embedding index has its own identity', async () => {
    await withMercuryConfig(openAiSmallConfig, () => {
      const config = require('../trai_brain/mercury-bridge/config');

      expect(config.EMBED_PROVIDER).toBe('openai-compatible');
      expect(config.EMBED_DIMENSIONS).toBe(1536);
      expect(config.EMBED_ENDPOINT_ID).toBe('https://api.openai.com/v1/embeddings');
      expect(config.EMBED_INDEX_ID).toBe('openai_compatible__https_api_openai_com_v1_embeddings__text_embedding_3_small__1536');
    });
  });

  test('environment embedding values do not override mercury.config.json lane identity', async () => {
    await withMercuryConfig(localOllamaConfig, () => {
      const config = require('../trai_brain/mercury-bridge/config');

      expect(config.EMBED_PROVIDER).toBe('ollama');
      expect(config.EMBED_MODEL).toBe('nomic-embed-text');
      expect(config.EMBED_DIMENSIONS).toBe(768);
    }, {
      EMBED_PROVIDER: 'openai-compatible',
      EMBED_ENDPOINT: 'https://api.openai.com/v1/embeddings',
      EMBED_MODEL: 'text-embedding-3-small',
      EMBED_DIMENSIONS: '1536',
      EMBED_API_KEY: 'env-key-must-not-be-read',
      OPENAI_API_KEY: 'openai-fallback-must-not-be-read',
      GITHUB_TOKEN: 'github-fallback-must-not-be-read',
    });
  });

  test('OpenAI-compatible config requires its explicit apiKeyEnv value', async () => {
    await withMercuryConfig(openAiSmallConfig, () => {
      expect(() => require('../trai_brain/mercury-bridge/config'))
        .toThrow(/Configured embedding API key env is missing: MERCURY_TEST_EMBED_API_KEY/);
    }, {
      MERCURY_TEST_EMBED_API_KEY: undefined,
      EMBED_API_KEY: 'env-key-must-not-be-read',
      OPENAI_API_KEY: 'openai-fallback-must-not-be-read',
      GITHUB_TOKEN: 'github-fallback-must-not-be-read',
    });
  });

  test('same model and dimensions get different index identities for different endpoints', async () => {
    const first = await withMercuryConfig(openAiSmallConfig, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      return config.EMBED_INDEX_ID;
    });

    const second = await withMercuryConfig({
      ...openAiSmallConfig,
      embeddings: {
        ...openAiSmallConfig.embeddings,
        endpoint: 'https://models.github.ai/inference/embeddings',
      },
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
      ['https://user', ':pass@api.openai.com/v1/embeddings'].join(''),
    ]) {
      await withMercuryConfig({
        ...openAiSmallConfig,
        embeddings: {
          ...openAiSmallConfig.embeddings,
          endpoint,
        },
      }, () => {
        expect(() => require('../trai_brain/mercury-bridge/config'))
          .toThrow(/must not contain credentials, query parameters, or fragments/);
      });
    }
  });

  test('unknown embedding models require explicit dimensions', async () => {
    await withMercuryConfig({
      ...openAiSmallConfig,
      embeddings: {
        ...openAiSmallConfig.embeddings,
        model: 'custom-embedding-model',
        dimensions: undefined,
      },
    }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config'))
        .toThrow(/embeddings\.dimensions/);
    });
  });

  test('MongoStore filters reads and clears by active embedding index', async () => {
    await withMercuryConfig({}, async () => {
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
    await withMercuryConfig({
      mongo: {
        chunksCollection: 'shared_chunks',
        statsCollection: 'shared_index_stats',
      },
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
    await withMercuryConfig({}, () => {
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
    await withMercuryConfig({}, () => {
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
        embed_provider: 'ollama',
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
    await withMercuryConfig({}, async () => {
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
