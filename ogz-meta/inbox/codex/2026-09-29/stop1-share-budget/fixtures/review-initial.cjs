'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
const sources = ['QUANTITY.md', 'CALLER.md', 'OBSERVATIONS.md'].map(name => {
  const file = path.relative(root, path.join(packet, name));
  const text = fs.readFileSync(path.join(root, file), 'utf8').trimEnd();
  return {file, text};
});
const query = 'Mercury, break my fix. The authorized target is the share-minimum absolute-dollar-cap correction, candidate tree c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c against aa91945575b22b076273d2c829a35c7a6b5cc9ef. Use git_show for exact candidate source, not unrelated inherited working-tree sizing changes. All tools remain unrestricted. Attack the root mechanism, Fourth Shape compliance, numeric boundaries, every actual caller and downstream consequences; obtain AST evidence. Distinguish planned notional at the supplied price from broker fills and slippage, which this repair does not claim to cap. No new gate, throw, fallback, settings or tuning is intended. Host-attested source and synthetic behavior receipts follow; do not treat a host assertion as reviewer approval.\n\n' + sources.map(s => s.file + '\n' + s.text).join('\n\n');
fs.writeFileSync(path.join(packet, 'private/review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  maxTokens: 7750, reviewersExplicit: true, reviewers: 'mercury,fable,kimi',
  evidenceSources: sources.map(s => s.file + ':1-' + s.text.split('\n').length),
  blastRadius: 'Exact staged candidate diff; unrelated dirty work is excluded from this supplied context, not from investigation tools.\n' + cp.execFileSync('git', ['diff', '--cached'], {cwd: root, encoding: 'utf8'}),
}).then(result => {
  fs.writeFileSync(path.join(packet, 'private/review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({answer: result.answer, termination: result.termination, panel: result.reviewerPanel}, null, 2));
}).catch(error => {console.error(error.stack); process.exitCode = 1;});
