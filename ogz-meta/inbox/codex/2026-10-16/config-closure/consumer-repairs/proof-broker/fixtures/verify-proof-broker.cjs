'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('@babel/parser');
const source = process.env.SOURCE || 'source-candidate';
const file = path.join(__dirname, source, 'claudito-logger.js');
const text = fs.readFileSync(file, 'utf8');
const ast = parser.parse(text, { sourceType: 'script' });
const names = [
  '_readRequiredString', '_readPositiveNumber', '_readPositiveInteger',
  '_readRequiredIsoTimestamp', '_readFirstPositiveNumber',
  '_resolveTrackRecordMaxDrawdown', '_parseStartingBalanceFromAccountLabel',
  '_trackRecordAccountInput', '_resolveTrackRecordAccountConfig',
];
const nodes = new Map();
for (const node of ast.program.body) if (node.type === 'FunctionDeclaration') nodes.set(node.id.name, node);
const missing = names.filter(name => !nodes.has(name));
if (missing.length) throw new Error(`AST functions missing: ${missing.join(',')}`);
const configured = {
  startingBalance: 5000,
  proofPublication: { account: {
    id: 'historical-account', label: 'TTP MAX 5K', stage: 'historical', status: 'closed',
    broker: 'historical-broker', profitTarget: 300, maxDrawdown: 150,
    minTradesRequired: 10, trackRecordStartAt: '2025-01-01T00:00:00.000Z',
  }},
  broker: { id: 'current-broker' },
};
const ConfigLoader = { get(key) {
  if (key === 'proofPublication.account') return configured.proofPublication.account;
  if (key === 'startingBalance') return configured.startingBalance;
  if (key === 'broker.id') return configured.broker.id;
  throw new Error(`unexpected config path ${key}`);
}};
const context = { ConfigLoader, console, Date, Number, String, Math, Error, TypeError, Object };
const definitions = names.map(name => text.slice(nodes.get(name).start, nodes.get(name).end)).join('\n');
vm.runInNewContext(`${definitions}\nthis.probe = { _trackRecordAccountInput, _resolveTrackRecordAccountConfig };`, context, { filename: file });
const input = context.probe._trackRecordAccountInput();
const resolved = context.probe._resolveTrackRecordAccountConfig({
  ...input,
  OGZ_MAX_DRAWDOWN: '150', OGZ_PROFIT_TARGET: '300', OGZ_MIN_TRADES_REQUIRED: '10',
  OGZ_TRACK_RECORD_START_AT: '2025-01-01T00:00:00.000Z',
});
if (source === 'source-candidate') {
  if (input.BROKER !== 'historical-broker' || resolved.broker !== 'historical-broker') throw new Error('candidate did not preserve configured historical broker');
} else if (input.BROKER !== 'current-broker' || resolved.broker !== 'current-broker') {
  throw new Error('baseline unexpectedly changed');
}
console.log(JSON.stringify({ source, inputBroker: input.BROKER, resolvedBroker: resolved.broker, currentBroker: configured.broker.id }));

if (source === 'source-candidate') {
  delete configured.broker;
  const withoutCurrent = context.probe._trackRecordAccountInput();
  if (withoutCurrent.BROKER !== 'historical-broker') throw new Error('historical metadata depends on current broker');
  configured.proofPublication.account.broker = '';
  const blank = context.probe._trackRecordAccountInput();
  let rejected = false;
  try { context.probe._resolveTrackRecordAccountConfig(blank); } catch (e) { rejected = /BROKER/.test(e.message); }
  if (!rejected) throw new Error('empty publication broker was accepted');
  console.log(JSON.stringify({historicalMetadataIndependent:true,emptyBrokerExistingValidation:true}));
}
