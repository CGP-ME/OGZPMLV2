'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
const sources = ['QUANTITY.md', 'CALLER.md', 'OBSERVATIONS.md', 'PRODUCERS.md', 'BASELINE.md', 'AST.md', 'fixtures/observe.cjs'].map(name => {
  const file = path.relative(root, path.join(packet, name));
  const text = fs.readFileSync(path.join(root, file), 'utf8').trimEnd();
  return {file, text};
});
const query = 'Mercury, break my fix. Reconcile the share-minimum absolute-dollar-cap repair on unchanged candidate tree c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c against baseline aa91945575b22b076273d2c829a35c7a6b5cc9ef. Previous run 2026-09-29T07-39-36-128Z-315ff9917b81 left conflicting seat verdicts: Mercury alleged a removed entryBudgetUsd cap and undocumented signature, Fable identified wrong-tree comparison, recheck confirmed baseline caps were empty, Kimi reported pass but named missing exact result fields and producer/fixture evidence. Those exact sources are supplied below. Re-adjudicate every surviving allegation with producer/consumer evidence, and attack new failures freely. Existing _orderQuantityFromSizeUsd verifies price before calling the share-range producer; _resolveAbsolutePositionCap is the existing cap producer. Do not add guards to cure states prevented upstream. Use serena_method_callers or serena_blast_radius in this run before structure claims; AST host receipt is also supplied. A method signature change alone is not evidence of a broken consumer: identify any such consumer or schema. All tools remain unrestricted. Use git_show on exact refs; open_file reads unrelated inherited work. No configured numbers or denominator changed; no broker-fill or slippage guarantee is claimed. Read the supplied fixture source to judge observation boundaries. Host statements are evidence to attack, not a verdict.\n\n' + sources.map(s => s.file + '\n' + s.text).join('\n\n');
fs.writeFileSync(path.join(packet, 'private/recheck-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  maxTokens: 7750, reviewersExplicit: true, reviewers: 'mercury,fable,kimi',
  evidenceSources: sources.map(s => s.file + ':1-' + s.text.split('\n').length),
  blastRadius: 'Exact staged candidate diff; unrelated dirty work is excluded from this supplied context, not from investigation tools.\n' + cp.execFileSync('git', ['diff', '--cached'], {cwd: root, encoding: 'utf8'}),
}).then(result => {
  fs.writeFileSync(path.join(packet, 'private/recheck-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({answer: result.answer, termination: result.termination, panel: result.reviewerPanel}, null, 2));
}).catch(error => {console.error(error.stack); process.exitCode = 1;});
