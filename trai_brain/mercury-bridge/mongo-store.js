/**
 * Mercury Bridge — MongoDB Storage Layer
 * ══════════════════════════════════════════════════════════════
 * Handles all MongoDB operations for the code knowledge index.
 *
 * Collections:
 *   chunks       — one document per code chunk with embedding vector
 *   index_stats  — metadata about the latest indexing run
 *
 * Cosine similarity is computed in JS after retrieving all candidates.
 * For MVP this is fine at ~3000 chunks (<100ms). Upgrade to Atlas
 * Vector Search ($vectorSearch) later if scale demands it.
 */

'use strict';

const { MongoClient } = require('mongodb');
const config = require('./config');

function activeEmbedQuery(extra = {}) {
  return {
    embed_index_id: config.EMBED_INDEX_ID,
    embed_provider: config.EMBED_PROVIDER,
    embed_endpoint_id: config.EMBED_ENDPOINT_ID,
    embed_model: config.EMBED_MODEL,
    embed_dimensions: config.EMBED_DIMENSIONS,
    ...extra,
  };
}

class MongoStore {
  constructor() {
    this.client = null;
    this.db = null;
    this.chunks = null;
    this.stats = null;
    this._connected = false;
  }

  async connect() {
    if (this._connected) return;

    this.client = new MongoClient(config.MONGO_URI, {
      // Defaults are fine for local MongoDB; Atlas users can override via MONGO_URI
    });
    await this.client.connect();

    this.db = this.client.db(config.MONGO_DB_NAME);
    this.chunks = this.db.collection(config.MONGO_COLLECTION_CHUNKS);
    this.stats = this.db.collection(config.MONGO_COLLECTION_STATS);
    this._connected = true;

    // Ensure indexes exist (idempotent, safe to call repeatedly)
    await this.chunks.createIndex({ file_path: 1 });
    await this.chunks.createIndex({ kind: 1 });
    await this.chunks.createIndex({ indexed_at: -1 });
    await this.chunks.createIndex({ embed_index_id: 1 });
    await this.chunks.createIndex({ embed_index_id: 1, file_path: 1 });
    await this.chunks.createIndex({
      embed_index_id: 1,
      embed_provider: 1,
      embed_endpoint_id: 1,
      embed_model: 1,
      embed_dimensions: 1,
    });
    await this.chunks.createIndex({
      embed_index_id: 1,
      embed_provider: 1,
      embed_endpoint_id: 1,
      embed_model: 1,
      embed_dimensions: 1,
      file_path: 1,
    });
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this._connected = false;
    }
  }

  /**
   * Replace all chunks for a given file with a new set.
   * Used during indexing — if a file changes, all its old chunks are removed
   * before the new ones are inserted.
   */
  async upsertFileChunks(filePath, chunks) {
    this.assertActiveEmbedChunks(chunks);
    await this.chunks.deleteMany(activeEmbedQuery({ file_path: filePath }));
    if (chunks.length === 0) return { inserted: 0 };
    const result = await this.chunks.insertMany(chunks);
    return { inserted: result.insertedCount };
  }

  /**
   * Bulk insert — used when doing a full reindex.
   * Caller is responsible for clearing the collection first via clearAll().
   */
  async bulkInsert(chunks) {
    if (chunks.length === 0) return { inserted: 0 };
    this.assertActiveEmbedChunks(chunks);
    // Chunk the inserts to avoid MongoDB's 16MB document size limit on batch ops
    const BATCH_SIZE = 500;
    let total = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const result = await this.chunks.insertMany(batch, { ordered: false });
      total += result.insertedCount;
    }
    return { inserted: total };
  }

  /**
   * Delete all chunks — used for full reindex.
   */
  async clearAll() {
    const result = await this.chunks.deleteMany(activeEmbedQuery());
    return { deleted: result.deletedCount };
  }

  /**
   * Retrieve all chunks into memory for cosine similarity search.
   * At ~3000 chunks of 768-dim vectors, this is about 10MB in memory — fine.
   * Projection excludes the text field to keep memory lean during scoring;
   * we fetch full text only for the top-K winners via fetchById().
   */
  async fetchAllForScoring() {
    const cursor = this.chunks.find(
      activeEmbedQuery(),
      {
        projection: {
          _id: 1,
          file_path: 1,
          kind: 1,
          name: 1,
          content_type: 1,
          start_line: 1,
          end_line: 1,
          embedding: 1,
          embed_index_id: 1,
          embed_provider: 1,
          embed_endpoint_id: 1,
          embed_model: 1,
          embed_dimensions: 1,
          text: 1,
          // text included for BM25 scoring in Layer 2 hybrid retrieval
        },
      }
    );
    const chunks = await cursor.toArray();
    this.assertActiveEmbedChunks(chunks);
    return chunks;
  }

  /**
   * Fetch full documents for a set of IDs. Used to hydrate the top-K
   * winners with their full text for prompt assembly.
   */
  async fetchByIds(ids) {
    const cursor = this.chunks.find(activeEmbedQuery({ _id: { $in: ids } }));
    const chunks = await cursor.toArray();
    this.assertActiveEmbedChunks(chunks);
    return chunks;
  }

  /**
   * Record metadata about an indexing run.
   */
  async recordIndexRun(stats) {
    await this.stats.insertOne({
      ...stats,
      embed_index_id: config.EMBED_INDEX_ID,
      embed_provider: config.EMBED_PROVIDER,
      embed_endpoint_id: config.EMBED_ENDPOINT_ID,
      embed_model: config.EMBED_MODEL,
      embed_dimensions: config.EMBED_DIMENSIONS,
      run_at: new Date(),
    });
  }

  /**
   * Get collection stats for observability.
   */
  async getStats() {
    const chunkCount = await this.chunks.countDocuments(activeEmbedQuery());
    const latestRun = await this.stats
      .find(activeEmbedQuery())
      .sort({ run_at: -1 })
      .limit(1)
      .toArray();

    return {
      chunkCount,
      latestRun: latestRun[0] || null,
    };
  }

  /**
   * Health check — verify connection + collection accessible.
   */
  async healthCheck() {
    try {
      await this.db.command({ ping: 1 });
      const count = await this.chunks.countDocuments();
      const activeCount = await this.chunks.countDocuments(activeEmbedQuery());
      return {
        ok: true,
        chunkCount: activeCount,
        totalChunkCount: count,
        embedIndexId: config.EMBED_INDEX_ID,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  assertActiveEmbedChunks(chunks) {
    for (const chunk of chunks || []) {
      if (chunk.embed_index_id !== config.EMBED_INDEX_ID) {
        throw new Error(`Chunk embed_index_id=${chunk.embed_index_id} does not match active ${config.EMBED_INDEX_ID}`);
      }
      if (chunk.embed_provider !== config.EMBED_PROVIDER) {
        throw new Error(`Chunk embed_provider=${chunk.embed_provider} does not match active ${config.EMBED_PROVIDER}`);
      }
      if (chunk.embed_endpoint_id !== config.EMBED_ENDPOINT_ID) {
        throw new Error(`Chunk embed_endpoint_id=${chunk.embed_endpoint_id} does not match active ${config.EMBED_ENDPOINT_ID}`);
      }
      if (chunk.embed_model !== config.EMBED_MODEL) {
        throw new Error(`Chunk embed_model=${chunk.embed_model} does not match active ${config.EMBED_MODEL}`);
      }
      if (chunk.embed_dimensions !== config.EMBED_DIMENSIONS) {
        throw new Error(`Chunk embed_dimensions=${chunk.embed_dimensions} does not match active ${config.EMBED_DIMENSIONS}`);
      }
      if (!Array.isArray(chunk.embedding) || chunk.embedding.length !== config.EMBED_DIMENSIONS) {
        throw new Error(`Chunk embedding length does not match active ${config.EMBED_DIMENSIONS}`);
      }
    }
  }
}

module.exports = MongoStore;
