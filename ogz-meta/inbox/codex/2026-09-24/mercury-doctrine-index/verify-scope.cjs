'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
const { walkRepo, processFile, OGZ_META_INDEX_TARGETS } = require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  const file = 'ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md';
  const selected = walkRepo(root).map(p => path.relative(root, p)).sort();
  const chunks = await processFile(path.join(root, file), root);
  const receipt = { observedAt: new Date().toISOString(), targets: OGZ_META_INDEX_TARGETS,
    selectedCount: selected.length, selectedPaths: selected,
    doctrineSelected: selected.includes(file), doctrineSha256: sha(fs.readFileSync(path.join(root, file))),
    doctrineChunks: chunks.map(c => ({ start: c.start_line, end: c.end_line, textSha256: sha(c.text) })),
    excludedClassViolations: selected.filter(p => /(^|\/)(inbox|ledger|cognition-history|archive|tests|fixtures)(\/|$)/.test(p)),
    ignoreSha256: sha(fs.readFileSync(path.join(root, 'mercury.ignore'))),
    limitations: ['Selection and chunking only; no embedding or database operation.',
      'Older specs remain discoverable leads, not authority over current operator instructions.',
      'The operator-designated walk documents remain excluded with inbox; this change does not open that directory.'] };
  receipt.passed = receipt.doctrineSelected && chunks.length > 0 && !receipt.excludedClassViolations.length;
  fs.writeFileSync(path.join(__dirname, 'scope-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ selected: selected.length, doctrineChunks: chunks.length,
    excludedClassViolations: receipt.excludedClassViolations, passed: receipt.passed }));
  if (!receipt.passed) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
