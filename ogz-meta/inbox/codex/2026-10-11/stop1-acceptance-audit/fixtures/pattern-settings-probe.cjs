'use strict';
// Isolated actual-class probe. No runner/ConfigLoader, network, state or broker imports.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = process.cwd();
const modulePath = path.join(root, 'core/PatternBasedExitModel.js');
const Model = require(modulePath);
const owned = JSON.parse(fs.readFileSync('config/settings.json','utf8')).featureCatalog.PATTERN_EXIT_MODEL.settings;
const model = new Model(structuredClone(owned));
const fixture = [{ type: 'bearish_engulfing', confidence: 0.9 }];
model.config.reversalPatterns = [];
const emptyList = model.checkReversalPatterns(fixture, 'buy');
model.config.reversalPatterns = ['unrelated_fixture_pattern'];
const unrelatedList = model.checkReversalPatterns(fixture, 'buy');
assert.deepEqual(emptyList, unrelatedList);
assert.equal(emptyList.detected, true);
model.config.minReversalConfidence = 1;
const realThreshold = model.checkReversalPatterns(fixture, 'buy');
assert.equal(realThreshold.detected, false);
const result = {
  sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),
  fixtureType: 'controlled pattern fixture; not market performance evidence',
  emptyConfiguredReversalList: emptyList,
  unrelatedConfiguredReversalList: unrelatedList,
  raisedActualConfidenceThreshold: realThreshold,
  conclusion: 'Configured reversalPatterns is ignored by the actual method; minReversalConfidence does affect that method. This does not establish a production evaluateExit caller.'
};
fs.writeFileSync(path.resolve(__dirname,'..','pattern-settings-probe.json'),JSON.stringify(result,null,2)+'\n');
console.log(result.conclusion);
