'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
const query = 'Mercury, break my fix. This candidate also corrects the first-review evidence-descriptor live-root read and a locally reproduced symlink-as-deletion classification. Prior first-review claims about a malformed backslash regex and reachable run_check were disputed by Fable; verify their actual bytes and registration before carrying them forward. Those earlier seat claims are not accepted evidence.  Attack the Mercury source-identity repair in the selected candidate tree against its explicit baseline. Determine whether initial evidence, repository reads/search, AST blast radius and adversarial rechecks can still mix a dirty working tree with the selected Git tree or misidentify the source. Did this close the underlying mechanism, or only its symptom, and what new failure modes did it introduce? Require exact file:line producer/consumer evidence for findings. Existing ordinary and worktree review modes must remain supported; no default iteration ceiling is authorized. This is a tooling repair, not a trading-policy change.';
fs.writeFileSync(path.join(packet, 'private/final-review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewRef: process.env.MERCURY_HARNESS_TREE,
  reviewBase: 'e6d80e0a12ad8051cf81a09e7c104985d64502e0',
  maxTokens: 7750, reviewersExplicit: true, reviewers: 'mercury,fable,kimi',
}).then(result => {
  fs.writeFileSync(path.join(packet, 'private/final-review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({answer: result.answer, termination: result.termination,
    consensusOk: result.consensus?.ok, run: result.runLedgerEntry?.run_id,
    verdict: result.runLedgerEntry?.verdict,
    recheck: result.adversarialReview?.recheck?.answer,
    seats: result.reviewerPanel?.seats?.map(s => ({role:s.role, verdict:s.verdict, answer:s.answer}))}, null, 2));
}).catch(error => {console.error(error.stack); process.exitCode = 1;});
