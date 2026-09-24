'use strict';
// Read-only reconciliation of actual database chunks against captured source bytes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');
const root = path.resolve(__dirname, '../../../../..');
const snapshotPath = path.resolve(process.argv[2] || path.join(__dirname, 'source-before-index.json'));
const output = path.resolve(process.argv[3] || path.join(__dirname, 'index-verification.json'));
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
process.env.MERCURY_CONFIG_FILE = path.join(root, snapshot.loadedConfig.path);
const { walkRepo, processFile } = require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const config = require(path.join(root, 'trai_brain/mercury-bridge/config'));
const { isPathIgnoredByMercury } = require(path.join(root, 'trai_brain/repository-policy'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const key = c => sha(JSON.stringify([c.file_path, c.file_sha, c.kind, c.name, c.content_type, c.start_line, c.end_line, c.text]));
async function main() {
  if (fs.existsSync(output)) throw new Error('Preserve prior receipt; use a new output path');
  const mismatches = [], expected = new Map(), fileCoverage = [];
  const sourcePaths = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))]
    .filter(p => /\.(?:js|cjs|mjs|json)$/.test(p) && !isPathIgnoredByMercury(p)
      && !/(^|\/)(?:\.env|auth\.json|credentials(?:\.|\/)|.*\.pem$)/i.test(p))
    .filter(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile()).sort();
  if (JSON.stringify(sourcePaths) !== JSON.stringify(snapshot.inventory.map(f => f.path).sort())) mismatches.push('nonignored_source_path_set_changed');
  if (git(['rev-parse', 'HEAD']).trim() !== snapshot.head) mismatches.push('head_changed');
  if (git(['branch', '--show-current']).trim() !== snapshot.branch) mismatches.push('branch_changed');
  if (sha(git(['diff', '--cached', '--binary'])) !== snapshot.stagedDiffSha256) mismatches.push('staged_diff_changed');
  if (sha(git(['diff', '--binary'])) !== snapshot.workingDiffSha256) mismatches.push('working_diff_changed');
  const eligible = walkRepo(root).map(full => path.relative(root, full)).sort();
  if (JSON.stringify(eligible) !== JSON.stringify(snapshot.indexedFiles.map(f => f.path).sort())) mismatches.push('eligible_path_set_changed');
  for (const file of [...snapshot.inventory, ...snapshot.indexedFiles, snapshot.loadedConfig, snapshot.repoConfig, snapshot.ignorePolicy, snapshot.repositoryPolicy]) {
    const full = path.join(root, file.path);
    if (!fs.existsSync(full) || sha(fs.readFileSync(full)) !== file.sha256 || (fs.statSync(full).mode & 0o777).toString(8) !== file.mode) mismatches.push(file.path);
  }
  for (const file of snapshot.indexedFiles) {
    const chunks = await processFile(path.join(root, file.path), root);
    chunks.forEach(c => expected.set(key(c), (expected.get(key(c)) || 0) + 1));
    fileCoverage.push({ path: file.path, sha256: file.sha256, expected: chunks.length, stored: 0 });
  }
  const byPath = new Map(fileCoverage.map(f => [f.path, f]));
  const client = new MongoClient(config.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let stored = 0, latest;
  const unexpected = [], badEmbeddings = [], liveAfter = [], digest = crypto.createHash('sha256');
  try {
    await client.connect();
    const db = client.db(config.MONGO_DB_NAME);
    latest = await db.collection(config.MONGO_COLLECTION_STATS).find({}).sort({ _id: -1 }).limit(1).toArray();
    for await (const chunk of db.collection(config.MONGO_COLLECTION_CHUNKS).find({}).sort({ _id: 1 }).batchSize(40)) {
      stored++;
      const k = key(chunk), count = expected.get(k) || 0;
      if (count) expected.set(k, count - 1); else unexpected.push({ path: chunk.file_path, key: k });
      if (byPath.has(chunk.file_path)) byPath.get(chunk.file_path).stored++;
      if (!Array.isArray(chunk.embedding) || chunk.embedding.length !== config.EMBED_DIMENSIONS
          || chunk.embedding.some(v => typeof v !== 'number' || !Number.isFinite(v))
          || chunk.embed_index_id !== config.EMBED_INDEX_ID || chunk.embed_provider !== config.EMBED_PROVIDER
          || chunk.embed_endpoint_id !== config.EMBED_ENDPOINT_ID || chunk.embed_model !== config.EMBED_MODEL
          || chunk.embed_dimensions !== config.EMBED_DIMENSIONS) badEmbeddings.push(chunk.file_path);
      digest.update(JSON.stringify(chunk) + '\n');
    }
    for (const before of snapshot.liveStorage.collections) {
      let documents = 0;
      const hash = crypto.createHash('sha256');
      for await (const doc of client.db(snapshot.liveStorage.database).collection(before.collection).find({}).sort({ _id: 1 }).batchSize(40)) {
        hash.update(JSON.stringify(doc) + '\n'); documents++;
      }
      liveAfter.push({ collection: before.collection, documents, sha256: hash.digest('hex') });
    }
  } finally { await client.close(); }
  const missing = [...expected].filter(([, n]) => n > 0).map(([key, count]) => ({ key, count }));
  const expectedCount = fileCoverage.reduce((n, f) => n + f.expected, 0);
  const liveUnchanged = JSON.stringify(liveAfter) === JSON.stringify(snapshot.liveStorage.collections);
  const passed = !mismatches.length && !missing.length && !unexpected.length && !badEmbeddings.length
    && liveUnchanged && stored === expectedCount && latest[0]?.chunks_embedded === expectedCount
    && latest[0]?.chunks_produced === expectedCount && latest[0]?.embed_errors === 0;
  const receipt = { at: new Date().toISOString(), snapshotPath, snapshotSha256: sha(fs.readFileSync(snapshotPath)),
    storage: snapshot.storage, embedding: snapshot.embedding, passed, expectedCount, stored,
    sourceMismatches: [...new Set(mismatches)], missing, unexpected, badEmbeddings,
    storedDocumentSha256: digest.digest('hex'), latest, liveUnchanged, liveAfter, fileCoverage,
    limits: ['Exact chunk content, source modes/hashes, embedding identity/dimensions/finite values checked; embedding semantic quality not proven.',
      'Every live collection document including vector bytes was compared. Index verification is not full-chain or bot acceptance.'] };
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, passed, expectedCount, stored, mismatches: receipt.sourceMismatches,
    missing: missing.length, unexpected: unexpected.length, badEmbeddings: badEmbeddings.length, liveUnchanged }));
  if (!passed) process.exitCode = 2;
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
