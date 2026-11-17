'use strict';
// Authorized runtime verification: two compare-and-swap saves of one advisory
// request-size field. Restores its original value. No trading module imports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const settings = JSON.parse(fs.readFileSync('config/settings.json'));
const internals = JSON.parse(fs.readFileSync('config/internals.json'));
const credentials = require('dotenv').parse(fs.readFileSync(internals.paths.envFile));
const key = 'trai.llm.maxTokens';
const ws = new WebSocket(`ws://${settings.services.dashboard.host}:${settings.services.dashboard.port}/ws`);
const waiting = new Map();
let authenticate;
const authenticated = new Promise(resolve => { authenticate = resolve; });
const receipt = { startedAt: new Date().toISOString(), key, purpose: 'Live canonical save/read/restore; advisory request size only', policyHashMethod: 'sha256 of JSON.stringify(policy), preserving parsed property order', messages: [] };
const positions = () => Object.fromEntries(JSON.parse(fs.readFileSync(internals.paths.stateFile)).activeTrades.map(([id, trade]) => [id, {
  symbol: trade.symbol, direction: trade.direction, entryPrice: trade.entryPrice, sizeUsd: trade.sizeUsd,
  frozenPolicy: crypto.createHash('sha256').update(JSON.stringify(trade.frozenExitPolicy)).digest('hex'),
  operatorStop: trade.operatorStop || null,
}]));
function request(body) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(requestId); reject(new Error('Settings receipt deadline; outcome requires readback')); }, 20000);
    waiting.set(requestId, { resolve: message => { clearTimeout(timer); resolve(message); }, reject });
    ws.send(JSON.stringify({ ...body, requestId }));
  });
}
ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: credentials.WEBSOCKET_AUTH_TOKEN })));
ws.on('message', raw => {
  const message = JSON.parse(raw);
  if (message.type === 'auth_success') {
    ws.send(JSON.stringify({ type: 'identify', source: 'dashboard' }));
    authenticate();
  }
  if (message.type === 'settings_result' && waiting.has(message.requestId)) {
    const pending = waiting.get(message.requestId); waiting.delete(message.requestId); pending.resolve(message);
  }
});
ws.on('error', error => {
  for (const pending of waiting.values()) pending.reject(error);
});
const summarize = (operation, result) => {
  receipt.messages.push({ operation, requestId: result.requestId, ownerId: result.ownerId, success: result.success,
    changed: result.changed, applied: result.applied, saved: result.saved, reason: result.reason,
    configuration: result.configuration, value: result.fields?.[key]?.value, source: result.fields?.[key]?.source, effect: result.fields?.[key]?.effect });
};
(async () => {
  await authenticated;
  const before = await request({ type: 'get_settings' });
  assert.equal(before.success, true); assert.equal(before.profile, 'paper');
  assert.equal(before.fields['trai.mode'].value, 'passive');
  const original = before.fields[key].value, changed = original + 1;
  assert.ok(changed <= before.fields[key].max);
  receipt.positionsBefore = positions(); summarize('read_before', before);
  const write = async (view, value, operation) => {
    const result = await request({ type: 'save_settings', ownerId: view.ownerId,
      expectedRevision: view.configuration.settings, expectedSettingsHash: view.configuration.settingsHash,
      changes: { [key]: value } });
    summarize(operation, result);
    assert.equal(result.success, true, result.reason); assert.equal(result.applied, true); assert.equal(result.changed, true);
    assert.equal(result.fields[key].value, value);
    assert.equal(JSON.parse(fs.readFileSync('config/settings.json')).trai.llm.maxTokens, value);
    return result;
  };
  const saved = await write(before, changed, 'save_changed');
  try {
    const readback = await request({ type: 'get_settings' });
    summarize('read_changed', readback);
    assert.equal(readback.ownerId, saved.ownerId);
    assert.equal(readback.configuration.settingsHash, saved.configuration.settingsHash);
    assert.equal(readback.fields[key].value, changed);
  } finally {
    await write(saved, original, 'restore_original');
  }
  const after = await request({ type: 'get_settings' }); summarize('read_restored', after);
  assert.equal(after.fields[key].value, original);
  receipt.positionsAfter = positions();
  assert.deepEqual(receipt.positionsAfter, receipt.positionsBefore);
  receipt.success = true; receipt.originalValue = original; receipt.temporaryValue = changed;
  receipt.restored = true; receipt.positionAndFrozenPolicyUnchanged = true;
})().catch(error => { receipt.success = false; receipt.error = error.message; process.exitCode = 1; }).finally(() => {
  receipt.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, 'live-roundtrip-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt)); ws.close();
});
