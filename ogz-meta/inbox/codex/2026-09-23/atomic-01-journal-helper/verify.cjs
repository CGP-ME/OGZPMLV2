'use strict';
// Executes the real journal method, without constructing a bridge or starting
// the bot. Synthetic state input is explicitly NOT a deployed-runtime receipt.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const file = 'core/TradeJournalBridge.js';
const parent = git('rev-parse', 'HEAD').trim();
const before = git('show', `${parent}:${file}`);
const after = fs.readFileSync(path.join(root, file), 'utf8');
const historical = git('show', `f1df161e:${file}`);
const helper = source => source.match(/function uniqueNonEmptyStrings\(values\) \{[\s\S]*?\n\}/)?.[0];
assert.equal(helper(after), helper(historical));
assert.equal(helper(before), undefined);
assert.equal(after.replace(helper(after) + '\n\n', ''), before);
const load = source => {
  const module = new Module(path.join(root, file));
  module.filename = path.join(root, file);
  module.paths = Module._nodeModulePaths(path.join(root, 'core'));
  module._compile(source, module.filename);
  return module.exports.TradeJournalBridge;
};
const Parent = load(before);
const Candidate = load(after);
const cases = [
  { name: 'empty', trades: new Map(), ids: [], count: 0 },
  { name: 'trim-deduplicate-first-spelling', trades: new Map([
    ['first', { orderId: ' ORDER-A ' }], ['second', { orderId: 'order-a' }],
    ['third', { id: 'ORDER-B' }], ['ORDER-C', {}],
  ]), ids: ['ORDER-A', 'ORDER-B', 'ORDER-C'], count: 3 },
  { name: 'pairs', trades: [['ORDER-A', {}]], ids: ['ORDER-A'] },
  { name: 'array', trades: [{ orderId: 'ORDER-A' }, { id: 'ORDER-B' }], ids: ['ORDER-A', 'ORDER-B'], count: 2 },
  { name: 'object', trades: { 'ORDER-A': {}, 'ORDER-B': {} }, ids: ['ORDER-A', 'ORDER-B'], count: 2 },
];
const results = cases.map(item => {
  const receiver = { bot: { stateManager: { get: key => key === 'activeTrades' ? item.trades : item.count } } };
  let failure;
  try { Parent.prototype._stateOpenTradeProof.call(receiver); } catch (error) { failure = { name: error.name, message: error.message }; }
  assert.deepEqual(failure, { name: 'ReferenceError', message: 'uniqueNonEmptyStrings is not defined' });
  const observed = Candidate.prototype._stateOpenTradeProof.call(receiver);
  const expected = { stateOpenOrderIds: item.ids, stateActiveTradeCount: item.ids.length, statePositionCount: item.count ?? item.ids.length };
  assert.deepEqual(observed, expected);
  return { name: item.name, input: { activeTrades: item.trades instanceof Map ? [...item.trades] : item.trades, positionCount: item.count ?? null }, failure, expected, observed };
});
const receipt = { boundary: 'Real production method / synthetic state; no bridge constructor, broker request, journal write, or bot activation. Dependencies imported from the existing workspace; method uses its own unchanged normalization helpers only.',
  parent, source: file, beforeSha256: sha(before), afterSha256: sha(after),
  historicalHelperByteEqual: true, productionDeltaOnlyRestoredHelper: true, results };
fs.writeFileSync(path.join(__dirname, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
// Preserve the full pre-cut tracked diff locally, never stage this mixed patch.
const preservation = path.join(root, 'ogz-meta/inbox/codex/2026-09-23/stop1-configuration-completion/atomic-cut-preservation');
fs.mkdirSync(preservation);
const patch = git('diff', '--binary', 'HEAD', '--');
const files = git('diff', '--name-only', '-z', 'HEAD', '--').split('\0').filter(Boolean);
fs.writeFileSync(path.join(preservation, 'tracked-work.patch'), patch, { flag: 'wx', mode: 0o600 });
fs.writeFileSync(path.join(preservation, 'manifest.json'), JSON.stringify({ parent, patchSha256: sha(patch),
  files: Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(path.join(root, file)))])),
  untracked: 'Existing untracked evidence and operator files remain in place; not read, moved, deleted or staged by this capture.' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ parent, afterSha256: receipt.afterSha256, historicalHelperByteEqual: true,
  beforeFailures: results.length, exactAfterMatches: results.length, preservedTrackedFiles: files.length }));
