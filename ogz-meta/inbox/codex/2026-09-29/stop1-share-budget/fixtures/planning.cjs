'use strict';
const fs = require('node:fs');
const path = require('node:path');
const packet = path.resolve(__dirname, '..');
const root = path.resolve(__dirname, '../../../../../..');
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
const query = 'Plan the authorized Stop 1 share-minimum dollar-cap repair, with no edits. Baseline astra-era aa91945575b22b076273d2c829a35c7a6b5cc9ef; use git_show for baseline, since working bytes contain inherited stricter sizing-budget edits. Use Serena AST to enumerate producer callers and downstream consumers. Attack passing the existing absoluteCapSizeUsd from _buildEntryPlan into _applyStockShareRange and incorporating its whole-share capacity in the existing caps before minimum-share feasibility. Preserve configured values and denominator; preserve minimum-share increases within the absolute ceiling. Existing impossible-range outcome handles unsatisfiable floor/ceiling, without a new gate, throw or fallback. Determine affected paths, precision issues and semantic conflicts. Compare the stricter inherited entryBudgetUsd=sizeUsd approach explicitly. This is planning/blast-radius, not final review approval. Cite actual evidence and distinguish baseline from dirty source.';
fs.writeFileSync(path.join(packet, 'private/planning-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewIntent: 'planning', reviewersExplicit: true, reviewers: 'mercury', maxTokens: 7750,
  blastRadius: 'Scoped pre-change investigation: stock minimum-share dollar-cap correction on baseline aa91945575b22b076273d2c829a35c7a6b5cc9ef. No candidate diff exists. Unrelated dirty files are not the proposed migration. All investigation tools remain unrestricted; obtain AST blast radius for this proposed change.',
}).then(result => {
  fs.writeFileSync(path.join(packet, 'private/planning-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
