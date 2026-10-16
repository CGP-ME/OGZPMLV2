'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

const sourcePath = __dirname + '/public__js__panels__configuration-settings.js.cjs';
const source = fs.readFileSync(sourcePath, 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
const wanted = new Set(['sameIdentity', 'sameValue', 'validView', 'changed', 'acceptView', 'finishPending', 'receive']);
const functions = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && wanted.has(node.id.name)) functions.push(source.slice(node.start, node.end));
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object' && value.type) walk(value);
  }
}
walk(ast);
assert.equal(functions.length, wanted.size, 'all actual receipt functions must be AST extracted');

function runCase(receipt, draft = { 'confidence.minTradeConfidence': '0.52' }, writeDraft = { 'confidence.minTradeConfidence': '0.52' }) {
  const code = `
    let owners = new Map(), outstanding = new Map(), pending = null, readId = null, readTimer = null;
    let messages = [];
    function message(text) { messages.push(text); }
    function render() {}
    ${functions.join('\n')}
    globalThis.probe = { owners, outstanding, messages, receive, getPending: () => pending, setPending: value => { pending = value; } };
  `;
  const context = { console, setTimeout, clearTimeout };
  vm.runInNewContext(code, context, { filename: sourcePath });
  const ownerId = 'bot-a';
  const configuration = { settings: 7, settingsHash: 'hash-7', fingerprint: 'fp-7' };
  const view = { ownerId, configuration, fields: { 'confidence.minTradeConfidence': { value: 0.51, type: 'number' } } };
  const owner = { draft: { ...draft }, base: configuration, view, available: true, needsReview: false };
  context.probe.owners.set(ownerId, owner);
  const write = { id: 'req-1', ownerId, revision: 7, configuration: { ...configuration }, changes: { 'confidence.minTradeConfidence': 0.52 }, draft: { ...writeDraft } };
  context.probe.outstanding.set(write.id, write);
  context.probe.setPending(write);
  context.probe.receive({ requestId: write.id, ...receipt });
  return { owner, pending: context.probe.getPending(), messages: context.probe.messages };
}

const common = { ownerId: 'bot-a', success: true, saved: true, applied: true,
  configuration: { settings: 7, settingsHash: 'hash-7', fingerprint: 'fp-7' },
  fields: { 'confidence.minTradeConfidence': { value: 0.52, type: 'number' } } };

const unchanged = runCase({ ...common, changed: false });
assert.deepEqual(unchanged.owner.draft, {});
assert.equal(unchanged.owner.needsReview, false);
assert.equal(unchanged.pending, null);

const wrongHash = runCase({ ...common, changed: false, configuration: { ...common.configuration, settingsHash: 'wrong' } });
assert.equal(wrongHash.owner.draft['confidence.minTradeConfidence'], '0.52');
assert.equal(wrongHash.owner.needsReview, true);

const missingChanged = runCase({ ...common });
assert.equal(missingChanged.owner.draft['confidence.minTradeConfidence'], '0.52');
assert.equal(missingChanged.owner.needsReview, true);

const newer = runCase({ ...common, changed: true, configuration: { settings: 8, settingsHash: 'hash-8', fingerprint: 'fp-8' } }, { 'confidence.minTradeConfidence': '0.53' }, { 'confidence.minTradeConfidence': '0.52' });
assert.equal(newer.owner.draft['confidence.minTradeConfidence'], '0.53');
assert.equal(newer.owner.view.configuration.settings, 8);
assert.equal(newer.owner.needsReview, true);

const wrongOwner = runCase({ ...common, ownerId: 'bot-b', changed: false });
assert.equal(wrongOwner.owner.draft['confidence.minTradeConfidence'], '0.52');
assert.ok(wrongOwner.pending);

console.log(JSON.stringify({ pass: true, source: 'AST-extracted actual receive/acceptView/identity functions', cases: [
  'same revision changed:false exact identity clears matching draft',
  'wrong hash rejects and retains draft',
  'missing changed:false rejects and retains draft',
  'newer revision accepts while preserving newer draft',
  'wrong owner ignored and pending write retained',
], limits: ['No DOM, socket, credentials, network, PM2, or production mutation'] }));
