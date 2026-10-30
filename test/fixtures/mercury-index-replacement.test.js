'use strict';

require('../helpers/require-isolation.cjs')();
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { MongoClient } = require('mongodb');

const mockConfig = {
  MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB_NAME: 'index_replacement_test',
  MONGO_COLLECTION_CHUNKS: 'chunks', MONGO_COLLECTION_STATS: 'stats',
  EMBED_PROVIDER: 'openai-compatible', EMBED_MODEL: 'synthetic-embedding',
  EMBED_ENDPOINT_ID: 'synthetic-provider', EMBED_INDEX_ID: 'synthetic-index',
  EMBED_DIMENSIONS: 3, EMBED_API_KEY: 'synthetic-test-key',
  EMBED_BATCH_MAX_TOKENS: 2000, EMBED_BATCH_MAX_CHUNKS: 64,
  EMBED_FAIL_ON_BATCH_ERROR: true, EMBED_MIN_INTERVAL_MS: 0,
  INDEX_FILE_EXTENSIONS: new Set(['.js']), SKIP_DIRS: new Set(),
  SKIP_FILE_EXTENSIONS: new Set(), SKIP_FILE_PATTERNS: [],
  MAX_FILE_BYTES: 500000, MAX_CHUNK_CHARS: 1500, CHUNK_WINDOW_SIZE: 1000,
  CHUNK_WINDOW_OVERLAP: 100, isPathIgnoredByMercury: () => false,
};
jest.mock('../../trai_brain/mercury-bridge/config', () => mockConfig);
const MongoStore = require('../../trai_brain/mercury-bridge/mongo-store');
const { main } = require('../../trai_brain/mercury-bridge/indexer');

let scratch, daemon, client, db, store, endpoint;
let embedStatus;
const chunk = id => ({
  _id: id, file_path: `${id}.js`, text: `function ${id}() { return 1; }`,
  embedding: [0.1, 0.2, 0.3], embed_index_id: mockConfig.EMBED_INDEX_ID,
  embed_provider: mockConfig.EMBED_PROVIDER, embed_endpoint_id: mockConfig.EMBED_ENDPOINT_ID,
  embed_model: mockConfig.EMBED_MODEL, embed_dimensions: mockConfig.EMBED_DIMENSIONS,
});

beforeAll(async () => {
  // tcmalloc reads this topology file before mongod starts. Supply it only in
  // the disposable mount namespace; the operator's /sys remains unmounted.
  const processors = [...fs.readFileSync('/proc/cpuinfo', 'utf8').matchAll(/^processor\s+:\s+(\d+)$/gm)]
    .map(match => Number(match[1]));
  fs.mkdirSync('/sys/devices/system/cpu', { recursive: true });
  fs.writeFileSync('/sys/devices/system/cpu/possible', `0-${Math.max(...processors)}\n`);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-index-replacement-'));
  const dbPath = path.join(scratch, 'mongo'); fs.mkdirSync(dbPath);
  mockConfig.REPO_ROOT = path.join(scratch, 'source'); fs.mkdirSync(mockConfig.REPO_ROOT);
  fs.writeFileSync(path.join(mockConfig.REPO_ROOT, 'sample.js'), 'function sample() { return 7; }\n');
  mockConfig.MERCURY_IGNORE_FILE = path.join(scratch, 'mercury.ignore');
  fs.writeFileSync(mockConfig.MERCURY_IGNORE_FILE, '');
  daemon = spawn('/usr/bin/mongod', ['--dbpath', dbPath, '--bind_ip', '127.0.0.1',
    '--port', '27017', '--nounixsocket', '--wiredTigerCacheSizeGB', '0.25',
    '--setParameter', 'enableTestCommands=1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let startupOutput = '';
    daemon.once('error', reject);
    daemon.once('exit', (code, signal) => reject(new Error(`isolated mongod exited ${code}/${signal}: ${startupOutput}`)));
    daemon.stderr.on('data', data => { startupOutput += data; });
    daemon.stdout.on('data', data => { startupOutput += data; if (String(data).includes('Waiting for connections')) resolve(); });
  });
  client = new MongoClient(mockConfig.MONGO_URI); await client.connect();
  db = client.db(mockConfig.MONGO_DB_NAME);
  endpoint = http.createServer((req, res) => {
    let body = ''; req.on('data', b => { body += b; }); req.on('end', () => {
      res.writeHead(embedStatus, { 'Content-Type': 'application/json' });
      const input = JSON.parse(body).input;
      res.end(JSON.stringify(embedStatus === 200
        ? { data: input.map((_, index) => ({ index, embedding: [0.1, 0.2, 0.3] })) }
        : { error: { code: 'credit_balance_exhausted', message: 'Synthetic exhausted credit' } }));
    });
  });
  await new Promise(resolve => endpoint.listen(0, '127.0.0.1', resolve));
  mockConfig.EMBED_ENDPOINT = `http://127.0.0.1:${endpoint.address().port}/embeddings`;
}, 30000);

