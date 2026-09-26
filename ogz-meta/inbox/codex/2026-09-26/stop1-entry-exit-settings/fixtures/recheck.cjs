'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../../..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const evidence = [
  'core/dto/FrozenExitPolicy.js:60-64',
  'config/settings.json:1865-1868',
  'config/settings.json:1882-1897',
  'core/OrderExecutor.js:2457-2464',
  'core/OrderExecutor.js:3936-3957',
  'core/OrderExecutor.js:4204-4225',
  'core/StateManager.js:431-445',
  'core/StateManager.js:1220-1228',
  'core/StateManager.js:1238-1247',
  'core/StateManager.js:2478-2482',
  'core/StateManager.js:4310-4318',
  'core/StateManager.js:4350-4353',
  'core/StateManager.js:4379-4384',
];
let question = 'Mercury, break the pending entry-owned managed-stop settings change: find a concrete publication, entry attachment or restoration path that loses/replaces/malforms the entry trail or break-even policy. Did this producer repair close its mechanism and what new failure does it introduce? Use AST/Serena, collect and weigh alternatives with file:line proof. Supporting excerpts below are now verbatim, unlike my preceding mistaken descriptor-only submission. Previous duplicate-require, this.trailConfig and missing-object save TypeError allegations were retracted; verify independently. Raw trail reads and freezePolicy do not validate arbitrary corrupted settings, also true of the pre-change ECM constructor. Check the actual canonical settings, allowed save types/fields and descriptor/profile routes before classifying that as an introduced defect. Current-config backfill of legacy trades is forbidden. Partial/tier and legacy 1R owners are unchanged; no new process stop. Actual host StateManager constructor/save/load on disposable state now retained four synthetic current/legacy long/short policies byte-for-byte after a settings save, with identical ECM results. Existing StateManager restores values without Object.freeze, an inherited limitation not mutation-proof restoration. This is actual local methods, not running-bot or whole-Stop-1 proof. Earlier 798 old-policy observations, 14 field effects and eight entry plans remain in the packet. Assess this exact four-file change, not a promise of universal config validation.\n';
for (const descriptor of evidence) {
  const [file, range] = descriptor.split(':'); const [start, end] = range.split('-').map(Number);
  const excerpt = fs.readFileSync(path.join(clone, file), 'utf8').split('\n').slice(start - 1, end).join('\n');
  question += descriptor + '\n' + excerpt + '\n';
}
assert.ok(question.split('\n').length <= 150);
// Exercise the real attestor before spending provider tokens.
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env'), quiet: true });
process.env.MERCURY_CONFIG_FILE = path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-ingestion-recovery/private/mercury.isolated.json');
const { resolveEvidenceSources } = require(path.join(clone, 'trai_brain/mercury-bridge/ask'));
const sources = resolveEvidenceSources({ repoRoot: clone, query: question, descriptors: evidence });
assert.equal(sources.length, evidence.length, JSON.stringify(sources.quarantines));
assert.equal(sources.quarantines.length, 0);
console.log(JSON.stringify({ attestedSources: sources.length, questionLines: question.split('\n').length }));
if (process.argv.includes('--attest-only')) process.exit(0);
const child = cp.spawn(process.execPath, [path.join(root, 'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/fixtures/review.cjs'), 'entry-exit-chain-evidence', '--agentic', '--reviewers=mercury,fable,kimi', '--max-tokens=7750', '--attack',
  ...['core/PolicyBuilder.js', 'core/ExitContractManager.js', 'core/TradingLoop.js', 'foundation/ConfigLoader.js'].map(file => '--change-path=' + file),
  ...evidence.map(source => '--evidence-source=' + source), question], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code; });
