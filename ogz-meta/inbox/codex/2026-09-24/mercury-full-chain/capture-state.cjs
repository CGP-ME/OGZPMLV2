'use strict';
// Non-mutating source and MongoDB inventory before the separately isolated index.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');
const root = path.resolve(__dirname, '../../../../..');
process.env.MERCURY_CONFIG_FILE = path.resolve(process.argv[2] || path.join(__dirname, 'mercury.isolated.json'));
const output = path.resolve(process.argv[3] || path.join(__dirname, 'source-before-index.json'));
const { walkRepo, OGZ_META_INDEX_TARGETS } = require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const config = require(path.join(root, 'trai_brain/mercury-bridge/config'));
const { isPathIgnoredByMercury } = require(path.join(root, 'trai_brain/repository-policy'));
const live = JSON.parse(fs.readFileSync(path.join(root, 'mercury.config.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const identity = file => { const bytes = fs.readFileSync(path.join(root, file)); const stat = fs.statSync(path.join(root, file));
  return { path: file, bytes: bytes.length, mode: (stat.mode & 0o777).toString(8), sha256: sha(bytes) }; };
async function hashCollection(db, name) {
  const digest = crypto.createHash('sha256'); let count = 0;
  for await (const doc of db.collection(name).find({}).sort({ _id: 1 }).batchSize(50)) {
    digest.update(JSON.stringify(doc)); digest.update('\n'); count++;
  }
  return { collection: name, documents: count, sha256: digest.digest('hex') };
}
async function main() {
  const indexedFiles = walkRepo(root).map(full => identity(path.relative(root, full))).sort((a, b) => a.path.localeCompare(b.path));
  const sourcePaths = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))]
    .filter(p => /\.(?:js|cjs|mjs|json)$/.test(p) && !isPathIgnoredByMercury(p)
      && !/(^|\/)(?:\.env|auth\.json|credentials(?:\.|\/)|.*\.pem$)/i.test(p))
    .filter(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile()).sort();
  const inventory = sourcePaths.map(identity);
  const storage = { database: config.MONGO_DB_NAME, chunks: config.MONGO_COLLECTION_CHUNKS, stats: config.MONGO_COLLECTION_STATS, traces: config.TRACE_COLLECTION };
  if (storage.database === live.mongo.dbName) throw new Error('Isolated database is not distinct');
  const client = new MongoClient(config.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let liveCollections, candidateCollections;
  try {
    await client.connect();
    candidateCollections = await client.db(storage.database).listCollections({}, { nameOnly: true }).toArray();
    if (candidateCollections.length) throw new Error('Selected candidate database already contains collections; do not clear it');
    liveCollections = [];
    for (const name of [live.mongo.chunksCollection, live.mongo.statsCollection, live.traceMemory.collection]) {
      liveCollections.push(await hashCollection(client.db(live.mongo.dbName), name));
    }
  } finally { await client.close(); }
  const receipt = { capturedAt: new Date().toISOString(), root, head: git(['rev-parse', 'HEAD']).trim(),
    branch: git(['branch', '--show-current']).trim(), status: git(['status', '--short', '--branch']),
    stagedDiffSha256: sha(git(['diff', '--cached', '--binary'])), workingDiffSha256: sha(git(['diff', '--binary'])),
    inventory, sourceContentSha256: sha(JSON.stringify(inventory)), indexedFiles,
    indexedContentSha256: sha(JSON.stringify(indexedFiles)),
    loadedConfig: identity(path.relative(root, config.MERCURY_CONFIG_FILE)), repoConfig: identity('mercury.config.json'),
    ignorePolicy: identity('mercury.ignore'), repositoryPolicy: identity('trai_brain/repository-policy.js'),
    storage, liveStorage: { database: live.mongo.dbName, collections: liveCollections }, candidateCollections,
    embedding: { provider: config.EMBED_PROVIDER, model: config.EMBED_MODEL, dimensions: config.EMBED_DIMENSIONS,
      indexId: config.EMBED_INDEX_ID, endpointId: config.EMBED_ENDPOINT_ID },
    indexTargets: OGZ_META_INDEX_TARGETS,
    limitations: ['Rejected dirty Stop 1 source is present, inventoried and unapproved; this review does not land or activate it.',
      'No builder-doctrine file was added to Mercury scope. Existing historical docs remain leads, not automatic authority.',
      'Credentials are neither emitted nor fingerprinted. Source inventory is bounded to nonignored code/config plus selected indexed files.',
      'No bot/runtime acceptance or independent cold environment is established.'] };
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ head: receipt.head, sourceFiles: inventory.length, indexFiles: indexedFiles.length,
    storage, candidateCollections, liveCollectionCounts: liveCollections.map(c => ({ name: c.collection, count: c.documents })),
    sourceContentSha256: receipt.sourceContentSha256, indexedContentSha256: receipt.indexedContentSha256 }));
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