beforeEach(async () => {
  await db.dropDatabase(); embedStatus = 200;
  store = new MongoStore(); await store.connect();
  await store.bulkInsert([chunk('published')]);
  await store.chunks.insertOne({ ...chunk('other'), embed_index_id: 'other-index' });
});
afterEach(async () => { if (store) await store.disconnect(); });
afterAll(async () => {
  if (endpoint) await new Promise(resolve => endpoint.close(resolve));
  if (client) await client.close();
  if (daemon && daemon.exitCode === null && daemon.signalCode === null) {
    const stopped = new Promise(resolve => daemon.once('exit', resolve)); daemon.kill('SIGTERM'); await stopped;
  }
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

async function publishedIds() {
  return (await db.collection('chunks').find({}, { projection: { _id: 1 } }).toArray()).map(x => x._id).sort();
}

test('real quota failure during main preserves every published document', async () => {
  embedStatus = 429;
  await expect(main()).rejects.toThrow(/credit_balance_exhausted/);
  expect(await publishedIds()).toEqual(['other', 'published']);
  expect(await db.collection('stats').countDocuments()).toBe(0);
});

test('a failed second Mongo insert batch leaves the published index intact', async () => {
  const replacement = Array.from({ length: 500 }, (_, i) => chunk(`new${i}`));
  replacement.push(chunk('new0'));
  await expect(store.replaceAll(replacement)).rejects.toThrow(/duplicate key/);
  expect(await publishedIds()).toEqual(['other', 'published']);
  const staged = (await db.listCollections().toArray()).filter(c => c.name.includes('__building_'));
  expect(staged).toHaveLength(1);
  expect(await db.collection(staged[0].name).countDocuments()).toBe(501);
});

test('a failed index build preserves the old collection and its indexes', async () => {
  await store.chunks.createIndex({ file_path: 1 }, { unique: true, name: 'unique_file' });
  await expect(store.replaceAll([chunk('one'), { ...chunk('two'), file_path: 'one.js' }])).rejects.toThrow(/duplicate key/);
  expect(await publishedIds()).toEqual(['other', 'published']);
  expect((await store.chunks.indexes()).some(i => i.name === 'unique_file' && i.unique)).toBe(true);
});

test('successful replacement publishes all new chunks and retains other embedding identities', async () => {
  const priorIndexes = (await store.chunks.indexes()).map(i => i.name).sort();
  expect(await store.replaceAll([chunk('one'), chunk('two')])).toEqual({ inserted: 2 });
  expect(await publishedIds()).toEqual(['one', 'other', 'two']);
  expect((await store.fetchAllForScoring()).map(c => c._id).sort()).toEqual(['one', 'two']);
  expect((await store.chunks.indexes()).map(i => i.name).sort()).toEqual(priorIndexes);
  expect((await db.listCollections().toArray()).filter(c => c.name.includes('__building_'))).toHaveLength(0);
});

test('a server-rejected rename leaves the old published index and complete staged build intact', async () => {
  await db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 },
    data: { failCommands: ['renameCollection'], errorCode: 13 } });
  await expect(store.replaceAll([chunk('replacement')])).rejects.toMatchObject({ code: 13 });
  expect(await publishedIds()).toEqual(['other', 'published']);
  const staged = (await db.listCollections().toArray()).filter(c => c.name.includes('__building_'));
  expect(staged).toHaveLength(1);
  const stagedIds = (await db.collection(staged[0].name).find().toArray()).map(c => c._id).sort();
  expect(stagedIds).toEqual(['other', 'replacement']);
});

test('an overlapping rebuild cannot overwrite another identity that published after its copy', async () => {
  let copied, release;
  const copiedPromise = new Promise(resolve => { copied = resolve; });
  const releasePromise = new Promise(resolve => { release = resolve; });
  const aggregate = store.chunks.aggregate.bind(store.chunks);
  const copySpy = jest.spyOn(store.chunks, 'aggregate').mockImplementation((...args) => {
    const cursor = aggregate(...args);
    const toArray = cursor.toArray.bind(cursor);
    cursor.toArray = async () => {
      const result = await toArray(); copied(); await releasePromise; return result;
    };
    return cursor;
  });
  const firstBuild = store.replaceAll([chunk('firstReplacement')]);
  await copiedPromise;
  const firstIdentity = mockConfig.EMBED_INDEX_ID;
  const secondStore = new MongoStore();
  try {
    mockConfig.EMBED_INDEX_ID = 'other-index';
    await secondStore.connect();
    await secondStore.replaceAll([chunk('secondReplacement')]);
    mockConfig.EMBED_INDEX_ID = firstIdentity;
    release();
    const failure = await firstBuild.then(() => null, error => error);
    expect(await publishedIds()).toEqual(['published', 'secondReplacement']);
    expect(failure).toMatchObject({ code: 361 });
    await store.replaceAll([chunk('firstReplacement')]);
    expect(await publishedIds()).toEqual(['firstReplacement', 'secondReplacement']);
  } finally {
    mockConfig.EMBED_INDEX_ID = firstIdentity;
    release(); copySpy.mockRestore(); await secondStore.disconnect();
  }
});

test('main publishes a complete build and records its actual chunk count', async () => {
  await main();
  const chunks = await store.fetchAllForScoring();
  expect(chunks).toHaveLength(1); expect(chunks[0].file_path).toBe('sample.js');
  expect(await publishedIds()).toContain('other'); expect(await publishedIds()).not.toContain('published');
  const stats = await db.collection('stats').findOne();
  expect(stats.chunks_embedded).toBe(1); expect(stats.embed_errors).toBe(0);
});
