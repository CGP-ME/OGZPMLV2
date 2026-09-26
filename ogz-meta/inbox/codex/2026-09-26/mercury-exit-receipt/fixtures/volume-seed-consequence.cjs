'use strict';
// Directly observes the existing VolumeProfile constructor, not a bot boot.
const fs = require('node:fs');
const path = require('node:path');
const packet = path.resolve(__dirname, '..');
const clone = path.join(packet, 'private/cold-pull-5gJPFK');
const VolumeProfile = require(path.join(clone, 'core/VolumeProfile'));
const settings = JSON.parse(fs.readFileSync(path.join(clone, 'config/settings.json'), 'utf8'));
const correct = new VolumeProfile(settings.strategies.VolumeProfile);
const seeded = new VolumeProfile(settings.strategies.MADynamicSR);
const fields = Object.keys(settings.strategies.VolumeProfile);
const observed = instance => Object.fromEntries(fields.map(field => [field, {
  defined: instance[field] !== undefined, value: instance[field] === undefined ? null : instance[field],
}]));
const receipt = {
  source: 'a51b33e4 plus the recorded one-line seed in the disposable clone only',
  operation: 'Actual VolumeProfile constructor called with the two configured objects',
  expected: 'VolumeProfile receives its own seven configured values; the seeded wrong owner supplies none of them',
  observed: { correct: observed(correct), seeded: observed(seeded) },
  limits: 'No SymbolTradingContext or bot boot, candle stream, broker action, trade or performance observation',
};
fs.writeFileSync(path.join(packet, 'private/seed-consequence.json'), JSON.stringify(receipt, null, 2) + '\n', {
  flag: 'wx', mode: 0o600,
});
console.log(JSON.stringify(receipt, null, 2));
