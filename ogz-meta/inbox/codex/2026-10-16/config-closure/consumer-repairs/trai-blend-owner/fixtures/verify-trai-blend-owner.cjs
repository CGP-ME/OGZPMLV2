'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('@babel/parser');
const source = process.env.SOURCE || 'source-candidate';
const root = path.join(__dirname, source);
process.env.DOTENV_CONFIG_PATH = path.join(root, 'env.js');
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader.js'));
const text = fs.readFileSync(path.join(root, 'core/TRAIDecisionModule.js'), 'utf8');
const ast = parser.parse(text, { sourceType: 'script' });
const cls = ast.program.body.find((node) => node.type === 'ClassDeclaration' && node.id.name === 'TRAIDecisionModule');
const method = cls && cls.body.body.find((node) => node.type === 'ClassMethod' && node.key.name === 'blendConfidences');
if (!method) throw new Error('actual blendConfidences method not found');
const body = text.slice(method.body.start, method.body.end);
const context = { ConfigLoader, console };
vm.runInNewContext(`this.blendConfidences = function blendConfidences(originalConfidence, traiConfidence) ${body};`, context);
const subject = { config: { confidenceWeight: 0.2, mode: 'passive' }, blendConfidences: context.blendConfidences };
function call(mode, original, trai) { subject.config.mode = mode; return subject.blendConfidences(original, trai); }
const initial = ConfigLoader.load({ role: 'bot', silent: true });
const near = (a, b) => Math.abs(a - b) <= Number.EPSILON;
function saveChanges(changes) {
  const snapshot = ConfigLoader.load({ role: 'bot', silent: true });
  return ConfigLoader.saveSettings({ requestId: 'trai-blend-owner-fixture', expectedRevision: snapshot.revisions.settings, expectedSettingsHash: snapshot.revisions.settingsHash, changes });
}
const baselineGrid = {
  passive: call('passive', 0.4, 0.05),
  advisoryBelow: call('advisory', 0.4, 0.05),
  advisoryBoundary: call('advisory', 0.4, 0.1),
  advisoryAbove: call('advisory', 0.4, 0.2),
  hybrid: call('hybrid', 0.4, 0.5),
  autonomous: call('autonomous', 0.4, 0.8),
  unknown: call('unsupported', 0.4, 0.8),
};
const expectedDefaultGrid = {
  passive: 0.4,
  advisoryBelow: 0.4 * 0.9,
  advisoryBoundary: 0.4 + 0.1 * 0.2,
  advisoryAbove: 0.4 + 0.2 * 0.2,
  hybrid: 0.4 + 0.5 * 0.2,
  autonomous: 0.8 * 0.7 + 0.4 * 0.3,
  unknown: 0.4,
};
const defaultGridEquivalent = Object.keys(expectedDefaultGrid).every((key) => near(baselineGrid[key], expectedDefaultGrid[key]));
let defaultGridPoints = 0;
let maxAutonomousDifference = 0;
for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
  const original = i / 10, trai = j / 10;
  const expected = trai * 0.7 + original * 0.3;
  const difference = Math.abs(call('autonomous', original, trai) - expected);
  if (difference > Number.EPSILON) throw new Error('default autonomous blend changed');
  maxAutonomousDifference = Math.max(maxAutonomousDifference, difference);
  defaultGridPoints++;
}
const baselineSave = saveChanges({
  'trai.advisoryUnknownPatternThreshold': 0.2,
  'trai.advisoryUnknownPatternPenaltyMultiplier': 0.8,
  'trai.autonomousTraiWeight': 1,
});
let firstGrid = null;
let firstSave = null;
let secondGrid = null;
let secondSave = null;
let zeroThreshold = null;
if (source === 'source-candidate') {
  // Test a zero penalty on a reachable nonnegative-confidence branch.
  firstSave = saveChanges({
    'trai.advisoryUnknownPatternThreshold': 0.2,
    'trai.advisoryUnknownPatternPenaltyMultiplier': 0,
    'trai.autonomousTraiWeight': 0,
  });
  firstGrid = {
    advisoryBelow: call('advisory', 0.4, 0.1),
    advisoryBoundary: call('advisory', 0.4, 0.2),
    autonomousWeightZero: call('autonomous', 0.4, 0.8),
    passive: call('passive', 0.4, 0.05),
    hybrid: call('hybrid', 0.4, 0.5),
  };
  const zeroThresholdSave = saveChanges({ 'trai.advisoryUnknownPatternThreshold': 0 });
  zeroThreshold = { success: zeroThresholdSave.success, atBoundary: call('advisory', 0.4, 0) };
  secondSave = saveChanges({
    'trai.advisoryUnknownPatternThreshold': 1,
    'trai.advisoryUnknownPatternPenaltyMultiplier': 1,
    'trai.autonomousTraiWeight': 1,
  });
  secondGrid = {
    advisoryBelow: call('advisory', 0.4, 0.5),
    advisoryBoundary: call('advisory', 0.4, 1),
    autonomousWeightOne: call('autonomous', 0.4, 0.8),
    passive: call('passive', 0.4, 0.05),
    hybrid: call('hybrid', 0.4, 0.5),
  };
}
const result = {
  source,
  initialRevision: initial.revisions.settings,
  baselineSave: { success: baselineSave.success, reason: baselineSave.reason || null },
  firstSave: firstSave && { success: firstSave.success, reason: firstSave.reason || null },
  secondSave: secondSave && { success: secondSave.success, reason: secondSave.reason || null },
  baselineGrid,
  defaultGridEquivalent,
  defaultGridPoints,
  maxAutonomousDifference,
  zeroThreshold,
  firstGrid,
  secondGrid,
};
if (!defaultGridEquivalent) throw new Error(`default equivalence failed: ${JSON.stringify(result)}`);
if (source === 'source-baseline') {
  if (baselineSave.success || !near(baselineGrid.passive, 0.4) || !near(baselineGrid.advisoryBelow, 0.36) || !near(baselineGrid.advisoryBoundary, 0.42) || !near(baselineGrid.advisoryAbove, 0.44) || !near(baselineGrid.hybrid, 0.5) || !near(baselineGrid.autonomous, 0.68) || !near(baselineGrid.unknown, 0.4)) throw new Error(`baseline proof failed: ${JSON.stringify(result)}`);
} else {
  if (!baselineSave.success || !zeroThreshold.success || !near(zeroThreshold.atBoundary, 0.4) || !firstSave?.success || !secondSave?.success || !near(firstGrid.advisoryBelow, 0) || !near(firstGrid.advisoryBoundary, 0.44) || !near(firstGrid.autonomousWeightZero, 0.4) || !near(firstGrid.passive, 0.4) || !near(firstGrid.hybrid, 0.5) || !near(secondGrid.advisoryBelow, 0.4) || !near(secondGrid.advisoryBoundary, 0.6) || !near(secondGrid.autonomousWeightOne, 0.8) || !near(secondGrid.passive, 0.4) || !near(secondGrid.hybrid, 0.5)) throw new Error(`candidate proof failed: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result));
