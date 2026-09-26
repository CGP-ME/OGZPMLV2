'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../../..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const evidence = ['core/StateManager.js:431-445', 'core/StateManager.js:4379-4384',
  'ogz-meta/inbox/codex/2026-09-26/stop1-entry-exit-settings/private/state-retention-redacted.json:1-1'];
let question = 'Mercury, attack the remaining restoration-loss allegation in the managed-stop review. This focused follow-up examines the UNCHANGED StateManager consumer, not a new StateManager patch or a substitute for the previous four-file review. The alleged break is that withExitLifecycleFields drops frozenExitPolicy on load. Enumerate every operation affecting that field along this exact path and evaluate JavaScript object-spread semantics at line 438 explicitly: an enumerable own property from JSON.parse is carried by ...trade unless subsequently overwritten or deleted. Find such an operation, or retract the loss allegation. Do not mistake lack of an explicit frozenExitPolicy key for absence after a spread. The attached actual execution receipt identifies source hashes, input receipt, four current/legacy long/short records, actual settings-save response, and identical ECM results after the real StateManager constructor/save/load on disposable state. Inspect rows[].trailPresent and before/after; legacy false means the trail object was already missing before save, not that the entire policy vanished. Restoration not re-freezing objects is a DIFFERENT inherited limitation and is explicitly recorded; it is not property loss. No bot boot/broker activity or whole-Stop-1 proof is claimed. Fable passed the four-file change; other initial findings were retracted or mechanically disproved. One question: is this cited restoration-loss allegation real? Explain any concrete newly introduced mechanism or falsify it using source and the receipt.\n';
for (const descriptor of evidence) {
  const [file, range] = descriptor.split(':'); const [start, end] = range.split('-').map(Number);
  question += descriptor + '\n' + fs.readFileSync(path.join(clone, file), 'utf8').split('\n').slice(start - 1, end).join('\n') + '\n';
}
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env'), quiet: true });
process.env.MERCURY_CONFIG_FILE = path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-ingestion-recovery/private/mercury.isolated.json');
const { resolveEvidenceSources } = require(path.join(clone, 'trai_brain/mercury-bridge/ask'));
const sources = resolveEvidenceSources({ repoRoot: clone, query: question, descriptors: evidence });
assert.equal(sources.length, evidence.length, JSON.stringify(sources.quarantines)); assert.equal(sources.quarantines.length, 0);
console.log(JSON.stringify({ attestedSources: sources.length, promptLines: question.split('\n').length, sourceMutation: false }));
if (process.argv.includes('--attest-only')) process.exit(0);
const child = cp.spawn(process.execPath, [path.join(root, 'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/fixtures/review.cjs'), 'entry-exit-retention-resolution', '--agentic', '--reviewers=mercury,fable,kimi', '--max-tokens=7750', '--attack', '--change-path=core/StateManager.js', ...evidence.map(source => '--evidence-source=' + source), question], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code; });
