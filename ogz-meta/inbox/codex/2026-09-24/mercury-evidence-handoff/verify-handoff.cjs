'use strict';

// Actual scanner -> recovered writer -> actual file tool -> context serializer.
// No provider request, DB connection, application boot or authority override.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
const bridge = path.join(root, 'trai_brain/mercury-bridge');
const { buildCurrentChangeBlastRadius } = require(path.join(bridge, 'ask'));
const { writeCurrentChangeEvidenceBundle, buildRunLedgerEntry } = require(path.join(bridge, 'run-ledger'));
const { createToolAdapter } = require(path.join(bridge, 'tool-adapter'));
const { stringifyToolResultForHistory } = require(path.join(bridge, 'react-loop'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const now = new Date();
  const adapter = createToolAdapter({ repoRoot: root });
  const scan = await buildCurrentChangeBlastRadius({
    findReferencesFn: symbol => adapter.execute('find_references', { symbol }),
  });
  const fixtureRoot = fs.mkdtempSync(path.join(__dirname, 'receipt-files-'));
  const bundle = writeCurrentChangeEvidenceBundle({
    repoRoot: fixtureRoot, runId: `local-handoff-${now.getTime()}`,
    sections: scan.expandedSections, now,
  });
  scan.evidenceBundle = bundle;
  const artifact = fs.readFileSync(path.join(fixtureRoot, bundle.path));
  const manifestBytes = fs.readFileSync(path.join(fixtureRoot, bundle.manifest_path));
  const manifest = JSON.parse(manifestBytes);
  const lines = artifact.toString('utf8').split('\n');
  const evidenceAdapter = createToolAdapter({ repoRoot: fixtureRoot });
  const sectionReceipts = [];
  for (const section of manifest.sections) {
    let nextLine = section.line_start;
    const consumed = [];
    const calls = [];
    while (nextLine <= section.line_end) {
      let endLine = Math.min(nextLine + 49, section.line_end);
      let parsed;
      let serialized;
      // Narrow a local diagnostic read if the existing serializer compacted it.
      // This does not change Mercury's production loop or claim model consumption.
      for (;;) {
        const result = await evidenceAdapter.execute('open_file', {
          path: bundle.path, start_line: nextLine, end_line: endLine,
        });
        if (result.error) throw new Error(result.error);
        serialized = stringifyToolResultForHistory(result);
        parsed = JSON.parse(serialized);
        if (!parsed._mercury_context_compacted) break;
        if (endLine === nextLine) throw new Error(`Single line cannot fit context: ${nextLine}`);
        endLine = nextLine + Math.floor((endLine - nextLine) / 2);
      }
      consumed.push(...parsed.text.split('\n').map(line => line.replace(/^\s*\d+\t/, '')));
      calls.push({ start: nextLine, end: endLine, serializedChars: serialized.length, sha256: sha(serialized) });
      nextLine = endLine + 1;
    }
    const stored = lines.slice(section.line_start - 1, section.line_end).join('\n');
    const received = consumed.join('\n');
    sectionReceipts.push({ ...section, calls,
      storedHashMatches: sha(stored) === section.sha256,
      deliveredHashMatches: sha(received) === section.sha256,
      producerHashMatches: sha(scan.expandedSections[section.id - 1].content) === section.sha256,
    });
  }
  const ledger = buildRunLedgerEntry({
    repoRoot: root, query: 'Local evidence-handoff diagnostic; not a provider review',
    autoBlastRadius: scan, startedAt: now, finishedAt: now,
  });
  let collisionCode = null;
  try {
    writeCurrentChangeEvidenceBundle({ repoRoot: fixtureRoot,
      runId: `local-handoff-${now.getTime()}`, sections: scan.expandedSections, now });
  } catch (error) { collisionCode = error.code; }
  const receipt = {
    observedAt: now.toISOString(), root, fixtureRoot, bundle,
    sourceHashes: ['ask.js', 'run-ledger.js', 'tool-adapter.js', 'react-loop.js']
      .map(file => ({ path: `trai_brain/mercury-bridge/${file}`, sha256: sha(fs.readFileSync(path.join(bridge, file))) })),
    changedFiles: scan.changedFiles, scannedFiles: scan.meta, referenceScans: scan.referenceScans, errors: scan.errors,
    artifactHashMatches: sha(artifact) === bundle.sha256,
    manifestHashMatches: sha(manifestBytes) === bundle.manifest_sha256,
    artifactMode: (fs.statSync(path.join(fixtureRoot, bundle.path)).mode & 0o777).toString(8),
    manifestMode: (fs.statSync(path.join(fixtureRoot, bundle.manifest_path)).mode & 0o777).toString(8),
    ledgerPointerMatches: JSON.stringify(ledger.source_refs.current_change_evidence_bundle) === JSON.stringify(bundle),
    collisionCode, originalSurvivesCollision: sha(fs.readFileSync(path.join(fixtureRoot, bundle.path))) === bundle.sha256,
    sectionReceipts,
    limitations: ['Local consumer execution, not model consumption.',
      'Existing dirty source was scanned as evidence, not approved, transplanted or executed.',
      'Scanner errors and truncated reference scans remain unresolved; this change does not alter review authority.',
      'No provider, DB, bot, PM2, notification or broker operation.'],
  };
  receipt.handoffMatches = receipt.artifactHashMatches && receipt.manifestHashMatches
    && receipt.ledgerPointerMatches && receipt.originalSurvivesCollision && collisionCode === 'EEXIST'
    && sectionReceipts.every(s => s.storedHashMatches && s.deliveredHashMatches && s.producerHashMatches);
  fs.writeFileSync(path.join(__dirname, 'handoff-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ handoffMatches: receipt.handoffMatches, sections: sectionReceipts.length,
    bytes: bundle.bytes, lines: bundle.lines, scanErrors: scan.errors.length,
    toolReads: sectionReceipts.reduce((n, s) => n + s.calls.length, 0), fixtureRoot,
    ledgerPointerMatches: receipt.ledgerPointerMatches, collisionCode }));
  if (!receipt.handoffMatches) process.exitCode = 1;
}
main().catch(error => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
