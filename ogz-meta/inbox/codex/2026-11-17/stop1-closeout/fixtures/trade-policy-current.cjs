'use strict';
require(process.cwd() + '/test/helpers/require-isolation.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const vm = require('node:vm'), crypto = require('node:crypto');
process.env.PROFILE = 'paper';
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) process.env[key] = 'synthetic-stop1-fixture';
const loader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
loader.load({ role: 'bot', loadDotenv: false, silent: true });
const { getInstance, StateManager } = require(path.join(process.cwd(), 'core/StateManager'));
const { ExitContractManager } = require(path.join(process.cwd(), 'core/ExitContractManager'));
const Policy = require(path.join(process.cwd(), 'core/PolicyBuilder'));
const Stop = require(path.join(process.cwd(), 'core/exit/StopLossChecker'));
const WebSocketManager = require(path.join(process.cwd(), 'core/WebSocketManager'));
const sm = getInstance(), contracts = new ExitContractManager(), checker = new Stop();
const strategy = 'EMASMACrossover', setting = `exitContracts.${strategy}.stopLossPercent`;
const original = loader.get(setting);
const captured = {};
const sent = [];
let relayReceipt;
const ws = Object.create(WebSocketManager.prototype);
ws.ctx = { dashboardWs: { readyState: 1, send(raw) {
  const message = JSON.parse(raw);
  if (message.applied) {
    const persisted = new Map(JSON.parse(fs.readFileSync(loader.get('paths.stateFile'))).activeTrades);
    assert.equal(persisted.get(message.tradeId).operatorStop.price, message.operatorStop.price);
  }
  sent.push(message);
  if (relayReceipt) relayReceipt(message);
} } };
// Execute the shipped UI submit/receipt functions and relay routing branches.
// DOM rendering and physical sockets are the only transport seams.
function extract(file, pick) {
  const source = fs.readFileSync(file, 'utf8');
  const tree = require('@babel/parser').parse(source, { sourceType: 'unambiguous' });
  const pieces = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (pick(node, source)) pieces.push(source.slice(node.start, node.end));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(tree);
  return pieces;
}
const uiFile = 'public/js/panels/open-positions.js';
const uiFunctions = extract(uiFile, node => node.type === 'FunctionDeclaration' && ['stopEditKey', 'submitStopEdit'].includes(node.id?.name));
const registration = extract(uiFile, node => node.type === 'CallExpression' && node.callee?.property?.name === 'registerHandler' && node.arguments[0]?.value === 'trade_stop_result');
const routing = extract('ogzprime-ssl-server.js', (node, source) => node.type === 'IfStatement' && ["data.type === 'trade_stop_result'", "data.type === 'update_trade_stop'"].some(text => source.slice(node.test.start, node.test.end).includes(text)));
assert.equal(uiFunctions.length, 2); assert.equal(registration.length, 1); assert.equal(routing.length, 2);
const uiState = { pendingStopRequests: new Map(), stopStatuses: new Map(), stopDrafts: new Map(), positions: new Map() };
const requests = [], operations = [];
let handleUiReceipt, route;
const dashboard = { readyState: 1, authenticated: true, clientType: 'dashboard', send: raw => handleUiReceipt(JSON.parse(raw)) };
const botSocket = { readyState: 1, authenticated: true, botAuthenticated: true, clientType: 'bot', connectionId: 'fixture-owner', send: raw => operations.push(ws.handleTradeStopEdit(JSON.parse(raw))) };
const otherOwner = { ...botSocket, connectionId: 'other-owner', send() { assert.fail('Routed stop edit to another owner'); } };
route = vm.runInNewContext(`(function(ws, data) { ${routing.join('\n')} })`, { wss: { clients: new Set([dashboard, botSocket, otherOwner]) }, WebSocket: { OPEN: 1 }, pendingTradeStopRequests: new Map() });
const uiSocket = { send(message) { requests.push(message); route(dashboard, message); return true; }, registerHandler(type, handler) { assert.equal(type, 'trade_stop_result'); handleUiReceipt = handler; } };
const uiContext = vm.createContext({ state: uiState, OGZ: { get: name => name === 'Socket' ? uiSocket : undefined }, socket: uiSocket, window: { crypto }, renderRows() {}, Number, Map, JSON });
vm.runInContext(uiFunctions.join('\n') + '\n' + registration[0], uiContext);
relayReceipt = message => route(botSocket, message);
(async () => {
  for (const [direction, symbol, action] of [['long', 'TSLA', 'BUY'], ['short', 'NVDA', 'SELL_SHORT']]) {
    const contract = contracts.createExitContract(strategy, { invalidationConditions: [] }, { timeframe: '15m', volatility: .01 });
    const policy = Policy.buildForTrade({ strategyName: strategy, exitContract: contract, nowMs: Date.now(), volatility: .01, confidence: .75, marketCondition: 'normal', configuration: loader.getReceipt() });
    const result = await sm.openPosition(200, 100, { orderId: `fixture-${direction}`, action, direction, symbol, entryStrategy: strategy,
      brokerId: 'alpaca', accountId: 'synthetic-paper-account', assetClass: 'stocks', executionMode: 'paper', timeframe: '15m',
      entryOrderQuantity: 2, entryOrderQuantityUnit: 'shares', remainingOrderQuantity: 2, remainingOrderQuantityUnit: 'shares',
      exitContract: contract, frozenExitPolicy: policy });
    assert.equal(result.success, true, JSON.stringify(result));
    captured[direction] = JSON.stringify(sm.getActiveTrade(`fixture-${direction}`).frozenExitPolicy);
    const trade = sm.getActiveTrade(`fixture-${direction}`);
    uiState.positions.set(direction, { tradeId: `fixture-${direction}`, scopeKey: trade.scopeKey, tradeRevision: trade.tradeRevision, ownerId: botSocket.connectionId });
  }
  const { revisions } = loader.getCachedSnapshot();
  const saved = loader.saveSettings({ requestId: 'trade-policy-save', expectedRevision: revisions.settings, expectedSettingsHash: revisions.settingsHash, changes: { [setting]: original * 1.1 } });
  assert.equal(saved.success, true, saved.reason);
  const nextContract = contracts.createExitContract(strategy, { invalidationConditions: [] }, { timeframe: '15m', volatility: .01 });
  assert.equal(nextContract.stopLossPercent, original * 1.1);
  const settingsBytes = fs.readFileSync('config/settings.json', 'utf8');
  for (const direction of ['long', 'short']) {
    const id = `fixture-${direction}`, trade = sm.getActiveTrade(id);
    const otherId = `fixture-${direction === 'long' ? 'short' : 'long'}`;
    const other = JSON.stringify(sm.getActiveTrade(otherId));
    const stopPrice = direction === 'long' ? 99.8 : 100.2;
    assert.equal(JSON.stringify(trade.frozenExitPolicy), captured[direction]);
    const request = { requestId: `stop-${direction}`, tradeId: id, scopeKey: trade.scopeKey, expectedTradeRevision: trade.tradeRevision, stopPrice };
    assert.equal((await ws.handleTradeStopEdit({ ...request, scopeKey: 'wrong' })).reason, 'trade_scope_mismatch');
    assert.equal((await ws.handleTradeStopEdit({ ...request, expectedTradeRevision: trade.tradeRevision + 5 })).reason, 'trade_revision_changed');
    vm.runInContext('submitStopEdit', uiContext)(uiState.positions.get(direction), { value: String(stopPrice) }, {});
    const receipt = await operations.at(-1);
    const submitted = requests.at(-1);
    assert.equal(submitted.type, 'update_trade_stop');
    assert.equal(submitted.ownerId, botSocket.connectionId);
    assert.equal(submitted.tradeId, id);
    assert.equal(receipt.applied, true, JSON.stringify(receipt));
    assert.equal(receipt.persistence, 'state_file');
    assert.equal(JSON.stringify(sm.getActiveTrade(otherId)), other);
    assert.equal(JSON.stringify(sm.getActiveTrade(id).frozenExitPolicy), captured[direction]);
    const stateBytes = fs.readFileSync(loader.get('paths.stateFile'), 'utf8');
    assert.equal(uiState.positions.get(direction).operatorStop.price, stopPrice);
    assert.equal(uiState.positions.get(direction).tradeRevision, receipt.tradeRevision);
    assert.equal(uiState.pendingStopRequests.size, 0);
    assert.equal((await ws.handleTradeStopEdit(submitted)).duplicate, true);
    assert.equal(fs.readFileSync(loader.get('paths.stateFile'), 'utf8'), stateBytes);
    assert.equal(checker.check(sm.getActiveTrade(id), stopPrice, -.2, {}).shouldExit, true);
    assert.equal(checker.check(sm.getActiveTrade(id), 100, 0, {}).shouldExit, false);
  }
  assert.equal(fs.readFileSync('config/settings.json', 'utf8'), settingsBytes);
  const restored = new StateManager();
  for (const direction of ['long', 'short']) {
    const trade = restored.getActiveTrade(`fixture-${direction}`);
    assert.ok(trade);
    assert.equal(JSON.stringify(trade.frozenExitPolicy), captured[direction]);
    assert.equal(checker.check(trade, direction === 'long' ? 99.8 : 100.2, -.2, {}).shouldExit, true);
  }
  console.log('STOP1_TRADE_POLICY_RECEIPT', JSON.stringify({ configuration: saved.configuration, directions: ['long', 'short'], actualStateManagerOpenSaveAndRestore: true, globalSaveOnlyChangesNewPolicy: true, originalPoliciesPreserved: true, operatorStopPersistsBeforeAcknowledgment: true, otherTradeUnchanged: true, globalFileUnchangedByStopEdits: true, duplicateDoesNotRewrite: true, scopeAndRevisionRefused: true, restoredExitConsumerUsesOperatorStop: true, shippedUiSubmitAndReceiptExecuted: true, shippedRelayRoutesToSelectedOwner: true, receipts: sent.length, transport: 'actual UI functions and relay routing extracted by AST, actual WebSocketManager and full state/exit modules; DOM rendering and socket seams; synthetic paper trades in disposable state', runtimeActivated: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
